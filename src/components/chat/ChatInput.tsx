'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Mic, Paperclip, X, Receipt, Video, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface ChatImagePayload {
  data?: string; // Base64
  mimeType: string;
  previewUrl?: string;
  isVideo?: boolean;
  fileName?: string;
  thumbnailData?: string;
}

export interface ChatInputProps {
  onSend: (message: string, image?: ChatImagePayload) => void;
  isLoading?: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, isLoading, onStop }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFile, setAttachedFile] = useState<ChatImagePayload | null>(null);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((message.trim() || attachedFile) && !isLoading) {
      onSend(message.trim(), attachedFile || undefined);
      setMessage('');
      setAttachedFile(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isLoading && onStop) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setAttachedFile({
              data: base64,
              mimeType: file.type || 'image/jpeg',
              previewUrl: URL.createObjectURL(file),
              isVideo: false,
              fileName: 'Pasted_Screenshot.png',
            });
            toast.success('Screenshot pasted & attached!');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.webm');
    
    if (isVideo) {
      const videoUrl = URL.createObjectURL(file);
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.src = videoUrl;
      videoEl.muted = true;
      videoEl.playsInline = true;

      const extractFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(videoEl.videoWidth || 480, 480);
          canvas.height = Math.min(videoEl.videoHeight || 320, 320);
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.75);
          setAttachedFile((prev) => (prev ? { ...prev, thumbnailData: thumbnailBase64 } : null));
        } catch (err) {
          console.warn('Video thumbnail capture notice:', err);
        }
      };

      videoEl.onloadeddata = () => {
        videoEl.currentTime = Math.min(0.5, (videoEl.duration || 1) / 2);
      };
      videoEl.onseeked = () => {
        extractFrame();
      };

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedFile((prev) => ({
          ...(prev || {}),
          data: base64,
          mimeType: file.type || 'video/mp4',
          previewUrl: videoUrl,
          isVideo: true,
          fileName: file.name,
        }));
      };
      reader.readAsDataURL(file);
      toast.success(`Video "${file.name}" attached! Ready for YouTube upload.`);
      if (!message) {
        setMessage(`Upload video "${file.name.replace(/\.[^/.]+$/, '')}" to YouTube`);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedFile({
          data: base64,
          mimeType: file.type || 'image/jpeg',
          previewUrl: URL.createObjectURL(file),
          isVideo: false,
          fileName: file.name,
        });
        toast.success('Document attached! Ready for analysis.');
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  const handleRemoveAttachment = () => {
    if (attachedFile?.previewUrl) {
      URL.revokeObjectURL(attachedFile.previewUrl);
    }
    setAttachedFile(null);
  };

  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');

  const toggleMic = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      return;
    }

    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      toast.error('Voice input is not supported in this browser. Please use Google Chrome, Safari, or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

      baseTextRef.current = message;

      recognition.onstart = () => {
        setIsListening(true);
        toast.info('🎙️ Listening... Speak your command now.');
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript;
          } else {
            interimChunk += event.results[i][0].transcript;
          }
        }
        const fullSpoken = (finalChunk + ' ' + interimChunk).trim();
        if (fullSpoken) {
          const capitalized = fullSpoken.charAt(0).toUpperCase() + fullSpoken.slice(1);
          const base = baseTextRef.current.trim();
          setMessage(base ? `${base} ${capitalized}` : capitalized);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
          toast.error('Microphone permission blocked. Please enable microphone permissions in your browser.');
        } else if (event.error !== 'no-speech') {
          setIsListening(false);
          toast.error(`Speech input notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Speech recognition start failed:', err);
      setIsListening(false);
      toast.error('Could not initialize microphone. Please check browser permissions.');
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [message]);

  return (
    <div className="relative flex flex-col w-full max-w-3xl mx-auto group font-mono">
      
      {/* ── Attachment Preview Card (Receipt Image or Demo Video) ── */}
      {attachedFile && (
        <div className={cn(
          "mb-2 flex items-center gap-2.5 p-2 rounded-xl max-w-fit shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 border",
          attachedFile.isVideo 
            ? "bg-[#180a0a]/90 border-red-500/40 text-red-200" 
            : "bg-[#0B0F17] border-indigo-500/30 text-white"
        )}>
          {attachedFile.isVideo ? (
            <div className="w-10 h-10 rounded-lg bg-red-950 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
              <Video size={18} />
            </div>
          ) : attachedFile.previewUrl ? (
            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-indigo-500/40 bg-zinc-950 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={attachedFile.previewUrl} 
                alt="Receipt attachment preview" 
                className="w-full h-full object-cover" 
              />
            </div>
          ) : null}

          <div className="flex flex-col pr-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1">
              {attachedFile.isVideo ? <Video size={12} className="text-red-400" /> : <Receipt size={12} className="text-indigo-400" />}
              {attachedFile.fileName || (attachedFile.isVideo ? 'Demo Video' : 'Receipt Attached')}
            </span>
            <span className="text-[10px] text-zinc-400">
              {attachedFile.isVideo ? 'Video Attached • Ready' : 'Document Attached • Ready'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleRemoveAttachment}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Sleek Pill Input Container (Matching Concept Photo) ── */}
      <div className="relative flex items-center px-3 py-2 bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-white/10 rounded-full shadow-lg dark:shadow-2xl transition-all focus-within:border-indigo-500 focus-within:shadow-[0_0_25px_rgba(99,102,241,0.2)]">
        
        {/* Hidden File Input (supports images and videos) */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          accept="image/*,video/*,.mp4,.mov,.webm" 
          className="hidden" 
        />

        {/* Paperclip Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
          title="Attach document, receipt or demo video"
        >
          <Paperclip size={18} />
        </button>

        {/* Voice Input Mic Button & Dynamic Audio Waveform Indicator */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={toggleMic}
            className={cn(
              "p-2 rounded-full transition-all cursor-pointer mr-1 relative",
              isListening 
                ? "text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/15 ring-2 ring-indigo-500/30 dark:ring-indigo-500/40" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
            )}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            <Mic size={18} className={cn(isListening && "animate-pulse")} />
          </button>

          {isListening && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 mr-1.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 border border-indigo-500/25 dark:border-indigo-500/30 text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-ping" />
              <span>Listening</span>
              <div className="flex items-center gap-[2px] ml-0.5 h-3">
                <span className="w-[2px] h-2 bg-indigo-500 dark:bg-indigo-400 animate-pulse rounded-full" />
                <span className="w-[2px] h-3.5 bg-indigo-500 dark:bg-indigo-400 animate-pulse delay-75 rounded-full" />
                <span className="w-[2px] h-1.5 bg-indigo-500 dark:bg-indigo-400 animate-pulse delay-150 rounded-full" />
              </div>
            </div>
          )}
        </div>

        {/* Auto-expanding Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            attachedFile?.isVideo 
              ? "Review demo video title or hit send to publish..." 
              : attachedFile 
              ? "Add instructions for this file or hit send..." 
              : "Ask Nexia anything or assign an executive task..."
          }
          className="flex-1 max-h-[100px] min-h-[36px] px-2 py-1.5 bg-transparent resize-none focus:outline-none text-sm text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-sans"
          rows={1}
        />

        {/* Send or Stop Generation Button (ChatGPT / Claude / Gemini style) */}
        {isLoading && onStop ? (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onStop}
            type="button"
            title="Stop generation (Esc)"
            className="w-9 h-9 ml-2 rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer bg-rose-500 hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400 text-white shadow-md shadow-rose-500/20"
          >
            <Square size={13} className="fill-current" />
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleSend}
            disabled={(!message.trim() && !attachedFile) || isLoading}
            className={cn(
              "w-9 h-9 ml-2 rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-md",
              (message.trim() || attachedFile) && !isLoading
                ? "bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-500 dark:hover:bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                : "bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed"
            )}
          >
            <SendHorizontal size={17} className="stroke-[2.5]" />
          </motion.button>
        )}

      </div>

      {/* ── Micro Keyboard Shortcut Hints (ChatGPT & Linear style) ── */}
      <div className="hidden sm:flex items-center justify-center gap-3 mt-2 px-2 select-none">
        {isLoading && onStop ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-mono font-medium">
            <kbd className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-[10px] font-semibold">Esc</kbd>
            <span>or click Stop to interrupt response</span>
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 text-[10px] font-semibold">↵</kbd>
              <span>to send</span>
            </span>
            <span className="text-[10px] text-slate-300 dark:text-zinc-700">•</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 text-[10px] font-semibold">Shift + ↵</kbd>
              <span>for new line</span>
            </span>
          </>
        )}
      </div>

    </div>
  );
}
