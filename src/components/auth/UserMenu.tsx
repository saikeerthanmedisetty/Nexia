"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User as UserIcon, ChevronDown, Sliders, ShieldCheck, Lock } from "lucide-react";
import { formatUserName } from "@/lib/utils";

interface UserMenuProps {
  onOpenProfile?: () => void;
}

export function UserMenu({ onOpenProfile }: UserMenuProps) {
  const { user, handleLogout, handleLock, isLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const displayName = formatUserName(user?.displayName, user?.email);
  const email = user?.email || "";
  const initial = displayName.charAt(0).toUpperCase() || "S";

  return (
    <div className="relative font-mono">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5
                   hover:bg-white/5 hover:border-indigo-400/40 transition-all text-xs cursor-pointer"
        aria-label="User menu"
      >
        {/* Avatar circle */}
        <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5 flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">{initial}</span>
          </div>
        </div>
        <span className="hidden sm:inline max-w-[160px] truncate text-xs text-slate-800 dark:text-zinc-200">
          {displayName}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-400 dark:text-zinc-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-60 z-50 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] shadow-xl dark:shadow-2xl dark:shadow-black/80 py-1.5 text-xs">
            {/* User info */}
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5 flex items-center justify-center shrink-0">
                  <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">{initial}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                    {email}
                  </p>
                </div>
              </div>
            </div>

            {/* Profile & System Settings */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
              onClick={() => {
                setOpen(false);
                if (onOpenProfile) onOpenProfile();
              }}
            >
              <Sliders className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Profile & Settings</span>
            </button>

            {/* Lock Workspace */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
              onClick={() => {
                setOpen(false);
                handleLock();
              }}
            >
              <Lock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span>Lock Workspace</span>
            </button>

            {/* Security Guardrail status */}
            <div className="px-3.5 py-1.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-white/[0.02]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-500 dark:text-emerald-400" />
                <span>Safety Guardrails</span>
              </span>
              <span className="text-emerald-500 dark:text-emerald-400 font-semibold">Active</span>
            </div>

            {/* Logout */}
            <button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                await handleLogout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-500 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 border-t border-slate-100 dark:border-white/5 cursor-pointer mt-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
