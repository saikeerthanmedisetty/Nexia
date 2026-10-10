import { executeMongoOperation } from './mongodb';
import { executeAgent } from './agents';
import { generateFinancialStatement } from './finance';
import { isGoogleConnected } from './google/auth';
import { getSpreadsheetExpenses } from './google/sheets';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getCalendarEvents,
  getISTDateString,
  formatToISTTime,
  calculateFreeTimeAndConflicts,
} from './calendar';

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export interface DossierScheduleItem {
  time: string;
  title: string;
  duration: string;
  type: 'meeting' | 'travel' | 'focus';
  status: 'upcoming' | 'current' | 'done';
  hasConflict?: boolean;
}

export interface DossierPriorityItem {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  dueTime?: string;
}

export interface DossierFinancials {
  weeklyBurn: number;
  monthlyTotal: number;
  recentTxCount: number;
  budgetHealth: 'optimal' | 'moderate' | 'high_burn';
  topCategory: string;
}

export interface DossierQuickAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

export interface ExecutiveDossier {
  date: string;
  timeIST: string;
  greeting: string;
  executiveSummary: string;
  schedule: DossierScheduleItem[];
  topPriorities: DossierPriorityItem[];
  financials: DossierFinancials;
  quickActions: DossierQuickAction[];
}

/**
 * Generate an Executive Briefing Dossier by orchestrating Calendar, Sheets, and Gemini
 */
export async function generateChiefOfStaffBriefing(
  userProfile?: {
    name?: string;
    email?: string;
  },
  options?: {
    targetDate?: 'today' | 'tomorrow' | string;
  }
): Promise<ExecutiveDossier> {
  const userName = userProfile?.name || 'Executive';
  const isDayAfter = options?.targetDate === 'day_after_tomorrow';
  const isTomorrow = !isDayAfter && options?.targetDate === 'tomorrow';

  // 1. Current IST Date & Time Context
  const now = new Date();
  if (isDayAfter) {
    now.setDate(now.getDate() + 2);
  } else if (isTomorrow) {
    now.setDate(now.getDate() + 1);
  }
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  };
  const currentDateStr = new Intl.DateTimeFormat('en-IN', dateOptions).format(now);
  const currentTimeStr = new Intl.DateTimeFormat('en-IN', timeOptions).format(new Date());

  const hourIST = parseInt(
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()),
    10
  );

  const timeGreeting =
    hourIST < 12 ? 'Good morning' : hourIST < 17 ? 'Good afternoon' : 'Good evening';
  const greeting = isDayAfter
    ? `Executive Briefing for Day After Tomorrow, ${userName.split(' ')[0]}`
    : isTomorrow
    ? `Tomorrow's Executive Briefing, ${userName.split(' ')[0]}`
    : `${timeGreeting}, ${userName.split(' ')[0]}`;

  // 2. Fetch Live Financial Burn Rate from Google Sheets (or MongoDB Atlas fallback)
  let weeklyBurn = 0;
  let monthlyTotal = 0;
  let recentTxCount = 0;
  let topCategory = 'Operations';

  try {
    let rawExpenses: any[] = [];
    const googleStatus = await isGoogleConnected();
    if (googleStatus.connected) {
      try {
        const sheetData = await getSpreadsheetExpenses();
        if (sheetData.expenses && sheetData.expenses.length > 0) {
          rawExpenses = sheetData.expenses;
        }
      } catch (sheetErr: any) {
        console.warn('[Chief of Staff] Google Sheets query notice:', sheetErr?.message);
      }
    }

    if (rawExpenses.length === 0) {
      const rawMongo = await executeMongoOperation(async (db) => {
        return db
          .collection('expenses')
          .find({})
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray();
      });
      if (rawMongo && rawMongo.length > 0) {
        rawExpenses = rawMongo;
      }
    }

    if (rawExpenses && rawExpenses.length > 0) {
      const weeklyStatement = generateFinancialStatement(rawExpenses, '1 week', 7);
      const allStatement = generateFinancialStatement(rawExpenses, 'all');

      weeklyBurn = Math.round(weeklyStatement.totalExpense);
      monthlyTotal = Math.round(allStatement.totalExpense);
      topCategory = weeklyStatement.topCategory !== 'None' ? weeklyStatement.topCategory : allStatement.topCategory;
      recentTxCount = allStatement.transactionCount;
    }
  } catch (err: any) {
    console.warn('[Chief of Staff] Expense query notice:', err?.message);
  }

  const budgetHealth: 'optimal' | 'moderate' | 'high_burn' =
    weeklyBurn > 15000 ? 'high_burn' : weeklyBurn > 7000 ? 'moderate' : 'optimal';

  // 3. Fetch Calendar Agenda directly from Calendar Engine
  const targetDateStr = isDayAfter
    ? (() => {
        const dat = new Date();
        dat.setDate(dat.getDate() + 2);
        return getISTDateString(dat);
      })()
    : isTomorrow
    ? (() => {
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        return getISTDateString(tom);
      })()
    : getISTDateString(new Date());

  const calendarRange = isDayAfter ? 'day_after_tomorrow' : (isTomorrow ? 'tomorrow' : 'today');
  let calendarEvents = await getCalendarEvents({ range: calendarRange });
  const timeAudit = calculateFreeTimeAndConflicts(calendarEvents, targetDateStr);

  // Format real schedule items
  let schedule: DossierScheduleItem[] = calendarEvents.map((ev) => ({
    time: formatToISTTime(ev.startTime),
    title: ev.title,
    duration: ev.durationFormatted,
    type: ev.type === 'travel' || ev.type === 'focus' ? ev.type : 'meeting',
    status: isTomorrow ? 'upcoming' : 'upcoming',
    hasConflict: ev.hasConflict,
  }));

  // Real Top Priorities derived strictly from schedule or forward horizon
  const topPriorities: DossierPriorityItem[] = [];

  if (schedule.length > 0) {
    schedule.slice(0, 3).forEach((item, idx) => {
      const isTravel = item.type === 'travel' || /\b(?:train|flight|transit|travel)\b/i.test(item.title);
      topPriorities.push({
        id: `p-${idx + 1}`,
        title: isTravel
          ? `Prepare for departure & journey: ${item.title}`
          : `Prepare and attend: ${item.title}`,
        priority: idx === 0 ? 'high' : 'medium',
        category: isTravel ? 'Travel / Logistics' : 'Calendar',
        dueTime: item.time,
      });
    });
  } else if (!isTomorrow) {
    // If today is clear, look ahead to tomorrow's horizon so user is prepared!
    const tomorrowEvents = await getCalendarEvents({ range: 'tomorrow' });
    if (tomorrowEvents.length > 0) {
      const nextEv = tomorrowEvents[0];
      const isTravel = nextEv.type === 'travel' || /\b(?:train|flight|transit|travel)\b/i.test(nextEv.title);
      topPriorities.push({
        id: 'p-1',
        title: `Upcoming Tomorrow: ${nextEv.title} (${formatToISTTime(nextEv.startTime)})`,
        priority: 'high',
        category: isTravel ? 'Travel Preparation' : 'Next Day Prep',
        dueTime: formatToISTTime(nextEv.startTime),
      });
    }
    topPriorities.push({
      id: `p-${topPriorities.length + 1}`,
      title: 'Review weekly financial budget and optimize burn rate',
      priority: 'medium',
      category: 'Finance',
      dueTime: 'Afternoon',
    });
  } else {
    topPriorities.push({
      id: 'p-1',
      title: 'Strategic planning and open backlog execution',
      priority: 'medium',
      category: 'Focus',
      dueTime: 'Full Day',
    });
  }

  // 5. Synthesize Executive Narrative via Gemini
  const conflictCount = timeAudit.conflicts.length;
  let executiveSummary = schedule.length > 0
    ? `Your schedule for ${isTomorrow ? 'tomorrow' : 'today'} has ${schedule.length} scheduled ${schedule.length === 1 ? 'block' : 'blocks'}: ${schedule[0].title} at ${schedule[0].time}. Weekly burn rate stands at ₹${weeklyBurn.toLocaleString('en-IN')}, and ${conflictCount > 0 ? `${conflictCount} schedule conflict detected` : 'zero calendar conflicts detected'}.`
    : `Your schedule for ${isTomorrow ? 'tomorrow' : 'today'} is clear of scheduled meetings. Weekly burn rate stands at ₹${weeklyBurn.toLocaleString('en-IN')}.`;

  try {
    const prompt = `
You are the Executive Chief of Staff for ${userName}.
Target Period: ${isTomorrow ? 'Tomorrow' : 'Today'} (${currentDateStr}, ${currentTimeStr} IST).
${isTomorrow ? "Tomorrow's" : "Today's"} Schedule: ${JSON.stringify(schedule)}
Financial Status: Weekly burn ₹${weeklyBurn.toLocaleString('en-IN')} (${budgetHealth} health), Monthly total ₹${monthlyTotal.toLocaleString('en-IN')}. Top spend: ${topCategory}.
Top Priorities: ${JSON.stringify(topPriorities)}

TASK:
Synthesize an ultra-crisp, authoritative 2-sentence executive summary for ${isTomorrow ? 'tomorrow' : 'today'}. Focus on schedule readiness, travel preparedness, and financial control. Keep it sharp, confident, and professional (Apple / Linear tier). Do not use fluff or excessive emojis.
STRICT RULE: Currency MUST strictly be formatted in Indian Rupees (₹) with en-IN numbering (e.g. ₹${weeklyBurn.toLocaleString('en-IN')}). NEVER USE DOLLAR SIGNS ($) OR USD.
`;

    for (const modelName of ['gemini-3.5-flash-lite', 'gemini-3.6-flash']) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await Promise.race([
          model.generateContent(prompt),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 8000)),
        ]);

        const text = res.response.text().trim();
        if (text && text.length > 20) {
          executiveSummary = text.replace(/^["']|["']$/g, '').replace(/\$/g, '₹').trim();
          break;
        }
      } catch {
        // try next candidate
      }
    }
  } catch (err: any) {
    console.warn('[Chief of Staff] Gemini narrative synthesis notice:', err?.message);
  }

  // 6. Actionable 1-Click Quick Actions dynamically generated from real schedule
  const quickActions: DossierQuickAction[] = [];
  if (schedule.length > 0) {
    const firstItem = schedule[0];
    const isTravel = firstItem.type === 'travel' || /\b(?:train|flight|transit|travel)\b/i.test(firstItem.title);
    if (isTravel) {
      quickActions.push({
        id: 'qa-1',
        label: `Ride to ${firstItem.title.replace(/^Train to /i, '')}`,
        icon: 'Car',
        prompt: `Get a ride estimate to station for ${firstItem.title}`,
      });
      quickActions.push({
        id: 'qa-2',
        label: 'Buffer time on Schedule',
        icon: 'Calendar',
        prompt: `Schedule a 30-minute departure buffer for ${firstItem.title}`,
      });
    } else {
      quickActions.push({
        id: 'qa-1',
        label: `Buffer for ${firstItem.title}`,
        icon: 'Calendar',
        prompt: `Schedule a 15-minute buffer before "${firstItem.title}"`,
      });
      quickActions.push({
        id: 'qa-2',
        label: `Ride to ${firstItem.title}`,
        icon: 'Car',
        prompt: `Get a ride estimate to ${firstItem.title}`,
      });
    }
    quickActions.push({
      id: 'qa-3',
      label: 'Show Weekly Spending',
      icon: 'FileSpreadsheet',
      prompt: 'Show my spending for this week with category breakdown and invoice history',
    });
  } else {
    quickActions.push(
      {
        id: 'qa-1',
        label: 'Schedule Meeting',
        icon: 'Calendar',
        prompt: 'Schedule an Executive Strategy Review tomorrow at 4:00 PM for 45 minutes',
      },
      {
        id: 'qa-2',
        label: 'Get Ride Estimate',
        icon: 'Car',
        prompt: 'Get a mobility ride estimate to Downtown',
      },
      {
        id: 'qa-3',
        label: 'Show Weekly Spending',
        icon: 'FileSpreadsheet',
        prompt: 'Show my spending for this week with category breakdown and invoice history',
      }
    );
  }

  return {
    date: currentDateStr,
    timeIST: currentTimeStr,
    greeting,
    executiveSummary,
    schedule,
    topPriorities,
    financials: {
      weeklyBurn,
      monthlyTotal,
      recentTxCount,
      budgetHealth,
      topCategory,
    },
    quickActions,
  };
}
