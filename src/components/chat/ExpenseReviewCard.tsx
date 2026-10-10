'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  Calendar,
  DollarSign,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  RefreshCw,
  Info
} from 'lucide-react';

/**
 * Expected payload structure from n8n 202 Webhook response
 */
export interface ExpenseData {
  date: string;
  merchant: string;
  amount: number | string;
  category: string;
  confidence_score: number;
}

export interface ExpenseReviewCardProps {
  initialData: ExpenseData;
  onVerifyAndSave?: (correctedData: ExpenseData) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

// Preset standard categories for quick selection
const PRESET_CATEGORIES = [
  'Meals & Dining',
  'Software & SaaS',
  'Office Supplies',
  'Travel & Logistics',
  'Utilities',
  'Hardware',
  'Professional Services'
];

/**
 * ExpenseReviewCard Component
 * Human-in-the-Loop (HITL) Bento Grid card for reviewing and correcting OCR-extracted expense data.
 */
export const ExpenseReviewCard: React.FC<ExpenseReviewCardProps> = ({
  initialData,
  onVerifyAndSave,
  onCancel,
  className = ''
}) => {
  // Controlled editable form state initialized from the n8n webhook payload
  const [formData, setFormData] = useState<ExpenseData>({
    date: initialData?.date || new Date().toISOString().split('T')[0],
    merchant: initialData?.merchant || '',
    amount: initialData?.amount || '',
    category: initialData?.category || 'Uncategorized',
    confidence_score: initialData?.confidence_score ?? 0
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Confidence threshold check (< 80 triggers warning cues)
  const isLowConfidence = formData.confidence_score < 80;

  const handleInputChange = (field: keyof ExpenseData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleVerifyAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const finalizedPayload: ExpenseData = {
      ...formData,
      amount: Number(formData.amount) || 0
    };

    // Step 3 Requirement: Console log the corrected payload
    console.log('[HITL Review Verified & Saved]:', finalizedPayload);

    try {
      if (onVerifyAndSave) {
        await onVerifyAndSave(finalizedPayload);
      }
      setIsSaved(true);
    } catch (err) {
      console.error('Failed to submit verified expense:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`w-full max-w-2xl mx-auto rounded-3xl bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80 shadow-2xl p-6 text-zinc-100 overflow-hidden relative ${className}`}
    >
      {/* Subtle Background Glow based on Confidence */}
      <div
        className={`absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${
          isLowConfidence ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        }`}
      />

      <form onSubmit={handleVerifyAndSave} className="relative z-10 space-y-6">
        {/* Header Section: Title & Confidence Pill */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shadow-inner">
              <Receipt className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Expense Verification
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                  Review & Confirm
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Verify and adjust details before saving.
              </p>
            </div>
          </div>

          {/* Dynamic Confidence Score Gauge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-medium border transition-colors ${
              isLowConfidence
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {isLowConfidence ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Confidence: {formData.confidence_score}%</span>
          </div>
        </div>

        {/* Low Confidence Advisory Banner */}
        <AnimatePresence>
          {isLowConfidence && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3 text-amber-200/90 text-xs leading-relaxed"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Caution Required:</span> Scanned
                receipt details scored below the 80% automated threshold. Fields highlighted in amber
                require careful validation against your physical receipt.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* Bento Cell 1: Merchant Name (Span 7) */}
          <div
            className={`md:col-span-7 p-4 rounded-2xl bg-zinc-900/50 border transition-all duration-200 ${
              isLowConfidence
                ? 'border-amber-500/40 bg-amber-500/[0.02] shadow-[0_0_15px_-3px_rgba(245,158,11,0.08)]'
                : 'border-zinc-800/80 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                Merchant / Vendor
              </label>
              {isLowConfidence && (
                <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                  <Info className="w-2.5 h-2.5" /> Check spelling
                </span>
              )}
            </div>
            <input
              type="text"
              value={formData.merchant}
              onChange={(e) => handleInputChange('merchant', e.target.value)}
              placeholder="e.g. Starbucks, Uber, AWS"
              required
              className={`w-full bg-zinc-950/60 border rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors ${
                isLowConfidence
                  ? 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                  : 'border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              }`}
            />
          </div>

          {/* Bento Cell 2: Date (Span 5) */}
          <div
            className={`md:col-span-5 p-4 rounded-2xl bg-zinc-900/50 border transition-all duration-200 ${
              isLowConfidence
                ? 'border-amber-500/40 bg-amber-500/[0.02]'
                : 'border-zinc-800/80 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                Receipt Date
              </label>
            </div>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
              required
              className={`w-full bg-zinc-950/60 border rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors ${
                isLowConfidence
                  ? 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                  : 'border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              }`}
            />
          </div>

          {/* Bento Cell 3: Amount (Span 5) */}
          <div
            className={`md:col-span-5 p-4 rounded-2xl bg-zinc-900/50 border transition-all duration-200 ${
              isLowConfidence
                ? 'border-amber-500/40 bg-amber-500/[0.02]'
                : 'border-zinc-800/80 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                Total Amount
              </label>
              {isLowConfidence && (
                <span className="text-[10px] text-amber-400 font-mono">Verify currency</span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                required
                className={`w-full bg-zinc-950/60 border rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors ${
                  isLowConfidence
                    ? 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                    : 'border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                }`}
              />
            </div>
          </div>

          {/* Bento Cell 4: Category & Quick Select (Span 7) */}
          <div
            className={`md:col-span-7 p-4 rounded-2xl bg-zinc-900/50 border transition-all duration-200 flex flex-col justify-between ${
              isLowConfidence
                ? 'border-amber-500/40 bg-amber-500/[0.02]'
                : 'border-zinc-800/80 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-medium tracking-wide uppercase text-zinc-400 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-400" />
                  Expense Category
                </label>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" /> Suggested
                </span>
              </div>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                placeholder="Select or enter category..."
                required
                className={`w-full bg-zinc-950/60 border rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors mb-2.5 ${
                  isLowConfidence
                    ? 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                    : 'border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                }`}
              />
            </div>

            {/* Quick Preset Badges */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CATEGORIES.map((cat) => {
                const isSelected = formData.category.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleInputChange('category', cat)}
                    className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 font-medium'
                        : 'bg-zinc-800/50 border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Controls Section */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/60">
          <button
            type="button"
            onClick={() => {
              if (onCancel) onCancel();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            Cancel / Discard
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isSubmitting || isSaved}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition-all ${
                isSaved
                  ? 'bg-emerald-600 text-white shadow-emerald-900/30 cursor-default'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-indigo-500/20'
              } disabled:opacity-60`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Verified & Saved</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify & Save</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </>
              )}
            </motion.button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default ExpenseReviewCard;
