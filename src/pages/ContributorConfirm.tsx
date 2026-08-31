import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContributorStatusBadge } from "@/components/proposals/ContributorsPanel";
import { contributorConfirmApi } from "@/lib/contributorsApi";
import brandLogo from "@/assets/brand-logo.webp";

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <div className="flex gap-4 py-1.5">
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  ) : null;

const ContributorConfirm: React.FC = () => {
  const { token = "" } = useParams<{ token: string }>();
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contributor-confirm", token],
    queryFn: () => contributorConfirmApi.get(token),
    enabled: !!token,
    retry: false,
  });

  const status = result || (data?.status as string | undefined);
  const alreadyResponded = status === "accepted" || status === "declined";

  const respond = async (action: "accept" | "decline") => {
    setSubmitting(action);
    setError(null);
    try {
      await contributorConfirmApi.respond(token, action);
      setResult(action === "accept" ? "accepted" : "declined");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex justify-center">
          <img src={brandLogo} alt="Ethics Press" className="h-12 object-contain" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chapter Contribution Invitation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading invitation…
              </div>
            ) : isError || !data ? (
              <p className="text-sm text-destructive py-4">
                This invitation link is invalid or has expired.
              </p>
            ) : (
              <>
                <div className="divide-y">
                  <Row label="Book" value={data.book_title} />
                  <Row label="Editor" value={data.editor_name} />
                  <Row label="Contributor" value={data.contributor_name} />
                  <Row label="Chapter" value={data.chapter_title} />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <ContributorStatusBadge status={status || "pending"} />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                {alreadyResponded ? (
                  <div className="flex items-start gap-2 text-sm bg-muted/40 border rounded-md p-3">
                    {status === "accepted" ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-[#3d5a47]" />
                    ) : (
                      <XCircle className="h-4 w-4 mt-0.5 text-[#9b2c2c]" />
                    )}
                    <span>
                      {result
                        ? `Thank you — your response has been recorded. You have ${result} this invitation.`
                        : "You have already responded to this invitation."}
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Button
                      className="bg-[#3d5a47] hover:bg-[#334b3c] text-white"
                      onClick={() => respond("accept")}
                      disabled={!!submitting}
                    >
                      {submitting === "accept" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      className="border-[#9b2c2c] text-[#9b2c2c] hover:bg-[#9b2c2c]/10"
                      onClick={() => respond("decline")}
                      disabled={!!submitting}
                    >
                      {submitting === "decline" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Decline
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ContributorConfirm;
