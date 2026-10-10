"use client";

import { useAuth } from "@/contexts/AuthContext";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SessionLockScreen } from "@/components/auth/SessionLockScreen";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

// ─── Auth Guard ──────────────────────────────────────────
// - isLoading (checking saved session on mount) → show spinner
// - Not authenticated → show AuthScreen
// - Authenticated but session locked → show SessionLockScreen
// - Authenticated & unlocked → render workspace children
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isLocked } = useAuth();

  // Show centered spinner while restoring session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F17]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-xs font-mono text-zinc-400">Restoring secure session…</p>
        </div>
      </div>
    );
  }

  // Not authenticated at all → show main Auth Screen (Login / Signup / Forgot Password)
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Authenticated, but session is actively locked (e.g. user stepped away or switched tabs)
  if (isLocked) {
    return <SessionLockScreen />;
  }

  // Fully authenticated and unlocked
  return <>{children}</>;
}
