'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail,
  Video,
  Volume2, 
  VolumeX, 
  Trash2, 
  LogOut, 
  Sun, 
  Moon 
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatUserName } from '@/lib/utils';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearChat?: () => void;
  onLogout?: () => void;
  youtubeChannel?: string;
  onUpdateChannel?: (channel: string) => void;
}

export function ProfileModal({ 
  isOpen, 
  onClose, 
  onClearChat, 
  onLogout,
  youtubeChannel = '@SaikeerthanMedisetty',
  onUpdateChannel
}: ProfileModalProps) {
  const { user } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (resolvedTheme || theme || 'dark') : 'dark';
  const isDark = currentTheme === 'dark';

  const handleToggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    toast.info(`Theme switched to ${next} mode`);
  };

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSound = localStorage.getItem('omni_sound_enabled');
      if (savedSound !== null) setSoundEnabled(savedSound === 'true');
    }
  }, []);

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {
      // AudioContext not supported
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('omni_sound_enabled', String(next));
    }
    if (next) {
      playChime();
    }
    toast.success(next ? 'Sound Feedback Enabled' : 'Sound Feedback Disabled');
  };

  const handleClearHistory = () => {
    if (onClearChat) {
      onClearChat();
    }
    toast.info('Chat history and execution traces reset.');
    onClose();
  };

  const handleSignOut = () => {
    if (onLogout) {
      onLogout();
    }
    toast.success('Signed out of session.');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        
        {/* Backdrop click */}
        <div className="fixed inset-0" onClick={onClose} />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-zinc-100 shadow-2xl shadow-slate-300/40 dark:shadow-indigo-950/40 p-6 z-10 font-mono"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 p-0.5">
                <div className="w-full h-full bg-slate-100 dark:bg-[#0B0F17] rounded-[10px] flex items-center justify-center text-[11px] font-bold text-slate-900 dark:text-indigo-400">
                  SK
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Profile & System Settings</h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Nexia Executive Platform</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* User Account Info Card */}
          <div className="my-4 p-4 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900 dark:text-white">{formatUserName(user?.displayName, user?.email)}</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-500/30 font-semibold">
                ● Administrator
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
              <Mail size={12} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="truncate">{user?.email || 'No registered email'}</span>
            </div>
          </div>

          {/* Target YouTube Channel Configuration */}
          <div className="my-3 p-3.5 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 dark:text-zinc-300 font-semibold flex items-center gap-1.5">
                <Video size={13} className="text-red-500 dark:text-red-400" />
                Target YouTube Channel
              </span>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500">Auto-saved</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={youtubeChannel}
                onChange={(e) => onUpdateChannel?.(e.target.value)}
                placeholder="e.g. ChannelName or @handle"
                className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500 leading-relaxed">
              Nexia automatically routes video uploads and metadata to this channel.
            </p>
          </div>



          {/* Preferences & System Controls */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-white/10">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
              Security & Preferences
            </div>

            {/* Interface Theme Toggle (Dark / Light) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
              <div className="space-y-0.5 pr-3">
                <div className="flex items-center space-x-2">
                  {isDark ? (
                    <Moon size={14} className="text-indigo-400" />
                  ) : (
                    <Sun size={14} className="text-amber-500" />
                  )}
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">Interface Theme</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {isDark ? 'Dark mode (high-contrast executive)' : 'Light mode (clean daytime aesthetic)'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                {isDark ? (
                  <>
                    <Sun size={12} className="text-amber-400" />
                    <span>Switch to Light</span>
                  </>
                ) : (
                  <>
                    <Moon size={12} className="text-indigo-600" />
                    <span>Switch to Dark</span>
                  </>
                )}
              </button>
            </div>



            {/* Sound Notifications Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
              <div className="space-y-0.5 pr-3">
                <div className="flex items-center space-x-2">
                  {soundEnabled ? (
                    <Volume2 size={14} className="text-indigo-400" />
                  ) : (
                    <VolumeX size={14} className="text-slate-400 dark:text-zinc-500" />
                  )}
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">Interface Audio</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Subtle sound feedback for interactions and actions
                </p>
              </div>
              <button
                onClick={toggleSound}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  soundEnabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-zinc-800'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white dark:bg-black transition-transform ${
                    soundEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row gap-2.5">
            {onClearChat && (
              <button
                onClick={handleClearHistory}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-white/10 text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Trash2 size={13} className="text-red-500 dark:text-red-400" />
                <span>Clear Chat History</span>
              </button>
            )}

            <button
              onClick={handleSignOut}
              className="flex-1 py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 dark:bg-red-950/40 dark:hover:bg-red-950/70 dark:border-red-500/20 text-xs text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <LogOut size={13} />
              <span>Sign Out Session</span>
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
