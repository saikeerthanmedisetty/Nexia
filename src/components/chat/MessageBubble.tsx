'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Copy, Check, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface MessageBubbleProps {
  message: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  agentName?: string;
  isStreaming?: boolean;
  imageUrl?: string;
}

export function MessageBubble({ message, role, timestamp, agentName, isStreaming, imageUrl }: MessageBubbleProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Message copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`${language || 'Code'} snippet copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = code.split('\n');
  const cleanLang = language ? language.trim().toUpperCase() : 'CODE';

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-[#070B14] shadow-md font-mono text-xs">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 dark:bg-black/70 border-b border-slate-800/80 dark:border-white/10 select-none">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            {cleanLang}
          </span>
          <span className="text-[10px] text-zinc-500 font-sans">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-sans text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all cursor-pointer select-none"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400 stroke-[2.5]" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body with Line Number Gutters */}
      <div className="p-3 overflow-x-auto selection:bg-indigo-500/30 text-zinc-200">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors leading-5">
                <td className="w-8 select-none pr-3 text-right text-[11px] text-zinc-600 font-mono align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre font-mono text-[12px] text-zinc-200 break-normal">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseMessageSegments(text: string) {
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'code',
      content: match[2].trimEnd(),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts;
}

function formatMarkdownTable(text: string): string {
  const tableRegex = /((?:^[ \t]*\|[^\n]+\|\r?\n)(?:^[ \t]*\|[\s\-:|]+\|\r?\n)(?:^[ \t]*\|[^\n]+\|\r?\n?)+)/gm;
  return text.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n').filter(l => l.trim().startsWith('|'));
    if (lines.length < 2) return match;
    const headerLine = lines[0];
    const dataLines = lines.slice(2);

    const parseRow = (line: string) => 
      line.split('|').slice(1, -1).map(c => c.trim());

    const headers = parseRow(headerLine);
    const rows = dataLines.map(parseRow);

    const thead = `<thead><tr class="border-b border-slate-300 dark:border-white/10 bg-slate-100/90 dark:bg-white/[0.06] text-xs font-mono text-slate-700 dark:text-zinc-200">${headers.map(h => `<th class="px-3.5 py-2.5 text-left font-semibold">${h}</th>`).join('')}</tr></thead>`;
    
    const tbody = `<tbody class="divide-y divide-slate-200 dark:divide-white/5 text-xs font-mono">${rows.map(r => `<tr class="hover:bg-slate-100/60 dark:hover:bg-white/[0.03] transition-colors">${r.map(c => `<td class="px-3.5 py-2.5 text-slate-800 dark:text-zinc-200">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;

    return `\n<div class="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/40 shadow-xs whitespace-normal"><table class="w-full text-left border-collapse">${thead}${tbody}</table></div>\n`;
  });
}

// Markdown formatting for tables, bold, inline code, clickable links, headers, and direct URLs
const formatMessage = (text: string) => {
  // 0. Convert markdown tables into styled HTML tables
  let formatted = formatMarkdownTable(text);

  // 1. Convert markdown links [Label](URL) into clickable <a> tags
  formatted = formatted.replace(
    /\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1">$1 ↗</a>'
  );
  // 2. Bold text **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900 dark:text-white">$1</strong>');
  // 3. Inline code `code`
  formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-slate-100 dark:bg-black/50 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-mono text-xs border border-slate-200 dark:border-white/10 break-all">$1</code>');
  // 4. Markdown Headings
  formatted = formatted.replace(/(?:^|\n)### (.*?)(?:\n|$)/g, '<h4 class="text-sm font-bold text-slate-900 dark:text-white mt-2 mb-1 tracking-tight">$1</h4>');
  formatted = formatted.replace(/(?:^|\n)## (.*?)(?:\n|$)/g, '<h3 class="text-base font-bold text-slate-900 dark:text-white mt-2.5 mb-1.5 tracking-tight">$1</h3>');
  // 5. Standalone plain URLs: convert to clickable links
  formatted = formatted.replace(
    /(^|[\s\n(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs break-all inline-block my-0.5">$2 ↗</a>'
  );
  return <div dangerouslySetInnerHTML={{ __html: formatted }} className="inline-block w-full whitespace-pre-line leading-relaxed" />;
};

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex w-full mb-4 group", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex max-w-[88%] md:max-w-[78%]", isUser ? "flex-row-reverse" : "flex-row")}>
        {!isUser ? (
          <div className="flex-shrink-0 mr-3 mt-1">
            <div className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shadow-xs overflow-hidden p-1">
              <img
                src="/brand/nexia-mark-dark.png"
                alt="Nexia"
                className="w-full h-full object-contain select-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 ml-2.5 mt-1">
            <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-white/10 flex items-center justify-center shadow-xs">
              <User size={15} className="text-slate-700 dark:text-zinc-300" />
            </div>
          </div>
        )}
        
        <div className="flex flex-col min-w-0">
          {/* Header metadata */}
          <div className={cn("flex items-center space-x-2 mb-1 px-1", isUser ? "justify-end" : "justify-start")}>
            {!isUser && (
              <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                Nexia
              </span>
            )}
            <span suppressHydrationWarning className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          
          {/* Message Content Container */}
          <div
            className={cn(
              "px-4 py-3.5 rounded-2xl relative transition-all",
              isUser 
                ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-tr-sm shadow-md shadow-indigo-950/30" 
                : "bg-white/95 dark:bg-[#0B0F17]/95 text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-white/10 rounded-tl-sm shadow-xs backdrop-blur-md"
            )}
          >
            {imageUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-white/15 max-w-sm shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={imageUrl} 
                  alt="Attachment preview" 
                  className="w-full h-auto max-h-56 object-cover" 
                />
              </div>
            )}
            <div className="text-sm leading-relaxed break-words font-sans selection:bg-indigo-500/30 space-y-2">
              {parseMessageSegments(message).map((segment, idx) => {
                if (segment.type === 'code') {
                  return (
                    <CodeBlock 
                      key={idx} 
                      language={segment.language || 'code'} 
                      code={segment.content} 
                    />
                  );
                }
                return (
                  <div key={idx} className="whitespace-pre-wrap">
                    {formatMessage(segment.content)}
                  </div>
                );
              })}
              {isStreaming && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ repeat: Infinity, duration: 0.7, ease: "easeInOut" }}
                  className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 dark:bg-indigo-400 align-middle rounded-xs"
                />
              )}
            </div>
          </div>
          
          {/* Action Toolbar on Assistant Messages (Copy, etc.) */}
          {!isUser && !isStreaming && (
            <div className="flex items-center space-x-2 mt-1 ml-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center space-x-1 py-0.5 px-2 rounded-md text-[11px] font-mono text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title="Copy response to clipboard"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
