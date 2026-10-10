export { cn } from "cn";

/**
 * Helper to format ISO to IST Time string (e.g. "03:00 PM")
 */
export function formatToISTTime(isoString: string): string {
  try {
    if (!isoString) return '10:00 AM';
    // If already in friendly format like "10:00 AM" or "3:00 PM", return normalized
    if (/^\d{1,2}:\d{2}\s*(?:am|pm)$/i.test(isoString.trim())) {
      return isoString.trim().toUpperCase();
    }
    // If 24h format like "14:30" or "10:00", convert to 12h format
    if (/^\d{1,2}:\d{2}$/.test(isoString.trim())) {
      const [hStr, mStr] = isoString.trim().split(':');
      let h = parseInt(hStr, 10);
      const mer = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return `${h}:${mStr} ${mer}`;
    }

    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/**
 * Helper to get YYYY-MM-DD in IST
 */
export function getISTDateString(date: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

/**
 * Format ISO date string (YYYY-MM-DD) into executive friendly string (e.g. "Tue, Sep 22, 2026")
 */
export function formatDateDisplay(dStr?: string): string {
  if (!dStr) return 'Today';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      const [y, m, d] = dStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {}
  return dStr;
}

/**
 * Cleanly format user name for executive greetings and UI pills
 * Never displays raw email prefixes with numbers (e.g. saikeerthanmedisetty686)
 */
export function formatUserName(displayName?: string | null, email?: string | null): string {
  const combined = `${displayName || ''} ${email || ''}`.toLowerCase();
  if (combined.includes('saikeerthan') || combined.includes('sai keerthan') || combined.includes('medisetty')) {
    return 'Sai Keerthan';
  }
  // If displayName is clean and human (no digits, no @, not User/Executive)
  if (displayName && !displayName.includes('@') && !/[0-9]{2,}/.test(displayName) && displayName !== 'User' && displayName !== 'Executive') {
    return displayName.trim();
  }
  if (email && email.includes('@')) {
    const raw = email.split('@')[0];
    const cleaned = raw.replace(/[0-9._-]+/g, ' ').trim();
    if (cleaned.length > 2) {
      return cleaned
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }
  return 'Sai Keerthan';
}

/**
 * Resolves natural language date, weekday, or relative day into structured IST date
 */
export function resolveTargetDate(text: string, refDate: Date = new Date()): { dateStr: string; label: string } {
  const lower = (text || '').toLowerCase().trim();
  const WEEKDAYS: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  // 1. Check relative terms
  if (lower.includes('day after tomorrow') || lower.includes('day after tommorow')) {
    const dat = new Date(refDate);
    dat.setDate(dat.getDate() + 2);
    return { dateStr: getISTDateString(dat), label: 'Day after tomorrow' };
  }
  if (lower.includes('tomorrow') || lower.includes('tommorow')) {
    const tom = new Date(refDate);
    tom.setDate(tom.getDate() + 1);
    return { dateStr: getISTDateString(tom), label: 'Tomorrow' };
  }
  if (lower.includes('today') || lower.includes('tonight')) {
    return { dateStr: getISTDateString(refDate), label: 'Today' };
  }

  // 2. Check weekday names (e.g. "Friday", "this Friday", "next Friday")
  for (const [dayName, targetDayIndex] of Object.entries(WEEKDAYS)) {
    const dayRegex = new RegExp(`\\b(?:this\\s+|next\\s+|coming\\s+)?${dayName}\\b`, 'i');
    if (dayRegex.test(lower)) {
      const currentDayIndex = refDate.getDay(); // 0-6
      let diff = (targetDayIndex - currentDayIndex + 7) % 7;
      if (diff === 0) {
        diff = lower.includes(`next ${dayName}`) ? 7 : 0;
      } else if (lower.includes('week after') || lower.includes('of next week') || lower.includes('following week')) {
        diff += 7;
      }
      const target = new Date(refDate);
      target.setDate(target.getDate() + diff);
      const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return { 
        dateStr: getISTDateString(target), 
        label: diff === 1 ? `Tomorrow (${dayCapitalized})` : (diff === 0 ? `Today (${dayCapitalized})` : dayCapitalized)
      };
    }
  }

  // 3. Check ISO date YYYY-MM-DD
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { dateStr, label: dateStr };
  }

  // 4. Check named month (e.g. "18th September", "Sep 18")
  const monthMap: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };
  const namedMatch = lower.match(/(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+(\d{4}))?/i);
  if (namedMatch && (namedMatch[1] || namedMatch[3])) {
    const d = parseInt(namedMatch[1] || namedMatch[3] || '1', 10);
    const mStr = namedMatch[2].toLowerCase();
    const m = monthMap[mStr] !== undefined ? monthMap[mStr] : 8;
    const y = namedMatch[4] ? parseInt(namedMatch[4], 10) : refDate.getFullYear();
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { dateStr, label: dateStr };
  }

  // Default to today
  return { dateStr: getISTDateString(refDate), label: 'Today' };
}

/**
 * Robustly extract meeting or focus block duration from natural language prompts
 * Covers spelled-out numbers, decimal hours, compound hours+mins, hyphens, and colloquialisms.
 */
export function parseEventDuration(text: string): { duration: string; durationMinutes: number } | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // 0. Explicit Time-Range Duration (e.g. "from 1:00 PM to 2:00 PM", "1:00 PM - 2:00 PM", "between 10 AM and 11:30 AM", "1-2 PM", "1 to 2 PM")
  const rangeMatch = lower.match(/(?:from|between)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|until|till|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (rangeMatch) {
    let startH = parseInt(rangeMatch[1], 10);
    const startM = parseInt(rangeMatch[2] || '0', 10);
    let startMer = rangeMatch[3]?.toLowerCase();

    let endH = parseInt(rangeMatch[4], 10);
    const endM = parseInt(rangeMatch[5] || '0', 10);
    const endMer = rangeMatch[6]?.toLowerCase();

    // If start meridian is missing, infer it (e.g. "1 to 2 PM" -> start is 1 PM, "10 to 11:30 AM" -> start is 10 AM)
    if (!startMer) {
      if (endMer === 'pm' && startH <= endH && startH >= 1 && startH < 12) {
        startMer = 'pm';
      } else if (endMer === 'pm' && startH > endH && startH >= 8 && startH <= 11) {
        startMer = 'am'; // e.g. "11 to 1 PM"
      } else {
        startMer = endMer;
      }
    }

    if (startMer === 'pm' && startH < 12) startH += 12;
    if (startMer === 'am' && startH === 12) startH = 0;

    let endHour = endH;
    if (endMer === 'pm' && endHour < 12) endHour += 12;
    if (endMer === 'am' && endHour === 12) endHour = 0;

    const startTotalMins = startH * 60 + startM;
    let endTotalMins = endHour * 60 + endM;
    if (endTotalMins < startTotalMins) {
      endTotalMins += 24 * 60; // Crosses midnight
    }

    const diffMins = endTotalMins - startTotalMins;
    if (diffMins > 0 && diffMins <= 12 * 60) {
      const hours = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      let durationStr = '';
      if (hours > 0 && remainingMins > 0) {
        durationStr = `${hours}h ${remainingMins}m`;
      } else if (hours > 0) {
        durationStr = hours === 1 ? '1 hour' : `${hours} hours`;
      } else {
        durationStr = `${remainingMins} mins`;
      }
      return { duration: durationStr, durationMinutes: diffMins };
    }
  }

  // 1. Spelled-out and colloquial hour & half-hour durations
  if (/\b(?:half\s*(?:an\s*)?hour|half-hour)\b/i.test(lower)) {
    return { duration: '30 mins', durationMinutes: 30 };
  }
  if (/\b(?:an\s*hour\s*and\s*a\s*half|one\s*and\s*a\s*half\s*hours?)\b/i.test(lower)) {
    return { duration: '1.5 hours', durationMinutes: 90 };
  }
  if (/\b(?:two\s*and\s*a\s*half\s*hours?)\b/i.test(lower)) {
    return { duration: '2.5 hours', durationMinutes: 150 };
  }
  if (/\b(?:an\s*hour|one\s*hour|1\s*hour)\b/i.test(lower) && !/\b\d+\s*hours?\b/i.test(lower)) {
    return { duration: '1 hour', durationMinutes: 60 };
  }
  if (/\btwo\s*hours?\b/i.test(lower)) {
    return { duration: '2 hours', durationMinutes: 120 };
  }
  if (/\bthree\s*hours?\b/i.test(lower)) {
    return { duration: '3 hours', durationMinutes: 180 };
  }
  if (/\bfour\s*hours?\b/i.test(lower)) {
    return { duration: '4 hours', durationMinutes: 240 };
  }
  if (/\bfive\s*hours?\b/i.test(lower)) {
    return { duration: '5 hours', durationMinutes: 300 };
  }
  if (/\bsix\s*hours?\b/i.test(lower)) {
    return { duration: '6 hours', durationMinutes: 360 };
  }

  // 2. Compound expressions: "1 hour 30 mins", "2 hours 15 mins", "1h 30m"
  const compoundMatch = lower.match(/\b(\d+)\s*[-]?\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+)\s*[-]?\s*(?:minutes?|mins?|m)\b/i);
  if (compoundMatch) {
    const hours = parseInt(compoundMatch[1], 10);
    const mins = parseInt(compoundMatch[2], 10);
    const totalMinutes = hours * 60 + mins;
    return { duration: `${hours} hr ${mins} mins`, durationMinutes: totalMinutes };
  }

  // 3. Numeric hours: "3-hour", "3 hours", "1.5 hours", "2.5h", "3hrs", "3h"
  const hourMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*[-]?\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    const minutes = Math.round(hours * 60);
    const durationStr = hours === 1 ? '1 hour' : `${hours} hours`;
    return { duration: durationStr, durationMinutes: minutes };
  }

  // 4. Numeric minutes: "45-minute", "45 mins", "90 minutes", "30m"
  const minMatch = lower.match(/\b(\d+)\s*[-]?\s*(?:minutes?|mins?|m)\b/i);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    return { duration: `${minutes} mins`, durationMinutes: minutes };
  }

  // 5. Spelled-out minute intervals
  if (/\bfifteen\s*mins?(?:utes?)?\b/i.test(lower)) {
    return { duration: '15 mins', durationMinutes: 15 };
  }
  if (/\bthirty\s*mins?(?:utes?)?\b/i.test(lower)) {
    return { duration: '30 mins', durationMinutes: 30 };
  }
  if (/\bforty[- ]?five\s*mins?(?:utes?)?\b/i.test(lower)) {
    return { duration: '45 mins', durationMinutes: 45 };
  }
  if (/\bninety\s*mins?(?:utes?)?\b/i.test(lower)) {
    return { duration: '90 mins', durationMinutes: 90 };
  }

  return null;
}

/**
 * Universal meeting description & agenda extractor
 * Extracts rich agendas, notes, or descriptions passed via natural language
 */
export function parseEventDescription(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/\b(?:with\s+(?:the\s+)?)?(?:description|agenda|notes?|details?)\s*[:\-]\s*([\s\S]+)$/i);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Universal, intelligent event title extractor
 * Extracts the intended meeting/event title from complex executive prompts
 */
export function parseEventTitle(text: string): string {
  if (!text) return 'Executive Strategy Session';
  
  // 0. Disentangle description/agenda/notes clause before extracting title
  let trimmed = text.trim();
  trimmed = trimmed.replace(/\b(?:with\s+(?:the\s+)?)?(?:description|agenda|notes?|details?)\s*[:\-]\s*[\s\S]+$/i, '').trim();

  // 1. Quoted title (e.g. Book it as 'Deep Work: System Optimization' or named "Team Sync")
  const quotedMatch = trimmed.match(/(?:book(?:\s+it)?\s+as|titled|named|called|as|subject)\s+['"“]([^'"”]+)['"”]/i);
  if (quotedMatch && quotedMatch[1].trim().length >= 2) {
    return quotedMatch[1].trim();
  }

  // Any explicit quotes in text
  const anyQuote = trimmed.match(/['"“]([^'"”]+)['"”]/);
  if (anyQuote && anyQuote[1].trim().length >= 3 && !/^(?:am|pm|today|tomorrow)$/i.test(anyQuote[1])) {
    return anyQuote[1].trim();
  }

  // 2. Explicit keyword pattern without quotes (e.g. Book it as Deep Work: System Optimization)
  const explicitMatch = trimmed.match(/(?:book(?:\s+it)?\s+as|titled|named|called)\s+([A-Za-z0-9][a-zA-Z0-9\s:_-]+?)(?:\s+(?:on|at|for|tomorrow|today|next|this|with)\b|[,\.\?!]|$)/i);
  if (explicitMatch && explicitMatch[1].trim().length >= 3) {
    const raw = explicitMatch[1].trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // 3. 1:1 or Sync with Person (e.g. 1:1 with Alex, sync with Sarah, coffee chat with Alex)
  const syncMatch = trimmed.match(/\b((?:1:1|1-on-1|sync|meeting|call|discussion|catchup|coffee\s+chat|coffee)\s+with\s+[a-zA-Z0-9\s]+?)(?:\s+(?:on|at|for|day\s+after\s+tomorrow|day\s+after|tomorrow|today|next|this|sometime)\b|[,\.\?!]|$)/i);
  if (syncMatch && syncMatch[1].trim().length >= 4) {
    const raw = syncMatch[1].trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // 4. Default fallback: Clean out command wrappers, temporal tokens, and duration tokens
  let cleaned = trimmed
    .replace(/^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:scan\s+my\s+schedule\s+for\s+[^,\.]+?\s+and\s+)?(?:find\s+(?:me\s+)?(?:a\s+)?(?:continuous\s+)?(?:open\s+)?\d+[- ]?(?:hour|hr|min|minute)?s?\s*(?:block|slot|window)?(?:\s+of\s+free\s+time)?\.?\s*)?/i, '')
    .replace(/^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:schedule|book|create|set(?:\s*up)?|add|block|put|reserve|stage|hold|pencil(?:\s*in)?|slot(?:\s*in)?|fit(?:\s*in)?|lock(?:\s*in)?|arrange|plan|organize)\s+(?:an?|the|a\s+new|quick)?\s*/i, '')
    .replace(/\b(?:at|in)\s+(?:conference\s+room|meeting\s+room|board\s*room|hall|office|cabin|wework|starbucks|hq|auditorium|terrace|campus)[a-zA-Z0-9\s]*/gi, ' ')
    .replace(/\b(?:on|for)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, ' ')
    .replace(/\b(?:this|next|coming)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ' ')
    .replace(/\b(?:on|in|via)?\s*(?:google\s+calendar|calendar|google\s+meet|zoom)\b/gi, ' ')
    .replace(/\bfor\s+\d+\s*(?:mins?|minutes?|hours?|hrs?|m|h)\b/gi, ' ')
    .replace(/\b(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b(?:day\s+after\s+tomorrow|day\s+after\s+tommorow|day\s+after|tomorrow|tommorow|today|tonight)\b/gi, ' ')
    .replace(/\b(?:in\s+local\s+timezone|local\s+timezone|sometime|before\s+noon|after\s+noon|morning|afternoon|evening|night)\b/gi, ' ')
    .replace(/\b(?:gmt|utc|bst|cet|cest|est|edt|cst|cdt|mst|mdt|pst|pdt|jst|kst|sgt|hkt|aest|aedt|nzst|ist)\b/gi, ' ')
    .replace(/^(?:\d+|one|two|three|four|five|six)[- ]?(?:hours?|hrs?|mins?|minutes?)\s*(?:on\s+[a-z]+)?\s*for\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/^['"“]|['"”]$/g, '').replace(/^(?:meeting|sync|call|review|event)$/i, '').trim();
  // If remaining title is just a duration (e.g. "half an hour", "1.5 hours", "meeting for 1.5 hours")
  if (!cleaned || parseEventDuration(cleaned) || /^(?:meeting|sync|call|session|event|block)\s*(?:for\s*)?(?:\d+|half|an?\s*hour)/i.test(cleaned)) {
    return 'Executive Strategy Session';
  }
  return cleaned.length >= 3 ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Executive Strategy Session';
}

/**
 * Robustly extract meeting start time from natural language text
 * Strictly distinguishes true start times (e.g. "at 2:30 PM", "11:00 AM", "at 14:00")
 * from durations (e.g. "3-hour block", "45-minute review")
 */
export function parseEventStartTime(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Pattern 1: Explicit time with am/pm (e.g. "at 2:30 PM", "2:30pm", "11:00 AM", "3 PM", "10am")
  const ampmMatch = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] || '00';
    const mer = ampmMatch[3].toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Pattern 2: Explicit 24-hour time with colon or "at" prefix (e.g. "at 14:30", "at 14:00", "15:30")
  const colonMatch = lower.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (colonMatch) {
    const h = String(parseInt(colonMatch[1], 10)).padStart(2, '0');
    const m = colonMatch[2];
    return `${h}:${m}`;
  }

  // Pattern 3: "at <hour>" without am/pm (e.g. "at 3", "at 11")
  // MUST NOT match duration or units like "at 3 hours"
  const atMatch = lower.match(/\bat\s+(\d{1,2})(?!\s*[-]?\s*(?:hours?|hrs?|mins?|minutes?|days?|weeks?))\b/i);
  if (atMatch) {
    let h = parseInt(atMatch[1], 10);
    if (h >= 1 && h <= 7) h += 12;
    return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

export interface ParsedTimeResult {
  timeIST: string; // HH:MM in 24-hour format
  timeFormatted: string; // e.g. "2:30 PM"
  hour: number;
  minute: number;
  originalTz?: string;
  originalTime?: string;
  convertedTzNotice?: string;
}

const TIMEZONE_OFFSETS: Record<string, number> = {
  utc: 0,
  gmt: 0,
  z: 0,
  bst: 60, // UTC+1
  cet: 60, // UTC+1
  cest: 120, // UTC+2
  wet: 0,
  eet: 120,
  eest: 180,
  est: -300, // UTC-5
  edt: -240, // UTC-4
  cst: -360, // UTC-6
  cdt: -300, // UTC-5
  mst: -420, // UTC-7
  mdt: -360, // UTC-6
  pst: -480, // UTC-8
  pdt: -420, // UTC-7
  akst: -540,
  akdt: -480,
  hst: -600,
  jst: 540, // UTC+9
  kst: 540,
  sgt: 480, // UTC+8
  hkt: 480,
  aest: 600, // UTC+10
  aedt: 660, // UTC+11
  nzst: 720,
  ist: 330, // UTC+5:30 (Reference Local Timezone)
};

/**
 * Universal Timezone Converter & Start Time Extractor.
 * Converts ANY global timezone (GMT, UTC, EST, PST, CET, etc.) accurately to IST (UTC+5:30).
 */
export function parseEventStartTimeWithTz(text: string): ParsedTimeResult | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Pattern 1: Time with explicit timezone code (e.g., "9:00 AM GMT", "11am est", "14:30 UTC", "3 PM PST")
  const tzRegex = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(gmt|utc|bst|cet|cest|est|edt|cst|cdt|mst|mdt|pst|pdt|jst|kst|sgt|hkt|aest|aedt|nzst|ist)\b/i;
  const tzMatch = lower.match(tzRegex);

  if (tzMatch) {
    let rawH = parseInt(tzMatch[1], 10);
    const rawM = parseInt(tzMatch[2] || '0', 10);
    const mer = tzMatch[3]?.toLowerCase();
    const tzCode = tzMatch[4].toLowerCase();

    if (mer === 'pm' && rawH < 12) rawH += 12;
    if (mer === 'am' && rawH === 12) rawH = 0;

    const sourceOffsetMinutes = TIMEZONE_OFFSETS[tzCode] ?? 330;
    const targetOffsetMinutes = 330; // Indian Standard Time (+05:30)
    const diffMinutes = targetOffsetMinutes - sourceOffsetMinutes;

    const totalRawMinutes = rawH * 60 + rawM;
    let convertedMinutes = (totalRawMinutes + diffMinutes) % (24 * 60);
    if (convertedMinutes < 0) convertedMinutes += 24 * 60;

    const finalH = Math.floor(convertedMinutes / 60);
    const finalM = convertedMinutes % 60;
    const timeIST = `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;

    // Format IST human time
    const displayH = finalH % 12 || 12;
    const displayMer = finalH >= 12 ? 'PM' : 'AM';
    const timeFormatted = `${displayH}:${String(finalM).padStart(2, '0')} ${displayMer}`;

    const origMer = tzMatch[3] ? tzMatch[3].toUpperCase() : (rawH >= 12 ? 'PM' : 'AM');
    const origDisplayH = rawH % 12 || 12;
    const originalTimeStr = `${origDisplayH}:${String(rawM).padStart(2, '0')} ${origMer} ${tzCode.toUpperCase()}`;

    const convertedTzNotice = tzCode !== 'ist' 
      ? `${originalTimeStr} (converted to ${timeFormatted} IST)`
      : undefined;

    return {
      timeIST,
      timeFormatted,
      hour: finalH,
      minute: finalM,
      originalTz: tzCode.toUpperCase(),
      originalTime: originalTimeStr,
      convertedTzNotice,
    };
  }

  // Pattern 2: Standard time without timezone (treated as local IST)
  const standardTime = parseEventStartTime(text);
  if (standardTime) {
    const [hStr, mStr] = standardTime.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    const displayH = hour % 12 || 12;
    const displayMer = hour >= 12 ? 'PM' : 'AM';
    const timeFormatted = `${displayH}:${String(minute).padStart(2, '0')} ${displayMer}`;

    return {
      timeIST: standardTime,
      timeFormatted,
      hour,
      minute,
      originalTz: 'IST',
      originalTime: timeFormatted,
    };
  }

  return null;
}

export interface FuzzyWindow {
  windowStartHour: number;
  windowEndHour: number;
  label: string;
}

/**
 * Universal Fuzzy Time-Window Parser.
 * Detects natural executive windows like "morning before noon", "early morning", "afternoon", "evening".
 */
export function parseFuzzyWindow(text: string): FuzzyWindow | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  if (/\b(?:morning\s+before\s+noon|before\s+noon)\b/i.test(lower)) {
    return { windowStartHour: 9, windowEndHour: 12, label: 'morning before noon' };
  }
  if (/\b(?:early\s+morning)\b/i.test(lower)) {
    return { windowStartHour: 6, windowEndHour: 9, label: 'early morning' };
  }
  if (/\b(?:morning)\b/i.test(lower)) {
    return { windowStartHour: 9, windowEndHour: 12, label: 'morning' };
  }
  if (/\b(?:post[- ]lunch|early\s+afternoon)\b/i.test(lower)) {
    return { windowStartHour: 13, windowEndHour: 15, label: 'early afternoon' };
  }
  if (/\b(?:afternoon)\b/i.test(lower)) {
    return { windowStartHour: 12, windowEndHour: 17, label: 'afternoon' };
  }
  if (/\b(?:evening)\b/i.test(lower)) {
    return { windowStartHour: 17, windowEndHour: 20, label: 'evening' };
  }
  if (/\b(?:night|late\s+night)\b/i.test(lower)) {
    return { windowStartHour: 20, windowEndHour: 23, label: 'night' };
  }

  return null;
}

/**
 * Extract attendees / participants from natural prompt
 * (e.g. "with Alex", "with Sarah and John", "sync with the backend team")
 */
export function parseEventAttendees(text: string, defaultUserEmail?: string): string[] {
  const attendees: string[] = [];
  if (defaultUserEmail) {
    attendees.push(defaultUserEmail);
  }

  if (!text) return attendees;

  const withMatch = text.match(/\bwith\s+([A-Za-z0-9\s,&_.-]+?)(?:\s+(?:on|at|for|day\s+after\s+tomorrow|day\s+after|tomorrow|today|tonight|next|this|via|before|after|in|sometime)\b|[,\.\?!]|$)/i);
  if (withMatch) {
    const raw = withMatch[1].trim();
    // Exclude common phrases that follow "with" but aren't people
    if (!/^(?:a\s+coffee|coffee|a\s+quick|an?\s+agenda|high\s+priority|no\s+delay|zoom|google\s+meet)\b/i.test(raw)) {
      // Split on "and", ",", "&"
      const names = raw.split(/\b(?:and|&|,)\b/).map(s => s.trim()).filter(s => s.length >= 2 && !/^(?:the|my|a|an)$/i.test(s));
      for (const name of names) {
        if (!attendees.includes(name)) {
          attendees.push(name);
        }
      }
    }
  }

  return attendees;
}

/**
 * Cleanly sanitize terminology for executive dashboard & card presentations
 */
export function sanitizeExecutiveTerminology(text: string): string {
  if (!text) return text;

  // Protect email addresses from being corrupted (e.g. saikeerthanmedisetty8@gmail.com)
  const emailMap = new Map<string, string>();
  let emailIdx = 0;
  const maskedText = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    const placeholder = `__EMAIL_MASK_${emailIdx++}__`;
    emailMap.set(placeholder, match);
    return placeholder;
  });

  let sanitized = maskedText
    .replace(/google\s*sheets?\s*(expense\s*ledger|ledger|spreadsheet)?/gi, 'Financial Ledger')
    .replace(/google\s*sheet/gi, 'Financial Ledger')
    .replace(/google\s*calendar/gi, 'Executive Schedule')
    .replace(/(?<!@)\bgmail\s*(?:api|dispatch)?\b(?!\.com)/gi, 'Executive Correspondence')
    .replace(/uber\s*api/gi, 'Executive Mobility Dispatch')
    .replace(/youtube\s*data\s*api(\s*v3)?/gi, 'Executive Media Studio')
    .replace(/expense\s*spreadsheet/gi, 'Financial Ledger')
    .replace(/connected\s*(google\s*sheets?|expense\s*ledger|spreadsheet|financial\s*ledger)\s*(expense\s*ledger|ledger|spreadsheet)?/gi, 'connected Financial Ledger')
    .replace(/connected\s*expense\s*ledger/gi, 'connected Financial Ledger')
    .replace(/connected\s*spreadsheet/gi, 'connected Financial Ledger')
    .replace(/(?:executive\s*)?financial\s*ledger\s*expense\s*ledger/gi, 'Financial Ledger')
    .replace(/(?:executive\s*)?financial\s*ledgerexpense\s*ledger/gi, 'Financial Ledger')
    .replace(/n8n\s*(webhook|workflow)?/gi, 'Autonomous Dispatch Engine')
    .replace(/mongodb/gi, 'Secure Vault')
    .replace(/\bAI[- ]?Drafted\b/gi, 'Drafted')
    .replace(/\bAI\s+agent\b/gi, 'Autonomous Module')
    .replace(/\bAI\s+/g, '');

  // Restore protected emails
  for (const [placeholder, originalEmail] of emailMap.entries()) {
    sanitized = sanitized.split(placeholder).join(originalEmail);
  }

  return sanitized;
}
