import { useEffect, useMemo, useState } from "react";
import { Sparkles, Save, Trash2, Plus, Check, FileEdit, Loader2, Share2, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedQuarter } from "@/contexts/QuarterContext";

type Highlight = {
  id: string;
  quarter_id: string;
  category: string;
  body_md: string;
  position: number;
  draft: boolean;
  last_edited_at: string;
};

const HighlightsPage = () => {
  const { selected } = useSelectedQuarter();
  const [items, setItems] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { category: string; body_md: string }>>({});
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [creatingShare, setCreatingShare] = useState(false);

  const createShareLink = async () => {
    if (!selected) return;
    setCreatingShare(true);
    try {
      // Generate a URL-safe token
      const tokenBytes = new Uint8Array(24);
      crypto.getRandomValues(tokenBytes);
      const token = btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const { error } = await supabase.from("quarter_share_tokens").insert({
        quarter_id: selected.id,
        token,
      });
      if (error) throw error;

      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Share link created and copied");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create share link");
    } finally {
      setCreatingShare(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Copied to clipboard");
  };

  const load = async () => {
    if (!selected) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("highlights")
      .select("*")
      .eq("quarter_id", selected.id)
      .order("position", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Highlight[]);
    setDrafts({});
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const generate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      // If existing items, wipe them first so we start clean
      if (items.length > 0) {
        const { error: delErr } = await supabase
          .from("highlights")
          .delete()
          .eq("quarter_id", selected.id);
        if (delErr) throw delErr;
      }
      const { data, error } = await supabase.functions.invoke("generate-highlights", {
        body: { quarter_id: selected.id },
      });
      if (error) throw error;
      const sections = (data?.sections ?? []) as { category: string; body_md: string; position: number }[];
      if (!sections.length) {
        toast.error("AI returned no sections");
        return;
      }
      const rows = sections.map((s) => ({
        quarter_id: selected.id,
        category: s.category,
        body_md: s.body_md,
        position: s.position,
        draft: true,
      }));
      const { error: insErr } = await supabase.from("highlights").insert(rows);
      if (insErr) throw insErr;
      toast.success(`Generated ${rows.length} sections`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
      setConfirmRegen(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<{ category: string; body_md: string }>) => {
    const orig = items.find((x) => x.id === id);
    if (!orig) return;
    setDrafts((d) => ({
      ...d,
      [id]: {
        category: patch.category ?? d[id]?.category ?? orig.category,
        body_md: patch.body_md ?? d[id]?.body_md ?? orig.body_md,
      },
    }));
  };

  const save = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    const { error } = await supabase
      .from("highlights")
      .update({
        category: draft.category,
        body_md: draft.body_md,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    await load();
  };

  const toggleFinal = async (h: Highlight) => {
    const { error } = await supabase
      .from("highlights")
      .update({ draft: !h.draft, last_edited_at: new Date().toISOString() })
      .eq("id", h.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(h.draft ? "Marked final" : "Marked draft");
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("highlights").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  };

  const addBlank = async () => {
    if (!selected) return;
    const nextPos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { error } = await supabase.from("highlights").insert({
      quarter_id: selected.id,
      category: "New Section",
      body_md: "- ",
      position: nextPos,
      draft: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  };

  const counts = useMemo(() => {
    const total = items.length;
    const finalCount = items.filter((i) => !i.draft).length;
    return { total, final: finalCount, draft: total - finalCount };
  }, [items]);

  if (!selected) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <p className="text-sm text-muted-foreground">No quarter selected.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Highlights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated quarterly digest for <span className="text-foreground">{selected.label}</span> — editable per section, comparing vs the prior quarter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <div className="text-xs text-muted-foreground mr-2">
              {counts.final}/{counts.total} final
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={createShareLink}
            disabled={creatingShare || counts.final === 0}
            title={counts.final === 0 ? "Mark at least one section as Final to share" : "Create a public share link"}
          >
            {creatingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={addBlank}>
            <Plus className="h-4 w-4" />
            Add Section
          </Button>
          <Button
            size="sm"
            onClick={() => (items.length > 0 ? setConfirmRegen(true) : generate())}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {items.length > 0 ? "Regenerate" : "Generate with AI"}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-12 bg-card border-border">
          <div className="flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-12 bg-card border-border">
          <div className="flex flex-col items-center text-center space-y-3">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No highlights yet</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Generate an AI digest comparing {selected.label} to the prior quarter, or add sections manually.
              </p>
            </div>
            <Button onClick={generate} disabled={generating} size="sm">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate with AI
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((h) => {
            const draft = drafts[h.id];
            const dirty = Boolean(draft);
            return (
              <Card key={h.id} className="p-4 bg-card border-border">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <Input
                      value={draft?.category ?? h.category}
                      onChange={(e) => updateDraft(h.id, { category: e.target.value })}
                      className="text-base font-semibold border-0 bg-transparent px-0 h-auto focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={h.draft ? "secondary" : "default"} className="text-[10px]">
                      {h.draft ? "Draft" : "Final"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFinal(h)}
                      title={h.draft ? "Mark final" : "Move to draft"}
                    >
                      {h.draft ? <Check className="h-4 w-4" /> : <FileEdit className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(h.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={draft?.body_md ?? h.body_md}
                  onChange={(e) => updateDraft(h.id, { body_md: e.target.value })}
                  rows={Math.max(4, (draft?.body_md ?? h.body_md).split("\n").length + 1)}
                  className="font-mono text-sm bg-background"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">
                    Last edited {new Date(h.last_edited_at).toLocaleString()}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => save(h.id)}
                    disabled={!dirty || savingId === h.id}
                  >
                    {savingId === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate all sections?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the existing {items.length} sections for {selected.label} and replace them with a fresh AI-generated digest. Final sections will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={generate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HighlightsPage;
