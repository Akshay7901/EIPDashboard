import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, Plus, Loader2 } from "lucide-react";
import { useDesigners } from "@/hooks/useDesigners";

const Designers: React.FC = () => {
  const navigate = useNavigate();
  const { designers, isLoading, createDesigner, isCreating, deleteDesigner, isDeleting } =
    useDesigners();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDesigner, setSelectedDesigner] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [formData, setFormData] = useState({ name: "", email: "" });

  const handleAdd = () => {
    if (!formData.name || !formData.email) return;
    createDesigner(
      { name: formData.name, email: formData.email },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
          setFormData({ name: "", email: "" });
        },
      },
    );
  };

  const handleDeleteClick = (designer: { id: string; name: string }) => {
    setSelectedDesigner(designer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedDesigner) return;
    deleteDesigner(selectedDesigner.id, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        setSelectedDesigner(null);
      },
    });
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <DashboardLayout title="Designers">
      <div className="space-y-6 max-w-8xl mx-auto">
        <button
          onClick={() => navigate("/proposals")}
          className="inline-flex items-center gap-1 text-sm text-[#3d5a47] hover:text-[#2d4a37] hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Home
        </button>

        <div>
          <h1 className="text-3xl font-bold text-foreground">Designers</h1>
        </div>

        <Separator />

        <p className="text-muted-foreground">
          Manage your pool of cover designers. Adding a designer sends them an invite email to set
          up their account.
        </p>

        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="w-full bg-[#3d5a47] text-primary-foreground"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Designer
        </Button>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && designers.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No designers found. Add your first designer above.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && designers.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designers.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.name || d.email.split("@")[0]}
                      </TableCell>
                      <TableCell className="break-all">{d.email}</TableCell>
                      <TableCell>{formatDate(d.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[#3d5a47] border-[#3d5a47] hover:bg-[#3d5a47] hover:text-white"
                          onClick={() =>
                            handleDeleteClick({ id: d.id, name: d.name || d.email })
                          }
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Designer</DialogTitle>
            <DialogDescription>
              Enter the designer's details. They will receive an invite email to set up their
              account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="designer-name">Name</Label>
              <Input
                id="designer-name"
                placeholder="e.g., Sarah Johnson"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designer-email">Email</Label>
              <Input
                id="designer-email"
                type="email"
                placeholder="e.g., sarah@example.com"
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
              onClick={handleAdd}
              disabled={isCreating || !formData.name || !formData.email}
              className="bg-[#3d5a47] hover:bg-[#3d5a47]/90 text-white"
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Designer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Designer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{selectedDesigner?.name}</strong> from the
              designers list? This action cannot be undone.
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

export default Designers;