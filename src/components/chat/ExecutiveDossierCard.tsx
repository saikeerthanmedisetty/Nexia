'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  MapPin,
  Car,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExecutiveDossier } from '@/lib/chiefOfStaff';

export interface ExecutiveDossierCardProps {
  dossier: ExecutiveDossier;
  onQuickAction?: (prompt: string) => void;
  onDismiss?: () => void;
}

export function ExecutiveDossierCard({
  dossier,
  onQuickAction,
  onDismiss,
}: ExecutiveDossierCardProps) {
  // Defensive normalization for maximum resilience with real-world n8n & Gemini payloads
  const schedule = Array.isArray(dossier?.schedule) ? dossier.schedule : [];
  const topPriorities = Array.isArray(dossier?.topPriorities) ? dossier.topPriorities : [];
  
  const rawFinancials: any = (dossier?.financials && typeof dossier.financials === 'object') ? dossier.financials : {};
  const weeklyBurnNum = typeof rawFinancials.weeklyBurn === 'number'
    ? rawFinancials.weeklyBurn
    : parseFloat(String(rawFinancials.weeklyBurn || '0').replace(/[^0-9.-]+/g, '')) || 0;
  
  const budgetHealthStr = String(
    rawFinancials.budgetHealth ||
    (weeklyBurnNum > 100000 ? 'high_burn' : weeklyBurnNum > 30000 ? 'moderate' : 'optimal')
  );
  const topCategoryStr = String(rawFinancials.topCategory || 'Operational Overhead');

  const financials = {
    weeklyBurn: weeklyBurnNum,
    monthlyTotal: Number(rawFinancials.monthlyTotal) || 0,
    recentTxCount: Number(rawFinancials.recentTxCount) || 0,
    budgetHealth: budgetHealthStr,
    topCategory: topCategoryStr,
  };
  const quickActions = Array.isArray(dossier?.quickActions) ? dossier.quickActions : [];
  const dateStr = String(dossier?.date || 'Today');
  const timeISTStr = String(dossier?.timeIST || '');
  const greetingStr = String(dossier?.greeting || 'Executive Briefing');
  const executiveSummaryStr = String(dossier?.executiveSummary || 'Your daily executive briefing is ready.');

  const isTomorrow =
    dateStr.toLowerCase().includes('tomorrow') ||
    greetingStr.toLowerCase().includes('tomorrow');

  // Local interactive state for checking off priorities
  const [completedPriorities, setCompletedPriorities] = useState<Record<string, boolean>>({});

  const togglePriority = (id: string) => {
    setCompletedPriorities((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getQuickActionIcon = (iconName: string) => {
    switch (iconName) {
      case 'Calendar':
        return <Calendar size={13} className="text-indigo-400" />;
      case 'Car':
        return <Car size={13} className="text-emerald-400" />;
      case 'FileSpreadsheet':
        return <FileSpreadsheet size={13} className="text-amber-400" />;
      default:
        return <Zap size={13} className="text-indigo-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="my-4 w-full max-w-2xl rounded-2xl border border-indigo-500/30 bg-[#0B0F17]/95 shadow-[0_8px_32px_rgba(94,106,210,0.18)] backdrop-blur-xl overflow-hidden font-sans text-white"
    >
      {/* ── Card Header Bar ── */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-transparent border-b border-white/10 select-none">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shadow-inner">
            <img
              src="/brand/nexia-mark-dark.png"
              alt="Nexia"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                {isTomorrow ? "Tomorrow's Executive Dossier" : "Executive Morning Dossier"}
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                Chief of Staff
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans">
              {greetingStr} • {dateStr} {timeISTStr ? `(${timeISTStr} IST)` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Synced</span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* ── Executive Narrative Synthesis Banner ── */}
        <div className="relative rounded-xl bg-gradient-to-br from-indigo-950/30 via-slate-900/60 to-black/60 p-4 border border-indigo-500/20 shadow-sm">
          <div className="flex items-start space-x-3">
            <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-200 leading-relaxed font-sans font-normal">
              {executiveSummaryStr}
            </p>
          </div>
        </div>

        {/* ── Bento Grid: Schedule Timeline & Priority Radar ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Left Tile: Schedule Timeline */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                <Calendar size={14} className="text-indigo-400" />
                <span>{isTomorrow ? "Tomorrow's Schedule" : "Today's Schedule"}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {schedule.length} events
              </span>
            </div>

            <div className="space-y-2">
              {schedule.length > 0 ? (
                schedule.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-2.5 rounded-lg border transition-all text-xs",
                      item.status === 'current'
                        ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                        : "bg-black/30 border-white/5 text-zinc-300"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-semibold text-indigo-400">
                        {item.time}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-medium",
                          item.status === 'current'
                            ? "bg-indigo-500/20 text-indigo-300"
                            : item.status === 'done'
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-white/5 text-zinc-400"
                        )}
                      >
                        {item.status === 'current' ? 'Now' : item.duration}
                      </span>
                    </div>
                    <div className="font-medium break-words text-zinc-200">{item.title}</div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-lg bg-black/20 border border-white/5 text-center text-xs text-zinc-400">
                  <Calendar size={18} className="mx-auto mb-1.5 text-zinc-500 opacity-60" />
                  No events scheduled for this period. Calendar is clear.
                </div>
              )}
            </div>
          </div>

          {/* Right Tile: Action Radar */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                <Zap size={14} className="text-amber-400" />
                <span>Priority Action Radar</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {topPriorities.length} items
              </span>
            </div>

            <div className="space-y-2">
              {topPriorities.length > 0 ? (
                topPriorities.map((priority, pIdx) => {
                  const pId = String(priority.id || `priority-${pIdx}`);
                  const isDone = Boolean(completedPriorities[pId]);
                  const pLevel = String(priority.priority || 'medium').toLowerCase();
                  const pTitle = String(priority.title || (priority as any).text || 'Priority Item');
                  return (
                    <button
                      key={pId}
                      type="button"
                      onClick={() => togglePriority(pId)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-start space-x-2.5",
                        isDone
                          ? "bg-white/[0.02] border-white/5 opacity-50"
                          : "bg-black/30 border-white/5 hover:border-white/15"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={13} className="text-emerald-400 stroke-[2.5]" />
                        ) : (
                          <Circle size={13} className="text-zinc-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span
                            className={cn(
                              "text-[9px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold",
                              pLevel === 'high'
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                : pLevel === 'medium'
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
                            )}
                          >
                            {pLevel}
                          </span>
                          {priority.dueTime && (
                            <span className="text-[10px] font-mono text-zinc-500">
                              {priority.dueTime}
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-xs font-normal leading-relaxed break-words mt-0.5",
                            isDone ? "line-through text-zinc-500" : "text-zinc-200"
                          )}
                        >
                          {pTitle}
                        </p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 rounded-lg bg-black/20 border border-white/5 text-center text-xs text-zinc-400">
                  <CheckCircle2 size={18} className="mx-auto mb-1.5 text-emerald-500 opacity-60" />
                  All clear — no urgent action items pending.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Financial Burn Rate Banner ── */}
        <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp size={16} />
            </div>
            <div>
              <div className="text-[11px] text-zinc-400 font-sans">
                Weekly Expense Burn Rate
              </div>
              <div className="text-sm font-bold font-mono text-zinc-100">
                ₹{financials.weeklyBurn.toLocaleString('en-IN')}{' '}
                <span className="text-[10px] font-sans font-normal text-zinc-500">
                  (7-Day Ledger)
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span
              className={cn(
                "text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-semibold border",
                financials.budgetHealth === 'optimal'
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : financials.budgetHealth === 'moderate'
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
              )}
            >
              {financials.budgetHealth.replace('_', ' ')}
            </span>
            <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
              Top category: {financials.topCategory}
            </div>
          </div>
        </div>

        {/* ── 1-Click Actionable Follow-up Chips ── */}
        {quickActions.length > 0 && onQuickAction && (
          <div className="pt-1 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-mono text-zinc-500">
              Recommended Follow-Up Actions
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() => onQuickAction(qa.prompt)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer group shadow-xs select-none"
                >
                  {getQuickActionIcon(qa.icon)}
                  <span className="font-medium">{qa.label}</span>
                  <ArrowRight
                    size={11}
                    className="text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
