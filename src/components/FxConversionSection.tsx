import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useFxRate, useUpsertFxRate } from "@/hooks/useFxRates";
import { ArrowRightLeft } from "lucide-react";

const FX_SOURCES = ["ECB", "fund_report", "manual", "bloomberg"];

interface FxConversionSectionProps {
  quarterDate: string;
  sourceCurrency: string;
  onConvertedValues: (vals: {
    sourceNav: number;
    sourceContributions: number;
    sourceDistributions: number;
    usdNav: number;
    usdContributions: number;
    usdDistributions: number;
    fxRate: number;
    fxRateSource: string;
    fxRateId: string | null;
  }) => void;
}

export default function FxConversionSection({ quarterDate, sourceCurrency, onConvertedValues }: FxConversionSectionProps) {
  const pair = `${sourceCurrency}/USD`;
  const { data: existingRate } = useFxRate(pair, quarterDate);
  const upsertRate = useUpsertFxRate();

  const [eurNav, setEurNav] = useState("");
  const [eurContributions, setEurContributions] = useState("");
  const [eurDistributions, setEurDistributions] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [rateSource, setRateSource] = useState("ECB");

  useEffect(() => {
    if (existingRate) {
      setFxRate(String(existingRate.rate));
      setRateSource(existingRate.source);
    }
  }, [existingRate]);

  const rate = Number(fxRate) || 0;
  const usdNav = Number(eurNav) * rate;
  const usdContributions = Number(eurContributions) * rate;
  const usdDistributions = Number(eurDistributions) * rate;

  useEffect(() => {
    if (rate > 0 && (Number(eurNav) > 0 || Number(eurContributions) > 0 || Number(eurDistributions) > 0)) {
      onConvertedValues({
        sourceNav: Number(eurNav) || 0,
        sourceContributions: Number(eurContributions) || 0,
        sourceDistributions: Number(eurDistributions) || 0,
        usdNav: Math.round(usdNav * 100) / 100,
        usdContributions: Math.round(usdContributions * 100) / 100,
        usdDistributions: Math.round(usdDistributions * 100) / 100,
        fxRate: rate,
        fxRateSource: rateSource,
        fxRateId: existingRate?.id || null,
      });
    }
  }, [eurNav, eurContributions, eurDistributions, rate, rateSource]);

  const handleSaveRate = async () => {
    if (!rate) return;
    await upsertRate.mutateAsync({
      currency_pair: pair,
      rate,
      rate_date: quarterDate,
      source: rateSource,
    });
  };

  const fmtEur = (n: number) => n > 0 ? `€${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
  const fmtUsd = (n: number) => n > 0 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  return (
    <div className="border border-[hsl(var(--gold))]/20 rounded-lg p-4 bg-[hsl(var(--gold))]/[0.02] space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-[hsl(var(--gold))]" />
        <h3 className="text-sm font-medium text-foreground">FX Conversion — {sourceCurrency}/USD</h3>
        <Badge variant="outline" className="text-[10px] border-[hsl(var(--gold))]/30 text-[hsl(var(--gold))]">{sourceCurrency}</Badge>
      </div>

      {/* Rate input */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">{sourceCurrency}/USD Rate</label>
          <Input
            type="number"
            step="0.0001"
            className="h-8 text-xs font-mono"
            placeholder="e.g. 1.0575"
            value={fxRate}
            onChange={e => setFxRate(e.target.value)}
            onBlur={handleSaveRate}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Rate Source</label>
          <Select value={rateSource} onValueChange={setRateSource}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FX_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Rate Date</label>
          <div className="h-8 flex items-center text-xs font-mono text-muted-foreground px-3 border border-border rounded-md bg-muted/20">{quarterDate}</div>
        </div>
      </div>

      {/* EUR values */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">{sourceCurrency} NAV</label>
          <Input type="number" className="h-8 text-xs font-mono" placeholder="EUR amount" value={eurNav} onChange={e => setEurNav(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">{sourceCurrency} Contributions</label>
          <Input type="number" className="h-8 text-xs font-mono" placeholder="EUR amount" value={eurContributions} onChange={e => setEurContributions(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">{sourceCurrency} Distributions</label>
          <Input type="number" className="h-8 text-xs font-mono" placeholder="EUR amount" value={eurDistributions} onChange={e => setEurDistributions(e.target.value)} />
        </div>
      </div>

      {/* Converted USD values */}
      {rate > 0 && (Number(eurNav) > 0 || Number(eurContributions) > 0) && (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">USD NAV</span>
            <span className="text-sm font-mono font-medium text-foreground">{fmtUsd(usdNav)}</span>
            <span className="text-[10px] text-muted-foreground">{fmtEur(Number(eurNav))} × {fxRate}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">USD Contributions</span>
            <span className="text-sm font-mono font-medium text-foreground">{fmtUsd(usdContributions)}</span>
            <span className="text-[10px] text-muted-foreground">{fmtEur(Number(eurContributions))} × {fxRate}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">USD Distributions</span>
            <span className="text-sm font-mono font-medium text-foreground">{fmtUsd(usdDistributions)}</span>
            <span className="text-[10px] text-muted-foreground">{fmtEur(Number(eurDistributions))} × {fxRate}</span>
          </div>
        </div>
      )}
    </div>
  );
}
