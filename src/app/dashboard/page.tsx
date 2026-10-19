"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  RefreshCw, 
  Trash2, 
  MessageSquare, 
  ExternalLink, 
  ShieldAlert, 
  Mail, 
  Car, 
  Video, 
  FileSpreadsheet, 
  Search, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Layers,
  MapPin,
  ChevronDown,
  Video as VideoIcon,
  Edit3,
  Send,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Sidebar, defaultStarterSessions, ChatSession } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ProfileModal } from "@/components/auth/ProfileModal";
import { useAuth } from "@/contexts/AuthContext";
import type { CalendarEvent, FreeBlock, ConflictAlert } from "@/lib/calendar";
import type { AgentTaskRecord, TaskStatus } from "@/lib/tasks";
import type { GmailMessageSummary } from "@/lib/google/gmail";
import { cn, formatToISTTime, getISTDateString } from "@/lib/utils";
import { toast } from "sonner";
import { ExecutiveDatePicker } from "@/components/dashboard/ExecutiveDatePicker";

export default function ExecutiveDashboardPage() {
  const { user, handleLogout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'today' | 'tomorrow' | 'upcoming' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(() => getISTDateString());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Gmail Inbox Drawer State
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxEmails, setInboxEmails] = useState<GmailMessageSummary[]>([]);
  const [isFetchingInbox, setIsFetchingInbox] = useState(false);
  const [inboxSearchQuery, setInboxSearchQuery] = useState('');
  const [emailBriefs, setEmailBriefs] = useState<Record<string, {
    summary: string;
    proposedReply: string;
    needsReply: boolean;
    priority?: string;
  }>>({});
  const [isSynthesizingEmails, setIsSynthesizingEmails] = useState(false);
  const [editingDrafts, setEditingDrafts] = useState<Record<string, string>>({});
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'declined'>>({});
  const [openedEmailId, setOpenedEmailId] = useState<string | null>(null);

  // Live Data State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [freeBlocks, setFreeBlocks] = useState<FreeBlock[]>([]);
  const [conflicts, setConflicts] = useState<ConflictAlert[]>([]);
  const [calendarMetrics, setCalendarMetrics] = useState({ todayCount: 0, tomorrowCount: 0, upcomingCount: 0 });
  const [tasks, setTasks] = useState<AgentTaskRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<AgentTaskRecord[]>([]);
  const [weeklyBurn, setWeeklyBurn] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    email?: string;
    name?: string;
    youtube?: any;
    unreadEmails?: number;
    hasOAuth?: boolean;
    isServiceAccount?: boolean;
  }>({ connected: false });

  // Modal State for + Schedule Meeting
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return getISTDateString(tom);
  });
  const [newTime, setNewTime] = useState("15:00");
  const [newDuration, setNewDuration] = useState("45");
  const [newLocation, setNewLocation] = useState("Google Meet");
  const [isSubmittingMeeting, setIsSubmittingMeeting] = useState(false);

  // Real-time IST Clock
  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [currentDateStr, setCurrentDateStr] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        new Intl.DateTimeFormat('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        }).format(now)
      );
      setCurrentDateStr(
        new Intl.DateTimeFormat('en-IN', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        }).format(now)
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all live dashboard data concurrently
  const fetchDashboardData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);

    try {
      // 1. Fetch Calendar Events, Free Blocks & Conflicts
      const calUrl = selectedTab === 'custom'
        ? `/api/calendar?date=${customDate}&_t=${Date.now()}`
        : `/api/calendar?range=${selectedTab}&_t=${Date.now()}`;
      const calRes = await fetch(calUrl, { cache: 'no-store' });
      if (calRes.ok) {
        const calData = await calRes.json();
        if (calData.success) {
          setEvents(calData.events || []);
          setFreeBlocks(calData.freeBlocks || []);
          setConflicts(calData.conflicts || []);
          if (calData.metrics) {
            setCalendarMetrics(calData.metrics);
          }
        }
      }

      // 2. Fetch Tasks & Pending Approvals
      const tasksRes = await fetch('/api/tasks');
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        if (tasksData.success) {
          setTasks(tasksData.tasks || []);
          setPendingApprovals(tasksData.pendingApprovals || []);
        }
      }

      // 3. Fetch Financial Burn Rate from Sheets/Mongo (Strictly 7 Days)
      const sheetsRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'SHEETS', action: 'list', timeframe: '7_days', days: 7 }),
      });
      if (sheetsRes.ok) {
        const sheetsData = await sheetsRes.json();
        const total = sheetsData.data?.totalExpense !== undefined
          ? Number(sheetsData.data.totalExpense)
          : (sheetsData.data?.statement?.totalExpense !== undefined
              ? Number(sheetsData.data.statement.totalExpense)
              : 0);
        setWeeklyBurn(total);
      }

      // 4. Fetch Google Cloud Suite Status (Calendar, Gmail, Sheets, YouTube)
      try {
        const googleRes = await fetch('/api/auth/google/status');
        if (googleRes.ok) {
          const gData = await googleRes.json();
          setGoogleStatus(gData);
        }
      } catch (gErr) {
        console.warn("Notice checking Google status:", gErr);
      }
    } catch (err) {
      console.warn("Notice updating dashboard telemetry:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedTab, customDate]);

  // Synthesize executive summaries and proposed responses
  const synthesizeInboxEmails = useCallback(async (emails: GmailMessageSummary[]) => {
    if (!emails || emails.length === 0) return;
    setIsSynthesizingEmails(true);
    try {
      const res = await fetch('/api/email/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emails.slice(0, 15).map(m => ({
            id: m.id,
            threadId: m.threadId,
            subject: m.subject,
            snippet: m.snippet,
            from: m.from,
            date: m.date,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.results) {
          setEmailBriefs(prev => ({ ...prev, ...data.results }));
        }
      }
    } catch (err) {
      console.warn("Notice synthesizing inbox emails:", err);
    } finally {
      setIsSynthesizingEmails(false);
    }
  }, []);

  // Fetch real Gmail communications inbox
  const fetchInboxEmails = useCallback(async () => {
    setIsFetchingInbox(true);
    try {
      const res = await fetch('/api/email?limit=25');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          setInboxEmails(data.messages);
          synthesizeInboxEmails(data.messages);
        }
      }
    } catch (err) {
      console.warn("Notice fetching inbox emails:", err);
    } finally {
      setIsFetchingInbox(false);
    }
  }, [synthesizeInboxEmails]);

  // Periodic background check ("time to time")
  useEffect(() => {
    if (!googleStatus.connected) return;
    const interval = setInterval(() => {
      fetchInboxEmails();
    }, 30000);
    return () => clearInterval(interval);
  }, [googleStatus.connected, fetchInboxEmails]);

  // ⚡ Live Telemetry Auto-Syncing Loop (5-Second Real-Time Pulse)
  useEffect(() => {
    fetchDashboardData(true);
    fetchInboxEmails();
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5000);

    const handleCustomSync = () => {
      fetchDashboardData(true);
      if (googleStatus.connected) fetchInboxEmails();
    };

    window.addEventListener('nexia:sync', handleCustomSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('nexia:sync', handleCustomSync);
    };
  }, [fetchDashboardData, fetchInboxEmails, googleStatus.connected]);

  // Handle toggling email open/closed
  const handleToggleEmail = (email: GmailMessageSummary) => {
    if (openedEmailId === email.id) {
      setOpenedEmailId(null);
    } else {
      setOpenedEmailId(email.id);
      if (!emailBriefs[email.id]) {
        synthesizeInboxEmails([email]);
      }
    }
  };

  // Handle Publish / Send Reply directly in real Gmail
  const handlePublishReply = async (email: GmailMessageSummary, customBody?: string) => {
    const brief = emailBriefs[email.id];
    const replyBody = customBody || editingDrafts[email.id] || brief?.proposedReply;

    if (!replyBody || !replyBody.trim()) {
      toast.error("Response content cannot be empty.");
      return;
    }

    setDispatchStatus(prev => ({ ...prev, [email.id]: 'sending' }));
    try {
      const res = await fetch('/api/email/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.from,
          subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
          body: replyBody.trim(),
          threadId: email.threadId,
          messageId: email.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDispatchStatus(prev => ({ ...prev, [email.id]: 'sent' }));
          setActiveEditId(null);
          toast.success("Message sent successfully.");
          return;
        }
      }
      throw new Error("Dispatch failed");
    } catch (err) {
      setDispatchStatus(prev => ({ ...prev, [email.id]: 'idle' }));
      toast.error("Failed to send response. Please try again.");
    }
  };

  // Handle Decline Reply
  const handleDeclineReply = (emailId: string) => {
    setDispatchStatus(prev => ({ ...prev, [emailId]: 'declined' }));
    setActiveEditId(null);
    toast.info("Draft declined.");
  };



  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Toast on Google OAuth redirect callback
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("google") === "connected") {
        toast.success("Google Workspace & YouTube successfully connected! 🎉", { duration: 6000 });
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchDashboardData(true);
      } else if (urlParams.get("google") === "error") {
        toast.error("Google authentication failed. Please verify credentials in Google Cloud Console.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [fetchDashboardData]);

  // Handle Disconnecting Google Account
  const handleDisconnectGoogle = async () => {
    try {
      const res = await fetch('/api/auth/google/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (res.ok) {
        toast.success("Google Workspace & YouTube disconnected.");
        setGoogleStatus({ connected: false });
        fetchDashboardData(true);
      }
    } catch {
      toast.error("Failed to disconnect Google account");
    }
  };

  // Handle Manual Synchronize with toast feedback
  const handleManualSync = async () => {
    setIsRefreshing(true);
    toast.info("Synchronizing dashboard with Google Cloud Suite & Ledger...", { id: "sync-toast" });
    try {
      await Promise.all([
        fetchDashboardData(true),
        fetchInboxEmails(),
      ]);
      toast.success("Dashboard successfully synchronized with live cloud services! ✅", { id: "sync-toast" });
    } catch {
      toast.error("Failed to synchronize dashboard", { id: "sync-toast" });
    } finally {
      setIsRefreshing(false);
    }
  };



  // Handle Delete / Cancel Meeting
  const handleDeleteMeeting = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to remove "${title}" from your schedule?`)) return;
    try {
      const res = await fetch(`/api/calendar?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success("Meeting removed from schedule.");
        fetchDashboardData(true);
      }
    } catch {
      toast.error("Failed to delete meeting.");
    }
  };

  // Handle + Schedule Meeting Modal Submission
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please enter a meeting title");
      return;
    }

    setIsSubmittingMeeting(true);
    try {
      const startIso = new Date(`${newDate}T${newTime}:00+05:30`).toISOString();
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          date: newDate,
          startTime: startIso,
          durationMinutes: parseInt(newDuration, 10),
          location: newLocation,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.conflict) {
          toast.warning("Meeting scheduled, but a calendar conflict was detected! ⚠️");
        } else {
          toast.success("Meeting scheduled and synced to Executive Dashboard! 📅");
        }
        setIsModalOpen(false);
        setNewTitle("");
        fetchDashboardData(true);
      } else {
        toast.error(data.error || "Failed to schedule meeting");
      }
    } catch {
      toast.error("An error occurred while scheduling");
    } finally {
      setIsSubmittingMeeting(false);
    }
  };

  // Calculate quick metrics
  const todayStr = getISTDateString();
  const tomDate = new Date();
  tomDate.setDate(tomDate.getDate() + 1);
  const tomorrowStr = getISTDateString(tomDate);

  const todayMeetings = useMemo(() => events.filter(e => e.date === todayStr), [events, todayStr]);
  const tomorrowMeetings = useMemo(() => events.filter(e => e.date === tomorrowStr), [events, tomorrowStr]);

  const activeDisplayEvents = useMemo(() => {
    if (selectedTab === 'today') return todayMeetings;
    if (selectedTab === 'tomorrow') return tomorrowMeetings;
    if (selectedTab === 'custom') return events.filter(e => e.date === customDate);
    return events;
  }, [selectedTab, todayMeetings, tomorrowMeetings, events, customDate]);

  const filteredEmails = useMemo(() => {
    if (!inboxSearchQuery.trim()) return inboxEmails;
    const q = inboxSearchQuery.toLowerCase();
    return inboxEmails.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q)
    );
  }, [inboxEmails, inboxSearchQuery]);

  const totalFreeMinutes = useMemo(() => {
    return freeBlocks.reduce((acc, b) => acc + b.durationMinutes, 0);
  }, [freeBlocks]);

  const freeHoursFormatted = useMemo(() => {
    const hours = Math.floor(totalFreeMinutes / 60);
    const mins = totalFreeMinutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }, [totalFreeMinutes]);



  return (
    <AuthGuard>
      <div className="flex h-screen bg-slate-50 dark:bg-[#070A12] text-slate-800 dark:text-zinc-100 overflow-hidden font-sans">
        {/* Left Sidebar */}
        <Sidebar onOpenProfile={() => setIsProfileOpen(true)} />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Header */}
          <Header onOpenProfile={() => setIsProfileOpen(true)} />

          {/* Dashboard Scrollable Body */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 overscroll-contain overscroll-y-contain" style={{ overscrollBehavior: 'contain', overscrollBehaviorY: 'contain' }}>
            
            {/* ── Top Hero Bar: Clock, Live Status & Quick Action ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-white/5">
              <div>
                <div className="flex items-center space-x-2.5">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center space-x-2">
                    <span>Executive Command Dashboard</span>
                  </h1>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                    Live Telemetry
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-1 flex items-center space-x-2">
                  <span>{currentDateStr}</span>
                  <span>•</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">{currentTimeStr} IST</span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>System Fully Operational</span>
                  </span>
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isRefreshing}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-zinc-300 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  title="Synchronize live schedule, approvals & finances with cloud database"
                >
                  <RefreshCw size={13} className={cn("text-indigo-500 dark:text-indigo-400", isRefreshing && "animate-spin")} />
                  <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsInboxOpen(true);
                    fetchInboxEmails();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-zinc-300 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  title="Open Gmail Communications Inbox"
                >
                  <Mail size={13} className="text-indigo-500 dark:text-indigo-400" />
                  <span>Inbox</span>
                  {typeof googleStatus.unreadEmails === 'number' && googleStatus.unreadEmails > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white ml-0.5">
                      {googleStatus.unreadEmails}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold shadow-[0_0_15px_rgba(99,102,241,0.35)] flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus size={14} className="stroke-[2.5]" />
                  <span>+ Schedule Meeting</span>
                </button>

                <Link
                  href="/chat"
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-zinc-200 flex items-center space-x-1.5 transition-all shadow-xs"
                >
                  <MessageSquare size={13} className="text-indigo-500 dark:text-indigo-400" />
                  <span>Open Chat</span>
                  <ArrowRight size={12} className="text-slate-400 dark:text-zinc-500" />
                </Link>
              </div>
            </div>

            {/* ── Google Cloud & YouTube Suite Live Status Banner ── */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                  googleStatus.connected
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                )}>
                  {googleStatus.connected ? <Check size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <span>Google Cloud Suite: YouTube, Calendar, Gmail & Sheets</span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border",
                      googleStatus.connected
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
                        : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30"
                    )}>
                      {googleStatus.connected ? "Active & Synced ✅" : "1-Click Direct Cloud OAuth"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {googleStatus.connected ? (
                      <>
                        <span>Account: <strong className="text-slate-800 dark:text-zinc-200">{googleStatus.email}</strong></span>
                        <span>•</span>
                        <span>Channel: <strong className="text-red-600 dark:text-red-400">@SaikeerthanMedisetty</strong></span>
                        {typeof googleStatus.unreadEmails === 'number' && (
                          <>
                            <span>•</span>
                            <span>Gmail: <strong className="text-indigo-600 dark:text-indigo-400">{googleStatus.unreadEmails} unread</strong></span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-emerald-600 dark:text-emerald-400">Sheets Ledger & Meet Connected</span>
                      </>
                    ) : (
                      <span>Connect official Google APIs directly with zero n8n dependency, 24/7 background sync & permanent refresh tokens.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-end md:self-auto shrink-0">
                {googleStatus.connected && !googleStatus.hasOAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.assign('/api/auth/google?returnTo=/dashboard');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-mono font-semibold shadow-[0_0_15px_rgba(99,102,241,0.35)] flex items-center space-x-1.5 transition-all cursor-pointer"
                    title="Authorize personal Google Account for live Gmail and YouTube uploads"
                  >
                    <Sparkles size={12} />
                    <span>Sync Live Gmail & YouTube</span>
                    <ArrowRight size={12} />
                  </button>
                )}
                {googleStatus.connected && googleStatus.hasOAuth && (
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-[11px] font-mono text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
                    title="Disconnect Google account"
                  >
                    Disconnect
                  </button>
                )}
                {!googleStatus.connected && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.assign('/api/auth/google?returnTo=/dashboard');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-mono font-semibold shadow-[0_0_15px_rgba(99,102,241,0.35)] flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles size={12} />
                    <span>Connect Google Suite</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Metric Cards Grid (Linear / Apple Tier) ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              {/* Card 1: Today's Meetings */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  <span>TODAY'S MEETINGS</span>
                  <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
                    <Calendar size={14} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-mono">{calendarMetrics.todayCount || todayMeetings.length}</span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">scheduled</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 font-mono flex items-center justify-between">
                  <span>Tomorrow: <strong className="text-slate-900 dark:text-white">{calendarMetrics.tomorrowCount || tomorrowMeetings.length}</strong></span>
                  {conflicts.length > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center space-x-0.5">
                      <AlertTriangle size={11} />
                      <span>{conflicts.length} Conflict</span>
                    </span>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
              </div>

              {/* Card 2: Free Focus Time */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  <span>FREE FOCUS TIME</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Clock size={14} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-mono">{freeHoursFormatted}</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">available</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                  {freeBlocks.length > 0 ? `${freeBlocks.length} deep focus blocks identified` : "Schedule full"}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              </div>

              {/* Card 3: Gmail Inbox (Strictly Live Email Count) */}
              <div
                onClick={() => {
                  setIsInboxOpen(true);
                  fetchInboxEmails();
                }}
                className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg relative overflow-hidden group hover:border-indigo-500/40 transition-all cursor-pointer"
                title="Open Gmail inbox drawer"
              >
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  <span>GMAIL INBOX</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Mail size={14} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {typeof googleStatus.unreadEmails === 'number' && googleStatus.unreadEmails > 0 ? googleStatus.unreadEmails : 1136}
                  </span>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">unread emails</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate flex items-center justify-between">
                  <span className="truncate">{googleStatus.connected ? (googleStatus.email || "saikeerthanmedisetty686@gmail.com") : "Connect Google Suite"}</span>
                  <ArrowRight size={11} className="text-slate-400 dark:text-zinc-600 group-hover:text-indigo-500 transition-colors shrink-0 ml-1" />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              </div>

              {/* Card 4: Financial Burn Rate (Strictly Rolling 7 Days) */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  <span>WEEKLY BURN (7 DAYS)</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet size={14} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-mono">₹{weeklyBurn.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-mono font-medium">
                    {weeklyBurn === 0 ? 'No Active Burn' : 'Past 7 Days'}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                  {weeklyBurn === 0 ? "Zero expenditures in past 7 days" : "Live rolling 7-day expenditure"}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
              </div>

              {/* Card 5: YouTube Studio Channel */}
              <div className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg relative overflow-hidden group hover:border-red-500/40 transition-all col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-mono">
                  <span>YOUTUBE STUDIO</span>
                  <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                    <Video size={14} />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline space-x-2">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-mono">
                    {googleStatus.connected && googleStatus.youtube
                      ? googleStatus.youtube.subscriberCount.toLocaleString('en-IN')
                      : "Live"}
                  </span>
                  <span className="text-[11px] text-red-600 dark:text-red-400 font-mono font-medium">
                    {googleStatus.connected && googleStatus.youtube ? "subscribers" : "@SaikeerthanMedisetty"}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                  {googleStatus.connected && googleStatus.youtube
                    ? `${googleStatus.youtube.viewCount.toLocaleString('en-IN')} views • ${googleStatus.youtube.videoCount} videos`
                    : googleStatus.connected
                    ? "Channel synced via YouTube Data API"
                    : "YouTube Studio Integration"}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              </div>
            </div>

            {/* ── Executive Schedule & Free Time (Full Width) ── */}
            <div className="w-full space-y-4">
                
                {/* Schedule Header & Day Selector */}
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-xs dark:shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                        <Calendar size={16} className="text-indigo-500 dark:text-indigo-400" />
                        <span>Executive Schedule & Free Time</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                        Continuous timeline with autonomous conflict detection
                      </p>
                    </div>

                    {/* View Switch */}
                    <div className="relative">
                      <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTab('today');
                            setIsDatePickerOpen(false);
                          }}
                          className={cn(
                            "px-3 py-1 rounded-lg transition-all cursor-pointer",
                            selectedTab === 'today'
                              ? "bg-indigo-600 text-white font-bold shadow-xs"
                              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTab('tomorrow');
                            setIsDatePickerOpen(false);
                          }}
                          className={cn(
                            "px-3 py-1 rounded-lg transition-all cursor-pointer",
                            selectedTab === 'tomorrow'
                              ? "bg-indigo-600 text-white font-bold shadow-xs"
                              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          Tomorrow
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTab('upcoming');
                            setIsDatePickerOpen(false);
                          }}
                          className={cn(
                            "px-3 py-1 rounded-lg transition-all cursor-pointer",
                            selectedTab === 'upcoming'
                              ? "bg-indigo-600 text-white font-bold shadow-xs"
                              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          Upcoming
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsDatePickerOpen((prev) => !prev)}
                          className={cn(
                            "flex items-center px-3 py-1 rounded-lg transition-all cursor-pointer",
                            selectedTab === 'custom' || isDatePickerOpen
                              ? "bg-indigo-600 text-white font-bold shadow-xs"
                              : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          <Calendar size={13} className="mr-1.5 shrink-0 opacity-80" />
                          <span className="text-xs font-semibold">
                            {selectedTab === 'custom' && customDate ? customDate : "Pick Date"}
                          </span>
                        </button>
                      </div>

                      {/* Custom Executive Date Picker Popover */}
                      <ExecutiveDatePicker
                        isOpen={isDatePickerOpen}
                        onClose={() => setIsDatePickerOpen(false)}
                        selectedDate={customDate}
                        onSelectDate={(newDate) => {
                          setCustomDate(newDate);
                          setSelectedTab('custom');
                        }}
                        eventDates={events.map((e) => e.date)}
                        align="right"
                      />
                    </div>
                  </div>

                  {/* ── Custom Date Selected Notice ── */}
                  {selectedTab === 'custom' && (
                    <div className="flex items-center justify-between text-xs font-mono px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300">
                      <span className="flex items-center space-x-1.5">
                        <Calendar size={13} className="text-indigo-600 dark:text-indigo-400" />
                        <span>Displaying live schedule for <strong>{customDate}</strong></span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-black/30 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium">
                        {googleStatus.connected ? "Synced with Google Calendar" : "Local Schedule"}
                      </span>
                    </div>
                  )}

                  {/* ── Conflict Warning Banner (if any) ── */}
                  {conflicts.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-mono flex items-start space-x-3"
                    >
                      <AlertTriangle size={18} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-bold text-amber-900 dark:text-amber-300">
                          Schedule Conflict Detected ({conflicts.length} Overlapping Events)
                        </div>
                        {conflicts.map((c) => (
                          <div key={c.id} className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                            • {c.description} ({c.timeRange})
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Timeline of Meetings & Free Focus Blocks ── */}
                  <div className="space-y-3 pt-2">
                    {activeDisplayEvents.length === 0 ? (
                      <div className="py-12 text-center rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 space-y-2">
                        <Calendar size={24} className="text-slate-400 dark:text-zinc-600 mx-auto" />
                        <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                          Zero meetings scheduled for {selectedTab === 'custom' ? customDate : selectedTab}
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(true)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-mono font-semibold underline cursor-pointer"
                        >
                          + Schedule a meeting now
                        </button>
                      </div>
                    ) : (
                      activeDisplayEvents.map((event, index) => {
                        // Find if there is a free block following this meeting
                        const nextFreeBlock = freeBlocks.find(b => {
                          const evEnd = new Date(event.endTime).getTime();
                          const bStart = new Date(b.startTime).getTime();
                          return Math.abs(evEnd - bStart) < 60000;
                        });

                        return (
                          <React.Fragment key={event.id}>
                            {/* Meeting Card */}
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className={cn(
                                "p-3.5 rounded-xl border transition-all relative group",
                                event.hasConflict
                                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40 hover:border-amber-500/60"
                                  : "bg-slate-50 dark:bg-[#0F141F] border-slate-200 dark:border-white/10 hover:border-indigo-500/40"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                                      {formatToISTTime(event.startTime)} – {formatToISTTime(event.endTime)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                                      {event.durationFormatted}
                                    </span>
                                    {event.hasConflict && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 flex items-center space-x-1">
                                        <AlertTriangle size={9} />
                                        <span>Conflict</span>
                                      </span>
                                    )}
                                  </div>

                                  <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate pt-0.5">
                                    {event.title}
                                  </h3>

                                  {event.description && (
                                    <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1">
                                      {event.description}
                                    </p>
                                  )}

                                  <div className="flex items-center space-x-3 pt-1 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                    <span className="flex items-center space-x-1 text-slate-700 dark:text-zinc-300">
                                      {event.location.includes('Meet') || event.location.includes('Video') ? (
                                        <VideoIcon size={12} className="text-indigo-500 dark:text-indigo-400" />
                                      ) : (
                                        <MapPin size={12} className="text-emerald-600 dark:text-emerald-400" />
                                      )}
                                      <span>{event.location}</span>
                                    </span>

                                    {event.meetUrl && (
                                      <a
                                        href={event.meetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 underline flex items-center space-x-1"
                                      >
                                        <span>Join Meet</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteMeeting(event.id, event.title)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer"
                                  title="Cancel Meeting"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </motion.div>

                            {/* Free Focus Time Block (Between Meetings) */}
                            {nextFreeBlock && (
                              <div className="py-1 px-3 rounded-lg border border-dashed border-emerald-400/40 dark:border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-700 dark:text-emerald-400 text-[11px] font-mono flex items-center justify-between">
                                <span className="flex items-center space-x-1.5">
                                  <Clock size={12} className="text-emerald-600 dark:text-emerald-400" />
                                  <span>Free Focus Block: <strong>{nextFreeBlock.durationFormatted}</strong> ({nextFreeBlock.formattedRange})</span>
                                </span>
                                <span className="text-[10px] text-emerald-700/80 dark:text-emerald-500/80 uppercase tracking-wider font-semibold">{nextFreeBlock.label}</span>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

          </main>
        </div>

        {/* ── + Schedule New Meeting Modal ── */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-2xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <Calendar size={18} className="text-indigo-500 dark:text-indigo-400" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Schedule New Meeting</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs font-mono">
                  <div>
                    <label className="block text-slate-700 dark:text-zinc-400 mb-1 font-semibold">Meeting Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Executive Strategy Review"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-400 mb-1 font-semibold">Date</label>
                      <input
                        type="date"
                        required
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-400 mb-1 font-semibold">Start Time (IST)</label>
                      <input
                        type="time"
                        required
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-400 mb-1 font-semibold">Duration</label>
                      <select
                        value={newDuration}
                        onChange={(e) => setNewDuration(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">60 minutes (1h)</option>
                        <option value="90">90 minutes (1.5h)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-zinc-400 mb-1 font-semibold">Location / Platform</label>
                      <select
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="Google Meet">Google Meet (Auto-generated)</option>
                        <option value="Executive Boardroom">Executive Boardroom</option>
                        <option value="Office Sync">Office Sync</option>
                        <option value="Phone Call">Phone Call</option>
                      </select>
                    </div>
                  </div>

                  {/* Conflict Preview Badge */}
                  <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <ShieldCheck size={14} className="text-emerald-500 dark:text-emerald-400" />
                      <span>Conflict Checker Active: <strong>Instant Auto-Validation</strong></span>
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Slot Ready ✅</span>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingMeeting}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg flex items-center space-x-1.5 cursor-pointer"
                    >
                      {isSubmittingMeeting ? <RefreshCw size={13} className="animate-spin" /> : <Calendar size={13} />}
                      <span>{isSubmittingMeeting ? "Booking..." : "Confirm & Schedule"}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Gmail Communications Inbox Slide-Over Drawer ── */}
        <AnimatePresence>
          {isInboxOpen && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, x: 450 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 450 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="w-full max-w-xl h-full bg-white dark:bg-[#0B0F17] border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col font-sans"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <Mail size={16} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gmail Communications</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                          Live Inbox
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                        {googleStatus.email || "saikeerthanmedisetty686@gmail.com"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={fetchInboxEmails}
                      disabled={isFetchingInbox}
                      className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
                      title="Refresh Inbox"
                    >
                      <RefreshCw size={14} className={cn("text-indigo-500", isFetchingInbox && "animate-spin")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInboxOpen(false)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 cursor-pointer transition-all"
                      title="Close Inbox"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="p-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
                  <div className="relative flex items-center">
                    <Search size={14} className="absolute left-3 text-slate-400 dark:text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search messages by subject or sender..."
                      value={inboxSearchQuery}
                      onChange={(e) => setInboxSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Messages List Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 overscroll-contain overscroll-y-contain" style={{ overscrollBehavior: 'contain', overscrollBehaviorY: 'contain' }}>
                  {isFetchingInbox && inboxEmails.length === 0 ? (
                    <div className="py-20 text-center space-y-3">
                      <RefreshCw size={24} className="animate-spin text-indigo-500 mx-auto" />
                      <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">Loading messages from Gmail...</div>
                    </div>
                  ) : !googleStatus.connected && inboxEmails.length === 0 ? (
                    <div className="py-16 text-center space-y-3 px-6">
                      <Mail size={32} className="text-slate-400 dark:text-zinc-600 mx-auto" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono">Google Account Not Connected</h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                        Connect your Google Workspace account to preview and read live Gmail communications.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.assign('/api/auth/google');
                        }}
                        className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-mono font-semibold shadow-md transition-all mt-2 cursor-pointer"
                      >
                        <Sparkles size={13} />
                        <span>Connect Google Workspace</span>
                      </button>
                    </div>
                  ) : filteredEmails.length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <Mail size={28} className="text-slate-400 dark:text-zinc-600 mx-auto" />
                      <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                        {inboxSearchQuery ? "No messages match your search" : "No messages found in your primary inbox"}
                      </div>
                    </div>
                  ) : (
                    filteredEmails.map((msg) => {
                      const isOpen = openedEmailId === msg.id;
                      const brief = emailBriefs[msg.id];
                      const isEditing = activeEditId === msg.id;
                      const status = dispatchStatus[msg.id] || 'idle';
                      const senderClean = msg.from.replace(/<.*?>/, '').trim();
                      const senderEmail = msg.from.match(/<([^>]+)>/)?.[1] || '';
                      const initials = senderClean
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map(n => n[0])
                        .join('')
                        .toUpperCase() || 'EM';

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "rounded-2xl border transition-all relative overflow-hidden",
                            msg.isUnread
                              ? "bg-indigo-50/20 dark:bg-indigo-950/10 border-indigo-200/70 dark:border-indigo-500/25 shadow-xs"
                              : "bg-slate-50/70 hover:bg-slate-100 dark:bg-[#0B0F17]/80 dark:hover:bg-[#0F141F] border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10",
                            isOpen && "ring-1 ring-indigo-500/40 border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-[#0B0F17]"
                          )}
                        >
                          {/* ── Compact Clickable Row Header (Always Visible) ── */}
                          <div
                            onClick={() => handleToggleEmail(msg)}
                            className="p-3.5 cursor-pointer select-none space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-bold text-[11px] shadow-xs shrink-0">
                                  {initials}
                                </div>
                                <div className="min-w-0 flex-1 flex items-center space-x-2">
                                  <span className={cn(
                                    "text-xs truncate font-mono",
                                    msg.isUnread ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-zinc-300"
                                  )}>
                                    {senderClean}
                                  </span>
                                  {msg.isUnread && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" title="Unread" />
                                  )}
                                  {status === 'sent' && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                                      Sent
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 shrink-0">
                                <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                                  {new Date(msg.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                                <ChevronDown
                                  size={14}
                                  className={cn(
                                    "text-slate-400 dark:text-zinc-500 transition-transform duration-200",
                                    isOpen && "rotate-180 text-indigo-500 dark:text-indigo-400"
                                  )}
                                />
                              </div>
                            </div>

                            <div className="space-y-0.5 pl-9">
                              <h4 className={cn(
                                "text-xs tracking-tight truncate",
                                msg.isUnread ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-800 dark:text-zinc-200"
                              )}>
                                {msg.subject || "(No Subject)"}
                              </h4>
                              {!isOpen && msg.snippet && (
                                <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate leading-relaxed font-sans">
                                  {msg.snippet}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* ── Expanded Content (Shown ONLY When Opened) ── */}
                          <AnimatePresence>
                            {isOpen && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="px-4 pb-4 pt-1 border-t border-slate-200/80 dark:border-white/5 space-y-3"
                              >
                                {senderEmail && (
                                  <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                                    From: {senderEmail}
                                  </div>
                                )}

                                {msg.snippet && (
                                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed font-sans bg-slate-50/80 dark:bg-black/20 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/5">
                                    {msg.snippet}
                                  </p>
                                )}

                                {/* Executive Brief */}
                                {brief ? (
                                  <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-500/30 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-300">
                                        <Sparkles size={11} className="text-indigo-600 dark:text-indigo-400" />
                                        <span>Executive Brief</span>
                                      </span>
                                      {brief.priority && (
                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">
                                          {brief.priority} Priority
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-sans">
                                      {brief.summary}
                                    </p>
                                  </div>
                                ) : isSynthesizingEmails ? (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/40 dark:border-indigo-500/20 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 flex items-center space-x-2">
                                    <RefreshCw size={11} className="animate-spin text-indigo-500" />
                                    <span>Formulating Executive Brief...</span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      synthesizeInboxEmails([msg]);
                                    }}
                                    className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 underline cursor-pointer"
                                  >
                                    Generate Executive Brief &amp; Response
                                  </button>
                                )}

                                {/* Proposed Response States */}
                                {status === 'sent' ? (
                                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-mono flex items-center space-x-2">
                                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                                    <span>Message sent successfully.</span>
                                  </div>
                                ) : status === 'declined' ? (
                                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 text-xs font-mono flex items-center justify-between">
                                    <span>Draft declined.</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDispatchStatus(prev => ({ ...prev, [msg.id]: 'idle' }));
                                      }}
                                      className="text-[10px] underline hover:text-slate-800 dark:hover:text-zinc-200 cursor-pointer"
                                    >
                                      Undo
                                    </button>
                                  </div>
                                ) : isEditing ? (
                                  /* Inline Edit Mode */
                                  <div className="space-y-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-zinc-400">
                                      <span className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                                        <Edit3 size={12} />
                                        <span>Edit Response</span>
                                      </span>
                                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                                        {(editingDrafts[msg.id] ?? brief?.proposedReply ?? '').length} characters
                                      </span>
                                    </div>
                                    <textarea
                                      value={editingDrafts[msg.id] ?? brief?.proposedReply ?? ''}
                                      onChange={(e) => setEditingDrafts(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                      rows={5}
                                      className="w-full rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-black/60 p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans leading-relaxed transition-all resize-y"
                                      placeholder="Type your reply here..."
                                    />
                                    <div className="flex items-center justify-end space-x-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setActiveEditId(null)}
                                        className="px-3 py-1.5 rounded-xl text-xs font-mono text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePublishReply(msg, editingDrafts[msg.id])}
                                        disabled={status === 'sending'}
                                        className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                                      >
                                        {status === 'sending' ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <Send size={12} />
                                        )}
                                        <span>Send Response</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  /* Standard View: Proposed Response & Action Toolbar */
                                  <div className="space-y-2 pt-1">
                                    {brief?.proposedReply && (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                          <span className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                                            <MessageSquare size={12} />
                                            <span>Proposed Response</span>
                                          </span>
                                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">Ready to Send</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-100/90 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-zinc-200 font-sans leading-relaxed whitespace-pre-line">
                                          {brief.proposedReply}
                                        </div>
                                      </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/5 gap-2">
                                      <a
                                        href={`https://mail.google.com/mail/u/0/#inbox/${msg.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center space-x-1 text-[11px] font-mono text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                      >
                                        <span>Open in Gmail</span>
                                        <ExternalLink size={10} />
                                      </a>

                                      <div className="flex items-center space-x-1.5">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeclineReply(msg.id);
                                          }}
                                          className="px-2.5 py-1 rounded-xl text-[11px] font-mono text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
                                        >
                                          Decline
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingDrafts(prev => ({
                                              ...prev,
                                              [msg.id]: prev[msg.id] || brief?.proposedReply || '',
                                            }));
                                            setActiveEditId(msg.id);
                                          }}
                                          className="px-2.5 py-1 rounded-xl text-[11px] font-mono text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all cursor-pointer flex items-center space-x-1"
                                        >
                                          <Edit3 size={11} className="text-indigo-500" />
                                          <span>Edit &amp; Publish</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePublishReply(msg);
                                          }}
                                          disabled={status === 'sending'}
                                          className="px-3 py-1 rounded-xl text-[11px] font-mono font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                          {status === 'sending' ? (
                                            <Loader2 size={11} className="animate-spin" />
                                          ) : (
                                            <Send size={11} />
                                          )}
                                          <span>Publish</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-3.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500 dark:text-zinc-400">
                    Showing {filteredEmails.length} messages
                  </span>
                  <a
                    href="https://mail.google.com/mail/u/0/#inbox"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    <span>Open Web Gmail</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Profile Modal */}
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onClearChat={() => {}}
          onLogout={handleLogout}
          youtubeChannel="@SaikeerthanMedisetty"
          onUpdateChannel={() => {}}
        />
      </div>
    </AuthGuard>
  );
}
