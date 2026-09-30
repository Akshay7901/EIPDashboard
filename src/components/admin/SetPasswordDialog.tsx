import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { userPasswordApi } from "@/lib/proposalsApi";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const MIN_PASSWORD_LENGTH = 8;

interface SetPasswordDialogProps {
  email: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
  form?: string;
}

const SetPasswordDialog: React.FC<SetPasswordDialogProps> = ({ email, open, onOpenChange }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form whenever the dialog is (re)opened
  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirmPassword("");
      setErrors({});
      setIsSubmitting(false);
    }
  }, [open]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const result = await userPasswordApi.setPassword(email, password);
      onOpenChange(false);
      toast({
        title: "Password Set",
        description: `Temporary password set for ${result.name || email} (${result.email || email})`,
      });
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || "Failed to set password";

      if (status === 401 || status === 403) {
        // Session expired or no longer authorised
        onOpenChange(false);
        await logout();
        navigate("/login", { replace: true });
        return;
      }

      if (status === 400) {
        setErrors({ password: message });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
            <DialogDescription>
              No email is sent to the user. Share the temporary password with them directly; they can
              change it after logging in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errors.form && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.form}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="set-password-email">Email</Label>
              <Input id="set-password-email" type="email" value={email ?? ""} readOnly disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="set-password-new">New Password</Label>
              <Input
                id="set-password-new"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="set-password-confirm">Confirm Password</Label>
              <Input
                id="set-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !email}
              className="bg-[#3d5a47] hover:bg-[#3d5a47]/90 text-white"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Set Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetPasswordDialog;
