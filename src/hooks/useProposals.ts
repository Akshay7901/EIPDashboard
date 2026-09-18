import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { extractCountry } from '@/lib/extractCountry';
import { Proposal, ReviewerComment, WorkflowLog, ApiProposalDetail, ApiProposalsResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

interface UseProposalsOptions {
  page?: number;
  limit?: number;
  search?: string;
  searchCategory?: string;
  status?: string | string[] | 'all';
  actionRequired?: boolean;
  sortOrder?: 'asc' | 'desc';
  awaitingCoverReview?: boolean;
}

// No status mapping needed — the API returns role-appropriate display text directly


// Normalize assignments (object or array) into an array
const normalizeAssignments = (raw: any): Array<{ email: string; name?: string; assigned_at?: string }> | null => {
  if (!raw) return null;
  // Single object: { reviewer_email, assigned_at }
  if (!Array.isArray(raw) && typeof raw === 'object' && raw.reviewer_email) {
    return [{ email: raw.reviewer_email, name: raw.reviewer_name, assigned_at: raw.assigned_at }];
  }
  // Array of objects
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((r: any) => ({ email: r.reviewer_email || r.email, name: r.reviewer_name || r.name, assigned_at: r.assigned_at }));
  }
  return null;
};

// Extract earliest assigned_at from assignments
const extractAssignedAt = (assignedReviewers: any): string | null => {
  const normalized = normalizeAssignments(assignedReviewers);
  if (!normalized || normalized.length === 0) return null;
  const dates = normalized.map(r => r.assigned_at).filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort()[0] as string;
};

// Map API proposal to internal Proposal structure (list view - basic)
const mapApiProposal = (apiProposal: any): Proposal => {
  return {
    id: apiProposal.ticket_number,
    name: apiProposal.title,
    author_name: apiProposal.corresponding_author,
    author_email: apiProposal.email,
    author_phone: null,
    description: null,
    status: apiProposal.status,
    value: null,
    contract_sent: false,
    contract_sent_at: null,
    finalised_at: null,
    finalised_by: null,
    created_at: apiProposal.submitted_at,
    updated_at: apiProposal.submitted_at,
    ticket_number: apiProposal.ticket_number,
    current_revision: apiProposal.current_revision,
    address: apiProposal.address || null,
    country: apiProposal.country || null,
    assigned_at: apiProposal.assigned_at || extractAssignedAt(apiProposal.assigned_reviewers || apiProposal.assignments),
    assigned_reviewers: normalizeAssignments(apiProposal.assigned_reviewers || apiProposal.assignments),
    action_required: apiProposal.action_required ?? false,
    metadata_status: apiProposal.metadata_status ?? apiProposal.current_data?.metadata_status ?? null,
    cover_status: apiProposal.cover_status ?? null,
    ai_review_score: apiProposal.ai_review_score ?? apiProposal.ai_review?.final_score ?? null,
    hallucination_score: apiProposal.hallucination_score ?? apiProposal.ai_review?.hallucination_score ?? null,
  };
};

// Map API proposal detail to internal Proposal structure (detail view - full)
const mapApiProposalDetail = (apiProposal: ApiProposalDetail): Proposal => {
  const currentData = apiProposal.current_data || {};
  return {
    id: apiProposal.ticket_number,
    name: currentData.main_title || apiProposal.title,
    author_name: currentData.corresponding_author_name || apiProposal.corresponding_author,
    author_email: currentData.email || apiProposal.email,
    author_phone: null,
    description: currentData.detailed_description || currentData.short_description || null,
    status: apiProposal.status,
    value: null,
    contract_sent: false,
    contract_sent_at: null,
    finalised_at: null,
    finalised_by: null,
    created_at: apiProposal.submitted_at,
    updated_at: apiProposal.submitted_at,
    ticket_number: apiProposal.ticket_number,
    current_revision: apiProposal.current_revision,
    short_description: currentData.short_description || null,
    detailed_description: currentData.detailed_description || null,
    sub_title: currentData.sub_title || null,
    biography: currentData.biography || null,
    institution: currentData.institution || null,
    job_title: currentData.job_title || null,
    keywords: currentData.keywords || null,
    book_type: currentData.book_type || null,
    word_count: currentData.word_count || null,
    expected_completion_date: currentData.expected_completion_date || null,
    table_of_contents: currentData.table_of_contents || null,
    marketing_info: currentData.marketing_info || null,
    co_authors_editors: currentData.co_authors_editors || null,
    referees_reviewers: currentData.referees_reviewers || null,
    file_uploads: currentData.file_uploads || null,
    secondary_email: currentData.secondary_email || null,
    address: currentData.address || null,
    cv_submitted: currentData.cv_submitted || null,
    sample_chapter_submitted: currentData.sample_chapter_submitted || null,
    toc_submitted: currentData.toc_submitted || null,
    permissions_required: currentData.permissions_required || null,
    permissions_docs_submitted: currentData.permissions_docs_submitted || null,
    figures_tables_count: currentData.figures_tables_count || null,
    under_review_elsewhere: currentData.under_review_elsewhere || null,
    submitted_date: currentData.submitted_date || null,
    submitted_time: currentData.submitted_time || null,
    additional_info: currentData.additional_info || null,
    corresponding_author_name: currentData.corresponding_author_name || null,
    referrer_url: currentData.referrer_url || null,
    assigned_at: extractAssignedAt((apiProposal as any).assigned_reviewers || (apiProposal as any).assignments),
    assigned_reviewers: normalizeAssignments((apiProposal as any).assigned_reviewers || (apiProposal as any).assignments),
    assignments: (apiProposal as any).assignments || null,
    timeline: (apiProposal as any).timeline || null,
    internal_status: (apiProposal as any).internal_status || null,
  };
};

// Helper function to fetch proposals list directly from API
const fetchProposalsList = async (
  limit: number,
  offset: number,
  options?: { status?: string | string[]; actionRequired?: boolean; sortOrder?: 'asc' | 'desc'; awaitingCoverReview?: boolean }
): Promise<ApiProposalsResponse> => {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Not authenticated');

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  if (options?.status && options.status !== 'all') {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    statuses.forEach(s => params.append('status', s));
  }

  if (options?.actionRequired) {
    params.set('action_required', 'true');
  }

  if (options?.awaitingCoverReview) {
    params.set('awaiting_cover_review', 'true');
  }

  if (options?.sortOrder) {
    params.set('sort_order', options.sortOrder);
  }

  const { data } = await api.get(`/api/proposals?${params.toString()}`);

  if (data?.upstream?.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return data;
};

// Helper function to fetch single proposal by ticket number directly from API
const fetchProposalByTicket = async (ticketNumber: string): Promise<ApiProposalDetail> => {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Not authenticated');

  const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}`);

  if (data?.upstream?.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return data;
};

export const useProposals = (options: UseProposalsOptions = {}) => {
  const { page = 1, limit = 10, search = '', searchCategory = 'author', status = 'all', actionRequired = false, sortOrder = 'desc', awaitingCoverReview = false } = options;

  return useQuery({
    queryKey: ['proposals', page, limit, search, searchCategory, status, actionRequired, sortOrder, awaitingCoverReview],
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const hasServerFilters = (status !== 'all') || actionRequired || awaitingCoverReview;

      // Try server-side filters first; fall back to unfiltered + client-side
      let apiData: any;
      let usedServerFilters = false;

      if (hasServerFilters) {
        try {
          apiData = await fetchProposalsList(limit, offset, {
            status: status !== 'all' ? status : undefined,
            actionRequired,
            sortOrder,
            awaitingCoverReview,
          });
          usedServerFilters = true;
        } catch {
          // Server-side filter failed (e.g. 500) — fall back to unfiltered
          apiData = await fetchProposalsList(limit, offset, { sortOrder }).catch(() => ({ proposals: [], total: 0 }));
        }
      } else {
        apiData = await fetchProposalsList(limit, offset, { sortOrder }).catch(() => ({ proposals: [], total: 0 }));
      }

      // Map API proposals directly (no local overrides)
      let proposals = (apiData.proposals || []).map((apiProposal: any) => mapApiProposal(apiProposal));

      // Client-side fallback filtering when server-side failed
      if (!usedServerFilters && hasServerFilters) {
        const normalizeStatus = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');
        if (status !== 'all') {
          const statusArr = Array.isArray(status) ? status : [status];
          proposals = proposals.filter(p => statusArr.includes(normalizeStatus(p.status)));
        }
        if (actionRequired) {
          proposals = proposals.filter(p => p.action_required === true);
        }
        if (awaitingCoverReview) {
          proposals = proposals.filter(p => (p.cover_status || '').toLowerCase() === 'in_review');
        }
      }

      // Client-side filtering for search (search is not supported server-side)
      if (search) {
        const searchLower = search.toLowerCase();
        proposals = proposals.filter(p => {
          switch (searchCategory) {
            case 'title':
              return p.name?.toLowerCase().includes(searchLower);
            case 'email':
              return p.author_email?.toLowerCase().includes(searchLower);
            case 'country': {
              const country = p.country || extractCountry(p.address);
              return country?.toLowerCase().includes(searchLower) ?? false;
            }
            case 'author':
            default:
              return p.author_name?.toLowerCase().includes(searchLower);
          }
        });
      }

      return {
        data: proposals,
        total: apiData.total,
        page,
        limit,
        totalPages: Math.ceil(apiData.total / limit),
        status_summary: (apiData as any).status_summary || null,
      };
    },
    staleTime: 0,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
};

export const useProposal = (id: string) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['proposal', id],
    queryFn: async () => {
      // Fetch from external API directly
      try {
        const apiProposal: any = await fetchProposalByTicket(id);
        const mapped = mapApiProposalDetail(apiProposal);

        // Try to get assigned_reviewers from cached list data if detail doesn't have it
        let assignedReviewers = mapped.assigned_reviewers;
        if (!assignedReviewers) {
          const cachedListData = queryClient.getQueriesData<{ data: Proposal[] }>({ queryKey: ['proposals'] });
          for (const [, queryData] of cachedListData) {
            const cached = queryData?.data?.find(p => p.ticket_number === id);
            if (cached?.assigned_reviewers) {
              assignedReviewers = cached.assigned_reviewers;
              break;
            }
          }
        }

        return {
          ...mapped,
          assigned_reviewers: assignedReviewers,
        };
      } catch (e) {
        // Detail endpoint failed - try cached list data
        const cachedListData = queryClient.getQueriesData<{
          data: Proposal[];
        }>({ queryKey: ['proposals'] });

        for (const [, queryData] of cachedListData) {
          if (queryData?.data) {
            const cachedProposal = queryData.data.find(
              (p) => p.ticket_number === id || p.id === id
            );
            if (cachedProposal) {
              return {
                ...cachedProposal,
                _isPartialData: true,
                _detailFetchError: true,
              };
            }
          }
        }

        // If no cached list, fetch list and find
        try {
          const apiList = await fetchProposalsList(1000, 0);
          const found = apiList.proposals?.find((p: any) => p.ticket_number === id);
          if (found) {
            const mapped = mapApiProposal(found);
            return {
              ...mapped,
              _isPartialData: true,
              _detailFetchError: true,
            };
          }
        } catch {
          // ignore
        }

        const message = e instanceof Error ? e.message : 'Failed to fetch proposal details';
        throw new Error(message);
      }
    },
    enabled: !!id,
    retry: false,
    staleTime: 0,
    refetchInterval: 5000,
  });
};



export const useWorkflowLogs = (proposalId: string) => {
  return useQuery({
    queryKey: ['workflow-logs', proposalId],
    queryFn: async () => {
      // TODO: Fetch from external API /logs endpoint when available
      return [] as WorkflowLog[];
    },
    enabled: !!proposalId,
  });
};

export interface ProposalEvent {
  id: number;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  description: string;
  changed_by: string;
  changed_by_role: string;
  created_at: string;
}

export const useProposalEvents = (ticketNumber: string) => {
  return useQuery({
    queryKey: ['proposal-events', ticketNumber],
    queryFn: async () => {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/events`);
      return (data?.events || []) as ProposalEvent[];
    },
    enabled: !!ticketNumber,
  });
};

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const apiData = await fetchProposalsList(1000, 0).catch(() => ({ proposals: [], total: 0 }));

      const proposals = (apiData.proposals || []).map((p: any) => mapApiProposal(p));

      const stats = {
        total: proposals.length,
        submitted: proposals.filter(p => p.status === 'submitted').length,
        under_review: proposals.filter(p => p.status === 'under_review').length,
        review_returned: proposals.filter(p => p.status === 'review_returned').length,
        contract_issued: proposals.filter(p => p.status === 'contract_issued').length,
        queries_raised: proposals.filter(p => p.status === 'queries_raised').length,
        awaiting_author_approval: proposals.filter(p => p.status === 'awaiting_author_approval').length,
        author_approved: proposals.filter(p => p.status === 'author_approved').length,
        approved: proposals.filter(p => p.status === 'approved').length,
        finalised: proposals.filter(p => p.status === 'finalised').length,
        rejected: proposals.filter(p => p.status === 'rejected').length,
        declined: proposals.filter(p => p.status === 'declined').length,
        locked: proposals.filter(p => p.status === 'locked').length,
      };

      return stats;
    },
  });
};
