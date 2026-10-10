'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Zap, 
  Table, 
  Car, 
  Mail, 
  Calendar, 
  Video, 
  Eye,
  ShieldCheck,
  Activity,
  Check,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TraceStep } from '@/lib/gemini';
import { AgentTask } from './AgentActivity';

export interface ExecutionTraceProps {
  steps: TraceStep[];
  tasks?: AgentTask[];
  isActive?: boolean;
}

export function ExecutionTrace({ steps, tasks = [], isActive = false }: ExecutionTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!steps || steps.length === 0) return null;

  const getAgentIcon = (agent: string) => {
    switch (agent.toUpperCase()) {
      case 'EMAIL':
        return <Mail size={12} className="text-indigo-600 dark:text-indigo-400" />;
      case 'CALENDAR':
        return <Calendar size={12} className="text-indigo-600 dark:text-indigo-400" />;
      case 'UBER':
        return <Car size={12} className="text-emerald-500 dark:text-emerald-400" />;
      case 'SHEETS':
        return <Table size={12} className="text-emerald-600 dark:text-emerald-400" />;
      case 'YOUTUBE':
        return <Video size={12} className="text-red-500 dark:text-red-400" />;
      case 'VISION':
        return <Eye size={12} className="text-indigo-600 dark:text-indigo-400" />;
      case 'CHIEF_OF_STAFF':
        return <Briefcase size={12} className="text-purple-500 dark:text-purple-400" />;
      default:
        return <Cpu size={12} className="text-indigo-600 dark:text-indigo-400" />;
    }
  };

  const totalDuration = steps.reduce((acc, s) => acc + (s.durationMs || 0), 0);
  const completedCount = steps.filter((s) => s.status === 'done').length;
  const hasError = steps.some((s) => s.status === 'error');
  const hasPaused = steps.some((s) => 
    s.status === 'pending' || 
    (s.detail && s.detail.toLowerCase().includes('paused'))
  );

  return (
    <div className="w-full my-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#0B0F17]/90 shadow-xs backdrop-blur-md transition-all font-mono">
      
      {/* ── Compact Executive Summary Pill Bar ── */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors cursor-pointer rounded-xl select-none"
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          {/* Glowing Status Indicator */}
          <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
            {isActive ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
              </span>
            ) : hasPaused ? (
              <ShieldCheck size={14} className="text-amber-500 dark:text-amber-400" />
            ) : hasError ? (
              <AlertCircle size={14} className="text-rose-500 dark:text-rose-400" />
            ) : (
              <Zap size={14} className="text-indigo-600 dark:text-indigo-400" />
            )}
          </div>

          <div className="flex items-center space-x-2 min-w-0 truncate">
            <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 tracking-wide">
              Execution Telemetry
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400">
              {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </span>
            {totalDuration > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 hidden sm:inline">
                • {totalDuration}ms latency
              </span>
            )}
          </div>
        </div>

        {/* Right Status Badge & Expand Caret */}
        <div className="flex items-center space-x-2 shrink-0 pl-2">
          {hasPaused ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Safety Hold</span>
            </span>
          ) : isActive ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
              <span>Executing</span>
            </span>
          ) : hasError ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-500/30">
              Notice
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-500/30 flex items-center gap-1">
              <Check size={10} className="stroke-[3]" />
              <span>Verified</span>
            </span>
          )}

          <div className="flex items-center text-[10px] text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 gap-0.5">
            <span className="hidden md:inline">{isExpanded ? 'Hide' : 'Trace'}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </div>
      </button>

      {/* ── Connected Waterfall Timeline Flow ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-200/80 dark:border-white/10 px-4 py-3.5"
          >
            <div className="relative pl-6 ml-1 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-200 dark:before:bg-white/10">
              {steps.map((step, idx) => {
                const isRunning = step.status === 'running';
                const isDone = step.status === 'done';
                const isPausedStep = 
                  step.status === 'pending' || 
                  (step.detail && step.detail.toLowerCase().includes('paused'));
                const isError = step.status === 'error' && !isPausedStep;

                return (
                  <div key={step.id || idx} className="relative group">
                    {/* Node on Timeline */}
                    <div className="absolute -left-[23px] top-0.5 flex items-center justify-center">
                      {isRunning ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/20 border border-indigo-400 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                        </div>
                      ) : isDone ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500 dark:border-emerald-400 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                          <Check size={9} className="stroke-[3]" />
                        </div>
                      ) : isPausedStep ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-500">
                          <ShieldCheck size={9} />
                        </div>
                      ) : isError ? (
                        <div className="w-3.5 h-3.5 rounded-full bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-500">
                          <AlertCircle size={9} />
                        </div>
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700" />
                      )}
                    </div>

                    {/* Step Card Content */}
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            {step.label}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300">
                            {getAgentIcon(step.agent)}
                            <span>{step.agent}</span>
                          </span>
                        </div>

                        {step.durationMs !== undefined && step.durationMs > 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                            {step.durationMs}ms
                          </span>
                        )}
                      </div>

                      {step.detail && (
                        <p className={cn(
                          "text-[11px] font-sans leading-relaxed",
                          isPausedStep 
                            ? "text-amber-700 dark:text-amber-300/90 font-medium"
                            : isError 
                            ? "text-rose-700 dark:text-rose-300/90" 
                            : "text-slate-500 dark:text-zinc-400"
                        )}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Seamless runtime task telemetry footnote (if tasks exist) */}
            {tasks && tasks.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Activity size={11} className="text-indigo-500 dark:text-indigo-400" />
                  <span>Telemetry: {tasks.filter(t => t.status === 'done').length}/{tasks.length} sub-tasks dispatched</span>
                </span>
                <span>Active thread: synchronized</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
