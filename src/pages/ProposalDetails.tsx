// PROPOSAL DETAILS — TWO-PANEL PEER REVIEW LAYOUT

import React, { useState, useRef } from "react";
import { getDefaultContractFields, areContractFieldsValid, type ContractFieldValues } from "@/components/proposals/ContractFieldsForm";
import ContractFieldsForm from "@/components/proposals/ContractFieldsForm";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { extractCountry } from "@/lib/extractCountry";
import { statusIs } from "@/lib/statusUtils";
import { proposalApi, contractApi, metadataApi, metadataQueriesApi, lockProposalApi, requestInfoApi } from "@/lib/proposalsApi";
import { buildContractSendPayload, getDefaultContractType, getContractMismatchWarning } from "@/lib/contractUtils";
import ContractQueryThread from "@/components/proposals/ContractQueryThread";
import { useContractQueries } from "@/hooks/useContractQueries";
import { Separator } from "@/components/ui/separator";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProposalStatusBadge from "@/components/proposals/ProposalStatusBadge";
import PeerReviewCommentsForm, { type PeerReviewCommentsFormHandle } from "@/components/proposals/PeerReviewCommentsForm";
import PeerReviewSummary from "@/components/proposals/PeerReviewSummary";
import DocumentPreviewDialog from "@/components/proposals/PdfPreviewDialog";
import ContractPdfViewerDialog from "@/components/proposals/ContractPdfViewerDialog";

import DeclineProposalDialog from "@/components/proposals/DeclineProposalDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Download, Eye, BookOpen, User, Folder, UserCircle, ClipboardList, MessageSquare, CheckCircle2, FileCheck, Send, Loader2, History, GitCompareArrows, Lock, StickyNote, Save, Info, Sparkles } from "lucide-react";
import { useProposal, useWorkflowLogs, useProposalEvents } from "@/hooks/useProposals";
import { useReview } from "@/hooks/useReview";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useProposalActions } from "@/hooks/useProposalActions";
import { useAuth } from "@/contexts/AuthContext";
import { usePeerReviewers } from "@/hooks/usePeerReviewers";
import { useDefaultReviewer } from "@/hooks/useDefaultReviewer";
import ReviewCommentsDisplay from "@/components/proposals/ReviewCommentsDisplay";
import PeerReviewReadOnly from "@/components/proposals/PeerReviewReadOnly";
import DiffCheckerDialog from "@/components/proposals/DiffCheckerDialog";
import PublicationMetadata from "@/components/proposals/PublicationMetadata";
import { useContract } from "@/hooks/useContract";
import { useRequestInfo } from "@/hooks/useRequestInfo";
import InfoRequestPanel from "@/components/proposals/InfoRequestPanel";
import AiAssistanceSplitView from "@/components/proposals/AiAssistanceSplitView";

/* ---------------- Helpers ---------------- */

const DetailRow = ({
  label,
  value



}: {label: string;value?: string | null;}) => {
  if (!value) return null;
  return <div className="flex gap-4 py-2 min-w-0">
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}:</span>
      <span className="text-sm font-medium flex-1 min-w-0 break-words">{value}</span>
    </div>;
};
const ContentBlock = ({
  label,
  value



}: {label: string;value?: string | null;}) => {
  if (!value) return null;
  return <div className="space-y-2">
      <p className="text-sm text-muted-foreground italic">{label}:</p>
      <div className="bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-line rounded-none">
        {value}
      </div>
    </div>;
};

const normalizeReviewRole = (role?: string | null) => (role || "").toString().trim().toLowerCase();
const isPeerReviewerRole = (role?: string | null) => ["peer_reviewer", "reviewer_2", "reviewer2"].includes(normalizeReviewRole(role));
const isDecisionReviewerRole = (role?: string | null) => ["decision_reviewer", "reviewer_1", "reviewer1", "admin", "dr"].includes(normalizeReviewRole(role));
const normalizeReviewData = (data?: Record<string, any> | null) => {
  if (!data || typeof data !== "object") return {};

  const pick = (...keys: string[]) => keys.map((key) => data[key]).find((value) => value !== undefined && value !== null && value !== "");

  return {
    scope: pick("scope"),
    purposeAndValue: pick("purposeAndValue", "purpose_value", "purpose_and_value"),
    title: pick("title"),
    originality: pick("originality"),
    credibility: pick("credibility"),
    structure: pick("structure"),
    clarity: pick("clarity", "clarity_quality"),
    otherComments: pick("otherComments", "other_comments"),
    redFlags: pick("redFlags", "red_flags"),
    recommendation: pick("recommendation"),
    dr_note: pick("dr_note", "drNote"),
    contractType: pick("contractType", "contract_type")
  };
};
const hasReviewData = (data: Record<string, any>) => Object.values(data).some((value) => value !== undefined && value !== null && value !== "");

// Peer review status badge (matches dashboard colors)
const PeerReviewStatusBadge: React.FC<{
  status: string;
}> = ({
  status
}) => {
  const config: Record<string, {
    label: string;
    className: string;
  }> = {
    submitted: {
      label: "Pending Review",
      className: "bg-[#c4940a] text-white hover:bg-[#c4940a] border-[#c4940a]"
    },
    under_review: {
      label: "In Progress",
      className: "bg-[#9b2c2c] text-white hover:bg-[#9b2c2c] border-[#9b2c2c]"
    },
    approved: {
      label: "Completed",
      className: "bg-[#3d5a47] text-white hover:bg-[#3d5a47] border-[#3d5a47]"
    },
    finalised: {
      label: "Completed",
      className: "bg-[#3d5a47] text-white hover:bg-[#3d5a47] border-[#3d5a47]"
    },
    rejected: {
      label: "Declined",
      className: "bg-[#9b2c2c] text-white hover:bg-[#9b2c2c] border-[#9b2c2c]"
    },
    locked: {
      label: "Locked",
      className: "bg-gray-600 text-white hover:bg-gray-600 border-gray-600"
    }
  };
  const c = config[status] || config.submitted;
  return <Badge className={`${c.className} rounded-full px-4 py-1 font-medium text-xs`}>
      {c.label}
    </Badge>;
};

/* ---------------- Main ---------------- */

const ProposalDetails: React.FC = () => {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    isReviewer1,
    isReviewer2,
    isAnyReviewer
  } = useAuth();
  const {
    reviewers
  } = usePeerReviewers();
  const {
    defaultEmail
  } = useDefaultReviewer();
  const [selectedReviewer, setSelectedReviewer] = useState<string>("");
  const reviewFormRef = useRef<PeerReviewCommentsFormHandle>(null);
  const [documentPreview, setDocumentPreview] = useState<{
    url: string;
    name: string;
    type: "pdf" | "word";
  } | null>(null);
  const [contractViewOpen, setContractViewOpen] = useState(false);
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null);
  const [contractPdfLoading, setContractPdfLoading] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  const [assignNote, setAssignNote] = useState("");
  const [isDeclineDialogOpen, setIsDeclineDialogOpen] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | null>(null);
  const [showingSummary, setShowingSummary] = useState(false);
  const [summaryFormData, setSummaryFormData] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [startedFresh, setStartedFresh] = useState(false);
  const [eventsSheetOpen, setEventsSheetOpen] = useState(false);
  const [decisionReviewerSubmitted, setDecisionReviewerSubmitted] = useState(false);
  const [drActiveTab, setDrActiveTab] = useState<string>("book");
  const [drFeedbackAccordion, setDrFeedbackAccordion] = useState<string | undefined>(undefined);
  const [diffCheckerOpen, setDiffCheckerOpen] = useState(false);
  const [diffCheckerDrData, setDiffCheckerDrData] = useState<Record<string, string>>({});
  const [isLocking, setIsLocking] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [peerReviewerNote, setPeerReviewerNote] = useState("");
  const [isSavingPrNote, setIsSavingPrNote] = useState(false);
  const [prNoteSaved, setPrNoteSaved] = useState(false);
  const [drNoteForAuthor, setDrNoteForAuthor] = useState("");

  // Stable initial assessment for DR split screen — captured once to prevent resets on background refetches
  const drSplitScreenAssessmentRef = useRef<Record<string, any> | null>(null);

  // Resend contract dialog state (after query response)
  const [resendContractOpen, setResendContractOpen] = useState(false);
  const [resendContractType, setResendContractType] = useState("author");
  const [resendContractFields, setResendContractFields] = useState<import("@/components/proposals/ContractFieldsForm").ContractFieldValues | null>(null);
  const [isResendingContract, setIsResendingContract] = useState(false);
  const [pendingQueryResponse, setPendingQueryResponse] = useState<{queryId: number;responseText: string;} | null>(null);
  const [showResendMismatchWarning, setShowResendMismatchWarning] = useState(false);
  const [pendingResendContractType, setPendingResendContractType] = useState<string | null>(null);
  const [includeContract, setIncludeContract] = useState(false);

  // Standalone send contract dialog (after author responds to info request, no contract yet)
  const [standaloneSendContractOpen, setStandaloneSendContractOpen] = useState(false);
  const [standaloneSendContractType, setStandaloneSendContractType] = useState("author");
  const [standaloneSendContractFields, setStandaloneSendContractFields] = useState<import("@/components/proposals/ContractFieldsForm").ContractFieldValues | null>(null);
  const [isSendingStandaloneContract, setIsSendingStandaloneContract] = useState(false);

  /* ---------------- Data ---------------- */

  const {
    data: proposal,
    isLoading,
    error,
    refetch
  } = useProposal(id || "");
  const localId = proposal?.id || "";

  // Set reviewer: prefer already-assigned reviewer, then default, then empty
  // Re-derive whenever proposal assignment data changes
  const assignedEmailsKey = JSON.stringify(
    (proposal as any)?.assigned_reviewer_emails ||
    proposal?.assigned_reviewers?.map((r: any) => r.email) ||
    []
  );
  React.useEffect(() => {
    if (reviewers.length === 0) return;
    const assignedEmails = (proposal as any)?.assigned_reviewer_emails ||
    proposal?.assigned_reviewers?.map((r: any) => r.email) ||
    [];
    const assignedMatch = assignedEmails.length > 0 ?
    reviewers.find((r) => assignedEmails.includes(r.email)) :
    null;

    if (assignedMatch) {
      setSelectedReviewer(assignedMatch.email);
    } else if (!selectedReviewer && defaultEmail) {
      const found = reviewers.find((r) => r.email === defaultEmail);
      if (found) setSelectedReviewer(found.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultEmail, reviewers, assignedEmailsKey]);
  // Fetch peer review data from review API
  const ticketNum = proposal?.ticket_number || id || "";
  const { review: reviewData, refetchReview, saveDraft: saveReviewDraft, submitReview: submitReviewApi, isSubmitting: isReviewSubmitting } = useReview(ticketNum);
  const { latestContract, isLoading: contractLoading } = useContract(ticketNum);
  const { queries: contractQueries, isLoading: queriesLoading, raiseQuery, respondToQuery } = useContractQueries(ticketNum);
  const { infoRequests, pendingRequest: pendingInfoRequest, sendRequest: sendInfoRequest } = useRequestInfo(ticketNum);
  const {
    data: logs = []
  } = useWorkflowLogs(localId);
  const { data: proposalEvents = [], isLoading: eventsLoading } = useProposalEvents(ticketNum);
  const { data: metadataResponse } = useQuery({
    queryKey: ["metadata", ticketNum],
    queryFn: () => metadataApi.get(ticketNum),
    enabled: !!ticketNum,
    staleTime: 0,
    refetchInterval: 5000
  });
  const { data: metadataQueries = [] } = useQuery({
    queryKey: ["metadata-queries", ticketNum],
    queryFn: () => metadataQueriesApi.list(ticketNum),
    enabled: !!ticketNum,
    staleTime: 0,
    refetchInterval: 5000
  });
  const proposedTitle = metadataResponse?.metadata?.title;
  const proposedSubtitle = metadataResponse?.metadata?.subtitle;
  const {
    assignReviewers,
    isAssigning,
    unassignReviewers,
    isUnassigning
  } = useProposalActions(proposal?.ticket_number || id);

  // Extract peer review form data (used for pre-loading peer reviewer's comments)
  const reviewFormData = React.useMemo(() => {
    if (!reviewData) return {};
    const reviews = reviewData.reviews || (reviewData.review ? [reviewData.review] : []);
    const peerReview = reviews.find((r: any) => isPeerReviewerRole(r.reviewer_role)) || reviews[0];
    const reviewObj = peerReview || reviewData;
    const candidate = reviewObj.review_data || reviewObj.data || reviewObj;
    if (candidate && typeof candidate === 'object' && (candidate.scope !== undefined || candidate.recommendation !== undefined)) {
      return candidate;
    }
    return {};
  }, [reviewData]);

  // Extract any existing decision reviewer review/draft from the API response
  const decisionReviewerDraft = React.useMemo(() => {
    if (!reviewData) return null;
    const reviews = reviewData.reviews || (reviewData.review ? [reviewData.review] : []);
    const drReview = reviews.find((r: any) => isDecisionReviewerRole(r.reviewer_role));
    if (!drReview) return null;
    const candidate = drReview.review_data || drReview.data || drReview;
    if (candidate && typeof candidate === 'object' && (candidate.scope !== undefined || candidate.recommendation !== undefined)) {
      return candidate;
    }
    return null;
  }, [reviewData]);

  // Peer review metadata (for reviewer name display, etc.)
  const reviewMeta = React.useMemo(() => {
    if (!reviewData) return {};
    const reviews = reviewData.reviews || (reviewData.review ? [reviewData.review] : []);
    return reviews.find((r: any) => isPeerReviewerRole(r.reviewer_role)) || reviews[0] || reviewData.review || reviewData || {};
  }, [reviewData]);

  // Extract peer reviewer note from review data (for decision reviewer display)
  const peerReviewerNoteFromApi = React.useMemo(() => {
    if (!reviewData) return "";
    const reviews = reviewData.reviews || (reviewData.review ? [reviewData.review] : []);
    const peerReview = reviews.find((r: any) => isPeerReviewerRole(r.reviewer_role)) || reviews[0];
    return peerReview?.note_to_dr || peerReview?.review_data?.note_to_dr || peerReview?.reviewer_note || peerReview?.review_data?.reviewer_note || "";
  }, [reviewData]);

  React.useEffect(() => {
    if (peerReviewerNoteFromApi) {
      setPeerReviewerNote(peerReviewerNoteFromApi);
      setPrNoteSaved(true);
    }
  }, [peerReviewerNoteFromApi]);

  const allReviews = reviewData?.reviews || (reviewData?.review ? [reviewData.review] : []);
  const hasDecisionReviewInApi = allReviews.some((r: any) => isDecisionReviewerRole(r.reviewer_role) && r.is_submitted);
  const hasContractInSystem = !!latestContract;
  const decisionReviewerPostSubmission = isReviewer1 && (
    decisionReviewerSubmitted ||
    statusIs(proposal?.status || "", "contract_issued", "approved", "locked", "awaiting_author_approval", "author_approved", "declined", "rejected", "queries_raised") ||
    hasDecisionReviewInApi ||
    hasContractInSystem
  );
  const drShouldShowFeedback = decisionReviewerPostSubmission;

  // Default to metadata tab when metadata is available (contract signed)
  const isContractSignedEarly = latestContract?.docusign_status === 'completed' || !!latestContract?.docusign_completed_at;

  // Priority: metadata (if contract signed) > feedback (if available) > book
  React.useEffect(() => {
    if (isContractSignedEarly) {
      setDrActiveTab("metadata");
    } else if (drShouldShowFeedback) {
      setDrActiveTab("feedback");
    }
  }, [isContractSignedEarly, drShouldShowFeedback]);

  React.useEffect(() => {
    if (drActiveTab !== "feedback" || !decisionReviewerPostSubmission) return;
    // Auto-open Queries accordion when queries are raised
    if (statusIs(proposal?.status || "", "queries_raised")) {
      setDrFeedbackAccordion("queries");
      // Scroll to queries section after accordion opens
      setTimeout(() => {
        document.querySelector('[data-queries-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } else {
      setDrFeedbackAccordion(hasDecisionReviewInApi ? "final-review" : "peer-review");
    }
  }, [drActiveTab, decisionReviewerPostSubmission, hasDecisionReviewInApi, proposal?.status]);

  /* ---------------- Loading / Error ---------------- */

  if (isLoading) {
    return <DashboardLayout title="Proposal Details">
        <div className="py-20 text-center text-muted-foreground">Loading...</div>
      </DashboardLayout>;
  }
  if (!proposal || error) {
    return <DashboardLayout title="Proposal Details">
        <div className="py-20 text-center space-y-4">
          <p className="text-destructive">Failed to load proposal</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </DashboardLayout>;
  }

  /* ---------------- Derived values ---------------- */

  const files = proposal.file_uploads ? proposal.file_uploads.split(",").map((f: string) => f.trim()) : [];
  const isContractSigned = latestContract?.docusign_status === 'completed' || !!latestContract?.docusign_completed_at;
  const isBusy = isAssigning || isUnassigning;
  const showReviewForm = isReviewer2;

  // Check if peer reviewer already submitted their review
  const reviewStatus = reviewMeta?.is_submitted ? 'submitted' : reviewMeta?.status || reviewMeta?.review_status || '';
  const peerReviewAlreadySubmitted = isReviewer2 && (
  reviewMeta?.is_submitted === true ||
  statusIs(proposal.status, "review_returned", "contract_issued", "approved", "locked"));


  // Check if there's a SUBMITTED peer review available (for decision reviewer split layout)
  const peerReviewEntry = (() => {
    if (!reviewData) return null;
    const reviews = reviewData.reviews || (reviewData.review ? [reviewData.review] : []);
    return reviews.find((r: any) => isPeerReviewerRole(r.reviewer_role)) || reviews[0] || null;
  })();

  const hasSubmittedReview = isReviewer1 && peerReviewEntry != null && peerReviewEntry.is_submitted === true && Object.keys(reviewFormData).length > 0;
  const submittedReview = hasSubmittedReview ? reviewFormData : null;

  const decisionReviewerAlreadySubmitted = isReviewer1 && (
    statusIs(proposal.status, "contract_issued", "approved", "locked", "awaiting_author_approval", "author_approved", "declined", "rejected", "queries_raised") || 
    hasDecisionReviewInApi ||
    hasContractInSystem
  );



  const revertToNew = async () => {
    try {
      await unassignReviewers();
    } catch {
      // DELETE unassign not supported, relying on status change
    }
    setIsRevertDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["reviewer-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["proposals"] });
    queryClient.invalidateQueries({ queryKey: ["proposal", proposal.ticket_number || id] });
  };

  /* ======================== RIGHT PANEL CONTENT ======================== */

  const isPostSubmission = decisionReviewerPostSubmission;

  const rightPanel = <div className="space-y-6">
      {/* Proposal Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground break-words">{proposal.name}</h2>
            {proposal.sub_title && <p className="text-sm sm:text-base text-muted-foreground mt-1 italic">
                {proposal.sub_title}
              </p>}
            {/* Proposed title from metadata (if different from original) */}
            {proposedTitle && proposedTitle !== proposal.name &&
          <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <FileCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="font-medium shrink-0">Proposed Title:</span>
                <span className="font-semibold text-foreground break-words">
                  {proposedTitle}{proposedSubtitle ? `: ${proposedSubtitle}` : ''}
                </span>
              </div>
          }
            {/* Submitted date - shown in post-submission state */}
            {isPostSubmission && proposal.created_at &&
          <p className="text-sm text-muted-foreground mt-1">
                Submitted {format(new Date(proposal.created_at), "MMMM d, yyyy")}
              </p>
          }
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <ProposalStatusBadge status={proposal.status} showIcon={false} />
            {isPostSubmission && proposal.contract_sent_at &&
          <span className="text-sm text-muted-foreground">
                {format(new Date(proposal.contract_sent_at), "do MMMM yyyy")}
              </span>
          }
            
            {isReviewer1 &&
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setEventsSheetOpen(true)} title="View Audit Trail">
                <History className="h-4 w-4" />
              </Button>
          }
          </div>
        </div>
        {/* Author & reviewer info */}
        {isPostSubmission ?
      <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-2 border rounded-full px-3 py-1.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {proposal.corresponding_author_name || proposal.author_name}
              </span>
            </div>
            {isReviewer1 && !statusIs(proposal.status, "locked", "declined", "rejected") && (
              decisionReviewerPostSubmission || 
              hasSubmittedReview || 
              !(statusIs(proposal.status, "new", "submitted", "in_review", "under_review", "awaiting_more_info", "review_returned"))
            ) && (
              <Button variant="outline" onClick={() => setIsDeclineDialogOpen(true)} disabled={isBusy}>
                Decline
              </Button>
            )}
          </div> :

      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <span className="font-medium text-foreground">
              {proposal.corresponding_author_name || proposal.author_name}
            </span>
            {proposal.institution && <>
                <span>•</span>
                <span>{proposal.institution}</span>
              </>}
            {proposal.word_count && <>
                <span>•</span>
                <span>{proposal.word_count} words</span>
              </>}
          </div>
      }
      </div>
      {/* Reviewer + Actions row (for reviewer_1 only, hide once review is returned) */}
      {isReviewer1 && !decisionReviewerPostSubmission && !hasSubmittedReview && !statusIs(proposal.status, "declined", "rejected") && (statusIs(proposal.status, "new", "submitted") || statusIs(proposal.status, "in_review", "under_review") || statusIs(proposal.status, "awaiting_more_info", "review_returned")) && <div className="flex items-center gap-3 flex-wrap">
          {reviewers.length > 0 && <>
              <UserCircle className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
                <SelectTrigger className="w-56 bg-background">
                  <SelectValue placeholder="Select a reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {reviewers.map((reviewer) => <SelectItem key={reviewer.id} value={reviewer.email}>
                      {reviewer.name || reviewer.email.split("@")[0]}
                      {reviewer.email === defaultEmail && " (Default)"}
                      {" "}({reviewer.assigned_proposals_count ?? 0})
                    </SelectItem>)}
                </SelectContent>
              </Select>
            </>}

          {statusIs(proposal.status, "new", "submitted", "review_returned", "awaiting_more_info") && <>
              {statusIs(proposal.status, "new", "submitted") && <Button className="bg-[#3d5a47]" onClick={() => {
          setAssignNote("");
          setIsAssignDialogOpen(true);
        }} disabled={isAssigning}>
                Submit for review
              </Button>}
              <Button variant="outline" className="gap-1.5" onClick={() => navigate(`/proposals/${proposal.ticket_number || id}/request-info`)}>
                <Info className="h-4 w-4" /> Request Info
              </Button>
              {!statusIs(proposal.status, "locked", "declined", "rejected") && (
                <Button variant="outline" onClick={() => setIsDeclineDialogOpen(true)} disabled={isBusy}>
                  Decline
                </Button>
              )}
            </>}

          {/* Submit for Review confirmation dialog with optional note */}
          <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Submit for Review
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to submit this proposal for peer review?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="assign-note" className="text-sm font-medium">
                  Note for Reviewer <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
              id="assign-note"
              placeholder="E.g., Please pay particular attention to the methodology section."
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              className="min-h-[80px] resize-none" />
            
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
              className="bg-[#3d5a47] hover:bg-[#3d5a47]/90"
              onClick={() => {
                if (!selectedReviewer) {
                  toast({ title: "No reviewer selected", description: "Please select a reviewer first.", variant: "destructive" });
                  setIsAssignDialogOpen(false);
                  return;
                }
                assignReviewers(
                  { reviewerEmail: selectedReviewer, note: assignNote.trim() || undefined },
                  { onSuccess: () => setIsAssignDialogOpen(false) }
                );
              }}
              disabled={isAssigning}>
              
                  {isAssigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit for review
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {statusIs(proposal.status, "in_review", "under_review") && (() => {
        const assignedEmails = (proposal as any)?.assigned_reviewer_emails ||
        proposal?.assigned_reviewers?.map((r: any) => r.email || r.reviewer_email) ||
        [];
        const currentAssigned = assignedEmails.filter(Boolean)[0] || "";
        const isSameReviewer = selectedReviewer && selectedReviewer === currentAssigned;
        return <>
          <Button
          className="bg-[#3d5a47]"
          onClick={() => {
            setAssignNote("");
            setIsAssignDialogOpen(true);
          }}
          disabled={isAssigning || !selectedReviewer || !!isSameReviewer}
          title={isSameReviewer ? "Select a different reviewer to reassign" : ""}>
              Reassign
            </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => navigate(`/proposals/${proposal.ticket_number || id}/request-info`)}>
            <Info className="h-4 w-4" /> Request Info
          </Button>
          {!statusIs(proposal.status, "locked", "declined", "rejected") && (
            <Button variant="outline" onClick={() => setIsDeclineDialogOpen(true)} disabled={isBusy}>
              Decline
            </Button>
          )}
        </>;
      })()}
        </div>}
      {/* ============ TABS — ROLE-SPECIFIC ============ */}
      {isReviewer1 ? (/* ---------- DECISION REVIEWER TABS ---------- */
    <Tabs value={drActiveTab} onValueChange={(v) => {setDrActiveTab(v);setDrFeedbackAccordion(undefined);}}>
          <TabsList className={`grid w-full`} style={{ gridTemplateColumns: `repeat(${4 + (isContractSigned ? 1 : 0) + (decisionReviewerPostSubmission ? 1 : 0)}, minmax(0, 1fr))` }}>
            <TabsTrigger value="book" className="relative gap-1.5 text-xs sm:text-sm">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Book info</span>
              
            </TabsTrigger>
            <TabsTrigger value="author" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Author Info</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm">
              <Folder className="h-4 w-4" />
              <span className="hidden sm:inline">Supporting Documents</span>
            </TabsTrigger>
            <TabsTrigger value="ai-assistance" className="gap-1.5 text-xs sm:text-sm">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI Assistance</span>
            </TabsTrigger>
            {decisionReviewerPostSubmission &&
        <TabsTrigger value="feedback" className="relative gap-1.5 text-xs sm:text-sm">
                <FileCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback & Contract</span>
                {(infoRequests.some((r) => r.status === 'responded') && !pendingInfoRequest && !latestContract || contractQueries.some((q) => q.type === 'query' && q.raised_by_role === 'author' && !contractQueries.some((r) => r.type === 'response' && r.parent_query_id === q.id))) &&
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                }
              </TabsTrigger>
        }
            {isContractSigned &&
        <TabsTrigger value="metadata" className="relative gap-1.5 text-xs sm:text-sm">
                <ClipboardList className="h-4 w-4" />
                <span className="hidden sm:inline">Publication Data</span>
                {(statusIs(proposal.status, 'queries_raised') || metadataQueries.some((q) => q.type === 'query' && q.raised_by_role === 'author' && !metadataQueries.some((r) => r.type === 'response' && r.parent_query_id === q.id))) &&
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                }
              </TabsTrigger>
        }
          </TabsList>

          {/* ---- BOOK INFO (Decision Reviewer) ---- */}
          <TabsContent value="book" className="space-y-4 mt-4">
            {/* Info Request Panel (DR view) - only show pending request here */}
            {isReviewer1 && pendingInfoRequest && (
              <InfoRequestPanel
                infoRequests={infoRequests.filter((r) => r.status === 'pending' || r.status === 'open')}
                isLoading={false}
                viewAs="reviewer"
              />
            )}
            {/* Overview Grid */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Overview</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Book Type</p>
                  <p className="text-sm font-medium">{proposal.book_type || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Word Count</p>
                  <p className="text-sm font-medium">{proposal.word_count || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Expected Completion</p>
                  <p className="text-sm font-medium">{proposal.expected_completion_date || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Country</p>
                  <p className="text-sm font-medium">{extractCountry(proposal.address) || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <ProposalStatusBadge status={proposal.status} showIcon={false} />
                </div>
                {proposal.keywords && <div className="col-span-2 sm:col-span-5">
                  <p className="text-xs text-muted-foreground mb-1">Keywords</p>
                  <p className="text-sm font-medium">{proposal.keywords}</p>
                </div>}
              </div>
            </div>


            <Accordion type="multiple" defaultValue={["blurb"]} className="space-y-1">
              <AccordionItem value="blurb" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Blurb</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.short_description || "No blurb available"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              {proposal.detailed_description && <AccordionItem value="detailed-desc" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Detailed Description</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.detailed_description}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              <AccordionItem value="toc" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">TOC</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.table_of_contents || "No table of contents available"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="detail" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Detail: Figures, Tables, Photos
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.figures_tables_count || "No details available"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="permissions" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Permissions Required
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.permissions_required || "No permissions required"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              {proposal.co_authors_editors && <AccordionItem value="coauthors" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Co-Authors / Editors</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.co_authors_editors}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.marketing_info && <AccordionItem value="marketing" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Marketing Information</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.marketing_info}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.referees_reviewers && <AccordionItem value="referees" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Suggested Referees / Reviewers</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.referees_reviewers}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.under_review_elsewhere && <AccordionItem value="under-review" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Under Review Elsewhere</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.under_review_elsewhere}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.additional_info && <AccordionItem value="additional" className="border rounded-lg px-4">
                  <AccordionTrigger className="text-base font-semibold">
                    Additional Information
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {proposal.additional_info}
                    </p>
                  </AccordionContent>
                </AccordionItem>}
            </Accordion>
          </TabsContent>

          {/* ---- AUTHOR INFO (Decision Reviewer) ---- */}
          <TabsContent value="author" className="space-y-6 mt-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold">
                {proposal.corresponding_author_name || proposal.author_name || "N/A"}
              </h3>
              <Badge className="bg-[#3d5a47] text-white text-xs rounded-md uppercase tracking-wide hover:bg-[#3d5a47]">
                Author
              </Badge>
            </div>
            <div className="space-y-4">
              <h4 className="text-base font-medium">Contact Information</h4>
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
                <DetailRow label="Email" value={proposal.author_email || (proposal as any).email} />
                <DetailRow label="Institution" value={proposal.institution} />
                <DetailRow label="Job Title" value={proposal.job_title} />
                <DetailRow label="Country" value={extractCountry(proposal.address)} />
                {proposal.secondary_email && proposal.secondary_email !== proposal.author_email && <DetailRow label="Secondary Email" value={proposal.secondary_email} />}
                <DetailRow label="Address" value={proposal.address} />
              </div>
            </div>
            {proposal.biography && <div className="space-y-3">
                <h4 className="text-base font-medium">Biography</h4>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {proposal.biography}
                </p>
              </div>}
          </TabsContent>

          {/* ---- METADATA (Decision Reviewer - only after contract signed) ---- */}
          {isContractSigned &&
      <TabsContent value="metadata" className="mt-4 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Publication Data</h2>
                {isReviewer1 && statusIs(proposal.status, 'author_approved') &&
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-gray-600 text-gray-700 hover:bg-gray-100"
            onClick={() => setLockConfirmOpen(true)}
            disabled={isLocking}>
            
                    {isLocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Lock
                  </Button>
          }
              </div>
              <PublicationMetadata proposal={proposal} contractSigned ticketNumber={ticketNum} />
            </TabsContent>
      }


          {/* ---- SUPPORTING DOCUMENTS (Decision Reviewer) ---- */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Supporting Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Collect document files from info request responses
                  const DOCUMENT_KEYS = new Set(["cv", "sample_chapter", "toc_doc", "permissions_docs"]);
                  const infoDocFiles: { url: string; label: string }[] = [];
                  infoRequests
                    .filter((r) => r.status === "responded" && r.draft_data)
                    .forEach((r) => {
                      Object.entries(r.draft_data || {}).forEach(([key, value]) => {
                        if (DOCUMENT_KEYS.has(key) && typeof value === "string" && value.startsWith("http")) {
                          infoDocFiles.push({ url: value, label: key.replace(/_/g, " ") });
                        }
                      });
                    });

                  const allFiles = [
                    ...files.map((url: string) => ({ url, label: "" })),
                    ...infoDocFiles,
                  ];

                  if (allFiles.length === 0) return <p className="text-sm text-muted-foreground">No files uploaded</p>;

                  return (
                    <div className="space-y-3">
                      {allFiles.map((file, i) => {
                        const name = decodeURIComponent(file.url.split("/").pop() || "File").replace(/^[a-z_]+_\d{14}_/, "");
                        const isPdf = file.url.endsWith(".pdf");
                        const isWord = file.url.endsWith(".doc") || file.url.endsWith(".docx");
                        return (
                          <div key={i} className="flex justify-between items-center border rounded-md px-3 py-2">
                            <div className="flex gap-2 items-center min-w-0">
                              <FileText className="h-4 w-4 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm truncate">{name}</p>
                                {file.label && (
                                  <p className="text-xs text-muted-foreground capitalize">{file.label} — via info request</p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {(isPdf || isWord) && (
                                <Button size="icon" variant="ghost" onClick={() => setDocumentPreview({
                                  url: file.url,
                                  name,
                                  type: isPdf ? "pdf" : "word"
                                })}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" asChild>
                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- AI ASSISTANCE (Decision Reviewer) ---- */}
          <TabsContent value="ai-assistance" className="mt-4">
            <AiAssistanceSplitView proposal={proposal} ticketNumber={ticketNum} />
          </TabsContent>



          {/* ---- FEEDBACK & CONTRACT (Decision Reviewer) ---- */}
          <TabsContent value="feedback" className="mt-4 space-y-4">
            {/* Info Request History & Author Response Actions */}
            {isReviewer1 && infoRequests.length > 0 && (
              <div className="space-y-4">
                {/* Pending info request (awaiting author) */}
                {pendingInfoRequest && (
                  <InfoRequestPanel
                    infoRequests={infoRequests.filter((r) => r.status === 'pending' || r.status === 'open')}
                    isLoading={false}
                    viewAs="reviewer"
                  />
                )}

                {/* Previous Rounds history */}
                <InfoRequestPanel
                  infoRequests={infoRequests.filter((r) => r.status !== 'pending' && r.status !== 'open')}
                  isLoading={false}
                  viewAs="reviewer"
                />
              </div>
            )}
            {(() => {
          const allReviews = reviewData?.reviews || (reviewData?.review ? [reviewData.review] : []);
          const peerReview = allReviews.find((r: any) => isPeerReviewerRole(r.reviewer_role));
          const decisionReview = allReviews.find((r: any) => isDecisionReviewerRole(r.reviewer_role));
          const peerReviewData = normalizeReviewData(peerReview?.review_data || peerReview?.data || peerReview);
          const decisionReviewData = normalizeReviewData(decisionReview?.review_data || decisionReview?.data || decisionReview);

          const reviewFields = [
          { label: "Scope", key: "scope" },
          { label: "Purpose and Value", key: "purposeAndValue" },
          { label: "Title", key: "title" },
          { label: "Originality and Points of Difference", key: "originality" },
          { label: "Credibility", key: "credibility" },
          { label: "Structure", key: "structure" },
          { label: "Clarity, Structure and Quality of Writing", key: "clarity" },
          { label: "Other Comments", key: "otherComments" },
          { label: "Red Flags", key: "redFlags" }];


          const renderReviewFields = (data: Record<string, any>) =>
          <div className="space-y-4">
                  {reviewFields.map(({ label, key }) => {
              const value = data[key];
              if (!value) return null;
              return (
                <div key={key} className="space-y-1">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{value}</p>
                        <Separator />
                      </div>);

            })}
                  {data.recommendation &&
            <div className="border border-muted rounded-lg p-4 mt-2">
                      <p className="text-sm font-semibold">Final Recommendation</p>
                      <p className="text-sm font-medium mt-1 capitalize">
                        {data.recommendation.replace(/_/g, " ")}
                      </p>
                    </div>
            }
                  {data.dr_note?.trim?.() && (
            <div className="bg-primary/5 border border-primary/20 rounded-md p-4 mt-2 space-y-1">
                      <p className="text-sm font-semibold text-foreground">Note for Author</p>
                      <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{data.dr_note}</p>
                    </div>
            )}
                </div>;


          return (
            <Accordion type="single" collapsible value={drFeedbackAccordion} onValueChange={setDrFeedbackAccordion} className="space-y-2">
                  {/* Original Peer Review Feedback */}
                  <AccordionItem value="peer-review" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="text-left">
                        <p className="text-base font-semibold">Original Peer Review Feedback</p>
                        {peerReview &&
                    <p className="text-sm text-muted-foreground font-normal mt-0.5">
                            {peerReview.reviewer_name || peerReview.reviewer_email || "Peer Reviewer"}
                            {peerReviewData.recommendation && ` • ${peerReviewData.recommendation.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`}
                          </p>
                    }
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      {hasReviewData(peerReviewData) ? renderReviewFields(peerReviewData) :
                  <p className="text-sm text-muted-foreground">No peer review feedback available yet.</p>
                  }
                    </AccordionContent>
                  </AccordionItem>

                  {/* Final Review Feedback (Decision Reviewer) */}
                  <AccordionItem value="final-review" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="text-left">
                        <p className="text-base font-semibold">Final Peer Review Feedback</p>
                        {decisionReview &&
                    <p className="text-sm text-muted-foreground font-normal mt-0.5">
                            {decisionReview.reviewer_name || decisionReview.reviewer_email || "Decision Reviewer"}
                            {decisionReviewData.recommendation && ` • ${decisionReviewData.recommendation.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`}
                          </p>
                    }
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      {hasReviewData(decisionReviewData) ?
                  <div className="space-y-4">
                          {renderReviewFields(decisionReviewData)}
                          {decisionReviewData.contractType &&
                    <>
                              <Separator />
                              <div className="border border-muted rounded-lg p-4">
                                <p className="text-sm font-semibold">Contract Type Issued</p>
                                <p className="text-sm font-medium mt-1 capitalize">
                                  {decisionReviewData.contractType === "editor" ? "Editor Contract" : "Author Contract"}
                                </p>
                              </div>
                            </>
                    }
                        </div> :

                  <p className="text-sm text-muted-foreground">No final review feedback available yet.</p>
                  }
                    </AccordionContent>
                  </AccordionItem>

                  {/* Publishing Contract */}
                  <AccordionItem value="contract" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="text-left">
                        <p className="text-base font-semibold">Publishing Contract</p>
                        {contractLoading && <p className="text-sm text-muted-foreground font-normal mt-0.5">Loading…</p>}
                        {latestContract &&
                    <p className="text-sm text-muted-foreground font-normal mt-0.5">
                            Status: <span className="capitalize">{(latestContract.status || latestContract.docusign_status || 'unknown').replace(/_/g, ' ')}</span>
                            {latestContract.contract_type && ` • ${latestContract.contract_type === 'editor' ? 'Editor' : 'Author'} Contract`}
                          </p>
                    }
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      {contractLoading ?
                  <div className="flex items-center gap-2 py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Loading contract details…</span>
                        </div> :
                  !latestContract ?
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">No contract has been sent for this proposal.</p>
                    {infoRequests.some((r) => r.status === 'responded') && (
                      <div className="flex items-center gap-3">
                        <Button
                          className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white gap-2"
                          onClick={() => {
                            const ct = getDefaultContractType(proposal?.book_type);
                            setStandaloneSendContractType(ct);
                            setStandaloneSendContractFields(getDefaultContractFields(ct, proposedTitle || proposal?.name || '', proposedSubtitle || proposal?.sub_title || ''));
                            setStandaloneSendContractOpen(true);
                          }}
                        >
                          <Send className="h-4 w-4" /> Send Contract
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => navigate(`/proposals/${ticketNum}/request-info`)}
                        >
                          <Info className="h-4 w-4" /> Request More Info
                        </Button>
                      </div>
                    )}
                  </div> :

                  <div className="space-y-4">
                          {/* Contract info grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Status</p>
                              <p className="text-sm font-medium capitalize">{(latestContract.status || latestContract.docusign_status || '—').replace(/_/g, ' ')}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Contract Type</p>
                              <p className="text-sm font-medium capitalize">{(latestContract.contract_type || '—').replace(/_/g, ' ')}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Version</p>
                              <p className="text-sm font-medium">{latestContract.contract_version || 1}</p>
                            </div>
                            {latestContract.recipient_name &&
                      <div>
                                <p className="text-xs text-muted-foreground">Recipient</p>
                                <p className="text-sm font-medium">{latestContract.recipient_name}</p>
                              </div>
                      }
                            {latestContract.recipient_email &&
                      <div>
                                <p className="text-xs text-muted-foreground">Recipient Email</p>
                                <p className="text-sm font-medium">{latestContract.recipient_email}</p>
                              </div>
                      }
                            {latestContract.docusign_sent_at &&
                      <div>
                                <p className="text-xs text-muted-foreground">Sent</p>
                                <p className="text-sm font-medium">{format(new Date(latestContract.docusign_sent_at), "MMM d, yyyy 'at' h:mm a")}</p>
                              </div>
                      }
                            {latestContract.docusign_completed_at &&
                      <div>
                                <p className="text-xs text-muted-foreground">Completed</p>
                                <p className="text-sm font-medium">{format(new Date(latestContract.docusign_completed_at), "MMM d, yyyy 'at' h:mm a")}</p>
                              </div>
                      }
                            {latestContract.docusign_declined_at &&
                      <div>
                                <p className="text-xs text-muted-foreground">Declined</p>
                                <p className="text-sm font-medium">{format(new Date(latestContract.docusign_declined_at), "MMM d, yyyy 'at' h:mm a")}</p>
                              </div>
                      }
                          </div>

                          {latestContract.docusign_decline_reason &&
                    <div className="border border-destructive/30 bg-destructive/5 rounded-md p-4">
                              <p className="text-sm font-semibold text-destructive">Decline Reason</p>
                              <p className="text-sm text-foreground/80 mt-1">{latestContract.docusign_decline_reason}</p>
                            </div>
                    }

                          {/* View document button */}
                          <Button
                      variant="outline"
                      className="gap-2"
                      onClick={async () => {
                        setContractViewOpen(true);
                        setContractPdfLoading(true);
                        try {
                          const url = await contractApi.getDocumentBlob(proposal.ticket_number || id || '');
                          setContractPdfUrl(url);
                        } catch {setContractPdfUrl(null);} finally
                        {setContractPdfLoading(false);}
                      }}>
                      
                            <Eye className="h-4 w-4" /> View Contract Document
                          </Button>
                        </div>
                  }
                    </AccordionContent>
                  </AccordionItem>

                  {/* Contract Queries */}
                  <AccordionItem value="queries" className="border rounded-lg px-4" data-queries-section>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="text-left">
                        <p className="text-base font-semibold">
                          Queries
                          {contractQueries.length > 0 &&
                      <span className="ml-2 text-sm font-normal text-muted-foreground">({contractQueries.length})</span>
                      }
                        </p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <ContractQueryThread
                    queries={contractQueries}
                    isLoading={queriesLoading}
                    viewAs="reviewer"
                    proposalStatus={proposal.status}
                    onSend={async (text, _category, queryId) => {
                      // Store pending response — don't send yet, wait for contract dialog
                      setPendingQueryResponse({ queryId: queryId!, responseText: text });
                      const ct = latestContract?.contract_type || getDefaultContractType(proposal?.book_type);
                      setResendContractFields(getDefaultContractFields(ct, proposedTitle || latestContract?.title || proposal?.name || '', proposedSubtitle || latestContract?.subtitle || proposal?.sub_title || ''));
                      setResendContractType(ct);
                      setResendContractOpen(true);
                    }}
                    isSending={respondToQuery.isPending} />
                  
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>);

        })()}
          </TabsContent>
        </Tabs>) : (/* ---------- PEER REVIEWER TABS ---------- */
    <Tabs defaultValue="book">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="book" className="gap-1.5 text-xs sm:text-sm">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Book Info</span>
            </TabsTrigger>
            <TabsTrigger value="author" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Author Info</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm">
              <Folder className="h-4 w-4" />
              <span className="hidden sm:inline">Supporting Documents</span>
            </TabsTrigger>
          </TabsList>

          {/* ---- BOOK INFO (Peer Reviewer) ---- */}
          <TabsContent value="book" className="space-y-2 mt-4">
            <Accordion type="multiple" defaultValue={["overview"]} className="space-y-1">
              <AccordionItem value="overview" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Proposal Overview
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pb-4">
                  <DetailRow label="Type of Book" value={proposal.book_type} />
                  <DetailRow label="Main Title" value={proposal.name} />
                  <DetailRow label="Subtitle" value={proposal.sub_title} />
                  <DetailRow label="Completion Date" value={proposal.expected_completion_date} />
                  <DetailRow label="Word Count" value={proposal.word_count} />
                  <DetailRow label="Keywords" value={proposal.keywords} />
                  <ContentBlock label="Blurb" value={proposal.short_description} />
                </AccordionContent>
              </AccordionItem>

              {proposal.detailed_description && <AccordionItem value="detailed-desc" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Detailed Description</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.detailed_description}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              <AccordionItem value="toc" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Table of Contents
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="bg-muted/30 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-line">
                    {proposal.table_of_contents || "No table of contents available"}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="detail" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Detail: Figures, Tables, Photos
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.figures_tables_count || "No details available"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="permissions" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Permissions Required
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.permissions_required || "No permissions required"}
                  </p>
                </AccordionContent>
              </AccordionItem>

              {proposal.co_authors_editors && <AccordionItem value="coauthors" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Co-Authors / Editors</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.co_authors_editors}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.marketing_info && <AccordionItem value="marketing" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Marketing Information</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.marketing_info}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.referees_reviewers && <AccordionItem value="referees" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Suggested Referees / Reviewers</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.referees_reviewers}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.under_review_elsewhere && <AccordionItem value="under-review" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">Under Review Elsewhere</AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.under_review_elsewhere}
                  </p>
                </AccordionContent>
              </AccordionItem>}

              {proposal.additional_info && <AccordionItem value="additional" className="border rounded-lg px-4">
                <AccordionTrigger className="text-base font-semibold">
                  Additional Information
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {proposal.additional_info}
                  </p>
                </AccordionContent>
              </AccordionItem>}
            </Accordion>

          </TabsContent>

          {/* ---- AUTHOR INFO (Peer Reviewer) ---- */}
          <TabsContent value="author" className="space-y-6 mt-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold">
                {proposal.corresponding_author_name || proposal.author_name || "N/A"}
              </h3>
              <Badge className="bg-[#3d5a47] text-white text-xs rounded-md uppercase tracking-wide hover:bg-[#3d5a47]">
                Author
              </Badge>
            </div>
            <div className="space-y-4">
              <h4 className="text-base font-medium">Contact Information</h4>
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
                <DetailRow label="Email" value={proposal.author_email || (proposal as any).email} />
                <DetailRow label="Institution" value={proposal.institution} />
                <DetailRow label="Job Title" value={proposal.job_title} />
                <DetailRow label="Country" value={extractCountry(proposal.address)} />
                {proposal.secondary_email && proposal.secondary_email !== proposal.author_email && <DetailRow label="Secondary Email" value={proposal.secondary_email} />}
                <DetailRow label="Address" value={proposal.address} />
              </div>
            </div>
            {proposal.biography && <div className="space-y-3">
                <h4 className="text-base font-medium">Biography</h4>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {proposal.biography}
                </p>
              </div>}
          </TabsContent>

          {/* ---- SUPPORTING DOCUMENTS (Peer Reviewer) ---- */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Supporting Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const DOCUMENT_KEYS = new Set(["cv", "sample_chapter", "toc_doc", "permissions_docs"]);
                  const infoDocFiles: { url: string; label: string }[] = [];
                  infoRequests
                    .filter((r) => r.status === "responded" && r.draft_data)
                    .forEach((r) => {
                      Object.entries(r.draft_data || {}).forEach(([key, value]) => {
                        if (DOCUMENT_KEYS.has(key) && typeof value === "string" && value.startsWith("http")) {
                          infoDocFiles.push({ url: value, label: key.replace(/_/g, " ") });
                        }
                      });
                    });

                  const allFiles = [
                    ...files.map((url: string) => ({ url, label: "" })),
                    ...infoDocFiles,
                  ];

                  if (allFiles.length === 0) return <p className="text-sm text-muted-foreground">No files uploaded</p>;

                  return (
                    <div className="space-y-3">
                      {allFiles.map((file, i) => {
                        const name = decodeURIComponent(file.url.split("/").pop() || "File").replace(/^[a-z_]+_\d{14}_/, "");
                        const isPdf = file.url.endsWith(".pdf");
                        const isWord = file.url.endsWith(".doc") || file.url.endsWith(".docx");
                        return <div key={i} className="flex justify-between items-center border rounded-md px-3 py-2">
                            <div className="flex gap-2 items-center min-w-0">
                              <FileText className="h-4 w-4 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm truncate">{name}</p>
                                {file.label && (
                                  <p className="text-xs text-muted-foreground capitalize">{file.label} — via info request</p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {(isPdf || isWord) && <Button size="icon" variant="ghost" onClick={() => setDocumentPreview({
                          url: file.url,
                          name,
                          type: isPdf ? "pdf" : "word"
                        })}>
                                  <Eye className="h-4 w-4" />
                                </Button>}
                              <Button size="icon" variant="ghost" asChild>
                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>;
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>


        </Tabs>)}
      {/* Events Audit Trail Sheet */}
      {isReviewer1 &&
    <Sheet open={eventsSheetOpen} onOpenChange={setEventsSheetOpen}>
          <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Audit Trail
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              {eventsLoading ?
          <div className="flex items-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading events…</span>
                </div> :
          proposalEvents.length === 0 ?
          <p className="text-sm text-muted-foreground">No events recorded yet.</p> :

          <div className="space-y-5">
                  {proposalEvents.map((evt, index) =>
            <div key={evt.id} className="relative flex items-start gap-3">
                      {/* Timeline line */}
                      {index < proposalEvents.length - 1 &&
              <div className="absolute left-[5px] top-5 bottom-0 w-px bg-border" style={{ height: 'calc(100% + 12px)' }} />
              }
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 z-10 ${
              evt.event_type === 'status_change' ? 'bg-[#2563eb]' :
              evt.event_type === 'assignment' ? 'bg-[#3d5a47]' :
              'bg-muted-foreground'}`
              } />
                      <div className="flex-1 min-w-0 pb-1">
                        <p className="text-sm font-medium">{evt.description}</p>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5">
                          <span>{format(new Date(evt.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                          {evt.changed_by &&
                  <>
                              <span>•</span>
                              <span>{evt.changed_by}</span>
                            </>
                  }
                          {evt.changed_by_role &&
                  <>
                              <span>•</span>
                              <span className="capitalize">{evt.changed_by_role.replace(/_/g, ' ')}</span>
                            </>
                  }
                        </div>
                        {(evt.old_status || evt.new_status) &&
                <div className="flex items-center gap-2 mt-1.5">
                            {evt.old_status &&
                  <Badge variant="outline" className="text-xs capitalize">{evt.old_status.replace(/_/g, ' ')}</Badge>
                  }
                            {evt.old_status && evt.new_status &&
                  <span className="text-xs text-muted-foreground">→</span>
                  }
                            {evt.new_status &&
                  <Badge className="text-xs capitalize bg-[#3d5a47] hover:bg-[#3d5a47]">{evt.new_status.replace(/_/g, ' ')}</Badge>
                  }
                          </div>
                }
                      </div>
                    </div>
            )}
                </div>
          }
            </div>
          </SheetContent>
        </Sheet>
    }
    </div>;

  /* ======================== RENDER ======================== */

  return <DashboardLayout title="Proposal Details">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate("/proposals")} className="inline-flex items-center gap-1 text-sm text-[#3d5a47] hover:text-[#2d4a37] hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {isReviewer1 ? "Back to Home" : "Back to Dashboard"}
        </button>

        {(showReviewForm || hasSubmittedReview) && !showingSummary && !peerReviewAlreadySubmitted && !decisionReviewerPostSubmission && <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => reviewFormRef.current?.saveDraft()} disabled={reviewFormRef.current?.isSaving}>
              Save Draft
            </Button>
            {showReviewForm ?
        <Button className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white" onClick={() => {
          const ref = reviewFormRef.current;
          if (ref) {
            setSummaryFormData({ ...ref.formData });
            setShowingSummary(true);
          }
        }} disabled={reviewFormRef.current?.isSaving}>
                Submit Review
              </Button> :

        <Button className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white" onClick={() => {
          const ref = reviewFormRef.current;
          if (ref) {
            setSummaryFormData({ ...ref.formData });
            setShowingSummary(true);
          }
        }} disabled={reviewFormRef.current?.isSaving}>
                Submit Review
              </Button>
        }
          </div>}
      </div>

      {/* Two-Panel, Summary, or Single-Panel Layout */}
      {showReviewForm ?
    peerReviewAlreadySubmitted ?
    <div className="grid grid-cols-2 gap-0 items-start" style={{ height: 'calc(100vh - 140px)' }}>
            <div className="pr-6 overflow-y-auto h-full scrollbar-thin">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-[#3d5a47]" />
                  <h2 className="text-2xl font-bold text-foreground">Review Submitted</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your peer review has been submitted and is now awaiting authorization. Below is a read-only copy of your submission.
                </p>
                <Separator />
                {/* Read-only review fields */}
                {(() => {
            const reviewFields = [
            { label: "Scope", key: "scope" },
            { label: "Purpose and Value", key: "purposeAndValue" },
            { label: "Title", key: "title" },
            { label: "Originality and Points of Difference", key: "originality" },
            { label: "Credibility", key: "credibility" },
            { label: "Structure", key: "structure" },
            { label: "Clarity, Structure and Quality of Writing", key: "clarity" },
            { label: "Other Comments", key: "otherComments" },
            { label: "Red Flags", key: "redFlags" }];

            return (
              <div className="space-y-5">
                      {reviewFields.map(({ label, key }) => {
                  const value = reviewFormData[key];
                  if (!value) return null;
                  return (
                    <div key={key} className="space-y-1.5">
                            <p className="text-sm font-semibold">{label}</p>
                            <div className="bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-line rounded-md border">
                              {value}
                            </div>
                          </div>);

                })}
                      {reviewFormData.recommendation &&
                <div className="space-y-1.5">
                          <p className="text-sm font-semibold">Final Recommendation</p>
                          <Badge className={`rounded-full px-4 py-1 text-sm ${
                  reviewFormData.recommendation === 'proceed' ? 'bg-[#3d5a47] text-white hover:bg-[#3d5a47]' :
                  reviewFormData.recommendation === 'reject' ? 'bg-foreground text-background hover:bg-foreground' :
                  reviewFormData.recommendation === 'minor_revision' ? 'bg-[#c4940a] text-white hover:bg-[#c4940a]' :
                  'bg-[#9b2c2c] text-white hover:bg-[#9b2c2c]'}`
                  }>
                            {reviewFormData.recommendation.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </Badge>
                        </div>
                }
                    </div>);

          })()}
              {peerReviewerNote && (
                <Card className="bg-muted/30 mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <StickyNote className="h-4 w-4" />
                      Your Note for Decision Reviewer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{peerReviewerNote}</p>
                  </CardContent>
                </Card>
              )}
              </div>
            </div>
            <div className="pl-6 overflow-y-auto h-full scrollbar-thin">
              <h2 className="text-2xl font-bold text-foreground mb-6">Proposal Details</h2>
              {rightPanel}
            </div>
          </div> :
    showingSummary ?
    <PeerReviewSummary
      proposal={proposal}
      formData={summaryFormData}
      onGoBack={() => setShowingSummary(false)}
      onConfirmSubmit={async () => {
        if (!summaryFormData.recommendation) {
          toast({ variant: 'destructive', title: 'Recommendation Required', description: 'Please select a Final Recommendation before submitting.' });
          return;
        }
        setIsConfirming(true);
        try {
          await submitReviewApi({
            ...summaryFormData,
            ...(peerReviewerNote ? { note_to_dr: peerReviewerNote } : {}),
          });

          queryClient.invalidateQueries({ queryKey: ["proposals"] });
          queryClient.invalidateQueries({ queryKey: ["review", ticketNum] });
          navigate('/proposals');
        } catch (err) {
          console.error('Submit failed:', err);
        } finally {
          setIsConfirming(false);
        }
      }}
      reviewerNote={peerReviewerNote}
      onReviewerNoteChange={setPeerReviewerNote}
      isSubmitting={isConfirming} /> :


    <div className="grid grid-cols-2 gap-0 items-start" style={{ height: 'calc(100vh - 140px)' }}>
            <div className="pl-6 pr-6 overflow-y-auto h-full scrollbar-thin">
            <PeerReviewCommentsForm ref={reviewFormRef} proposal={proposal} existingAssessment={reviewFormData as Record<string, any> | undefined} onSave={() => refetch()} onSubmitReview={(data) => {setSummaryFormData(data);setShowingSummary(true);}} onDraftSaved={() => {
          if (statusIs(proposal.status, "pending", "new", "submitted")) {
            // Status transitions managed by backend
          }}} />
            </div>
            <div className="pl-6 overflow-y-auto h-full scrollbar-thin">
              <h2 className="text-2xl font-bold text-foreground mb-6">Proposal Details</h2>
              {rightPanel}
            </div>
          </div> : hasSubmittedReview ?
    decisionReviewerPostSubmission ?
    <div>{rightPanel}</div> :
    showingSummary ?
    <PeerReviewSummary
      proposal={proposal}
      formData={summaryFormData}
      onGoBack={() => setShowingSummary(false)}
      showContractSection
      onConfirmSubmit={async (sendContract, contractType, contractTitle, contractSubtitle, revisionItems, contractFields) => {
        if (!summaryFormData.recommendation) {
          toast({ variant: 'destructive', title: 'Recommendation Required', description: 'Please select a Final Recommendation before submitting.' });
          return;
        }
        setIsConfirming(true);
        try {
          const formToApiMap: Record<string, string> = {
            scope: 'scope',
            purposeAndValue: 'purpose_value',
            title: 'title',
            originality: 'originality',
            credibility: 'credibility',
            structure: 'structure',
            clarity: 'clarity_quality',
            otherComments: 'other_comments',
            redFlags: 'red_flags',
            recommendation: 'recommendation'
          };
          const apiPayload: Record<string, any> = {};
          for (const [formKey, apiKey] of Object.entries(formToApiMap)) {
            if (summaryFormData[formKey] !== undefined && summaryFormData[formKey] !== '') {
              apiPayload[apiKey] = summaryFormData[formKey];
            }
          }
          // Include dr_note if provided
          if (drNoteForAuthor.trim()) {
            apiPayload.dr_note = drNoteForAuthor.trim();
          }
          // Step 1: Submit the review (without contract fields)
          await submitReviewApi(apiPayload);

          // Step 2: If contract should be sent, call separate contract/send API
          if (sendContract) {
            try {
              await proposalApi.sendContract(
                ticketNum,
                buildContractSendPayload(contractFields || {
                  contractType: contractType || 'author',
                  title: contractTitle || proposal?.name || '',
                  subtitle: contractSubtitle || proposal?.sub_title || '',
                })
              );
              toast({
                title: 'Contract Sent',
                description: 'The contract has been sent to the author.'
              });
            } catch (contractErr: any) {
              console.error('Contract send failed:', contractErr);
              toast({
                variant: 'destructive',
                title: 'Contract Send Failed',
                description: contractErr?.response?.data?.error || contractErr.message || 'Failed to send contract. Please try again.'
              });
            }
          }

          // Step 3: If revision items provided (major revision without contract), send request-info
          if (revisionItems && revisionItems.length > 0) {
            try {
              await requestInfoApi.request(ticketNum, { items: revisionItems });
            } catch (revErr: any) {
              console.error('Request info failed:', revErr);
              toast({
                variant: 'destructive',
                title: 'Field Revision Request Failed',
                description: revErr?.message || 'Failed to send field revision request.',
              });
            }
          }

          queryClient.invalidateQueries({ queryKey: ["proposals"] });
          queryClient.invalidateQueries({ queryKey: ["review", ticketNum] });
          queryClient.invalidateQueries({ queryKey: ["proposal", ticketNum] });
          queryClient.invalidateQueries({ queryKey: ["contract", ticketNum] });
          setDecisionReviewerSubmitted(true);
          setShowingSummary(false);
        } catch (err) {
          console.error('Submit failed:', err);
        } finally {
          setIsConfirming(false);
        }
      }}
      drNote={drNoteForAuthor}
      onDrNoteChange={setDrNoteForAuthor}
      isSubmitting={isConfirming} /> :


    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 items-start lg:h-[calc(100vh-140px)]">
           <div className="pr-0 lg:pr-6 overflow-y-auto lg:h-full scrollbar-thin">
            {/* Start Fresh button + info banner for decision reviewer */}
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">Peer review comments</h2>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
              variant="outline"
              className="text-[#2563eb] border-[#2563eb] hover:bg-[#2563eb]/10"
              onClick={() => {
                // Snapshot saved form data when opening diff checker
                setDiffCheckerDrData({ ...(reviewFormRef.current?.formData || {}) });
                setDiffCheckerOpen(true);
              }}>
              
                  <GitCompareArrows className="h-4 w-4 mr-2" />
                  Diff Checker
                </Button>
              </div>
              <div className="border border-[#c4940a]/40 bg-[#c4940a]/5 rounded-lg p-4 flex gap-3">
                <div className="shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#c4940a]" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">{reviewMeta?.reviewer_name || "Peer Reviewer"}'s Comments Pre-loaded</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    The form below contains {reviewMeta?.reviewer_name || "Peer Reviewer"}'s comments in <span className="text-destructive font-medium">red text</span>.
                    You can edit any field directly.
                  </p>
                </div>
              </div>
            </div>

             {(() => {
              // Capture initial assessment once so background refetches don't reset the form
              if (!drSplitScreenAssessmentRef.current) {
                drSplitScreenAssessmentRef.current = decisionReviewerDraft || reviewFormData || {};
              }
              const stableAssessment = drSplitScreenAssessmentRef.current;
              const showPreloaded = !decisionReviewerDraft || drSplitScreenAssessmentRef.current === reviewFormData;
              return (
                <PeerReviewCommentsForm
                  ref={reviewFormRef}
                  proposal={proposal}
                  existingAssessment={stableAssessment}
                  quietDraftSave
                  forceEditable
                  hideHeader
                  preloadedStyle={showPreloaded}
                  peerReviewerNote={peerReviewerNoteFromApi}
                  peerReviewerName={reviewMeta?.reviewer_name || reviewMeta?.reviewer_email || "Peer Reviewer"}
                  onSave={() => {}}
                  onSubmitReview={(data) => {setSummaryFormData(data);setShowingSummary(true);}}
                  onDraftSaved={() => {}} />
              );
             })()}

        
          </div>
          <div className="pl-0 lg:pl-6 overflow-y-auto lg:h-full scrollbar-thin mt-6 lg:mt-0">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-6">Proposal Details</h2>
            {rightPanel}
          </div>
        </div> :

    <div>{rightPanel}</div>}

      {/* Dialogs */}
      <DocumentPreviewDialog open={!!documentPreview} onOpenChange={(o) => !o && setDocumentPreview(null)} documentUrl={documentPreview?.url || ""} fileName={documentPreview?.name || ""} fileType={documentPreview?.type || "pdf"} />

      <ContractPdfViewerDialog
      open={contractViewOpen}
      onOpenChange={(open) => {
        setContractViewOpen(open);
        if (!open) setContractPdfUrl(null);
      }}
      documentDataUrl={contractPdfUrl}
      isLoading={contractPdfLoading}
      downloadUrl={contractPdfUrl || undefined}
      downloadFileName={`${ticketNum || "contract"}.pdf`} />
    


      <DeclineProposalDialog open={isDeclineDialogOpen} onOpenChange={(open) => { if (!isDeclining) setIsDeclineDialogOpen(open); }} onConfirm={async () => {
      if (isDeclining) return;
      setIsDeclining(true);
      try {
        const ticketNum = proposal.ticket_number || id;
        await proposalApi.decline(ticketNum!);
        setIsDeclineDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["proposals"] });
        queryClient.invalidateQueries({ queryKey: ["proposal", ticketNum] });
        toast({ title: "Proposal Declined", description: "The proposal has been declined and the author has been notified." });
      } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to Decline", description: error?.message || "An error occurred while declining the proposal." });
      } finally {
        setIsDeclining(false);
      }
    }} isLoading={isDeclining} />

      {/* Lock Proposal Confirmation Dialog */}
      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Lock Proposal
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will generate all production files and lock the proposal. This action cannot be undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
            disabled={isLocking}
            onClick={async (e) => {
              e.preventDefault();
              setIsLocking(true);
              try {
                const ticketNum = proposal.ticket_number || id;
                await lockProposalApi.lock(ticketNum!);
                queryClient.invalidateQueries({ queryKey: ["proposals"] });
                queryClient.invalidateQueries({ queryKey: ["proposal", ticketNum] });
                toast({ title: "Proposal Locked", description: "Production files have been generated and the proposal is now locked." });
                setLockConfirmOpen(false);
              } catch (error: any) {
                toast({ variant: "destructive", title: "Failed to Lock", description: error?.message || "An error occurred while locking the proposal." });
              } finally {
                setIsLocking(false);
              }
            }}>
            
              {isLocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lock Proposal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DiffCheckerDialog
      open={diffCheckerOpen}
      onOpenChange={setDiffCheckerOpen}
      peerReviewData={reviewFormData || {}}
      decisionReviewData={diffCheckerDrData}
      peerReviewerName={reviewMeta?.reviewer_name || "Peer Reviewer"}
      onDecisionFieldChange={(field, value) => {
        reviewFormRef.current?.setFieldValue(field, value);
      }}
      onSaveDraft={async (localData) => {
        // Push all local edits to form first
        Object.entries(localData).forEach(([field, value]) => {
          reviewFormRef.current?.setFieldValue(field, value);
        });
        // Wait for React state to flush before saving
        await new Promise((resolve) => setTimeout(resolve, 50));
        await reviewFormRef.current?.saveDraftQuiet();
        // Update snapshot so diff checker reflects saved state
        setDiffCheckerDrData({ ...(reviewFormRef.current?.formData || {}) });
      }} />
    

      <AlertDialog open={isRevertDialogOpen} onOpenChange={setIsRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert proposal to New?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the proposal back to <strong>New</strong> and remove any active peer
              reviewer assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revertToNew} disabled={isBusy}>
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resend Contract Dialog (after query response) */}
      <Dialog open={resendContractOpen} onOpenChange={(open) => {
      if (!open) {
        setResendContractOpen(false);
        setPendingQueryResponse(null); // Discard pending response on close
      }
    }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Response</DialogTitle>
            <DialogDescription>
              Send your response to the author. You can optionally include a new contract.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center space-x-2">
              <Checkbox
              id="include-contract"
              checked={includeContract}
              onCheckedChange={(checked) => setIncludeContract(!!checked)} />
            
              <Label htmlFor="include-contract" className="cursor-pointer">Include new contract</Label>
            </div>
            {includeContract && resendContractFields &&
          <>
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select value={resendContractType} onValueChange={(value) => {
                    const warning = getContractMismatchWarning(proposal?.book_type, value);
                    if (warning) {
                      setPendingResendContractType(value);
                      setShowResendMismatchWarning(true);
                    } else {
                      setResendContractType(value);
                    }
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select contract type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="author">Author Contract</SelectItem>
                      <SelectItem value="editor">Editor Contract</SelectItem>
                    </SelectContent>
                  </Select>
                  {proposal?.book_type && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-selected based on book type: <span className="font-medium">{proposal.book_type}</span>
                    </p>
                  )}
                </div>
                <ContractFieldsForm
                  values={resendContractFields}
                  onChange={setResendContractFields}
                  contractType={resendContractType}
                  idPrefix="resend-cf"
                />
              </>
          }
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setResendContractOpen(false);setPendingQueryResponse(null);}} disabled={isResendingContract}>
              Cancel
            </Button>
            <Button
            className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white"
            disabled={isResendingContract || (includeContract && (!resendContractFields || !areContractFieldsValid(resendContractFields)))}
            onClick={async () => {
              setIsResendingContract(true);
              try {
                // Send response first
                if (pendingQueryResponse) {
                  await respondToQuery.mutateAsync(pendingQueryResponse);
                }
                // Then send contract if included
                if (includeContract && resendContractFields) {
                  await proposalApi.sendContract(
                    ticketNum,
                    buildContractSendPayload({
                      contractType: resendContractType,
                      title: resendContractFields.title,
                      subtitle: resendContractFields.subtitle,
                      language: resendContractFields.language,
                      authorCopies: resendContractFields.authorCopies,
                      ifTwoAuthorCopies: resendContractFields.ifTwoAuthorCopies,
                      ifThreeOrFourAuthorCopies: resendContractFields.ifThreeOrFourAuthorCopies,
                      copiesSoldRevenue: resendContractFields.copiesSoldRevenue,
                      secondaryRightsRevenue: resendContractFields.secondaryRightsRevenue,
                      publishingAgreement: resendContractFields.publishingAgreement,
                      addendum: resendContractFields.addendum,
                    })
                  );
                }
                toast({ title: 'Sent Successfully', description: includeContract ? 'Response and contract have been sent to the author.' : 'Response has been sent to the author.' });
                queryClient.invalidateQueries({ queryKey: ['contract', ticketNum] });
                queryClient.invalidateQueries({ queryKey: ['proposal', ticketNum] });
                queryClient.invalidateQueries({ queryKey: ['proposals'] });
                queryClient.invalidateQueries({ queryKey: ['contract-queries', ticketNum] });
                queryClient.invalidateQueries({ queryKey: ['metadata', ticketNum] });
              } catch (err: any) {
                toast({ variant: 'destructive', title: 'Failed', description: err?.message || 'Failed to send.' });
              } finally {
                setIsResendingContract(false);
                setResendContractOpen(false);
                setPendingQueryResponse(null);
                setIncludeContract(false);
              }
            }}>
            
              {isResendingContract ? 'Sending...' : includeContract ? 'Send Response & Contract' : 'Send Response Only'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Contract Mismatch Warning */}
      <AlertDialog open={showResendMismatchWarning} onOpenChange={setShowResendMismatchWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contract Type Mismatch</AlertDialogTitle>
            <AlertDialogDescription>
              {getContractMismatchWarning(proposal?.book_type, pendingResendContractType || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingResendContractType(null);
              setShowResendMismatchWarning(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white"
              onClick={() => {
                if (pendingResendContractType) {
                  setResendContractType(pendingResendContractType);
                }
                setPendingResendContractType(null);
                setShowResendMismatchWarning(false);
              }}
            >
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Standalone Send Contract Dialog (after author responds to info request, no contract yet) */}
      <Dialog open={standaloneSendContractOpen} onOpenChange={(open) => {
        if (!open) {
          setStandaloneSendContractOpen(false);
          setStandaloneSendContractFields(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Publishing Contract</DialogTitle>
            <DialogDescription>Configure and send a publishing contract to the author.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Contract Type</Label>
              <Select value={standaloneSendContractType} onValueChange={(v) => {
                const mismatch = getContractMismatchWarning(proposal?.book_type, v);
                if (mismatch) {
                  setPendingResendContractType(v);
                  setShowResendMismatchWarning(true);
                  return;
                }
                setStandaloneSendContractType(v);
                if (standaloneSendContractFields) {
                  setStandaloneSendContractFields(getDefaultContractFields(v, standaloneSendContractFields.title, standaloneSendContractFields.subtitle));
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="author">Author Contract</SelectItem>
                  <SelectItem value="editor">Editor Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {standaloneSendContractFields && (
              <ContractFieldsForm
                values={standaloneSendContractFields}
                onChange={setStandaloneSendContractFields}
                contractType={standaloneSendContractType}
                idPrefix="standalone-cf"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneSendContractOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#2f4b40] hover:bg-[#2f4b40] hover:opacity-90 text-white"
              disabled={isSendingStandaloneContract || !standaloneSendContractFields || !areContractFieldsValid(standaloneSendContractFields)}
              onClick={async () => {
                if (!standaloneSendContractFields) return;
                setIsSendingStandaloneContract(true);
                try {
                  await proposalApi.sendContract(
                    ticketNum,
                    buildContractSendPayload({
                      contractType: standaloneSendContractType,
                      title: standaloneSendContractFields.title,
                      subtitle: standaloneSendContractFields.subtitle,
                      language: standaloneSendContractFields.language,
                      authorCopies: standaloneSendContractFields.authorCopies,
                      ifTwoAuthorCopies: standaloneSendContractFields.ifTwoAuthorCopies,
                      ifThreeOrFourAuthorCopies: standaloneSendContractFields.ifThreeOrFourAuthorCopies,
                      copiesSoldRevenue: standaloneSendContractFields.copiesSoldRevenue,
                      secondaryRightsRevenue: standaloneSendContractFields.secondaryRightsRevenue,
                      publishingAgreement: standaloneSendContractFields.publishingAgreement,
                      addendum: standaloneSendContractFields.addendum,
                    })
                  );
                  toast({ title: 'Contract Sent', description: 'The contract has been sent to the author.' });
                  queryClient.invalidateQueries({ queryKey: ['contract', ticketNum] });
                  queryClient.invalidateQueries({ queryKey: ['proposal', ticketNum] });
                  queryClient.invalidateQueries({ queryKey: ['proposals'] });
                  setStandaloneSendContractOpen(false);
                  setStandaloneSendContractFields(null);
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Contract Send Failed', description: err?.response?.data?.error || err.message || 'Failed to send contract.' });
                } finally {
                  setIsSendingStandaloneContract(false);
                }
              }}>
              {isSendingStandaloneContract ? 'Sending...' : 'Send Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>;
};
export default ProposalDetails;