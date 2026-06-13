// Types for the Proposal Management Dashboard

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role?: ReviewerRole | null;
}

export type ReviewerRole = 'reviewer_1' | 'reviewer_2' | 'author';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: ReviewerRole | null;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// API status values from external API
export type ApiProposalStatus = 
  | 'new' 
  | 'in_review' 
  | 'under_review' 
  | 'review_returned' 
  | 'contract_issued' 
  | 'queries_raised' 
  | 'awaiting_author_approval' 
  | 'author_approved' 
  | 'approved' 
  | 'rejected' 
  | 'declined' 
  | 'locked' 
  | 'published';

// Status is now a raw display string from the API (e.g., "New", "In Review", "Pending")
export type ProposalStatus = string;

// API proposal current_data structure (full details)
export interface ApiProposalCurrentData {
  additional_info?: string;
  address?: string;
  biography?: string;
  book_type?: string;
  co_authors_editors?: string;
  corresponding_author_name?: string;
  cv_submitted?: string;
  detailed_description?: string;
  email?: string;
  expected_completion_date?: string;
  figures_tables_count?: string;
  file_uploads?: string;
  institution?: string;
  job_title?: string;
  keywords?: string;
  main_title?: string;
  marketing_info?: string;
  permissions_docs_submitted?: string;
  permissions_required?: string;
  referees_reviewers?: string;
  referrer_url?: string;
  sample_chapter_submitted?: string;
  secondary_email?: string;
  short_description?: string;
  sub_title?: string;
  submitted_date?: string;
  submitted_time?: string;
  table_of_contents?: string;
  toc_submitted?: string;
  under_review_elsewhere?: string;
  word_count?: string;
}

// API response proposal structure (list view - basic fields)
export interface ApiProposal {
  ticket_number: string;
  title: string;
  corresponding_author: string;
  email: string;
  status: ApiProposalStatus;
  submitted_at: string;
  current_revision: number;
  country?: string;
}

// API response proposal structure (detail view - includes current_data)
export interface ApiProposalDetail extends ApiProposal {
  current_data?: ApiProposalCurrentData;
  revisions?: Array<{
    action: string;
    created_at: string;
  }>;
}

// API response structure
export interface ApiProposalsResponse {
  proposals: ApiProposal[];
  total: number;
  limit: number;
  offset: number;
}

// Internal proposal structure (mapped from API)
export interface Proposal {
  id: string;
  name: string;
  author_name: string;
  author_email: string;
  author_phone?: string | null;
  description?: string | null;
  status: ProposalStatus;
  value?: number | null;
  contract_sent: boolean;
  contract_sent_at?: string | null;
  finalised_at?: string | null;
  finalised_by?: string | null;
  created_at: string;
  updated_at: string;
  ticket_number?: string;
  current_revision?: number;
  // Extended fields from API current_data
  short_description?: string | null;
  detailed_description?: string | null;
  sub_title?: string | null;
  biography?: string | null;
  institution?: string | null;
  job_title?: string | null;
  keywords?: string | null;
  book_type?: string | null;
  word_count?: string | null;
  expected_completion_date?: string | null;
  table_of_contents?: string | null;
  marketing_info?: string | null;
  co_authors_editors?: string | null;
  referees_reviewers?: string | null;
  file_uploads?: string | null;
  secondary_email?: string | null;
  address?: string | null;
  country?: string | null;
  // Additional submission fields
  cv_submitted?: string | null;
  sample_chapter_submitted?: string | null;
  toc_submitted?: string | null;
  permissions_required?: string | null;
  permissions_docs_submitted?: string | null;
  figures_tables_count?: string | null;
  under_review_elsewhere?: string | null;
  submitted_date?: string | null;
  submitted_time?: string | null;
  additional_info?: string | null;
  corresponding_author_name?: string | null;
  referrer_url?: string | null;
  // Assignment data
  assigned_at?: string | null;
  assigned_reviewers?: Array<{ email: string; name?: string; assigned_at?: string }> | null;
  assignments?: Array<{ assigned_at?: string; note?: string; email?: string }> | null;
  // Timeline from API
  timeline?: Array<{
    stage_name: string;
    display_name: string;
    completed_at?: string | null;
    started_at?: string | null;
    is_current: boolean;
    is_completed: boolean;
  }> | null;
  // Internal status from API
  internal_status?: string | null;
  // Action required flag from API
  action_required?: boolean;
  // Publication metadata status from API (e.g. "draft", "sent_to_author", "approved")
  metadata_status?: string | null;
  // Legacy compatibility
  client?: string;
  clientEmail?: string;
  clientPhone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProposalAttachment {
  id: string;
  proposal_id: string;
  file_name: string;
  file_path: string;
  file_type?: string | null;
  file_size?: number | null;
  uploaded_at: string;
}

export interface ReviewerComment {
  id: string;
  proposal_id: string;
  reviewer_id: string;
  comment_text?: string | null;
  review_form_data: Record<string, any>;
  submitted_for_authorization: boolean;
  is_duplicate_of?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowLog {
  id: string;
  proposal_id: string;
  user_id?: string | null;
  action: string;
  previous_status?: ProposalStatus | null;
  new_status?: ProposalStatus | null;
  details: Record<string, any>;
  created_at: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  status: number;
}
