import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useQuarterContext } from "@/contexts/QuarterContext";
import { useFunds, useUnderlyingPortfolio } from "@/hooks/usePortfolioData";
import { Plus, Link as LinkIcon, X, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────

const UPDATE_TYPES = [
  { value: "Fund Update", color: "border-l-amber-500" },
  { value: "New Investment", color: "border-l-emerald-500" },
  { value: "Write-off", color: "border-l-red-500" },
  { value: "Portfolio News", color: "border-l-blue-500" },
  { value: "Other", color: "border-l-muted-foreground" },
] as const;

function getTypeColor(type: string) {
  return UPDATE_TYPES.find(t => t.value === type)?.color ?? "border-l-muted-foreground";
}

function getTypeDotColor(type: string) {
  const map: Record<string, string> = {
    "Fund Update": "bg-amber-500",
    "New Investment": "bg-emerald-500",
    "Write-off": "bg-red-500",
    "Portfolio News": "bg-blue-500",
    "Other": "bg-muted-foreground",
  };
  return map[type] ?? "bg-muted-foreground";
}

// ─── Hooks ────────────────────────────────────────────────────────────

function useHighlightEntries(quarterDate: string | null) {
  return useQuery({
    queryKey: ["highlight-entries", quarterDate],
    queryFn: async () => {
      if (!quarterDate) return [];
      const { data, error } = await supabase
        .from("highlight_entries")
        .select("*")
        .eq("quarter_date", quarterDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!quarterDate,
  });
}

function useAddEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: { quarter_date: string; entity_name: string; update_type: string; body: string; url?: string }) => {
      const { error } = await supabase.from("highlight_entries").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlight-entries"] }),
  });
}

function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("highlight_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlight-entries"] }),
  });
}

// ─── Add Form ─────────────────────────────────────────────────────────

function AddEntryForm({ quarterDate, entityOptions, onClose }: {
  quarterDate: string;
  entityOptions: string[];
  onClose: () => void;
}) {
  const [entityName, setEntityName] = useState("");
  const [updateType, setUpdateType] = useState("Fund Update");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const addEntry = useAddEntry();

  const handleSubmit = () => {
    if (!entityName.trim() || !body.trim()) {
      toast.error("Please fill in the entity name and update text.");
      return;
    }
    addEntry.mutate(
      { quarter_date: quarterDate, entity_name: entityName.trim(), update_type: updateType, body: body.trim(), url: url.trim() || undefined },
      { onSuccess: () => { toast.success("Entry added"); onClose(); } }
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">New Update</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Entity */}
        <div>
          <label className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1 block">Fund / Company</label>
          <input
            list="entity-options"
            value={entityName}
            onChange={e => setEntityName(e.target.value)}
            placeholder="Select or type…"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <datalist id="entity-options">
            {entityOptions.map(name => <option key={name} value={name} />)}
          </datalist>
        </div>

        {/* Type */}
        <div>
          <label className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1 block">Type</label>
          <select
            value={updateType}
            onChange={e => setUpdateType(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {UPDATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
        </div>
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write the update…"
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />

      {/* URL */}
      {showUrl ? (
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button onClick={() => setShowUrl(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LinkIcon className="h-3 w-3" /> Attach link
        </button>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={addEntry.isPending} className="text-xs">
          {addEntry.isPending ? "Saving…" : "Add Entry"}
        </Button>
      </div>
    </div>
  );
}

// ─── Feed Entry ───────────────────────────────────────────────────────

function FeedEntry({ entry, onDelete }: { entry: any; onDelete: (id: string) => void }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card pl-0 overflow-hidden group")}>
      <div className={cn("flex border-l-[3px]", getTypeColor(entry.update_type))}>
        <div className="flex-1 p-4 space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{entry.entity_name}</span>
              <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", getTypeDotColor(entry.update_type))} />
                {entry.update_type}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground font-mono">
                {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <button
                onClick={() => onDelete(entry.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{entry.body}</p>

          {/* URL */}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {(() => { try { return new URL(entry.url).hostname; } catch { return "Link"; } })()}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function HighlightsPage() {
  const { selectedQuarter } = useQuarterContext();
  const { data: entries = [], isLoading } = useHighlightEntries(selectedQuarter.date);
  const { data: funds = [] } = useFunds();
  const { data: holdings = [] } = useUnderlyingPortfolio(selectedQuarter.date);
  const [showForm, setShowForm] = useState(false);
  const deleteEntry = useDeleteEntry();

  const entityOptions = useMemo(() => {
    const names = new Set<string>();
    funds.forEach(f => names.add(f.fund_name));
    holdings.forEach((h: any) => names.add(h.company_name));
    return Array.from(names).sort();
  }, [funds, holdings]);

  const handleDelete = (id: string) => {
    deleteEntry.mutate(id, { onSuccess: () => toast.success("Entry deleted") });
  };

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{selectedQuarter.quarter} Highlights</h1>
          <p className="text-xs text-muted-foreground">Quarterly portfolio digest</p>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Update
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <AddEntryForm
          quarterDate={selectedQuarter.date}
          entityOptions={entityOptions}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Feed */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm text-muted-foreground">No updates yet for {selectedQuarter.quarter}.</p>
          <p className="text-xs text-muted-foreground/60">Click "+ Add Update" to start building the quarterly digest.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <FeedEntry key={entry.id} entry={entry} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
