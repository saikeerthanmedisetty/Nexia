'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, X, Share2, Globe, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  shareUrl: string;
  messageCount?: number;
}

export function ShareModal({
  isOpen,
  onClose,
  title,
  shareUrl,
  messageCount = 0,
}: ShareModalProps) {
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setHasCopied(true);
      toast.success("Public link copied to your clipboard", {
        description: "Anyone with this link can see this conversation",
        duration: 4000,
      });
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      toast.error("Failed to copy link to clipboard");
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 shadow-2xl p-6 space-y-5 font-sans"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Share2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Share link to Chat
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-sans mt-0.5">
                  Anyone with the link will be able to view this shared chat.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Conversation Preview Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              <span className="flex items-center space-x-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                <Globe size={12} />
                <span>Public Link</span>
              </span>
              <span>{messageCount} messages</span>
            </div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
              {title || "Executive Conversation"}
            </h4>
          </div>

          {/* Link URL Field & Copy Button */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition-all shadow-md flex items-center space-x-1.5 shrink-0 cursor-pointer"
              >
                {hasCopied ? (
                  <>
                    <Check size={14} className="text-white" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-white" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              Messages you send after creating your link will not be automatically updated.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/5 text-xs font-mono">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
            >
              <span>Preview Link</span>
              <ExternalLink size={12} />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
