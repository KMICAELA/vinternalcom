import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFunds } from "@/hooks/usePortfolioData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { ArrowLeft, Save, FileText, Check, X, Pencil } from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "quarterly_report", label: "Quarterly Report" },
  { value: "pcap", label: "PCAP Statement" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "capital_call_notice", label: "Capital Call Notice" },
];

const REPORT_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "xlsx", label: "Excel" },
  { value: "email_body", label: "Email Body" },
];

const FIELD_KEYS = [
  { key: "nav", label: "NAV", defaultVariations: "Net Asset Value, Partner's Equity, Ending Capital Balance" },
  { key: "total_contributions", label: "Total Contributions", defaultVariations: "Capital Contributions, Total Called, Paid-in Capital" },
  { key: "total_distributions", label: "Total Distributions", defaultVariations: "Distributions, Capital Returned" },
  { key: "total_fund_nav", label: "Total Fund NAV", defaultVariations: "Total Net Assets, Fund NAV, Total Partners' Capital" },
  { key: "moic", label: "MOIC / TVPI", defaultVariations: "MOIC, Multiple, Multiple of Invested Capital, TVPI" },
  { key: "irr", label: "IRR", defaultVariations: "Net IRR, IRR, Internal Rate of Return" },
  { key: "underlying_portfolio", label: "Underlying Portfolio", defaultVariations: "Schedule of Investments, Portfolio Companies" },
];

interface FieldMapping {
  location: string;
  label_variations: string[];
  value_type?: string;
  notes?: string;
  table_structure?: string;
}

export default function FundTemplatesPage() {
  const qc = useQueryClient();
  const { data: funds = [] } = useFunds();
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ["fund-extraction-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fund_extraction_templates")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedFund = funds.find((f: any) => f.id === selectedFundId);
  const fundTemplate = templates.find((t: any) => t.fund_id === selectedFundId && t.document_type === "quarterly_report");

  if (selectedFundId && selectedFund) {
    return (
      <TemplateEditor
        fund={selectedFund}
        template={fundTemplate}
        onBack={() => setSelectedFundId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["fund-extraction-templates"] });
        }}
      />
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fund Extraction Templates</h1>
        <p className="text-sm text-muted-foreground">Per-fund AI extraction mappings for quarterly report processing</p>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-center">Template Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map((fund: any) => {
              const hasTemplate = templates.some((t: any) => t.fund_id === fund.id);
              const template = templates.find((t: any) => t.fund_id === fund.id);
              return (
                <TableRow key={fund.id} className="text-sm cursor-pointer hover:bg-muted/30" onClick={() => setSelectedFundId(fund.id)}>
                  <TableCell className="font-medium">{fund.fund_name}</TableCell>
                  <TableCell>
                    {fund.currency !== "USD" ? (
                      <Badge variant="outline" className="text-[10px]">{fund.currency}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">USD</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fund.strategy || "—"}</TableCell>
                  <TableCell className="text-center">
                    {hasTemplate ? (
                      <Badge className="bg-[hsl(var(--positive))]/20 text-[hsl(var(--positive))] border-0 text-[10px]">
                        <Check className="h-3 w-3 mr-1" /> Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <X className="h-3 w-3 mr-1" /> Not configured
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                      <Pencil className="h-3 w-3" /> {hasTemplate ? "Edit" : "Configure"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TemplateEditor({ fund, template, onBack, onSaved }: {
  fund: any;
  template: any;
  onBack: () => void;
  onSaved: () => void;
}) {
  const existingMappings = (template?.field_mappings as Record<string, FieldMapping>) || {};
  
  const [documentType, setDocumentType] = useState(template?.document_type || "quarterly_report");
  const [reportFormat, setReportFormat] = useState(template?.report_format || "pdf");
  const [extractionNotes, setExtractionNotes] = useState(template?.extraction_notes || "");
  const [saving, setSaving] = useState(false);

  const [fields, setFields] = useState<Record<string, { location: string; variations: string; notes: string }>>(() => {
    const init: Record<string, { location: string; variations: string; notes: string }> = {};
    for (const f of FIELD_KEYS) {
      const existing = existingMappings[f.key];
      init[f.key] = {
        location: existing?.location || "",
        variations: existing?.label_variations?.join(", ") || f.defaultVariations,
        notes: existing?.notes || existing?.table_structure || "",
      };
    }
    return init;
  });

  const updateField = (key: string, prop: string, value: string) => {
    setFields(prev => ({ ...prev, [key]: { ...prev[key], [prop]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fieldMappings: Record<string, any> = {};
      for (const f of FIELD_KEYS) {
        const vals = fields[f.key];
        if (!vals.location && !vals.variations) continue;
        fieldMappings[f.key] = {
          location: vals.location,
          label_variations: vals.variations.split(",").map(s => s.trim()).filter(Boolean),
          value_type: f.key === "moic" ? "multiple" : f.key === "irr" ? "percentage" : f.key === "underlying_portfolio" ? "table" : "currency",
          ...(vals.notes ? (f.key === "underlying_portfolio" ? { table_structure: vals.notes } : { notes: vals.notes }) : {}),
        };
      }

      const payload = {
        fund_id: fund.id,
        document_type: documentType,
        report_format: reportFormat,
        field_mappings: fieldMappings,
        extraction_notes: extractionNotes || null,
        is_active: true,
        template_version: (template?.template_version || 0) + 1,
      };

      if (template?.id) {
        const { error } = await supabase
          .from("fund_extraction_templates")
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("fund_extraction_templates")
          .insert(payload as any);
        if (error) throw error;
      }

      toast.success("Template saved");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{fund.fund_name}</h1>
          <p className="text-sm text-muted-foreground">
            Extraction template
            {fund.currency !== "USD" && <Badge variant="outline" className="ml-2 text-[10px]">{fund.currency}</Badge>}
          </p>
        </div>
      </div>

      {/* Document Settings */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-4">
        <h2 className="text-sm font-medium">Document Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Document Type</label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Report Format</label>
            <Select value={reportFormat} onValueChange={setReportFormat}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_FORMATS.map(rf => <SelectItem key={rf.value} value={rf.value}>{rf.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Field Mappings */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Field Mappings</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Tell the AI where to find each data point in this fund's reports</p>
        </div>

        <Accordion type="multiple" defaultValue={FIELD_KEYS.map(f => f.key)} className="px-5 pb-4">
          {FIELD_KEYS.map(f => (
            <AccordionItem key={f.key} value={f.key} className="border-b border-border/50 last:border-0">
              <AccordionTrigger className="py-3 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  {f.label}
                  {fields[f.key]?.location && (
                    <Badge variant="outline" className="text-[9px] text-[hsl(var(--positive))]">mapped</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                    Location in Document
                  </label>
                  <Input
                    placeholder="e.g. Page 3, Partner's Capital Account table, row 'Ending Balance'"
                    className="h-8 text-xs"
                    value={fields[f.key]?.location || ""}
                    onChange={e => updateField(f.key, "location", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                    Label Variations (comma-separated)
                  </label>
                  <Input
                    placeholder="e.g. Net Asset Value, Partner's Equity"
                    className="h-8 text-xs"
                    value={fields[f.key]?.variations || ""}
                    onChange={e => updateField(f.key, "variations", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                    {f.key === "underlying_portfolio" ? "Table Structure" : "Notes / Quirks"}
                  </label>
                  <Input
                    placeholder={f.key === "underlying_portfolio" ? "e.g. Company Name | Cost | FMV | % of Fund | Status" : "Any special handling notes..."}
                    className="h-8 text-xs"
                    value={fields[f.key]?.notes || ""}
                    onChange={e => updateField(f.key, "notes", e.target.value)}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Special Handling */}
      <div className="border border-border rounded-lg p-5 bg-card space-y-3">
        <h2 className="text-sm font-medium">Special Handling Notes</h2>
        <p className="text-[10px] text-muted-foreground">
          Fund-specific quirks, e.g. "Reports in EUR — see FX conversion", "Legal expenses included in contributions"
        </p>
        <Textarea
          placeholder="Enter any fund-specific extraction notes..."
          className="min-h-[80px] text-xs"
          value={extractionNotes}
          onChange={e => setExtractionNotes(e.target.value)}
        />
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}
