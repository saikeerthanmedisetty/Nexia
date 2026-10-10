'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  Menu, 
  Mail, 
  Calendar, 
  Receipt, 
  Car, 
  Video, 
  Trash2,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Pin,
  Archive,
  ArchiveRestore,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { motion } from 'framer-motion';
import { cn, formatUserName } from '@/lib/utils';
import { Message } from '@/components/chat/ChatWindow';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { generateSmartTitle, isMalformedTitle } from '@/lib/titleGenerator';

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  iconType: 'email' | 'calendar' | 'receipt' | 'uber' | 'video' | 'chat';
  messages: Message[];
  isPinned?: boolean;
  isArchived?: boolean;
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const defaultStarterSessions: ChatSession[] = [];

export interface SidebarProps {
  sessions?: ChatSession[];
  activeSessionId?: string | null;
  onNewChat?: () => void;
  onSelectSession?: (session: ChatSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  onPinSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onOpenProfile?: () => void;
}

function SidebarContent({ 
  sessions = defaultStarterSessions, 
  activeSessionId, 
  onNewChat, 
  onSelectSession, 
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onOpenProfile 
}: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [persistedSessions, setPersistedSessions] = useState<ChatSession[]>([]);
  const [menuOpenSessionId, setMenuOpenSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [archivedSearchQuery, setArchivedSearchQuery] = useState('');
  const [isRecentActivityOpen, setIsRecentActivityOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Outside click listener that reliably dismisses dropdowns without a blocking backdrop
  useEffect(() => {
    if (!menuOpenSessionId) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenSessionId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpenSessionId(null);
        setEditingSessionId(null);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 10);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpenSessionId]);

  useEffect(() => {
    const loadSessions = () => {
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem("nexia_chat_sessions_v2");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const cleaned = parsed.map((sess: any) => {
                let t = sess.title || '';
                if (isMalformedTitle(t)) {
                  const firstUserMsg = (sess.messages || []).find((m: any) => m.role === 'user')?.content;
                  if (firstUserMsg) t = generateSmartTitle(firstUserMsg);
                }
                t = t.replace(/\b(?:agent|agents|assistant|assistants|ai|workflow|workflows)\b/gi, '').replace(/\s+/g, ' ').trim();
                return {
                  ...sess,
                  title: t.replace(/^["'`\s]+|["'`\s]+$/g, '').trim() || 'Executive Session',
                };
              });
              setPersistedSessions(cleaned);
            }
          }
        } catch {}
      }
    };

    loadSessions();
    window.addEventListener('storage', loadSessions);
    window.addEventListener('nexia_sessions_updated', loadSessions);
    return () => {
      window.removeEventListener('storage', loadSessions);
      window.removeEventListener('nexia_sessions_updated', loadSessions);
    };
  }, []);

  const currentSessions = (sessions && sessions !== defaultStarterSessions && sessions.length > 0)
    ? sessions
    : (persistedSessions.length > 0 ? persistedSessions : defaultStarterSessions);

  const displayName = formatUserName(user?.displayName, user?.email);
  const initial = displayName.charAt(0).toUpperCase() || 'S';

  const filtered = currentSessions.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedSessions = filtered.filter(s => s.isPinned && !s.isArchived);
  const recentSessions = filtered.filter(s => !s.isPinned && !s.isArchived);
  const archivedSessions = filtered.filter(s => s.isArchived);

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail size={14} className="text-indigo-600 dark:text-indigo-400" />;
      case 'calendar': return <Calendar size={14} className="text-indigo-600 dark:text-indigo-400" />;
      case 'receipt': return <Receipt size={14} className="text-violet-600 dark:text-violet-400" />;
      case 'uber': return <Car size={14} className="text-emerald-500 dark:text-emerald-400" />;
      case 'video': return <Video size={14} className="text-red-500 dark:text-red-400" />;
      default: return <MessageSquare size={14} className="text-slate-500 dark:text-zinc-400" />;
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setMenuOpenSessionId(null);
    if (onDeleteSession) {
      onDeleteSession(id);
    } else {
      const updated = currentSessions.filter((s) => s.id !== id);
      setPersistedSessions(updated);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch {}
      toast.success("Conversation deleted.");
    }
  };

  const handleRename = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (onRenameSession) {
      onRenameSession(id, trimmed);
    } else {
      const updated = currentSessions.map((s) => s.id === id ? { ...s, title: trimmed } : s);
      setPersistedSessions(updated);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch {}
      toast.success("Conversation renamed.");
    }
  };

  const handleTogglePin = (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setMenuOpenSessionId(null);
    if (onPinSession) {
      onPinSession(id);
    } else {
      let isPinnedNow = false;
      const updated = currentSessions.map((s) => {
        if (s.id === id) {
          isPinnedNow = !s.isPinned;
          return { ...s, isPinned: isPinnedNow };
        }
        return s;
      });
      setPersistedSessions(updated);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch {}
      toast.success(isPinnedNow ? "Conversation pinned to top." : "Conversation unpinned.");
    }
  };

  const handleToggleArchive = (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setMenuOpenSessionId(null);
    if (onArchiveSession) {
      onArchiveSession(id);
    } else {
      let isArchivedNow = false;
      const updated = currentSessions.map((s) => {
        if (s.id === id) {
          isArchivedNow = !s.isArchived;
          return { ...s, isArchived: isArchivedNow };
        }
        return s;
      });
      setPersistedSessions(updated);
      try {
        localStorage.setItem("nexia_chat_sessions_v2", JSON.stringify(updated));
      } catch {}
      toast.success(isArchivedNow ? "Conversation moved to Archived Chats." : "Conversation restored to Recent Activity.");
    }
  };

  const fallbackCopyText = (text: string) => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      toast.success("Conversation transcript copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const handleCopy = (session: ChatSession, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setMenuOpenSessionId(null);
    try {
      let content = `Chat Title: ${session.title}\n`;
      content += `Date: ${new Date(session.updatedAt).toLocaleString()}\n`;
      content += `----------------------------------------\n\n`;

      if (session.messages && session.messages.length > 0) {
        const conversationText = session.messages.map((m) => {
          const roleLabel = m.role === 'user' ? 'User' : (m.agentName || 'Nexia');
          return `[${roleLabel}]:\n${m.content}\n`;
        }).join('\n');
        content += conversationText;
      } else {
        content += `(No conversation messages recorded)`;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(() => {
          toast.success("Conversation transcript copied to clipboard!");
        }).catch(() => {
          fallbackCopyText(content);
        });
      } else {
        fallbackCopyText(content);
      }
    } catch (err) {
      toast.error("Failed to copy conversation.");
    }
  };

  const startRename = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const commitRename = (id: string) => {
    if (editingSessionId === id) {
      if (editTitle.trim()) {
        handleRename(id, editTitle.trim());
      }
      setEditingSessionId(null);
    }
  };

  const renderSessionItem = (session: ChatSession) => {
    const isSelected = activeSessionId === session.id;
    const isMenuOpen = menuOpenSessionId === session.id;
    const isEditing = editingSessionId === session.id;

    return (
      <div
        key={session.id}
        onClick={() => {
          if (isEditing) return;
          if (isMenuOpen) {
            setMenuOpenSessionId(null);
            return;
          }
          if (pathname === '/chat') {
            onSelectSession?.(session);
          } else {
            router.push(`/chat?session=${encodeURIComponent(session.id)}`);
          }
        }}
        className={cn(
          'group flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border relative',
          isSelected
            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/40 text-indigo-950 dark:text-white shadow-xs'
            : 'bg-slate-100/70 dark:bg-black/20 border-transparent text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/70 dark:hover:bg-white/[0.03]',
          isMenuOpen && 'z-30 ring-1 ring-indigo-500/40 dark:ring-indigo-400/40',
          session.isArchived && 'opacity-85'
        )}
        title={isEditing ? undefined : session.title}
      >
        {/* Left icon + Title (or Inline input) */}
        <div className="flex items-center space-x-2 truncate mr-1.5 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 shadow-xs">
            {getIcon(session.iconType)}
          </div>
          
          {isEditing ? (
            <div 
              className="flex items-center space-x-1 min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(session.id);
                  } else if (e.key === 'Escape') {
                    setEditingSessionId(null);
                  }
                }}
                onBlur={() => commitRename(session.id)}
                autoFocus
                className="w-full px-2 py-0.5 text-xs rounded bg-white dark:bg-zinc-800 border border-indigo-500 text-slate-900 dark:text-white font-mono focus:outline-none shadow-xs"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitRename(session.id);
                }}
                className="p-1 text-emerald-600 hover:text-emerald-500 cursor-pointer"
                title="Save"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setEditingSessionId(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 truncate min-w-0 flex-1">
              {session.isPinned && !session.isArchived && (
                <Pin size={10} className="text-amber-500 fill-amber-500 shrink-0" />
              )}
              {session.isArchived && (
                <Archive size={10} className="text-indigo-400 shrink-0" />
              )}
              <span className="truncate font-medium">{session.title}</span>
            </div>
          )}
        </div>

        {/* Right side: Time and 3-Dot Options Trigger */}
        {!isEditing && (
          <div className="flex items-center space-x-1 shrink-0 relative">
            <span className={cn(
              "text-[10px] text-slate-400 dark:text-zinc-600 transition-opacity",
              isMenuOpen ? "hidden" : "group-hover:hidden"
            )}>
              {formatRelativeTime(session.updatedAt)}
            </span>

            {/* 3-Dot Options Button */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenSessionId(isMenuOpen ? null : session.id);
              }}
              className={cn(
                "p-1 rounded-md transition-all cursor-pointer",
                isMenuOpen
                  ? "flex bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white"
                  : "hidden group-hover:flex text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-200/70 dark:hover:bg-white/10"
              )}
              title="Chat options"
            >
              <MoreHorizontal size={14} />
            </button>

            {/* Floating Dropdown Menu (Rename, Pin, Archive/Unarchive, Copy, Delete) */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-7 z-50 w-36 py-1.5 px-1 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-white/10 shadow-2xl backdrop-blur-xl text-xs font-mono"
              >
                {/* 1. Rename */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpenSessionId(null);
                    startRename(session);
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
                >
                  <Pencil size={13} className="text-slate-400 dark:text-zinc-400 shrink-0" />
                  <span>Rename</span>
                </button>

                {/* 2. Pin / Unpin */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleTogglePin(session.id, e)}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
                >
                  <Pin size={13} className={cn("shrink-0", session.isPinned ? "text-amber-500 fill-amber-500" : "text-slate-400 dark:text-zinc-400")} />
                  <span>{session.isPinned ? 'Unpin' : 'Pin'}</span>
                </button>

                {/* 3. Archive / Unarchive */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleToggleArchive(session.id, e)}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
                >
                  {session.isArchived ? (
                    <ArchiveRestore size={13} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
                  ) : (
                    <Archive size={13} className="text-slate-400 dark:text-zinc-400 shrink-0" />
                  )}
                  <span>{session.isArchived ? 'Unarchive' : 'Archive'}</span>
                </button>

                {/* 4. Copy */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleCopy(session, e)}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer text-left"
                >
                  <Copy size={13} className="text-slate-400 dark:text-zinc-400 shrink-0" />
                  <span>Copy</span>
                </button>

                <div className="h-px bg-slate-200 dark:bg-white/5 my-1" />

                {/* 5. Delete */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleDelete(session.id, e)}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer text-left"
                >
                  <Trash2 size={13} className="text-red-500 shrink-0" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0B0F17] text-slate-800 dark:text-zinc-200 border-r border-slate-200 dark:border-white/10 select-none">
      
      {/* ── Top Header & New Chat ── */}
      <div className="p-4 space-y-3.5">
        {/* Brand Logo - NEXIA */}
        <div 
          onClick={() => {
            onNewChat?.();
            if (pathname !== '/chat') {
              router.push('/chat');
            }
          }}
          className="group flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer select-none"
          title="Start a new chat"
        >
          <img 
            src="/brand/nexia-logo-dark.png" 
            alt="NEXIA" 
            className="hidden dark:block w-full max-w-[165px] h-auto object-contain mx-auto select-none transition-all duration-200 group-hover:scale-[1.02] group-hover:drop-shadow-[0_0_16px_rgba(99,102,241,0.25)]"
          />
          <img 
            src="/brand/nexia-logo-light.png" 
            alt="NEXIA" 
            className="block dark:hidden w-full max-w-[165px] h-auto object-contain mx-auto select-none transition-all duration-200 group-hover:scale-[1.02]"
          />
        </div>

        {/* ── Navigation Switch: Chat vs Executive Dashboard ── */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 text-xs font-mono">
          <Link
            href="/chat"
            className={cn(
              "flex items-center justify-center space-x-1.5 py-1.5 rounded-lg transition-all",
              pathname === '/chat' || pathname === '/'
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center justify-center space-x-1.5 py-1.5 rounded-lg transition-all",
              pathname === '/dashboard'
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <LayoutDashboard size={13} />
            <span>Dashboard</span>
          </Link>
        </div>

        {/* ── + New Chat Pill Button (Linear Deep Indigo) ── */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            onNewChat?.();
            if (pathname !== '/chat') {
              router.push('/chat');
            }
          }}
          className="w-full py-2.5 px-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs font-mono shadow-[0_0_20px_rgba(99,102,241,0.35)] flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          <Plus size={16} className="stroke-[2.5]" />
          <span>+ New Chat</span>
        </motion.button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 text-xs text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-indigo-500 outline-none transition-all font-mono"
          />
        </div>
      </div>

      {/* ── Middle: Recent Activity Sessions (Real-Time & Persistent) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 font-mono">
        <div className="space-y-1 py-1">
          {/* Pinned Section (if any pinned sessions exist) */}
          {pinnedSessions.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-amber-500/90 dark:text-amber-400/90 uppercase tracking-wider px-3 pb-1 pt-1 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Pin size={10} className="fill-amber-500/20 stroke-amber-500" />
                  <span>PINNED CONVERSATIONS</span>
                </span>
                <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400">{pinnedSessions.length}</span>
              </div>
              <div className="space-y-1">
                {pinnedSessions.map((session) => renderSessionItem(session))}
              </div>
            </div>
          )}

          {/* Recent Activity Section Header with Drop-Down Arrow */}
          <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-3 pb-1 pt-1 flex items-center justify-between font-mono">
            <button
              type="button"
              onClick={() => setIsRecentActivityOpen(!isRecentActivityOpen)}
              className="flex items-center space-x-1.5 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer group select-none"
              title={isRecentActivityOpen ? "Collapse Recent Activity" : "Expand Recent Activity"}
            >
              <ChevronDown 
                size={12} 
                className={cn(
                  "text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-transform duration-200", 
                  !isRecentActivityOpen && "-rotate-90"
                )} 
              />
              <span className="font-semibold">RECENT ACTIVITY</span>
            </button>
            <div className="flex items-center space-x-1.5">
              <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400">{recentSessions.length}</span>
              {archivedSessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsArchivedModalOpen(true)}
                  className="text-[9px] text-slate-400 hover:text-indigo-500 flex items-center space-x-0.5 cursor-pointer ml-1 transition-colors"
                  title="Open Archived Conversations"
                >
                  <span>•</span>
                  <Archive size={9} />
                  <span>{archivedSessions.length}</span>
                </button>
              )}
            </div>
          </div>

          {isRecentActivityOpen && (
            recentSessions.length > 0 ? (
              <div className="space-y-1">
                {recentSessions.map((session) => renderSessionItem(session))}
              </div>
            ) : pinnedSessions.length === 0 ? (
              <div className="text-center text-xs text-slate-400 dark:text-zinc-500 py-6 space-y-1.5">
                <div>No recent conversations</div>
                <button
                  type="button"
                  onClick={() => {
                    onNewChat?.();
                    if (pathname !== '/chat') router.push('/chat');
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono font-medium cursor-pointer"
                >
                  + Start a new session
                </button>
              </div>
            ) : (
              <div className="text-center text-[11px] text-slate-400 dark:text-zinc-600 py-4">
                All active chats are pinned
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Fixed Sidebar Footer: Dedicated Archived Chats Section (Clean, Prominent Placement) ── */}
      <div className="px-3 py-2 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/20">
        <button
          type="button"
          onClick={() => setIsArchivedModalOpen(true)}
          className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-mono text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5 transition-all cursor-pointer group"
          title="Open Archived Conversations"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0">
              <Archive size={13} />
            </div>
            <span className="font-semibold text-slate-700 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
              Archived Chats
            </span>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0 pl-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono">
              {archivedSessions.length}
            </span>
            <ChevronRight size={13} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>

      {/* ── Bottom: User Profile (Sai Keerthan) — Opens Profile & Settings Modal ── */}
      <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/40">
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/[0.06] border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all text-left group cursor-pointer"
          title="Open Profile & Settings"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5 shadow-sm group-hover:shadow-[0_0_14px_rgba(99,102,241,0.4)] transition-shadow">
                <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center text-[10px] font-bold text-white font-mono">
                  {initial}
                </div>
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-black" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-white font-mono leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {displayName}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono block truncate">
                Administrator
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0 pl-1">
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 hidden sm:inline">
              Settings
            </span>
          </div>
        </button>
      </div>

      {/* ── Dedicated Archived Conversations Management Modal ── */}
      {isArchivedModalOpen && (
        <div 
          onClick={() => setIsArchivedModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden font-mono"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                  <Archive size={16} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">Archived Conversations</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                      {archivedSessions.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Stored chats kept safely outside your active conversation list
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsArchivedModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search within Archived */}
            {archivedSessions.length > 0 && (
              <div className="p-3 border-b border-slate-100 dark:border-white/5">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search archived conversations..."
                    value={archivedSearchQuery}
                    onChange={(e) => setArchivedSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 text-xs text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>
            )}

            {/* Modal Body: List of Archived Chats */}
            <div className="max-h-[380px] min-h-[160px] overflow-y-auto p-3 space-y-2">
              {archivedSessions.filter(s => s.title.toLowerCase().includes(archivedSearchQuery.toLowerCase())).length > 0 ? (
                archivedSessions
                  .filter(s => s.title.toLowerCase().includes(archivedSearchQuery.toLowerCase()))
                  .map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/5 hover:border-indigo-500/30 transition-all text-xs"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">
                          {getIcon(session.iconType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {session.title}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-500 flex items-center space-x-2 mt-0.5">
                            <span>{formatRelativeTime(session.updatedAt)}</span>
                            <span>•</span>
                            <span>{session.messages?.length || 0} messages</span>
                          </div>
                        </div>
                      </div>

                      {/* Modal Item Actions: Restore, Open, Delete */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(session.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-xs text-[11px]"
                          title="Restore to Recent Activity"
                        >
                          <ArchiveRestore size={13} />
                          <span>Restore</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsArchivedModalOpen(false);
                            if (pathname === '/chat') {
                              onSelectSession?.(session);
                            } else {
                              router.push(`/chat?session=${encodeURIComponent(session.id)}`);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-200/70 dark:bg-white/5 hover:bg-slate-300/70 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 flex items-center space-x-1 transition-all cursor-pointer text-[11px]"
                          title="Open and view conversation"
                        >
                          <span>Open</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleDelete(session.id, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="Delete permanently"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-10 text-center">
                  <Archive size={28} className="mx-auto mb-2 text-indigo-500/50" />
                  <p className="font-semibold text-slate-700 dark:text-zinc-300 text-xs">
                    {archivedSessions.length === 0 ? "No archived conversations" : "No matching archived conversations"}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 max-w-xs mx-auto">
                    {archivedSessions.length === 0 
                      ? "To archive any chat, click the 3 dots (...) on that conversation in your sidebar and select 'Archive'."
                      : "Try searching for another keyword."}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span>Total Archived: {archivedSessions.length}</span>
              <button
                type="button"
                onClick={() => setIsArchivedModalOpen(false)}
                className="px-3 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 hover:bg-slate-300/70 dark:hover:bg-white/15 text-slate-800 dark:text-white font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <>
      {/* Mobile Drawer */}
      <Sheet>
        <SheetTrigger className="md:hidden fixed top-3 left-4 z-50 rounded-xl shadow-lg h-9 w-9 inline-flex items-center justify-center border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white hover:border-indigo-400/50 cursor-pointer">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle Sidebar</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-[#080c16]">
          <SidebarContent {...props} />
        </SheetContent>
      </Sheet>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:block w-[280px] shrink-0 h-screen sticky top-0 z-30">
        <SidebarContent {...props} />
      </aside>
    </>
  );
}
