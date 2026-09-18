import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { getHallucinationScoreInfo, HALLUCINATION_SCORE_DESCRIPTION } from "@/lib/hallucinationScore";

type ProviderStatus = "pending" | "running" | "completed" | "failed";

interface ProviderReview {
  status?: ProviderStatus;
  final_score?: number | null;
  hallucination_score?: number | null;
  report_url?: string | null;
  triggered_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
}

interface AiReviewData {
  gemini: ProviderReview;
  qwen: ProviderReview;
}

interface Props {
  ticketNumber: string;
}

const PROVIDERS: Array<{ key: "gemini" | "qwen"; label: string }> = [
  { key: "gemini", label: "Gemini" },
  { key: "qwen", label: "Qwen" },
];

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const normalizeProvider = (raw: any): ProviderReview => ({
  status: raw?.status,
  final_score: raw?.final_score ?? null,
  hallucination_score: raw?.hallucination_score ?? null,
  report_url: raw?.report_url ?? null,
  triggered_at: raw?.triggered_at ?? null,
  completed_at: raw?.completed_at ?? null,
  error_message: raw?.error_message ?? null,
});

const normalize = (raw: any): AiReviewData => ({
  gemini: normalizeProvider(raw?.gemini ?? {}),
  qwen: normalizeProvider(raw?.qwen ?? {}),
});

const isBusyStatus = (s?: ProviderStatus) => s === "pending" || s === "running";

const AiReviewPanel: React.FC<Props> = ({ ticketNumber }) => {
  const { toast } = useToast();
  const [data, setData] = useState<AiReviewData>({ gemini: {}, qwen: {} });
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchStatus = async (): Promise<AiReviewData | null> => {
    try {
      const { data: raw } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/ai-review`);
      const normalized = normalize(raw);
      setData(normalized);
      return normalized;
    } catch (err: any) {
      if (err?.status === 404 || err?.response?.status === 404) {
        const empty: AiReviewData = { gemini: {}, qwen: {} };
        setData(empty);
        return empty;
      }
      return null;
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const latest = await fetchStatus();
      if (!latest) return;
      const stillBusy =
        isBusyStatus(latest.gemini.status) || isBusyStatus(latest.qwen.status);
      if (!stillBusy) stopPolling();
    }, 10000);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const latest = await fetchStatus();
      setLoading(false);
      if (
        latest &&
        (isBusyStatus(latest.gemini.status) || isBusyStatus(latest.qwen.status))
      ) {
        startPolling();
      }
    })();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  const runReview = async () => {
    setTriggering(true);
    try {
      await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/ai-review`);
      setData((prev) => ({
        gemini: { ...prev.gemini, status: "pending" },
        qwen: { ...prev.qwen, status: "pending" },
      }));
      startPolling();
      toast({ title: "AI review started", description: "Analysis is running in the background." });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to start AI review";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setTriggering(false);
      setConfirmOpen(false);
    }
  };

  const anyStarted =
    isBusyStatus(data.gemini.status) ||
    isBusyStatus(data.qwen.status) ||
    data.gemini.status === "completed" ||
    data.gemini.status === "failed" ||
    data.qwen.status === "completed" ||
    data.qwen.status === "failed";

  const anyBusy =
    isBusyStatus(data.gemini.status) ||
    isBusyStatus(data.qwen.status) ||
    triggering;

  const overallStatus = (): "not_run" | "running" | "completed" | "failed" => {
    if (!anyStarted) return "not_run";
    if (anyBusy) return "running";
    const anyFailed =
      data.gemini.status === "failed" || data.qwen.status === "failed";
    const anyCompleted =
      data.gemini.status === "completed" || data.qwen.status === "completed";
    if (anyFailed && !anyCompleted) return "failed";
    return "completed";
  };

  const statusBadge = () => {
    switch (overallStatus()) {
      case "running":
        return (
          <Badge className="bg-blue-600 hover:bg-blue-600 text-white gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Running
          </Badge>
        );
      case "completed":
        return <Badge className="bg-green-600 hover:bg-green-600 text-white">Completed</Badge>;
      case "failed":
        return <Badge className="bg-red-600 hover:bg-red-600 text-white">Failed</Badge>;
      default:
        return <Badge variant="secondary">Not Run</Badge>;
    }
  };

  const renderScore = (p: ProviderReview, field: "final_score" | "hallucination_score" = "final_score") => {
    if (p.status === "failed") {
      return (
        <span className="text-sm font-medium text-muted-foreground italic">Failed</span>
      );
    }
    if (isBusyStatus(p.status)) {
      return (
        <span className="flex items-center gap-1 text-sm font-medium">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">—</span>
        </span>
      );
    }
    const value = p[field];
    if (p.status === "completed" && typeof value === "number") {
      return <span className="text-sm font-semibold">{value.toFixed(1)}</span>;
    }
    return <span className="text-sm font-medium text-muted-foreground">—</span>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Proposal Review
        </CardTitle>
        {statusBadge()}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {anyStarted && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(({ key, label }) => {
                    const p = data[key];
                    return (
                      <Badge
                        key={key}
                        variant="outline"
                        className="gap-1.5 px-2.5 py-1 text-sm"
                      >
                        <span className="font-medium">{label}:</span>
                        {renderScore(p, "final_score")}
                        {isBusyStatus(p.status) && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            generating…
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>

                <TooltipProvider>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map(({ key, label }) => {
                      const p = data[key];
                      if (p.status !== "completed" && !isBusyStatus(p.status)) return null;
                      const scoreInfo =
                        typeof p.hallucination_score === "number"
                          ? getHallucinationScoreInfo(p.hallucination_score)
                          : null;
                      return (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-sm">
                              <span className="font-medium">{label} Hallucination:</span>
                              {renderScore(p, "hallucination_score")}
                              {scoreInfo && (
                                <span className="text-xs font-medium text-foreground">
                                  ({scoreInfo.label})
                                </span>
                              )}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {scoreInfo && <p className="font-medium">{scoreInfo.label}</p>}
                            <p>{HALLUCINATION_SCORE_DESCRIPTION}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>

                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(({ key, label }) => {
                    const p = data[key];
                    if (!p.report_url) return null;
                    return (
                      <Button
                        key={key}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          p.report_url &&
                          window.open(p.report_url, "_blank", "noopener,noreferrer")
                        }
                        className="gap-1.5"
                      >
                        <ExternalLink className="h-4 w-4" /> {label} Report
                      </Button>
                    );
                  })}
                </div>

                {(data.gemini.error_message || data.qwen.error_message) && (
                  <div className="space-y-0.5">
                    {PROVIDERS.map(({ key, label }) => {
                      const p = data[key];
                      if (p.status !== "failed" || !p.error_message) return null;
                      return (
                        <p key={key} className="text-xs text-red-600">
                          {label}: {p.error_message}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-0.5">
              {PROVIDERS.map(({ key, label }) => {
                const p = data[key];
                if (!p.triggered_at && !p.completed_at) return null;
                return (
                  <div key={key} className="text-xs text-muted-foreground space-y-0.5">
                    {p.triggered_at && (
                      <div>{label} triggered: {formatDate(p.triggered_at)}</div>
                    )}
                    {p.completed_at && (
                      <div>{label} completed: {formatDate(p.completed_at)}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={anyBusy} className="gap-1.5">
                {anyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Run AI Review
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run AI Proposal Review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will run Gemini and Qwen AI analyses on the uploaded proposal files. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={triggering}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runReview} disabled={triggering}>
              {triggering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default AiReviewPanel;
