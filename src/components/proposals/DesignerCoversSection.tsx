import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
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
import {
  designerCoversApi,
  metadataApi,
  type DesignerCoverBinding,
  type MetadataResponse,
} from "@/lib/proposalsApi";

const BINDINGS: DesignerCoverBinding[] = ["hb", "pb", "ebook"];
const BINDING_LABELS: Record<DesignerCoverBinding, string> = {
  hb: "Hardback",
  pb: "Paperback",
  ebook: "eBook",
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "tif", "tiff"];
const isAllowedImage = (file: File) => {
  if (ALLOWED_MIME.includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_EXT.includes(ext);
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

const errMsg = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

interface DesignerCoversSectionProps {
  ticketNumber: string;
  /** Designer role: can upload / re-upload / delete. */
  canManage?: boolean;
  /** Optional pre-fetched metadata (avoids a duplicate request). */
  metadata?: MetadataResponse | null;
  className?: string;
}

const DesignerCoversSection: React.FC<DesignerCoversSectionProps> = ({
  ticketNumber,
  canManage = false,
  metadata,
  className,
}) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [downloading, setDownloading] = useState<DesignerCoverBinding | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const { data: fetched } = useQuery({
    queryKey: ["metadata", ticketNumber],
    queryFn: () => metadataApi.get(ticketNumber),
    enabled: !metadata && !!ticketNumber,
    staleTime: 0,
    refetchInterval: 300000,
  });

  const response = metadata ?? fetched;
  const covers = response?.designer_covers || {};
  const present = BINDINGS.filter((b) => covers?.[b]?.url);
  const hasAny = present.length > 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["metadata", ticketNumber] });

  const handleDownload = async (binding: DesignerCoverBinding) => {
    setDownloading(binding);
    try {
      const { blob, filename } = await designerCoversApi.download(ticketNumber, binding);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || covers?.[binding]?.filename || `${ticketNumber}-${binding}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      toast({ variant: "destructive", title: "Download failed. Please try again." });
    } finally {
      setDownloading(null);
    }
  };

  const handleUpload = async (file: File) => {
    if (!isAllowedImage(file)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Only image files are allowed (JPEG, PNG, WEBP, TIFF)",
      });
      return;
    }
    setUploading(true);
    try {
      await designerCoversApi.upload(ticketNumber, file);
      await refresh();
      toast({ title: "Cover uploaded", description: "All bindings updated." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: errMsg(e, "Please try again.") });
    } finally {
      setUploading(false);
    }
  };

  const approval = (response as any)?.designer_cover_approval || (response as any)?.approval || null;
  const rawStatus = String(
    approval?.status ?? (response as any)?.approval_status ?? ''
  ).toLowerCase().replace(/\s+/g, '_');
  const approvalStatus: DesignerCoverApprovalStatus =
    rawStatus === 'in_review' || rawStatus === 'query_raised' || rawStatus === 'completed'
      ? (rawStatus as DesignerCoverApprovalStatus)
      : 'pending';

  const badge =
    approvalStatus === 'completed'
      ? { label: 'Approved', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      : approvalStatus === 'in_review'
      ? { label: 'In Review', className: 'bg-blue-100 text-blue-800 border-blue-200' }
      : approvalStatus === 'query_raised'
      ? { label: 'Query Raised', className: 'bg-amber-100 text-amber-800 border-amber-200' }
      : { label: 'Pending — awaiting designer upload', className: 'bg-muted text-muted-foreground border-border' };

  const runApproval = async (status: DesignerCoverApprovalStatus, notes?: string) => {
    setApprovalSaving(true);
    try {
      await designerCoversApi.updateApproval(ticketNumber, notes ? { status, notes } : { status });
      await refresh();
      toast({ title: 'Approval status updated' });
      setQueryOpen(false);
      setQueryNotes('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: errMsg(e, 'Please try again.') });
    } finally {
      setApprovalSaving(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-2 border-y border-border">
        <h3 className="text-sm font-semibold text-foreground">Designer Covers</h3>
        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
      </div>

      <div className="p-4 space-y-4">
        {canManage && (
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleUpload(f);
            }}
          />
        )}

        {!canManage && approvalStatus === 'completed' && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Covers have been copied to the master content library.
          </div>
        )}

        {!hasAny ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              {canManage ? "You have not uploaded covers yet." : "No covers uploaded"}
            </span>
            {canManage && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload Covers
              </Button>
            )}
          </div>
        ) : (

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {BINDINGS.map((binding) => {
                const cover = covers?.[binding];
                return (
                  <div key={binding} className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">{BINDING_LABELS[binding]}</p>
                    {cover?.url && !broken[binding] ? (
                      <a href={cover.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                          src={cover.url}
                          alt={`${BINDING_LABELS[binding]} cover`}
                          className="w-full h-40 object-contain rounded bg-muted"
                          onError={() => setBroken((prev) => ({ ...prev, [binding]: true }))}
                        />
                      </a>
                    ) : (
                      <div className="w-full h-40 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        {BINDING_LABELS[binding]}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {cover?.uploaded_at ? formatDate(cover.uploaded_at) : "—"}
                    </p>
                    {cover?.url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 w-full"
                        disabled={downloading === binding}
                        onClick={() => handleDownload(binding)}
                      >
                        {downloading === binding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Download
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Re-upload
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={deleting}
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete designer covers?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all designer covers? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                setDeleting(true);
                try {
                  await designerCoversApi.deleteAll(ticketNumber);
                  await refresh();
                  toast({ title: "Designer covers deleted" });
                  setConfirmDeleteOpen(false);
                } catch (err: any) {
                  toast({ variant: "destructive", title: "Error", description: errMsg(err, "Failed to delete designer covers") });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DesignerCoversSection;
