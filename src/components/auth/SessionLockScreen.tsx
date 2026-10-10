"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  LogOut,
} from "lucide-react";

export function SessionLockScreen() {
  const { user, handleUnlock, handleLogout } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format display name intelligently
  const email = user?.email || "";
  const rawName = user?.displayName || email.split("@")[0] || "User";
  const displayName =
    email.toLowerCase().includes("saikeerthan") || rawName.toLowerCase().includes("saikeerthan")
      ? "Sai Keerthan"
      : rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const initial = displayName.charAt(0).toUpperCase();

  const onUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError(null);

    try {
      const ok = await handleUnlock(password);
      if (!ok) {
        setError("Incorrect password. Please try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to unlock session.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] text-white px-4 py-8 relative overflow-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-violet-600/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#5E6AD2_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="relative mb-3">
            <div className="h-16 w-16 rounded-2xl bg-[#121824] border border-white/10 flex items-center justify-center shadow-xl shadow-indigo-500/20 p-2.5">
              <img
                src="/brand/nexia-mark-dark.png"
                alt="Nexia"
                className="w-full h-full object-contain select-none"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Workspace Locked</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Enter your password to resume
          </p>
        </div>

        {/* Lock Card */}
        <div className="rounded-2xl border border-white/10 bg-[#121824]/90 backdrop-blur-xl shadow-2xl shadow-black/80 p-6 sm:p-7">
          {/* User Identity Pill */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5 shrink-0">
              <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{initial}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{displayName}</p>
              <p className="text-[11px] text-zinc-400 truncate">{email}</p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Active</span>
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onUnlock} className="flex flex-col gap-4">
            <div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="unlock-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoFocus
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-10 py-2.5 text-sm text-white
                             placeholder:text-zinc-500
                             focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/60
                             disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
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

            {/* Unlock Button */}
            <button
              type="submit"
              disabled={isLoading || !password}
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
                  <span>Unlocking…</span>
                </>
              ) : (
                <>
                  <span>Unlock Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Switch Account */}
          <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-zinc-500">Not your account?</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <LogOut className="h-3 w-3" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <p className="text-center text-[11px] text-zinc-600 mt-5 flex items-center justify-center gap-1.5">
          <Lock className="h-3 w-3" />
          <span>Encrypted Session</span>
        </p>
      </div>
    </div>
  );
}
