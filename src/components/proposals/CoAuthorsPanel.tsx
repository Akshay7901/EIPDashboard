import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2, UsersRound, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { coAuthorsApi, type CoAuthor } from "@/lib/contributorsApi";

const errMsg = (e: any, fallback: string) => e?.message || e?.error || fallback;

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const isEditor = (role || "").toLowerCase() === "editor";
  return (
    <Badge
      className={`rounded-full px-3 py-0.5 text-xs font-medium ${
        isEditor
          ? "bg-purple-600 text-white hover:bg-purple-600 border-purple-600"
          : "bg-blue-600 text-white hover:bg-blue-600 border-blue-600"
      }`}
    >
      {isEditor ? "Editor" : "Author"}
    </Badge>
  );
};

const emptyForm = { first_name: "", last_name: "", email: "", role: "author" as "author" | "editor" };

const CoAuthorsPanel: React.FC<{ ticketNumber: string }> = ({ ticketNumber }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoAuthor | null>(null);

  const queryKey = ["co-authors", ticketNumber];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => coAuthorsApi.list(ticketNumber),
    enabled: !!ticketNumber,
  });

  const coAuthors = data?.co_authors || [];
  const editable = data?.editable !== false;
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const handleAdd = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast({ title: "First name and last name are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await coAuthorsApi.create(ticketNumber, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
      });
      toast({ title: "Co-author added" });
      setForm({ ...emptyForm });
      setShowForm(false);
      await refresh();
    } catch (e: any) {
      toast({ title: errMsg(e, "Failed to add co-author"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyIndex(deleteTarget.index);
    try {
      await coAuthorsApi.remove(ticketNumber, deleteTarget.index);
      toast({ title: "Co-author removed" });
      setDeleteTarget(null);
      await refresh();
    } catch (e: any) {
      toast({ title: errMsg(e, "Failed to remove co-author"), variant: "destructive" });
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-3 p-4 text-left">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">Co-Authors &amp; Editors</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {!editable && (
              <div className="flex items-start gap-2 border border-[#c4940a]/40 bg-[#c4940a]/10 text-[#8a6707] text-sm p-3 rounded-md">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Co-author list is locked — proposal is in a finalised state.</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading co-authors…
              </div>
            ) : coAuthors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No co-authors or editors added yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium w-10">#</th>
                      <th className="py-2 pr-3 font-medium">First Name</th>
                      <th className="py-2 pr-3 font-medium">Last Name</th>
                      <th className="py-2 pr-3 font-medium">Email</th>
                      <th className="py-2 pr-3 font-medium">Role</th>
                      {editable && <th className="py-2 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {coAuthors.map((c, i) => (
                      <tr key={`${c.index}-${i}`} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 pr-3 font-medium">{c.first_name}</td>
                        <td className="py-2.5 pr-3 font-medium">{c.last_name}</td>
                        <td className="py-2.5 pr-3 break-all">{c.email || "—"}</td>
                        <td className="py-2.5 pr-3">
                          <RoleBadge role={c.role} />
                        </td>
                        {editable && (
                          <td className="py-2.5 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={busyIndex === c.index || c.editable === false}
                              onClick={() => setDeleteTarget(c)}
                            >
                              {busyIndex === c.index ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editable && !showForm && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Add Co-Author
              </Button>
            )}

            {editable && showForm && (
              <div className="border rounded-md p-4 space-y-3 bg-muted/20">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>First Name *</Label>
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name *</Label>
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) => setForm({ ...form, role: v as "author" | "editor" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="author">Author</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                    Add
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
            <AlertDialogTitle>Remove co-author?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.first_name} {deleteTarget?.last_name} will be removed from this proposal.
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

export default CoAuthorsPanel;
