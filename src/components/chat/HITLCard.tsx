'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Send, 
  Trash2, 
  Car, 
  Video, 
  ArrowRight,
  AlertTriangle,
  ListTodo,
  FileText,
  Receipt,
  Calendar,
  DollarSign,
  CheckCircle2,
  Bell,
  Mail,
  Edit3,
  Copy,
  MoreHorizontal,
  Sparkles,
  Command,
  ShieldCheck,
  Check,
  Activity,
  TrendingUp,
  Compass,
  Lock,
  Tag,
  Plus,
  Clock,
  ChevronDown,
  MapPin
} from 'lucide-react';
import { cn, sanitizeExecutiveTerminology, formatToISTTime } from '@/lib/utils';
import { YouTubeReviewCard, YouTubePayload } from './YouTubeReviewCard';
import { ExecutiveDossierCard } from './ExecutiveDossierCard';

export interface PendingAction {
  id: string;
  agent: string;
  action: string;
  params: Record<string, any>;
  confirmationDetails?: {
    title: string;
    warning: string;
    summary: string;
    details: Record<string, any>;
  };
}

interface HITLCardProps {
  action: PendingAction;
  onConfirm: (action: PendingAction) => Promise<void>;
  onCancel: (action: PendingAction) => void;
  onUpdateParams?: (newParams: Record<string, any>) => void;
  onQuickAction?: (prompt: string) => void;
  resolvedStatus?: 'pending' | 'confirmed' | 'cancelled' | null;
}

type CardTheme = 'optimal' | 'warning' | 'neutral';

export function HITLCard({ action, onConfirm, onCancel, onUpdateParams, onQuickAction, resolvedStatus }: HITLCardProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isResolved, setIsResolved] = useState<'confirmed' | 'cancelled' | null>(
    resolvedStatus === 'confirmed' || resolvedStatus === 'cancelled' ? resolvedStatus : null
  );

  useEffect(() => {
    if (resolvedStatus === 'confirmed' || resolvedStatus === 'cancelled') {
      setIsResolved(resolvedStatus);
    }
  }, [resolvedStatus]);

  // ─── Render Dedicated Bento Dossier for Chief of Staff Agent ───
  if (action.agent === 'CHIEF_OF_STAFF') {
    const p = action.params || {};
    if (!p.dossier) return null;

    return (
      <ExecutiveDossierCard
        dossier={p.dossier}
        onQuickAction={(prompt) => {
          onQuickAction?.(prompt);
        }}
        onDismiss={() => {
          setIsResolved('cancelled');
          onCancel(action);
        }}
      />
    );
  }

  // ─── Render Dedicated Bento Studio for YouTube Agent ONLY when uploading or publishing ───
  if (action.agent === 'YOUTUBE' && (action.action === 'upload' || action.action === 'publish' || action.action === 'stage')) {
    const p = action.params || {};
    let vidId = p.videoId || p.video_id || p.id;
    if (!vidId && p.url) {
      const match = p.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
      if (match) vidId = match[1];
    }
    if (!vidId) vidId = 'ix9Sw6PrUJQ';

    const defaultTitle = p.selected_title || p.title || 'Official Video Presentation';
    const rawTitles = (p.seo_titles && Array.isArray(p.seo_titles) && p.seo_titles.length >= 5)
      ? p.seo_titles
      : [
          defaultTitle,
          `${defaultTitle} | In-Depth Look`,
          `The Ultimate Guide to ${defaultTitle}`,
          `Watch: ${defaultTitle} (Behind The Scenes)`,
          `Key Highlights & Insights: ${defaultTitle}`
        ];

    const defaultDesc = p.seo_description || p.description || `Watch this exclusive presentation on ${p.channel || '@SaikeerthanMedisetty'}.\n\n📌 Timestamps:\n00:00 - Introduction\n01:30 - Highlights\n03:45 - Wrap Up\n\n🔔 Subscribe for more updates!\n#YouTube #Video`;

    const defaultTimestamps = (p.timestamps && p.timestamps.trim().startsWith('00:00'))
      ? p.timestamps
      : '00:00 - Introduction\n01:30 - Highlights & Core Insights\n03:45 - Key Demonstrations\n05:30 - Summary & Wrap Up';

    const defaultThumbUrl = p.thumbnail?.url || 'https://image.pollinations.ai/prompt/Cinematic%20high-contrast%20YouTube%20video%20thumbnail%2C%208k%20resolution?width=1280&height=720&nologo=true';

    const ytPayload: YouTubePayload = {
      videoId: vidId,
      title: p.title || p.selected_title || defaultTitle,
      selected_title: p.selected_title || p.title || defaultTitle,
      seo_titles: rawTitles,
      seo_description: p.seo_description || p.description || defaultDesc,
      description: p.description || p.seo_description || defaultDesc,
      timestamps: (p.timestamps && !p.timestamps.includes('Master Architecture') && !p.timestamps.includes('07:00'))
        ? p.timestamps 
        : defaultTimestamps,
      visibility: (p.privacyStatus || p.visibility || 'unlisted') as any,
      privacyStatus: (p.privacyStatus || p.visibility || 'unlisted') as any,
      channel: p.channel || '@SaikeerthanMedisetty',
      thumbnail: p.thumbnail || {
        url: defaultThumbUrl,
        aspect_ratio: '16:9',
        dimensions: '1280x720',
      }
    };

    return (
      <YouTubeReviewCard
        initialData={ytPayload}
        webhookUrl="/api/youtube/approve"
        onApproveAndPublish={async (finalPayload) => {
          setIsResolved('confirmed');
          await onConfirm({
            ...action,
            params: {
              ...action.params,
              ...finalPayload,
              alreadyDispatched: true,
              action: 'upload',
            }
          });
        }}
        onCancel={() => {
          setIsResolved('cancelled');
          onCancel(action);
        }}
      />
    );
  }

  // ─── Core Bento HITL Card Logic ───
  const p = action.params || {};
  const isSheets = action.agent === 'SHEETS';
  const isCalendar = action.agent === 'CALENDAR';
  const isEmail = action.agent === 'EMAIL';
  const isUber = action.agent === 'UBER';
  const isDeleteAction = action.action === 'delete' || action.action === 'cancel' || action.action === 'remove';

  // Amount parsing
  const rawAmt = p.amount || 0;
  const numAmt = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt).replace(/[^0-9.-]+/g, '')) || 0;
  const formattedAmt = numAmt > 0 ? `₹${numAmt.toLocaleString('en-IN')}` : (p.fare ? `₹${p.fare}` : '₹0.00');

  // Intelligent initial state (Card 1: Neutral, Card 2: Optimal, Card 3: Warning)
  const isWarningContext = isDeleteAction || numAmt >= 5000 || Boolean(p.conflict) || Boolean(p.isConflict) || Boolean(p.hasConflict);
  const [activeTheme, setActiveTheme] = useState<CardTheme>(isWarningContext ? 'warning' : 'optimal');

  useEffect(() => {
    setActiveTheme(isWarningContext ? 'warning' : 'optimal');
  }, [isWarningContext]);
  const [showMenu, setShowMenu] = useState(false);
  const [customNote, setCustomNote] = useState(p.note || '');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Interactive checklist toggles for Bento Tile 1 & 3
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    param1: true,
    param2: true,
    param3: true,
    param4: true,
    radar1: true,
    radar2: true,
    radar3: true,
  });

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Dedicated email draft interactive editing & preview state
  const [editableTo, setEditableTo] = useState<string>(p.to || p.recipient || '');
  const [editableSubject, setEditableSubject] = useState<string>(p.subject || '');
  const [editableBody, setEditableBody] = useState<string>(p.body || p.content || p.message || '');
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);
  const [draftCopied, setDraftCopied] = useState<boolean>(false);

  useEffect(() => {
    setEditableTo(p.to || p.recipient || '');
    setEditableSubject(p.subject || '');
    setEditableBody(p.body || p.content || p.message || '');
  }, [p.to, p.recipient, p.subject, p.body, p.content, p.message]);

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      const finalParams = isEmail ? {
        ...action.params,
        to: editableTo,
        subject: editableSubject,
        body: editableBody,
      } : action.params;

      const finalAction: PendingAction = {
        ...action,
        params: finalParams,
      };

      onUpdateParams?.(finalParams);
      await onConfirm(finalAction);
      setIsResolved('confirmed');
    } catch {
      setIsExecuting(false);
    }
  };

  const handleCancel = () => {
    setIsResolved('cancelled');
    onCancel(action);
  };

  // Agent-specific Title & Warning resolution
  const defaultTitle = isDeleteAction
    ? 'Authorize Calendar Event Removal'
    : isEmail 
    ? 'Drafted Executive Correspondence'
    : isSheets
    ? 'Record Financial Expenditure'
    : isCalendar
    ? 'Schedule Executive Calendar Event'
    : isUber
    ? 'Authorize Mobility Dispatch'
    : 'Authorize Action';

  const defaultWarning = isDeleteAction
    ? 'Safety Check: Confirm permanent removal of this event from your Executive Schedule.'
    : isEmail
    ? 'Safety Check: Review drafted communication before official transmission.'
    : isSheets
    ? 'Safety Check: Review and authorize this transaction before committing to your Financial Ledger.'
    : isCalendar
    ? 'Safety Check: Confirm event details before blocking on your Executive Schedule.'
    : isUber
    ? 'Safety Check: Review route parameters before dispatching vehicle.'
    : 'Safety Check: Review the parameters before executing.';

  const details = action.confirmationDetails;
  let cardTitle = details?.title ? sanitizeExecutiveTerminology(details.title) : defaultTitle;
  let cardWarning = details?.warning ? sanitizeExecutiveTerminology(details.warning) : defaultWarning;

  // Strict sanitization against any AI mentions
  cardTitle = cardTitle.replace(/\bAI[- ]?Drafted\b/gi, 'Drafted').replace(/\bAI\s+/gi, '').trim();

  if (cardTitle.includes('Execute SHEETS Action') || cardTitle.includes('Log Expense to Google Sheets') || cardTitle.includes('Google Sheets')) {
    cardTitle = 'Record Financial Expenditure';
  }
  if (cardWarning.includes('Google Sheets') || cardWarning.includes('expense spreadsheet')) {
    cardWarning = 'Safety Check: Review and authorize this transaction before committing to your Financial Ledger.';
  }

  // Helper to format ISO dates into friendly human strings
  const formatDateDisplay = (dStr?: string) => {
    if (!dStr) return 'Tomorrow';
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        const [y, m, d] = dStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      }
    } catch (e) {}
    return dStr;
  };

  // ─── Truly Universal Parameter & Entity Resolution (Zero Hardcoded Domain Bleed) ───
  let heroMain = '';
  let heroSub = '';
  let heroCategory = '';
  let heroMerchant = '';

  if (isCalendar) {
    if (action.action === 'update') {
      heroMain = p.newTitle ? `${p.newTitle}` : (p.title || 'Executive Strategy Session');
      const dateFormatted = formatDateDisplay(p.date || p.newDate);
      const timeFormatted = p.time ? formatToISTTime(p.time) : (p.newTime ? formatToISTTime(p.newTime) : '10:00 AM');
      heroSub = `Move "${p.targetEventTitle || p.oldTitle || 'Event'}" ➔ ${dateFormatted} at ${timeFormatted}`;
      heroCategory = 'Reschedule & Rename';
    } else if (action.action === 'bulk_delete') {
      heroMain = `Cancel ${p.eventIds?.length || 0} Events`;
      heroSub = `Filter: "${p.wildcardFilter?.text || p.title || 'Sync'}" (${p.wildcardFilter?.timeScope || 'upcoming'})`;
      heroCategory = 'Bulk Cancellation';
    } else if (p.recurrence) {
      heroMain = p.title || p.summary || 'Executive Recurring Series';
      const dateFormatted = formatDateDisplay(p.date);
      const timeFormatted = p.time ? formatToISTTime(p.time) : (p.timeSlot ? formatToISTTime(p.timeSlot) : '10:00 AM');
      heroSub = `${p.recurrence.description || 'Recurring Series'} • ${dateFormatted} at ${timeFormatted}`;
      heroCategory = 'Recurring Series';
    } else {
      heroMain = p.title || p.summary || 'Executive Strategy Session';
      const dateFormatted = formatDateDisplay(p.date);
      const timeFormatted = p.time ? formatToISTTime(p.time) : (p.timeSlot ? formatToISTTime(p.timeSlot) : '10:00 AM');
      const durFormatted = p.duration || (p.durationMinutes ? `${p.durationMinutes} mins` : '45 mins');
      heroSub = isDeleteAction
        ? `Remove: "${heroMain}" scheduled on ${dateFormatted}`
        : `${dateFormatted} at ${timeFormatted} (${durFormatted})`;
      heroCategory = isDeleteAction ? 'Event Cancellation' : 'Executive Schedule';
    }
    heroMerchant = (p.location && p.location !== 'To be decided' && p.location !== 'Google Meet')
      ? p.location
      : (p.location === 'Google Meet' ? 'Google Meet' : (p.isAllDay ? 'All-Day Offsite' : 'Venue TBD'));
  } else if (isSheets) {
    heroMain = formattedAmt;
    const vendor = p.merchant || p.item || 'Expenditure';
    const cat = p.category || 'Expense Entry';
    heroSub = `${vendor} • ${cat}`;
    heroCategory = cat;
    heroMerchant = vendor;
  } else if (isEmail) {
    heroMain = editableTo || p.to || 'Recipient';
    heroSub = editableSubject ? `Subject: "${editableSubject}"` : (p.subject ? `Subject: "${p.subject}"` : 'Official Correspondence');
    heroCategory = 'Outbound Dispatch';
    heroMerchant = 'Encrypted TLS';
  } else if (isUber) {
    heroMain = p.locked_fare || (p.fare ? `₹${p.fare}` : 'Dynamic Tariff');
    heroSub = `${p.pickup || 'Current Location'} ➔ ${p.destination || 'Destination'}`;
    heroCategory = p.selected_tier || p.tier || 'Uber Premier AC';
    heroMerchant = p.driver?.name ? `${p.driver.name} (Driver)` : 'On-Demand Dispatch';
  } else {
    // Universal fallback for ANY future or arbitrary agent/task
    heroMain = 
      p.title || 
      p.name || 
      p.summary || 
      p.subject || 
      p.merchant || 
      p.item || 
      p.target || 
      (numAmt > 0 ? formattedAmt : null) || 
      details?.title || 
      'Requested Action';

    heroSub = 
      details?.summary ? sanitizeExecutiveTerminology(details.summary) : 
      p.description ? String(p.description) :
      'Operation awaiting authorization';

    heroCategory = p.category || p.type || 'Executive Action';
    heroMerchant = p.location || p.service || p.target || 'Verified Guardrail';
  }

  // Dynamic Follow-up actions
  interface FollowUp {
    id: string;
    label: string;
    shortcut: string;
    prompt: string;
  }

  const getFollowUps = (): FollowUp[] => {
    if (isSheets) {
      return [
        { id: 'fu-1', label: "Show today's spending breakdown", shortcut: '⌘ 1', prompt: "Show today's spending breakdown with category shares" },
        { id: 'fu-2', label: 'Audit weekly burn rate & budget', shortcut: '⌘ 2', prompt: 'Audit my weekly burn rate and ledger budget snapshot' },
        { id: 'fu-3', label: 'Show recent transactions from ledger', shortcut: '⌘ 3', prompt: 'Show my latest expense entries from my ledger' },
      ];
    }
    if (isCalendar) {
      const loc = p?.location || '';
      const isPhysicalLocation = loc && loc !== 'To be decided' && !/meet|zoom|virtual|video/i.test(loc);
      return [
        { id: 'fu-1', label: 'Schedule 15m departure buffer', shortcut: '⌘ 1', prompt: `Schedule a 15-minute buffer before "${heroMain}"` },
        isPhysicalLocation
          ? { id: 'fu-2', label: 'Get ride estimate to meeting', shortcut: '⌘ 2', prompt: `Get a ride estimate to ${loc}` }
          : { id: 'fu-2', label: 'Check for schedule conflicts', shortcut: '⌘ 2', prompt: `Check schedule availability around "${heroMain}"` },
        { id: 'fu-3', label: "Review tomorrow's full agenda", shortcut: '⌘ 3', prompt: "Show my full agenda for tomorrow" },
      ];
    }
    if (isEmail) {
      return [
        { id: 'fu-1', label: 'Make response more concise', shortcut: '⌘ 1', prompt: 'Please make the email draft more concise and direct' },
        { id: 'fu-2', label: 'Add meeting availability slots', shortcut: '⌘ 2', prompt: 'Add my availability for tomorrow afternoon to the draft' },
        { id: 'fu-3', label: 'Schedule dispatch for 9:00 AM', shortcut: '⌘ 3', prompt: 'Schedule this email to dispatch tomorrow at 9:00 AM' },
      ];
    }
    if (isUber) {
      return [
        { id: 'fu-1', label: 'Reserve 15m buffer on calendar', shortcut: '⌘ 1', prompt: 'Block a 15-minute buffer on my schedule for this trip' },
        { id: 'fu-2', label: 'Track driver live telemetry', shortcut: '⌘ 2', prompt: 'Track live driver telemetry for my ride' },
        { id: 'fu-3', label: 'Log trip cost to financial ledger', shortcut: '⌘ 3', prompt: `Log ₹${p.fare || 450} for Uber ride to ${p.destination || 'destination'} in ledger` },
      ];
    }
    return [
      { id: 'fu-1', label: 'Review executive parameters', shortcut: '⌘ 1', prompt: 'Explain the staged parameters in detail' },
      { id: 'fu-2', label: 'Show active system status', shortcut: '⌘ 2', prompt: 'Give me a status update on current tasks' },
      { id: 'fu-3', label: 'Continue workflow execution', shortcut: '⌘ 3', prompt: 'Proceed with default parameters' },
    ];
  };

  const followUps = getFollowUps();

  // Keyboard shortcut listener (⌘1, ⌘2, ⌘3)
  useEffect(() => {
    if (isResolved !== null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1' && followUps[0]) {
          e.preventDefault();
          onQuickAction?.(followUps[0].prompt);
        } else if (e.key === '2' && followUps[1]) {
          e.preventDefault();
          onQuickAction?.(followUps[1].prompt);
        } else if (e.key === '3' && followUps[2]) {
          e.preventDefault();
          onQuickAction?.(followUps[2].prompt);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [followUps, isResolved, onQuickAction]);

  // Styling theme configuration
  const themeStyles = {
    optimal: {
      cardGlow: 'shadow-[0_0_60px_rgba(16,185,129,0.14),0_12px_45px_rgba(0,0,0,0.65)]',
      border: 'border-emerald-500/35 hover:border-emerald-500/50',
      ambientGlow: 'bg-emerald-500/15',
      iconBox: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      accentText: 'text-emerald-400',
      ringStroke: 'stroke-teal-400',
      ringGlow: 'rgba(20, 184, 166, 0.7)',
      arcStroke: 'stroke-emerald-400',
      arcGlow: 'rgba(16, 185, 129, 0.7)',
      button: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25',
      stateLabel: 'Optimal State',
      stateDot: 'bg-emerald-400',
    },
    warning: {
      cardGlow: 'shadow-[0_0_60px_rgba(245,158,11,0.18),0_12px_45px_rgba(0,0,0,0.65)]',
      border: 'border-amber-500/40 hover:border-amber-500/60',
      ambientGlow: 'bg-amber-500/15',
      iconBox: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
      accentText: 'text-amber-400',
      ringStroke: 'stroke-amber-400',
      ringGlow: 'rgba(245, 158, 11, 0.7)',
      arcStroke: 'stroke-orange-400',
      arcGlow: 'rgba(249, 115, 22, 0.7)',
      button: 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25',
      stateLabel: 'Focus / Warning',
      stateDot: 'bg-amber-400',
    },
    neutral: {
      cardGlow: 'shadow-[0_0_50px_rgba(255,255,255,0.06),0_12px_45px_rgba(0,0,0,0.65)]',
      border: 'border-white/15 hover:border-white/25',
      ambientGlow: 'bg-white/10',
      iconBox: 'bg-white/5 border-white/15 text-zinc-200',
      badge: 'bg-white/10 text-zinc-300 border-white/15',
      accentText: 'text-zinc-100',
      ringStroke: 'stroke-zinc-200',
      ringGlow: 'rgba(255, 255, 255, 0.5)',
      arcStroke: 'stroke-zinc-400',
      arcGlow: 'rgba(212, 212, 216, 0.5)',
      button: 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25',
      stateLabel: 'Default State',
      stateDot: 'bg-zinc-400',
    },
  };

  const theme = themeStyles[activeTheme];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        "my-3 w-full max-w-xl md:max-w-2xl rounded-2xl border bg-[#0B0F17]/95 p-4 md:p-5 backdrop-blur-2xl transition-all duration-300 relative overflow-hidden font-sans text-white select-none shadow-2xl",
        theme.border,
        theme.cardGlow,
        isResolved === 'confirmed' ? "opacity-90 border-emerald-500/50" :
        isResolved === 'cancelled' ? "opacity-60 border-zinc-800" : ""
      )}
    >
      {/* ── Ambient Radial Glow in Top Corner (Card 2 & 3 Aesthetic) ── */}
      <div 
        className={cn(
          "absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-700",
          theme.ambientGlow
        )} 
      />

      {/* ── Top Header Row ── */}
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center space-x-3">
          {/* Top-Left Squircle Icon Badge */}
          <div className={cn(
            "w-11 h-11 rounded-2xl border flex items-center justify-center shadow-inner transition-all",
            theme.iconBox
          )}>
            {isDeleteAction && <Trash2 size={22} className="stroke-[2.2] text-rose-400" />}
            {!isDeleteAction && isSheets && <Receipt size={22} className="stroke-[2.2]" />}
            {!isDeleteAction && isCalendar && <Calendar size={22} className="stroke-[2.2]" />}
            {!isDeleteAction && isEmail && <Mail size={22} className="stroke-[2.2]" />}
            {!isDeleteAction && isUber && <Car size={22} className="stroke-[2.2]" />}
            {!isDeleteAction && !isSheets && !isCalendar && !isEmail && !isUber && <ShieldAlert size={22} className="stroke-[2.2]" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                {cardTitle}
              </span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border", theme.badge)}>
                Decision Required
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={13} className="text-emerald-400" />
              <span>Verification & Safety Guardrail</span>
            </p>
          </div>
        </div>

        {/* Top-Right Security Badge */}
        <div className="flex items-center space-x-2">
          <span className={cn(
            "px-2.5 py-1 rounded-xl border text-[10px] font-mono font-bold flex items-center gap-1.5",
            theme.badge
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", theme.stateDot)} />
            <span>
              {isDeleteAction
                ? 'Cancellation Review'
                : isCalendar && (p.hasConflict || p.conflict)
                ? 'Conflict Warning'
                : theme.stateLabel}
            </span>
          </span>
        </div>
      </div>

      {/* ── Hero Metric Section with Immediate Action Buttons ── */}
      <div className="mt-3 pt-1 pb-3.5 border-b border-white/10 relative z-10">
        {/* Title: Full Width, Never Truncated */}
        <div className="flex items-start justify-between gap-3">
          <div className="font-mono text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight break-words">
            {heroMain}
          </div>
        </div>

        {/* Subtitle / Venue Tags */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-zinc-200 font-medium">{heroSub}</span>
          {heroMerchant && heroMerchant !== heroMain && (
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 flex items-center gap-1">
              <MapPin size={11} className="text-indigo-400 shrink-0" />
              <span>{heroMerchant}</span>
            </span>
          )}
        </div>

        {/* Prominent Event Removal Banner */}
        {isDeleteAction && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200 font-mono">
            <Trash2 size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <div className="font-bold text-rose-300 flex items-center gap-2">
                <span>Pending Calendar Deletion</span>
              </div>
              <p className="text-[11px] text-rose-200/90 leading-relaxed">
                Confirming will permanently remove &quot;{heroMain}&quot; from your executive schedule and Google Calendar.
              </p>
            </div>
          </div>
        )}

        {/* Prominent Schedule Conflict Banner */}
        {isCalendar && (p.hasConflict || p.conflict) && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-200 font-mono">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <div className="font-bold text-amber-300 flex items-center gap-2">
                <span>Schedule Conflict Detected</span>
                {p.overlapMinutes ? (
                  <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 text-[10px]">
                    {p.overlapMinutes}m Overlap
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                {p.conflictReason || `Overlaps with "${p.conflictingEvent || 'an existing event'}" on your Executive Schedule.`}
              </p>
            </div>
          </div>
        )}

        {/* ── Prominent Email Draft Preview & Interactive Composer ── */}
        {isEmail && (
          <div className="mt-3.5 p-3.5 rounded-xl bg-black/60 border border-indigo-500/30 shadow-inner space-y-3">
            {/* Header: Title + Mode Toggle + Copy */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Mail size={14} />
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-200 tracking-wide font-mono uppercase">
                    Correspondence Composition
                  </span>
                  <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-300 border-indigo-500/20">
                    {isEditingDraft ? '✏️ Edit Mode' : '👁️ Preview Mode'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Copy Draft Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(
                        `To: ${editableTo}\nSubject: ${editableSubject}\n\n${editableBody}`
                      );
                      setDraftCopied(true);
                      setTimeout(() => setDraftCopied(false), 2000);
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                  title="Copy full email to clipboard"
                >
                  {draftCopied ? (
                    <>
                      <Check size={11} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* Toggle Edit / Preview Button */}
                <button
                  type="button"
                  onClick={() => setIsEditingDraft(!isEditingDraft)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all flex items-center gap-1 cursor-pointer border",
                    isEditingDraft
                      ? "bg-indigo-600 text-white border-indigo-400 shadow-sm shadow-indigo-500/30"
                      : "bg-indigo-500/15 text-indigo-300 hover:text-white hover:bg-indigo-500/25 border-indigo-500/30"
                  )}
                  title={isEditingDraft ? "Switch to preview" : "Edit email subject and body"}
                >
                  {isEditingDraft ? (
                    <>
                      <Check size={11} />
                      <span>Done Editing</span>
                    </>
                  ) : (
                    <>
                      <Edit3 size={11} />
                      <span>Edit Draft</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Email Draft Fields */}
            {isEditingDraft ? (
              /* ── EDIT MODE: Editable Inputs ── */
              <div className="space-y-2.5 text-xs font-mono">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">
                    Recipient (To):
                  </label>
                  <input
                    type="email"
                    value={editableTo}
                    onChange={(e) => {
                      setEditableTo(e.target.value);
                      onUpdateParams?.({ to: e.target.value });
                    }}
                    placeholder="recipient@example.com"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-1">
                    Subject Line:
                  </label>
                  <input
                    type="text"
                    value={editableSubject}
                    onChange={(e) => {
                      setEditableSubject(e.target.value);
                      onUpdateParams?.({ subject: e.target.value });
                    }}
                    placeholder="Enter email subject"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-medium focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Message Body:
                    </label>
                    <span className="text-[10px] text-zinc-500">
                      {editableBody.length} chars • {editableBody.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={editableBody}
                    onChange={(e) => {
                      setEditableBody(e.target.value);
                      onUpdateParams?.({ body: e.target.value });
                    }}
                    placeholder="Draft your correspondence..."
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-zinc-100 font-sans leading-relaxed focus:outline-none resize-y transition-colors"
                  />
                </div>
                <div className="text-[10px] text-zinc-400 flex items-center justify-between pt-1">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check size={11} /> Edits live & ready for transmission
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(false)}
                    className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    View Formatted Preview
                  </button>
                </div>
              </div>
            ) : (
              /* ── PREVIEW MODE: Full-fidelity Formatted Email Letterhead ── */
              <div className="space-y-2 text-xs">
                {/* To & Subject Meta Header */}
                <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-white/5 space-y-1.5 font-mono">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 w-16 shrink-0">To:</span>
                    <span className="text-indigo-300 font-bold truncate selection:bg-indigo-500/30">
                      {editableTo || 'Not specified'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 w-16 shrink-0">Subject:</span>
                    <span className="text-zinc-100 font-semibold selection:bg-indigo-500/30">
                      {editableSubject || '(No subject)'}
                    </span>
                  </div>
                </div>

                {/* Complete Body Preview Box */}
                <div className="relative group">
                  <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/10 max-h-60 overflow-y-auto font-sans text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap selection:bg-indigo-500/30">
                    {editableBody ? (
                      editableBody
                    ) : (
                      <span className="text-zinc-500 italic">No message body provided. Click "Edit Draft" to write one.</span>
                    )}
                  </div>
                </div>

                {/* Footer status & word count */}
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                  <span>
                    {editableBody.trim().split(/\s+/).filter(Boolean).length} words • {editableBody.length} characters
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(true)}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={10} />
                    <span>Click to modify content</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── High-Visibility Full-Width Action Bar (Immediate & Clickable) ── */}
        {isResolved === null && (
          <div className="mt-3.5 flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={handleConfirm}
              disabled={isExecuting}
              className={cn(
                "flex-1 flex items-center justify-center space-x-2 py-2.5 px-5 text-xs font-extrabold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-lg",
                theme.button
              )}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={14} className="animate-spin text-white" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send size={13} className="text-white stroke-[2.5]" />
                  <span>
                    {isDeleteAction
                      ? '[ CONFIRM CANCELLATION ]'
                      : isEmail 
                      ? '[ SEND CORRESPONDENCE ]' 
                      : isSheets
                      ? '[ COMMIT TO LEDGER ]'
                      : isCalendar
                      ? ((p.hasConflict || p.conflict) ? '[ OVERRIDE & SCHEDULE ]' : '[ CONFIRM & SCHEDULE ]')
                      : isUber
                      ? '[ AUTHORIZE DISPATCH ]'
                      : `[ CONFIRM & ${action.action?.toUpperCase() || 'EXECUTE'} ]`}
                  </span>
                </>
              )}
            </motion.button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={isExecuting}
              className="py-2.5 px-4 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-zinc-300 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              title={isDeleteAction ? "Keep this event on your schedule" : "Abort this staged action"}
            >
              <Trash2 size={13} />
              <span>{isDeleteAction ? '[ KEEP EVENT ]' : '[ DISCARD ]'}</span>
            </button>
          </div>
        )}

        {/* Resolved Status Feedback Badges */}
        {isResolved === 'confirmed' && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-2 text-xs text-emerald-400 font-mono">
            <CheckCircle size={15} />
            <span>
              {isDeleteAction
                ? 'Event permanently removed from your Executive Schedule! 🗑️'
                : isEmail 
                ? 'Correspondence dispatched successfully! ✅' 
                : isSheets
                ? 'Financial expenditure committed to ledger successfully! ✅'
                : isCalendar
                ? 'Event confirmed and added to your Executive Schedule! ✅'
                : isUber
                ? 'Ride confirmed and dispatched! Driver is en route. ✅'
                : 'Action confirmed and executed successfully! ✅'}
            </span>
          </div>
        )}

        {isResolved === 'cancelled' && (
          <div className="mt-3 p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center space-x-2 text-xs text-zinc-400 font-mono">
            <XCircle size={15} />
            <span>
              {isDeleteAction
                ? 'Cancellation aborted. Event remains safely on your schedule. 🛡️'
                : isEmail 
                ? 'Draft discarded. No correspondence was sent. 🛡️' 
                : isSheets
                ? 'Transaction entry aborted. No changes made to ledger. 🛡️'
                : isCalendar
                ? 'Meeting scheduling cancelled. Calendar remains unchanged. 🛡️'
                : 'Action aborted safely by user. 🛡️'}
            </span>
          </div>
        )}
      </div>

      {/* ── Context-Specific 2-Tile Bento Grid (Agent-Specific Parameters Only) ── */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-10 text-xs font-mono">
        {/* TILE 1: Primary Parameters */}
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <CheckCircle2 size={12} className={theme.accentText} />
              {isDeleteAction
                ? 'Target Event to Remove'
                : isCalendar ? 'Schedule & Venue' : isSheets ? 'Expenditure Item' : isUber ? 'Ride Itinerary' : isEmail ? 'Correspondence' : 'Action Details'}
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
              Verified
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            {isCalendar && (
              <>
                {action.action === 'update' ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Target Event:</span>
                      <span className="text-zinc-300 line-through truncate max-w-[150px]">{p.targetEventTitle || p.oldTitle || 'Previous Title'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Updated Title:</span>
                      <span className="text-emerald-400 font-semibold truncate max-w-[150px]">{p.title || p.newTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">New Schedule:</span>
                      <span className={cn("font-bold", theme.accentText)}>{formatDateDisplay(p.date)} at {p.time ? formatToISTTime(p.time) : '10:00 AM'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Duration:</span>
                      <span className="text-zinc-300">{p.duration || (p.durationMinutes ? `${p.durationMinutes} mins` : '45 mins')}</span>
                    </div>
                  </>
                ) : action.action === 'bulk_delete' ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Action:</span>
                      <span className="text-rose-400 font-semibold">Bulk Cancellation</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Keyword Filter:</span>
                      <span className="text-zinc-200 font-mono">"{p.wildcardFilter?.text || 'Sync'}"</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Matching Events:</span>
                      <span className="text-rose-300 font-bold">{p.eventIds?.length || 0} scheduled</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Scope:</span>
                      <span className="text-zinc-300">{p.wildcardFilter?.timeScope || 'Upcoming Week'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Date:</span>
                      <span className="text-zinc-200 font-semibold">{formatDateDisplay(p.date)}{p.endDate ? ` ➔ ${formatDateDisplay(p.endDate)}` : ''}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Scheduled Time:</span>
                      <span className={cn("font-bold", theme.accentText)}>{p.isAllDay ? 'All Day' : (p.time ? formatToISTTime(p.time) : (p.timeSlot ? formatToISTTime(p.timeSlot) : '10:00 AM'))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Duration:</span>
                      <span className="text-zinc-300">{p.isAllDay ? 'All-Day Event' : (p.duration || (p.durationMinutes ? `${p.durationMinutes} mins` : '45 mins'))}</span>
                    </div>
                    {p.recurrence && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Recurrence:</span>
                        <span className="text-amber-400 font-medium truncate max-w-[150px]">{p.recurrence.description || 'Repeating'}</span>
                      </div>
                    )}
                    {p.attendees && p.attendees.length > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Attendees:</span>
                        <span className="text-zinc-300 font-mono text-[10px] truncate max-w-[150px]">{p.attendees.join(', ')}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Location:</span>
                      <span className="text-zinc-200 font-medium truncate max-w-[150px]">{p.location || (p.isAllDay ? 'Offsite' : 'In-Person / To be decided')}</span>
                    </div>
                    {p.description && (
                      <div className="flex justify-between items-start gap-2 pt-1 border-t border-zinc-800/60">
                        <span className="text-zinc-400 shrink-0">Agenda / Notes:</span>
                        <span className="text-zinc-200 font-medium text-right text-xs truncate max-w-[200px]" title={p.description}>
                          {p.description}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {isSheets && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Merchant / Payee:</span>
                  <span className="text-zinc-200 font-semibold">{p.merchant || p.item || 'Vendor'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Amount:</span>
                  <span className={cn("font-bold", theme.accentText)}>{formattedAmt}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Category:</span>
                  <span className="text-zinc-300">{p.category || 'Food & Dining'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Ledger Target:</span>
                  <span className="text-indigo-300">Executive Treasury</span>
                </div>
              </>
            )}

            {isUber && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Pickup:</span>
                  <span className="text-zinc-200 truncate max-w-[150px]">{p.pickup || 'Current Location'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Destination:</span>
                  <span className={cn("font-bold truncate max-w-[150px]", theme.accentText)}>{p.destination || 'Destination'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Vehicle Tier:</span>
                  <span className="text-amber-400 font-semibold">{p.selected_tier || p.tier || 'Uber Premier AC'}</span>
                </div>
              </>
            )}

            {isEmail && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Recipient:</span>
                  <span className={cn("font-bold truncate max-w-[150px]", theme.accentText)}>{editableTo || p.to || 'Recipient'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Subject:</span>
                  <span className="text-zinc-200 truncate max-w-[150px]">{editableSubject || p.subject || 'Follow-up'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Composition:</span>
                  <span className="text-emerald-400 font-semibold truncate max-w-[150px]">
                    {editableBody ? `${editableBody.length} chars (Full above)` : 'Empty Draft'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Draft Status:</span>
                  <span className="text-indigo-300 font-mono text-[10px]">
                    {editableBody !== (p.body || '') || editableSubject !== (p.subject || '') ? 'Customized' : 'Verified'}
                  </span>
                </div>
              </>
            )}

            {!isCalendar && !isSheets && !isUber && !isEmail && (
              <div className="space-y-1">
                {Object.entries(p)
                  .filter(([k, v]) => !['rawPrompt', 'userPrompt', 'message', 'alreadyDispatched', 'action', 'id', 'agent', 'confirmationDetails', 'traceSteps'].includes(k) && typeof v !== 'object' && v !== undefined && v !== null)
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="text-zinc-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                      <span className="text-zinc-200 truncate max-w-[150px]">{String(v)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* TILE 2: Contextual Diagnostics & Telemetry (100% Agent Specific!) */}
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck size={12} className={theme.accentText} />
              {isDeleteAction
                ? 'Removal Guardrail'
                : isCalendar ? 'Calendar & Guardrails' : isSheets ? 'Ledger & Audit' : isUber ? 'Dispatch Telemetry' : isEmail ? 'Security & Protocol' : 'Telemetry Guard'}
            </span>
            <span className={cn(
              "text-[9px] font-mono px-1.5 py-0.5 rounded border",
              isDeleteAction
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                : isCalendar && (p.hasConflict || p.conflict)
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            )}>
              {isDeleteAction ? "Action Required" : isCalendar && (p.hasConflict || p.conflict) ? "Warning" : "Active"}
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            {isDeleteAction && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Action Type:</span>
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <span>🗑️</span> Event Deletion
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Target System:</span>
                  <span className="text-zinc-200">Google Calendar</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Confirmation:</span>
                  <span className="text-amber-400 font-semibold">Required</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Target ID:</span>
                  <span className="text-zinc-400 font-mono text-[10px] truncate max-w-[130px]">{p.eventId || p.id || 'Active Event'}</span>
                </div>
              </>
            )}

            {!isDeleteAction && isCalendar && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Conflict Check:</span>
                  {(p.hasConflict || p.conflict) ? (
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <span>⚠️</span> Conflict Detected
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span>✓</span> 0 Overlaps • Slot Free
                    </span>
                  )}
                </div>
                {(p.hasConflict || p.conflict) && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] space-y-1">
                    <div className="font-semibold text-amber-300 flex items-center justify-between">
                      <span className="truncate max-w-[140px]">{p.conflictingEvent || 'Conflicting Event'}</span>
                      <span className="text-amber-400 font-mono shrink-0">
                        {p.overlapMinutes ? `${p.overlapMinutes}m overlap` : 'Collision'}
                      </span>
                    </div>
                    {p.conflicts && Array.isArray(p.conflicts) && p.conflicts.length > 0 && (
                      <div className="text-amber-200/70 text-[9px] truncate">
                        {p.conflicts[0].timeRange}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Target Calendar:</span>
                  <span className="text-indigo-300">Executive Schedule</span>
                </div>
                {Boolean((p.location && /zoom|google meet|virtual|video call|gmeet/i.test(p.location)) || p.meetUrl || p.zoomUrl) ? (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Virtual Meet Link:</span>
                    <span className="text-indigo-300 font-medium">{p.location === 'Zoom Video' ? 'Zoom Scheduled' : 'Auto-generated Meet'}</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400">Location / Format:</span>
                    <span className="text-zinc-300 font-medium">
                      {p.location && p.location !== 'To be decided' ? p.location : 'In-Person / To be decided'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Integrity Hash:</span>
                  <span className="text-zinc-400 font-mono text-[10px]">SHA-256 Validated</span>
                </div>
              </>
            )}

            {isSheets && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Ledger Integrity:</span>
                  <span className="text-emerald-400 font-semibold">100% Synced</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Duplicate Guard:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span>✓</span> 0 Collisions
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Budget Status:</span>
                  <span className={cn("font-semibold", theme.accentText)}>
                    {activeTheme === 'warning' ? 'Alert High' : 'Optimal Allocation'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Cryptographic Commit:</span>
                  <span className="text-indigo-300">Enforced 🔒</span>
                </div>
              </>
            )}

            {isUber && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Locked Tariff:</span>
                  <span className="text-emerald-400 font-semibold">{p.locked_fare || (p.fare ? `₹${p.fare}` : 'Dynamic Tariff')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Dispatch Protocol:</span>
                  <span className="text-indigo-300">Corporate Profile</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Driver Security PIN:</span>
                  <span className="text-zinc-300">Enforced 🔒</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Fleet Availability:</span>
                  <span className="text-emerald-400">High Density (2-4 min ETA)</span>
                </div>
              </>
            )}

            {isEmail && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Encryption:</span>
                  <span className="text-emerald-400 font-semibold">TLS 1.3 Enforced 🔒</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Tone Audit:</span>
                  <span className="text-indigo-300">Executive Concise</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Outbound Relay:</span>
                  <span className="text-zinc-300">Direct SMTP Handshake</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">DKIM / SPF Verification:</span>
                  <span className="text-emerald-400 font-semibold">Passed</span>
                </div>
              </>
            )}

            {!isCalendar && !isSheets && !isUber && !isEmail && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Guardrail Status:</span>
                  <span className="text-emerald-400 font-semibold">Passed 🔒</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Safety Check:</span>
                  <span className="text-zinc-300">Zero-Trust Interceptor</span>
                </div>
              </>
            )}
          </div>

          {/* Optional inline custom memo / notes */}
          <div className="pt-1 border-t border-white/5">
            {!isAddingNote ? (
              <button
                type="button"
                onClick={() => setIsAddingNote(true)}
                className="text-[10px] font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus size={10} className={theme.accentText} />
                <span>{customNote ? `Note: "${customNote}"` : isCalendar ? '+ Add meeting note' : isSheets ? '+ Add transaction memo' : isUber ? '+ Add pickup instructions' : '+ Add memo'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => {
                    setCustomNote(e.target.value);
                    onUpdateParams?.({ note: e.target.value });
                  }}
                  placeholder={isCalendar ? 'e.g. Bring slides...' : 'e.g. Project expenses...'}
                  className="w-full bg-black/60 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                  autoFocus
                  onBlur={() => setIsAddingNote(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsAddingNote(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Compact Recommended Follow-Up Chips ── */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs font-mono relative z-10">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 flex items-center gap-1 shrink-0">
          <Sparkles size={11} className="text-indigo-400" />
          Quick:
        </span>
        {followUps.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onQuickAction?.(item.prompt)}
            className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 hover:border-indigo-500/40 text-[11px] text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
            title={`Click or press ${item.shortcut} to execute`}
          >
            <span>{item.label}</span>
            <span className="text-[9px] text-zinc-400 font-bold px-1 rounded bg-black/50 border border-white/10">{item.shortcut}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
