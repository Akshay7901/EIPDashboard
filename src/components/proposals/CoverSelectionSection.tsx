import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, ImageIcon, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  aiCoversApi,
  coverSelectionApi,
  type AiCover,
  type CoverSource,
  type MetadataResponse,
} from "@/lib/proposalsApi";
import { getDesignerApprovalStatus, getDesignerPreviewUrl } from "@/lib/coverUtils";

const AI_POLL_INTERVAL_MS = 5000;
const RANDOM_STYLE = "__random__";

const isUsable = (c: AiCover) => c.status === "completed" || c.status === "approved";

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

const errMsg = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-muted text-foreground border-border",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

interface CoverImageProps {
  url?: string | null;
  alt: string;
  placeholder: string;
  className?: string;
}

const CoverImage: React.FC<CoverImageProps> = ({ url, alt, placeholder, className }) => {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className={cn("w-full rounded bg-muted flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground", className)}>
        <ImageIcon className="h-5 w-5" />
        {placeholder}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img src={url} alt={alt} className={cn("w-full object-contain rounded bg-muted", className)} onError={() => setBroken(true)} />
    </a>
  );
};

interface CoverSelectionSectionProps {
  ticketNumber: string;
  /** Pre-fetched metadata; used for designer approval and cover URL if /cover-selection is unavailable. */
  metadata?: MetadataResponse | null;
  className?: string;
}

const CoverSelectionSection: React.FC<CoverSelectionSectionProps> = ({ ticketNumber, metadata, className }) => {
  const queryClient = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenStyle, setRegenStyle] = useState<string>(RANDOM_STYLE);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Remembers a selection saved this session in case GET /cover-selection isn't available
  const [localSelection, setLocalSelection] = useState<{ source: CoverSource; aiCoverId: number | null } | null>(null);

  const { data: selection, isLoading: selectionLoading } = useQuery({
    queryKey: ["cover-selection", ticketNumber],
    queryFn: () => coverSelectionApi.get(ticketNumber),
    enabled: !!ticketNumber,
    retry: false,
  });

  // Either source saying "approved" locks the cover; metadata updates first when the admin approves below
  const designerApproved = !!selection?.designer_approved || getDesignerApprovalStatus(metadata) === "completed";
  const designerUrl = selection?.designer_cover_url || getDesignerPreviewUrl(metadata);

  const {
    data: fetchedAiCovers,
    isLoading: aiLoading,
    isError: aiError,
  } = useQuery({
    queryKey: ["ai-covers", ticketNumber],
    queryFn: () => aiCoversApi.list(ticketNumber),
    enabled: !!ticketNumber && !selectionLoading,
    // Keep polling while the newest cover is still being generated
    refetchInterval: (query) => (query.state.data?.[0]?.status === "pending" ? AI_POLL_INTERVAL_MS : false),
  });

  const { data: styles = [], isLoading: stylesLoading } = useQuery({
    queryKey: ["ai-cover-styles"],
    queryFn: () => aiCoversApi.styles(),
    enabled: regenOpen,
    staleTime: Infinity,
  });

  const aiCovers: AiCover[] = fetchedAiCovers ?? selection?.ai_covers ?? [];
  const isGenerating = aiCovers[0]?.status === "pending";
  const latestUsable = aiCovers.find(isUsable) ?? null;

  const selectedSource: CoverSource | null = selection ? selection.selected_source : localSelection?.source ?? null;
  const selectedAiId: number | null = selection ? selection.selected_ai_cover_id : localSelection?.aiCoverId ?? null;
  const selectedAiCover = selectedSource === "ai" ? aiCovers.find((c) => c.id === selectedAiId) ?? null : null;

  const isDesignerSelected = selectedSource === "designer";
  const isLatestAiSelected = selectedSource === "ai" && !!latestUsable && (selectedAiId == null || selectedAiId === latestUsable.id);
  const busy = !!savingKey || triggering;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["cover-selection", ticketNumber] });
    queryClient.invalidateQueries({ queryKey: ["ai-covers", ticketNumber] });
  };

  const handleSelect = async (source: CoverSource, aiCover?: AiCover) => {
    const key = source === "ai" ? `ai-${aiCover?.id}` : "designer";
    setSavingKey(key);
    try {
      await coverSelectionApi.save(ticketNumber, source === "ai" ? { source, ai_cover_id: aiCover!.id } : { source });
      setLocalSelection({ source, aiCoverId: aiCover?.id ?? null });
      toast({
        title: "Production cover selected",
        description: source === "ai" ? `AI cover v${aiCover?.version ?? ""} selected.` : "Designer cover selected.",
      });
      queryClient.invalidateQueries({ queryKey: ["cover-selection", ticketNumber] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save selection", description: errMsg(e, "Please try again.") });
    } finally {
      setSavingKey(null);
    }
  };

  const handleGenerate = async () => {
    setTriggering(true);
    try {
      await aiCoversApi.generate(ticketNumber);
      toast({ title: "AI cover generation started", description: "This can take a minute." });
      refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Generation failed", description: errMsg(e, "Please try again.") });
    } finally {
      setTriggering(false);
    }
  };

  const handleRegenerate = async () => {
    const base = latestUsable ?? aiCovers[0];
    if (!base) return;
    setTriggering(true);
    try {
      await aiCoversApi.regenerate(ticketNumber, base.id, regenStyle === RANDOM_STYLE ? undefined : regenStyle);
      toast({ title: "Regenerating AI cover", description: "This can take a minute." });
      setRegenOpen(false);
      refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Regeneration failed", description: errMsg(e, "Please try again.") });
    } finally {
      setTriggering(false);
    }
  };

  const header = (badge: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-2 border-y border-border">
      <h3 className="text-sm font-semibold text-foreground">Production Cover</h3>
      {badge}
    </div>
  );

  // One AI cover version as a small card; readOnly hides the Select button
  const renderAiCoverCard = (cover: AiCover, readOnly: boolean) => {
    const isSelected = selectedSource === "ai" && selectedAiId === cover.id;
    return (
      <div
        key={cover.id}
        className={cn(
          "rounded-md border p-2 space-y-2",
          isSelected ? "border-[#3d5a47] ring-1 ring-[#3d5a47]/30" : "border-border"
        )}
      >
        {cover.status === "pending" ? (
          <div className="h-36 rounded bg-muted flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CoverImage url={cover.image_url} alt={`AI cover v${cover.version ?? ""}`} placeholder="No image" className="h-36" />
        )}
        <div className="flex flex-wrap items-center gap-1">
          {cover.version != null && <Badge variant="secondary" className="text-[10px]">v{cover.version}</Badge>}
          <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_BADGE[cover.status] ?? "")}>
            {cover.status}
          </Badge>
          {cover.reference_image_used && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
              Author image
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={cover.style_name ?? undefined}>
          {cover.style_name || "—"}
          {cover.generated_at ? ` · ${formatDate(cover.generated_at)}` : ""}
        </p>
        {isSelected ? (
          <p className="text-xs font-medium text-[#3d5a47] flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Selected
          </p>
        ) : !readOnly && isUsable(cover) ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            disabled={busy}
            onClick={() => handleSelect("ai", cover)}
          >
            {savingKey === `ai-${cover.id}` && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Select
          </Button>
        ) : null}
      </div>
    );
  };

  if (selectionLoading) {
    return (
      <div className={className}>
        {header(null)}
        <div className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  /* ---------- Designer cover approved: locked; AI covers shown view-only ---------- */
  if (designerApproved) {
    return (
      <div className={className}>
        {header(
          <Badge variant="outline" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        )}
        <div className="p-4 flex flex-col sm:flex-row items-start gap-4">
          <div className="w-full sm:w-48">
            <CoverImage url={designerUrl} alt="Approved designer cover" placeholder="Designer cover" className="h-64" />
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Designer cover (approved)</p>
            <p className="text-muted-foreground">
              The designer cover has been approved and is locked as the production cover.
            </p>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 pt-3 border-t border-border">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            AI Generated
            <span className="font-normal text-muted-foreground">(view only)</span>
          </p>
          {aiLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : aiError && aiCovers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Couldn't load AI covers.</p>
          ) : aiCovers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI covers have been generated for this proposal.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {aiCovers.map((cover) => renderAiCoverCard(cover, true))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Selection UI: designer vs AI ---------- */
  const selectionBadge =
    selectedSource === "designer" ? (
      <Badge variant="outline">Designer selected</Badge>
    ) : selectedSource === "ai" ? (
      <Badge variant="outline">AI selected</Badge>
    ) : (
      <Badge variant="outline" className="bg-muted text-muted-foreground">No selection</Badge>
    );

  return (
    <div className={className}>
      {header(selectionBadge)}

      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          The designer cover is not approved yet. Choose the designer or AI-generated cover as the final production cover.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Designer */}
          <div
            className={cn(
              "rounded-md border-2 p-3 space-y-3 flex flex-col",
              isDesignerSelected ? "border-[#3d5a47] ring-2 ring-[#3d5a47]/20" : "border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Designer</p>
              {isDesignerSelected && (
                <Badge className="gap-1 bg-[#3d5a47] text-white hover:bg-[#3d5a47]">
                  <CheckCircle2 className="h-3 w-3" />
                  Selected
                </Badge>
              )}
            </div>
            <CoverImage url={designerUrl} alt="Designer cover" placeholder="No designer cover uploaded yet" className="h-72" />
            <div className="flex-1" />
            <Button
              size="sm"
              variant={isDesignerSelected ? "secondary" : "outline"}
              className="w-full"
              disabled={busy || !designerUrl || isDesignerSelected}
              onClick={() => handleSelect("designer")}
            >
              {savingKey === "designer" && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isDesignerSelected ? "Selected" : "Select this cover"}
            </Button>
          </div>

          {/* AI generated */}
          <div
            className={cn(
              "rounded-md border-2 p-3 space-y-3 flex flex-col",
              isLatestAiSelected ? "border-[#3d5a47] ring-2 ring-[#3d5a47]/20" : "border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                AI Generated
              </p>
              {isLatestAiSelected && (
                <Badge className="gap-1 bg-[#3d5a47] text-white hover:bg-[#3d5a47]">
                  <CheckCircle2 className="h-3 w-3" />
                  Selected
                </Badge>
              )}
            </div>

            {isGenerating && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating a new AI cover… this can take a minute.
              </div>
            )}

            {aiLoading ? (
              <div className="h-72 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : aiError && aiCovers.length === 0 ? (
              <div className="h-72 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Couldn't load AI covers.
              </div>
            ) : latestUsable ? (
              <>
                <CoverImage url={latestUsable.image_url} alt="AI generated cover" placeholder="AI cover" className="h-72" />
                <div className="flex flex-wrap items-center gap-1.5">
                  {latestUsable.style_name && <Badge variant="outline">{latestUsable.style_name}</Badge>}
                  {latestUsable.version != null && <Badge variant="secondary">v{latestUsable.version}</Badge>}
                  {latestUsable.status === "approved" && (
                    <Badge variant="outline" className={STATUS_BADGE.approved}>Approved</Badge>
                  )}
                  {latestUsable.reference_image_used && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Author image used</Badge>
                  )}
                </div>
              </>
            ) : !isGenerating ? (
              <CoverImage url={null} alt="" placeholder="No AI cover generated yet" className="h-72" />
            ) : null}

            {selectedAiCover && !isLatestAiSelected && (
              <p className="text-xs text-muted-foreground">
                Currently selected: older AI version v{selectedAiCover.version ?? "?"}
                {selectedAiCover.reference_image_used ? " (author image used)" : ""}. See version history below.
              </p>
            )}

            <div className="flex-1" />
            <div className="flex gap-2">
              {latestUsable ? (
                <>
                  <Button
                    size="sm"
                    variant={isLatestAiSelected ? "secondary" : "outline"}
                    className="flex-1"
                    disabled={busy || isLatestAiSelected}
                    onClick={() => handleSelect("ai", latestUsable)}
                  >
                    {savingKey === `ai-${latestUsable.id}` && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    {isLatestAiSelected ? "Selected" : "Select this cover"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy || isGenerating}
                    onClick={() => {
                      setRegenStyle(RANDOM_STYLE);
                      setRegenOpen(true);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={busy || isGenerating || aiLoading}
                  onClick={handleGenerate}
                >
                  {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate AI cover
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Version history */}
        {aiCovers.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-sm font-medium text-[#3d5a47] hover:underline">
                {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                AI cover version history ({aiCovers.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {aiCovers.map((cover) => renderAiCoverCard(cover, false))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Regenerate with optional style */}
      <Dialog open={regenOpen} onOpenChange={(open) => !triggering && setRegenOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate AI cover</DialogTitle>
            <DialogDescription>
              Pick a style, or leave it on random to let the generator choose. A new version is created; earlier
              versions stay in the history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Style</Label>
            <Select value={regenStyle} onValueChange={setRegenStyle} disabled={stylesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={stylesLoading ? "Loading styles…" : "Random style"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RANDOM_STYLE}>Random style</SelectItem>
                {styles.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                    {s.category ? ` · ${s.category}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {regenStyle !== RANDOM_STYLE && (
              <p className="text-xs text-muted-foreground">
                {styles.find((s) => s.name === regenStyle)?.description}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenOpen(false)} disabled={triggering}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={triggering} className="bg-[#3d5a47] hover:bg-[#3d5a47]/90 text-white">
              {triggering && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoverSelectionSection;
