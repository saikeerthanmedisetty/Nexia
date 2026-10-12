import fs from 'node:fs';
import path from 'node:path';
import { executeMongoOperation } from './mongodb';
import { formatToISTTime, getISTDateString, resolveTargetDate, parseEventDuration } from './utils';

export { formatToISTTime, getISTDateString, resolveTargetDate, parseEventDuration };

export interface EventRecurrence {
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  interval: number;
  until?: string; // ISO date or YYYY-MM-DD
  count?: number;
  rrule?: string; // RFC 5545 RRULE string
  description?: string; // e.g. "Every alternate Thursday for 2 months"
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  date: string;      // YYYY-MM-DD
  endDate?: string;  // For multi-day events
  isAllDay?: boolean;
  durationMinutes: number;
  durationFormatted: string; // e.g. "45m", "1h"
  location: string;
  meetUrl?: string;
  attendees?: string[];
  type: 'meeting' | 'travel' | 'focus' | 'review';
  status: 'confirmed' | 'tentative' | 'cancelled';
  hasConflict?: boolean;
  conflictReason?: string;
  recurrence?: EventRecurrence;
  seriesId?: string;
  createdAt: string;
}

export interface FreeBlock {
  id: string;
  startTime: string;
  endTime: string;
  date: string;
  formattedRange: string;
  durationMinutes: number;
  durationFormatted: string;
  label: string;
}

export interface ConflictAlert {
  id: string;
  eventAId: string;
  eventATitle: string;
  eventBId: string;
  eventBTitle: string;
  timeRange: string;
  description: string;
  severity: 'high' | 'medium';
}

const CACHE_FILE = path.join(process.cwd(), '.calendar-store.json');

// In-memory store
const inMemoryEvents = new Map<string, CalendarEvent>();


// Deduplicate events by event ID and prioritize real Google Calendar events.
// Stale local stubs ('evt-') are dropped whenever real Google Calendar events exist or Google is connected.
export function deduplicateEvents(events: CalendarEvent[], isGoogleConnected: boolean = false): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();

  for (const ev of events) {
    if (!ev || !ev.id || !ev.title || ev.status === 'cancelled') continue;
    byId.set(ev.id, ev);
  }

  const finalEvents: CalendarEvent[] = [];
  const hasRealGcalEvents = Array.from(byId.values()).some((e) => !e.id.startsWith('evt-'));

  for (const ev of byId.values()) {
    if (ev.status === 'cancelled') continue;
    if (!ev.id.startsWith('evt-')) {
      finalEvents.push(ev);
    } else if (!hasRealGcalEvents && !isGoogleConnected) {
      finalEvents.push(ev);
    }
  }

  return finalEvents.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

// Load cache from disk with deduplication
function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      if (content && content.trim()) {
        const list = JSON.parse(content);
        if (Array.isArray(list) && list.length > 0) {
          const deduped = deduplicateEvents(list);
          inMemoryEvents.clear();
          for (const ev of deduped) {
            if (ev && ev.id && ev.status !== 'cancelled') {
              inMemoryEvents.set(ev.id, ev);
            }
          }
          return;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Calendar Store] Load disk cache notice:', err?.message);
  }
}

// Save cache to disk with deduplication
function saveToDisk() {
  try {
    const list = deduplicateEvents(Array.from(inMemoryEvents.values()));
    fs.writeFileSync(CACHE_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[Calendar Store] Save disk cache notice:', err?.message);
  }
}

export function replaceCalendarEventId(oldId: string, newId: string, meetUrl?: string) {
  const existing = inMemoryEvents.get(oldId);
  if (existing) {
    inMemoryEvents.delete(oldId);
    existing.id = newId;
    if (meetUrl) existing.meetUrl = meetUrl;
    inMemoryEvents.set(newId, existing);
    saveToDisk();
  }
}

// Initialize on module load
loadFromDisk();

let lastGcalSyncTime = 0;
const GCAL_SYNC_TTL_MS = 3_000; // 3 seconds live TTL for real-time sync

/**
 * Real-time synchronization of Google Calendar events into local in-memory store & disk cache.
 */
export async function syncGoogleCalendarToStore(force: boolean = false): Promise<number> {
  const now = Date.now();
  if (!force && (now - lastGcalSyncTime < GCAL_SYNC_TTL_MS) && inMemoryEvents.size > 0) {
    return inMemoryEvents.size;
  }

  loadFromDisk();

  try {
    const { isGoogleConnected } = await import('./google/auth');
    const googleStatus = await isGoogleConnected();
    if (googleStatus.connected) {
      const { listGoogleCalendarEvents } = await import('./google/calendar');
      const syncPromise = listGoogleCalendarEvents();
      const timeoutPromise = new Promise<CalendarEvent[]>((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), 10000)
      );
      const gcalEvents = await Promise.race([syncPromise, timeoutPromise]);
      if (Array.isArray(gcalEvents)) {
        const activeGcal = gcalEvents.filter(e => e.status !== 'cancelled');
        const gcalIdSet = new Set(activeGcal.map((e) => e.id));

        // Reconcile deleted events: remove events that no longer exist in active Google Calendar
        const recentCutoff = now - 120_000;
        for (const [id, ev] of inMemoryEvents.entries()) {
          const createdAt = new Date(ev.createdAt || 0).getTime();
          if (!gcalIdSet.has(id) && (!createdAt || createdAt < recentCutoff)) {
            inMemoryEvents.delete(id);
          }
        }

        // Upsert live Google Calendar events
        for (const ev of activeGcal) {
          const titleClean = (ev.title || '').replace(/^["']|["']$/g, '').trim();
          const titleLower = titleClean.toLowerCase();
          const isTravel = /\b(?:train|flight|transit|travel|airport|railway|station|irctc|bus|drive|uber|cab)\b/i.test(titleLower);
          ev.title = titleClean;
          ev.type = isTravel ? 'travel' : (ev.type || 'meeting');
          inMemoryEvents.set(ev.id, ev);
        }
        saveToDisk();
      }
      lastGcalSyncTime = Date.now();
    }
  } catch (gcalErr: any) {
    console.warn('[Calendar Store] Google Calendar auto-sync notice:', gcalErr?.message);
  }

  return inMemoryEvents.size;
}

/**
 * Calculate duration string from minutes
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export interface ProposedEventConflictDetails {
  hasConflict: boolean;
  conflictingEvent?: CalendarEvent;
  conflicts: Array<{
    eventId: string;
    title: string;
    timeRange: string;
    overlapMinutes: number;
    startTime: string;
    endTime: string;
  }>;
  conflictReason?: string;
  overlapMinutes?: number;
}

/**
 * Universal, millisecond-precision schedule conflict detector.
 * Checks proposed meeting times against all active calendar events.
 */
export function checkProposedEventConflict(proposed: {
  startTime: string; // ISO string, e.g. 2026-09-17T23:30:00+05:30 or 2026-09-17T18:00:00Z
  durationMinutes?: number;
  endTime?: string;
  excludeEventId?: string;
}): ProposedEventConflictDetails {
  loadFromDisk();

  const parseMs = (timeStr?: string): number => {
    if (!timeStr) return NaN;
    let s = timeStr.trim();
    if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
      s = `${s}+05:30`;
    }
    return new Date(s).getTime();
  };

  const proposedStartMs = parseMs(proposed.startTime);
  if (isNaN(proposedStartMs)) {
    return { hasConflict: false, conflicts: [] };
  }

  const durationMinutes = proposed.durationMinutes || 45;
  const proposedEndMs = proposed.endTime
    ? parseMs(proposed.endTime)
    : proposedStartMs + durationMinutes * 60 * 1000;

  const allEvents = Array.from(inMemoryEvents.values());
  const conflicts: ProposedEventConflictDetails['conflicts'] = [];
  let primaryConflictingEvent: CalendarEvent | undefined;
  let maxOverlapMinutes = 0;

  for (const ev of allEvents) {
    if (ev.status === 'cancelled') continue;
    if (proposed.excludeEventId && ev.id === proposed.excludeEventId) continue;

    const evStartMs = parseMs(ev.startTime);
    const evEndMs = parseMs(ev.endTime);
    if (isNaN(evStartMs) || isNaN(evEndMs)) continue;

    // Strict overlapping interval condition:
    // Event overlaps if evStart < proposedEnd && evEnd > proposedStart
    if (evStartMs < proposedEndMs && evEndMs > proposedStartMs) {
      const overlapStartMs = Math.max(proposedStartMs, evStartMs);
      const overlapEndMs = Math.min(proposedEndMs, evEndMs);
      const overlapMs = overlapEndMs - overlapStartMs;
      const overlapMinutes = Math.max(1, Math.round(overlapMs / (60 * 1000)));

      if (!primaryConflictingEvent || overlapMinutes > maxOverlapMinutes) {
        primaryConflictingEvent = ev;
        maxOverlapMinutes = overlapMinutes;
      }

      conflicts.push({
        eventId: ev.id,
        title: ev.title,
        timeRange: `${formatToISTTime(ev.startTime)} – ${formatToISTTime(ev.endTime)}`,
        overlapMinutes,
        startTime: ev.startTime,
        endTime: ev.endTime,
      });
    }
  }

  const hasConflict = conflicts.length > 0;
  const conflictReason = hasConflict
    ? (conflicts.length === 1
        ? `Overlaps with "${primaryConflictingEvent?.title}" (${maxOverlapMinutes}m)`
        : `Overlaps with ${conflicts.map(c => `"${c.title}" (${c.overlapMinutes}m)`).join(', ')}`)
    : undefined;

  return {
    hasConflict,
    conflictingEvent: primaryConflictingEvent,
    conflicts,
    conflictReason,
    overlapMinutes: maxOverlapMinutes,
  };
}

export interface ScheduleBufferAudit {
  hasConflict: boolean;
  conflictingEvent?: CalendarEvent;
  conflicts: Array<{
    eventId: string;
    title: string;
    timeRange: string;
    overlapMinutes: number;
    startTime: string;
    endTime: string;
  }>;
  conflictReason?: string;
  overlapMinutes: number;
  precedingEvent?: {
    id: string;
    title: string;
    timeRange: string;
    startTime: string;
    endTime: string;
    location?: string;
    gapMinutes: number;
    isTight: boolean;
  };
  followingEvent?: {
    id: string;
    title: string;
    timeRange: string;
    startTime: string;
    endTime: string;
    location?: string;
    gapMinutes: number;
    isTight: boolean;
  };
  bufferBeforeMinutes: number | null;
  bufferAfterMinutes: number | null;
  isTightBefore: boolean;
  isTightAfter: boolean;
  hasMissingTravelBuffer: boolean;
  auditNarrative: string;
}

/**
 * Comprehensive Buffer & Overlap Audit Engine
 * Evaluates direct overlaps, pre-meeting buffer gaps, post-meeting buffer gaps,
 * back-to-back constraints, and physical travel buffers.
 */
export function auditScheduleBuffers(proposed: {
  targetDate: string; // YYYY-MM-DD
  startTimeIso: string; // ISO string
  durationMinutes: number;
  excludeEventId?: string;
}): ScheduleBufferAudit {
  loadFromDisk();

  const parseMs = (timeStr?: string): number => {
    if (!timeStr) return NaN;
    let s = timeStr.trim();
    if (s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
      s = `${s}+05:30`;
    }
    return new Date(s).getTime();
  };

  const proposedStartMs = parseMs(proposed.startTimeIso);
  const durationMinutes = proposed.durationMinutes || 45;
  const proposedEndMs = proposedStartMs + durationMinutes * 60 * 1000;

  // 1. Direct overlap conflict check
  const conflictAudit = checkProposedEventConflict({
    startTime: proposed.startTimeIso,
    durationMinutes,
    excludeEventId: proposed.excludeEventId,
  });

  const allEvents = Array.from(inMemoryEvents.values()).filter(
    (ev) => ev.status !== 'cancelled' && ev.id !== proposed.excludeEventId
  );

  // 2. Find preceding event (closest event ending on or before proposedStartMs)
  let precedingEv: CalendarEvent | undefined;
  let minGapBeforeMs = Infinity;

  // 3. Find following event (closest event starting on or after proposedEndMs)
  let followingEv: CalendarEvent | undefined;
  let minGapAfterMs = Infinity;

  for (const ev of allEvents) {
    const evStartMs = parseMs(ev.startTime);
    const evEndMs = parseMs(ev.endTime);
    if (isNaN(evStartMs) || isNaN(evEndMs)) continue;

    // Check if event is on the same target date, or within 8 hours
    const isNearby = Math.abs(evStartMs - proposedStartMs) <= 8 * 3600 * 1000;
    if (!isNearby) continue;

    // Preceding check: evEndMs <= proposedStartMs
    if (evEndMs <= proposedStartMs) {
      const gapMs = proposedStartMs - evEndMs;
      if (gapMs < minGapBeforeMs) {
        minGapBeforeMs = gapMs;
        precedingEv = ev;
      }
    }

    // Following check: evStartMs >= proposedEndMs
    if (evStartMs >= proposedEndMs) {
      const gapMs = evStartMs - proposedEndMs;
      if (gapMs < minGapAfterMs) {
        minGapAfterMs = gapMs;
        followingEv = ev;
      }
    }
  }

  const bufferBeforeMinutes = precedingEv ? Math.round(minGapBeforeMs / 60000) : null;
  const bufferAfterMinutes = followingEv ? Math.round(minGapAfterMs / 60000) : null;

  // A buffer under 15 minutes is considered tight
  const isTightBefore = bufferBeforeMinutes !== null && bufferBeforeMinutes < 15;
  const isTightAfter = bufferAfterMinutes !== null && bufferAfterMinutes < 15;

  // Travel buffer warning: if gap is under 30 minutes and the event location looks like a physical venue
  const isPhysical = (loc?: string) => {
    if (!loc) return false;
    const l = loc.toLowerCase();
    return !l.includes('meet') && !l.includes('zoom') && !l.includes('virtual') && !l.includes('tbd') && !l.includes('to be decided');
  };

  const hasMissingTravelBuffer =
    Boolean((isTightBefore && isPhysical(precedingEv?.location)) ||
    (isTightAfter && isPhysical(followingEv?.location)));

  // Narrative Generation
  const proposedStartFormatted = formatToISTTime(proposed.startTimeIso);
  const proposedEndFormatted = formatToISTTime(new Date(proposedEndMs).toISOString());

  let narrative = '';
  if (conflictAudit.hasConflict) {
    narrative = `⚠️ **Schedule Buffer & Overlap Audit:**\n`;
    narrative += `• **Overlaps:** ⚠️ Direct conflict! Overlaps with "${conflictAudit.conflicts.map(c => `${c.title} (${c.timeRange}, ${c.overlapMinutes}m)`).join(', ')}".\n`;
  } else {
    narrative = `✅ **Schedule Buffer & Overlap Audit:**\n`;
    narrative += `• **Overlaps:** None. Your ${proposedStartFormatted} – ${proposedEndFormatted} window has zero conflicting commitments.\n`;
  }

  // Pre-meeting
  if (precedingEv && bufferBeforeMinutes !== null) {
    const precRange = `${formatToISTTime(precedingEv.startTime)} – ${formatToISTTime(precedingEv.endTime)}`;
    if (bufferBeforeMinutes === 0) {
      narrative += `• **Pre-Meeting Buffer:** ⚠️ Back-to-back! "${precedingEv.title}" ends right at ${formatToISTTime(precedingEv.endTime)} (0m gap).\n`;
    } else if (isTightBefore) {
      narrative += `• **Pre-Meeting Buffer:** ⚠️ Tight transition! Only ${bufferBeforeMinutes}m buffer after "${precedingEv.title}" (${precRange}).\n`;
    } else {
      narrative += `• **Pre-Meeting Buffer:** Clear (${bufferBeforeMinutes}m buffer following "${precedingEv.title}").\n`;
    }
  } else {
    narrative += `• **Pre-Meeting Buffer:** Clear (No prior commitments scheduled).\n`;
  }

  // Post-meeting
  if (followingEv && bufferAfterMinutes !== null) {
    const follRange = `${formatToISTTime(followingEv.startTime)} – ${formatToISTTime(followingEv.endTime)}`;
    if (bufferAfterMinutes === 0) {
      narrative += `• **Post-Meeting Buffer:** ⚠️ Back-to-back! "${followingEv.title}" begins immediately at ${formatToISTTime(followingEv.startTime)} (0m gap).\n`;
    } else if (isTightAfter) {
      narrative += `• **Post-Meeting Buffer:** ⚠️ Tight transition! Only ${bufferAfterMinutes}m buffer before "${followingEv.title}" (${follRange}).\n`;
    } else {
      narrative += `• **Post-Meeting Buffer:** Clear (${bufferAfterMinutes}m buffer before "${followingEv.title}").\n`;
    }
  } else {
    narrative += `• **Post-Meeting Buffer:** Clear (No subsequent commitments scheduled).\n`;
  }

  if (!conflictAudit.hasConflict && !isTightBefore && !isTightAfter) {
    narrative += `You have ample transition time with zero tight overlaps or missing travel buffers around this time.`;
  } else if (conflictAudit.hasConflict) {
    narrative += `Please adjust the proposed time or authorize below if you wish to override.`;
  } else {
    narrative += `Please review the tight transition buffers before confirming.`;
  }

  return {
    hasConflict: conflictAudit.hasConflict,
    conflictingEvent: conflictAudit.conflictingEvent,
    conflicts: conflictAudit.conflicts,
    conflictReason: conflictAudit.conflictReason,
    overlapMinutes: conflictAudit.overlapMinutes || 0,
    precedingEvent: precedingEv ? {
      id: precedingEv.id,
      title: precedingEv.title,
      timeRange: `${formatToISTTime(precedingEv.startTime)} – ${formatToISTTime(precedingEv.endTime)}`,
      startTime: precedingEv.startTime,
      endTime: precedingEv.endTime,
      location: precedingEv.location,
      gapMinutes: bufferBeforeMinutes || 0,
      isTight: isTightBefore,
    } : undefined,
    followingEvent: followingEv ? {
      id: followingEv.id,
      title: followingEv.title,
      timeRange: `${formatToISTTime(followingEv.startTime)} – ${formatToISTTime(followingEv.endTime)}`,
      startTime: followingEv.startTime,
      endTime: followingEv.endTime,
      location: followingEv.location,
      gapMinutes: bufferAfterMinutes || 0,
      isTight: isTightAfter,
    } : undefined,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    isTightBefore,
    isTightAfter,
    hasMissingTravelBuffer,
    auditNarrative: narrative.trim(),
  };
}

/**
 * Detect conflicts and calculate free focus time blocks
 * Standard business day window: 09:00 AM to 07:00 PM IST (600 minutes)
 */
export function calculateFreeTimeAndConflicts(
  events: CalendarEvent[],
  targetDateStr: string
): {
  freeBlocks: FreeBlock[];
  conflicts: ConflictAlert[];
  totalFreeMinutes: number;
  totalMeetingMinutes: number;
} {
  // Filter events for this specific date and sort by start time
  const dayEvents = events
    .filter((e) => e.date === targetDateStr && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const conflicts: ConflictAlert[] = [];

  // 1. Conflict Detection: check overlapping time ranges
  for (let i = 0; i < dayEvents.length; i++) {
    for (let j = i + 1; j < dayEvents.length; j++) {
      const ev1 = dayEvents[i];
      const ev2 = dayEvents[j];

      const start1 = new Date(ev1.startTime).getTime();
      const end1 = new Date(ev1.endTime).getTime();
      const start2 = new Date(ev2.startTime).getTime();
      const end2 = new Date(ev2.endTime).getTime();

      // Check overlap: Start of 2 is before End of 1
      if (start2 < end1) {
        const overlapMs = Math.min(end1, end2) - Math.max(start1, start2);
        const overlapMinutes = Math.max(1, Math.round(overlapMs / (1000 * 60)));

        ev1.hasConflict = true;
        ev1.conflictReason = `Overlaps with "${ev2.title}" (${overlapMinutes}m)`;
        ev2.hasConflict = true;
        ev2.conflictReason = `Overlaps with "${ev1.title}" (${overlapMinutes}m)`;

        conflicts.push({
          id: `conf-${ev1.id}-${ev2.id}`,
          eventAId: ev1.id,
          eventATitle: ev1.title,
          eventBId: ev2.id,
          eventBTitle: ev2.title,
          timeRange: `${formatToISTTime(ev1.startTime)} vs ${formatToISTTime(ev2.startTime)}`,
          description: `"${ev1.title}" overlaps with "${ev2.title}" by ${overlapMinutes} minutes.`,
          severity: 'high',
        });
      }
    }
  }

  // 2. Free Time Blocks Calculation (Business Day: 09:00 AM to 07:00 PM)
  const dayStart = new Date(`${targetDateStr}T09:00:00+05:30`).getTime();
  const dayEnd = new Date(`${targetDateStr}T19:00:00+05:30`).getTime();

  const freeBlocks: FreeBlock[] = [];
  let currentTime = dayStart;
  let totalMeetingMinutes = 0;

  for (const ev of dayEvents) {
    const evStart = new Date(ev.startTime).getTime();
    const evEnd = new Date(ev.endTime).getTime();

    totalMeetingMinutes += ev.durationMinutes;

    // If there is an open gap >= 15 minutes before this meeting
    if (evStart > currentTime + 15 * 60 * 1000) {
      const gapMinutes = Math.round((evStart - currentTime) / (1000 * 60));
      const startIso = new Date(currentTime).toISOString();
      const endIso = new Date(evStart).toISOString();

      freeBlocks.push({
        id: `free-${currentTime}`,
        startTime: startIso,
        endTime: endIso,
        date: targetDateStr,
        formattedRange: `${formatToISTTime(startIso)} – ${formatToISTTime(endIso)}`,
        durationMinutes: gapMinutes,
        durationFormatted: formatDuration(gapMinutes),
        label: gapMinutes >= 90 ? 'Deep Focus Block' : 'Buffer & Planning',
      });
    }

    if (evEnd > currentTime) {
      currentTime = evEnd;
    }
  }

  // Check remaining gap after last meeting until 07:00 PM
  if (currentTime + 15 * 60 * 1000 < dayEnd) {
    const gapMinutes = Math.round((dayEnd - currentTime) / (1000 * 60));
    const startIso = new Date(currentTime).toISOString();
    const endIso = new Date(dayEnd).toISOString();

    freeBlocks.push({
      id: `free-${currentTime}`,
      startTime: startIso,
      endTime: endIso,
      date: targetDateStr,
      formattedRange: `${formatToISTTime(startIso)} – ${formatToISTTime(endIso)}`,
      durationMinutes: gapMinutes,
      durationFormatted: formatDuration(gapMinutes),
      label: gapMinutes >= 90 ? 'Deep Focus Block' : 'Buffer & Wrap-Up',
    });
  }

  const totalFreeMinutes = freeBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);

  return {
    freeBlocks,
    conflicts,
    totalFreeMinutes,
    totalMeetingMinutes,
  };
}

export interface CalendarWindowResult {
  type: 'specific_date' | 'compound_range' | 'upcoming' | 'all';
  date?: string;
  dates?: string[];
  range?: 'today' | 'tomorrow' | 'day_after_tomorrow' | 'today_and_tomorrow' | 'this_week' | 'upcoming' | 'all';
  label: string;
}



/**
 * Parses natural language timeframe or date parameter into structured calendar window
 */
export function resolveCalendarWindow(input?: string): CalendarWindowResult {
  const raw = (input || '').toLowerCase().trim();
  const now = new Date();

  const istDateLabel = (d: Date) =>
    d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

  const todayStr = getISTDateString(now);
  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomorrowStr = getISTDateString(tom);

  // 1. Compound range: Today and Tomorrow
  if (
    raw.includes('today and tomorrow') ||
    raw.includes('today & tomorrow') ||
    raw.includes('today or tomorrow') ||
    (raw.includes('today') && raw.includes('tomorrow'))
  ) {
    return {
      type: 'compound_range',
      range: 'today_and_tomorrow',
      dates: [todayStr, tomorrowStr],
      label: `Today (${istDateLabel(now)}) & Tomorrow (${istDateLabel(tom)})`,
    };
  }

  // 2. This week / next few days
  if (raw.includes('this week') || raw.includes('next few days') || raw.includes('next 3 days')) {
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      weekDates.push(getISTDateString(d));
    }
    return {
      type: 'compound_range',
      range: 'this_week',
      dates: weekDates,
      label: 'Next 7 Days',
    };
  }

  // 3. Weekday names (e.g. "Friday", "this Friday", "Saturday", "Monday")
  const weekdayMatch = raw.match(/\b(?:this\s+|next\s+|coming\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i);
  if (weekdayMatch && !raw.includes('today') && !raw.includes('tomorrow')) {
    const target = resolveTargetDate(weekdayMatch[0], now);
    return {
      type: 'specific_date',
      date: target.dateStr,
      label: `${target.label} (${target.dateStr})`,
    };
  }

  // 4. Day after tomorrow
  if (raw.includes('day after tomorrow') || raw.includes('day after tommorow')) {
    const dat = new Date(now);
    dat.setDate(dat.getDate() + 2);
    const dateStr = getISTDateString(dat);
    return {
      type: 'specific_date',
      range: 'day_after_tomorrow',
      date: dateStr,
      label: `Day after tomorrow (${istDateLabel(dat)})`,
    };
  }

  // 5. Tomorrow
  if (raw.includes('tomorrow') || raw.includes('tommorow')) {
    return {
      type: 'specific_date',
      range: 'tomorrow',
      date: tomorrowStr,
      label: `Tomorrow (${istDateLabel(tom)})`,
    };
  }

  // 6. Today / Tonight / Now
  if (raw.includes('today') || raw.includes('tonight') || raw.includes('now') || raw.includes('current')) {
    return {
      type: 'specific_date',
      range: 'today',
      date: todayStr,
      label: `Today (${istDateLabel(now)})`,
    };
  }

  // 7. ISO Date YYYY-MM-DD
  const isoMatch = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const target = new Date(y, m, d);
    return {
      type: 'specific_date',
      date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      label: istDateLabel(target),
    };
  }

  // 8. Named Month (e.g. 18th Sept, September 18, 17 Sep)
  const monthMap: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };
  const namedMatch = raw.match(/(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+(\d{4}))?/i);
  if (namedMatch && (namedMatch[1] || namedMatch[3])) {
    const d = parseInt(namedMatch[1] || namedMatch[3] || '1', 10);
    const mStr = namedMatch[2].toLowerCase();
    const m = monthMap[mStr] !== undefined ? monthMap[mStr] : 8;
    const y = namedMatch[4] ? parseInt(namedMatch[4], 10) : now.getFullYear();
    const target = new Date(y, m, d);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return {
      type: 'specific_date',
      date: dateStr,
      label: istDateLabel(target),
    };
  }

  // 9. All / Lifetime / History
  if (raw.includes('all') || raw.includes('past') || raw.includes('history') || raw.includes('entire')) {
    return {
      type: 'all',
      range: 'all',
      label: 'Complete Calendar History',
    };
  }

  // Default: Upcoming
  return {
    type: 'upcoming',
    range: 'upcoming',
    label: 'Upcoming Schedule',
  };
}

export interface AvailabilityResult {
  isFree: boolean;
  canAccommodate: boolean;
  date: string;
  formattedDate: string;
  requestedWindow: string;
  durationMinutes: number;
  conflicts: Array<{
    title: string;
    startTime: string;
    endTime: string;
    formattedRange: string;
    location: string;
  }>;
  availableSlots: Array<{
    formattedRange: string;
    durationMinutes: number;
    canFit: boolean;
  }>;
  summary: string;
}

/**
 * Deterministically checks availability for a requested time window on a specific date
 */
export async function checkAvailability(params: {
  prompt?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
}): Promise<AvailabilityResult> {
  const prompt = (params.prompt || '').toLowerCase();
  const dateInfo = resolveTargetDate(prompt);
  const targetDateStr = params.date || dateInfo.dateStr;

  // Detect requested window times (e.g., "between 2:00 PM and 5:00 PM", "2pm to 5pm")
  let windowStartHour = 14; // Default 2:00 PM
  let windowStartMin = 0;
  let windowEndHour = 17;   // Default 5:00 PM
  let windowEndMin = 0;

  const windowMatch = prompt.match(/(?:between|from)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (windowMatch) {
    let startH = parseInt(windowMatch[1], 10);
    const startM = windowMatch[2] ? parseInt(windowMatch[2], 10) : 0;
    const endMeridiem = windowMatch[6].toLowerCase();
    const startMeridiem = windowMatch[3] ? windowMatch[3].toLowerCase() : endMeridiem;
    if (startMeridiem === 'pm' && startH < 12) startH += 12;
    if (startMeridiem === 'am' && startH === 12) startH = 0;

    let endH = parseInt(windowMatch[4], 10);
    const endM = windowMatch[5] ? parseInt(windowMatch[5], 10) : 0;
    if (endMeridiem === 'pm' && endH < 12) endH += 12;
    if (endMeridiem === 'am' && endH === 12) endH = 0;

    windowStartHour = startH;
    windowStartMin = startM;
    windowEndHour = endH;
    windowEndMin = endM;
  } else if (prompt.includes('afternoon')) {
    windowStartHour = 12;
    windowEndHour = 17;
  } else if (prompt.includes('morning')) {
    windowStartHour = 9;
    windowEndHour = 12;
  } else if (prompt.includes('evening')) {
    windowStartHour = 17;
    windowEndHour = 20;
  }

  // Detect requested duration (default 60 mins)
  let durationMinutes = 60;
  const durMatch = prompt.match(/(\d+)\s*(?:hours?|hrs?|h\b)/i);
  const minMatch = prompt.match(/(\d+)\s*(?:mins?|minutes?|m\b)/i);
  if (durMatch) {
    durationMinutes = parseInt(durMatch[1], 10) * 60;
  } else if (minMatch) {
    durationMinutes = parseInt(minMatch[1], 10);
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const windowStartIso = `${targetDateStr}T${pad(windowStartHour)}:${pad(windowStartMin)}:00+05:30`;
  const windowEndIso = `${targetDateStr}T${pad(windowEndHour)}:${pad(windowEndMin)}:00+05:30`;
  const windowStartMs = new Date(windowStartIso).getTime();
  const windowEndMs = new Date(windowEndIso).getTime();

  // Retrieve all events on this date
  const events = await getCalendarEvents({ date: targetDateStr });
  
  // Find conflicting events that overlap with [windowStartMs, windowEndMs]
  const conflicts: AvailabilityResult['conflicts'] = [];
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const evStart = new Date(ev.startTime).getTime();
    const evEnd = new Date(ev.endTime).getTime();

    // Overlap check: start of meeting is before window end, and end of meeting is after window start
    if (evStart < windowEndMs && evEnd > windowStartMs) {
      conflicts.push({
        title: ev.title,
        startTime: ev.startTime,
        endTime: ev.endTime,
        formattedRange: `${formatToISTTime(ev.startTime)} – ${formatToISTTime(ev.endTime)} IST`,
        location: ev.location || 'In-Person / To be decided',
      });
    }
  }

  // Calculate available open slots in the window
  const availableSlots: AvailabilityResult['availableSlots'] = [];
  let pointer = windowStartMs;

  const sortedOverlaps = [...conflicts].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  for (const conf of sortedOverlaps) {
    const confStart = new Date(conf.startTime).getTime();
    const confEnd = new Date(conf.endTime).getTime();

    if (confStart > pointer + 5 * 60 * 1000) {
      const gapMins = Math.round((confStart - pointer) / (1000 * 60));
      availableSlots.push({
        formattedRange: `${formatToISTTime(new Date(pointer).toISOString())} – ${formatToISTTime(new Date(confStart).toISOString())} IST`,
        durationMinutes: gapMins,
        canFit: gapMins >= durationMinutes,
      });
    }
    if (confEnd > pointer) {
      pointer = confEnd;
    }
  }

  if (pointer + 5 * 60 * 1000 < windowEndMs) {
    const gapMins = Math.round((windowEndMs - pointer) / (1000 * 60));
    availableSlots.push({
      formattedRange: `${formatToISTTime(new Date(pointer).toISOString())} – ${formatToISTTime(new Date(windowEndMs).toISOString())} IST`,
      durationMinutes: gapMins,
      canFit: gapMins >= durationMinutes,
    });
  }

  const isFree = conflicts.length === 0;
  const canAccommodate = isFree || availableSlots.some(s => s.canFit);
  const formattedWindow = `${formatToISTTime(windowStartIso)} – ${formatToISTTime(windowEndIso)} IST`;

  let summary = '';
  if (isFree) {
    summary = `You are completely free during ${formattedWindow} on ${targetDateStr}. No meetings or conflicts scheduled.`;
  } else if (canAccommodate) {
    const fitSlots = availableSlots.filter(s => s.canFit).map(s => s.formattedRange).join(', ');
    const conflictStr = conflicts.map(c => `"${c.title}" (${c.formattedRange})`).join(', ');
    summary = `During ${formattedWindow} on ${targetDateStr}, you have a conflict with ${conflictStr}. However, you have an open window at ${fitSlots}, which can easily accommodate your ${durationMinutes}-minute discussion.`;
  } else {
    const conflictStr = conflicts.map(c => `"${c.title}" (${c.formattedRange})`).join(', ');
    summary = `You are not available during ${formattedWindow} on ${targetDateStr} due to ${conflictStr}, and the remaining open slots are too short for a ${durationMinutes}-minute discussion.`;
  }

  return {
    isFree,
    canAccommodate,
    date: targetDateStr,
    formattedDate: dateInfo.label,
    requestedWindow: formattedWindow,
    durationMinutes,
    conflicts,
    availableSlots,
    summary,
  };
}

/**
 * Seeds realistic executive calendar events for demonstration and reviewer exploration
 * when no real Google Calendar account is connected.
 */
export function seedDefaultExecutiveEvents() {
  const todayStr = getISTDateString(new Date());
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const tomorrowStr = getISTDateString(tom);

  const demoEvents: CalendarEvent[] = [
    {
      id: 'demo-1',
      title: 'Executive Strategy & Architecture Alignment',
      description: 'Reviewing cross-functional priorities and technical roadmap.',
      startTime: new Date(`${todayStr}T09:30:00+05:30`).toISOString(),
      endTime: new Date(`${todayStr}T10:30:00+05:30`).toISOString(),
      date: todayStr,
      durationMinutes: 60,
      durationFormatted: '1h',
      location: 'Google Meet',
      meetUrl: 'https://meet.google.com/nex-arch-sync',
      attendees: ['lead@nexia.ai', 'saikeerthanmedisetty686@gmail.com'],
      type: 'meeting',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      title: 'Product Design & User Workflow Review',
      description: 'Examining interactive components and Human-in-the-Loop staging.',
      startTime: new Date(`${todayStr}T13:00:00+05:30`).toISOString(),
      endTime: new Date(`${todayStr}T13:45:00+05:30`).toISOString(),
      date: todayStr,
      durationMinutes: 45,
      durationFormatted: '45m',
      location: 'Executive Boardroom',
      attendees: ['design@nexia.ai'],
      type: 'review',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-3',
      title: 'Field Project Demonstration',
      description: 'Live presentation of Nexia platform features and system integration.',
      startTime: new Date(`${todayStr}T15:30:00+05:30`).toISOString(),
      endTime: new Date(`${todayStr}T16:30:00+05:30`).toISOString(),
      date: todayStr,
      durationMinutes: 60,
      durationFormatted: '1h',
      location: 'SGU Auditorium',
      attendees: ['panel@sgu.edu', 'saikeerthanmedisetty686@gmail.com'],
      type: 'meeting',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-4',
      title: 'Engineering Sprint Planning',
      description: 'Bi-weekly sprint backlog refinement and performance audit.',
      startTime: new Date(`${tomorrowStr}T10:00:00+05:30`).toISOString(),
      endTime: new Date(`${tomorrowStr}T11:00:00+05:30`).toISOString(),
      date: tomorrowStr,
      durationMinutes: 60,
      durationFormatted: '1h',
      location: 'Google Meet',
      meetUrl: 'https://meet.google.com/eng-sprint-sync',
      attendees: ['dev-team@nexia.ai'],
      type: 'focus',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'demo-5',
      title: 'Q4 Leadership Briefing',
      description: 'Strategic review with stakeholders and division heads.',
      startTime: new Date(`${tomorrowStr}T14:30:00+05:30`).toISOString(),
      endTime: new Date(`${tomorrowStr}T15:30:00+05:30`).toISOString(),
      date: tomorrowStr,
      durationMinutes: 60,
      durationFormatted: '1h',
      location: 'Conference Room B',
      attendees: ['leadership@nexia.ai'],
      type: 'meeting',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const ev of demoEvents) {
    inMemoryEvents.set(ev.id, ev);
  }
}

/**
 * Retrieve calendar events with automatic sync from MongoDB Atlas and Google Calendar
 */
export async function getCalendarEvents(options?: {
  range?: 'today' | 'tomorrow' | 'day_after_tomorrow' | 'today_and_tomorrow' | 'this_week' | 'upcoming' | 'all';
  date?: string;
  dates?: string[];
  timeframeInput?: string;
}): Promise<CalendarEvent[]> {
  // If natural language timeframe input is provided, resolve it
  let resolvedOptions = options ? { ...options } : undefined;
  if (options?.timeframeInput) {
    const w = resolveCalendarWindow(options.timeframeInput);
    if (w.type === 'specific_date' && w.date) {
      resolvedOptions = { ...resolvedOptions, date: w.date };
    } else if (w.type === 'compound_range' && w.dates) {
      resolvedOptions = { ...resolvedOptions, dates: w.dates };
    } else if (w.range) {
      resolvedOptions = { ...resolvedOptions, range: w.range };
    }
  }

  // 1. Try to sync from MongoDB Atlas
  try {
    const mongoEvents = await executeMongoOperation(async (db) => {
      return db
        .collection('calendar_events')
        .find({})
        .sort({ startTime: 1 })
        .toArray();
    });

    if (mongoEvents && mongoEvents.length > 0) {
      for (const raw of mongoEvents) {
        const id = raw.id || raw._id?.toString() || `evt-${Date.now()}`;
        const ev: CalendarEvent = {
          id,
          title: (raw.title || 'Scheduled Meeting').replace(/^["']|["']$/g, '').trim(),
          description: raw.description,
          startTime: raw.startTime,
          endTime: raw.endTime,
          date: raw.date || (raw.startTime ? raw.startTime.split('T')[0] : getISTDateString()),
          durationMinutes: Number(raw.durationMinutes) || 45,
          durationFormatted: raw.durationFormatted || `${Number(raw.durationMinutes) || 45}m`,
          location: raw.location || 'In-Person / To be decided',
          meetUrl: raw.meetUrl || (raw.location?.toLowerCase().includes('meet') ? 'https://meet.google.com/nex-sync-call' : undefined),
          attendees: raw.attendees || [],
          type: raw.type || 'meeting',
          status: raw.status || 'confirmed',
          createdAt: raw.createdAt || new Date().toISOString(),
        };
        inMemoryEvents.set(id, ev);
      }
      saveToDisk();
    }
  } catch (err: any) {
    console.warn('[Calendar Store] MongoDB fetch notice:', err?.message);
  }

  // 2. Sync real events from Google Calendar if connected
  let isGoogleActive = false;
  try {
    const { isGoogleConnected } = await import('./google/auth');
    const googleStatus = await isGoogleConnected();
    isGoogleActive = Boolean(googleStatus.connected);
    if (isGoogleActive) {
      await syncGoogleCalendarToStore(true);
    }
  } catch {}

  const todayStr = getISTDateString(new Date());
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const tomorrowStr = getISTDateString(tom);
  const dat = new Date();
  dat.setDate(dat.getDate() + 2);
  const dayAfterTomorrowStr = getISTDateString(dat);

  let allEvents = deduplicateEvents(Array.from(inMemoryEvents.values()), isGoogleActive);

  if (allEvents.length === 0 && !isGoogleActive) {
    seedDefaultExecutiveEvents();
    allEvents = deduplicateEvents(Array.from(inMemoryEvents.values()), isGoogleActive);
  }

  if (resolvedOptions?.date) {
    return allEvents.filter((e) => e.date === resolvedOptions.date);
  }

  if (resolvedOptions?.dates && resolvedOptions.dates.length > 0) {
    return allEvents.filter((e) => resolvedOptions.dates!.includes(e.date));
  }

  if (resolvedOptions?.range === 'today_and_tomorrow') {
    return allEvents.filter((e) => e.date === todayStr || e.date === tomorrowStr);
  }

  if (resolvedOptions?.range === 'today') {
    return allEvents.filter((e) => e.date === todayStr);
  }

  if (resolvedOptions?.range === 'tomorrow') {
    return allEvents.filter((e) => e.date === tomorrowStr);
  }

  if (resolvedOptions?.range === 'day_after_tomorrow') {
    return allEvents.filter((e) => e.date === dayAfterTomorrowStr);
  }

  if (resolvedOptions?.range === 'all') {
    return allEvents;
  }

  // Default to upcoming events (today and future) so past events never pollute schedule views
  return allEvents.filter((e) => e.date >= todayStr);
}

/**
 * Create and persist a new calendar event
 */
export async function createCalendarEvent(
  params: {
    title: string;
    description?: string;
    date?: string;       // YYYY-MM-DD
    startTime?: string;   // ISO or natural time
    endTime?: string;     // ISO
    durationMinutes?: number;
    location?: string;
    attendees?: string[];
    type?: 'meeting' | 'travel' | 'focus' | 'review';
    isAllDay?: boolean;
    endDate?: string;
    recurrence?: EventRecurrence;
  }
): Promise<{ event: CalendarEvent; conflict: boolean; conflictAlert?: ConflictAlert }> {
  await syncGoogleCalendarToStore();
  const duration = params.durationMinutes || 45;
  const todayStr = getISTDateString();
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const tomStr = getISTDateString(tom);

  let targetDate = params.date || todayStr;

  // If startTime is ISO, extract date
  let startIso = params.startTime;
  if (startIso && startIso.includes('T') && startIso.includes(':')) {
    try {
      const parsed = new Date(startIso);
      targetDate = getISTDateString(parsed);
    } catch {}
  } else {
    // Default to Tomorrow at 3:00 PM IST if unspecified
    targetDate = params.date || tomStr;
    startIso = new Date(`${targetDate}T15:00:00+05:30`).toISOString();
  }

  const startDateObj = new Date(startIso);
  const endDateObj = params.endTime ? new Date(params.endTime) : new Date(startDateObj.getTime() + duration * 60 * 1000);
  const endIso = endDateObj.toISOString();

  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const meetSlug = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;

  const isVirtual = Boolean(
    params.location?.toLowerCase().includes('meet') ||
    params.location?.toLowerCase().includes('zoom') ||
    params.location?.toLowerCase().includes('virtual')
  );

  const newEvent: CalendarEvent = {
    id: eventId,
    title: params.title.trim() || 'Executive Project Sync',
    description: params.description || 'Scheduled via Nexia Autonomous Orchestrator.',
    startTime: startIso,
    endTime: endIso,
    date: targetDate,
    durationMinutes: duration,
    durationFormatted: formatDuration(duration),
    location: params.location || 'To be decided',
    meetUrl: isVirtual ? `https://meet.google.com/${meetSlug}` : undefined,
    attendees: params.attendees || ['saikeerthanmedisetty686@gmail.com'],
    type: params.type || 'meeting',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    isAllDay: params.isAllDay,
    endDate: params.endDate,
    recurrence: params.recurrence,
  };

  // Check for immediate conflicts using universal conflict detector
  const conflictAudit = checkProposedEventConflict({
    startTime: startIso,
    endTime: endIso,
    durationMinutes: duration,
    excludeEventId: eventId,
  });

  if (conflictAudit.hasConflict && conflictAudit.conflictingEvent) {
    newEvent.hasConflict = true;
    newEvent.conflictReason = conflictAudit.conflictReason;
  }

  // 1. Save in memory & disk
  inMemoryEvents.set(newEvent.id, newEvent);
  saveToDisk();

  // 2. Persist to MongoDB Atlas
  try {
    await executeMongoOperation(async (db) => {
      await db.collection('calendar_events').insertOne(newEvent);
    });
  } catch (err: any) {
    console.warn('[Calendar Store] MongoDB insert notice:', err?.message);
  }

  const foundConflictAlert: ConflictAlert | undefined = conflictAudit.hasConflict && conflictAudit.conflictingEvent ? {
    id: `conf-${newEvent.id}-${conflictAudit.conflictingEvent.id}`,
    eventAId: newEvent.id,
    eventATitle: newEvent.title,
    eventBId: conflictAudit.conflictingEvent.id,
    eventBTitle: conflictAudit.conflictingEvent.title,
    timeRange: `${formatToISTTime(newEvent.startTime)} vs ${formatToISTTime(conflictAudit.conflictingEvent.startTime)}`,
    description: conflictAudit.conflictReason || `Overlaps with "${conflictAudit.conflictingEvent.title}"`,
    severity: 'high',
  } : undefined;

  return {
    event: newEvent,
    conflict: conflictAudit.hasConflict,
    conflictAlert: foundConflictAlert,
  };
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(id: string): Promise<boolean> {
  const existed = inMemoryEvents.delete(id);
  saveToDisk();

  try {
    await executeMongoOperation(async (db) => {
      await db.collection('calendar_events').deleteOne({ id });
    });
  } catch (err: any) {
    console.warn('[Calendar Store] MongoDB delete notice:', err?.message);
  }

  return existed;
}

/**
 * Find all matching calendar events on a date or matching query
 */
export function findMatchingCalendarEvents(query: string, targetDateStr?: string): CalendarEvent[] {
  loadFromDisk();
  const allEvents = Array.from(inMemoryEvents.values())
    .filter((e) => e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const lower = query.toLowerCase();

  // 1. If targetDate is specified (e.g. 2026-09-24)
  if (targetDateStr) {
    const onDate = allEvents.filter((e) => e.date === targetDateStr);
    if (onDate.length > 0) {
      // Check if user specifically mentioned one event title
      const titleMatch = onDate.filter((e) => lower.includes(e.title.toLowerCase()) || (e.title.length > 5 && e.title.toLowerCase().includes(lower)));
      const candidates = titleMatch.length > 0 ? titleMatch : onDate;

      // Check if user specified a duration (e.g. "45 min", "4 hours") to disambiguate
      const parsedDur = parseEventDuration(query);
      if (parsedDur && parsedDur.durationMinutes) {
        const durMatch = candidates.filter(
          (e) => Math.abs((e.durationMinutes || 45) - parsedDur.durationMinutes) <= 5
        );
        if (durMatch.length > 0) {
          return durMatch;
        }
      }

      if (titleMatch.length > 0) {
        return titleMatch;
      }
      return onDate;
    }
    // If target date was explicitly specified and no events exist on that date, return empty
    return [];
  }

  // 2. Check title match across all events
  const titleMatches = allEvents.filter((e) => {
    const evTitle = e.title.toLowerCase();
    return lower.includes(evTitle) || (evTitle.length > 3 && lower.includes(evTitle.slice(0, 8)));
  });
  if (titleMatches.length > 0) {
    return titleMatches;
  }

  // 3. Pronoun fallback
  if (/\b(?:it|that|this\s+meeting|the\s+meeting|last\s+one|last\s+meeting|the\s+event)\b/i.test(lower)) {
    if (allEvents.length > 0) {
      return [allEvents[allEvents.length - 1]];
    }
  }

  return [];
}

/**
 * Synchronously find a single existing active event matching a query, date, or title
 */
export function findMatchingCalendarEvent(query: string, targetDateStr?: string): CalendarEvent | null {
  const matches = findMatchingCalendarEvents(query, targetDateStr);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Universal Free-Slot Discovery Engine.
 * Finds a guaranteed non-overlapping slot matching requested duration and optional fuzzy window.
 */
export function findOptimalFreeSlot(options: {
  targetDate: string;
  durationMinutes: number;
  fuzzyWindow?: { windowStartHour: number; windowEndHour: number; label: string } | null;
}): { startIso: string; startTimeFormatted: string; durationFormatted: string; explanation: string } {
  loadFromDisk();
  const { targetDate, durationMinutes, fuzzyWindow } = options;
  const startHour = fuzzyWindow ? fuzzyWindow.windowStartHour : 9;
  const endHour = fuzzyWindow ? fuzzyWindow.windowEndHour : 19;

  const dayEvents = Array.from(inMemoryEvents.values())
    .filter((e) => e.date === targetDate && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const pad = (n: number) => n.toString().padStart(2, '0');
  const searchStartMs = new Date(`${targetDate}T${pad(startHour)}:00:00+05:30`).getTime();
  const windowEndMs = new Date(`${targetDate}T${pad(endHour)}:00:00+05:30`).getTime();
  const durationMs = durationMinutes * 60 * 1000;

  let allocatedStartMs = searchStartMs;
  let found = false;

  for (const ev of dayEvents) {
    const evStart = new Date(ev.startTime).getTime();
    const evEnd = new Date(ev.endTime).getTime();

    // Check if slot between allocatedStartMs and evStart fits durationMs
    if (evStart >= allocatedStartMs + durationMs && allocatedStartMs + durationMs <= windowEndMs) {
      found = true;
      break;
    }

    // Advance search start to after this meeting if it overlaps
    if (evEnd > allocatedStartMs) {
      allocatedStartMs = evEnd;
    }
  }

  // Check if remaining gap fits
  if (!found && allocatedStartMs + durationMs <= windowEndMs) {
    found = true;
  }

  // Fallback if window is completely packed: default to window start
  if (!found) {
    allocatedStartMs = searchStartMs;
  }

  const startIso = new Date(allocatedStartMs).toISOString();
  const startTimeFormatted = formatToISTTime(startIso);
  const durationFormatted = formatDuration(durationMinutes);
  const windowLabel = fuzzyWindow ? ` for ${fuzzyWindow.label}` : '';

  return {
    startIso,
    startTimeFormatted,
    durationFormatted,
    explanation: `Found an open ${durationFormatted} slot${windowLabel} (${startTimeFormatted} IST) on ${targetDate}.`,
  };
}

/**
 * Disentangled Free-Slot Search Engine
 * Disentangles explicit search boundaries (e.g. 1:00 PM to 5:00 PM) from meeting duration (e.g. 45 mins)
 */
export function findFreeSlotInWindow(options: {
  targetDate: string;
  durationMinutes: number;
  searchWindow: { start: string; end: string };
}): { date: string; durationMinutes: number; startIso: string; startTimeFormatted: string; durationFormatted: string; explanation: string } {
  loadFromDisk();
  const { targetDate, durationMinutes, searchWindow } = options;

  const parseHourMin = (timeStr: string): { hour: number; minute: number } => {
    let s = (timeStr || '').trim().toLowerCase();
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!m) return { hour: 13, minute: 0 };
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    const mer = m[3];
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    return { hour: h, minute: min };
  };

  const startObj = parseHourMin(searchWindow.start);
  const endObj = parseHourMin(searchWindow.end);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const searchStartMs = new Date(`${targetDate}T${pad(startObj.hour)}:${pad(startObj.minute)}:00+05:30`).getTime();
  const windowEndMs = new Date(`${targetDate}T${pad(endObj.hour)}:${pad(endObj.minute)}:00+05:30`).getTime();
  const durationMs = durationMinutes * 60 * 1000;

  const dayEvents = Array.from(inMemoryEvents.values())
    .filter((e) => e.date === targetDate && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  let allocatedStartMs = searchStartMs;
  let found = false;

  for (const ev of dayEvents) {
    const evStart = new Date(ev.startTime).getTime();
    const evEnd = new Date(ev.endTime).getTime();

    // Check if slot between allocatedStartMs and evStart accommodates durationMs
    if (evStart >= allocatedStartMs + durationMs && allocatedStartMs + durationMs <= windowEndMs) {
      found = true;
      break;
    }

    if (evEnd > allocatedStartMs) {
      allocatedStartMs = evEnd;
    }
  }

  if (!found && allocatedStartMs + durationMs <= windowEndMs) {
    found = true;
  }

  if (!found) {
    allocatedStartMs = searchStartMs;
  }

  const startIso = new Date(allocatedStartMs).toISOString();
  const startTimeFormatted = formatToISTTime(startIso);
  const durationFormatted = formatDuration(durationMinutes);
  const windowLabel = `between ${formatToISTTime(new Date(searchStartMs).toISOString())} and ${formatToISTTime(new Date(windowEndMs).toISOString())}`;

  return {
    date: targetDate,
    durationMinutes,
    startIso,
    startTimeFormatted,
    durationFormatted,
    explanation: `Found an open ${durationFormatted} slot ${windowLabel} (${startTimeFormatted} IST) on ${targetDate}.`,
  };
}

/**
 * Update an existing calendar event (e.g. Move date, change time, rename title)
 */
export async function updateCalendarEvent(
  id: string,
  updates: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    location?: string;
    attendees?: string[];
    description?: string;
    status?: 'confirmed' | 'tentative' | 'cancelled';
  }
): Promise<CalendarEvent | null> {
  loadFromDisk();
  const ev = inMemoryEvents.get(id);
  if (!ev) return null;

  if (updates.title) ev.title = updates.title.trim();
  if (updates.date) ev.date = updates.date;
  if (updates.location) ev.location = updates.location;
  if (updates.attendees) ev.attendees = updates.attendees;
  if (updates.description) ev.description = updates.description;
  if (updates.status) ev.status = updates.status;

  if (updates.startTime) {
    ev.startTime = updates.startTime;
    const dur = updates.durationMinutes || ev.durationMinutes || 45;
    ev.durationMinutes = dur;
    ev.durationFormatted = formatDuration(dur);
    const startD = new Date(updates.startTime);
    ev.endTime = updates.endTime || new Date(startD.getTime() + dur * 60000).toISOString();
    if (updates.startTime.includes('T')) {
      ev.date = updates.date || updates.startTime.split('T')[0];
    }
  } else if (updates.date && ev.startTime.includes('T')) {
    const timePart = ev.startTime.split('T')[1];
    ev.startTime = `${updates.date}T${timePart}`;
    const dur = ev.durationMinutes || 45;
    ev.endTime = new Date(new Date(ev.startTime).getTime() + dur * 60000).toISOString();
  }

  // Check conflicts with updated parameters
  const conflictAudit = checkProposedEventConflict({
    startTime: ev.startTime,
    endTime: ev.endTime,
    durationMinutes: ev.durationMinutes,
    excludeEventId: ev.id,
  });
  ev.hasConflict = conflictAudit.hasConflict;
  ev.conflictReason = conflictAudit.conflictReason;

  inMemoryEvents.set(ev.id, ev);
  saveToDisk();

  // Sync to MongoDB if configured
  try {
    await executeMongoOperation(async (db) => {
      await db.collection('calendar_events').updateOne({ id }, { $set: ev });
    });
  } catch (err: any) {
    console.warn('[Calendar Store] MongoDB update notice:', err?.message);
  }

  return ev;
}

/**
 * Wildcard Search & Bulk Retrieval
 * Finds all events matching a wildcard text filter across an optional date range
 */
export function findEventsByWildcard(options: {
  text?: string;
  dateRange?: { start: string; end: string };
  date?: string;
  timeScope?: string;
}): CalendarEvent[] {
  loadFromDisk();
  const allEvents = Array.from(inMemoryEvents.values())
    .filter((e) => e.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const searchWord = options.text?.trim().toLowerCase();

  let effectiveRange = options.dateRange;
  if (!effectiveRange && options.timeScope?.toLowerCase().includes('week')) {
    const now = new Date();
    const start = new Date(now.getTime() + 1 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
    effectiveRange = {
      start: getISTDateString(start),
      end: getISTDateString(end),
    };
  }

  return allEvents.filter((ev) => {
    // Date filter
    if (options.date && ev.date !== options.date) return false;
    if (effectiveRange) {
      if (ev.date < effectiveRange.start || ev.date > effectiveRange.end) return false;
    }
    // Wildcard text filter
    if (searchWord) {
      const matchTitle = ev.title.toLowerCase().includes(searchWord);
      const matchDesc = (ev.description || '').toLowerCase().includes(searchWord);
      return matchTitle || matchDesc;
    }
    return true;
  });
}

/**
 * Recurring Calendar Series Generator
 * Expands recurring rules (daily, weekly, bi-weekly, monthly) over a specified horizon
 */
export async function createRecurringCalendarEvents(params: {
  title: string;
  startTime: string; // First occurrence ISO string
  durationMinutes: number;
  recurrence: EventRecurrence;
  location?: string;
  attendees?: string[];
  description?: string;
}): Promise<{ seriesId: string; events: CalendarEvent[]; rrule: string; description: string }> {
  loadFromDisk();
  const seriesId = `series-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const firstStartDate = new Date(params.startTime);
  const duration = params.durationMinutes || 45;

  const freq = params.recurrence.frequency;
  const interval = params.recurrence.interval || (freq === 'BIWEEKLY' ? 2 : 1);

  // Compute horizon: default to 2 months from first start date if not given
  let untilMs = firstStartDate.getTime() + 62 * 24 * 3600 * 1000;
  if (params.recurrence.until) {
    const parsedUntil = new Date(params.recurrence.until.includes('T') ? params.recurrence.until : `${params.recurrence.until}T23:59:59+05:30`).getTime();
    if (!isNaN(parsedUntil)) untilMs = parsedUntil;
  }

  const stepDays = freq === 'DAILY' ? 1 : (freq === 'BIWEEKLY' ? 14 : (freq === 'WEEKLY' ? 7 : 30));
  const createdEvents: CalendarEvent[] = [];
  let currentStartMs = firstStartDate.getTime();
  let instanceCount = 0;
  const maxInstances = params.recurrence.count || 20;

  while (currentStartMs <= untilMs && instanceCount < maxInstances) {
    const instStartIso = new Date(currentStartMs).toISOString();
    const instEndIso = new Date(currentStartMs + duration * 60000).toISOString();
    const instDate = getISTDateString(new Date(currentStartMs));

    const eventId = `evt-${Date.now()}-${instanceCount}-${Math.random().toString(36).substring(2, 6)}`;
    const ev: CalendarEvent = {
      id: eventId,
      seriesId,
      title: params.title.trim(),
      description: params.description || `Recurring series (${params.recurrence.description || freq})`,
      startTime: instStartIso,
      endTime: instEndIso,
      date: instDate,
      durationMinutes: duration,
      durationFormatted: formatDuration(duration),
      location: params.location || 'To be decided',
      attendees: params.attendees || ['saikeerthanmedisetty686@gmail.com'],
      type: 'meeting',
      status: 'confirmed',
      recurrence: params.recurrence,
      createdAt: new Date().toISOString(),
    };

    inMemoryEvents.set(eventId, ev);
    createdEvents.push(ev);
    instanceCount++;

    // Advance to next interval
    if (freq === 'MONTHLY') {
      const d = new Date(currentStartMs);
      d.setMonth(d.getMonth() + interval);
      currentStartMs = d.getTime();
    } else {
      currentStartMs += stepDays * 24 * 3600 * 1000;
    }
  }

  saveToDisk();

  const rruleFreq = freq === 'BIWEEKLY' ? 'WEEKLY' : freq;
  const rruleInterval = freq === 'BIWEEKLY' ? 2 : interval;
  const untilIsoStr = new Date(untilMs).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const rrule = `RRULE:FREQ=${rruleFreq};INTERVAL=${rruleInterval};UNTIL=${untilIsoStr}`;
  const desc = params.recurrence.description || `${freq.toLowerCase()} meeting (${createdEvents.length} events staged)`;

  return {
    seriesId,
    events: createdEvents,
    rrule,
    description: desc,
  };
}
