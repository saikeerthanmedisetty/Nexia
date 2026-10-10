'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Send, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Sparkles, 
  AlertCircle,
  Clock
} from 'lucide-react';

export interface EmailApprovalData {
  threadId: string;
  subject: string;
  recipient: string;
  drafted_response: string;
  action_items?: string[];
  resumeUrl: string;
}

interface EmailApprovalCardProps {
  data: EmailApprovalData;
  onDecisionSubmitted?: (approved: boolean, finalResponse?: string) => void;
}

export function EmailApprovalCard({ data, onDecisionSubmitted }: EmailApprovalCardProps) {
  const [editedDraft, setEditedDraft] = useState(data.drafted_response || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolution, setResolution] = useState<'approved' | 'discarded' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDecision = async (approved: boolean) => {
    if (!data.resumeUrl) {
      setErrorMessage('Missing approval service endpoint.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = approved
      ? {
          approved: true,
          final_response: editedDraft.trim(),
          to: data.recipient,
          subject: data.subject,
          timestamp: new Date().toISOString()
        }
      : {
          approved: false,
          reason: 'User rejected the draft in approval UI',
          timestamp: new Date().toISOString()
        };

    try {
      const response = await fetch(data.resumeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Approval service returned HTTP ${response.status}`);
      }

      const status = approved ? 'approved' : 'discarded';
      setResolution(status);
      onDecisionSubmitted?.(approved, editedDraft);
    } catch (err: any) {
      console.error('Failed to submit approval decision:', err);
      setErrorMessage(err.message || 'Failed to reach approval service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl p-5 shadow-2xl relative overflow-hidden my-3">
      {/* Decorative ambient background glow */}
      <div className="absolute -top-16 -right-16 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header: Human-in-the-Loop Gateway Title & Status */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Mail size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100 tracking-wide">
                Email Approval Gateway
              </h3>
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Clock size={10} />
                Approval Required
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Review and tweak the draft before dispatching.
            </p>
          </div>
        </div>
      </div>

      {/* Recipient & Subject Meta Card */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
        <div className="truncate">
          <span className="text-zinc-500">To:</span>{' '}
          <span className="text-indigo-400 font-medium">{data.recipient || 'Recipient'}</span>
        </div>
        <div className="truncate">
          <span className="text-zinc-500">Subject:</span>{' '}
          <span className="text-zinc-200 font-medium">{data.subject || 'Re: Email'}</span>
        </div>
      </div>

      {/* Extracted Action Items */}
      {data.action_items && data.action_items.length > 0 && (
        <div className="mt-3 p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl space-y-1.5">
          <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-400" />
            Detected Action Items ({data.action_items.length})
          </span>
          <ul className="space-y-1 mt-1">
            {data.action_items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="text-indigo-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resolution State Feedback */}
      <AnimatePresence>
        {resolution ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`mt-4 p-4 rounded-xl border flex items-center gap-3 ${
              resolution === 'approved'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
            }`}
          >
            {resolution === 'approved' ? (
              <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
            ) : (
              <XCircle size={22} className="text-zinc-500 shrink-0" />
            )}
            <div>
              <p className="text-xs font-semibold">
                {resolution === 'approved'
                  ? 'Approved & Resumed: Email dispatched to recipient.'
                  : 'Action Cancelled: Draft has been discarded.'}
              </p>
              <p className="text-[11px] opacity-80 font-mono mt-0.5">
                Email dispatched successfully.
              </p>
            </div>
          </motion.div>
        ) : (
          /* Editable Draft Area */
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-indigo-400" />
                Drafted Response (Editable)
              </span>
              <span className="text-[11px] text-zinc-500">
                {editedDraft.length} chars
              </span>
            </div>

            <textarea
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              disabled={isSubmitting}
              rows={6}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 p-3.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans leading-relaxed transition-all resize-y"
              placeholder="Type or tweak your email response here..."
            />

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Buttons: Discard vs Approve & Send */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleDecision(false)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} className="text-zinc-500" />
                )}
                Discard
              </button>

              <button
                type="button"
                onClick={() => handleDecision(true)}
                disabled={isSubmitting || !editedDraft.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/25 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-white" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} className="text-white" />
                    <span>Approve & Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EmailApprovalCard;
