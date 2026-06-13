import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Users, ArrowUpDown, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import ProfileDropdown from "@/components/layout/ProfileDropdown";
import TruncatedCell from "@/components/ui/truncated-cell";
import { format } from "date-fns";
import { useProposals } from "@/hooks/useProposals";
import { useAuth } from "@/contexts/AuthContext";
import { useProposalActions } from "@/hooks/useProposalActions";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";
import brandLogo from "@/assets/brand-logo.webp";
import { extractCountry } from "@/lib/extractCountry";
import ProposalStatusBadge from "@/components/proposals/ProposalStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { metadataApi } from "@/lib/proposalsApi";

const ITEMS_PER_PAGE = 10;

/* Lazy indicator for "Contract Received" rows — fetches metadata to check
   whether publication data has been sent to the author. */
const SentToAuthorIndicator: React.FC<{ ticketNumber: string }> = ({ ticketNumber }) => {
  const { data } = useQuery({
    queryKey: ['proposal-metadata-status', ticketNumber],
    queryFn: () => metadataApi.get(ticketNumber),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const status = data?.metadata_status;
  if (status !== 'sent_to_author' && status !== 'pending_author_approval' && status !== 'awaiting_author_approval') {
    return null;
  }
  return <SentToAuthorDot />;
};

const SentToAuthorDot: React.FC = () => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        aria-label="Publication data sent to author"
        className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#D97706] ring-2 ring-background"
      />
    </TooltipTrigger>
    <TooltipContent><p>Publication data sent to author</p></TooltipContent>
  </Tooltip>
);

/* ============================================================
   DECISION REVIEWER (reviewer_1) — "Proposal Intake" config
   ============================================================ */

/* ============================================================
   Status chip color config — keyed by API status_summary keys
   ============================================================ */

const statusChipColorMap: Record<string, { colorClass: string }> = {
  total: { colorClass: "bg-[#2d3748] text-white border-[#2d3748]" },
  new: { colorClass: "bg-[#3B82F6] text-white border-[#3B82F6]" },
  in_review: { colorClass: "bg-[#7C3AED] text-white border-[#7C3AED]" },
  review_returned: { colorClass: "bg-[#F59E0B] text-white border-[#F59E0B]" },
  contract_issued: { colorClass: "bg-[#0D9488] text-white border-[#0D9488]" },
  contract_received: { colorClass: "bg-[#BE185D] text-white border-[#BE185D]" },
  queries_raised: { colorClass: "bg-[#EA580C] text-white border-[#EA580C]" },
  awaiting_more_info: { colorClass: "bg-[#D97706] text-white border-[#D97706]" },
  awaiting_author_approval: { colorClass: "bg-[#BE185D] text-white border-[#BE185D]" },
  author_approved: { colorClass: "bg-[#16A34A] text-white border-[#16A34A]" },
  locked: { colorClass: "bg-[#94A3B8] text-white border-[#94A3B8]" },
  declined: { colorClass: "bg-[#DC2626] text-white border-[#DC2626]" },
  assigned: { colorClass: "bg-[#e5e7eb] text-gray-800 border-[#e5e7eb]" },
  in_progress: { colorClass: "bg-[#F59E0B] text-white border-[#F59E0B]" },
  completed: { colorClass: "bg-[#16A34A] text-white border-[#16A34A]" },
  pending: { colorClass: "bg-[#EA580C] text-white border-[#EA580C]" },
};

// Convert API key to display label: replace underscores with spaces, capitalise each word
const formatStatusLabel = (key: string): string =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// PeerReviewStatusBadge removed — the API provides role-appropriate display status directly

/* ============================================================
   Shared components
   ============================================================ */

interface StatusChipProps {
  count: number;
  label: string;
  colorClass: string;
  isActive?: boolean;
  onClick?: () => void;
  tooltip?: string;
}

const decisionReviewerTooltips: Record<string, string> = {
  awaiting_more_info: "More information requested",
  in_review: "Proposal with peer review",
  review_returned: "Peer review return",
  contract_issued: "Contract sent",
  queries_raised: "Author raised query",
  awaiting_author_approval: "Publication data pending",
  author_approved: "Publication data approved",
  locked: "Publication data locked",
};

const StatusChip: React.FC<StatusChipProps> = ({ count, label, colorClass, isActive, onClick, tooltip }) => {
  const chip = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border transition-all rounded-full w-full h-10",
        colorClass,
        isActive && "ring-2 ring-offset-2 ring-primary",
      )}
    >
      {label} [{count}]
    </button>
  );

  if (!tooltip) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent><p>{tooltip}</p></TooltipContent>
    </Tooltip>
  );
};

/* ============================================================
   Main Component
   ============================================================ */

const Proposals: React.FC = () => {
  const navigate = useNavigate();
  const { isAnyReviewer, isReviewer1, isReviewer2, isAuthor, isAdmin } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<{ ticket: string; name: string } | null>(null);
  const { deleteProposal, isDeleting } = useProposalActions(deleteTarget?.ticket);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<string>("author");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [actionRequiredFilter, setActionRequiredFilter] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  // Peer reviewers use client-side filtering (their status keys like "assigned", "pending"
  // don't match the API's status parameter values)
  const { data, isLoading, error } = useProposals({
    page: 1,
    limit: 100,
    search: searchQuery,
    searchCategory,
    status: isReviewer2 ? "all" : (statusFilter.length === 0 ? "all" : statusFilter),
    actionRequired: actionRequiredFilter,
    sortOrder,
  });

  /* ---------- Derived data ---------- */

  const { user } = useAuth();

  // For peer reviewers, the API already filters to only assigned proposals,
  // so we show all returned proposals. For reviewer_1, show everything.
  // The API already provides role-appropriate display status, no overrides needed.
  const roleFilteredProposals = React.useMemo(() => {
    if (!data?.data) return [];
    if (isReviewer1) return data.data;
    // For peer reviewers: the API already returns only their assigned proposals
    const userEmail = user?.email?.toLowerCase();
    if (!userEmail) return data.data;
    const emailFiltered = data.data.filter((p) => {
      const reviewers = p.assigned_reviewers || [];
      const apiEmails = reviewers.map((r: any) => r.email).filter(Boolean);
      if (apiEmails.length === 0) return true;
      return apiEmails.some((e: string) => e?.toLowerCase() === userEmail);
    });
    return emailFiltered;
  }, [data?.data, isReviewer1, user?.email]);

  // Use status_summary from API response directly
  const statusSummary: Record<string, number> | null = data?.status_summary || null;

  // Build status options for dropdown from status_summary keys
  const statusOptions = React.useMemo(() => {
    if (!statusSummary) return [{ value: "all" as const, label: "All Statuses" }];
    const options: { value: string; label: string }[] = [{ value: "all", label: "All Statuses" }];
    Object.keys(statusSummary).forEach((key) => {
      if (key === "total") return;
      options.push({ value: key, label: formatStatusLabel(key) });
    });
    return options;
  }, [statusSummary]);

  // For peer reviewers, apply status filtering client-side since API doesn't support it
  const filteredProposals = React.useMemo(() => {
    if (!isReviewer2 || statusFilter.length === 0) return roleFilteredProposals;
    const normalizeStatus = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');
    return roleFilteredProposals.filter(p => statusFilter.includes(normalizeStatus(p.status)));
  }, [roleFilteredProposals, isReviewer2, statusFilter]);

  const displayedProposals = filteredProposals.slice(0, displayCount);
  const hasMore = displayCount < filteredProposals.length;

  /* ---------- Handlers ---------- */

  const handleProposalClick = (id: string) => navigate(`/proposals/${id}`);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setDisplayCount(ITEMS_PER_PAGE);
  };
  const handleStatusChange = (value: string) => {
    setStatusFilter(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
    setDisplayCount(ITEMS_PER_PAGE);
  };
  // Infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  /* ---------- Guards ---------- */

  // Redirect authors to their dashboard
  if (isAuthor) {
    return <Navigate to="/author/proposals" replace />;
  }

  // If user role is not recognized as reviewer, also redirect authors or show appropriate message
  if (!isAnyReviewer) {
    // If user exists but isn't a reviewer, redirect to author dashboard as fallback
    if (user) {
      return <Navigate to="/author/proposals" replace />;
    }
    return (
      <DashboardLayout title="Dashboard">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center">
              You don't have permission to view proposals.
              <br />
              Please contact an administrator to assign you a reviewer role.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <DashboardLayout title={isReviewer1 ? "Proposal Intake" : "Peer Review Dashboard"}>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <img
              src={isReviewer1 ? brandLogo : logo}
              alt="Logo"
              className="h-8 sm:h-10 w-auto"
            />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {isReviewer1 ? "Proposal Intake" : "Peer Review Dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {isReviewer1 && (
              <Button variant="outline" className="gap-2 text-xs sm:text-sm" onClick={() => navigate("/peer-reviewers")}>
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Peer Reviewers</span>
                <span className="sm:hidden">Reviewers</span>
              </Button>
            )}
            <ProfileDropdown />
          </div>
        </div>

        {/* Status Summary Chips — dynamically rendered from API status_summary */}
        {statusSummary && (
          <TooltipProvider>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {Object.entries(statusSummary).map(([key, count]) => {
              const config = statusChipColorMap[key];
              // Fallback: render even unknown keys with a default gray style
              const colorClass = config?.colorClass || "bg-gray-500 text-white border-gray-500";
              const isTotal = key === "total";
              return (
                <StatusChip
                  key={key}
                  count={count}
                  label={formatStatusLabel(key)}
                  colorClass={colorClass}
                  tooltip={isTotal ? undefined : decisionReviewerTooltips[key]}
                  isActive={isTotal ? statusFilter.length === 0 : statusFilter.includes(key)}
                  onClick={() => {
                    if (isTotal) {
                      setStatusFilter([]);
                    } else {
                      handleStatusChange(key);
                    }
                    setDisplayCount(ITEMS_PER_PAGE);
                  }}
                />
              );
            })}
          </div>
          </TooltipProvider>
        )}

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Search by:</span>
            <Select value={searchCategory} onValueChange={(v) => { setSearchCategory(v); setDisplayCount(ITEMS_PER_PAGE); }}>
              <SelectTrigger className="w-28 h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="author">Author</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="country">Country</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1 min-w-[150px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type here"
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-10 bg-background"
            />
          </div>

          <Select value={statusFilter.length === 1 ? statusFilter[0] : "all"} onValueChange={(v) => handleStatusChange(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 h-9 bg-background">
              <SelectValue placeholder={statusFilter.length > 1 ? `${statusFilter.length} selected` : "All Statuses"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.filter(o => o.value !== "all").map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isReviewer1 && (
            <button
              onClick={() => { setActionRequiredFilter((prev) => !prev); setDisplayCount(ITEMS_PER_PAGE); }}
              className={cn(
                "inline-flex items-center gap-2 px-4 h-9 text-sm font-medium border rounded-full transition-all whitespace-nowrap",
                actionRequiredFilter
                  ? "bg-[#c05621] text-white border-[#c05621] ring-2 ring-offset-2 ring-[#c05621]"
                  : "bg-background text-[#c05621] border-[#c05621] hover:bg-[#c05621]/10"
              )}
            >
              Action Required
            </button>
          )}

          <button
            onClick={() => { setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc'); setDisplayCount(ITEMS_PER_PAGE); }}
            className={cn(
              "inline-flex items-center gap-2 px-4 h-9 text-sm font-medium border rounded-full transition-all whitespace-nowrap",
              "bg-background text-foreground border-border hover:bg-muted"
            )}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>

        {/* Section label */}
        {isReviewer1 && (
          <h2 className="text-lg font-semibold text-foreground">Recent Submissions</h2>
        )}

        {/* Proposals Table */}
        <div className="space-y-4">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-destructive">Error loading proposals. Please try again.</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && displayedProposals.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No proposals found.</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && displayedProposals.length > 0 && (
            <>
              <Card className="overflow-x-auto">
                <Table className="table-fixed w-full min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide w-[30%]">
                        Title
                      </TableHead>
                      <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide w-[14%]">
                        Author
                      </TableHead>
                      <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide w-[18%]">
                        Email
                      </TableHead>
                      <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide w-[8%]">
                        Country
                      </TableHead>
                      {isReviewer1 && (
                        <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide whitespace-nowrap w-[10%]">
                          Submitted
                        </TableHead>
                      )}
                      {isReviewer1 && (
                        <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide whitespace-nowrap w-[10%]">
                          Assigned
                        </TableHead>
                      )}
                      {isReviewer2 && (
                        <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide whitespace-nowrap w-[10%]">
                          Assigned
                        </TableHead>
                      )}
                      <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide text-right w-[10%]">
                        Status
                      </TableHead>
                      {isAdmin && (
                        <TableHead className="font-semibold text-foreground uppercase text-xs tracking-wide text-right w-[6%]">
                          Actions
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedProposals.map((proposal) => (
                      <TableRow
                        key={proposal.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleProposalClick(proposal.id)}
                      >
                        <TableCell className="font-medium text-foreground">
                          <TruncatedCell text={proposal.name} maxLines={2} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <TruncatedCell text={proposal.author_name} maxLines={1} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <TruncatedCell text={proposal.author_email} maxLines={1} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {proposal.country || extractCountry(proposal.address) || "—"}
                        </TableCell>
                        {isReviewer1 && (
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {proposal.created_at
                              ? format(new Date(proposal.created_at), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                        )}
                        {isReviewer1 && (
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {proposal.assigned_at
                              ? format(new Date(proposal.assigned_at), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                        )}
                        {isReviewer2 && (
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {proposal.assigned_at
                              ? format(new Date(proposal.assigned_at), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <div className="relative inline-block">
                              <ProposalStatusBadge status={proposal.status} showIcon={false} />
                              {(() => {
                                const normStatus = (proposal.status || '').trim().toLowerCase().replace(/\s+/g, '_');
                                if (normStatus !== 'contract_received') return null;
                                if (proposal.metadata_status) {
                                  const ms = proposal.metadata_status;
                                  if (ms === 'sent_to_author' || ms === 'pending_author_approval' || ms === 'awaiting_author_approval') {
                                    return <SentToAuthorDot />;
                                  }
                                  return null;
                                }
                                return <SentToAuthorIndicator ticketNumber={proposal.ticket_number || proposal.id} />;
                              })()}
                            </div>
                          </TooltipProvider>
                        </TableCell>
                        {isAdmin && (
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                setDeleteTarget({
                                  ticket: proposal.ticket_number || proposal.id,
                                  name: proposal.name,
                                })
                              }
                              aria-label="Delete proposal"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete
              {deleteTarget?.name ? ` "${deleteTarget.name}"` : " this proposal"}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                deleteProposal(undefined as any, {
                  onSuccess: () => setDeleteTarget(null),
                });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Proposals;
