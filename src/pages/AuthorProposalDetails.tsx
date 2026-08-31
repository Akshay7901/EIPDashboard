import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import api from "@/lib/api";
import { extractCountry } from "@/lib/extractCountry";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  FileText,
  Download,
  Eye,
  Send,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { useProposal } from "@/hooks/useProposals";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { statusIs, normalizeStatus } from "@/lib/statusUtils";
import DocumentPreviewDialog from "@/components/proposals/PdfPreviewDialog";
import ContractPdfViewerDialog from "@/components/proposals/ContractPdfViewerDialog";
import { proposalApi, contractApi, metadataApi, metadataQueriesApi, requestInfoApi } from "@/lib/proposalsApi";
import { useReview } from "@/hooks/useReview";
import { useContract } from "@/hooks/useContract";
import { useContractQueries } from "@/hooks/useContractQueries";
import { toast } from "@/hooks/use-toast";
import brandLogo from "@/assets/brand-logo.webp";
import ContractQueryThread from "@/components/proposals/ContractQueryThread";
import ContributorsPanel from "@/components/proposals/ContributorsPanel";
import AuthorPublicationMetadata from "@/components/proposals/AuthorPublicationMetadata";
import InfoRequestPanel from "@/components/proposals/InfoRequestPanel";
import { useRequestInfo } from "@/hooks/useRequestInfo";

/* ---- Timeline helpers ---- */

interface TimelineStage {
  stage_name: string;
  display_name: string;
  completed_at?: string | null;
  started_at?: string | null;
  is_current: boolean;
  is_completed: boolean;
}

const getTimelineProgressFromApi = (timeline: TimelineStage[]): number => {
  if (!timeline?.length) return 0;
  const isDeclined = timeline.some((s) => s.stage_name === "declined" && s.is_completed);
  if (isDeclined) return 100;
  const completedCount = timeline.filter((s) => s.is_completed).length;
  return Math.round((completedCount / timeline.length) * 100);
};

/* ---- Action banner config ---- */

const getActionBanner = (status: string) => {
  if (statusIs(status, "feedback_&_agreement_pending", "approved", "review_returned", "contract_issued")) {
    return {
      show: true,
      icon: AlertCircle,
      iconColor: "text-[#c05621]",
      bgColor: "bg-[#c05621]/5 border-[#c05621]/20",
      title: "Peer review complete – action required",
      description: "Please review the feedback and contract, then respond.",
      buttonLabel: "View & Respond",
      buttonTab: "review",
    };
  }
  if (statusIs(status, "final_review_&_confirmation", "locked", "awaiting_author_approval")) {
    return {
      show: true,
      icon: AlertCircle,
      iconColor: "text-[#2563eb]",
      bgColor: "bg-[#2563eb]/5 border-[#2563eb]/20",
      title: "Clarification needed – action required",
      description: "Additional information has been requested. Please respond.",
      buttonLabel: "View & Respond",
      buttonTab: "review",
    };
  }
  return { show: false } as any;
};

/* ---- Detail helpers ---- */

const DetailField = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
};

/* ---- Review feedback fields (matching PeerReviewReadOnly) ---- */

const REVIEW_FEEDBACK_FIELDS = [
  { key: "scope", label: "Scope" },
  { key: "purposeAndValue", label: "Purpose and Value" },
  { key: "title", label: "Title" },
  { key: "originality", label: "Originality and Points of Difference" },
  { key: "credibility", label: "Credibility" },
  { key: "structure", label: "Structure and Quality" },
  { key: "clarity", label: "Clarity, Structure and Quality of Writing" },
  { key: "otherComments", label: "Other Comments" },
  { key: "recommendation", label: "Recommendations" },
];

const ReviewFeedbackCard: React.FC<{ review: any; title: string }> = ({ review, title }) => {
  const formData = review?.review_data;
  if (!formData) return null;

  const completedDate = review.submitted_at
    ? format(new Date(review.submitted_at), "MMM d, yyyy")
    : review.updated_at
      ? format(new Date(review.updated_at), "MMM d, yyyy")
      : null;

  const hasContent = REVIEW_FEEDBACK_FIELDS.some((f) => formData[f.key]?.trim?.());
  if (!hasContent) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-foreground">{title}</h3>
      </div>
      {REVIEW_FEEDBACK_FIELDS.map((field) => {
        const value = formData[field.key];
        if (!value?.trim?.()) return null;
        return (
          <React.Fragment key={field.key}>
            <div>
              <Separator className="mb-6" />
              <h4 className="text-base font-semibold text-foreground mb-2">{field.label}</h4>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{value}</p>
            </div>
            {/* Show DR Note right after Recommendations */}
            {field.key === "recommendation" && formData.dr_note?.trim?.() && (
              <div className="bg-primary/5 border border-primary/20 rounded-md p-4 space-y-1">
                <p className="text-sm font-semibold text-foreground">Note from the Reviewer</p>
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{formData.dr_note}</p>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ---- Main ---- */

const seenReviewSignatures = new Map<string, string>();

const AuthorProposalDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("proposal");
  const [hasSeenReview, setHasSeenReview] = useState(false);
  const [showQueryThread, setShowQueryThread] = useState(false);
  const [queryAccordionValue, setQueryAccordionValue] = useState<string | undefined>(undefined);
  const [openAccordion, setOpenAccordion] = useState<string | undefined>("contract-details");
  const [isAccepting, setIsAccepting] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; type: "pdf" | "word" } | null>(
    null,
  );
  const [contractViewOpen, setContractViewOpen] = useState(false);
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null);
  const [contractPdfLoading, setContractPdfLoading] = useState(false);

  // Contract signing URL state
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [signingExpiresAt, setSigningExpiresAt] = useState<string | null>(null);

  const { data: proposal, isLoading, error, refetch } = useProposal(id || "");
  const localId = proposal?.id || "";
  const ticketNum = proposal?.ticket_number || id || "";
  const { review: reviewData, isLoading: isReviewLoading } = useReview(ticketNum);
  const { latestContract, isLoading: contractLoading, refetch: refetchContract } = useContract(ticketNum);
  const {
    queries: contractQueries,
    isLoading: queriesLoading,
    raiseQuery,
    respondToQuery,
  } = useContractQueries(ticketNum);
  const {
    infoRequests,
    pendingRequest: pendingInfoRequest,
    respondToRequest: respondToInfoRequest,
    saveDraft: saveDraftInfoRequest,
  } = useRequestInfo(ticketNum);

  const { data: metadataResponse } = useQuery({
    queryKey: ["metadata", ticketNum],
    queryFn: () => metadataApi.get(ticketNum),
    enabled: !!ticketNum,
  });
  const metadataStatus = metadataResponse?.metadata_status;

  const { data: metadataQueries = [] } = useQuery({
    queryKey: ["metadata-queries", ticketNum],
    queryFn: () => metadataQueriesApi.list(ticketNum),
    enabled: !!ticketNum && !!metadataResponse,
  });
  // Author has a pending query awaiting reviewer response
  const hasAuthorPendingQuery = metadataQueries.some(
    (q) => q.type === "query" && !metadataQueries.some((r) => r.type === "response" && r.parent_query_id === q.id),
  );

  // Fetch a fresh signing URL and open it immediately
  const handleSignContract = async () => {
    if (!ticketNum) return;
    setSigningLoading(true);
    setSigningError(null);
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNum)}/contract/signing-url`);
      if (data?.signing_url) {
        setSigningUrl(data.signing_url);
        setSigningExpiresAt(data.expires_at || null);
        window.open(data.signing_url, "_blank", "noopener,noreferrer");
      } else {
        setSigningError("No signing URL received from server.");
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (status === 404) setSigningError("No active contract found for this proposal.");
      else if (status === 400) setSigningError("No DocuSign envelope is associated with this contract.");
      else if (status === 403) setSigningError("You do not have permission to sign this contract.");
      else setSigningError(err?.message || "Failed to generate signing URL.");
    } finally {
      setSigningLoading(false);
    }
  };

  // Extract reviews array from API response
  const reviews = reviewData?.reviews || (reviewData?.review ? [reviewData.review] : []);
  const peerReview = reviews.find((r: any) => r.reviewer_role === "peer_reviewer");
  const decisionReview = reviews.find((r: any) => r.reviewer_role === "decision_reviewer");

  const latestReviewTimestamp =
    reviews
      .map((r: any) => r?.updated_at || r?.submitted_at || r?.created_at || "")
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || "";

  const latestContractTimestamp =
    latestContract?.updated_at ||
    latestContract?.created_at ||
    latestContract?.docusign_sent_at ||
    latestContract?.docusign_completed_at ||
    "";

  const reviewNotificationSignature = [
    normalizeStatus(proposal?.status || ""),
    reviews.length,
    latestReviewTimestamp,
    latestContract?.id || "",
    latestContractTimestamp,
  ].join("|");

  useEffect(() => {
    if (!id) return;
    const alreadySeen = seenReviewSignatures.get(id) === reviewNotificationSignature;
    setHasSeenReview(alreadySeen);
    // If user is currently viewing the review tab, mark as seen after a moment
    if (!alreadySeen && activeTab === "review") {
      const timer = setTimeout(() => {
        seenReviewSignatures.set(id, reviewNotificationSignature);
        setHasSeenReview(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [id, reviewNotificationSignature, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setOpenAccordion(value === "review" ? "contract-details" : undefined);
  };

  const isContractSigned = latestContract?.docusign_status === "completed" || !!latestContract?.docusign_completed_at;
  const hasReviewContent = reviews.length > 0 || !!latestContract;

  // Default tab priority: metadata (if contract signed) > review (if available) > proposal
  // Determine if queries section should be auto-opened
  const hasEditorQueryResponse = React.useMemo(() => {
    if (!contractQueries.length) return false;
    return contractQueries.some((q: any) => q.type === "response");
  }, [contractQueries]);
  const hasPendingContractQuery = React.useMemo(() => {
    if (!contractQueries.length) return false;
    const responseParentIds = new Set(
      contractQueries.filter((q: any) => q.type === "response" && q.parent_query_id).map((q: any) => q.parent_query_id),
    );
    return contractQueries.some((q: any) => q.type === "query" && !responseParentIds.has(q.id));
  }, [contractQueries]);

  useEffect(() => {
    if (isContractSigned) {
      setActiveTab("metadata");
      if (id) {
        seenReviewSignatures.set(id, reviewNotificationSignature);
        setHasSeenReview(true);
      }
    } else if (latestContract && !isContractSigned) {
      // Contract exists but not signed — default to Peer Review & Contract tab
      setActiveTab("review");
      if (hasEditorQueryResponse || statusIs(proposal?.status || "", "queries_raised")) {
        setShowQueryThread(true);
        setQueryAccordionValue("contract-queries");
        setOpenAccordion(undefined);
      } else {
        setOpenAccordion("contract-details");
      }
    } else if (
      (proposal &&
        statusIs(
          proposal.status,
          "awaiting_more_info",
          "additional_info_required",
          "additional_information_required",
        )) ||
      infoRequests.length > 0
    ) {
      setActiveTab("additional-info");
    } else if (hasReviewContent) {
      setActiveTab("review");
      if (hasEditorQueryResponse || statusIs(proposal?.status || "", "queries_raised")) {
        setShowQueryThread(true);
        setQueryAccordionValue("contract-queries");
        setOpenAccordion(undefined);
      } else {
        setOpenAccordion("contract-details");
      }
    }
  }, [isContractSigned, hasReviewContent, proposal?.status, hasEditorQueryResponse, latestContract]);

  if (isLoading) {
    return (
      <DashboardLayout title="Proposal Review">
        <div className="py-20 text-center text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!proposal || error) {
    return (
      <DashboardLayout title="Proposal Review">
        <div className="py-20 text-center space-y-4">
          <p className="text-destructive">Failed to load proposal</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </DashboardLayout>
    );
  }

  const files = proposal.file_uploads ? proposal.file_uploads.split(",").map((f: string) => f.trim()) : [];
  const actionBanner = getActionBanner(proposal.status);
  const apiTimeline: TimelineStage[] = proposal.timeline || [];
  const progress = getTimelineProgressFromApi(apiTimeline);
  const isDeclined = statusIs(proposal.status, "declined", "rejected");

  return (
    <DashboardLayout title="Proposal Review">
      <div className="space-y-6 max-w-8xl mx-auto">
        {/* Back button */}
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => navigate("/author/proposals")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Logo" className="h-8 sm:h-10 w-auto" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Proposal Review</h1>
          </div>
          <div className="text-left sm:text-right text-sm text-muted-foreground">
            {proposal.ticket_number && (
              <p>
                Proposal ID: <span className="font-medium text-foreground">{proposal.ticket_number}</span>
              </p>
            )}
            <p>Submitted: {proposal.created_at ? format(new Date(proposal.created_at), "MMM d, yyyy") : "—"}</p>
          </div>
        </div>

        {/* Declined Banner */}
        {isDeclined && (
          <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">This proposal has been declined</p>
              <p className="text-xs text-muted-foreground">No further actions can be taken on this proposal.</p>
            </div>
          </div>
        )}

        {/* Action Banner */}
        {!isDeclined && actionBanner.show}

        {/* Info Request Banner - only show action-required badge, not the full panel (that's in the tab) */}
        {!isDeclined && pendingInfoRequest &&
          !statusIs(
            proposal.status,
            "awaiting_more_info",
            "additional_info_required",
            "additional_information_required",
          ) &&
          infoRequests.length > 0 && (
            <div className="bg-[#D97706]/5 border border-[#D97706]/30 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-[#D97706] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Additional information has been requested</p>
                <p className="text-xs text-muted-foreground">Please check the Additional Information tab to respond.</p>
              </div>
            </div>
          )}

        {/* Title & Subtitle */}
        <div>
          <h2 className="text-xl font-bold text-foreground">{proposal.name}</h2>
          {proposal.sub_title && <p className="text-base text-muted-foreground mt-1">{proposal.sub_title}</p>}
        </div>

        {/* Publication Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Publication Timeline</h3>
            <span className="text-sm text-muted-foreground">{progress}% Complete</span>
          </div>

          {/* Progress bar */}
          <div className="relative">
            <div className="h-1.5 bg-muted rounded-full">
              <div
                className="h-1.5 bg-[#2563eb] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Timeline steps */}
          <div
            className={cn("grid gap-2 overflow-x-auto")}
            style={{ gridTemplateColumns: `repeat(${apiTimeline.length || 6}, minmax(60px, 1fr))` }}
          >
            {apiTimeline.map((step) => {
              const dateStr = step.completed_at || step.started_at;
              return (
                <div key={step.stage_name} className="flex flex-col items-center text-center gap-1.5">
                  {step.stage_name === "declined" && step.is_completed ? (
                    <XCircle className="h-6 w-6 text-destructive" />
                  ) : step.is_completed ? (
                    <CheckCircle2 className="h-6 w-6 text-[#3d5a47]" />
                  ) : step.is_current ? (
                    <div className="relative flex items-center justify-center h-6 w-6">
                      <Circle className="h-6 w-6 text-[#2563eb]" />
                      <div className="absolute h-2.5 w-2.5 rounded-full bg-[#2563eb] animate-pulse" />
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground/40" />
                  )}
                  <span
                    className={cn(
                      "text-[10px] leading-tight",
                      step.is_completed || step.is_current ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {step.display_name}
                  </span>
                  {dateStr && (
                    <span className="text-[9px] text-muted-foreground">{format(new Date(dateStr), "MMM d, yyyy")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs: Proposal Information / Peer Review & Contract */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-auto bg-transparent border-b rounded-none p-0 h-auto flex-wrap">
            <TabsTrigger
              value="proposal"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#3d5a47] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm"
            >
              Proposal Information
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#3d5a47] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm"
            >
              Peer Review & Contract
              {!isDeclined && !isContractSigned &&
                !statusIs(proposal.status, "queries_raised") &&
                !hasPendingContractQuery &&
                latestContract && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                )}
            </TabsTrigger>
            {(statusIs(
              proposal.status,
              "awaiting_more_info",
              "additional_info_required",
              "additional_information_required",
            ) ||
              infoRequests.length > 0) && (
              <TabsTrigger
                value="additional-info"
                className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#3d5a47] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm"
              >
                Additional Information
                {!isDeclined && pendingInfoRequest && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                )}
              </TabsTrigger>
            )}
            {isContractSigned && (
              <TabsTrigger
                value="metadata"
                className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-[#3d5a47] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm"
              >
                Publication Data
                {!isDeclined && (statusIs(proposal.status, "awaiting_author_approval") || metadataStatus === "sent_to_author") &&
                  !hasAuthorPendingQuery && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                  )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ---- PROPOSAL INFORMATION TAB ---- */}
          <TabsContent value="proposal" className="mt-6 space-y-6">
            <p className="text-sm text-muted-foreground italic">
              Below is a summary of your submitted proposal. This information is read-only and cannot be edited at this
              stage.
            </p>

            {/* Author Details */}
            <Accordion type="multiple" defaultValue={["author", "book"]} className="space-y-3">
              <AccordionItem value="author" className="border rounded-lg px-5">
                <AccordionTrigger className="text-base font-semibold gap-2">
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    Author Details
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Name" value={proposal.corresponding_author_name || proposal.author_name} />
                    <DetailField label="Email" value={proposal.author_email} />
                    <DetailField label="Institution" value={proposal.institution} />
                    <DetailField label="Job Title" value={proposal.job_title} />
                    <DetailField label="Secondary Email" value={proposal.secondary_email} />
                    <DetailField label="Country" value={extractCountry(proposal.address)} />
                  </div>
                  {proposal.biography && (
                    <div className="space-y-1 pt-2">
                      <p className="text-xs text-muted-foreground">Biography</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded">
                        {proposal.biography}
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Book Details */}
              <AccordionItem value="book" className="border rounded-lg px-5">
                <AccordionTrigger className="text-base font-semibold gap-2">
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                    Book Details
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <DetailField label="Book Type" value={proposal.book_type} />
                    <DetailField label="Word Count" value={proposal.word_count} />
                    <DetailField label="Expected Completion" value={proposal.expected_completion_date} />
                    <DetailField label="Figures/Tables" value={proposal.figures_tables_count} />
                  </div>
                  {proposal.short_description && (
                    <div className="space-y-1 pt-2">
                      <p className="text-xs text-muted-foreground">Blurb</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded">
                        {proposal.short_description}
                      </p>
                    </div>
                  )}
                  {proposal.table_of_contents && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Table of Contents</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded">
                        {proposal.table_of_contents}
                      </p>
                    </div>
                  )}
                  {proposal.detailed_description && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Detailed Description</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded">
                        {proposal.detailed_description}
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Market & Keywords */}
              <AccordionItem value="market" className="border rounded-lg px-5">
                <AccordionTrigger className="text-base font-semibold gap-2">
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    Market & Keywords
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 space-y-4">
                  {proposal.keywords && <DetailField label="Keywords" value={proposal.keywords} />}
                  {proposal.marketing_info && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Marketing Information</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 p-4 rounded">
                        {proposal.marketing_info}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Co-Authors / Editors" value={proposal.co_authors_editors} />
                    <DetailField label="Referees / Reviewers" value={proposal.referees_reviewers} />
                    <DetailField label="Under Review Elsewhere" value={proposal.under_review_elsewhere} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Supporting Documents */}
              <AccordionItem value="documents" className="border rounded-lg px-5">
                <AccordionTrigger className="text-base font-semibold gap-2">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Supporting Documents
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  {files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                  ) : (
                    <div className="space-y-2">
                      {files.map((file: string, index: number) => {
                        const fileName = file.split("/").pop() || file;
                        const isPdf = fileName.toLowerCase().endsWith(".pdf");
                        const isWord =
                          fileName.toLowerCase().endsWith(".doc") || fileName.toLowerCase().endsWith(".docx");
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{fileName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {(isPdf || isWord) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDocumentPreview({ url: file, name: fileName, type: isPdf ? "pdf" : "word" })
                                  }
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" asChild>
                                <a href={file} download target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {ticketNum && <ContributorsPanel ticketNumber={ticketNum} readOnly />}
          </TabsContent>

          {/* ---- METADATA TAB (only after contract signed) ---- */}
          {isContractSigned && (
            <TabsContent value="metadata" className="mt-6 space-y-6">
              <AuthorPublicationMetadata proposal={proposal} contractSigned ticketNumber={ticketNum} readOnly={isDeclined} />
            </TabsContent>
          )}

          {/* ---- ADDITIONAL INFORMATION TAB ---- */}
          {(statusIs(
            proposal.status,
            "awaiting_more_info",
            "additional_info_required",
            "additional_information_required",
          ) ||
            infoRequests.length > 0) && (
            <TabsContent value="additional-info" className="mt-6 space-y-6">
              <InfoRequestPanel
                infoRequests={infoRequests}
                isLoading={false}
                viewAs="author"
                proposal={proposal}
                readOnly={isDeclined}
                onRespond={(requestId, responseNote, updatedFields, files) => {
                  respondToInfoRequest.mutate(
                    { request_id: requestId, response_note: responseNote, updated_fields: updatedFields, files },
                    { onSuccess: () => refetch() },
                  );
                }}
                isResponding={respondToInfoRequest.isPending}
                onSaveDraft={(requestId, updatedFields) => {
                  saveDraftInfoRequest.mutate({ request_id: requestId, updated_fields: updatedFields });
                }}
                isSavingDraft={saveDraftInfoRequest.isPending}
                onAutoSave={(requestId, updatedFields) => {
                  requestInfoApi
                    .save(ticketNum, { request_id: requestId, updated_fields: updatedFields })
                    .catch(() => {});
                }}
              />
            </TabsContent>
          )}

          <TabsContent value="review" className="mt-6 space-y-6">
            {isReviewLoading || contractLoading ? (
              <div className="py-10 text-center text-muted-foreground">Loading...</div>
            ) : !peerReview && !decisionReview && !latestContract ? (
              <div className="py-10 text-center text-muted-foreground">
                No review feedback or contract available yet.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info banner */}
                <div className="bg-[#f0faf3] border border-[#c6e9ce] rounded-lg p-4 text-sm text-foreground/80">
                  The feedback below forms part of the publishing decision. Our reviewers have carefully evaluated your
                  proposal and provided the following assessment. Please review the feedback and contract details.
                </div>

                <Accordion
                  type="single"
                  collapsible
                  value={openAccordion}
                  onValueChange={setOpenAccordion}
                  className="space-y-4"
                >
                  {/* Peer Review Feedback Section */}
                  {(peerReview || decisionReview) && (
                    <AccordionItem value="peer-review" className="border rounded-md overflow-hidden">
                      <AccordionTrigger className="px-6 py-4 hover:no-underline bg-background">
                        <h3 className="text-xl font-bold text-foreground">Peer Review Feedback</h3>
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-6 pt-0 space-y-6">
                        {peerReview && <ReviewFeedbackCard review={peerReview} title="" />}
                        {decisionReview && <ReviewFeedbackCard review={decisionReview} title="" />}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Contract Details Section */}
                  <AccordionItem value="contract-details" className="border rounded-md overflow-hidden">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline bg-background">
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-foreground">Contract Details</h3>
                        {latestContract && (
                          <p className="text-sm text-muted-foreground font-normal mt-0.5">
                            Status:{" "}
                            <span className="capitalize">
                              {(latestContract.status || latestContract.docusign_status || "pending").replace(
                                /_/g,
                                " ",
                              )}
                            </span>
                          </p>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6 pt-0 space-y-6">
                      {!latestContract ? (
                        <p className="text-sm text-muted-foreground">
                          No contract has been issued for this proposal yet.
                        </p>
                      ) : (
                        (() => {
                          const contractStatus = (
                            latestContract.status ||
                            latestContract.docusign_status ||
                            ""
                          ).toLowerCase();
                          const isSent = contractStatus === "sent";
                          const isSigned = contractStatus === "completed" || contractStatus === "signed";
                          const isContractDeclined = contractStatus === "declined";
                          const isVoided = contractStatus === "voided";
                          const proposalIsQueriesRaised = statusIs(proposal.status, "queries_raised");
                          // Also block signing if there are local pending (unanswered) queries
                          const responseParentIds = new Set(
                            contractQueries
                              .filter((q) => q.type === "response" && q.parent_query_id)
                              .map((q) => q.parent_query_id),
                          );
                          const hasPendingQuery = contractQueries
                            .filter((q) => q.type === "query")
                            .some((q) => !responseParentIds.has(q.id));
                          const signingBlocked = proposalIsQueriesRaised || hasPendingQuery || isDeclined;

                          return (
                            <div className="space-y-5">
                              {/* Contract info */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Contract Type</p>
                                  <p className="text-sm font-medium capitalize">
                                    {(latestContract.contract_type || "—").replace(/_/g, " ")}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Status</p>
                                  <p className="text-sm font-medium capitalize">{contractStatus.replace(/_/g, " ")}</p>
                                </div>
                                {latestContract.docusign_sent_at && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Sent</p>
                                    <p className="text-sm font-medium">
                                      {format(new Date(latestContract.docusign_sent_at), "MMM d, yyyy")}
                                    </p>
                                  </div>
                                )}
                                {latestContract.docusign_completed_at && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Signed</p>
                                    <p className="text-sm font-medium">
                                      {format(new Date(latestContract.docusign_completed_at), "MMM d, yyyy")}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Sent → Sign flow */}
                              {isSent && (
                                <div className="space-y-4">
                                  <div className="bg-muted/50 border rounded-md p-5 space-y-2">
                                    <p className="text-sm font-bold text-foreground">
                                      Your contract is ready for signing
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      Click the button below to open your contract for signing via DocuSign. A fresh
                                      signing link is generated each time you click.
                                    </p>
                                  </div>

                                  {signingLoading && (
                                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                      <p className="text-sm text-muted-foreground">Generating your signing link…</p>
                                    </div>
                                  )}

                                  {signingError && !signingLoading && (
                                    <div className="border border-destructive/30 bg-destructive/5 rounded-md p-5 space-y-3">
                                      <div className="flex items-center gap-2">
                                        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                                        <p className="text-sm font-medium text-destructive">{signingError}</p>
                                      </div>
                                      <Button variant="outline" size="sm" onClick={handleSignContract}>
                                        <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                                      </Button>
                                    </div>
                                  )}

                                  {!signingLoading && !signingError && !signingBlocked && (
                                    <div className="max-w-sm mx-auto text-center space-y-3">
                                      <Button
                                        className="w-full bg-[#2f4b40] hover:opacity-90 text-white py-5 text-base"
                                        onClick={handleSignContract}
                                      >
                                        <ExternalLink className="mr-2 h-4 w-4" /> Review & Complete Contract
                                      </Button>
                                      <p className="text-xs text-muted-foreground">
                                        A fresh signing link will be generated each time you click.
                                      </p>
                                      <Button
                                        variant="outline"
                                        className="w-full gap-2 text-sm"
                                        onClick={() => {
                                          setShowQueryThread(true);
                                          setQueryAccordionValue("contract-queries");
                                          setTimeout(() => {
                                            document
                                              .getElementById("queries-section")
                                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                          }, 150);
                                        }}
                                      >
                                        <HelpCircle className="h-4 w-4" /> I have a question before signing
                                      </Button>
                                    </div>
                                  )}

                                  {signingBlocked && !signingLoading && (
                                    <div className={cn(
                                      "rounded-md p-4 text-center",
                                      isDeclined ? "bg-destructive/5 border border-destructive/30" : "bg-[#c4940a]/5 border border-[#c4940a]/30"
                                    )}>
                                      <p className={cn("text-sm font-medium", isDeclined ? "text-destructive" : "text-[#c4940a]")}>
                                        {isDeclined ? "This proposal has been declined" : "Signing is disabled while your query is being reviewed"}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {isDeclined ? "No further actions can be taken on this proposal." : "The signing button will be re-enabled once the editorial team responds."}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Signed → View */}
                              {isSigned && (
                                <div className="space-y-4">
                                  <div className="bg-[#f0faf3] border border-[#c6e9ce] rounded-md p-5 flex items-center gap-3">
                                    <CheckCircle2 className="h-6 w-6 text-[#3d5a47] shrink-0" />
                                    <div>
                                      <p className="text-sm font-bold text-foreground">Contract Signed</p>
                                      <p className="text-sm text-muted-foreground">
                                        Your publishing agreement has been signed successfully.
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={async () => {
                                      setContractViewOpen(true);
                                      setContractPdfLoading(true);
                                      try {
                                        const url = await contractApi.getDocumentBlob(ticketNum);
                                        setContractPdfUrl(url);
                                      } catch {
                                        setContractPdfUrl(null);
                                      } finally {
                                        setContractPdfLoading(false);
                                      }
                                    }}
                                  >
                                    <Eye className="h-4 w-4" /> View Signed Contract
                                  </Button>
                                </div>
                              )}

                              {/* Declined */}
                              {isContractDeclined && (
                                <div className="border border-destructive/30 bg-destructive/5 rounded-md p-5">
                                  <p className="text-sm font-bold text-destructive">Contract Declined</p>
                                  {latestContract.docusign_decline_reason && (
                                    <p className="text-sm text-foreground/80 mt-1">
                                      {latestContract.docusign_decline_reason}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Voided */}
                              {isVoided && (
                                <div className="border border-muted bg-muted/30 rounded-md p-5">
                                  <p className="text-sm font-bold text-muted-foreground">Contract Voided</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    This contract has been voided by the publisher.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Contract Query Thread — shown on demand or when queries exist */}
                {(showQueryThread || contractQueries.length > 0 || statusIs(proposal.status, "queries_raised")) && (
                  <div id="queries-section">
                    <Accordion
                      type="single"
                      collapsible
                      value={queryAccordionValue}
                      onValueChange={setQueryAccordionValue}
                      className="space-y-4"
                    >
                      <AccordionItem value="contract-queries" className="border rounded-md overflow-hidden">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline bg-background">
                          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <HelpCircle className="h-5 w-5 text-muted-foreground" />
                            Queries
                            {contractQueries.length > 0 && (
                              <span className="text-sm font-normal text-muted-foreground">
                                ({contractQueries.length})
                              </span>
                            )}
                          </h3>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6 pt-4">
                          <ContractQueryThread
                            queries={contractQueries}
                            isLoading={queriesLoading}
                            viewAs="author"
                            proposalStatus={proposal.status}
                            readOnly={isDeclined}
                            onSend={async (text, category) => {
                              await raiseQuery.mutateAsync({ queryText: text, category: category || "contract" });
                              setTimeout(() => {
                                refetch();
                                refetchContract();
                              }, 1000);
                            }}
                            isSending={raiseQuery.isPending}
                            hasActiveContract={
                              !!latestContract && (latestContract.status || "").toLowerCase() === "sent"
                            }
                          />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Document preview dialog */}
      {documentPreview && (
        <DocumentPreviewDialog
          open={!!documentPreview}
          onOpenChange={(open) => {
            if (!open) setDocumentPreview(null);
          }}
          documentUrl={documentPreview.url}
          fileName={documentPreview.name}
          fileType={documentPreview.type}
        />
      )}

      {/* Contract document viewer dialog */}
      <ContractPdfViewerDialog
        open={contractViewOpen}
        onOpenChange={(open) => {
          setContractViewOpen(open);
          if (!open) setContractPdfUrl(null);
        }}
        documentDataUrl={contractPdfUrl}
        isLoading={contractPdfLoading}
        downloadUrl={contractPdfUrl || undefined}
        downloadFileName={`${ticketNum || "contract"}.pdf`}
      />
    </DashboardLayout>
  );
};

export default AuthorProposalDetails;
