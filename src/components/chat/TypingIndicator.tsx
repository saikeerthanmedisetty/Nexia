'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Square } from 'lucide-react';

export function TypingIndicator({ onStop }: { onStop?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="flex w-full mb-4 justify-start select-none"
    >
      <div className="flex max-w-[85%] md:max-w-[75%] flex-row items-start">
        {/* Nexia Icon Badge */}
        <div className="flex-shrink-0 mr-3 mt-1">
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shadow-xs overflow-hidden p-1">
            <img
              src="/brand/nexia-mark-dark.png"
              alt="Nexia"
              className="w-full h-full object-contain select-none animate-pulse"
            />
          </div>
        </div>
        
        <div className="flex flex-col justify-center">
          <div className="flex items-center space-x-2 mb-1.5 ml-1">
            <span className="text-xs font-mono font-semibold tracking-wide text-indigo-700 dark:text-indigo-400">
              Nexia
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
              Thinking…
            </span>
          </div>

          <div className="px-4 py-3 rounded-2xl bg-white/90 dark:bg-[#0B0F17]/90 border border-slate-200/80 dark:border-white/10 rounded-tl-sm shadow-xs backdrop-blur-md">
            <div className="flex items-center space-x-3">
              {/* Electric Indigo to Violet shimmer wave bars */}
              <div className="flex items-center space-x-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-4 rounded-full bg-gradient-to-t from-indigo-500 to-violet-400"
                    animate={{
                      scaleY: [0.3, 1.2, 0.3],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-600 dark:text-zinc-300 font-mono">
                Processing request...
              </span>

              {onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="ml-2 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 text-xs font-mono flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                  title="Stop generation midway"
                >
                  <Square size={10} className="fill-current" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
