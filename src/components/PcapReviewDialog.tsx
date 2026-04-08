import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle, Loader2, Save } from "lucide-react";

interface PcapReviewDialogProps {
  pcap: any;
  fundName: string;
  onClose: () => void;
}

const formatCurrency = (v: number | null) =>
  v != null ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";

const confidenceColor = (score: number | null) => {
  if (score == null) return "text-muted-foreground";
  if (score >= 0.9) return "text-[hsl(var(--positive))]";
  if (score >= 0.7) return "text-[hsl(var(--warning))]";
  return "text-destructive";
};

const confidenceBg = (score: number | null) => {
  if (score == null) return "bg-muted/30";
  if (score >= 0.9) return "bg-[hsl(var(--positive))]/5 border-[hsl(var(--positive))]/20";
  if (score >= 0.7) return "bg-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/20";
  return "bg-destructive/5 border-destructive/20";
};

function FieldRow({ label, value, confidence, onChange, type = "number" }: {
  label: string;
  value: any;
  confidence: number | null;
  onChange: (v: any) => void;
  type?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 p-2.5 rounded-lg border", confidenceBg(confidence))}>
      <div className="w-48 shrink-0">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {confidence != null && (
          <span className={cn("text-[9px] ml-2 font-mono", confidenceColor(confidence))}>
            {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <Input
        className="h-7 text-xs font-mono flex-1"
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}
      />
    </div>
  );
}

export default function PcapReviewDialog({ pcap, fundName, onClose }: PcapReviewDialogProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const extracted = pcap.extracted_data || {};
  const scores = pcap.confidence_scores || {};

  const [pca, setPca] = useState(extracted.partner_capital_account || {});
  const [fundSummary, setFundSummary] = useState(extracted.fund_summary || {});
  const [ownershipPct, setOwnershipPct] = useState(extracted.twh_ownership_pct);
  const [perfMetrics, setPerfMetrics] = useState(extracted.performance_metrics || {});

  const getConf = (path: string) => scores[path] ?? null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedData = {
        partner_capital_account: pca,
        fund_summary: fundSummary,
        twh_ownership_pct: ownershipPct,
        underlying_portfolio: extracted.underlying_portfolio || [],
        performance_metrics: perfMetrics,
      };

      const { error } = await supabase
        .from("pcap_extractions")
        .update({
          extracted_data: updatedData as any,
          extraction_status: "reviewed",
          reviewed_by: localStorage.getItem("reviewer_name") || "analyst",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", pcap.id);
      if (error) throw error;

      toast.success("PCAP review saved");
      qc.invalidateQueries({ queryKey: ["pcap-extractions"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const updatedData = {
        partner_capital_account: pca,
        fund_summary: fundSummary,
        twh_ownership_pct: ownershipPct,
        underlying_portfolio: extracted.underlying_portfolio || [],
        performance_metrics: perfMetrics,
      };

      // 1. Update PCAP status
      const { error: pcapErr } = await supabase
        .from("pcap_extractions")
        .update({
          extracted_data: updatedData as any,
          extraction_status: "approved",
          reviewed_by: localStorage.getItem("reviewer_name") || "analyst",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", pcap.id);
      if (pcapErr) throw pcapErr;

      // 2. Push to fund_quarterly_reports
      const { error: fqrErr } = await supabase
        .from("fund_quarterly_reports")
        .upsert({
          fund_id: pcap.fund_id,
          quarter_date: pcap.quarter_date,
          reported_nav: pca.ending_balance || 0,
          capital_called_to_date: fundSummary.total_called || 0,
          distributions_to_date: fundSummary.total_distributed || 0,
          reported_gross_irr: perfMetrics.gross_irr || null,
          reported_gross_tvpi: perfMetrics.gross_moic || perfMetrics.tvpi || null,
        } as any, { onConflict: "fund_id,quarter_date" });
      if (fqrErr) throw fqrErr;

      // 3. Push underlying portfolio holdings
      const portfolio = updatedData.underlying_portfolio || [];
      if (portfolio.length > 0) {
        // Delete existing for this fund/quarter
        await supabase
          .from("underlying_portfolio_holdings")
          .delete()
          .eq("fund_id", pcap.fund_id)
          .eq("quarter_date", pcap.quarter_date);

        const holdings = portfolio.map((co: any) => ({
          fund_id: pcap.fund_id,
          quarter_date: pcap.quarter_date,
          company_name: co.company_name || "Unknown",
          investment_cost: co.cost || 0,
          fmv: co.fair_value || 0,
          twh_cost: (co.cost || 0) * (ownershipPct || 0) / 100,
          twh_fmv: (co.fair_value || 0) * (ownershipPct || 0) / 100,
          type: co.instrument || null,
        }));

        const { error: holdErr } = await supabase
          .from("underlying_portfolio_holdings")
          .insert(holdings as any);
        if (holdErr) throw holdErr;
      }

      // 4. Update extraction template with learned data
      try {
        await supabase
          .from("fund_extraction_templates")
          .update({
            sample_extraction: updatedData as any,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("fund_id", pcap.fund_id)
          .eq("document_type", "quarterly_report");
      } catch {
        // Non-critical
      }

      // 5. Audit log
      await supabase.from("audit_log").insert({
        action: "pcap_approved",
        target_table: "pcap_extractions",
        target_id: pcap.id,
        quarter_date: pcap.quarter_date,
        performed_by: localStorage.getItem("reviewer_name") || "analyst",
        details: { fund_id: pcap.fund_id, quarter: pcap.quarter } as any,
      });

      toast.success("PCAP approved and data pushed to live tables");
      qc.invalidateQueries({ queryKey: ["pcap-extractions"] });
      qc.invalidateQueries({ queryKey: ["fund-quarterly-reports"] });
      qc.invalidateQueries({ queryKey: ["underlying-portfolio"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setApproving(false);
    }
  };

  const hasNotes = !!pcap.extraction_notes;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-3">
            PCAP Review — {fundName}
            <Badge variant="outline" className="text-[10px]">{pcap.quarter}</Badge>
            <Badge
              className={cn("text-[10px] border-0", {
                "bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))]": pcap.extraction_status === "approved",
                "bg-amber-500/20 text-amber-400": pcap.extraction_status === "extracted" || pcap.extraction_status === "reviewed",
                "bg-destructive/20 text-destructive": pcap.extraction_status === "error",
              })}
            >
              {pcap.extraction_status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Warnings */}
          {hasNotes && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/20">
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
              <div className="text-xs text-[hsl(var(--warning))] space-y-1 whitespace-pre-line">
                {pcap.extraction_notes}
              </div>
            </div>
          )}

          <Accordion type="multiple" defaultValue={["pca", "fund_summary", "performance", "portfolio"]}>
            {/* Partner Capital Account */}
            <AccordionItem value="pca" className="border border-border rounded-lg mb-3 overflow-hidden">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                Partner Capital Account
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <FieldRow label="Beginning Balance" value={pca.beginning_balance} confidence={getConf("partner_capital_account.beginning_balance")} onChange={v => setPca((p: any) => ({ ...p, beginning_balance: v }))} />
                <FieldRow label="Contributions" value={pca.contributions} confidence={getConf("partner_capital_account.contributions")} onChange={v => setPca((p: any) => ({ ...p, contributions: v }))} />
                <FieldRow label="Distributions" value={pca.distributions} confidence={getConf("partner_capital_account.distributions")} onChange={v => setPca((p: any) => ({ ...p, distributions: v }))} />
                <FieldRow label="Net Income/Loss" value={pca.net_income_loss} confidence={getConf("partner_capital_account.net_income_loss")} onChange={v => setPca((p: any) => ({ ...p, net_income_loss: v }))} />
                <FieldRow label="Management Fees" value={pca.management_fees} confidence={getConf("partner_capital_account.management_fees")} onChange={v => setPca((p: any) => ({ ...p, management_fees: v }))} />
                <FieldRow label="Carried Interest" value={pca.carried_interest} confidence={getConf("partner_capital_account.carried_interest")} onChange={v => setPca((p: any) => ({ ...p, carried_interest: v }))} />
                <FieldRow label="Ending Balance (TWH NAV)" value={pca.ending_balance} confidence={getConf("partner_capital_account.ending_balance")} onChange={v => setPca((p: any) => ({ ...p, ending_balance: v }))} />
                <FieldRow label="TWH Entity Name" value={pca.twh_entity_name} confidence={getConf("partner_capital_account.twh_entity_name")} onChange={v => setPca((p: any) => ({ ...p, twh_entity_name: v }))} type="text" />
              </AccordionContent>
            </AccordionItem>

            {/* Fund Summary */}
            <AccordionItem value="fund_summary" className="border border-border rounded-lg mb-3 overflow-hidden">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                Fund Summary
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <FieldRow label="Total Fund NAV" value={fundSummary.total_fund_nav} confidence={getConf("fund_summary.total_fund_nav")} onChange={v => setFundSummary((p: any) => ({ ...p, total_fund_nav: v }))} />
                <FieldRow label="Total Commitments" value={fundSummary.total_commitments} confidence={getConf("fund_summary.total_commitments")} onChange={v => setFundSummary((p: any) => ({ ...p, total_commitments: v }))} />
                <FieldRow label="Total Called" value={fundSummary.total_called} confidence={getConf("fund_summary.total_called")} onChange={v => setFundSummary((p: any) => ({ ...p, total_called: v }))} />
                <FieldRow label="Total Distributed" value={fundSummary.total_distributed} confidence={getConf("fund_summary.total_distributed")} onChange={v => setFundSummary((p: any) => ({ ...p, total_distributed: v }))} />
                <FieldRow label="Remaining Commitment" value={fundSummary.remaining_commitment} confidence={getConf("fund_summary.remaining_commitment")} onChange={v => setFundSummary((p: any) => ({ ...p, remaining_commitment: v }))} />
                <FieldRow label="TWH Ownership %" value={ownershipPct} confidence={getConf("twh_ownership_pct")} onChange={v => setOwnershipPct(v)} />
              </AccordionContent>
            </AccordionItem>

            {/* Performance Metrics */}
            <AccordionItem value="performance" className="border border-border rounded-lg mb-3 overflow-hidden">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                Performance Metrics
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <FieldRow label="Gross MOIC" value={perfMetrics.gross_moic} confidence={getConf("performance_metrics.gross_moic")} onChange={v => setPerfMetrics((p: any) => ({ ...p, gross_moic: v }))} />
                <FieldRow label="Gross IRR" value={perfMetrics.gross_irr} confidence={getConf("performance_metrics.gross_irr")} onChange={v => setPerfMetrics((p: any) => ({ ...p, gross_irr: v }))} />
                <FieldRow label="Net MOIC" value={perfMetrics.net_moic} confidence={getConf("performance_metrics.net_moic")} onChange={v => setPerfMetrics((p: any) => ({ ...p, net_moic: v }))} />
                <FieldRow label="Net IRR" value={perfMetrics.net_irr} confidence={getConf("performance_metrics.net_irr")} onChange={v => setPerfMetrics((p: any) => ({ ...p, net_irr: v }))} />
                <FieldRow label="DPI" value={perfMetrics.dpi} confidence={getConf("performance_metrics.dpi")} onChange={v => setPerfMetrics((p: any) => ({ ...p, dpi: v }))} />
                <FieldRow label="RVPI" value={perfMetrics.rvpi} confidence={getConf("performance_metrics.rvpi")} onChange={v => setPerfMetrics((p: any) => ({ ...p, rvpi: v }))} />
                <FieldRow label="TVPI" value={perfMetrics.tvpi} confidence={getConf("performance_metrics.tvpi")} onChange={v => setPerfMetrics((p: any) => ({ ...p, tvpi: v }))} />
                <FieldRow label="PIC" value={perfMetrics.pic} confidence={getConf("performance_metrics.pic")} onChange={v => setPerfMetrics((p: any) => ({ ...p, pic: v }))} />
              </AccordionContent>
            </AccordionItem>

            {/* Underlying Portfolio */}
            <AccordionItem value="portfolio" className="border border-border rounded-lg mb-3 overflow-hidden">
              <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                Underlying Portfolio ({(extracted.underlying_portfolio || []).length} companies)
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {(extracted.underlying_portfolio || []).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left py-2 pr-3">Company</th>
                          <th className="text-left py-2 pr-3">Instrument</th>
                          <th className="text-right py-2 pr-3">Cost</th>
                          <th className="text-right py-2 pr-3">Fair Value</th>
                          <th className="text-center py-2 pr-3">Status</th>
                          <th className="text-right py-2">% of Fund</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(extracted.underlying_portfolio || []).map((co: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{co.company_name}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{co.instrument || "—"}</td>
                            <td className="py-2 pr-3 text-right font-mono">{formatCurrency(co.cost)}</td>
                            <td className="py-2 pr-3 text-right font-mono">{formatCurrency(co.fair_value)}</td>
                            <td className="py-2 pr-3 text-center">
                              <Badge variant="outline" className="text-[9px]">{co.status || "—"}</Badge>
                            </td>
                            <td className="py-2 text-right font-mono">{co.pct_of_fund != null ? `${co.pct_of_fund}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No portfolio companies extracted</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex items-center justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Review
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approving}
              className="gap-1.5 bg-[hsl(var(--positive))] text-[hsl(var(--positive-foreground))] hover:bg-[hsl(var(--positive))]/90"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve & Push to Live
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
