import api from '@/lib/api';

export type CoverBinding = 'hb' | 'pb' | 'ebook';

export interface DesignerCoverSlot {
  binding: CoverBinding;
  uploaded: boolean;
  filename?: string | null;
  uploaded_at?: string | null;
}

export type ApprovalStatus = 'pending' | 'in_review' | 'query_raised' | 'completed';

export interface DesignerProposal {
  ticket_number: string;
  full_title?: string | null;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null; // 'Authored' | 'Edited'
  display_names?: string[] | string | null;
  approval_status?: ApprovalStatus;
  approval?: { status?: string | null; notes?: string | null } | null;
  all_uploaded?: boolean;
  covers?: Partial<Record<CoverBinding, { uploaded?: boolean; filename?: string | null; uploaded_at?: string | null }>>;
  author_cover?: { filename?: string | null; width_px?: number | null; height_px?: number | null } | null;
  [key: string]: any;
}


const BINDINGS: CoverBinding[] = ['hb', 'pb', 'ebook'];
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FUNCTIONS_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const filenameFromContentDisposition = (value?: string | null): string | null => {
  if (!value) return null;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/['"]/g, ''));
  const filenameMatch = value.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ? filenameMatch[1].trim() : null;
};

const pickString = (...vals: any[]): string | null => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

export const normalizeDesignerProposal = (raw: any): DesignerProposal => {
  const covers: DesignerProposal['covers'] = {};
  const rawCovers = raw?.covers || raw?.cover_files || {};
  for (const b of BINDINGS) {
    const c = rawCovers?.[b] || raw?.[`cover_${b}`] || null;
    if (c && (c.uploaded || c.filename || c.url || c.file_name)) {
      covers[b] = {
        uploaded: true,
        filename: pickString(c.filename, c.file_name, c.name),
        uploaded_at: pickString(c.uploaded_at, c.created_at, c.updated_at),
      };
    } else {
      covers[b] = { uploaded: false, filename: null, uploaded_at: null };
    }
  }

  const displayRaw = raw?.display_names ?? raw?.display_name ?? raw?.authors ?? raw?.editors;
  let display_names: string[] = [];
  if (Array.isArray(displayRaw)) {
    display_names = displayRaw.map((x: any) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
  } else if (typeof displayRaw === 'string' && displayRaw.trim()) {
    display_names = [displayRaw.trim()];
  }

  const approvalObj = raw?.approval && typeof raw.approval === 'object' ? raw.approval : null;
  const rawStatus = pickString(raw?.approval_status, approvalObj?.status)?.toLowerCase().replace(/\s+/g, '_');
  const approval_status: ApprovalStatus =
    rawStatus === 'in_review' || rawStatus === 'query_raised' || rawStatus === 'completed'
      ? (rawStatus as ApprovalStatus)
      : 'pending';

  return {
    ...raw,
    ticket_number: raw.ticket_number || raw.ticket || raw.id,
    full_title: pickString(raw.full_title, raw.fullTitle),
    title: pickString(raw.title, raw.book_title),
    subtitle: pickString(raw.subtitle, raw.book_subtitle),
    category: pickString(raw.category, raw.book_type, raw.publication_type),
    display_names,
    covers,
    approval_status,
    approval: approvalObj ? { status: approvalObj.status ?? null, notes: pickString(approvalObj.notes, approvalObj.note, approvalObj.comment) } : null,
    all_uploaded: raw?.all_uploaded ?? BINDINGS.every((b) => covers[b]?.uploaded),
    author_cover: raw?.author_cover
      ? {
          filename: pickString(raw.author_cover.filename, raw.author_cover.file_name),
          width_px: raw.author_cover.width_px ?? null,
          height_px: raw.author_cover.height_px ?? null,
        }
      : null,
  };
};

export interface DesignerListResult {
  proposals: DesignerProposal[];
  summary?: { pending: number; in_review: number; completed: number; query_raised: number } | null;
  total?: number | null;
}

export const designerApi = {
  list: async (status?: string): Promise<DesignerListResult> => {
    const { data } = await api.get('/api/proposals/designer/proposals', {
      params: status ? { status } : undefined,
    });
    const arr = Array.isArray(data) ? data : data?.proposals || data?.data || [];
    return {
      proposals: arr.map(normalizeDesignerProposal),
      summary: data?.summary ?? null,
      total: data?.total ?? null,
    };
  },


  uploadCover: async (ticket: string, binding: CoverBinding, file: File): Promise<any> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/cover/${binding}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  uploadCoverSingle: async (ticket: string, file: File): Promise<any> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/cover`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  getCoverUrl: async (ticket: string, binding: CoverBinding): Promise<string> => {
    const { data } = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/cover/${binding}`
    );
    return data?.url || data?.presigned_url || data?.signed_url || '';
  },

  getCovers: async (
    ticket: string
  ): Promise<{
    all_uploaded: boolean;
    covers: Partial<Record<CoverBinding, { url?: string; filename?: string | null; uploaded_at?: string | null }>>;
  }> => {
    const { data } = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/covers`
    );
    return {
      all_uploaded: !!data?.all_uploaded,
      covers: data?.covers && typeof data.covers === 'object' ? data.covers : {},
    };
  },

  getAuthorCoverUrl: async (ticket: string): Promise<{ url: string; filename?: string | null }> => {
    const { data } = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/author-cover`
    );
    return {
      url: data?.url || data?.presigned_url || data?.signed_url || '',
      filename: data?.filename || null,
    };
  },

  getAuthorCoverDownloadUrl: async (ticket: string): Promise<{ url: string; filename?: string | null }> => {
    const { data } = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/author-cover`,
      { params: { download: true, disposition: 'attachment' } }
    );
    return {
      url: data?.download_url || data?.url || data?.presigned_url || data?.signed_url || '',
      filename: data?.filename || null,
    };
  },

  downloadAuthorCover: async (ticket: string): Promise<{ blob: Blob; filename?: string | null }> => {
    // Primary path: signed URL from the EthicsPress API (no Cloud dependency).
    let signed: { url: string; filename?: string | null } | null = null;
    try {
      signed = await designerApi.getAuthorCoverDownloadUrl(ticket);
      if (signed.url) {
        const direct = await fetch(signed.url);
        if (direct.ok) {
          return {
            blob: await direct.blob(),
            filename:
              filenameFromContentDisposition(direct.headers.get('content-disposition')) ||
              signed.filename ||
              null,
          };
        }
      }
    } catch {
      // S3 CORS blocked the direct fetch — try the proxy next.
    }

    // Fallback: edge-function proxy (only works while Cloud is awake).
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Please sign in again.');
    try {
      const response = await fetch(
        `${FUNCTIONS_URL}/download-author-cover?ticket=${encodeURIComponent(ticket)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}`, apikey: FUNCTIONS_KEY } }
      );
      if (response.ok) {
        return {
          blob: await response.blob(),
          filename: filenameFromContentDisposition(response.headers.get('content-disposition')),
        };
      }
    } catch {
      // Proxy unreachable (backend asleep/paused).
    }

    throw new Error('Download failed.');
  },
};