import api from '@/lib/api';

// Lock proposal API
export const lockProposalApi = {
  lock: async (ticketNumber: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/lock`);
    return data;
  },
};

// Types for API responses
export interface PeerReviewer {
  id: string;
  email: string;
  name: string;
  created_at?: string;
  assigned_proposals_count?: number;
}

export interface AssignmentRequest {
  reviewer_email: string;
  note?: string;
}

// Peer Reviewers API
export const peerReviewersApi = {
  list: async (): Promise<PeerReviewer[]> => {
    const { data } = await api.get('/api/proposals/users/peer-reviewers');
    if (Array.isArray(data)) return data;
    if (data?.peer_reviewers && Array.isArray(data.peer_reviewers)) return data.peer_reviewers;
    if (data?.reviewers && Array.isArray(data.reviewers)) return data.reviewers;
    if (data?.data && Array.isArray(data.data)) return data.data;
    return [];
  },

  create: async (reviewer: { email: string; name: string }): Promise<PeerReviewer> => {
    const { data } = await api.post('/api/proposals/users/peer-reviewers', reviewer);
    return data;
  },

  delete: async (reviewerId: string): Promise<void> => {
    await api.delete(`/api/proposals/users/peer-reviewers/${encodeURIComponent(reviewerId)}`);
  },
};

// Designers
export interface Designer {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export const designersApi = {
  list: async (): Promise<Designer[]> => {
    const { data } = await api.get('/api/proposals/users/designers');
    if (Array.isArray(data)) return data;
    if (data?.designers && Array.isArray(data.designers)) return data.designers;
    if (data?.data && Array.isArray(data.data)) return data.data;
    return [];
  },
  create: async (designer: { email: string; name: string }): Promise<Designer> => {
    const { data } = await api.post('/api/proposals/users/designers', designer);
    return data;
  },
  delete: async (designerId: string): Promise<void> => {
    await api.delete(`/api/proposals/users/designers/${encodeURIComponent(designerId)}`);
  },
};

// Reviews API (peer review submission and retrieval)
export const reviewsApi = {
  get: async (ticketNumber: string): Promise<any> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/review`);
      return data;
    } catch (error: any) {
      // If no review exists yet (404), return null instead of throwing
      if (error?.status === 404 || error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  saveDraft: async (ticketNumber: string, reviewData: Record<string, any>): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/review/save`, reviewData);
    return data;
  },

  submit: async (ticketNumber: string, reviewData: Record<string, any>): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/review/submit`, reviewData);
    return data;
  },
};

// Assignments API
export const assignmentsApi = {
  assign: async (ticketNumber: string, assignment: AssignmentRequest): Promise<void> => {
    await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/assign`, assignment);
  },

  unassign: async (ticketNumber: string): Promise<void> => {
    await api.delete(`/api/proposals/${encodeURIComponent(ticketNumber)}/assign`);
  },
};

// Revisions API
export const revisionsApi = {
  create: async (ticketNumber: string, revisionData: Record<string, unknown>): Promise<void> => {
    await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/revise`, revisionData);
  },
};

// Contract API
export const contractApi = {
  get: async (ticketNumber: string): Promise<any> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract`);
      return data;
    } catch (error: any) {
      if (error?.status === 404 || error?.response?.status === 404) return null;
      throw error;
    }
  },

  getDocumentUrl: (ticketNumber: string): string => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.ethicspress.com';
    return `${baseUrl}/api/proposals/${encodeURIComponent(ticketNumber)}/contract/document`;
  },

  getDocumentBlob: async (ticketNumber: string): Promise<string> => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.ethicspress.com';
    const token = localStorage.getItem('auth_token');
    const response = await fetch(
      `${baseUrl}/api/proposals/${encodeURIComponent(ticketNumber)}/contract/document`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
};

// Delete Proposal API
export interface SendContractPayload {
  contract_type: string;
  title?: string;
  subtitle?: string;
  expiry_days?: number;
  notes?: string;
  language?: string;
  author_copies?: string;
  if_two_author_copies?: string;
  if_three_or_four_author_copies?: string;
  copies_sold_revenue?: string | number;
  secondary_rights_revenue?: string | number;
  publishing_agreement?: string;
  addendum?: string;
}

export const proposalApi = {
  delete: async (ticketNumber: string): Promise<void> => {
    await api.delete(`/api/proposals/${encodeURIComponent(ticketNumber)}`);
  },

  decline: async (ticketNumber: string): Promise<{ status: string; message: string; ticket_number: string; email_sent: boolean }> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/decline`);
    return data;
  },

  acceptContract: async (ticketNumber: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/accept`);
    return data;
  },

  sendContract: async (ticketNumber: string, payload: SendContractPayload): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/send`, payload);
    return data;
  },




  raiseQuestions: async (ticketNumber: string, message: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/questions`, { message });
    return data;
  },

  getSigningLink: async (ticketNumber: string): Promise<{ signing_link: string; expires_at?: string; note?: string }> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/signing-link`);
    return data;
  },
};

// Metadata API
export interface MetadataAuthor {
  title?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  email_2?: string;
  institution?: string;
  country?: string;
}

export interface ProposalMetadata {
  full_title?: string;
  title?: string;
  subtitle?: string;
  category?: string;
  display_names?: string;
  display_bios?: string;
  authors?: MetadataAuthor[];
  book_description?: string;
  keywords?: string;
  website_classification?: string;
  bic?: string;
}

export interface CoverImageData {
  s3_url: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  width_px: number;
  height_px: number;
  dpi: number;
  version: number;
  uploaded_at: string;
  source?: string;
}

export interface MetadataResponse {
  ticket_number: string;
  current_version: number;
  metadata_status: string;
  metadata: ProposalMetadata;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  cover_image?: CoverImageData | null;
  designer_covers?: Partial<Record<DesignerCoverBinding, DesignerCoverEntry>> | null;
  designer_cover_approval?: DesignerCoverApproval | null;
  approval?: DesignerCoverApproval | null;
  approval_status?: DesignerCoverApprovalStatus | null;
  revisions?: any[];
}

export type DesignerCoverBinding = 'hb' | 'pb' | 'ebook';

export type DesignerCoverApprovalStatus = 'pending' | 'in_review' | 'query_raised' | 'completed';

export interface DesignerCoverApproval {
  status?: DesignerCoverApprovalStatus | string | null;
  notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface DesignerCoverEntry {
  url: string;
  filename?: string;
  uploaded_by?: string;
  uploaded_at?: string;
}


export const designerCoversApi = {
  downloadUrl: (ticketNumber: string, binding: DesignerCoverBinding) =>
    `/api/proposals/${encodeURIComponent(ticketNumber)}/designer-covers/${binding}/download`,

  download: async (ticketNumber: string, binding: DesignerCoverBinding): Promise<{ blob: Blob; filename?: string | null }> => {
    const response = await api.get(designerCoversApi.downloadUrl(ticketNumber, binding), {
      responseType: 'blob',
    });
    const disposition = (response.headers as any)?.['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return { blob: response.data as Blob, filename: match?.[1] ? decodeURIComponent(match[1]) : null };
  },

  deleteAll: async (ticketNumber: string): Promise<any> => {
    const { data } = await api.delete(`/api/proposals/${encodeURIComponent(ticketNumber)}/designer-covers`);
    return data;
  },

  upload: async (ticketNumber: string, file: File): Promise<any> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticketNumber)}/cover`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
};

export const metadataApi = {
  get: async (ticketNumber: string): Promise<MetadataResponse | null> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata`);
      return data;
    } catch (error: any) {
      if (error?.status === 404 || error?.response?.status === 404) return null;
      throw error;
    }
  },

  update: async (ticketNumber: string, payload: Partial<ProposalMetadata> & { notes?: string; updated_by?: string }): Promise<any> => {
    const { data } = await api.put(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata`, payload);
    return data;
  },

  send: async (ticketNumber: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/send`);
    return data;
  },

  approve: async (ticketNumber: string, payload?: { notes?: string }): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/approve`, payload || {});
    return data;
  },

  // Cover image endpoints

  uploadCoverImage: async (ticketNumber: string, file: File, source?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    if (source) formData.append('source', source);
    const { data } = await api.post(
      `/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/cover-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  deleteCoverImage: async (ticketNumber: string): Promise<any> => {
    const { data } = await api.delete(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/cover-image`);
    return data;
  },
};

// Metadata Queries API
export interface MetadataQuery {
  id: number;
  type: 'query' | 'response';
  text?: string;
  fields?: string[];
  raised_by?: string;
  raised_by_name?: string;
  raised_by_role?: string;
  parent_query_id?: number | null;
  created_at: string;
}

export const metadataQueriesApi = {
  list: async (ticketNumber: string): Promise<MetadataQuery[]> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/queries`);
      return data?.queries || data || [];
    } catch (error: any) {
      if (error?.status === 404 || error?.response?.status === 404) return [];
      throw error;
    }
  },

  raise: async (ticketNumber: string, queryText: string, fields?: string[]): Promise<any> => {
    const payload: Record<string, any> = { query_text: queryText };
    if (fields && fields.length > 0) payload.fields = fields;
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/query`, payload);
    return data;
  },

  respond: async (ticketNumber: string, queryId: number, responseText: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/metadata/query/respond`, { query_id: queryId, response_text: responseText });
    return data;
  },
};

// Request Info API
export interface InfoRequestItem {
  key: string;
  label: string;
  note?: string;
}

export interface InfoRequest {
  id: number;
  ticket_number: string;
  items: InfoRequestItem[];
  note?: string;
  status: 'pending' | 'open' | 'responded' | 'superseded';
  requested_by?: string;
  requested_at: string;
  response_note?: string;
  responded_at?: string;
  updated_fields?: Record<string, string>;
  draft_data?: Record<string, string>;
  previous_status?: string;
}

export const requestInfoApi = {
  request: async (ticketNumber: string, payload: { items: InfoRequestItem[]; note?: string }): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/request-info`, payload);
    return data;
  },

  getHistory: async (ticketNumber: string): Promise<InfoRequest[]> => {
    try {
      const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/request-info`);
      return data?.requests || data || [];
    } catch (error: any) {
      if (error?.status === 404 || error?.response?.status === 404) return [];
      throw error;
    }
  },

  /** Upload a single file for a specific field_key via the dedicated upload endpoint */
  uploadFile: async (
    ticketNumber: string,
    file: File,
    fieldKey: string,
    requestId: number
  ): Promise<{ status: string; field_key: string; s3_url: string; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('field_key', fieldKey);
    formData.append('request_id', String(requestId));
    const { data } = await api.post(
      `/api/proposals/${encodeURIComponent(ticketNumber)}/request-info/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  respond: async (
    ticketNumber: string,
    payload: { request_id: number; response_note: string; updated_fields: Record<string, string> }
  ): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/request-info/respond`, payload);
    return data;
  },

  /** Save partial progress without submitting */
  save: async (
    ticketNumber: string,
    payload: { request_id: number; updated_fields: Record<string, string> }
  ): Promise<{ status: string; saved_fields: string[] }> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/request-info/save`, payload);
    return data;
  },
};

// Contract Queries API
export interface ContractQuery {
  id: number;
  ticket_number?: string;
  type: 'query' | 'response';
  category?: string | null;
  text?: string;
  query_text?: string;
  response_text?: string;
  raised_by?: string;
  raised_by_name?: string;
  raised_by_role?: string;
  parent_query_id?: number | null;
  created_at: string;
  created_by?: string;
  created_by_role?: string;
}

export const contractQueriesApi = {
  list: async (ticketNumber: string): Promise<ContractQuery[]> => {
    const { data } = await api.get(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/queries`);
    return data?.queries || data || [];
  },

  raise: async (ticketNumber: string, queryText: string, category: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/query`, { query_text: queryText, category });
    return data;
  },

  respond: async (ticketNumber: string, queryId: number, responseText: string): Promise<any> => {
    const { data } = await api.post(`/api/proposals/${encodeURIComponent(ticketNumber)}/contract/query/respond`, { query_id: queryId, response_text: responseText });
    return data;
  },
};
