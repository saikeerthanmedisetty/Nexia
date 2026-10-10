/**
 * Executive Financial Statement Engine
 * Comprehensive multi-timeframe parser and ledger calculator for Nexia.
 * Strictly localized in Indian Rupees (₹) with en-IN formatting.
 */

export interface TransactionItem {
  id?: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  type: 'debit' | 'credit';
  description?: string;
  receiptUrl?: string;
  rawTimestamp: number;
}

export interface CategoryShare {
  category: string;
  amount: number;
  percentage: number;
}

export interface FinancialStatement {
  timeframeKey: string;
  timeframeLabel: string;
  startDateStr: string;
  endDateStr: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
  transactions: TransactionItem[];
  categoryBreakdown: CategoryShare[];
  topCategory: string;
  highestTransaction: TransactionItem | null;
  lastActiveTransaction: TransactionItem | null;
  markdown: string;
}

/**
 * Format currency strictly in Indian Rupees (₹) with en-IN numbering
 */
export function formatINR(val: number): string {
  const num = Math.abs(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse natural language timeframes or parameters into a millisecond timestamp window in IST
 */
export function resolveTimeframeWindow(timeframeInput?: string, explicitDays?: number): {
  startTime: number;
  endTime: number;
  key: string;
  label: string;
} {
  const now = new Date();
  
  // IST Date String formatter
  const istDate = (d: Date) =>
    d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

  const raw = (timeframeInput || '').toLowerCase().replace(/_/g, ' ').trim();
  const endTime = now.getTime();

  // 0. SPECIFIC CALENDAR DATE (e.g. "2026-09-11", "11/09/2026", "11th September", "September 11", "July 16")
  const isoMatch = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const start = new Date(y, m, d, 0, 0, 0, 0);
    const end = new Date(y, m, d, 23, 59, 59, 999);
    return {
      startTime: start.getTime(),
      endTime: end.getTime(),
      key: `date_${isoMatch[0]}`,
      label: `Date: ${istDate(start)}`,
    };
  }

  const dmyMatch = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const start = new Date(y, m, d, 0, 0, 0, 0);
    const end = new Date(y, m, d, 23, 59, 59, 999);
    return {
      startTime: start.getTime(),
      endTime: end.getTime(),
      key: `date_${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      label: `Date: ${istDate(start)}`,
    };
  }

  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };
  const monthRegex = /(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+(\d{4}))?/i;
  const namedMatch = raw.match(monthRegex);
  if (namedMatch && (namedMatch[1] || namedMatch[3])) {
    const day = parseInt(namedMatch[1] || namedMatch[3] || '1', 10);
    const mStr = namedMatch[2].toLowerCase();
    const monthIdx = monthMap[mStr] !== undefined ? monthMap[mStr] : 8;
    const year = namedMatch[4] ? parseInt(namedMatch[4], 10) : now.getFullYear();

    const start = new Date(year, monthIdx, day, 0, 0, 0, 0);
    const end = new Date(year, monthIdx, day, 23, 59, 59, 999);
    return {
      startTime: start.getTime(),
      endTime: end.getTime(),
      key: `date_${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: `Date: ${istDate(start)}`,
    };
  }

  // 1. TODAY
  if (raw.includes('today')) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return {
      startTime: startOfToday.getTime(),
      endTime,
      key: 'today',
      label: `Today (${istDate(now)})`,
    };
  }

  // 2. YESTERDAY
  if (raw.includes('yesterday')) {
    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(startOfYesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    return {
      startTime: startOfYesterday.getTime(),
      endTime: endOfYesterday.getTime(),
      key: 'yesterday',
      label: `Yesterday (${istDate(startOfYesterday)})`,
    };
  }

  // 3. EXPLICIT DAYS (e.g., 2 days, 3 days, 5 days)
  const dayMatch = raw.match(/(\d+)\s*(?:day|days)/);
  const days = explicitDays || (dayMatch ? parseInt(dayMatch[1], 10) : null);

  if (days && days > 0) {
    const startObj = new Date(now);
    startObj.setDate(startObj.getDate() - days);
    startObj.setHours(0, 0, 0, 0);
    const startTime = startObj.getTime();
    return {
      startTime,
      endTime,
      key: `${days}_days`,
      label: `Past ${days} Days (${istDate(startObj)} – ${istDate(now)})`,
    };
  }

  // 4. THIS WEEK / 1 WEEK / 7 DAYS
  if (raw.includes('week') || raw.includes('7 day') || raw.includes('weekly')) {
    const startObj = new Date(now);
    startObj.setDate(startObj.getDate() - 7);
    startObj.setHours(0, 0, 0, 0);
    const startTime = startObj.getTime();
    return {
      startTime,
      endTime,
      key: '1_week',
      label: `Past 7 Days (${istDate(startObj)} – ${istDate(now)})`,
    };
  }

  // 5. THIS MONTH / 1 MONTH / 30 DAYS
  if (raw.includes('month') || raw.includes('30 day') || raw.includes('monthly')) {
    const startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const startObj = new Date(startTime);
    return {
      startTime,
      endTime,
      key: '1_month',
      label: `Past 30 Days (${istDate(startObj)} – ${istDate(now)})`,
    };
  }

  // 6. ALL / LIFETIME / DEFAULT LEDGER
  if (raw.includes('all') || raw.includes('entire') || raw.includes('total') || raw.includes('lifetime') || raw.includes('history')) {
    return {
      startTime: 0,
      endTime,
      key: 'all',
      label: `Complete Lifetime Ledger (Up to ${istDate(now)})`,
    };
  }

  // Default to Lifetime Ledger if ambiguous or querying general expenses
  return {
    startTime: 0,
    endTime,
    key: 'all',
    label: `Recent Ledger Overview (${istDate(now)})`,
  };
}

/**
 * Normalizes raw records from MongoDB / Google Sheets into standardized TransactionItems
 */
export function normalizeRawExpenses(rawList: any[]): TransactionItem[] {
  if (!Array.isArray(rawList)) return [];

  const items: TransactionItem[] = [];
  const seenIds = new Set<string>();
  const seenMap = new Map<string, TransactionItem>();

  for (const item of rawList) {
    if (!item) continue;
    const rawAmt = item.amount !== undefined ? item.amount : item.Amount !== undefined ? item.Amount : item.price;
    const cleanAmt = parseFloat(String(rawAmt || '0').replace(/[^0-9.-]+/g, ''));
    if (isNaN(cleanAmt) || cleanAmt === 0) continue;

    const dateStr = item.date || item.Date || item.createdAt || new Date().toISOString();
    const rawTimestamp = new Date(dateStr).getTime() || Date.now();
    const cleanDate = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr).slice(0, 10);

    const category = String(item.category || item.Category || 'General Expense').trim();
    const merchant = String(item.merchant || item.Merchant || item.title || 'Direct Entry').trim();
    const desc = String(item.description || item.Description || '').trim();

    // 1. Explicit ID check (MongoDB ObjectId or unique ID)
    const itemId = item._id ? String(item._id) : item.id ? String(item.id) : undefined;
    if (itemId && seenIds.has(itemId)) {
      continue;
    }

    // 2. Cross-source signature check (for records synchronized between Google Sheets and MongoDB)
    const normalizedMerchant = merchant.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sig = `${cleanDate}::${normalizedMerchant}::${Math.abs(cleanAmt).toFixed(2)}`;

    if (seenMap.has(sig)) {
      const existing = seenMap.get(sig)!;
      // Enrich existing record with Mongo ID or receipt URL if missing
      if (!existing.id && itemId) existing.id = itemId;
      if (!existing.receiptUrl && (item.receiptUrl || item.receipt_url)) {
        existing.receiptUrl = item.receiptUrl || item.receipt_url;
      }
      if (!existing.description && desc) {
        existing.description = desc;
      }
      continue;
    }

    if (itemId) seenIds.add(itemId);

    // Classify type: credit (income/refund) vs debit (expense)
    const isCredit = 
      cleanAmt < 0 || 
      /income|salary|credit|deposit|refund|dividend/i.test(category) ||
      /income|salary|credit|deposit|refund/i.test(desc) ||
      /received|deposited/i.test(merchant);

    const txItem: TransactionItem = {
      id: itemId,
      date: cleanDate,
      merchant,
      category,
      amount: Math.abs(cleanAmt),
      type: isCredit ? ('credit' as const) : ('debit' as const),
      description: desc,
      receiptUrl: item.receiptUrl || item.receipt_url,
      rawTimestamp,
    };

    seenMap.set(sig, txItem);
    items.push(txItem);
  }

  return items.sort((a, b) => b.rawTimestamp - a.rawTimestamp);
}

/**
 * Computes the full financial statement for the requested timeframe
 */
export function generateFinancialStatement(
  rawExpenses: any[],
  timeframeInput?: string,
  explicitDays?: number
): FinancialStatement {
  const allNormalized = normalizeRawExpenses(rawExpenses);
  const window = resolveTimeframeWindow(timeframeInput, explicitDays);

  // Filter transactions falling strictly within the requested timeframe
  const filtered = allNormalized.filter((t) => {
    if (window.startTime === 0) return true;
    return t.rawTimestamp >= window.startTime && t.rawTimestamp <= window.endTime;
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const categories: Record<string, number> = {};
  let highestTransaction: TransactionItem | null = null;

  for (const t of filtered) {
    if (t.type === 'credit') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
      categories[t.category] = (categories[t.category] || 0) + t.amount;
      if (!highestTransaction || t.amount > highestTransaction.amount) {
        highestTransaction = t;
      }
    }
  }

  const netCashFlow = totalIncome - totalExpense;

  // Category shares
  const categoryBreakdown: CategoryShare[] = Object.entries(categories)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : 'None';
  const lastActiveTransaction = allNormalized.length > 0 ? allNormalized[0] : null;

  const istFormat = (ts: number) =>
    new Date(ts).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

  const startDateStr = window.startTime > 0 ? istFormat(window.startTime) : 'Genesis';
  const endDateStr = istFormat(window.endTime);

  // Build Markdown Statement
  const markdown = renderStatementMarkdown({
    timeframeLabel: window.label,
    totalIncome,
    totalExpense,
    netCashFlow,
    transactionCount: filtered.length,
    transactions: filtered,
    categoryBreakdown,
    topCategory,
    lastActiveTransaction,
  });

  return {
    timeframeKey: window.key,
    timeframeLabel: window.label,
    startDateStr,
    endDateStr,
    totalIncome,
    totalExpense,
    netCashFlow,
    transactionCount: filtered.length,
    transactions: filtered,
    categoryBreakdown,
    topCategory,
    highestTransaction,
    lastActiveTransaction,
    markdown,
  };
}

/**
 * Generates an executive Markdown statement table
 */
function renderStatementMarkdown(params: {
  timeframeLabel: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
  transactions: TransactionItem[];
  categoryBreakdown: CategoryShare[];
  topCategory: string;
  lastActiveTransaction: TransactionItem | null;
}): string {
  const {
    timeframeLabel,
    totalIncome,
    totalExpense,
    netCashFlow,
    transactionCount,
    transactions,
    categoryBreakdown,
    lastActiveTransaction,
  } = params;

  const cashFlowSign = netCashFlow >= 0 ? '+' : '-';
  const netBadge = netCashFlow >= 0 ? '🟢 Positive Cash Flow' : '🔴 Net Expenditure';

  // 1. Header & Summary Section
  let md = `### 📑 **Executive Financial Statement**\n`;
  md += `**📅 Period:** ${timeframeLabel}\n\n`;
  md += `---\n\n`;
  md += `#### 💰 **Cash Flow & Balance Impact**\n`;
  md += `- 🟢 **Total Income / Credits:** \`${formatINR(totalIncome)}\`\n`;
  md += `- 🔴 **Total Expenditure / Debits:** \`${formatINR(totalExpense)}\`\n`;
  md += `- ⚖️ **Net Cash Flow:** \`${cashFlowSign}${formatINR(netCashFlow)}\` (${netBadge})\n`;
  md += `- 📊 **Transaction Volume:** \`${transactionCount} record${transactionCount === 1 ? '' : 's'}\`\n\n`;

  // 2. Case: Zero Transactions in this window
  if (transactionCount === 0) {
    md += `> [!NOTE]\n`;
    md += `> **Zero transactions recorded for this period.**\n`;
    md += `> No expenses or income entries exist within **${timeframeLabel}**.\n\n`;

    if (lastActiveTransaction) {
      md += `ℹ️ **Last Active Transaction in Ledger:** \`${lastActiveTransaction.date}\` • **${lastActiveTransaction.merchant}** (\`${formatINR(lastActiveTransaction.amount)}\` - ${lastActiveTransaction.category})\n`;
    }
    return md;
  }

  // 3. Category Breakdown (if expenses exist)
  if (categoryBreakdown.length > 0) {
    md += `---\n\n`;
    md += `#### 🏷️ **Spend Distribution by Category**\n\n`;
    md += `| Category | Total Spend | Share |\n`;
    md += `| :--- | :--- | :--- |\n`;
    categoryBreakdown.forEach((c) => {
      md += `| **${c.category}** | ${formatINR(c.amount)} | \`${c.percentage}%\` |\n`;
    });
    md += `\n`;
  }

  // 4. Itemized Invoices & Ledger Records
  md += `---\n\n`;
  md += `#### 📋 **Itemized Invoices & Ledger Records**\n\n`;
  md += `| Date | Merchant | Category | Type | Amount |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  transactions.slice(0, 25).forEach((t) => {
    const typeLabel = t.type === 'credit' ? '🟢 Credit' : '🔴 Debit';
    md += `| ${t.date} | **${t.merchant}** | ${t.category} | ${typeLabel} | **${formatINR(t.amount)}** |\n`;
  });

  if (transactions.length > 25) {
    md += `\n*Showing top 25 of ${transactions.length} entries for this timeframe.*`;
  }

  return md;
}
