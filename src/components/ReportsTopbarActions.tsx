// PendingDraftsBadge — shows count of pending_review drafts in the top bar
// and a popover listing them. Clicking one opens AddReportWizard at the review step.

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Inbox, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AddReportWizard from "@/components/AddReportWizard";

type Draft = {
  id: string;
  source_type: string | null;
  fund_id: string | null;
  quarter_id: string | null;
  updated_at: string;
  fund_name?: string | null;
  quarter_label?: string | null;
};

export default function ReportsTopbarActions() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("extraction_drafts")
      .select("id, source_type, fund_id, quarter_id, updated_at, funds:fund_id(name, short_name), quarters:quarter_id(label)")
      .eq("status", "pending_review")
      .order("updated_at", { ascending: false })
      .limit(20);
    setDrafts(
      (data ?? []).map((d: any) => ({
        id: d.id,
        source_type: d.source_type,
        fund_id: d.fund_id,
        quarter_id: d.quarter_id,
        updated_at: d.updated_at,
        fund_name: d.funds?.short_name ?? d.funds?.name ?? null,
        quarter_label: d.quarters?.label ?? null,
      })),
    );
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("extraction_drafts_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "extraction_drafts" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const openWizardNew = () => {
    setResumeId(null);
    setWizardOpen(true);
    setOpen(false);
  };
  const openWizardResume = (id: string) => {
    setResumeId(id);
    setWizardOpen(true);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-2 relative">
            <Inbox className="h-4 w-4" />
            <span className="hidden md:inline text-xs">Reports</span>
            {drafts.length > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">{drafts.length}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">Reports</div>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openWizardNew}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {drafts.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No pending drafts</div>
            ) : (
              drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openWizardResume(d.id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-accent border-b border-border last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{d.fund_name ?? "Unknown fund"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{d.quarter_label ?? "—"}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                    {d.source_type ?? "report"} · {new Date(d.updated_at).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AddReportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        resumeDraftId={resumeId}
        onConfirmed={refresh}
      />
    </>
  );
}
