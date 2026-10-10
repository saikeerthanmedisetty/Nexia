'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, LayoutDashboard, Share } from 'lucide-react';
import { UserMenu } from '@/components/auth/UserMenu';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onOpenProfile?: () => void;
  onShareChat?: () => void;
  isSharing?: boolean;
  onNewChat?: () => void;
}

export function Header({ onOpenProfile, onShareChat, isSharing, onNewChat }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0B0F17]/90 px-4 md:px-6 backdrop-blur-md">
      
      {/* ── Brand Logo & Live Pulse ── */}
      <div className="flex items-center space-x-3 pl-10 md:pl-0">
        <Link 
          href="/chat"
          onClick={() => onNewChat?.()}
          className="group flex items-center space-x-2.5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
          title="Start a new chat"
        >
          <img 
            src="/brand/nexia-mark-dark.png" 
            alt="NEXIA" 
            className="hidden dark:block w-7 h-7 object-contain rounded-md select-none group-hover:scale-105 transition-transform"
          />
          <img 
            src="/brand/nexia-mark-light.png" 
            alt="NEXIA" 
            className="block dark:hidden w-7 h-7 object-contain rounded-md select-none group-hover:scale-105 transition-transform"
          />
          <span className="font-extrabold text-sm font-sans tracking-wider text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">NEXIA</span>
        </Link>

        {/* Online Status Pill */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-600 dark:text-zinc-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
          <span>Online</span>
        </div>
      </div>

      {/* ── Center: Sleek Chat vs Dashboard Toggle ── */}
      <nav className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs font-mono">
        <Link
          href="/chat"
          className={cn(
            "flex items-center space-x-1.5 px-3 py-1 rounded-lg transition-all",
            pathname === '/chat' || pathname === '/'
              ? "bg-indigo-600 text-white shadow-xs font-bold"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
          )}
        >
          <MessageSquare size={13} />
          <span>Chat</span>
        </Link>
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center space-x-1.5 px-3 py-1 rounded-lg transition-all",
            pathname === '/dashboard'
              ? "bg-indigo-600 text-white shadow-xs font-bold"
              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
          )}
        >
          <LayoutDashboard size={13} />
          <span>Executive Dashboard</span>
        </Link>
      </nav>

      {/* ── Right Actions: Share & User Profile ── */}
      <div className="flex items-center space-x-2.5">
        {onShareChat && (
          <button
            type="button"
            onClick={onShareChat}
            disabled={isSharing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-white/10 text-xs font-mono font-medium transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
            title="Share this conversation"
          >
            <Share size={13} className="text-indigo-500" />
            <span>Share</span>
          </button>
        )}
        <UserMenu onOpenProfile={onOpenProfile} />
      </div>

    </header>
  );
}
