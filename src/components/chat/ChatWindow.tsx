'use client';

import React, { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import type { AgentTask } from './AgentActivity';
import { HITLCard, PendingAction } from './HITLCard';
import { Bot, Sparkles, Shield, ArrowDown, Brain, Calendar, Mail, Receipt, Car, ArrowRight, Briefcase, Video, Search } from 'lucide-react';
import type { TraceStep } from '@/lib/gemini';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { formatUserName } from '@/lib/utils';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  agentName?: string;
  isStreaming?: boolean;
  imageUrl?: string;
  stagedAction?: PendingAction;
  actionStatus?: 'pending' | 'confirmed' | 'cancelled';
}

export interface ChatWindowProps {
  messages: Message[];
  isLoading?: boolean;
  agentTasks?: AgentTask[];
  traceSteps?: TraceStep[];
  pendingAction?: PendingAction | null;
  onSendMessage: (msg: string) => void;
  onConfirmAction?: (action: PendingAction) => Promise<void>;
  onCancelAction?: (action: PendingAction) => void;
  onUpdateParams?: (newParams: Record<string, any>) => void;
  onStop?: () => void;
  pastSessionCount?: number;
}

const DEMO_SCENARIOS = [
  {
    title: "Executive Morning Dossier",
    tag: "Chief of Staff",
    icon: <Briefcase size={13} />,
    prompt: "Generate my executive morning dossier covering today's calendar, priority inbox items, and expense burn rate",
  },
  {
    title: "Schedule Project Review",
    tag: "Calendar",
    icon: <Calendar size={13} />,
    prompt: "Check if I'm free tomorrow at 3 PM, and if so, schedule a 45-minute project review with Aditya Sir",
  },
  {
    title: "Draft Sprint Update",
    tag: "Gmail HITL",
    icon: <Mail size={13} />,
    prompt: "Draft an email to my team members summarizing today's sprint achievements and asking them to review the code before 6 PM",
  },
  {
    title: "Receipt Vision to Ledger",
    tag: "Sheets OCR",
    icon: <Receipt size={13} />,
    prompt: "Log an academic expense receipt of ₹1,450 for Arduino sensors and jumper wires into my Project Accounts sheet",
  },
  {
    title: "YouTube Video Publishing",
    tag: "Media Broadcast",
    icon: <Video size={13} />,
    prompt: "Stage an unlisted YouTube video upload for our Nexia technical demonstration with custom 16:9 thumbnail and high-CTR SEO tags",
  },
  {
    title: "Transit to Station",
    tag: "Mobility Intelligence",
    icon: <Car size={13} />,
    prompt: "Check transit options and road distance from Sanjay Ghodawat University main gate to Kolhapur Railway Station for tomorrow 9 AM",
  },
  {
    title: "Multi-Agent Research Dossier",
    tag: "Deep Research",
    icon: <Search size={13} />,
    prompt: "Conduct deep research comparing decentralized multi-agent architectures against centralized coordinators, including fault isolation and SLA metrics",
  },
];

export function ChatWindow({ 
  messages, 
  isLoading, 
  agentTasks, 
  traceSteps,
  pendingAction,
  onSendMessage,
  onConfirmAction,
  onCancelAction,
  onUpdateParams,
  onStop,
  pastSessionCount,
}: ChatWindowProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Monitor scroll position to show/hide the floating scroll-to-bottom glider
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Show glider button if scrolled up by more than 140px
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 140;
    setShowScrollBottom(isScrolledUp);
  };

  const cardRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Auto-scroll to bottom on new messages or state changes, and auto-center card when staged
  useEffect(() => {
    if (pendingAction) {
      const t1 = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      const t2 = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 220);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      scrollToBottom();
      const t = setTimeout(scrollToBottom, 120);
      return () => clearTimeout(t);
    }
  }, [messages, isLoading, agentTasks, traceSteps, pendingAction]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f8fafc] dark:bg-[#0B0F17] text-slate-900 dark:text-zinc-100 selection:bg-indigo-500 selection:text-white relative">
      
      {/* ── Native, fully scrollable container (Guaranteed wheel/trackpad scrolling on Safari & Chrome) ── */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 scroll-smooth outline-none overscroll-contain overscroll-y-contain"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', overscrollBehaviorY: 'contain' }}
      >
        
        {messages.length === 0 ? (
          /* ── Clean Welcome Greeting with Quick-Action Starters ── */
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 max-w-2xl mx-auto my-auto select-none">
            
            {/* Center Glowing Logo */}
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-400/30 flex items-center justify-center mb-5 shadow-[0_0_35px_rgba(99,102,241,0.25)] p-2.5 overflow-hidden"
            >
              <img
                src="/brand/nexia-mark-dark.png"
                alt="Nexia"
                className="w-full h-full object-contain select-none"
              />
            </motion.div>

            {/* Greeting Statements */}
            <motion.div 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="space-y-2 mb-8"
            >
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-mono leading-tight">
                Welcome back, <span className="text-indigo-600 dark:text-indigo-400">{formatUserName(user?.displayName, user?.email)}</span>.
              </h2>
              
              <p className="text-sm font-mono text-slate-600 dark:text-zinc-400">
                What would you like to accomplish today?
              </p>
            </motion.div>

            {/* Executive Memory Continuity Badge */}
            <motion.div 
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-500/25 text-xs font-mono text-indigo-700 dark:text-indigo-300 mb-4 shadow-xs select-none backdrop-blur-xs"
            >
              <Brain size={13} className="text-indigo-500 animate-pulse shrink-0" />
              <span>
                Executive Memory Active • Connected across {pastSessionCount ? `${pastSessionCount} past chats` : 'all your conversations'}
              </span>
            </motion.div>

            {/* Live Operational Scenarios Grid for Presentation */}
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.2 }}
              className="w-full max-w-xl text-left space-y-2 mb-4"
            >
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[11px] font-mono tracking-wider uppercase text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-500" />
                  Live Operational Scenarios (Click to Run)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-semibold">
                  HITL Verified
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEMO_SCENARIOS.map((scenario, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSendMessage(scenario.prompt)}
                    className="group relative flex flex-col items-start p-3 rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/70 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md transition-all duration-200 text-left cursor-pointer overflow-hidden"
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                          {scenario.icon}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {scenario.title}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                        {scenario.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed font-sans">
                      "{scenario.prompt}"
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Memory badge sits above input with clean breathing room */}
          </div>
        ) : (
          /* ── Active Conversation Stream ── */
          <div className="space-y-5 pb-24 max-w-3xl mx-auto">
            {messages.map((msg) => {
              const hasInlineCard = Boolean(msg.stagedAction);
              const isCurrentActive = pendingAction && msg.stagedAction && pendingAction.id === msg.stagedAction.id;

              return (
                <div key={msg.id} className="space-y-3">
                  <MessageBubble
                    message={msg.content}
                    role={msg.role}
                    timestamp={msg.timestamp}
                    agentName={msg.agentName}
                    isStreaming={msg.isStreaming}
                    imageUrl={msg.imageUrl}
                  />

                  {hasInlineCard && msg.stagedAction && onConfirmAction && onCancelAction && (
                    <div ref={isCurrentActive ? cardRef : undefined} className="pl-1 sm:pl-2">
                      <HITLCard 
                        action={msg.stagedAction} 
                        onConfirm={onConfirmAction} 
                        onCancel={onCancelAction}
                        onUpdateParams={onUpdateParams}
                        onQuickAction={onSendMessage}
                        resolvedStatus={msg.actionStatus}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* ── Fallback for Unattached Pending Action ── */}
            {pendingAction && onConfirmAction && onCancelAction && !messages.some(m => m.stagedAction?.id === pendingAction.id) && (
              <div ref={cardRef} className="pl-1 sm:pl-2">
                <HITLCard 
                  action={pendingAction} 
                  onConfirm={onConfirmAction} 
                  onCancel={onCancelAction}
                  onUpdateParams={onUpdateParams}
                  onQuickAction={onSendMessage}
                />
              </div>
            )}
            
            {isLoading && !messages[messages.length - 1]?.isStreaming && (
              <TypingIndicator onStop={onStop} />
            )}
            
            <div ref={scrollRef} className="h-4" />
          </div>
        )}

      </div>
      
      {/* ── Floating "Scroll to Bottom" Glider Button ── */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            transition={{ duration: 0.2 }}
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-5 right-6 z-30 p-2.5 rounded-full bg-white/95 dark:bg-[#0B0F17]/95 border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 shadow-[0_4px_24px_rgba(99,102,241,0.35)] backdrop-blur-md hover:scale-110 active:scale-95 hover:border-indigo-400 transition-all cursor-pointer flex items-center justify-center group select-none"
            title="Scroll to latest messages"
          >
            <ArrowDown size={18} className="group-hover:translate-y-0.5 transition-transform stroke-[2.5]" />
          </motion.button>
        )}
      </AnimatePresence>

    </div>
  );
}
