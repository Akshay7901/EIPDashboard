import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { designerApi, DesignerProposal, CoverBinding } from '@/lib/designerApi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, CheckCircle2, LogOut, Download, Trash2, Lock } from 'lucide-react';
import brandLogo from '@/assets/brand-logo.webp';
import { designerCoversApi } from '@/lib/proposalsApi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BINDING_LABELS: Record<CoverBinding, string> = {
  hb: 'Hardback',
  pb: 'Paperback',
  ebook: 'eBook',
};
const BINDINGS: CoverBinding[] = ['hb', 'pb', 'ebook'];

const ALLOWED_MIME = ['image/jpeg'];
const ALLOWED_EXT = ['jpg', 'jpeg'];
const isAllowedImage = (file: File) => {
  if (ALLOWED_MIME.includes(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && ALLOWED_EXT.includes(ext);
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const ProposalCard: React.FC<{ proposal: DesignerProposal }> = ({ proposal }) => {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [downloading, setDownloading] = useState<CoverBinding | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [authorCoverUrl, setAuthorCoverUrl] = useState<string | null>(null);
  const [authorCoverLoading, setAuthorCoverLoading] = useState(false);
  const [authorCoverError, setAuthorCoverError] = useState<string | null>(null);
  const [downloadingCover, setDownloadingCover] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!proposal.author_cover) {
      setAuthorCoverUrl(null);
      return;
    }
    setAuthorCoverLoading(true);
    setAuthorCoverError(null);
    designerApi
      .getAuthorCoverUrl(proposal.ticket_number)
      .then(({ url }) => {
        if (cancelled) return;
        if (url) setAuthorCoverUrl(url);
        else setAuthorCoverError('No image URL returned.');
      })
      .catch((e: any) => {
        if (!cancelled) setAuthorCoverError(e?.message || 'Failed to load image.');
      })
      .finally(() => {
        if (!cancelled) setAuthorCoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposal.ticket_number, proposal.author_cover?.filename]);

  const coversQuery = useQuery({
    queryKey: ['designer-covers', proposal.ticket_number],
    queryFn: () => designerApi.getCovers(proposal.ticket_number),
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 300000,
  });
  const covers = coversQuery.data?.covers || {};
  const hasCovers = BINDINGS.some((b) => covers?.[b]?.url);
  const allUploaded = BINDINGS.every((b) => covers?.[b]?.url);
  const refreshCovers = () =>
    qc.invalidateQueries({ queryKey: ['designer-covers', proposal.ticket_number] });

  const handleDownloadBinding = async (binding: CoverBinding) => {
    setDownloading(binding);
    try {
      const { blob, filename } = await designerCoversApi.download(proposal.ticket_number, binding as any);
      saveBlob(blob, filename || covers?.[binding]?.filename || `${proposal.ticket_number}-${binding}.jpg`);
    } catch {
      toast({ variant: 'destructive', title: 'Download failed', description: 'Please try again.' });
    } finally {
      setDownloading(null);
    }
  };

  const handleUpload = async (file: File) => {
    if (!isAllowedImage(file)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only JPG images are allowed',
      });
      return;
    }
    setUploading(true);
    try {
      await designerApi.uploadCoverSingle(proposal.ticket_number, file);
      toast({ title: 'Cover uploaded', description: 'All bindings updated.' });
      qc.invalidateQueries({ queryKey: ['designer-proposals'] });
      await refreshCovers();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: e?.message || 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) handleUpload(f);
  };

  // Re-encodes the already-visible image via canvas — no extra network call.
  const blobFromCanvas = (src: string): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0);
        try {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/png');
        } catch (err) {
          reject(err as Error);
        }
      };
      img.onerror = () => reject(new Error('Image load blocked'));
      img.src = src;
    });

  const saveBlob = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const handleDownloadAuthorCover = async () => {
    if (!authorCoverUrl || downloadingCover) return;
    setDownloadingCover(true);
    const fallbackName = proposal.author_cover?.filename || 'author-reference';
    try {
      const { blob, filename: downloadedFilename } = await designerApi.downloadAuthorCover(proposal.ticket_number);
      saveBlob(blob, downloadedFilename || fallbackName);
    } catch (e: any) {
      try {
        // Fallback 1: re-encode the visible image locally.
        const blob = await blobFromCanvas(authorCoverUrl);
        saveBlob(blob, fallbackName.replace(/\.[^.]+$/, '') + '.png');
      } catch {
        // Fallback 2: hand the signed URL to the browser's own downloader.
        const a = document.createElement('a');
        a.href = authorCoverUrl;
        a.download = fallbackName;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setDownloadingCover(false);
    }
  };

  const names = Array.isArray(proposal.display_names) ? proposal.display_names.join(', ') : '';
  const approvalStatus = proposal.approval_status || 'pending';
  const badgeClass =
    approvalStatus === 'completed'
      ? 'bg-[#16A34A] hover:bg-[#16A34A] text-white'
      : approvalStatus === 'in_review'
      ? 'bg-[#3B82F6] hover:bg-[#3B82F6] text-white'
      : approvalStatus === 'query_raised'
      ? 'bg-[#D97706] hover:bg-[#D97706] text-white'
      : 'bg-[#94A3B8] hover:bg-[#94A3B8] text-white';
  const badgeLabel =
    approvalStatus === 'completed'
      ? 'Completed'
      : approvalStatus === 'in_review'
      ? 'In Review'
      : approvalStatus === 'query_raised'
      ? 'Query Raised'
      : 'Pending';
  const uploadDisabled = approvalStatus === 'in_review';
  const uploadHidden = approvalStatus === 'completed';

  const uploadButton = (label: string) => (
    <Button
      size="sm"
      variant="outline"
      title={uploadDisabled ? 'Awaiting admin review' : undefined}
      className="border-[#3d5a47] text-[#3d5a47] hover:bg-[#3d5a47] hover:text-white disabled:opacity-50"
      onClick={() => inputRef.current?.click()}
      disabled={uploading || uploadDisabled}
    >
      {uploading ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
      ) : (
        <><Upload className="h-4 w-4 mr-2" /> {label}</>
      )}
    </Button>
  );

  return (
    <Card className="p-5 space-y-4 border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          {proposal.full_title && (
            <h2 className="text-lg font-semibold text-foreground leading-snug break-words">
              {proposal.full_title}
            </h2>
          )}
          <div className="text-sm text-muted-foreground space-y-0.5">
            {proposal.title && <div><span className="text-foreground font-medium">Title:</span> {proposal.title}</div>}
            {proposal.subtitle && <div><span className="text-foreground font-medium">Subtitle:</span> {proposal.subtitle}</div>}
            {proposal.category && <div><span className="text-foreground font-medium">Category:</span> {proposal.category}</div>}
            {names && <div><span className="text-foreground font-medium">{(proposal.category || '').toLowerCase().includes('edit') ? 'Editor(s)' : 'Author(s)'}:</span> {names}</div>}
          </div>
          <div className="text-xs text-muted-foreground pt-1">Ticket #{proposal.ticket_number}</div>
        </div>
        <Badge className={`${badgeClass} shrink-0 rounded-full px-3`}>{badgeLabel}</Badge>
      </div>


      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {!hasCovers ? (
        <div className="rounded-lg border border-border bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {coversQuery.isLoading
              ? 'Loading covers…'
              : 'No cover uploaded yet. One image covers HB, PB and eBook.'}
          </div>
          {!uploadHidden && uploadButton('Upload Cover')}

        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BINDINGS.map((binding) => {
              const cover = covers?.[binding];
              return (
                <div key={binding} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{BINDING_LABELS[binding]}</p>
                    {cover?.url && (
                      <button
                        onClick={() => handleDownloadBinding(binding)}
                        disabled={downloading === binding}
                        title="Download"
                        aria-label={`Download ${BINDING_LABELS[binding]} cover`}
                        className="text-[#3d5a47] hover:opacity-80 disabled:opacity-60"
                      >
                        {downloading === binding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {cover?.url ? (
                    <a href={cover.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={cover.url}
                        alt={`${BINDING_LABELS[binding]} cover`}
                        className="w-full h-40 object-contain rounded bg-muted"
                      />
                    </a>
                  ) : (
                    <div className="w-full h-40 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      Not available
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {cover?.uploaded_at ? formatDate(cover.uploaded_at) : '—'}
                  </p>
                </div>
              );
            })}
          </div>

          {approvalStatus === 'query_raised' && (
            <div className="rounded-md border border-[#D97706]/40 bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
              Admin has raised a query: {proposal.approval?.notes || '—'}
            </div>
          )}

          {uploadHidden ? (
            <div className="flex items-center gap-2 text-sm font-medium text-[#16A34A]">
              <Lock className="h-4 w-4" /> Approved — covers locked
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {uploadButton('Re-upload')}
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

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete designer covers?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the Hardback, Paperback and eBook covers. This cannot be undone.
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
                  await designerCoversApi.deleteAll(proposal.ticket_number);
                  await refreshCovers();
                  qc.invalidateQueries({ queryKey: ['designer-proposals'] });
                  toast({ title: 'Designer covers deleted' });
                  setConfirmDeleteOpen(false);
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Delete failed', description: err?.message || 'Please try again.' });
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

      {proposal.author_cover && (
        <div className="rounded-lg border border-border bg-[#faf8f5] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">Author's Reference Image</div>
            <div className="flex items-center gap-3">
              {authorCoverUrl && (
                <button
                  onClick={handleDownloadAuthorCover}
                  disabled={downloadingCover}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3d5a47] hover:underline disabled:opacity-60"
                >
                  {downloadingCover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {downloadingCover ? 'Downloading…' : 'Download'}
                </button>
              )}
              <div className="text-xs text-muted-foreground break-all text-right">
                {proposal.author_cover.filename}
                {proposal.author_cover.width_px && proposal.author_cover.height_px
                  ? ` · ${proposal.author_cover.width_px} × ${proposal.author_cover.height_px} px`
                  : ''}
              </div>
            </div>
          </div>
          {authorCoverLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : authorCoverError ? (
            <div className="text-xs text-destructive">{authorCoverError}</div>
          ) : authorCoverUrl ? (
            <>
              <img
                src={authorCoverUrl}
                alt={proposal.author_cover.filename || "Author's reference image"}
                className="max-h-96 w-auto mx-auto rounded border border-border bg-white object-contain"
              />
              {proposal.author_cover.source && (
                <p className="text-xs italic text-muted-foreground text-center">
                  <span className="font-medium not-italic">Image Source:</span> {proposal.author_cover.source}
                </p>
              )}
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
};

const FILTERS: { label: string; value: 'all' | 'pending' | 'in_review' | 'query_raised' | 'completed' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Query Raised', value: 'query_raised' },
  { label: 'Completed', value: 'completed' },
];

const DesignerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_review' | 'query_raised' | 'completed'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['designer-proposals', 'all'],
    queryFn: () => designerApi.list(),
    refetchInterval: 30000,
  });

  const allProposals = data?.proposals ?? [];

  // Counts come straight from the API response (summary + total).
  const counts = useMemo(() => {
    const s = data?.summary;
    return {
      all: data?.total ?? allProposals.length,
      pending: s?.pending ?? 0,
      in_review: s?.in_review ?? 0,
      query_raised: s?.query_raised ?? 0,
      completed: s?.completed ?? 0,
    };
  }, [data?.summary, data?.total, allProposals.length]);

  const proposals = useMemo(() => {
    if (filter === 'all') return allProposals;
    if (filter === 'pending') {
      return allProposals.filter((p) => (p.approval_status || 'pending') === 'pending' && !p.all_uploaded);
    }
    return allProposals.filter((p) => (p.approval_status || 'pending') === filter);
  }, [allProposals, filter]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const countFor = (value: typeof filter) =>
    value === 'all' ? counts.all
    : value === 'pending' ? counts.pending
    : value === 'in_review' ? counts.in_review
    : value === 'query_raised' ? counts.query_raised
    : counts.completed;

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <header className="border-b border-border bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Ethics Press" className="h-9 w-9 object-contain" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Ethics Press</div>
              <div className="text-xs text-muted-foreground">Designer Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.email && <span className="hidden sm:block text-sm text-muted-foreground">{user.email}</span>}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Cover Design Queue</h1>
          <p className="text-sm text-muted-foreground">
            Upload HB, PB and eBook covers for each locked proposal. Re-uploading replaces the previous file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ' +
                (filter === f.value
                  ? 'bg-[#3d5a47] text-white border-[#3d5a47]'
                  : 'bg-white text-[#3d5a47] border-[#3d5a47]/40 hover:bg-[#3d5a47]/10')
              }
            >
              {f.label}
              <span
                className={
                  'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ' +
                  (filter === f.value ? 'bg-white/25 text-white' : 'bg-[#3d5a47]/10 text-[#3d5a47]')
                }
              >
                {countFor(f.value)}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#3d5a47]" />
          </div>
        ) : error ? (
          <Card className="p-6 text-sm text-destructive">
            Failed to load proposals. {(error as any)?.message || ''}
          </Card>
        ) : proposals.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            No proposals found for this filter.
          </Card>
        ) : (
          <div className="space-y-4">
            {proposals.map((p) => (
              <ProposalCard key={p.ticket_number} proposal={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default DesignerDashboard;
