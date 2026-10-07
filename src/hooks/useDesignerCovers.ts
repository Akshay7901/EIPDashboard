import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { DesignerCoverBinding, DesignerCoverEntry, MetadataResponse } from "@/lib/proposalsApi";

export type DesignerCoverMap = Partial<Record<DesignerCoverBinding, DesignerCoverEntry & { uploaded?: boolean }>>;

const BINDINGS: DesignerCoverBinding[] = ["hb", "pb", "ebook"];

const pickString = (...vals: unknown[]): string | undefined => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
};

const bindingOf = (value: unknown): DesignerCoverBinding | null => {
  const v = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (v === "hb" || v === "hardback" || v === "hardcover") return "hb";
  if (v === "pb" || v === "paperback" || v === "softcover") return "pb";
  if (v === "ebook" || v === "epub" || v === "digital") return "ebook";
  return null;
};

const toEntry = (c: any): (DesignerCoverEntry & { uploaded?: boolean }) | null => {
  if (!c) return null;
  if (typeof c === "string") return { url: c, uploaded: true };
  const url = pickString(c.url, c.s3_url, c.presigned_url, c.signed_url, c.file_url, c.image_url, c.download_url);
  const filename = pickString(c.filename, c.file_name, c.name);
  if (!url && !filename && !c.uploaded) return null;
  return {
    url: url ?? "",
    filename,
    uploaded_by: pickString(c.uploaded_by),
    uploaded_at: pickString(c.uploaded_at, c.created_at, c.updated_at),
    uploaded: true,
  };
};

/** Accepts the designer-cover payload in any of the shapes the backend has used. */
export const normalizeDesignerCovers = (raw: any): DesignerCoverMap => {
  const out: DesignerCoverMap = {};
  if (!raw) return out;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const b = bindingOf(item?.binding ?? item?.format ?? item?.type ?? item?.cover_type);
      const entry = toEntry(item);
      if (b && entry && !out[b]) out[b] = entry;
    }
    return out;
  }

  if (typeof raw === "object") {
    for (const b of BINDINGS) {
      const entry = toEntry(raw[b] ?? raw[b.toUpperCase()] ?? raw[`cover_${b}`] ?? raw[`${b}_cover`]);
      if (entry) out[b] = entry;
    }
  }
  return out;
};

const coversFromMetadata = (m: MetadataResponse | null | undefined): DesignerCoverMap => {
  const r = m as any;
  return normalizeDesignerCovers(r?.designer_covers ?? r?.covers ?? r?.cover_files ?? r?.designer_cover_files);
};

const hasAnyUrl = (covers: DesignerCoverMap) => BINDINGS.some((b) => !!covers[b]?.url);

// Admin-side list endpoint first, then the designer-side one; either may be unavailable for this role
const FALLBACK_ENDPOINTS = (ticket: string) => [
  `/api/proposals/${encodeURIComponent(ticket)}/designer-covers`,
  `/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/covers`,
];

const fetchFallbackCovers = async (ticket: string): Promise<DesignerCoverMap> => {
  for (const endpoint of FALLBACK_ENDPOINTS(ticket)) {
    try {
      const { data } = await api.get(endpoint);
      const covers = normalizeDesignerCovers(data?.covers ?? data?.designer_covers ?? data);
      if (hasAnyUrl(covers)) return covers;
    } catch {
      // try the next endpoint
    }
  }
  return {};
};

/**
 * Designer covers for a proposal. Uses the metadata payload when it carries image URLs, otherwise
 * falls back to the dedicated cover endpoints so admins can still see what the designer uploaded.
 */
export const useDesignerCovers = (ticketNumber: string, metadata: MetadataResponse | null | undefined) => {
  const fromMetadata = coversFromMetadata(metadata);
  const needsFallback = !!ticketNumber && metadata !== undefined && !hasAnyUrl(fromMetadata);

  const { data: fallback, isLoading } = useQuery({
    queryKey: ["designer-covers", ticketNumber, metadata?.updated_at ?? null],
    queryFn: () => fetchFallbackCovers(ticketNumber),
    enabled: needsFallback,
    retry: false,
    staleTime: 60_000,
  });

  const covers: DesignerCoverMap = needsFallback && fallback && hasAnyUrl(fallback) ? { ...fromMetadata, ...fallback } : fromMetadata;
  return { covers, isLoading: needsFallback && isLoading };
};
