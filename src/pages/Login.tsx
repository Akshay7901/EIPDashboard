import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";
import brandLogo from "@/assets/brand-logo.webp";
import OtpScreen from "@/components/auth/OtpScreen";
import SetPasswordScreen from "@/components/auth/SetPasswordScreen";
import { authApi } from "@/lib/authApi";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(1, "Please enter your password"),
});

type EmailFormData = z.infer<typeof emailSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

type LoginStep = 'email' | 'password' | 'otp' | 'set-password';

const Login: React.FC = () => {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const redirectToDashboard = (role?: string) => {
    let userRole = role;
    if (!userRole) {
      const userStr = localStorage.getItem('user');
      const userData = userStr ? JSON.parse(userStr) : null;
      userRole = userData?.role;
    }

    if (userRole === 'author') {
      navigate("/author/proposals");
    } else if (userRole === 'designer' || userRole === 'cover_designer') {
      navigate("/designer/proposals");
    } else {
      navigate("/proposals");
    }
  };

  const onEmailSubmit = async (data: EmailFormData) => {
    setEmail(data.email);
    setIsLoading(true);
    try {
      // Call login with email only to check if user has a password or needs OTP
      const response = await authApi.login(data.email);
      if (response.requires_otp) {
        setStep('otp');
        toast({
          title: "OTP sent",
          description: response.message || "Check your email for a verification code.",
        });
      } else {
        // User already has a password set
        passwordForm.reset({ password: '' });
        setStep('password');
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Something went wrong. Please try again.";

      if (msg.toLowerCase().includes("password is required")) {
        passwordForm.reset({ password: '' });
        setStep('password');
      } else {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: msg,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    try {
      const response = await authApi.login(email, data.password);

      if (response.requires_otp) {
        // First-time user or OTP required → switch to OTP flow
        setStep('otp');
        toast({
          title: "OTP sent",
          description: response.message || "Check your email for a verification code.",
        });
      } else if (response.token) {
        loginWithToken(response.token, response);
        toast({ title: "Welcome back!", description: "You have successfully logged in." });
        redirectToDashboard(response.user?.role || response.role);
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Invalid credentials. Please try again.";
      toast({
        variant: "destructive",
        title: "Login failed",
        description: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (otp: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.verifyOtp(email, otp);

      if (response.temp_token) {
        setTempToken(response.temp_token);
        setStep('set-password');
      } else if (response.token) {
        loginWithToken(response.token, response);
        toast({ title: "Welcome back!", description: "You have successfully logged in." });
        redirectToDashboard(response.user?.role || response.role);
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || "Invalid or expired code. Please try again.";
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (password: string) => {
    if (!tempToken) return;
    setIsLoading(true);
    try {
      const response = await authApi.setPassword(tempToken, password);
      loginWithToken(response.token, response);
      toast({ title: "Password set!", description: "Your account is ready." });
      redirectToDashboard(response.user?.role || response.role);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to set password",
        description: error.response?.data?.error || error.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'otp':
        return (
          <OtpScreen 
            email={email} 
            onVerify={handleOtpVerify} 
            isLoading={isLoading} 
            onBack={() => setStep('email')}
          />
        );
      case 'set-password':
        return (
          <SetPasswordScreen 
            title="Set your password" 
            onSubmit={handleSetPassword} 
            isLoading={isLoading} 
          />
        );
      case 'password':
        return (
          <div className="animate-fade-in">
            <div className="flex items-center justify-center mb-6">
              <img src={brandLogo} alt="Ethics Press" className="h-14 w-14 object-contain" />
            </div>
            
            <div className="text-center space-y-2 mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
              <p className="text-muted-foreground text-sm">{email}</p>
            </div>

            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-5" autoComplete="off">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-foreground font-medium">
                    Password
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-[#3d5a47] hover:text-[#2d4a37] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="off"
                    defaultValue=""
                    className="h-12 text-base bg-[#f0f4f8] border-0 pr-10 placeholder:text-muted-foreground/60 focus-visible:ring-[#3d5a47]"
                    {...passwordForm.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{passwordForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-[#3d5a47] hover:bg-[#2d4a37] text-white"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Log in"
                )}
              </Button>

              <button
                type="button"
                onClick={() => { setStep('email'); passwordForm.reset(); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Use a different email
              </button>
            </form>
          </div>
        );
      default:
        return (
          <div className="animate-fade-in">
            <div className="flex items-center justify-center mb-6">
              <img src={brandLogo} alt="Ethics Press" className="h-14 w-14 object-contain" />
            </div>
            
            <div className="text-center space-y-2 mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Proposal Portal</h1>
              <p className="text-muted-foreground">Access your academic review dashboard</p>
            </div>

            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@university.edu"
                  className="h-12 text-base bg-[#f0f4f8] border-0 placeholder:text-muted-foreground/60 focus-visible:ring-[#3d5a47]"
                  {...emailForm.register("email")}
                />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{emailForm.formState.errors.email.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium bg-[#3d5a47] hover:bg-[#2d4a37] text-white"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Next"
                )}
              </Button>
            </form>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen">
      <div
        className="hidden md:flex md:w-1/2 relative bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBg})` }}
      />
      <div className="flex w-full md:w-1/2 flex-col items-center justify-center p-8 bg-[#f2f2ee]">
        <Card className="w-full max-w-md shadow-lg border-0 bg-white">
          <CardContent className="p-8 space-y-6">
            {renderStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
