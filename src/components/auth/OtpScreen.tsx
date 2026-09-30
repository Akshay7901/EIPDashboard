import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';

interface OtpScreenProps {
  email: string;
  onVerify: (otp: string) => Promise<void>;
  isLoading: boolean;
  onBack?: () => void;
  // Fallback for users whose email provider blocks the OTP email
  onUseTempPassword?: () => void;
}

const OTP_EXPIRY_SECONDS = 15 * 60; // 15 minutes

const OtpScreen: React.FC<OtpScreenProps> = ({ email, onVerify, isLoading, onBack, onUseTempPassword }) => {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [timeLeft, setTimeLeft] = useState(OTP_EXPIRY_SECONDS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array(6).fill('');
    pasted.split('').forEach((ch, i) => (next[i] = ch));
    setOtp(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const otpValue = otp.join('');
  const isComplete = otpValue.length === 6;
  const isExpired = timeLeft <= 0;

  return (
    <div className="space-y-6 text-center animate-fade-in">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#3d5a47]/10">
          <Mail className="h-7 w-7 text-[#3d5a47]" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We've sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <Input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="h-12 w-10 sm:w-12 text-center text-lg font-semibold bg-[#f0f4f8] border-0 focus-visible:ring-[#3d5a47]"
            disabled={isLoading || isExpired}
          />
        ))}
      </div>

      {isExpired ? (
        <p className="text-sm text-destructive font-medium">Code expired. Please request a new one.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Code expires in <span className="font-medium text-foreground">{formatTime(timeLeft)}</span>
        </p>
      )}

      <Button
        onClick={() => onVerify(otpValue)}
        className="w-full h-12 text-base font-medium bg-[#3d5a47] hover:bg-[#2d4a37] text-white"
        disabled={!isComplete || isLoading || isExpired}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Verifying...
          </>
        ) : (
          'Verify'
        )}
      </Button>

      {onUseTempPassword && (
        <p className="text-sm text-muted-foreground">
          Didn't receive the code?{' '}
          <button
            type="button"
            onClick={onUseTempPassword}
            disabled={isLoading}
            className="font-medium text-[#3d5a47] hover:text-[#2d4a37] hover:underline transition-colors"
          >
            Use a temporary password
          </button>
        </p>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mt-4"
          type="button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </button>
      )}
    </div>
  );
};

export default OtpScreen;
