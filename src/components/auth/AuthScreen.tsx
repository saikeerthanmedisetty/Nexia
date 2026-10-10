"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Mail,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  RotateCw,
} from "lucide-react";

type AuthMode = "login" | "signup" | "forgot_request" | "forgot_verify";

export function AuthScreen() {
  const {
    handleLogin,
    handleSignup,
    handleForgotPassword,
    handleResetPassword,
    isLoading: authLoading,
    error: authError,
    clearError,
  } = useAuth();

  // ── Local Form States ───────────────────────────────────
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("saikeerthanmedisetty686@gmail.com");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Local processing and feedback
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isLoading = authLoading || localLoading;
  const activeError = authError || localError;

  // ── Mode Switcher ───────────────────────────────────────
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    clearError();
    setLocalError(null);
    setSuccessNotice(null);
  };

  // ── 1. Submit Login / Signup ────────────────────────────
  const onSubmitAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessNotice(null);

    if (mode === "login") {
      await handleLogin(email, password, rememberMe);
    } else if (mode === "signup") {
      await handleSignup(email, password, rememberMe);
    }
  };

  // ── 2. Request OTP for Password Reset ───────────────────
  const onRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setLocalError("Please enter a valid email address.");
      return;
    }

    setLocalLoading(true);
    setLocalError(null);
    setSuccessNotice(null);

    try {
      const res = await handleForgotPassword(email);
      setSuccessNotice(res.message);
      setMode("forgot_verify");
    } catch (err: any) {
      setLocalError(err.message || "Failed to dispatch verification code.");
    } finally {
      setLocalLoading(false);
    }
  };

  // ── 3. Submit OTP & In-Place Password Reset ──────────────
  const onResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!otp || otp.trim().length !== 6) {
      setLocalError("Please enter the 6-digit verification code.");
      return;
    }

    if (password.length < 6) {
      setLocalError("New password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match. Please re-enter.");
      return;
    }

    setLocalLoading(true);

    try {
      const res = await handleResetPassword(email, otp.trim(), password);
      // Reset complete: switch back to login with success banner
      setSuccessNotice(res.message);
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setMode("login");
    } catch (err: any) {
      setLocalError(err.message || "Failed to update password.");
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] text-white px-4 py-8 relative overflow-hidden font-sans">
      {/* ── Background Ambient Glows ───────────────────── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#5E6AD2_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
      </div>

      {/* ── Auth Container ─────────────────────────────── */}
      <div className="relative w-full max-w-md">
        {/* Logo + Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-[#121824] border border-white/10 flex items-center justify-center shadow-xl shadow-indigo-500/20 mb-3 p-2.5">
            <img
              src="/brand/nexia-mark-dark.png"
              alt="Nexia"
              className="w-full h-full object-contain select-none"
            />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {mode === "login" && "Welcome back"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot_request" && "Reset your password"}
            {mode === "forgot_verify" && "Enter verification code"}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {mode === "login" && "Sign in to your Nexia workspace"}
            {mode === "signup" && "Get started with your Nexia workspace"}
            {mode === "forgot_request" && "Enter your email to receive a code"}
            {mode === "forgot_verify" && "Check your Gmail for the 6-digit code"}
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-white/10 bg-[#121824]/90 backdrop-blur-xl shadow-2xl shadow-black/80 p-6 sm:p-8">
          {/* ── Success Notification Banner ──────────── */}
          {successNotice && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
              <span className="leading-relaxed">{successNotice}</span>
            </div>
          )}

          {/* ── Error Notification Banner ────────────── */}
          {activeError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
              <span className="leading-relaxed">{activeError}</span>
            </div>
          )}

          {/* ── Mode 1 & 2: LOGIN or SIGNUP ─────────── */}
          {(mode === "login" || mode === "signup") && (
            <form onSubmit={onSubmitAuth} className="flex flex-col gap-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 py-2.5 text-sm text-white
                               placeholder:text-zinc-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Password
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot_request")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-10 py-2.5 text-sm text-white
                               placeholder:text-zinc-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me Option */}
              {mode === "login" && (
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    id="remember-device"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-indigo-600 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer"
                  />
                  <label
                    htmlFor="remember-device"
                    className="text-xs text-zinc-400 cursor-pointer select-none"
                  >
                    Keep session active on this device
                  </label>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl
                           bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-2.5 text-sm font-medium
                           hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98]
                           shadow-lg shadow-indigo-600/25
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{mode === "login" ? "Verifying Credentials…" : "Creating Workspace…"}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === "login" ? "Sign In to Workspace" : "Create Free Account"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Mode 3: FORGOT PASSWORD REQUEST ──────── */}
          {mode === "forgot_request" && (
            <form onSubmit={onRequestOtp} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 py-2.5 text-sm text-white
                               placeholder:text-zinc-500
                               focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/60
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full flex items-center justify-center gap-2 rounded-xl
                           bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-2.5 text-sm font-medium
                           hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98]
                           shadow-lg shadow-indigo-600/20
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending code…</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Sign In</span>
              </button>
            </form>
          )}

          {/* ── Mode 4: FORGOT PASSWORD VERIFY & RESET ── */}
          {mode === "forgot_verify" && (
            <form onSubmit={onResetPassword} className="flex flex-col gap-4">
              {/* Security Instruction: Check Gmail */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 leading-relaxed flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-indigo-400" />
                <span>
                  Code sent to <strong className="text-white">{email}</strong>. Check your Gmail inbox or spam.
                </span>
              </div>

              {/* 6-Digit OTP Input */}
              <div>
                <label
                  htmlFor="verify-otp"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="verify-otp"
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 py-2.5 text-base font-mono tracking-[0.35em] text-white
                               placeholder:text-zinc-600 placeholder:tracking-normal
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
              </div>

              {/* New Password */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-10 py-2.5 text-sm text-white
                               placeholder:text-zinc-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-10 py-2.5 text-sm text-white
                               placeholder:text-zinc-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Update */}
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6 || password.length < 6}
                className="w-full flex items-center justify-center gap-2 rounded-xl
                           bg-gradient-to-r from-emerald-600 to-indigo-600 text-white py-2.5 text-sm font-medium
                           hover:from-emerald-500 hover:to-indigo-500 active:scale-[0.98]
                           shadow-lg shadow-emerald-600/20
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating…</span>
                  </>
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                <button
                  type="button"
                  onClick={() => switchMode("forgot_request")}
                  className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Resend code</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* ── Divider & Mode Switch (For Login / Signup) ── */}
          {(mode === "login" || mode === "signup") && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#121824] px-3 text-zinc-400">
                    {mode === "login" ? "New to Nexia?" : "Already have an account?"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl
                           border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-zinc-300
                           hover:bg-white/[0.08] hover:text-white active:scale-[0.98]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-indigo-400" />
                {mode === "login" ? "Create a new account" : "Sign in to existing account"}
              </button>
            </>
          )}
        </div>

        {/* Minimal Security Footer */}
        <p className="text-center text-[11px] text-zinc-600 mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-zinc-600" />
          <span>Encrypted Session • Nexia Security</span>
        </p>
      </div>
    </div>
  );
}
