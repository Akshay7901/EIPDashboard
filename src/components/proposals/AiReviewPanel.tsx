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
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

interface AiReviewData {
  status: "not_run" | "pending" | "running" | "completed" | "failed";
  final_score?: number;
  triggered_by?: string;
  completed_at?: string;
  report_url?: string;
  error_message?: string;
}

interface Props {
  ticketNumber: string;
}

const formatDate = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const AiReviewPanel: React.FC<Props> = ({ ticketNumber }) => {
  const { toast } = useToast();
  const [data, setData] = useState<AiReviewData>({ status: "not_run" });
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchStatus = async (): Promise<AiReviewData | null> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/ai-review`);
      const normalized: AiReviewData = { status: data?.status || "not_run", ...data };
      setData(normalized);
      return normalized;
    } catch (err: any) {
      if (err?.status === 404 || err?.response?.status === 404) {
        setData({ status: "not_run" });
        return { status: "not_run" };
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
      if (latest && latest.status !== "pending" && latest.status !== "running") {
        stopPolling();
      }
    }, 10000);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const latest = await fetchStatus();
      setLoading(false);
      if (latest && (latest.status === "pending" || latest.status === "running")) {
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
      setData((prev) => ({ ...prev, status: "pending" }));
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

  const statusBadge = () => {
    switch (data.status) {
      case "pending":
        return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white">Pending</Badge>;
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

  const isBusy = data.status === "pending" || data.status === "running" || triggering;

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
            {data.status === "completed" && (
              <div className="flex items-center flex-wrap gap-3">
                <div className="text-lg font-semibold">
                  Score: {typeof data.final_score === "number" ? data.final_score.toFixed(1) : data.final_score} / 10
                </div>
                {data.report_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(data.report_url, "_blank", "noopener,noreferrer")}
                    className="gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4" /> View Full Report
                  </Button>
                )}
              </div>
            )}

            {data.status === "failed" && data.error_message && (
              <p className="text-sm text-red-600">{data.error_message}</p>
            )}

            {(data.triggered_by || data.completed_at) && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {data.triggered_by && <div>Triggered by: {data.triggered_by}</div>}
                {data.completed_at && <div>Completed: {formatDate(data.completed_at)}</div>}
              </div>
            )}

            <div>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={isBusy} className="gap-1.5">
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
              This will run a Gemini AI analysis on the uploaded proposal files. Continue?
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