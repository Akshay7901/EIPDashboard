import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Send, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { toast } from "@/hooks/use-toast";
import { contributorsApi, type Contributor, type ContributorStatus } from "@/lib/contributorsApi";

const STATUS_STYLES: Record<ContributorStatus, string> = {
  pending: "bg-[#c4940a] text-white hover:bg-[#c4940a] border-[#c4940a]",
  accepted: "bg-[#3d5a47] text-white hover:bg-[#3d5a47] border-[#3d5a47]",
  declined: "bg-[#9b2c2c] text-white hover:bg-[#9b2c2c] border-[#9b2c2c]",
};
const STATUS_LABEL: Record<ContributorStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
};

export const ContributorStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const key = (status as ContributorStatus) in STATUS_STYLES ? (status as ContributorStatus) : "pending";
  return (
    <Badge className={`${STATUS_STYLES[key]} rounded-full px-3 py-0.5 font-medium text-xs`}>
      {STATUS_LABEL[key]}
    </Badge>
  );
};

const errMsg = (e: any, fallback: string) => e?.message || e?.error || fallback;

interface Props {
  ticketNumber: string;
  readOnly?: boolean;
}

const emptyForm = { name: "", email: "", affiliation: "", chapter_title: "", notes: "" };

const ContributorsPanel: React.FC<Props> = ({ ticketNumber, readOnly = false }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contributor | null>(null);

  const queryKey = ["contributors", ticketNumber];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => contributorsApi.list(ticketNumber),
    enabled: !!ticketNumber,
  });

  const contributors = data?.contributors || [];
  const counts = data?.counts || { total: 0, pending: 0, accepted: 0, declined: 0 };
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const handleAdd = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await contributorsApi.create(ticketNumber, {
        name: form.name.trim(),
        email: form.email.trim(),
        affiliation: form.affiliation.trim() || undefined,
        chapter_title: form.chapter_title.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast({ title: res.email_sent ? "Invite sent" : "Added (email failed)" });
      setForm({ ...emptyForm });
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      toast({ title: errMsg(e, "Failed to add contributor"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (c: Contributor) => {
    setBusyId(c.id);
    try {
      const res = await contributorsApi.resend(ticketNumber, c.id);
      toast({ title: res.email_sent ? "Invitation resent" : "Resend failed to send email" });
      await refresh();
    } catch (e: any) {
      toast({ title: errMsg(e, "Failed to resend invitation"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await contributorsApi.remove(ticketNumber, deleteTarget.id);
      toast({ title: "Contributor removed" });
      setDeleteTarget(null);
      await refresh();
    } catch (e: any) {
      toast({ title: errMsg(e, "Failed to remove contributor"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const chip = (label: string, value: number, cls: string) => (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${cls}`}>
      {label} · {value}
    </span>
  );

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-3 p-4 text-left">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">Chapter Contributors</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5">
                {chip("Total", counts.total, "bg-muted text-foreground border-border")}
                {chip("Pending", counts.pending, "bg-[#c4940a]/10 text-[#8a6707] border-[#c4940a]/40")}
                {chip("Accepted", counts.accepted, "bg-[#3d5a47]/10 text-[#3d5a47] border-[#3d5a47]/40")}
                {chip("Declined", counts.declined, "bg-[#9b2c2c]/10 text-[#9b2c2c] border-[#9b2c2c]/40")}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading contributors…
              </div>
            ) : contributors.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No contributors added yet.</p>
                {!readOnly && !showForm && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4" /> Add Contributor
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Name</th>
                      <th className="py-2 pr-3 font-medium">Email</th>
                      <th className="py-2 pr-3 font-medium">Affiliation</th>
                      <th className="py-2 pr-3 font-medium">Chapter</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      {!readOnly && <th className="py-2 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {contributors.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 align-top">
                        <td className="py-2.5 pr-3 font-medium">{c.name}</td>
                        <td className="py-2.5 pr-3 break-all">{c.email}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.affiliation || "—"}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.chapter_title || "—"}</td>
                        <td className="py-2.5 pr-3">
                          <ContributorStatusBadge status={c.status} />
                        </td>
                        {!readOnly && (
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    disabled={c.status === "accepted" || busyId === c.id}
                                    onClick={() => handleResend(c)}
                                  >
                                    {busyId === c.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Resend invitation</TooltipContent>
                            </Tooltip>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={busyId === c.id}
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!readOnly && contributors.length > 0 && !showForm && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Add Contributor
              </Button>
            )}

            {!readOnly && showForm && (
              <div className="border rounded-md p-4 space-y-3 bg-muted/20">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Affiliation</Label>
                    <Input
                      value={form.affiliation}
                      onChange={(e) => setForm({ ...form, affiliation: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Chapter Title</Label>
                    <Input
                      value={form.chapter_title}
                      onChange={(e) => setForm({ ...form, chapter_title: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowForm(false);
                      setForm({ ...emptyForm });
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAdd} disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Contributor
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove contributor?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed from this proposal's contributor list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default ContributorsPanel;
