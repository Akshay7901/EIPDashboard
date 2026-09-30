import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, Plus, Loader2, ChevronDown, ChevronRight, FileText, ArrowRightLeft, Star } from "lucide-react";
import { usePeerReviewers } from "@/hooks/usePeerReviewers";
import { useDefaultReviewer } from "@/hooks/useDefaultReviewer";
import { useReviewerAssignments } from "@/hooks/useReviewerAssignments";
import { assignmentsApi } from "@/lib/proposalsApi";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const PeerReviewers: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { reviewers, isLoading, createReviewer, isCreating, deleteReviewer, isDeleting } = usePeerReviewers();
  const { isDefault, setDefault } = useDefaultReviewer();
  const { data: assignmentMap, isLoading: isLoadingAssignments } = useReviewerAssignments();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedReviewer, setSelectedReviewer] = useState<{ id: string; name: string } | null>(null);
  const [expandedReviewers, setExpandedReviewers] = useState<Set<string>>(new Set());
  const [reassigningTicket, setReassigningTicket] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });

  const toggleExpanded = (reviewerId: string) => {
    setExpandedReviewers((prev) => {
      const next = new Set(prev);
      if (next.has(reviewerId)) {
        next.delete(reviewerId);
      } else {
        next.add(reviewerId);
      }
      return next;
    });
  };

  const getAssignmentsForReviewer = (email: string) => {
    return assignmentMap?.get(email) || [];
  };

  const handleReassign = async (ticketNumber: string, currentReviewerEmail: string) => {
    const targetEmail = reassignTarget[ticketNumber];
    if (!targetEmail) {
      toast({
        title: "Select a reviewer",
        description: "Please select a reviewer to re-assign this proposal to.",
        variant: "destructive",
      });
      return;
    }

    setReassigningTicket(ticketNumber);
    try {
      // Use the assign endpoint which handles both first assignment and reassignment
      await assignmentsApi.assign(ticketNumber, { reviewer_email: targetEmail });

      // Local sync no longer needed — API handles assignments natively

      toast({
        title: "Proposal Re-assigned",
        description: `Proposal ${ticketNumber} has been re-assigned successfully.`,
      });

      // Clear selection and refresh
      setReassignTarget((prev) => {
        const next = { ...prev };
        delete next[ticketNumber];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["reviewer-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["peer-reviewers"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to re-assign proposal",
        variant: "destructive",
      });
    } finally {
      setReassigningTicket(null);
    }
  };

  const handleAddReviewer = () => {
    if (!formData.name || !formData.email) return;

    createReviewer(
      { name: formData.name, email: formData.email },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
          setFormData({ name: "", email: "" });
        },
      },
    );
  };

  const handleDeleteClick = (reviewer: { id: string; name: string }) => {
    setSelectedReviewer(reviewer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedReviewer) return;

    deleteReviewer(selectedReviewer.id, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        setSelectedReviewer(null);
      },
    });
  };

  return (
    <DashboardLayout title="Peer Reviewers">
      <div className="space-y-6 max-w-8xl mx-auto">
        {/* Back Link */}
        <button
          onClick={() => navigate("/proposals")}
          className="inline-flex items-center gap-1 text-sm text-[#3d5a47] hover:text-[#2d4a37] hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Home
        </button>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Peer Reviewers</h1>
        </div>

        <Separator />

        {/* Description */}
        <p className="text-muted-foreground">
          Manage your pool of peer reviewers. Add, edit, or remove reviewers to keep your list up to date.
        </p>

        {/* Add New Reviewer Button */}
        <Button onClick={() => setIsAddDialogOpen(true)} className="w-full bg-[#3d5a47]  text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" />
          Add New Reviewer
        </Button>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && reviewers.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No peer reviewers found. Add your first reviewer above.</p>
            </CardContent>
          </Card>
        )}

        {/* Reviewers List */}
        {!isLoading && reviewers.length > 0 && (
          <div className="space-y-3">
            {reviewers.map((reviewer) => {
              const assignments = getAssignmentsForReviewer(reviewer.email);
              const isExpanded = expandedReviewers.has(reviewer.id);
              const hasAssignments = assignments.length > 0;

              return (
                <Card key={reviewer.id} className="border">
                  <CardContent className="py-4 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {hasAssignments && (
                          <button onClick={() => toggleExpanded(reviewer.id)} className="p-1 hover:bg-muted rounded">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        )}
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground">
                              {reviewer.name || reviewer.email.split("@")[0]}
                            </p>
                            {hasAssignments && (
                              <Badge variant="secondary" className="text-xs">
                                {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground break-all">{reviewer.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isDefault(reviewer.email) ? (
                          <Button variant="default" size="sm" className="bg-[#45556c] text-primary-foreground">
                            Default
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setDefault(reviewer.email)}>
                            Set as default
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[#3d5a47] border-[#3d5a47] hover:bg-[#3d5a47] hover:text-white"
                          onClick={() => handleDeleteClick({ id: reviewer.id, name: reviewer.name })}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Assignments Panel */}
                    {hasAssignments && isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-2">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Assigned Proposals:</p>
                        {assignments.map((assignment) => (
                          <div
                            key={assignment.ticket_number}
                            className="flex flex-col sm:flex-row sm:items-center justify-between bg-muted/50 rounded-lg px-3 py-2 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{assignment.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {assignment.ticket_number} • {assignment.author}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Select
                                value={reassignTarget[assignment.ticket_number] || ""}
                                onValueChange={(val) =>
                                  setReassignTarget((prev) => ({ ...prev, [assignment.ticket_number]: val }))
                                }
                              >
                                <SelectTrigger className="w-40 h-8 text-xs">
                                  <SelectValue placeholder="Re-assign to..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {reviewers
                                    .filter((r) => r.email !== reviewer.email)
                                    .map((r) => (
                                      <SelectItem key={r.id} value={r.email}>
                                        {r.name || r.email.split("@")[0]}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8"
                                onClick={() => handleReassign(assignment.ticket_number, reviewer.email)}
                                disabled={
                                  reassigningTicket === assignment.ticket_number ||
                                  !reassignTarget[assignment.ticket_number]
                                }
                              >
                                {reassigningTicket === assignment.ticket_number ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <ArrowRightLeft className="h-3 w-3 mr-1" />
                                    Re-assign
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Reviewer Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Reviewer</DialogTitle>
            <DialogDescription>Enter the details of the new peer reviewer.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Dr. Michael Zhang"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="e.g., m.zhang@university.edu"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddReviewer}
              disabled={isCreating || !formData.name || !formData.email}
              className="bg-[#3d5a47] hover:bg-[#3d5a47]/90 text-white"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Reviewer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reviewer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{selectedReviewer?.name}</strong> from the peer reviewers list?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default PeerReviewers;
