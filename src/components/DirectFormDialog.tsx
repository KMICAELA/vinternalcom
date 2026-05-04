import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRound } from "@/lib/extraction/normalizeRound";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const INSTRUMENTS = ["SAFE", "Convertible Note", "Pref. Equity", "Common Stock", "SPV", "Partnership Interest", "Other"];
const ROUNDS = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Other"];

export type DirectEditRow = {
  id: string;
  company_id: string;
  company_name: string;
  investment_date: string | null;
  instrument: string | null;
  round: string | null;
  cost: number;
  fmv: number;
  proceeds: number;
  co_investors?: string[] | null;
  note?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quarterId: string;
  initial?: DirectEditRow | null;
  onSaved: () => void;
};

type Company = { id: string; name: string };

export default function DirectFormDialog({ open, onOpenChange, quarterId, initial, onSaved }: Props) {
  const editing = !!initial;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [instrument, setInstrument] = useState<string>("");
  const [round, setRound] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [fmv, setFmv] = useState<string>("");
  const [proceeds, setProceeds] = useState<string>("0");
  const [coInvestors, setCoInvestors] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("companies")
      .select("id, legal_name, commercial_name")
      .order("commercial_name", { ascending: true })
      .then(({ data }) => {
        setCompanies(
          (data ?? []).map((c: any) => ({ id: c.id, name: c.commercial_name ?? c.legal_name }))
        );
      });
    if (initial) {
      setCompanyId(initial.company_id);
      setCompanyName(initial.company_name);
      setDate(initial.investment_date ? new Date(initial.investment_date) : undefined);
      setInstrument(initial.instrument ?? "");
      setRound(initial.round ?? "");
      setCost(String(initial.cost ?? ""));
      setFmv(String(initial.fmv ?? ""));
      setProceeds(String(initial.proceeds ?? 0));
      setCoInvestors((initial.co_investors ?? []).join(", "));
      setNotes(initial.note ?? "");
    } else {
      setCompanyId(null); setCompanyName(""); setDate(undefined);
      setInstrument(""); setRound("");
      setCost(""); setFmv(""); setProceeds("0");
      setCoInvestors(""); setNotes("");
    }
  }, [open, initial]);

  // Auto-default FMV to Cost on add
  useEffect(() => {
    if (!editing && cost && !fmv) setFmv(cost);
  }, [cost, editing, fmv]);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies.slice(0, 50);
    return companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [companies, companyQuery]);

  const exactMatch = useMemo(
    () => companies.some((c) => c.name.toLowerCase() === companyQuery.trim().toLowerCase()),
    [companies, companyQuery]
  );

  async function createCompany(name: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("companies")
      .insert({ legal_name: name, commercial_name: name })
      .select("id, commercial_name, legal_name")
      .single();
    if (error || !data) {
      toast.error("Failed to create company");
      return null;
    }
    setCompanies((prev) => [...prev, { id: data.id, name: data.commercial_name ?? data.legal_name }]);
    return data.id;
  }

  async function handleSave() {
    if (!companyId || !companyName) return toast.error("Company is required");
    if (!date) return toast.error("Investment date is required");
    const costNum = Number(cost);
    if (!Number.isFinite(costNum) || costNum < 0) return toast.error("Valid TWH Cost is required");
    const fmvNum = Number(fmv || 0);
    const procNum = Number(proceeds || 0);

    setSaving(true);
    try {
      const norm = round ? normalizeRound(round) : { round: null, round_detail: null, instrument_extracted: null };
      const dateStr = format(date, "yyyy-MM-dd");
      const coArr = coInvestors.split(",").map((s) => s.trim()).filter(Boolean);

      let directId = initial?.id ?? null;

      if (editing && directId) {
        const { error } = await supabase.from("directs").update({
          company_id: companyId,
          investment_date: dateStr,
          instrument: instrument || null,
          round: norm.round ?? round ?? null,
          round_detail: norm.round_detail,
          twh_cost_usd: costNum,
          co_investors: coArr,
          note: notes || null,
        }).eq("id", directId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("directs").insert({
          company_id: companyId,
          investment_date: dateStr,
          instrument: instrument || null,
          round: norm.round ?? round ?? null,
          round_detail: norm.round_detail,
          twh_cost_usd: costNum,
          co_investors: coArr,
          note: notes || null,
        }).select("id").single();
        if (error || !data) throw error ?? new Error("Insert failed");
        directId = data.id;
      }

      // Upsert snapshot for current quarter
      const { data: existing } = await supabase
        .from("direct_quarter_snapshots")
        .select("id")
        .eq("direct_id", directId!)
        .eq("quarter_id", quarterId)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("direct_quarter_snapshots")
          .update({ twh_fmv_usd: fmvNum, twh_proceeds_usd: procNum })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("direct_quarter_snapshots")
          .insert({
            direct_id: directId!,
            quarter_id: quarterId,
            twh_fmv_usd: fmvNum,
            twh_proceeds_usd: procNum,
          });
        if (error) throw error;
      }

      toast.success(editing ? "Direct updated" : "Direct added");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit direct investment" : "Add direct investment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Company *</Label>
            <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {companyName || "Select company..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search companies..." value={companyQuery} onValueChange={setCompanyQuery} />
                  <CommandList>
                    <CommandEmpty>No company found</CommandEmpty>
                    <CommandGroup>
                      {filteredCompanies.map((c) => (
                        <CommandItem key={c.id} value={c.id} onSelect={() => {
                          setCompanyId(c.id); setCompanyName(c.name); setCompanyOpen(false);
                        }}>
                          <Check className={cn("mr-2 h-4 w-4", companyId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                      {companyQuery.trim() && !exactMatch && (
                        <CommandItem
                          value={`__create_${companyQuery}`}
                          onSelect={async () => {
                            const name = companyQuery.trim();
                            const id = await createCompany(name);
                            if (id) { setCompanyId(id); setCompanyName(name); setCompanyOpen(false); }
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create "{companyQuery.trim()}"
                        </CommandItem>
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Investment Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Instrument</Label>
              <Select value={instrument} onValueChange={setInstrument}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {INSTRUMENTS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Round</Label>
              <Select value={round} onValueChange={setRound}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {ROUNDS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>TWH Cost (USD) *</Label>
              <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>TWH FMV (USD)</Label>
              <Input type="number" inputMode="decimal" value={fmv} onChange={(e) => setFmv(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>TWH Proceeds (USD)</Label>
              <Input type="number" inputMode="decimal" value={proceeds} onChange={(e) => setProceeds(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Co-Investors (comma-separated)</Label>
            <Input value={coInvestors} onChange={(e) => setCoInvestors(e.target.value)} placeholder="Sequoia, a16z, ..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Add direct"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
