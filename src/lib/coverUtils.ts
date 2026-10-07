import type {
  CoverApproval,
  DesignerCoverApprovalStatus,
  DesignerCoverBinding,
  MetadataResponse,
} from "@/lib/proposalsApi";

/** The approval record can arrive under several keys depending on the backend version. */
export const getCoverApproval = (response: MetadataResponse | null | undefined): CoverApproval | null =>
  (response as any)?.cover_approval ??
  (response as any)?.designer_cover_approval ??
  (response as any)?.approval ??
  null;

/** Normalised designer cover approval status from the metadata response. */
export const getDesignerApprovalStatus = (
  response: MetadataResponse | null | undefined
): DesignerCoverApprovalStatus => {
  const rawStatus = String(
    getCoverApproval(response)?.approval_status ?? (response as any)?.approval_status ?? ""
  )
    .toLowerCase()
    .replace(/\s+/g, "_");
  return rawStatus === "in_review" || rawStatus === "query_raised" || rawStatus === "completed"
    ? (rawStatus as DesignerCoverApprovalStatus)
    : "pending";
};

// eBook is front-only artwork, so it compares best against an AI front cover
const PREVIEW_BINDING_ORDER: DesignerCoverBinding[] = ["ebook", "pb", "hb"];

/** A single designer cover image URL to preview, if any were uploaded. */
export const getDesignerPreviewUrl = (
  covers: Partial<Record<DesignerCoverBinding, { url?: string | null }>>
): string | null => {
  for (const binding of PREVIEW_BINDING_ORDER) {
    const url = covers?.[binding]?.url;
    if (url) return url;
  }
  return null;
};
