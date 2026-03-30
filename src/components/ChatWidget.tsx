import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, X, Send, Bot, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { useFunds, useDirectInvestments, useActiveQuarter, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { getQuarterData } from "@/data/quarterRegistry";
import { useConsolidatedMetrics } from "@/hooks/useConsolidatedMetrics";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { computeFundMetrics, formatCurrency, formatMultiple, formatPercent, formatIrr } from "@/lib/calcEngine";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio-chat`;

const STARTER_QUESTIONS = [
  "Which fund has the best TVPI?",
  "What does Chaos Industries do?",
  "Show me all write-offs",
  "Which companies are in both Tamarack and Cantos?",
];

async function streamChat({
  messages,
  portfolioContext,
  onDelta,
  onDone,
  onError,
}: {
  messages: Message[];
  portfolioContext: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, portfolioContext }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.error || "Something went wrong");
    return;
  }

  if (!resp.body) {
    onError("No response stream");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") {
        onDone();
        return;
      }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  onDone();
}

const ChatWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Portfolio data for dynamic context
  const activeQuarter = useActiveQuarter();
  const { data: funds = [] } = useFunds();
  const { data: directs = [] } = useDirectInvestments();
  const { data: holdings = [] } = useUnderlyingPortfolio(activeQuarter.date);
  const cm = useConsolidatedMetrics();

  const { data: allCashflows = [] } = useQuery({
    queryKey: ["all-fund-cashflows"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fund_cashflows").select("*").order("cashflow_date");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: fundQuarterlyReports = [] } = useQuery({
    queryKey: ["fund-quarterly-reports", activeQuarter.date],
    queryFn: async () => {
      if (!activeQuarter.date) return [];
      const { data, error } = await supabase.from("fund_quarterly_reports").select("*").eq("quarter_date", activeQuarter.date);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeQuarter.date,
  });

  // Build dynamic system prompt
  const portfolioContext = useMemo(() => {
    const qData = getQuarterData(activeQuarter.quarter);
    const fundSummary = funds.map((f: any) => {
      // Use registry TVPIs when available (verified values), fall back to dynamic computation
      const registryTvpi = qData?.fundTVPIs?.[f.fund_name];
      const registryNav = qData?.fundNAVs?.[f.fund_name];
      
      let tvpiStr: string;
      let navStr: string = "—";
      
      if (registryTvpi !== undefined && registryTvpi !== null) {
        tvpiStr = formatMultiple(registryTvpi);
      } else if (registryTvpi === null) {
        tvpiStr = "N/A";
      } else {
        const cashflows = allCashflows.filter((c: any) => c.fund_id === f.id);
        const fqr = fundQuarterlyReports.find((r: any) => r.fund_id === f.id);
        const metrics = computeFundMetrics({
          twhCommitment: Number(f.commitment_amount),
          totalFundCommitment: 0, totalInvestmentCost: 0, totalPortfolioFmv: 0, fundNav: 0,
          capitalActivity: cashflows.map((c: any) => ({
            date: c.cashflow_date,
            type: c.cashflow_type || "Capital Call — Investment",
            amount: Number(c.capital_deployed || 0) + Number(c.distribution_received || 0),
          })),
          reportDate: activeQuarter.date,
          reportNav: Number(fqr?.reported_nav || 0),
          reportCalled: Number(fqr?.capital_called_to_date || 0),
          reportDist: Number(fqr?.distributions_to_date || 0),
          ownershipPct: Number(f.ownership_percentage || 0),
        });
        tvpiStr = formatMultiple(metrics.tvpi);
        navStr = formatCurrency(metrics.twhNav);
      }
      
      if (registryNav !== undefined) {
        navStr = formatCurrency(registryNav);
      }
      
      return `${f.fund_name}: TWH Commitment ${formatCurrency(f.commitment_amount)}, TWH NAV ${navStr}, TVPI ${tvpiStr}, Geography: ${f.geography || "—"}, Theme: ${f.theme || "—"}`;
    }).join("\n");

    const companySummary = holdings.slice(0, 80).map((h: any) => {
      const moic = h.twh_cost > 0 ? (h.twh_fmv / h.twh_cost).toFixed(2) : "N/A";
      return `${h.company_name}: Status ${h.type || "Active"}, TWH Cost ${formatCurrency(h.twh_cost)}, TWH FMV ${formatCurrency(h.twh_fmv)}, MOIC ${moic}x, Region ${h.region || "—"}, Sector ${h.sector || "—"}`;
    }).join("\n");

    const directsSummary = directs.map((d: any) =>
      `${d.company_name}: Cost ${formatCurrency(d.cost_basis)}, Round ${d.round || "—"}, Instrument ${d.instrument || "—"}`
    ).join("\n");

    return `You are a venture capital portfolio assistant for TWH Americas Fund I, LP.
You have complete knowledge of the fund's portfolio as of ${activeQuarter.quarter}.

FUND INVESTMENTS (${funds.length} funds):
${fundSummary}

UNDERLYING PORTFOLIO COMPANIES (${holdings.length} total):
${companySummary}

DIRECT INVESTMENTS (${directs.length}):
${directsSummary}

CONSOLIDATED METRICS:
Net TVPI: ${formatMultiple(cm.netTvpi)} | Net IRR: ${formatIrr(cm.netIrr)} | Gross TVPI: ${formatMultiple(cm.grossTvpi)} | Gross IRR: ${formatIrr(cm.grossIrr)}
Total Contributed: ${formatCurrency(cm.totalCapitalCalls)} | Total NAV: ${formatCurrency(cm.totalNav)} | Unrealized FMV: ${formatCurrency(cm.grossFmv)}

Answer questions about specific companies, funds, performance metrics, and portfolio composition.
Be concise and precise. Format numbers clearly. Use bullet points and numbered lists rather than markdown tables.
If asked to compare funds or rank companies, do so directly.`;
  }, [funds, directs, holdings, allCashflows, fundQuarterlyReports, cm, activeQuarter]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: newMessages,
        portfolioContext,
        onDelta: upsert,
        onDone: () => setLoading(false),
        onError: (msg) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ ${msg}` },
          ]);
          setLoading(false);
        },
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to connect to AI service." },
      ]);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[hsl(var(--gold))] text-[hsl(var(--background))] shadow-lg hover:bg-[hsl(var(--gold))]/90 flex items-center justify-center transition-transform hover:scale-105"
          aria-label="Open AI Agent"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-4rem)] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[hsl(var(--gold))]" />
              <span className="font-semibold text-sm text-foreground">
                Portfolio AI Agent
              </span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                  title="Clear conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-6 space-y-4">
                <Bot className="h-10 w-10 mx-auto text-[hsl(var(--gold))]/40" />
                <div>
                  <p className="font-medium text-foreground">Ask me about the portfolio</p>
                  <p className="text-xs mt-1">
                    Fund performance, holdings, metrics, company details…
                  </p>
                </div>
                <div className="space-y-2">
                  {STARTER_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border bg-accent/50 hover:bg-accent text-foreground/80 hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-[hsl(var(--gold))]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                    m.role === "user"
                      ? "bg-[hsl(var(--gold))] text-[hsl(var(--background))] whitespace-pre-wrap"
                      : "bg-muted text-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-1"
                  )}
                >
                  {m.role === "assistant" ? (
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-[hsl(var(--gold))]/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-[hsl(var(--gold))] animate-pulse" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-2 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the portfolio…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-20 py-2"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 h-8 w-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;
