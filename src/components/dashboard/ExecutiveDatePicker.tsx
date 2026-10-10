'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExecutiveDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
  eventDates?: string[]; // array of YYYY-MM-DD that have scheduled events
  align?: 'left' | 'right';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function ExecutiveDatePicker({
  isOpen,
  onClose,
  selectedDate,
  onSelectDate,
  eventDates = [],
  align = 'right'
}: ExecutiveDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial year/month from selectedDate (YYYY-MM-DD)
  const initialDate = useMemo(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState<number>(() => initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => initialDate.getMonth());

  // Keep view in sync if selectedDate changes externally
  useEffect(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const [y, m] = selectedDate.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [selectedDate]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleTodayClick = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onSelectDate(todayStr);
    onClose();
  };

  const handleTomorrowClick = () => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const y = tom.getFullYear();
    const m = String(tom.getMonth() + 1).padStart(2, '0');
    const d = String(tom.getDate()).padStart(2, '0');
    const tomStr = `${y}-${m}-${d}`;
    setViewYear(tom.getFullYear());
    setViewMonth(tom.getMonth());
    onSelectDate(tomStr);
    onClose();
  };

  // Today string for comparison
  const todayStr = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Event dates lookup set
  const eventDateSet = useMemo(() => new Set(eventDates), [eventDates]);

  // Compute days in grid
  const daysInGrid = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      hasEvents: boolean;
    }> = [];

    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDateSet.has(dateStr),
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDateSet.has(dateStr),
      });
    }

    // Leading days from next month to complete 35 or 42 cells
    const remainingSlots = (cells.length <= 35 ? 35 : 42) - cells.length;
    for (let d = 1; d <= remainingSlots; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDateSet.has(dateStr),
      });
    }

    return cells;
  }, [viewYear, viewMonth, selectedDate, todayStr, eventDateSet]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.95, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -6 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={cn(
          "absolute top-full mt-2 z-50 w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#0C101A] border border-slate-200 dark:border-white/10 shadow-2xl dark:shadow-black/70 p-4 font-sans select-none",
          align === 'right' ? 'right-0' : 'left-0'
        )}
      >
        {/* ── Header: Month & Year Navigator ── */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center space-x-1.5">
            <CalendarIcon size={14} className="text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ── Quick Jump Shortcuts ── */}
        <div className="flex items-center gap-1.5 py-2.5">
          <button
            type="button"
            onClick={handleTodayClick}
            className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 text-[11px] font-mono text-slate-700 dark:text-zinc-300 font-medium transition-all text-center cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleTomorrowClick}
            className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 text-[11px] font-mono text-slate-700 dark:text-zinc-300 font-medium transition-all text-center cursor-pointer"
          >
            Tomorrow
          </button>
        </div>

        {/* ── Weekday Labels ── */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAY_NAMES.map((name) => (
            <div
              key={name}
              className="text-[11px] font-mono font-semibold text-slate-400 dark:text-zinc-500 py-1"
            >
              {name}
            </div>
          ))}
        </div>

        {/* ── Days Grid ── */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {daysInGrid.map((cell, idx) => {
            return (
              <button
                key={`${cell.dateStr}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectDate(cell.dateStr);
                  onClose();
                }}
                className={cn(
                  "relative h-8 sm:h-8.5 w-full rounded-xl text-xs font-mono font-medium flex flex-col items-center justify-center transition-all cursor-pointer",
                  // Selected Day
                  cell.isSelected
                    ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30 scale-105 z-10"
                    // Today (non-selected)
                    : cell.isToday
                    ? "text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                    // Current Month Day
                    : cell.isCurrentMonth
                    ? "text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                    // Overflow/Adjacent Month Day
                    : "text-slate-300 dark:text-zinc-600 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-500 dark:hover:text-zinc-400"
                )}
              >
                <span>{cell.dayNumber}</span>
                {/* Event Dot Indicator */}
                {cell.hasEvents && (
                  <span
                    className={cn(
                      "absolute bottom-1 w-1 h-1 rounded-full",
                      cell.isSelected ? "bg-white" : "bg-emerald-500 dark:bg-emerald-400"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Footer / Currently Selected Info ── */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 dark:border-white/5 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
          <div className="flex items-center space-x-1.5 truncate max-w-[190px]">
            <Check size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">{selectedDate || 'No date selected'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-mono text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/5"
          >
            Done
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
