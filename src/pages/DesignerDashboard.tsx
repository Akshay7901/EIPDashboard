import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { designerApi, DesignerProposal, CoverBinding } from '@/lib/designerApi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, CheckCircle2, ImageIcon, LogOut, ExternalLink, Download } from 'lucide-react';
import brandLogo from '@/assets/brand-logo.webp';

const BINDING_LABELS: Record<CoverBinding, string> = {
  hb: 'Hardback',
  pb: 'Paperback',
  ebook: 'eBook',
};
const BINDINGS: CoverBinding[] = ['hb', 'pb', 'ebook'];

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const CoverSlot: React.FC<{
  ticket: string;
  binding: CoverBinding;
  cover?: DesignerProposal['covers'] extends infer T ? any : any;
  onUpload: (binding: CoverBinding, file: File) => Promise<void>;
  busyBinding: CoverBinding | null;
}> = ({ ticket, binding, cover, onUpload, busyBinding }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [opening, setOpening] = useState(false);
  const isUploaded = !!cover?.uploaded;
  const isBusy = busyBinding === binding;

  const handleOpen = async () => {
    if (!isUploaded || opening) return;
    setOpening(true);
    try {
      const url = await designerApi.getCoverUrl(ticket, binding);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        toast({ variant: 'destructive', title: 'Could not open cover', description: 'No URL returned.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not open cover', description: e?.message || 'Try again.' });
    } finally {
      setOpening(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onUpload(binding, f);
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[#3d5a47]" />
          <span className="font-medium text-sm text-foreground">{BINDING_LABELS[binding]}</span>
        </div>
        {isUploaded ? (
          <Badge className="bg-[#3d5a47] hover:bg-[#3d5a47] text-white">Uploaded</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
        )}
      </div>

      {isUploaded ? (
        <button
          onClick={handleOpen}
          className="text-left text-xs text-muted-foreground hover:text-[#3d5a47] transition-colors flex items-start gap-1 group"
          disabled={opening}
        >
          <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="break-all">
            <span className="font-medium text-foreground group-hover:text-[#3d5a47]">
              {cover?.filename || 'View cover'}
            </span>
            {cover?.uploaded_at && <span className="block">Uploaded {formatDate(cover.uploaded_at)}</span>}
          </span>
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">No file uploaded yet.</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        size="sm"
        variant="outline"
        className="mt-auto border-[#3d5a47] text-[#3d5a47] hover:bg-[#3d5a47] hover:text-white"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
      >
        {isBusy ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" /> {isUploaded ? 'Replace' : 'Upload'}</>
        )}
      </Button>
    </div>
  );
};

const ProposalCard: React.FC<{ proposal: DesignerProposal }> = ({ proposal }) => {
  const qc = useQueryClient();
  const [busyBinding, setBusyBinding] = useState<CoverBinding | null>(null);
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

  const allUploaded = BINDINGS.every((b) => proposal.covers?.[b]?.uploaded);

  const handleUpload = async (binding: CoverBinding, file: File) => {
    setBusyBinding(binding);
    try {
      await designerApi.uploadCover(proposal.ticket_number, binding, file);
      toast({ title: 'Cover uploaded', description: `${BINDING_LABELS[binding]} cover saved.` });
      qc.invalidateQueries({ queryKey: ['designer-proposals'] });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: e?.message || 'Please try again.',
      });
    } finally {
      setBusyBinding(null);
    }
  };

  const names = Array.isArray(proposal.display_names) ? proposal.display_names.join(', ') : '';

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
        {allUploaded && (
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {BINDINGS.map((b) => (
          <CoverSlot
            key={b}
            ticket={proposal.ticket_number}
            binding={b}
            cover={proposal.covers?.[b]}
            onUpload={handleUpload}
            busyBinding={busyBinding}
          />
        ))}
      </div>

      {proposal.author_cover && (
        <div className="rounded-lg border border-border bg-[#faf8f5] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">Author's Reference Image</div>
            <div className="flex items-center gap-3">
              {authorCoverUrl && (
                <a
                  href={authorCoverUrl}
                  download={proposal.author_cover.filename || 'author-reference'}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3d5a47] hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
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
            <img
              src={authorCoverUrl}
              alt={proposal.author_cover.filename || "Author's reference image"}
              className="max-h-96 w-auto mx-auto rounded border border-border bg-white object-contain"
            />
          ) : null}
        </div>
      )}
    </Card>
  );
};

const DesignerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: proposals, isLoading, error } = useQuery({
    queryKey: ['designer-proposals'],
    queryFn: designerApi.list,
    refetchInterval: 30000,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#3d5a47]" />
          </div>
        ) : error ? (
          <Card className="p-6 text-sm text-destructive">
            Failed to load proposals. {(error as any)?.message || ''}
          </Card>
        ) : !proposals || proposals.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            No proposals assigned for cover design yet.
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