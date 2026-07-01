import React, { useState, useEffect } from "react";
import { CheckCircle2, Plus, Trash2, Upload, ImageIcon, Loader2, Check, X, AlertCircle, FileImage } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { metadataApi, metadataQueriesApi, type MetadataQuery } from "@/lib/proposalsApi";
import type { Proposal } from "@/types";
import { statusIs } from "@/lib/statusUtils";

interface AuthorPublicationMetadataProps {
  proposal: Proposal;
  contractSigned?: boolean;
  ticketNumber: string;
  readOnly?: boolean;
}

/* ---- Read-only row ---- */
const ReadOnlyRow: React.FC<{ label: string; sublabel?: string; value?: string | null }> = ({
  label,
  sublabel,
  value,
}) => (
  <div className="grid grid-cols-[200px_1fr] border-b border-border">
    <div className="py-3 px-4 text-sm font-medium text-muted-foreground bg-muted/30">
      {label}
      {sublabel && (
        <span className="block text-xs font-normal text-muted-foreground/60">{sublabel}</span>
      )}
    </div>
    <div className="py-3 px-4 text-sm text-foreground bg-muted/20 whitespace-pre-line break-words">
      {value || "—"}
    </div>
  </div>
);

/* ---- Editable row ---- */
interface EditableRowProps {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: "text" | "email" | "textarea";
  helpText?: string;
}

const EditableRow: React.FC<EditableRowProps> = ({
  label,
  sublabel,
  value,
  onChange,
  disabled,
  type = "text",
  helpText,
}) => (
  <div className="grid grid-cols-[200px_1fr] border-b border-border">
    <div className="py-3 px-4 text-sm font-medium text-muted-foreground bg-muted/30">
      {label}
      {sublabel && (
        <span className="block text-xs font-normal text-muted-foreground/60">{sublabel}</span>
      )}
    </div>
    <div className="py-2 px-4 flex flex-col gap-1">
      {type === "textarea" ? (
        <Textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }
          }}
          disabled={disabled}
          className={`resize-none overflow-hidden ${disabled ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : ""}`}
          rows={1}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={disabled ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : ""}
        />
      )}
      {helpText && <p className="text-xs text-muted-foreground/70 italic">{helpText}</p>}
    </div>
  </div>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="bg-[#3d5a47] text-white py-2.5 px-4">
    <p className="text-sm font-semibold uppercase tracking-wide">{title}</p>
  </div>
);

interface AdditionalPerson {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ChangeRequestField {
  field: string;
  newValue: string;
}

const AuthorPublicationMetadata: React.FC<AuthorPublicationMetadataProps> = ({
  proposal,
  contractSigned,
  ticketNumber,
  readOnly = false,
}) => {
  const queryClient = useQueryClient();

  // Fetch metadata from API
  const { data: metadataResponse, isLoading: metadataLoading } = useQuery({
    queryKey: ["metadata", ticketNumber],
    queryFn: () => metadataApi.get(ticketNumber),
    enabled: !!ticketNumber,
  });

  // Fetch metadata queries
  const { data: metadataQueries = [] } = useQuery({
    queryKey: ["metadata-queries", ticketNumber],
    queryFn: () => metadataQueriesApi.list(ticketNumber),
    enabled: !!ticketNumber && !!metadataResponse,
  });

  const metadataStatus = metadataResponse?.metadata_status;
  const isApproved =
    metadataStatus === "approved" ||
    metadataStatus === "author_approved" ||
    statusIs(proposal.status || "", "author_approved", "approved") ||
    statusIs(proposal.internal_status || "", "author_approved", "approved");

  const isLocked =
    metadataStatus === "locked" ||
    statusIs(proposal.status || "", "locked") ||
    statusIs(proposal.internal_status || "", "locked");

  // Check if author has a pending (unanswered) query
  const hasPendingQuery = metadataQueries.some(
    (q) => q.type === 'query' && !metadataQueries.some((r) => r.type === 'response' && r.parent_query_id === q.id)
  );

  const apiMeta = metadataResponse?.metadata;
  const primaryAuthor = apiMeta?.authors?.[0];

  // Derive values from API, fallback to proposal
  const metaTitle = apiMeta?.title || proposal.name || "";
  const metaSubtitle = apiMeta?.subtitle || proposal.sub_title || "";
  const titleFull = apiMeta?.full_title || [metaTitle, metaSubtitle].filter(Boolean).join(": ");
  const category = apiMeta?.category || proposal.book_type || "Author";
  const displayNames = apiMeta?.display_names || proposal.corresponding_author_name || proposal.author_name || "";
  const displayBios = apiMeta?.display_bios || proposal.biography || "";
  const bookDescription = apiMeta?.book_description || proposal.short_description || "";
  const keywordsVal = apiMeta?.keywords || proposal.keywords || "";

  // Primary author fields from API
  const authorSalutation = primaryAuthor?.title || "";
  const authorFirstName = primaryAuthor?.first_name || "";
  const authorLastName = primaryAuthor?.last_name || "";
  const authorEmail = primaryAuthor?.email || proposal.author_email || "";
  const authorEmail2 = primaryAuthor?.email_2 || proposal.secondary_email || "";
  const authorInstitution = primaryAuthor?.institution || proposal.institution || "";
  const authorCountry = primaryAuthor?.country || proposal.country || "";

  // Additional authors from API (skip first)
  const additionalAuthors = (apiMeta?.authors || []).slice(1);

  const isAuthorType = category.toLowerCase().includes("author");

  // Cover image from metadata response
  const coverImageData = metadataResponse?.cover_image || null;

  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [coverImageSource, setCoverImageSource] = useState("");
  const [coverImagePermission, setCoverImagePermission] = useState(false);
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false);
  const [deletingCoverImage, setDeletingCoverImage] = useState(false);
  const [coverImageValidation, setCoverImageValidation] = useState<{
    fileName?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    dpi?: number | null;
    errors: string[];
    isValid: boolean;
  } | null>(null);

  // Sync API cover image data to local preview
  useEffect(() => {
    if (coverImageData?.s3_url && !coverImageFile) {
      setCoverImagePreview(coverImageData.s3_url);
    }
  }, [coverImageData, coverImageFile]);

  // Change request
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [submittingQuery, setSubmittingQuery] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestField[]>([
    { field: "", newValue: "" },
  ]);

  const MIN_DIMENSION = 2360;
  const MAX_FILE_SIZE_MB = 10;
  const MIN_DPI = 200;

  const validateImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error("Could not read image file."));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  /** Parse DPI from JPEG JFIF (APP0) or EXIF (APP1) headers */
  const extractJpegDpi = (buffer: ArrayBuffer): number | null => {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xFFD8) return null; // Not JPEG

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFDA) break; // Start of scan – stop

      const segLen = view.getUint16(offset + 2);

      // JFIF APP0
      if (marker === 0xFFE0 && segLen >= 14) {
        const units = view.getUint8(offset + 11);
        const xDensity = view.getUint16(offset + 12);
        const yDensity = view.getUint16(offset + 14);
        if (units === 1 && xDensity > 0 && yDensity > 0) {
          return Math.min(xDensity, yDensity); // DPI
        }
        if (units === 2 && xDensity > 0 && yDensity > 0) {
          return Math.min(Math.round(xDensity * 2.54), Math.round(yDensity * 2.54)); // dots/cm → DPI
        }
      }

      // EXIF APP1
      if (marker === 0xFFE1) {
        const exifStart = offset + 4;
        // Check "Exif\0\0"
        if (
          view.getUint8(exifStart) === 0x45 && view.getUint8(exifStart + 1) === 0x78 &&
          view.getUint8(exifStart + 2) === 0x69 && view.getUint8(exifStart + 3) === 0x66
        ) {
          const tiffStart = exifStart + 6;
          const isLE = view.getUint16(tiffStart) === 0x4949;
          const getU16 = (o: number) => view.getUint16(o, isLE);
          const getU32 = (o: number) => view.getUint32(o, isLE);

          try {
            const ifdOffset = getU32(tiffStart + 4);
            const ifdStart = tiffStart + ifdOffset;
            const entries = getU16(ifdStart);
            let xRes: number | null = null;
            let yRes: number | null = null;
            let resUnit = 2; // default inches

            for (let i = 0; i < entries; i++) {
              const entryOff = ifdStart + 2 + i * 12;
              if (entryOff + 12 > view.byteLength) break;
              const tag = getU16(entryOff);
              const type = getU16(entryOff + 2);

              if (tag === 0x011A && type === 5) { // XResolution RATIONAL
                const valOff = tiffStart + getU32(entryOff + 8);
                if (valOff + 8 <= view.byteLength) {
                  xRes = getU32(valOff) / getU32(valOff + 4);
                }
              }
              if (tag === 0x011B && type === 5) { // YResolution RATIONAL
                const valOff = tiffStart + getU32(entryOff + 8);
                if (valOff + 8 <= view.byteLength) {
                  yRes = getU32(valOff) / getU32(valOff + 4);
                }
              }
              if (tag === 0x0128) { // ResolutionUnit
                resUnit = getU32(entryOff + 8);
              }
            }

            if (xRes != null && yRes != null && xRes > 0 && yRes > 0) {
              let dpi = Math.min(xRes, yRes);
              if (resUnit === 3) dpi = Math.round(dpi * 2.54); // cm → inches
              return dpi;
            }
          } catch {
            // EXIF parse failed – fall through
          }
        }
      }

      offset += 2 + segLen;
    }
    return null;
  };

  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const errors: string[] = [];
    const fileName = file.name;
    const fileSize = file.size;
    let width = 0;
    let height = 0;
    let dpi: number | null = null;

    // File type check
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      errors.push(`Invalid file type "${file.type.split("/")[1]?.toUpperCase() || "unknown"}". Only JPG and PNG files are accepted.`);
    }

    // File size check
    if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
      errors.push(`File size ${(fileSize / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
    }

    // Dimension & DPI check (only if file type is valid image)
    if (["image/jpeg", "image/png"].includes(file.type)) {
      try {
        const dims = await validateImageDimensions(file);
        width = dims.width;
        height = dims.height;
      } catch {
        errors.push("Could not read image dimensions. The file may be corrupted.");
      }

      // DPI check (JPEG only — PNG DPI parsing left to API)
      if (file.type === "image/jpeg") {
        try {
          const buffer = await file.arrayBuffer();
          dpi = extractJpegDpi(buffer);
          if (dpi === null) {
            errors.push(`Could not read DPI metadata from the image. Please ensure the file has DPI information embedded (minimum ${MIN_DPI} DPI).`);
          } else if (dpi < MIN_DPI) {
            errors.push(`Image resolution is ${dpi} DPI, which is below the minimum ${MIN_DPI} DPI required.`);
          }
        } catch {
          errors.push("Could not read DPI metadata from the image.");
        }
      }
    }

    setCoverImageValidation({ fileName, fileSize, width, height, dpi, errors, isValid: errors.length === 0 });

    if (errors.length > 0) {
      setCoverImageFile(null);
      const reader = new FileReader();
      reader.onload = () => setCoverImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }

    setCoverImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setCoverImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadCoverImage = async () => {
    if (!coverImageFile) return;
    if (!coverImageSource.trim()) {
      toast({ title: "Image Source / Credit required", description: "Please provide the image source or credit information.", variant: "destructive" });
      return;
    }
    if (!coverImagePermission) {
      toast({ title: "Permission required", description: "Please confirm you hold the necessary rights for this image.", variant: "destructive" });
      return;
    }
    setUploadingCoverImage(true);
    try {
      await metadataApi.uploadCoverImage(ticketNumber, coverImageFile, coverImageSource || undefined);
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      setCoverImageFile(null);
      toast({ title: "Cover image uploaded", description: "Your cover image has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Could not upload cover image.", variant: "destructive" });
    } finally {
      setUploadingCoverImage(false);
    }
  };

  const handleDeleteCoverImage = async () => {
    setDeletingCoverImage(true);
    try {
      await metadataApi.deleteCoverImage(ticketNumber);
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      setCoverImageFile(null);
      setCoverImagePreview(null);
      setCoverImageSource("");
      setCoverImagePermission(false);
      setCoverImageValidation(null);
      toast({ title: "Cover image removed" });
    } catch (err: any) {
      toast({ title: "Failed to remove", description: err?.message || "Could not remove cover image.", variant: "destructive" });
    } finally {
      setDeletingCoverImage(false);
    }
  };

  const addChangeRequestRow = () => {
    setChangeRequests((prev) => [...prev, { field: "", newValue: "" }]);
  };

  const updateChangeRequest = (idx: number, key: keyof ChangeRequestField, value: string) => {
    setChangeRequests((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r))
    );
  };

  const removeChangeRequest = (idx: number) => {
    setChangeRequests((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasCoverImage = !!coverImageFile || !!coverImageData?.s3_url;

  const sectionLabel = isAuthorType ? "Primary Author(s)" : "Primary Editor(s)";

  const additionalLabel = isAuthorType ? "Author" : "Editor";
  const additionalFieldOptions = additionalAuthors.flatMap((_, idx) => {
    const prefix = `Additional ${additionalLabel} ${idx + 1}`;
    return [
      `${prefix} - Salutation`,
      `${prefix} - First name`,
      `${prefix} - Last name`,
      `${prefix} - Email`,
    ];
  });

  const FIELD_OPTIONS = [
    "Title",
    "Subtitle",
    "Category Auth/Ed",
    "Display Name(s)",
    "Display bio(s)",
    "Salutation",
    "First name",
    "Last name",
    "Email",
    "Email 2",
    "Institution",
    "Country",
    ...additionalFieldOptions,
    "Book description",
    "Keywords/Tags",
  ];

  const handleSubmitChangeRequests = async () => {
    const validRequests = changeRequests.filter((r) => r.field && r.newValue.trim());
    if (validRequests.length === 0) {
      toast({ title: "No changes", description: "Please specify at least one field and its new value." });
      return;
    }

    setSubmittingQuery(true);
    try {
      const fields = validRequests.map((r) => r.field.toLowerCase().replace(/[\s/()]+/g, "_"));
      const queryText = validRequests.length === 1 && validRequests[0].field === "Book description"
        ? validRequests[0].newValue.trim()
        : validRequests.map((r) => `**${r.field}**: ${r.newValue}`).join("\n");

      await metadataQueriesApi.raise(ticketNumber, queryText, fields);
      queryClient.invalidateQueries({ queryKey: ["metadata-queries", ticketNumber] });
      toast({ title: "Request submitted", description: "Your change request has been sent to the reviewer." });
      setRequestingChanges(false);
      setChangeRequests([{ field: "", newValue: "" }]);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message || "Could not submit change request.", variant: "destructive" });
    } finally {
      setSubmittingQuery(false);
    }
  };

  const [finalising, setFinalising] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);

  const handleFinalise = async () => {
    setFinalising(true);
    try {
      // Upload pending cover image before finalising
      if (coverImageFile && coverImagePermission) {
        await metadataApi.uploadCoverImage(ticketNumber, coverImageFile, coverImageSource || undefined);
        queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
        setCoverImageFile(null);
      }
      await metadataApi.approve(ticketNumber, {
        notes: hasCoverImage
          ? "Author approved metadata with cover image."
          : "Author approved metadata without cover image — publisher will use default cover.",
      });
      queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });
      queryClient.invalidateQueries({ queryKey: ["proposal"] });
      setShowFinaliseConfirm(false);
      toast({
        title: "Publication data finalised",
        description: hasCoverImage
          ? "Your publication data and cover image have been submitted and locked."
          : "Your publication data has been submitted and locked. No cover image was provided — the publisher will use a default cover.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to finalise",
        description: err?.response?.data?.message || err?.message || "Could not approve metadata.",
        variant: "destructive",
      });
    } finally {
      setFinalising(false);
    }
  };

  if (metadataLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading metadata...</span>
      </div>
    );
  }

  // If no metadata returned (404 = not yet sent by reviewer), show a message
  if (!metadataResponse) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Publication metadata is not available yet. The reviewer has not sent it for your approval.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Introductory text */}
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Please review the below publication data and upload a cover image if applicable.</p>
        <p>
          We have prepared a description of your book for our website and for external listings, mostly derived from your proposal form. It also includes contact data, such as your email, which will not be displayed, but which forms part of our records, and which will be used when we send copies of your book.
        </p>
        <p>
          If you wish to make changes to the publication data, you can submit a request for changes below. Once submitted, these requests will be assessed by your editor.
        </p>
      </div>

      {isApproved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Metadata has been approved and locked. No further changes can be made.
        </div>
      )}


      <div className="space-y-0 border border-border rounded-lg overflow-hidden">
        {/* Publication Metadata — READ ONLY */}

        <ReadOnlyRow label="Title Full" value={titleFull} />
        <ReadOnlyRow label="Title" value={metaTitle} />
        <ReadOnlyRow label="Subtitle" value={metaSubtitle} />
        <ReadOnlyRow label="Category Auth/Ed" value={category} />

        {/* Primary Author(s) — READ ONLY from API */}
        <SectionHeader title={sectionLabel} />

        <ReadOnlyRow label="Display Name(s)" value={displayNames} />
        <ReadOnlyRow label="Display bio(s)" value={displayBios} />
        <ReadOnlyRow label="Salutation" value={authorSalutation} />
        <ReadOnlyRow label="First name" value={authorFirstName} />
        <ReadOnlyRow label="Last name" value={authorLastName} />
        <ReadOnlyRow label="Email" value={authorEmail} />
        <ReadOnlyRow label="Email 2" value={authorEmail2} />
        <ReadOnlyRow label="Institution" value={authorInstitution} />
        <ReadOnlyRow label="Country" value={authorCountry} />

        {/* Additional authors from API */}
        {additionalAuthors.map((person, idx) => (
          <React.Fragment key={idx}>
            <div className="bg-muted/50 py-2 px-4 flex items-center justify-between border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Additional {isAuthorType ? "Author" : "Editor"} {idx + 1}
              </p>
            </div>
            <ReadOnlyRow label="Salutation" value={person.title} />
            <ReadOnlyRow label="First name" value={person.first_name} />
            <ReadOnlyRow label="Last name" value={person.last_name} />
            <ReadOnlyRow label="Email" value={person.email} />
          </React.Fragment>
        ))}

        {/* Book Information — READ ONLY */}
        <SectionHeader title="Book Information" />

        <ReadOnlyRow label="Book description" value={bookDescription} />
        <ReadOnlyRow label="Keywords/Tags" value={keywordsVal} />

        {/* Cover Image — moved to bottom */}
        <SectionHeader title="Cover Image" />

        <div className="p-4 space-y-4 border-b border-border">
          {/* If cover image is already saved to API, show read-only view */}
          {coverImageData?.s3_url && !coverImageFile ? (
            <div className="space-y-3">
              <div className="flex items-start gap-4">
                <div className="relative w-32 h-44 rounded-md overflow-hidden border-2 border-border">
                  <img src={coverImageData.s3_url} alt="Cover preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1.5 text-sm">
                  {coverImageData.filename && (
                    <p><span className="font-semibold text-foreground">File:</span> <span className="text-foreground">{coverImageData.filename}</span></p>
                  )}
                  {(coverImageData.width_px > 0 || coverImageData.height_px > 0) && (
                    <p><span className="font-semibold text-foreground">Dimensions:</span> <span className="text-foreground">{coverImageData.width_px} × {coverImageData.height_px}px</span></p>
                  )}
                  {coverImageData.dpi > 0 && (
                    <p><span className="font-semibold text-foreground">DPI:</span> <span className="text-foreground">{coverImageData.dpi}</span></p>
                  )}
                  {coverImageData.file_size_bytes > 0 && (
                    <p><span className="font-semibold text-foreground">Size:</span> <span className="text-foreground">{(coverImageData.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</span></p>
                  )}
                  {coverImageData.uploaded_at && (
                    <p><span className="font-semibold text-foreground">Uploaded:</span> <span className="text-foreground">{new Date(coverImageData.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span></p>
                  )}
                  {coverImageData.source && (
                    <p><span className="font-semibold text-foreground">Image Source / Credit:</span> <span className="text-foreground">{coverImageData.source}</span></p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Requirements list */}
              <div className="space-y-3">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    You are welcome to submit a proposed cover image for consideration. If you do not provide one, we will use a plain default cover.
                  </p>
                  <p>Please ensure your image meets the following requirements before uploading:</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { label: "File type", value: "JPG or PNG" },
                    { label: "Minimum resolution", value: `${MIN_DPI} × ${MIN_DPI} dpi` },
                    { label: "Maximum file size", value: `${MAX_FILE_SIZE_MB} MB` },
                  ].map((req) => (
                    <div key={req.label} className="flex items-center gap-1.5 rounded-md bg-muted/30 px-3 py-2 border border-border">
                      <FileImage className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        <span className="font-medium">{req.label}:</span> {req.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 text-sm text-muted-foreground pt-1">
                  <div>
                    <p className="font-medium text-foreground">How to upload</p>
                    <p>
                      Click the upload button below to select your image. Once submitted, your image will be reviewed and you will be notified of the outcome.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">If your image is rejected</p>
                    <p>
                      If your image does not meet the required specifications, the reason will be displayed in red below. In this case, you may use one of the tools below to resize or compress your image before resubmitting:
                    </p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      <li>
                        <a href="https://imageresizer.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                          Resize your image
                        </a>
                      </li>
                      <li>
                        <a href="https://convert.town/image-dpi" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                          Compress your image
                        </a>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Need help?</p>
                    <p>
                      <a href="mailto:robert.blair@ethicspress.com" className="text-primary underline-offset-2 hover:underline">
                        Contact Robert
                      </a>
                    </p>
                  </div>
                  <p className="italic">Once adjusted, simply upload your image again using the button below.</p>
                </div>
              </div>

              {metadataLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading cover image...
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  {coverImagePreview ? (
                    <div className={`relative w-32 h-44 rounded-md overflow-hidden border-2 ${coverImageValidation && !coverImageValidation.isValid ? 'border-destructive' : 'border-border'}`}>
                      <img src={coverImagePreview} alt="Cover preview" className="w-full h-full object-cover" />
                      {!isApproved && !readOnly && (
                        <button
                          onClick={() => {
                            setCoverImageFile(null);
                            setCoverImagePreview(null);
                            setCoverImageValidation(null);
                          }}
                          disabled={deletingCoverImage}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80"
                          title="Remove cover image"
                        >
                          {deletingCoverImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-32 h-44 rounded-md border-2 border-dashed border-border bg-muted/20">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      <span className="text-[10px] text-muted-foreground mt-1">No image</span>
                    </div>
                  )}
                  {!isApproved && !readOnly && (
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label htmlFor="cover-upload" className="cursor-pointer">
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <span>
                              <Upload className="h-3.5 w-3.5" />
                              {coverImageFile ? "Replace Image" : "Upload Image"}
                            </span>
                          </Button>
                        </Label>
                        <input
                          id="cover-upload"
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleCoverImageChange}
                        />
                      </div>

                      {/* Inline validation feedback */}
                      {coverImageValidation && (
                        <div className={`rounded-md p-3 text-xs space-y-1.5 border ${coverImageValidation.isValid ? 'bg-emerald-50 border-emerald-200' : 'bg-destructive/5 border-destructive/30'}`}>
                          <div className="flex items-center gap-2 font-medium">
                            {coverImageValidation.isValid ? (
                              <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> <span className="text-emerald-800">Image meets all requirements</span></>
                            ) : (
                              <><AlertCircle className="h-3.5 w-3.5 text-destructive" /> <span className="text-destructive">Image does not meet requirements</span></>
                            )}
                          </div>
                          <div className="space-y-0.5 text-muted-foreground">
                            {coverImageValidation.fileName && (
                              <p>File: <span className="font-medium text-foreground">{coverImageValidation.fileName}</span></p>
                            )}
                            {coverImageValidation.fileSize != null && (
                              <p>Size: <span className={`font-medium ${coverImageValidation.fileSize > MAX_FILE_SIZE_MB * 1024 * 1024 ? 'text-destructive' : 'text-foreground'}`}>
                                {(coverImageValidation.fileSize / (1024 * 1024)).toFixed(2)}MB
                              </span> <span className="text-muted-foreground/60">(max {MAX_FILE_SIZE_MB}MB)</span></p>
                            )}
                            {(coverImageValidation.width > 0 || coverImageValidation.height > 0) && (
                              <p>Dimensions: <span className={`font-medium ${(coverImageValidation.width < MIN_DIMENSION || coverImageValidation.height < MIN_DIMENSION) ? 'text-destructive' : 'text-foreground'}`}>
                                {coverImageValidation.width}×{coverImageValidation.height}px
                              </span> <span className="text-muted-foreground/60">(min {MIN_DIMENSION}×{MIN_DIMENSION}px)</span></p>
                            )}
                            {coverImageValidation.dpi !== undefined && (
                              <p>DPI: <span className={`font-medium ${coverImageValidation.dpi === null || coverImageValidation.dpi < MIN_DPI ? 'text-destructive' : 'text-foreground'}`}>
                                {coverImageValidation.dpi === null ? 'Not found' : coverImageValidation.dpi}
                              </span> <span className="text-muted-foreground/60">(min {MIN_DPI} DPI)</span></p>
                            )}
                          </div>
                          {coverImageValidation.errors.length > 0 && (
                            <ul className="list-disc list-inside text-destructive space-y-0.5 pt-1">
                              {coverImageValidation.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label htmlFor="cover-source" className="text-xs text-muted-foreground">
                          Image Source / Credit <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="cover-source"
                          placeholder="e.g. Shutterstock, original artwork, author photo..."
                          value={coverImageSource}
                          onChange={(e) => setCoverImageSource(e.target.value)}
                        />
                      </div>

                      {coverImageFile && (
                        <>
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id="cover-permission"
                              checked={coverImagePermission}
                              onCheckedChange={(checked) => setCoverImagePermission(checked === true)}
                            />
                            <Label htmlFor="cover-permission" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                              I confirm that I hold the necessary rights and permissions to use this image for publication purposes.
                            </Label>
                          </div>

                          <Button
                            size="sm"
                            className="gap-1.5 bg-[#2f4b40] hover:opacity-90 text-white"
                            onClick={handleUploadCoverImage}
                            disabled={uploadingCoverImage || !coverImagePermission || !coverImageSource.trim()}
                          >
                            {uploadingCoverImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            Save Cover Image
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Previous Queries Thread */}
      {metadataQueries.length > 0 && (
        <div className="space-y-3 border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold">Queries</h4>
          <div className="space-y-2">
            {metadataQueries.map((q) => (
              <div key={q.id} className={`rounded-md p-3 text-sm ${q.type === 'query' ? 'bg-muted/40 border border-border' : 'bg-emerald-50 border border-emerald-200 ml-4'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {q.raised_by_name || q.raised_by} ({q.raised_by_role})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-line" dangerouslySetInnerHTML={{ __html: (q.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Requests Section */}
      {!isApproved && !isLocked && !readOnly && !statusIs(proposal.status || '', 'declined', 'rejected') && !statusIs(proposal.internal_status || '', 'declined', 'rejected') && (
        <>
          {requestingChanges ? (
            <div className="space-y-3 border border-amber-200 bg-amber-50/50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-amber-900">Request Changes to Metadata</h4>
              {changeRequests.map((cr, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Select value={cr.field} onValueChange={(v) => updateChangeRequest(idx, "field", v)}>
                    <SelectTrigger className="w-48 text-sm"><SelectValue placeholder="Select field" /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex-1 space-y-1">
                    {cr.field === "Book description" ? (
                      <Textarea
                        placeholder="Requested new value"
                        value={cr.newValue}
                        onChange={(e) => updateChangeRequest(idx, "newValue", e.target.value)}
                        rows={4}
                        className="text-sm bg-background"
                      />
                    ) : (
                      <Input placeholder="Requested new value" value={cr.newValue} onChange={(e) => updateChangeRequest(idx, "newValue", e.target.value)} className="text-sm" />
                    )}
                  </div>
                  {changeRequests.length > 1 && <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeChangeRequest(idx)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1" onClick={addChangeRequestRow}><Plus className="h-3 w-3" /> Add Field</Button>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => { setRequestingChanges(false); setChangeRequests([{ field: "", newValue: "" }]); }}>
                  Cancel
                </Button>
                <Button size="sm" className="bg-[#2f4b40] hover:opacity-90 text-white" onClick={handleSubmitChangeRequests} disabled={submittingQuery}>
                  {submittingQuery && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Submit Change Request
                </Button>
              </div>
            </div>
          ) : null}

          {/* Bottom actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {!isApproved && (<>
            {!requestingChanges && (
              <Button variant="outline" onClick={() => setRequestingChanges(true)} disabled={hasPendingQuery}>
                Request changes
              </Button>
            )}
            <Button
              className="bg-[#2f4b40] hover:opacity-90 text-white px-6"
              onClick={() => {
                if (coverImageFile && !coverImageSource.trim()) {
                  toast({ title: "Image Source / Credit required", description: "Please provide the image source or credit information before finalising.", variant: "destructive" });
                  return;
                }
                setShowFinaliseConfirm(true);
              }}
              disabled={hasPendingQuery || finalising}
            >
              Finalise &amp; Submit Data
            </Button>
            {hasPendingQuery && (
              <span className="text-xs text-amber-600">Cannot finalise while a query is pending</span>
            )}
            </>)}
            {isApproved && (
              <span className="text-xs text-emerald-700">You have approved the publication data.</span>
            )}
          </div>

          <AlertDialog open={showFinaliseConfirm} onOpenChange={setShowFinaliseConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finalise Publication data</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>The details shown will be used exactly as they appear below. If any information is incorrect or requires updating, please make your amendments directly in the relevant fields before clicking "Finalise Metadata". Do not add notes or comments within the fields themselves.</p>
                {hasCoverImage ? (
                  <p>As you have provided a cover image, we will prepare your cover using this content. Images must be cleared of all copyrights and permissions and you must provide full information on source and ownership.</p>
                ) : (
                  <p>As you have not provided a cover image, we will prepare a cover in line with our house style. The cover will be a neutral/abstract design, with the title and author/editor name clearly displayed. Once complete, it will not be able to be amended.</p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  className="bg-[#8B0000] hover:bg-[#6B0000] text-white"
                  onClick={handleFinalise}
                  disabled={finalising}
                >
                  {finalising && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Finalise Publication data
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
};

export default AuthorPublicationMetadata;
