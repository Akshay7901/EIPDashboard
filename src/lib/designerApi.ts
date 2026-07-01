import api from '@/lib/api';

export type CoverBinding = 'hb' | 'pb' | 'ebook';

export interface DesignerCoverSlot {
  binding: CoverBinding;
  uploaded: boolean;
  filename?: string | null;
  uploaded_at?: string | null;
}

export interface DesignerProposal {
  ticket_number: string;
  full_title?: string | null;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null; // 'Authored' | 'Edited'
  display_names?: string[] | string | null;
  covers?: Partial<Record<CoverBinding, { uploaded?: boolean; filename?: string | null; uploaded_at?: string | null }>>;
  author_cover?: { filename?: string | null; width_px?: number | null; height_px?: number | null } | null;
  [key: string]: any;
}

const BINDINGS: CoverBinding[] = ['hb', 'pb', 'ebook'];

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

  return {
    ...raw,
    ticket_number: raw.ticket_number || raw.ticket || raw.id,
    full_title: pickString(raw.full_title, raw.fullTitle),
    title: pickString(raw.title, raw.book_title),
    subtitle: pickString(raw.subtitle, raw.book_subtitle),
    category: pickString(raw.category, raw.book_type, raw.publication_type),
    display_names,
    covers,
    author_cover: raw?.author_cover
      ? {
          filename: pickString(raw.author_cover.filename, raw.author_cover.file_name),
          width_px: raw.author_cover.width_px ?? null,
          height_px: raw.author_cover.height_px ?? null,
        }
      : null,
  };
};

export const designerApi = {
  list: async (): Promise<DesignerProposal[]> => {
    const { data } = await api.get('/api/proposals/designer/proposals');
    const arr = Array.isArray(data) ? data : data?.proposals || data?.data || [];
    return arr.map(normalizeDesignerProposal);
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

  getCoverUrl: async (ticket: string, binding: CoverBinding): Promise<string> => {
    const { data } = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/cover/${binding}`
    );
    return data?.url || data?.presigned_url || data?.signed_url || '';
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
    const response = await api.get(
      `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/author-cover`,
      {
        params: { download: true, disposition: 'attachment' },
        responseType: 'blob',
        headers: { Accept: 'image/*,application/octet-stream,application/json' },
      }
    );

    const blob = response.data as Blob;
    const contentType = response.headers?.['content-type'] || blob.type || '';
    const headerFilename = filenameFromContentDisposition(response.headers?.['content-disposition']);

    if (contentType.includes('application/json')) {
      const payload = JSON.parse(await blob.text());
      const url = payload?.download_url || payload?.url || payload?.presigned_url || payload?.signed_url;
      if (!url) throw new Error('No image URL returned.');
      const imageResponse = await fetch(url);
      if (!imageResponse.ok) throw new Error('Download failed.');
      return {
        blob: await imageResponse.blob(),
        filename: payload?.filename || headerFilename || null,
      };
    }

    return { blob, filename: headerFilename };
  },
};