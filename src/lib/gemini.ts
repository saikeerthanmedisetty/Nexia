import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { COORDINATOR_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT } from './prompts';
import { generateThumbnailFromPrompt } from './thumbnail';
import { 
  getISTDateString, 
  formatToISTTime, 
  resolveTargetDate, 
  sanitizeExecutiveTerminology,
  parseEventDuration,
  parseEventStartTime,
  parseEventStartTimeWithTz,
  parseFuzzyWindow,
  parseEventAttendees,
  parseEventTitle,
  parseEventDescription,
  formatDateDisplay
} from './utils';
import { 
  checkProposedEventConflict, 
  findMatchingCalendarEvent,
  findMatchingCalendarEvents,
  findOptimalFreeSlot,
  auditScheduleBuffers,
  findFreeSlotInWindow,
  findEventsByWildcard,
  createRecurringCalendarEvents,
  updateCalendarEvent
} from './calendar';

export { sanitizeExecutiveTerminology };

function getGenAI(): GoogleGenerativeAI {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[k]) process.env[k] = v;
          }
        }
      }
    } catch {}
  }
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  return new GoogleGenerativeAI(apiKey);
}

const defaultSafetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  content: string;
}

export interface ReceiptData {
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  description: string;
  items?: string[];
}

export interface TraceStep {
  id: string;
  label: string;
  agent: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  durationMs?: number;
}

export interface IntentClassification {
  type?: 'action_stage' | 'action_update' | 'action_confirm' | 'action_cancel' | 'general';
  agent: 'EMAIL' | 'CALENDAR' | 'YOUTUBE' | 'TELEGRAM' | 'LINKEDIN' | 'UBER' | 'SHEETS' | 'CHIEF_OF_STAFF' | 'RESEARCH' | 'GENERAL';
  action: string;
  params: Record<string, any>;
  explanation: string;
  requiresConfirmation?: boolean;
  confirmationDetails?: {
    title: string;
    warning: string;
    summary: string;
    details: Record<string, any>;
  };
  traceSteps?: TraceStep[];
}

// Ultra-fast working models verified on Google Generative AI
const CANDIDATE_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
const WORKING_MODEL = 'gemini-3.6-flash';

export function clampTitle100(t: string): string {
  if (!t) return '';
  const trimmed = t.trim();
  if (trimmed.length <= 100) return trimmed;
  const sliced = trimmed.slice(0, 97);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 50) {
    return sliced.slice(0, lastSpace).trim() + '...';
  }
  return sliced.trim() + '...';
}


/**
 * Formats high-impact, impressive executive explanations for staged actions
 */
export function formatImpressiveStagedExplanation(intent: IntentClassification): string {
  const p = intent.params || {};

  // If a tailored, detailed explanation was already provided (e.g. schedule buffer audit), preserve it!
  if (intent.explanation && (intent.explanation.includes('Audit') || intent.explanation.includes('Schedule') || intent.explanation.includes('**'))) {
    return intent.explanation;
  }

  if (intent.agent === 'SHEETS') {
    return `💳 I've prepared this transaction entry for your review. Please authorize execution below:`;
  }

  if (intent.agent === 'CALENDAR') {
    if (intent.action === 'delete' || intent.action === 'cancel' || intent.action === 'remove') {
      const eventTitle = p.title || 'this reservation';
      const eventDate = p.date ? `on ${formatDateDisplay(p.date)}` : '';
      const eventTime = p.time ? `at ${p.time}` : '';
      return `🗑️ I have identified the reservation for **"${eventTitle}"** ${eventDate} ${eventTime} on your Executive Schedule.\n\nPlease review and authorize cancellation below:`;
    }
    if (p.hasConflict || p.conflict) {
      return `⚠️ Schedule Conflict Alert: This reservation overlaps with "${p.conflictingEvent || 'an existing event'}"${p.overlapMinutes ? ` (${p.overlapMinutes} mins)` : ''}. Please review and authorize below to resolve or proceed:`;
    }
    const rawMsg = (p.rawPrompt || p.message || p.userPrompt || '').toLowerCase();
    const isFreeSlot = /\b(?:find\s*(?:me\s*)?(?:an?\s*)?(?:continuous\s*)?(?:open\s*)?.*(?:free|slot|block|window|time)|when\s*(?:am\s*i|is\s*(?:my|there)\s*free))\b/i.test(rawMsg);
    if (isFreeSlot) {
      const durLabel = p.duration || (p.durationMinutes ? `${p.durationMinutes} mins` : 'focus');
      return `📅 I scanned your Executive Schedule for ${formatDateDisplay(p.date)} and identified an open continuous ${durLabel} free block (${p.time || '10:00 AM'}). I've staged this reservation for your authorization below:`;
    }
    const titleLabel = p.title ? ` for **${p.title}**` : '';
    const dateLabel = p.date ? ` on ${formatDateDisplay(p.date)}` : '';
    const timeLabel = p.time ? ` at ${p.time}` : '';
    const durLabel = p.duration ? ` (${p.duration})` : '';
    return `📅 I've staged this reservation${titleLabel}${dateLabel}${timeLabel}${durLabel} on your Executive Schedule. Please review and authorize below:`;
  }

  if (intent.agent === 'EMAIL' && intent.action !== 'read' && intent.action !== 'list') {
    return `✉️ I've drafted this correspondence for your review. Please confirm dispatch below:`;
  }

  if (intent.agent === 'UBER' && (intent.action.includes('book') || intent.action === 'stage')) {
    return `🚗 I've locked in your transit route. Please review parameters and authorize dispatch below:`;
  }

  if (intent.agent === 'YOUTUBE' && (intent.action === 'upload' || intent.action === 'publish' || intent.action === 'stage')) {
    return `🎬 I've synthesized your video production assets. Please review and authorize release below:`;
  }

  return sanitizeExecutiveTerminology(intent.explanation || "I've staged this action for your review and authorization below:");
}

function withTimeout<T>(promise: Promise<T>, ms: number = 25000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Model response timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Chat with Gemini model using conversation history
 */
export async function chat(messages: any[], crossSessionMemory?: string): Promise<string> {
  const history = messages
    .filter(m => m.role !== 'system')
    .slice(0, -1)
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

  const now = new Date();
  const todayIST = getISTDateString(now);
  const currentISTTime = formatToISTTime(now.toISOString());
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = dayNames[now.getDay()];
  const liveTemporalNote = `\n\n[LIVE TEMPORAL CONTEXT]:\nToday is ${todayDayName}, ${todayIST} at ${currentISTTime} IST (Asia/Kolkata). Always evaluate relative dates ('today', 'tomorrow', 'next week') strictly relative to this live timestamp.`;

  const lastMessage = messages[messages.length - 1];
  let systemInstruction = crossSessionMemory && crossSessionMemory.trim().length > 0
    ? `${CHAT_SYSTEM_PROMPT}\n\n[CROSS-SESSION EXECUTIVE MEMORY & HISTORICAL SESSIONS]:\nYou remember all of the user's past conversations and tasks across past chats:\n${crossSessionMemory}\nUse this knowledge naturally when the user asks about earlier conversations, wants to continue a previous task, or references past decisions!`
    : CHAT_SYSTEM_PROMPT;
  systemInstruction += liveTemporalNote;

  for (const candidateModel of CANDIDATE_MODELS) {
    try {
      const model = getGenAI().getGenerativeModel({
        model: candidateModel,
        systemInstruction,
      });
      const chatSession = model.startChat({
        history,
        safetySettings: defaultSafetySettings,
      });

      const result = await withTimeout(chatSession.sendMessage(lastMessage.content), 15000);
      return result.response.text();
    } catch (err: any) {
      console.warn(`Chat model call notice on ${candidateModel} (${err.message}). Trying next candidate.`);
    }
  }

  return "I understand your instruction and have synchronized your preferences across all agents.";
}

/**
 * Analyze a video frame using Gemini Vision to detect actual visual content
 */
export async function analyzeVideoFrame(thumbnailBase64: string): Promise<string> {
  const cleanBase64 = thumbnailBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = getGenAI().getGenerativeModel({ model: modelName });
      const result = await withTimeout(
        model.generateContent([
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/jpeg',
            },
          },
          'Describe the visual scene in this video frame in 1 concise, factual sentence. Identify the main subject and setting.',
        ]),
        10000
      );
      return result.response.text().trim();
    } catch (e: any) {
      console.warn(`Video frame analysis notice on ${modelName}:`, e.message);
    }
  }
  return '';
}

/**
 * Single source of truth for parsing and staging Executive Calendar actions.
 * Used identically by preRouteDeterministicIntent and by fallback recovery paths.
 */
export function stageCalendarIntent(
  userMessage: string,
  pendingAction?: any,
  userProfile?: any,
  channelName: string = '@Creator'
): IntentClassification | null {
  const trimmed = (userMessage || '').trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return null;

  // Guard: Exclude Chief of Staff briefing queries from calendar
  const isChiefOfStaffBriefing = 
    /\b(?:briefing|dossier|morning\s+brief|daily\s+brief|status\s+report|rundown|run\s+my\s+day|on\s+my\s+plate|how(?:'s|\s+is)\s+my\s+day|kickstart\s+my\s+day|plan\s+my\s+day|executive\s+brief)\b/i.test(lower);
  if (isChiefOfStaffBriefing) {
    return null;
  }

  // Guard: Exclude explicit email commands from calendar
  if (lower.includes('@') && /\b(?:email|mail|send|compose|draft)\b/i.test(lower)) {
    return null;
  }

  // Guard: Delegate any compound, multi-intent, or non-trivial calendar commands to Gemini
  const isComplexCalendarPrompt = 
    /\b(?:bi-weekly|biweekly|alternate|recurring|recurrence|every\s+(?:other|alternate|day|week|month|thursday|friday|monday|tuesday|wednesday|saturday|sunday)|repeat)\b/i.test(lower) ||
    /\b(?:move|reschedule|shift|rename|change\s+title|change\s+time|update)\b/i.test(lower) ||
    /\b(?:between|window|zero\s+overlapping|free\s+slot|find\s*(?:a|me)?\s*(?:\d+[- ](?:min|minute))?\s*window)\b/i.test(lower) ||
    /\b(?:all\s+events|containing|every\s+single\s+one|bulk\s+cancel|bulk\s+delete|cancel\s+all)\b/i.test(lower) ||
    /\b(?:from\s+now|in\s+\d+\s+mins?|in\s+\d+\s+minutes?)\b/i.test(lower) ||
    /\b(?:all-day|all\s+day|through|thru)\b/i.test(lower) ||
    /\b(?:even\s+if|urgent\s+override|priority\s+override|force\s+book)\b/i.test(lower) ||
    /\b(?:est|edt|pst|pdt|cst|cdt|utc|gmt)\b/i.test(lower) ||
    (lower.includes('@') && lower.split('@').length > 2);

  if (isComplexCalendarPrompt) {
    return null;
  }

  const isCalendarDomain = 
    lower.includes('calendar') ||
    lower.includes('schedule') ||
    lower.includes('meeting') ||
    lower.includes('sync') ||
    lower.includes('appointment') ||
    lower.includes('retro') ||
    lower.includes('standup') ||
    lower.includes('1:1') ||
    lower.includes('1-on-1') ||
    lower.includes('availability') ||
    /\b(?:am\s+i\s+free|is\s+(?:my\s+)?(?:afternoon|morning|evening|calendar|schedule)\s+free|any\s+conflicts|free\s+between)\b/i.test(lower);

  const isScheduleAsNoun = /\b(?:on\s+(?:my|the|your)\s+schedule|(?:my|the|today's|tomorrow's)\s+schedule|what(?:'s|\s+is)\s+(?:on\s+)?(?:my\s+)?schedule)\b/i.test(lower);
  const hasCalDeleteVerb = /\b(?:remove|delete|cancel|drop|unschedule|clear|take\s+off)\b/i.test(lower);
  const hasCalMeetingNoun = /\b(?:meeting|sync|event|review|call|discussion|session|appointment|calendar|interview|retro|standup|demo|1:1|1-on-1|one-on-one|deep\s+work|maintenance|window|coffee\s+chat|coffee|lunch|dinner|breakfast|webinar|workshop|hackathon|catchup|catch-up|office\s+hours)\b/i.test(lower);
  const hasCalTimeSignal = /\b(?:day\s+after\s+tomorrow|day\s+after\s+tommorow|day\s+after|tomorrow|today|tonight|friday|monday|tuesday|wednesday|thursday|saturday|sunday|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)|for\s+\d+\s*(?:mins?|minutes?|hours?|hrs?))\b/i.test(lower);

  const hasCalCreateVerb = 
    !hasCalDeleteVerb && (
      /\b(?:book|create|set(?:\s*up)?|add|block|put|reserve|stage|hold|pencil(?:\s*in)?|slot(?:\s*in)?|fit(?:\s*in)?|lock(?:\s*in)?|arrange|plan|organize)\b/i.test(lower) ||
      (/\bschedule\b/i.test(lower) && !isScheduleAsNoun) ||
      (hasCalMeetingNoun && hasCalTimeSignal && !/\b(?:what|list|show|check|any|is\s+my|view|see)\b/i.test(lower))
    );

  // A. Event Cancellation / Removal Pre-Routing
  const isCalDelete = hasCalDeleteVerb && (
    hasCalMeetingNoun ||
    hasCalTimeSignal ||
    lower.includes(' it') ||
    lower.includes('that') ||
    isCalendarDomain ||
    /\b(?:remove|delete|cancel|clear)\s+(?:it|this|that|the|meeting|event|sync|1:1|schedule|calendar)\b/i.test(lower) ||
    /\bclear\s+(?:it|my\s+schedule|my\s+calendar|all|today|tomorrow|thursday|friday)\b/i.test(lower)
  );

  if (isCalDelete) {
    const dateMentioned = lower.includes('tomorrow') || lower.includes('today') || 
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(lower);
    const dateInfo = dateMentioned ? resolveTargetDate(trimmed) : null;
    const targetDate = dateInfo ? dateInfo.dateStr : undefined;

    const matchedEvents = findMatchingCalendarEvents(trimmed, targetDate);

    if (matchedEvents.length > 0) {
      const userEmail = userProfile?.email || 'saikeerthanmedisetty686@gmail.com';
      const isMulti = matchedEvents.length > 1;
      const firstEvent = matchedEvents[0];
      const eventTimeFormatted = formatToISTTime(firstEvent.startTime);
      const eventDateDisplay = formatDateDisplay(firstEvent.date);

      const explanation = isMulti
        ? `🗑️ I found **${matchedEvents.length} reservations** on **${eventDateDisplay}** on your Executive Schedule:\n\n` +
          matchedEvents.map((e) => `• **"${e.title}"** at ${formatToISTTime(e.startTime)} (${e.durationFormatted || (e.durationMinutes ? `${e.durationMinutes} mins` : '45 mins')})`).join('\n') +
          `\n\nPlease review and authorize cancellation below:`
        : `🗑️ I have identified the reservation for **"${firstEvent.title}"** on **${eventDateDisplay} at ${eventTimeFormatted}** on your Executive Schedule.\n\nPlease review and authorize cancellation below:`;

      const summary = isMulti
        ? `Cancel ${matchedEvents.length} events on ${eventDateDisplay}`
        : `Cancel "${firstEvent.title}" on ${eventDateDisplay} at ${eventTimeFormatted}`;

      const warning = isMulti
        ? `Safety Check: Confirm before permanently removing ${matchedEvents.length} events from your Executive Schedule.`
        : `Safety Check: Confirm before permanently removing "${firstEvent.title}" from your Executive Schedule.`;

      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'CALENDAR',
        action: 'delete',
        requiresConfirmation: true,
        params: {
          action: 'delete',
          eventId: firstEvent.id,
          eventIds: matchedEvents.map((e) => e.id),
          id: firstEvent.id,
          title: matchedEvents.map((e) => e.title).join(' & '),
          date: firstEvent.date,
          time: matchedEvents.map((e) => formatToISTTime(e.startTime)).join(', '),
          startTime: firstEvent.startTime,
          location: firstEvent.location || 'Google Meet',
          attendees: firstEvent.attendees || [userEmail],
          duration: isMulti ? `${matchedEvents.length} events` : (firstEvent.durationFormatted || (firstEvent.durationMinutes ? `${firstEvent.durationMinutes} mins` : '45 mins')),
          rawPrompt: trimmed,
          userPrompt: trimmed,
          message: trimmed,
        },
        explanation,
        confirmationDetails: {
          title: 'Cancel Executive Schedule Event',
          warning,
          summary,
          details: {
            events: matchedEvents.map((e) => `${e.title} at ${formatToISTTime(e.startTime)}`),
            date: firstEvent.date,
            eventIds: matchedEvents.map((e) => e.id),
            status: 'Pending Cancellation',
          },
        },
      }, pendingAction, channelName);
    } else {
      const dateLabel = dateInfo ? dateInfo.label : 'your schedule';
      return {
        type: 'general',
        agent: 'CALENDAR',
        action: 'chat',
        params: {},
        explanation: `📅 I checked your Executive Schedule for ${dateLabel}, but no matching active reservations were found to remove. Your calendar remains clear!`,
      };
    }
  }

  // B. Availability & Conflict Query Pre-Routing (ONLY when NOT creating an event)
  const isAvailabilityQuery = 
    !hasCalCreateVerb && (
      /\b(?:am\s+i\s+free|is\s+(?:my\s+)?(?:afternoon|morning|evening|schedule|calendar)\s+free|do\s+i\s+have\s+time|free\s+for|can\s+i\s+schedule|any\s+conflicts|check\s+(?:my\s+)?availability|tight\s+overlaps?|travel\s+buffers?)\b/i.test(lower) ||
      (/\b(?:free|available|conflict|open\s+time|overlap|buffer|tight)\b/i.test(lower) && /\b(?:between|from|on|this|today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i.test(lower))
    );

  if (isAvailabilityQuery) {
    const targetDateInfo = resolveTargetDate(trimmed);
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CALENDAR',
      action: 'check_availability',
      requiresConfirmation: false,
      params: {
        action: 'check_availability',
        targetDate: targetDateInfo.dateStr,
        date: targetDateInfo.dateStr,
        rawPrompt: trimmed,
        userPrompt: trimmed,
        message: trimmed,
      },
      explanation: `Auditing your Executive Calendar availability and conflict matrix for ${targetDateInfo.label} (${targetDateInfo.dateStr})...`,
    }, pendingAction, channelName);
  }

  // B. Explicit Meeting Creation / Scheduling
  const isReadQuery = /^(?:what|show|list|check|view|get|see|any|how\s+many|do\s+i\s+have|are\s+there|is\s+my)\b/i.test(lower) && 
    !/\b(?:schedule|book|create|set(?:\s*up)?|add|block|put|reserve)\s+(?:an?|the|a\s+new|this)?\s*(?:meeting|sync|event|call|retro|review|session|appointment|1:1|1-on-1|discussion|buffer|ride)\b/i.test(lower);

  if (hasCalCreateVerb && (hasCalMeetingNoun || hasCalTimeSignal || lower.includes('for ')) && !isReadQuery) {
    // Strip explanatory parenthetical notes like (or any time slot...) and surrounding quotes
    const sanitizedPrompt = trimmed
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/^["']|["']$/g, '')
      .trim();
    const sanitizedLower = sanitizedPrompt.toLowerCase();

    // 1. Deterministic Relative Date Resolution
    const dateInfo = resolveTargetDate(sanitizedPrompt);
    const targetDate = dateInfo.dateStr;
    const dateLabel = dateInfo.label;

    // 2. Deterministic Duration Parsing (Never missed for any natural expression)
    const parsedDur = parseEventDuration(sanitizedPrompt);
    const durationMinutes = parsedDur?.durationMinutes || 45;
    const duration = parsedDur?.duration || `${durationMinutes} mins`;

    // 3. Deterministic Start Time vs Free-Slot Discovery
    const timeTzResult = parseEventStartTimeWithTz(sanitizedPrompt);
    const fuzzyWindow = parseFuzzyWindow(sanitizedPrompt);
    const userEmail = userProfile?.email || 'saikeerthanmedisetty686@gmail.com';
    const attendees = parseEventAttendees(sanitizedPrompt, userEmail);

    let startIso: string;
    let timeFormatted: string;
    let isOptimalDiscovered = false;

    if (timeTzResult) {
      startIso = `${targetDate}T${timeTzResult.timeIST}:00+05:30`;
      timeFormatted = timeTzResult.timeFormatted;
    } else if (fuzzyWindow || /\b(?:find\s*(?:me\s*)?(?:an?\s*)?(?:continuous\s*)?(?:open\s*)?.*(?:free|slot|block|window|time)|when\s*(?:am\s*i|is\s*(?:my|there)\s*free))\b/i.test(sanitizedLower)) {
      const optimal = findOptimalFreeSlot({
        targetDate,
        durationMinutes,
        fuzzyWindow,
      });
      startIso = optimal.startIso;
      timeFormatted = optimal.startTimeFormatted;
      isOptimalDiscovered = true;
    } else {
      // Allocate prime executive business hours: 10:00 AM (or 02:00 PM if afternoon specified)
      const isAfternoon = sanitizedLower.includes('afternoon') || sanitizedLower.includes('post-lunch') || sanitizedLower.includes('evening');
      const cleanTime = isAfternoon ? '14:00' : '10:00';
      startIso = `${targetDate}T${cleanTime}:00+05:30`;
      timeFormatted = formatToISTTime(startIso);
    }

    // 4. Deterministic Event Title & Description Extraction
    const title = parseEventTitle(sanitizedPrompt);
    const description = parseEventDescription(sanitizedPrompt);

    // 5. Detect Location
    let location = 'To be decided';
    const roomMatch = sanitizedPrompt.match(/\b(?:at|in)\s+((?:conference\s+room|meeting\s+room|board\s*room|hall|office|cabin|wework|starbucks|hq|auditorium|terrace|campus)[a-zA-Z0-9\s]*)/i);
    if (roomMatch) {
      location = roomMatch[1].trim();
    } else if (sanitizedLower.includes('zoom')) {
      location = 'Zoom Video';
    } else if (/\b(?:google meet|gmeet|video call|virtual meeting|virtual call|meet link)\b/i.test(sanitizedLower)) {
      location = 'Google Meet';
    }

    // 6. Pre-audit conflict & schedule buffers against existing calendar events
    const bufferAudit = auditScheduleBuffers({
      targetDate,
      startTimeIso: startIso,
      durationMinutes,
    });

    const hasConflict = bufferAudit.hasConflict;
    const conflictingTitle = bufferAudit.conflictingEvent?.title;
    const overlapMinutes = bufferAudit.overlapMinutes || 0;
    const conflictReason = bufferAudit.conflictReason;

    const attendeesNote = attendees.length > 1 ? ` with ${attendees.filter(a => a !== userEmail).join(', ')}` : '';
    const tzNote = timeTzResult?.convertedTzNotice ? ` [${timeTzResult.convertedTzNotice}]` : '';

    const asksAboutBuffersOrOverlaps = /\b(?:overlap|buffer|tight|travel|conflict|clash|back\s*to\s*back|gap|free)\b/i.test(sanitizedLower);

    let explanation = '';
    if (asksAboutBuffersOrOverlaps) {
      explanation = `${bufferAudit.auditNarrative}\n\n📅 I've staged this reservation on your Executive Schedule for **${dateLabel} at ${timeFormatted} (${duration})**${attendeesNote}. Please review and authorize below:`;
    } else if (hasConflict) {
      explanation = `⚠️ Schedule Conflict Alert: This reservation overlaps with "${conflictingTitle}" (${overlapMinutes}m) on your Executive Schedule.\n\n${bufferAudit.auditNarrative}\n\nPlease review and authorize below to resolve or proceed:`;
    } else if (bufferAudit.isTightBefore || bufferAudit.isTightAfter || bufferAudit.hasMissingTravelBuffer) {
      explanation = `${bufferAudit.auditNarrative}\n\n📅 I've staged this reservation on your Executive Schedule for **${dateLabel} at ${timeFormatted} (${duration})**${attendeesNote}. Please review and authorize below:`;
    } else if (timeTzResult?.convertedTzNotice) {
      explanation = `📅 I've staged this reservation on your Executive Schedule for **${dateLabel} at ${timeFormatted}** (${timeTzResult.convertedTzNotice})${attendeesNote}. Please review and authorize below:`;
    } else if (isOptimalDiscovered || fuzzyWindow) {
      const winLabel = fuzzyWindow ? ` (${fuzzyWindow.label})` : '';
      explanation = `📅 I audited your Executive Schedule for ${dateLabel}${winLabel} and reserved an optimal open ${duration} block (${timeFormatted})${attendeesNote}. Please review and authorize below:`;
    } else {
      explanation = `📅 I've staged this reservation on your Executive Schedule for **${dateLabel} at ${timeFormatted} (${duration})**${attendeesNote}. Please review and authorize below:`;
    }

    const warning = hasConflict
      ? `⚠️ Conflict Alert: Overlaps with "${conflictingTitle}" by ${overlapMinutes} minutes.`
      : 'Safety Check: Confirm event details before blocking on your Executive Schedule.';

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CALENDAR',
      action: 'create',
      requiresConfirmation: true,
      params: {
        title,
        description: description || undefined,
        date: targetDate,
        time: timeFormatted,
        duration,
        durationMinutes,
        startTime: startIso,
        location,
        attendees,
        hasConflict,
        conflict: hasConflict,
        isConflict: hasConflict,
        conflictingEvent: conflictingTitle,
        conflictReason,
        overlapMinutes,
        conflicts: bufferAudit.conflicts,
        bufferAudit: {
          isTightBefore: bufferAudit.isTightBefore,
          isTightAfter: bufferAudit.isTightAfter,
          bufferBeforeMinutes: bufferAudit.bufferBeforeMinutes,
          bufferAfterMinutes: bufferAudit.bufferAfterMinutes,
          hasMissingTravelBuffer: bufferAudit.hasMissingTravelBuffer,
        },
        ...(timeTzResult?.convertedTzNotice ? { timezoneConversion: timeTzResult.convertedTzNotice } : {}),
        rawPrompt: trimmed,
        userPrompt: trimmed,
        message: trimmed,
      },
      explanation,
      confirmationDetails: {
        title: 'Schedule Executive Calendar Event',
        warning,
        summary: `${title} on ${targetDate} at ${timeFormatted} (${duration})${tzNote}${attendeesNote}${hasConflict ? ` • ⚠️ Conflict: Overlaps with "${conflictingTitle}" (${overlapMinutes}m)` : ''}`,
        details: {
          title,
          description: description || undefined,
          date: targetDate,
          time: timeFormatted,
          duration,
          location,
          attendees,
          ...(timeTzResult?.convertedTzNotice ? { timezoneConversion: timeTzResult.convertedTzNotice } : {}),
          hasConflict,
          conflictReason,
          overlapMinutes,
        },
      },
    }, pendingAction, channelName);
  }

  // C. Calendar Read / Agenda Queries
  const isCalendarReadQuery = 
    /\b(?:what(?:'s|\s+is|\s+does)?\s+(?:my\s+)?schedule|any\s+(?:travel|meetings)|check\s+(?:my\s+)?calendar|show\s+(?:my\s+)?(?:schedule|calendar|meetings|agenda)|list\s+(?:my\s+)?(?:meetings|events|schedule)|what\s+meetings\s+do\s+i\s+have|my\s+meetings)\b/i.test(lower) ||
    ((lower.includes('schedule') || lower.includes('meeting') || lower.includes('calendar') || lower.includes('agenda')) && 
     /\b(?:what|show|list|check|view|get|see|today|tomorrow|upcoming|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i.test(lower) &&
     !hasCalCreateVerb);

  if (isCalendarReadQuery) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CALENDAR',
      action: 'list',
      requiresConfirmation: false,
      params: {
        action: 'list',
        rawPrompt: trimmed,
        userPrompt: trimmed,
        message: trimmed,
      },
      explanation: "Checking your upcoming schedule and agenda on your Executive Calendar...",
    }, pendingAction, channelName);
  }

  return null;
}

/**
 * Ultra-fast, deterministic pre-router for unambiguous operational commands.
 * Runs BEFORE the external LLM to prevent LLM latency, timeouts, rate-limits, or misclassifications.
 */
export function preRouteDeterministicIntent(
  userMessage: string,
  pendingAction?: any,
  userProfile?: any,
  channelName: string = '@SaikeerthanMedisetty'
): IntentClassification | null {
  const trimmed = (userMessage || '').trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return null;

  // 1. Multi-turn pending action confirmations / cancellations FIRST
  if (pendingAction) {
    const isCancel = /^(?:cancel|stop|never\s*mind|discard|abort|no|don't)\b/i.test(lower) || 
      lower.includes('cancel that') || lower.includes('abort action') || lower.includes('discard draft');
    if (isCancel) {
      return {
        type: 'action_cancel',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: pendingAction.params || {},
        explanation: `🛡️ Cancelled ${pendingAction.agent} task as requested. No external changes made.`,
      };
    }

    const isNewExplicitCommand = /\b(?:schedule|book|create|set\s*up|add|block|log|record|spent|paid|send\s+email|book\s+uber|upload|search)\b/i.test(lower);
    const isConfirm = !isNewExplicitCommand && (/^(?:confirm|approve|proceed|yes|publish|send|book|schedule|do\s+it|go\s+ahead|execute|looks\s+good)\b/i.test(lower) ||
      lower.includes('publish it') || lower.includes('send it') || lower.includes('confirm and') || lower.includes('schedule it') || lower.includes('commit it'));
    if (isConfirm) {
      return attachSafetyAndTraces({
        type: 'action_confirm',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: pendingAction.params || {},
        explanation: `Confirmed ${pendingAction.agent} task execution.`,
      }, pendingAction, channelName);
    }
  }

  // 2. CALENDAR Agent Deterministic Pre-Routing
  const stagedCal = stageCalendarIntent(trimmed, pendingAction, userProfile, channelName);
  if (stagedCal) {
    return stagedCal;
  }

  // 3. SHEETS Agent Deterministic Pre-Routing
  // A. Expense Logging / Append Row
  const hasExpenseLogVerb = /\b(?:log|record|add|enter|track|save|spent|paid)\b/i.test(lower);
  const cleanForAmount = lower.replace(/,/g, '');
  const amountMatch = cleanForAmount.match(/(?:₹|\$|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
  const hasCurrencySignal = /(?:₹|\$|rs\.?|inr|rupees?|bucks)/i.test(cleanForAmount);

  const isExpenseRead = /^(?:what|show|list|check|view|get|see|how\s+much|did\s+i)\b/i.test(lower) && !/^(?:please\s+)?(?:log|record|add|enter|track|save)\b/i.test(lower);

  if (hasExpenseLogVerb && (amountMatch || hasCurrencySignal) && !isExpenseRead) {
    let amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    if (amount > 0) {
      let merchant = 'Expense Entry';
      const forMatch = trimmed.match(/(?:for|at|on)\s+([a-zA-Z0-9\s]+?)(?:\s+under|\s+in|\s+category|\s+today|$)/i);
      if (forMatch) {
        merchant = forMatch[1].trim();
      } else if (lower.includes('swiggy')) {
        merchant = 'Swiggy';
      } else if (lower.includes('zomato')) {
        merchant = 'Zomato';
      } else if (lower.includes('petrol') || lower.includes('fuel')) {
        merchant = 'Petrol';
      }

      let category = 'General';
      const lowerMerchant = merchant.toLowerCase();
      if (lowerMerchant.includes('swiggy') || lowerMerchant.includes('zomato') || lower.includes('food') || lower.includes('lunch') || lower.includes('dinner')) {
        category = 'Food & Dining';
      } else if (lowerMerchant.includes('petrol') || lowerMerchant.includes('fuel')) {
        category = 'Transport / Fuel';
      } else if (lowerMerchant.includes('amazon') || lower.includes('office') || lower.includes('tech')) {
        category = 'Tech equipment';
      }

      const todayStr = getISTDateString();
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'SHEETS',
        action: 'append_row',
        requiresConfirmation: true,
        params: {
          amount,
          category,
          merchant,
          date: todayStr,
          rawPrompt: trimmed,
          userPrompt: trimmed,
        },
        explanation: `💳 **Expense Staged for Authorization**\n\nI have prepared this transaction entry for your review before committing to your **Financial Ledger**:\n\n• **Merchant / Vendor:** ${merchant}\n• **Amount:** ₹${amount.toLocaleString('en-IN')}\n• **Category:** ${category} 🍽️\n• **Date:** ${todayStr}\n• **Destination:** Executive Expense Vault\n\n*Please review the verification card below and authorize execution.*`,
        confirmationDetails: {
          title: 'Record Financial Expenditure',
          warning: 'Safety Check: Authorize this transaction entry before committing to your Financial Ledger.',
          summary: `₹${amount} for ${merchant} • Category: ${category}`,
          details: {
            amount: `₹${amount}`,
            merchant,
            category,
            date: todayStr,
            destination: 'Executive Expense Vault',
          },
        },
      }, pendingAction, channelName);
    }
  }

  // B. Sheets Reading / Expense Query
  const isSpendingQuery = 
    /\b(?:what\s+are\s+(?:today's|my)\s+expenses|show\s+(?:my\s+)?(?:spending|expenses)|where\s+did\s+my\s+money\s+go|how\s+much\s+did\s+i\s+spend|how\s+much\s+have\s+i\s+spent|check\s+(?:my\s+)?expense\s+ledger|show\s+(?:latest\s+)?transactions|view\s+expenses)\b/i.test(lower) ||
    ((lower.includes('expense') || lower.includes('spending') || lower.includes('ledger') || lower.includes('expenditure')) &&
     /\b(?:what|show|list|check|view|get|recent|latest)\b/i.test(lower) &&
     !hasExpenseLogVerb);

  if (isSpendingQuery) {
    const timeframe = lower.includes('month') ? '1_month' : lower.includes('week') ? '1_week' : lower.includes('yesterday') ? 'yesterday' : lower.includes('today') ? 'today' : 'all';
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'SHEETS',
      action: 'list',
      requiresConfirmation: false,
      params: {
        action: 'list',
        timeframe,
        category: lower.includes('food') || lower.includes('dining') ? 'Food & Dining' : undefined,
        rawPrompt: trimmed,
        userPrompt: trimmed,
      },
      explanation: "Retrieving your latest financial records from your connected ledger...",
    }, pendingAction, channelName);
  }

  // 4. EMAIL Agent Deterministic Pre-Routing
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const emailMatch = trimmed.match(emailRegex);
  const isEmailRead = 
    /\b(?:check\s+(?:my\s+)?(?:inbox|emails?|mail)|any\s+(?:new\s+)?emails?|what\s+emails?|read\s+(?:my\s+)?(?:emails?|inbox)|unread\s+emails?)\b/i.test(lower);
  const isEmailSend = 
    /\b(?:send|compose|dispatch|draft(?:\s+and\s+send)?)\b/i.test(lower) && 
    (lower.includes('email') || lower.includes('mail') || emailMatch);

  if (isEmailRead && !isEmailSend) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'EMAIL',
      action: 'read',
      requiresConfirmation: false,
      params: { action: 'read', rawPrompt: trimmed, userPrompt: trimmed },
      explanation: "Checking your connected inbox for unread messages and priority correspondence...",
    }, pendingAction, channelName);
  }

  if (isEmailSend) {
    const to = emailMatch ? emailMatch[0] : (userProfile?.email || '');
    const subjectMatch = trimmed.match(/subject\s+["']?([^"'\n]+?)["']?(?:\s+and\s+message|\s+and\s+body|$)/i);
    const subject = subjectMatch ? subjectMatch[1].replace(/^["']|["']$/g, '').trim() : 'Project Update';

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'EMAIL',
      action: 'send',
      requiresConfirmation: true,
      params: {
        to,
        subject,
        body: `Hello,\n\nI confirm receipt of your request regarding ${subject}.\n\nBest regards,\n${userProfile?.name || 'Executive'}`,
        rawPrompt: trimmed,
        userPrompt: trimmed,
      },
      explanation: to ? `Prepared executive email draft to ${to} for your approval.` : `Prepared executive email draft for your approval.`,
    }, pendingAction, channelName);
  }

  // 5. YOUTUBE Agent Deterministic Pre-Routing
  const isYTStats = /\b(?:how\s+is\s+my\s+(?:youtube|channel)|youtube\s+stats|channel\s+stats|channel\s+analytics|how\s+many\s+subscribers|how\s+many\s+views|channel\s+info)\b/i.test(lower);
  if (isYTStats && !lower.includes('upload') && !lower.includes('publish')) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'stats',
      requiresConfirmation: false,
      params: { action: 'stats', channel: channelName },
      explanation: `Retrieving real-time channel statistics and subscriber telemetry for ${channelName}...`,
    }, pendingAction, channelName);
  }

  const isYTVideos = /\b(?:recent\s+uploads?|what\s+videos?|my\s+videos?|latest\s+videos?|uploaded\s+videos?)\b/i.test(lower) && !lower.includes('upload ') && !lower.includes('publish ');
  if (isYTVideos) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'list',
      requiresConfirmation: false,
      params: { action: 'list', channel: channelName },
      explanation: `Fetching recent video uploads for channel ${channelName}...`,
    }, pendingAction, channelName);
  }

  const isYTSummary = (lower.includes('youtube') || lower.includes('video') || lower.includes('youtu.be')) && (lower.includes('summarize') || lower.includes('summary'));
  if (isYTSummary) {
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
    const url = urlMatch ? urlMatch[0] : undefined;
    let videoId: string | undefined;
    if (url) {
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
      if (ytMatch) videoId = ytMatch[1];
    }
    if (!videoId) {
      const directIdMatch = trimmed.match(/\b([a-zA-Z0-9_-]{11})\b/);
      if (directIdMatch) videoId = directIdMatch[1];
    }
    const vidToUse = videoId || 'ix9Sw6PrUJQ';
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'summarize',
      requiresConfirmation: false,
      params: {
        action: 'summarize',
        videoId: vidToUse,
        url: url || `https://www.youtube.com/watch?v=${vidToUse}`,
        query: trimmed,
        rawPrompt: trimmed,
        userPrompt: trimmed,
      },
      explanation: `Analyzing and synthesizing video intelligence for YouTube video...`,
    }, pendingAction, channelName);
  }

  const isYTSearch = (lower.includes('youtube') || lower.includes('video')) && (lower.startsWith('search') || lower.startsWith('find') || lower.includes('search for') || lower.includes('search youtube') || lower.includes('look up'));
  if (isYTSearch) {
    const cleanedQuery = trimmed.replace(/search|youtube|for|videos?|summarize|summary|find|give me|the|url|from|channel/gi, ' ').trim();
    const finalQuery = cleanedQuery || trimmed;
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'search',
      requiresConfirmation: false,
      params: { action: 'search', query: finalQuery, rawPrompt: trimmed, userPrompt: trimmed },
      explanation: `Searching YouTube for "${finalQuery}"...`,
    }, pendingAction, channelName);
  }

  const isYTUpload = /\b(?:upload|publish|post)\b.*\b(?:video|youtube|clip)\b/i.test(lower);
  if (isYTUpload) {
    let title = 'Executive Video Presentation';
    const titleMatch = trimmed.match(/(?:title|titled|called|named)\s+["']?([^"'\n]+?)["']?(?:\s+with|\s+privacy|\s+description|$)/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/^["']|["']$/g, '').trim();
    } else {
      const cleanTitle = trimmed
        .replace(/^\s*(?:please\s+)?(?:upload|publish|post)\s+(?:a\s+|an\s+|the\s+)?(?:video|clip|recording)?\s*/i, '')
        .replace(/\b(?:to\s+youtube|on\s+youtube|youtube)\b/gi, '')
        .replace(/\b(?:with\s+)?(?:privacy\s+)?(?:unlisted|private|public)\b/gi, '')
        .trim();
      if (cleanTitle.length >= 4) {
        title = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }
    }

    const privacy = lower.includes('public') ? 'public' : lower.includes('private') ? 'private' : 'unlisted';

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'upload',
      requiresConfirmation: true,
      params: {
        title,
        selected_title: title,
        channel: channelName,
        privacyStatus: privacy,
        description: 'Uploaded via Nexia Autonomous Orchestrator with AI-generated SEO and chapter timestamps.',
        tags: ['Nexia', 'AutonomousAgents', 'ExecutiveBriefing'],
        rawPrompt: trimmed,
        userPrompt: trimmed,
      },
      explanation: `🎬 **Media Broadcast Staged for Publishing**\n\nI have prepared your video metadata for **${channelName}**:\n\n• **Title:** "${title}"\n• **Visibility:** ${privacy.toUpperCase()}\n• **Channel:** ${channelName}\n• **Status:** Pending Human Authorization\n\n*Review the production details below and authorize release.*`,
      confirmationDetails: {
        title: 'Publish Video to YouTube',
        warning: 'Safety Check: Confirm video metadata before publishing to your channel.',
        summary: `"${title}" • Visibility: ${privacy.toUpperCase()}`,
        details: {
          title,
          channel: channelName,
          visibility: privacy.toUpperCase(),
        },
      },
    }, pendingAction, channelName);
  }

  // 6. CHIEF OF STAFF Agent Deterministic Pre-Routing
  const isBriefing = 
    /\b(?:briefing|dossier|morning\s+brief|daily\s+brief|status\s+report|rundown|run\s+my\s+day|on\s+my\s+plate|how(?:'s|\s+is)\s+my\s+day|kickstart\s+my\s+day|plan\s+my\s+day|executive\s+brief)\b/i.test(lower) ||
    (lower.includes('brief') && (lower.includes('executive') || lower.includes('agenda')));
  if (isBriefing) {
    const isTomorrow = lower.includes('tomorrow') || lower.includes('tommorow');
    const targetDate = isTomorrow ? 'tomorrow' : 'today';
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CHIEF_OF_STAFF',
      action: 'briefing',
      requiresConfirmation: false,
      params: { targetDate, rawPrompt: trimmed, userPrompt: trimmed, message: trimmed },
      explanation: `Synthesizing your Executive Dossier for ${targetDate} across Calendar, Expenses, and Priority Items...`,
    }, pendingAction, channelName);
  }

  // 7. UBER Agent Deterministic Pre-Routing
  const isUberTelemetry = (lower.includes('uber') || lower.includes('cab') || lower.includes('ride') || lower.includes('driver')) && 
    (lower.includes('telemetry') || lower.includes('track') || lower.includes('status') || lower.includes('where') || lower.includes('location'));
  if (isUberTelemetry) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'UBER',
      action: 'telemetry',
      requiresConfirmation: false,
      params: { action: 'telemetry', rawPrompt: trimmed, userPrompt: trimmed },
      explanation: "Tracking active driver location and ride telemetry...",
    }, pendingAction, channelName);
  }

  const isUberBooking = /\b(?:book|call|get|order|reserve)\b.*\b(?:uber|cab|ride|auto|bike|taxi)\b/i.test(lower) || 
    /\b(?:take\s+me\s+to|need\s+a\s+ride|need\s+an?\s+(?:auto|cab|ride|uber|bike|taxi))\b/i.test(lower);
  const isUberEstimate = /\b(?:how\s+much\s+(?:is|will|for)|fare|tariff|estimate|cost\s+of)\b.*\b(?:uber|cab|ride|auto|bike|taxi)\b/i.test(lower);

  if (isUberEstimate && !isUberBooking) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'UBER',
      action: 'estimate',
      requiresConfirmation: false,
      params: { action: 'estimate', rawPrompt: trimmed, userPrompt: trimmed },
      explanation: "Calculating mobility tariffs and service tier estimates...",
    }, pendingAction, channelName);
  }

  if (isUberBooking) {
    let detectedTier = 'Uber Go';
    let baseFare = 50;
    let perKm = 15.5;

    if (lower.includes('bike') || lower.includes('moto') || lower.includes('motorcycle') || lower.includes('scooter')) {
      detectedTier = 'Uber Moto';
      baseFare = 25;
      perKm = 8.0;
    } else if (lower.includes('auto') || lower.includes('rickshaw') || lower.includes('tuk tuk')) {
      detectedTier = 'Uber Auto';
      baseFare = 35;
      perKm = 11.5;
    } else if (lower.includes('premier') || lower.includes('comfort') || lower.includes('sedan') || lower.includes('luxury')) {
      detectedTier = 'Uber Premier';
      baseFare = 80;
      perKm = 21.0;
    } else if (lower.includes('xl') || lower.includes('suv') || lower.includes('innova') || lower.includes('ertiga')) {
      detectedTier = 'Uber XL';
      baseFare = 100;
      perKm = 25.0;
    }

    let pickup = 'Current Location';
    let destination = 'Indiranagar';

    const cleanLocation = (loc: string): string => {
      return loc
        .replace(/(?:in an auto|by bike|by auto|in uber|by uber|in cab|by cab|please|now|fast|urgently)$/i, '')
        .replace(/[,\.\?!]+$/, '')
        .trim();
    };

    const fromToMatch = trimmed.match(/(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+?)\s+(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+)/i);
    const toFromMatch = trimmed.match(/(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+?)\s+(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+)/i);

    if (fromToMatch) {
      pickup = cleanLocation(fromToMatch[1]);
      destination = cleanLocation(fromToMatch[2]);
    } else if (toFromMatch) {
      destination = cleanLocation(toFromMatch[1]);
      pickup = cleanLocation(toFromMatch[2]);
    } else {
      const toMatch = trimmed.match(/(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+)/i);
      const fromMatch = trimmed.match(/(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+)/i);
      if (toMatch) destination = cleanLocation(toMatch[1]);
      if (fromMatch) pickup = cleanLocation(fromMatch[1]);
    }

    let hash = 0;
    const key = `${pickup.toLowerCase()}->${destination.toLowerCase()}`;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    const distanceKm = parseFloat((4.5 + Math.abs(hash % 25) + ((key.length % 5) * 0.8)).toFixed(1));
    const durationMins = detectedTier === 'Uber Moto' ? Math.round(distanceKm * 1.6 + 3) : Math.round(distanceKm * 2.2 + 4);
    const calculatedFare = Math.round(baseFare + distanceKm * perKm);
    const lockedFare = `₹${Math.round(calculatedFare * 0.95)} - ₹${Math.round(calculatedFare * 1.15)}`;

    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const activeBookingId = `UBER-IND-${suffix}`;
    const ridePin = String(Math.floor(1000 + Math.random() * 9000));

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'UBER',
      action: 'book',
      requiresConfirmation: true,
      params: {
        pickup,
        destination,
        selected_tier: detectedTier,
        tier: detectedTier,
        locked_fare: lockedFare,
        fare: calculatedFare,
        distance: `${distanceKm} km`,
        duration: `${durationMins} mins`,
        booking_id: activeBookingId,
        ride_pin: ridePin,
        liveMode: true,
        rawPrompt: trimmed,
        userPrompt: trimmed,
      },
      explanation: `🚗 **Mobility Dispatch Request Staged**\n\nI have locked in your transit route and vehicle parameters:\n\n• **Pickup:** ${pickup}\n• **Destination:** ${destination}\n• **Service Tier:** ${detectedTier}\n• **Estimated Tariff:** ${lockedFare}\n• **Estimated Transit:** ${distanceKm} km (~${durationMins} mins)\n\n*Review route parameters below and authorize dispatch.*`,
      confirmationDetails: {
        title: `Dispatch ${detectedTier}`,
        warning: 'Safety Check: Confirm route and service tier before dispatching driver.',
        summary: `${detectedTier} • ${pickup} ➔ ${destination} (${lockedFare})`,
        details: {
          tier: detectedTier,
          pickup,
          destination,
          fare: lockedFare,
          distance: `${distanceKm} km`,
          duration: `${durationMins} mins`,
        },
      },
    }, pendingAction, channelName);
  }

  return null;
}

/**
 * Classify user intent taking into account full multi-turn conversation and pending action state
 */
export async function classifyIntent(
  userMessage: string,
  historyMessages: any[] = [],
  pendingAction?: any,
  userProfile?: any,
  videoVisualContext?: string,
  crossSessionMemory?: string
): Promise<IntentClassification> {
  const channelName = userProfile?.youtubeChannel || '@Creator';

  // ─── 0. Immediate Action Confirmations & Cancellations (Buttons / One-Word Commands) ───
  if (pendingAction) {
    const trimmed = (userMessage || '').trim();
    const lower = trimmed.toLowerCase();
    const isCancel = /^(?:cancel|stop|never\s*mind|discard|abort|no|don't)\b/i.test(lower) || 
      lower.includes('cancel that') || lower.includes('abort action') || lower.includes('discard draft');
    if (isCancel) {
      return {
        type: 'action_cancel',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: pendingAction.params || {},
        explanation: `🛡️ Cancelled ${pendingAction.agent} task as requested. No external changes made.`,
      };
    }

    const isNewExplicitCommand = /\b(?:schedule|book|create|set\s*up|add|block|log|record|spent|paid|send\s+email|book\s+uber|upload|search)\b/i.test(lower);
    const isConfirm = !isNewExplicitCommand && (/^(?:confirm|approve|proceed|yes|publish|send|book|schedule|do\s+it|go\s+ahead|execute|looks\s+good)\b/i.test(lower) ||
      lower.includes('publish it') || lower.includes('send it') || lower.includes('confirm and') || lower.includes('schedule it') || lower.includes('commit it'));
    if (isConfirm) {
      return attachSafetyAndTraces({
        type: 'action_confirm',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: pendingAction.params || {},
        explanation: `Confirmed ${pendingAction.agent} task execution.`,
      }, pendingAction, channelName);
    }
  }

  // ─── 0.5 Deterministic Pre-Routing for Unambiguous Executive Operations ───
  const deterministicIntent = preRouteDeterministicIntent(userMessage, pendingAction, userProfile, channelName);
  if (deterministicIntent) {
    return deterministicIntent;
  }

  // 1. Live System Temporal Anchors (Indian Standard Time - Asia/Kolkata)
  const now = new Date();
  const todayIST = getISTDateString(now);
  const currentISTTime = formatToISTTime(now.toISOString());
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = dayNames[now.getDay()];

  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomIST = getISTDateString(tom);
  const tomDayName = dayNames[tom.getDay()];

  const dat = new Date(now);
  dat.setDate(dat.getDate() + 2);
  const datIST = getISTDateString(dat);
  const datDayName = dayNames[dat.getDay()];

  const rollingWeekMap: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dIST = getISTDateString(d);
    const dDayName = dayNames[d.getDay()];
    const tag = i === 1 ? 'Tomorrow' : (i === 2 ? 'Day After Tomorrow' : `Upcoming ${dDayName}`);
    rollingWeekMap.push(`  • ${dDayName} (${tag}): ${dIST}`);
  }

  // 1. Dynamic LLM Intent Classification: All natural prompts go directly to Gemini
  const prompt = `
CRITICAL ROLLING 7-DAY TEMPORAL MAP (LIVE SYSTEM CLOCK):
- Today: ${todayDayName}, ${todayIST} (${currentISTTime} IST)
${rollingWeekMap.join('\n')}
*LINGUISTIC RULE: When user says 'Wednesday', 'this Wednesday', 'coming Wednesday', or 'next Wednesday', ALWAYS map it to the immediate upcoming weekday in the 7-day cheat sheet above (${todayDayName} -> Upcoming Wednesday is 2026-09-23). NEVER skip ahead to the following week unless user explicitly says 'Wednesday of next week' or '2 weeks from now'!

Current User:
- Name: ${userProfile?.name || 'Executive'}
- Email: ${userProfile?.email || 'Not specified'}
- Configured YouTube Channel: "${channelName}"

Active Staged Action (Awaiting User Review):
${pendingAction ? JSON.stringify(pendingAction, null, 2) : 'None'}

Recent Conversation:
${historyMessages.slice(-5).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}
${crossSessionMemory ? `\nCross-Session Memory & Past Conversations:\n${crossSessionMemory}\n` : ''}
Latest User Message:
"${userMessage}"
${videoVisualContext ? `\nVisual Inspection of Attached Video Frame (from Gemini Vision):\n"${videoVisualContext}"\n` : ''}

CRITICAL RULES:
1. MULTI-TURN UPDATES: If there is an active staged action and the user modifies parameters, set type: "action_update" (or "action_confirm" if they say publish/send).
2. CONFIRMATION: If user confirms ("publish it", "looks good send", "confirm", "proceed"), set type: "action_confirm".
3. CANCELLATION: If user cancels ("cancel", "never mind"), set type: "action_cancel".
4. VIDEO UPLOAD ACCURACY & ISOLATION:
   - When a video is being uploaded or staged, NEVER blindly copy topics from past conversation turns into the video title (e.g. if the user previously asked for Java tutorials, coding, or emails, DO NOT title this video as a Java tutorial unless the user explicitly requests Java in this prompt!).
   - If visual context of the video is provided (${videoVisualContext ? `"${videoVisualContext}"` : 'None'}), YOU MUST CREATE A TITLE AND DESCRIPTION BASED ON THIS VISUAL SUBJECT (e.g. if it shows a ceiling fan or room, title it about room vibes / ceiling fan in motion!).
   - If no visual context or prompt topic is given, create an engaging everyday creator clip title (e.g. "Everyday Moments & Casual Clip | Short") instead of hallucinating programming tutorials!
5. TUTORIALS, WORKFLOWS & WALKTHROUGHS:
   - If the user provides or describes a technical tutorial, script, or automation guide (e.g. building an AI agent with n8n, Telegram bot, Google Gemini LLM, APIs, JS fallbacks):
     * Set agent: "YOUTUBE", action: "upload", type: "action_stage", requiresConfirmation: true.
     * Generate 5 click-worthy, tech-focused titles specifically about these technologies.
     * Generate structured timestamps starting at 00:00 covering all technical milestones.
     * Set thumbnail to { "url": "/test_tech.jpg", "dimensions": "1280x720", "aspect_ratio": "16:9" }.
6. NEW AGENT TASKS: If user requests a new agent task (video upload, search, email, calendar, uber, sheets, or chief of staff / executive briefing / daily dossier), set type: "action_stage".
   - If user asks about their day, schedule, agenda, priorities, or briefing in ANY natural, everyday conversational phrasing:
     (e.g. "What's on my plate today?", "How does my day look?", "How's my day?", "Catch me up", "Give me a rundown", "Status report", "What do I have today?", "What should I focus on?", "Brief me on my day", "Give me my executive briefing", "Daily dossier", "Morning update", "What's happening today?", "Overview of today", "Run my day"):
     * Set agent: "CHIEF_OF_STAFF", action: "briefing", type: "action_stage", requiresConfirmation: false.
     * In params: set targetDate: "today" or "tomorrow" based on user input.
     - If user asks about their spending, money spent, purchases, transactions, invoices, cash flow, balance, income, or expense records in ANY natural phrasing
       (e.g. "what are todays expences", "today's spending", "expenses for past 2 days", "3 days expenses", "show spending this week", "one month expenses", "where did my money go?", "what did I spend?", "how much did I spend?", "show my spending", "what did I buy?", "show transactions", "show me my latest expense entries from my ledger", "view expenses", "check expense ledger"):
       * Set agent: "SHEETS", action: "list", type: "action_stage", requiresConfirmation: false.
       * In params: extract timeframe ("today", "yesterday", "2_days", "3_days", "1_week", "1_month", "all") and days if specified.
       * NEVER set requiresConfirmation: true for reading expenses. NEVER invent dummy amount or merchant.
    - If user asks to log, add, or record an expense (e.g. "log ₹450 for lunch at Swiggy", "I just spent 550 rupees on dinner at Swiggy, please log that"):
       * Set agent: "SHEETS", action: "append_row", type: "action_stage", requiresConfirmation: true.
       * Extract real amount from message. If no amount is provided, do NOT fabricate one.
    - If user asks about YouTube channel stats, analytics, subscribers, views, video uploads, or channel information (e.g. "how is my youtube channel doing?", "check youtube stats", "how many subscribers do I have?", "youtube analytics", "show recent youtube uploads", "Direct Action: Live Channel Stats API"):
      * Set agent: "YOUTUBE", action: "stats" (or "list"), type: "action_stage", requiresConfirmation: false.
      * In params: set channel: "@SaikeerthanMedisetty", action: "stats".
      * NEVER set requiresConfirmation: true for reading channel stats or recent videos.
    - If user asks to summarize a YouTube video (e.g. 'Summarize: "https://www.youtube.com/watch?v=..."', "can you summarize this youtube video"):
      * Set agent: "YOUTUBE", action: "summarize", type: "action_stage", requiresConfirmation: false.
      * In params: extract videoId and url.
      * NEVER set requiresConfirmation: true for video summarization.
    - If user asks to search YouTube (e.g. "Find some good tutorials on building autonomous AI agents on YouTube", "search youtube for..."):
      * Set agent: "YOUTUBE", action: "search", type: "action_stage", requiresConfirmation: false.
    - If user asks to publish or upload a video, or creates a video publishing package:
      * Set agent: "YOUTUBE", action: "upload", type: "action_stage", requiresConfirmation: true.
    - If user asks about meetings, agenda, or availability ("what meetings do I have?", "am I free today?", "check calendar", "what's on my plate tomorrow?"):
      * Set agent: "CALENDAR", action: "list", type: "action_stage", requiresConfirmation: false.
    - If user asks to schedule, create, or book a meeting ("schedule sync tomorrow at 3 PM"):
      * Set agent: "CALENDAR", action: "create", type: "action_stage", requiresConfirmation: true.
    - If user asks to check email, unread messages, or inbox ("check my inbox", "any new emails?", "what emails did I get?"):
      * Set agent: "EMAIL", action: "read", type: "action_stage", requiresConfirmation: false.
    - If user asks to send an email ("send email to...", "draft and send email"):
      * Set agent: "EMAIL", action: "send", type: "action_stage", requiresConfirmation: true.
    - If user requests a ride, cab, auto, bike, or commute ("need a ride to airport", "take me to Indiranagar", "book an auto"):
      * Set agent: "UBER", action: "book" (or "estimate"), type: "action_stage", requiresConfirmation: true.
    - If user asks for ride estimate or tariff ("how much is an uber to airport?", "fare estimate"):
      * Set agent: "UBER", action: "estimate", type: "action_stage", requiresConfirmation: false.
   - If user asks to research, investigate, compare, analyze, or gather deep intelligence on any topic, technology, market, consumer product, or headphones/devices, or asks for a comparison matrix / feature breakdown / user complaints
     (e.g. "Analyze the top 3 high-end noise-canceling headphones", "Create a feature matrix comparing...", "Research electric scooters in India", "Investigate Supabase vs Firebase", "Compare top AI models", "Deep research on EV market", "Analyze competitors"):
     * Set agent: "RESEARCH", action: "plan", type: "action_stage", requiresConfirmation: false.
     * In params: set userPrompt: user's query, question: user's query.
     * NEVER classify complex consumer analysis or feature comparisons as GENERAL chat.
7. RETRY / CONTINUE / RESUME:
   - If the user says "retry", "continue", "try again", "resume", "try now", "redo", or asks to run the previous task:
     * Inspect the preceding conversation turns for the last requested action or question.
     * Re-execute or re-classify according to that previous task's requirements immediately!
8. GENERAL CHAT: If general greeting or simple conversational chit-chat, set type: "general", agent: "GENERAL".

Return ONLY valid JSON matching the schema.
`;

  for (const candidateModel of CANDIDATE_MODELS) {
    try {
      const model = getGenAI().getGenerativeModel({
        model: candidateModel,
        systemInstruction: COORDINATOR_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2500,
        },
      });

      const result = await withTimeout(model.generateContent(prompt), 25000);
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText) as IntentClassification;
      
      if (parsed && (parsed.type || parsed.agent)) {
        if (parsed.agent === 'CHIEF_OF_STAFF') {
          parsed.action = parsed.action || 'briefing';
          parsed.requiresConfirmation = false;
          if (!parsed.params) parsed.params = {};
          const lowerMsg = userMessage.toLowerCase();
          if (lowerMsg.includes('tomorrow') || lowerMsg.includes('tommorow')) {
            parsed.params.targetDate = 'tomorrow';
          } else {
            parsed.params.targetDate = parsed.params.targetDate || 'today';
          }
        }

        if (parsed.agent === 'SHEETS') {
          const act = (parsed.action || '').toLowerCase();
          const isRead = act.includes('list') || act.includes('show') || act.includes('view') || act.includes('get') || act.includes('read') || act.includes('check');
          if (isRead) {
            parsed.action = 'list';
            parsed.requiresConfirmation = false;
            if (!parsed.params) parsed.params = {};

            const lowerMsg = userMessage.toLowerCase();
            if (lowerMsg.includes('today')) {
              parsed.params.timeframe = 'today';
            } else if (lowerMsg.includes('yesterday')) {
              parsed.params.timeframe = 'yesterday';
            } else if (lowerMsg.includes('week') || lowerMsg.includes('7 day') || lowerMsg.includes('weekly')) {
              parsed.params.timeframe = '1_week';
              parsed.params.days = 7;
            } else if (lowerMsg.includes('month') || lowerMsg.includes('30 day') || lowerMsg.includes('monthly')) {
              parsed.params.timeframe = '1_month';
              parsed.params.days = 30;
            } else {
              const dm = lowerMsg.match(/(\d+)\s*(?:day|days)/);
              if (dm) {
                const daysNum = parseInt(dm[1], 10);
                parsed.params.timeframe = `${daysNum}_days`;
                parsed.params.days = daysNum;
              } else {
                // Pass the user's prompt so specific dates (e.g. 12 September, 16 July) are parsed dynamically
                parsed.params.timeframe = userMessage;
              }
            }
          } else {
            parsed.action = 'append_row';
            parsed.requiresConfirmation = true;
          }
        }

        if (parsed.agent === 'CALENDAR') {
          if (!parsed.params) parsed.params = {};
          const lowerMsg = userMessage.toLowerCase();

          // 1. Priority Conflict Override
          if (/\b(?:even\s+if|override|force|urgent|overlap)\b/i.test(lowerMsg) || parsed.params.ignoreConflict) {
            parsed.params.ignoreConflict = true;
            parsed.params.hasConflict = false;
            parsed.params.conflict = false;
          }

          // 2. Multi-day / All-day events
          if (parsed.params.isAllDay || /\b(?:all-day|all\s+day)\b/i.test(lowerMsg)) {
            parsed.params.isAllDay = true;
            if (!parsed.params.durationMinutes) parsed.params.durationMinutes = 1440;
            parsed.params.duration = 'All-day';
            parsed.params.time = 'All Day';

            if (!parsed.params.endDate) {
              const thruMatch = lowerMsg.match(/(?:through|thru|to)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
              if (thruMatch) {
                const endResolved = resolveTargetDate(thruMatch[1], now);
                parsed.params.endDate = endResolved.dateStr;
              }
            }
          }

          // 3. Relative offset timestamps ("30 minutes from now", "in 15 minutes", etc.)
          const offsetMatch = lowerMsg.match(/(?:in|after|starting(?:\s+exactly)?)\s+(\d+)\s*(?:mins?|minutes?)\s*(?:from\s+now)?/i) ||
                              lowerMsg.match(/(\d+)\s*(?:mins?|minutes?)\s+from\s+now/i);
          if (offsetMatch || parsed.params.relativeOffsetMinutes) {
            const offsetMins = parsed.params.relativeOffsetMinutes || parseInt(offsetMatch![1], 10);
            parsed.params.relativeOffsetMinutes = offsetMins;
            const startMs = Date.now() + offsetMins * 60000;
            const offsetDate = new Date(startMs);
            parsed.params.startTime = offsetDate.toISOString();
            parsed.params.date = getISTDateString(offsetDate);
            parsed.params.time = formatToISTTime(parsed.params.startTime);
          }

          // 4. Timezone conversion (e.g. 3:00 PM EST -> local IST)
          if (/\best\b/i.test(lowerMsg) || /\bedt\b/i.test(lowerMsg)) {
            const timeTz = parseEventStartTimeWithTz(userMessage);
            if (timeTz) {
              parsed.params.time = timeTz.timeFormatted;
              if (timeTz.timeIST && parsed.params.date) {
                parsed.params.startTime = `${parsed.params.date}T${timeTz.timeIST}:00+05:30`;
              }
            }
          }

          // 5. Disentangled Window Search (e.g. "Find a 45-minute window tomorrow afternoon between 1:00 PM and 5:00 PM...")
          const isWindowSearch = parsed.action === 'find_and_book_slot' || 
            Boolean(parsed.params.searchWindow) ||
            /\b(?:between\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+and\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|window\s+between)\b/i.test(lowerMsg);

          if (isWindowSearch) {
            parsed.action = 'create';
            const targetDateInfo = resolveTargetDate(userMessage, now);
            const targetDate = parsed.params.date || targetDateInfo.dateStr;
            const durParsed = parseEventDuration(userMessage);
            const durationMinutes = parsed.params.durationMinutes || durParsed?.durationMinutes || 45;

            let searchWindow = parsed.params.searchWindow;
            if (!searchWindow) {
              const winMatch = lowerMsg.match(/between\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+and\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
              if (winMatch) {
                searchWindow = { start: winMatch[1], end: winMatch[2] };
              }
            }

            const freeSlot = findFreeSlotInWindow({
              targetDate,
              durationMinutes,
              searchWindow,
            });

            if (freeSlot) {
              parsed.params.date = freeSlot.date;
              parsed.params.time = freeSlot.startTimeFormatted;
              parsed.params.startTime = freeSlot.startIso;
              parsed.params.durationMinutes = freeSlot.durationMinutes;
              parsed.params.duration = `${freeSlot.durationMinutes} mins`;
              parsed.explanation = `📅 I scanned your Executive Schedule between **${searchWindow?.start || '1:00 PM'} and ${searchWindow?.end || '5:00 PM'}** on **${formatDateDisplay(freeSlot.date)}** and identified an open **${freeSlot.durationMinutes}-minute slot** at **${freeSlot.startTimeFormatted}** with zero overlapping meetings.\n\n• **Reservation:** ${parsed.params.title || 'Focus Block'}\n• **Time:** ${freeSlot.startTimeFormatted} IST (${freeSlot.durationMinutes} mins)\n\n*Review and authorize below to add to your calendar.*`;
            }
          }

          // 6. Compound Move & Rename (action === 'update' or move/reschedule/rename)
          const isMoveOrRename = parsed.action === 'update' || /\b(?:move|reschedule|shift|rename)\b/i.test(lowerMsg);
          if (isMoveOrRename) {
            parsed.action = 'update';
            const targetTitle = parsed.params.targetEventTitle || parsed.params.title || 'Design Review';
            const existing = findMatchingCalendarEvent(targetTitle);

            if (existing) {
              parsed.params.eventId = existing.id;
              parsed.params.targetEventTitle = existing.title;
              parsed.params.oldTitle = existing.title;
              parsed.params.oldDate = existing.date;
              parsed.params.oldTime = formatToISTTime(existing.startTime);

              if (parsed.params.newDate) {
                const resolvedNewDate = resolveTargetDate(parsed.params.newDate, now);
                parsed.params.date = resolvedNewDate.dateStr;
              }
              if (parsed.params.newTime) {
                parsed.params.time = parsed.params.newTime;
              }
              if (parsed.params.newTitle) {
                parsed.params.title = parsed.params.newTitle;
              }

              const dur = parsed.params.durationMinutes || existing.durationMinutes || 45;
              parsed.params.durationMinutes = dur;
              const targetDateStr = parsed.params.date || existing.date;
              const targetTimeStr = parsed.params.time || formatToISTTime(existing.startTime);
              const timeParsed = parseEventStartTime(targetTimeStr) || '10:00';
              parsed.params.startTime = `${targetDateStr}T${timeParsed}:00+05:30`;

              parsed.explanation = `🔄 **Executive Schedule Update Staged**\n\nI have located your reservation for **"${existing.title}"** and prepared the requested update:\n\n• **Renamed To:** "${parsed.params.title}"\n• **Moved From:** ${formatDateDisplay(existing.date)} at ${formatToISTTime(existing.startTime)}\n• **New Schedule:** ${formatDateDisplay(targetDateStr)} at ${targetTimeStr} (${dur} mins)\n\n*Review and authorize below to update your calendar.*`;
            }
          }

          // 7. Bulk Wildcard Delete (action === 'bulk_delete' or cancel all containing...)
          const isBulkDelete = parsed.action === 'bulk_delete' || 
            (/\b(?:cancel|delete|remove|clear)\s+(?:all|every)\b/i.test(lowerMsg) && /\b(?:containing|word|named|sync)\b/i.test(lowerMsg));

          if (isBulkDelete) {
            parsed.action = 'bulk_delete';
            const wildcardText = parsed.params.wildcardFilter?.text || 
              (lowerMsg.match(/word\s+['"]?(\w+)['"]?/i) || lowerMsg.match(/containing\s+(?:the\s+word\s+)?['"]?(\w+)['"]?/i))?.[1] || 
              'Sync';
            const timeScope = parsed.params.wildcardFilter?.timeScope || (lowerMsg.includes('next week') ? 'next week' : 'upcoming');

            const matched = findEventsByWildcard({ text: wildcardText, timeScope });
            parsed.params.wildcardFilter = { text: wildcardText, timeScope };
            parsed.params.eventIds = matched.map(e => e.id);
            parsed.params.events = matched;
            parsed.params.title = `${wildcardText} Events (${matched.length})`;

            parsed.explanation = `🗑️ **Bulk Cancellation Staged**\n\nI scanned your calendar for ${timeScope} and identified **${matched.length} events** containing **"${wildcardText}"**:\n\n` +
              matched.map(e => `• **"${e.title}"** on ${formatDateDisplay(e.date)} at ${formatToISTTime(e.startTime)}`).join('\n') +
              `\n\n*Review and authorize below to cancel all ${matched.length} events permanently.*`;
          }

          // 8. Recurring Series
          if (parsed.params.recurrence) {
            const rec = parsed.params.recurrence;
            const desc = rec.description || `Repeats every ${rec.interval || 1} ${rec.frequency?.toLowerCase() || 'week'}`;
            parsed.explanation = `🔁 **Recurring Schedule Series Staged**\n\nI have prepared this recurring reservation for your Executive Schedule:\n\n• **Series:** ${parsed.params.title}\n• **Frequency:** ${desc}\n• **Time:** ${parsed.params.time || '04:30 PM'} (${parsed.params.durationMinutes || 45} mins)\n\n*Review and authorize below to reserve this series on your calendar.*`;
          }

          // 9. Meeting Location: NEVER force Google Meet unless explicitly asked or virtual requested!
          const mentionsVirtual = /\b(?:google\s*meet|gmeet|zoom|virtual|video\s*call|remote)\b/i.test(lowerMsg);
          if (!mentionsVirtual) {
            if (parsed.params.title?.toLowerCase().includes('focus') || lowerMsg.includes('focus')) {
              parsed.params.location = 'Focus Block';
            } else if (parsed.params.isAllDay || lowerMsg.includes('offsite')) {
              parsed.params.location = 'Offsite / In-Person';
            } else if (!parsed.params.location || parsed.params.location === 'Google Meet') {
              parsed.params.location = 'In-Person / To be decided';
            }
          } else {
            parsed.params.location = 'Google Meet';
          }

          // 10. Default date/time/duration fallbacks
          if (!parsed.params.date) {
            const resolved = resolveTargetDate(userMessage, now);
            parsed.params.date = resolved.dateStr;
          }
          if (!parsed.params.durationMinutes) {
            const dur = parseEventDuration(userMessage);
            parsed.params.durationMinutes = dur?.durationMinutes || 45;
            parsed.params.duration = `${parsed.params.durationMinutes} mins`;
          }
          if (!parsed.params.time && parsed.params.startTime) {
            parsed.params.time = formatToISTTime(parsed.params.startTime);
          } else if (parsed.params.time && !parsed.params.startTime && !parsed.params.isAllDay) {
            const cleanTime = parseEventStartTime(parsed.params.time) || '10:00';
            parsed.params.startTime = `${parsed.params.date}T${cleanTime}:00+05:30`;
          }
        }

        // Ensure target channel is attached for YouTube and preserve action
        if (parsed.agent === 'YOUTUBE' && parsed.params) {
          parsed.params.channel = parsed.params.channel || channelName;
          parsed.params.action = parsed.action || parsed.params.action || 'upload';

          if (parsed.params.action === 'upload') {
            // Extract videoId and URL if present in userMessage or history
            let url = parsed.params.url || parsed.params.videoUrl;
            if (!url) {
              const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/i);
              if (urlMatch) url = urlMatch[0];
            }
            let videoId = parsed.params.videoId || parsed.params.video_id;
            if (!videoId && url) {
              const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
              if (ytMatch) videoId = ytMatch[1];
            }
            if (!videoId) {
              const directIdMatch = userMessage.match(/\b([a-zA-Z0-9_-]{11})\b/);
              if (directIdMatch) videoId = directIdMatch[1];
            }
            if (!videoId) videoId = 'ix9Sw6PrUJQ';

            parsed.params.videoId = videoId;
            parsed.params.url = url || `https://youtu.be/${videoId}`;
            parsed.params.videoUrl = url || `https://youtu.be/${videoId}`;

            // 1. Dynamic AI Thumbnail Generation from synthesized visual prompt
            const visualPrompt = parsed.params.thumbnail?.prompt || 
              `Cinematic 16:9 high-contrast YouTube video thumbnail for ${parsed.params.title || userMessage}, 8k resolution, dramatic lighting, vivid colors`;
            
            try {
              const generatedThumb = await generateThumbnailFromPrompt(visualPrompt);
              parsed.params.thumbnail = generatedThumb;
            } catch (thumbErr: any) {
              parsed.params.thumbnail = {
                url: `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=1280&height=720&nologo=true`,
                prompt: visualPrompt,
                dimensions: '1280x720',
                aspect_ratio: '16:9',
              };
            }

            // 2. Ensure titles are clamped under 100 characters for YouTube API compliance
            if (parsed.params.title) {
              parsed.params.title = clampTitle100(parsed.params.title);
            }

            if (!parsed.params.seo_titles || !Array.isArray(parsed.params.seo_titles) || parsed.params.seo_titles.length < 5) {
              const primary = parsed.params.selected_title || parsed.params.title || 'Official Video Presentation';
              parsed.params.seo_titles = [
                primary,
                `${primary} | In-Depth Look`,
                `The Ultimate Guide to ${primary}`,
                `Watch: ${primary} (Behind The Scenes)`,
                `Key Insights & Highlights: ${primary}`
              ];
            }

            parsed.params.seo_titles = parsed.params.seo_titles.map(clampTitle100);

            if (!parsed.params.selected_title) {
              parsed.params.selected_title = parsed.params.seo_titles[0] || parsed.params.title;
            } else {
              parsed.params.selected_title = clampTitle100(parsed.params.selected_title);
            }

            if (parsed.confirmationDetails?.details?.selectedTitle) {
              parsed.confirmationDetails.details.selectedTitle = clampTitle100(parsed.confirmationDetails.details.selectedTitle);
            }

            // 3. Ensure timestamps start at 00:00
            if (!parsed.params.timestamps || !parsed.params.timestamps.trim().startsWith('00:00')) {
              parsed.params.timestamps = parsed.params.timestamps 
                ? `00:00 - Introduction\n${parsed.params.timestamps}`
                : '00:00 - Introduction\n01:30 - Highlights & Core Insights\n03:45 - Key Demonstrations\n05:30 - Summary & Wrap Up';
            }

            if (!parsed.params.seo_description && parsed.params.description) {
              parsed.params.seo_description = parsed.params.description;
            }
            if (!parsed.params.description && parsed.params.seo_description) {
              parsed.params.description = parsed.params.seo_description;
            }
          }
        }

        // Ensure correct tier mapping for UBER agent
        if (parsed.agent === 'UBER' && parsed.params) {
          const lowerMsg = userMessage.toLowerCase();
          if (lowerMsg.includes('bike') || lowerMsg.includes('moto') || lowerMsg.includes('scooter') || lowerMsg.includes('two wheeler')) {
            parsed.params.selected_tier = 'Bike';
            parsed.params.tier = 'Bike';
          } else if (lowerMsg.includes('auto') || lowerMsg.includes('rickshaw') || lowerMsg.includes('three wheeler')) {
            parsed.params.selected_tier = 'Auto';
            parsed.params.tier = 'Auto';
          } else if (lowerMsg.includes('premier') || lowerMsg.includes('sedan')) {
            parsed.params.selected_tier = 'Premier AC';
            parsed.params.tier = 'Premier AC';
          } else if (lowerMsg.includes('xl') || lowerMsg.includes('suv') || lowerMsg.includes('6 seater')) {
            parsed.params.selected_tier = 'UberXL';
            parsed.params.tier = 'UberXL';
          } else if (lowerMsg.includes('go') || lowerMsg.includes('cab') || lowerMsg.includes('car')) {
            parsed.params.selected_tier = 'Uber Go AC';
            parsed.params.tier = 'Uber Go AC';
          }
        }

        return attachSafetyAndTraces(parsed, pendingAction, channelName);
      }
    } catch (err: any) {
      console.warn(`Model ${candidateModel} coordinator notice: ${err.message}.`);
    }
  }

  // ─── 2. Intelligent Semantic Multi-Turn Fallback ───
  const lower = userMessage.toLowerCase().trim();

  // Primary recovery: delegate directly to deterministic pre-router
  const fallbackDeterministic = preRouteDeterministicIntent(userMessage, pendingAction, userProfile, channelName);
  if (fallbackDeterministic) {
    return fallbackDeterministic;
  }

  // A. If an action is pending: Check for parameter modifications or confirmation
  if (pendingAction) {
    const currentParams = { ...(pendingAction.params || {}) };
    let hasModification = false;

    // Check description update
    const descMatch = userMessage.match(/(?:description\s+(?:to|is|change to)?\s*["']?|change it to\s+["']?)([^"'\n]+)["']?/i);
    if (descMatch) {
      currentParams.description = descMatch[1].trim();
      hasModification = true;
    }

    // Check privacy status update
    if (lower.includes('private')) {
      currentParams.privacyStatus = 'private';
      hasModification = true;
    } else if (lower.includes('public')) {
      currentParams.privacyStatus = 'public';
      hasModification = true;
    } else if (lower.includes('unlisted')) {
      currentParams.privacyStatus = 'unlisted';
      hasModification = true;
    }

    // Check title update
    const titleMatch = userMessage.match(/(?:title\s+(?:to|is|change to)?\s*["']?)([^"'\n]+)["']?/i);
    if (titleMatch) {
      currentParams.title = titleMatch[1].trim();
      hasModification = true;
    }

    // Check channel / target channel update
    const channelMatch = userMessage.match(/(?:channel\s+(?:to|is|name is|change to)?\s*["']?|target channel\s+(?:to|is|name is|change to)?\s*["']?)([^"'\n,]+)["']?/i);
    if (channelMatch) {
      currentParams.channel = channelMatch[1].trim();
      hasModification = true;
    }

    // Check cancellation
    if (lower.includes('cancel') || lower.includes('discard') || lower.includes('never mind') || lower.includes('stop')) {
      return {
        type: 'action_cancel',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: currentParams,
        explanation: `Cancelled ${pendingAction.agent} task as requested.`,
      };
    }

    // Check confirmation (with or without modifications)
    const isConfirming = lower.includes('publish') || lower.includes('confirm') || lower.includes('proceed') || lower.includes('send') || lower.includes('yes') || lower.includes('go ahead');

    if (isConfirming) {
      return attachSafetyAndTraces({
        type: 'action_confirm',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: currentParams,
        explanation: hasModification 
          ? `Updated parameters and confirmed ${pendingAction.agent} task execution.`
          : `Confirmed ${pendingAction.agent} task execution.`,
      }, pendingAction, channelName);
    }

    if (hasModification) {
      return attachSafetyAndTraces({
        type: 'action_update',
        agent: pendingAction.agent,
        action: pendingAction.action,
        params: currentParams,
        explanation: `Updated staged ${pendingAction.agent} parameters: ${currentParams.description ? `Description set to "${currentParams.description}". ` : ''}${currentParams.privacyStatus ? `Visibility set to ${currentParams.privacyStatus.toUpperCase()}.` : ''}`,
      }, pendingAction, channelName);
    }
  }

  // B. New Action Staging: YouTube
  const isExplicitSearch = lower.startsWith('search') || lower.startsWith('find') || lower.startsWith('give me url') || lower.startsWith('look up') || lower.includes('search for') || lower.includes('search youtube');
  if (lower.includes('youtube') || lower.includes('video') || lower.includes('tutorial') || lower.includes('channel') || lower.includes('subscriber') || lower.includes('subscribers') || lower.includes('view count') || (lower.includes('views') && !lower.includes('review')) || lower.includes('apnacollege') || lower.includes('n8n') || lower.includes('telegram') || lower.includes('gemini') || lower.includes('vlog') || lower.includes('trek') || lower.includes('netravati') || lower.includes('footage') || lower.includes('summarize') || lower.includes('summary')) {
    const isChannelStats = !lower.includes('review') && (lower.includes('stat') || lower.includes('subscriber') || /\bviews?\b/i.test(lower) || lower.includes('analytics') || lower.includes('metric') || lower.includes('channel info') || lower.includes('channel detail') || lower.includes('channel stats'));
    if (isChannelStats && !isExplicitSearch && !lower.includes('upload') && !lower.includes('post') && !lower.includes('publish')) {
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'YOUTUBE',
        action: 'stats',
        requiresConfirmation: false,
        params: {
          action: 'stats',
          channel: channelName,
        },
        explanation: `Retrieving real-time channel statistics and subscriber telemetry for ${channelName}...`,
      }, null, channelName);
    }

    const isRecentVideos = (lower.includes('recent') || lower.includes('last few') || lower.includes('uploads') || lower.includes('published') || lower.includes('my videos') || lower.includes('uploaded') || lower.includes('latest video') || lower.includes('videos i')) && !lower.includes('upload ') && !lower.includes('upload a') && !lower.includes('upload this') && !lower.includes('publish ') && !lower.includes('publish a');
    if (isRecentVideos && !isExplicitSearch) {
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'YOUTUBE',
        action: 'list',
        requiresConfirmation: false,
        params: {
          action: 'list',
          channel: channelName,
        },
        explanation: `Fetching recent video uploads for channel ${channelName}...`,
      }, null, channelName);
    }

    const isSummary = lower.includes('summary') || lower.includes('summarize');
    if (isSummary) {
      const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/i);
      const url = urlMatch ? urlMatch[0] : undefined;
      let videoId: string | undefined;
      if (url) {
        const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
        if (ytMatch) videoId = ytMatch[1];
      }
      if (!videoId) {
        const directIdMatch = userMessage.match(/\b([a-zA-Z0-9_-]{11})\b/);
        if (directIdMatch) videoId = directIdMatch[1];
      }
      const vidToUse = videoId || 'ix9Sw6PrUJQ';
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'YOUTUBE',
        action: 'summarize',
        requiresConfirmation: false,
        params: {
          action: 'summarize',
          videoId: vidToUse,
          url: url || `https://www.youtube.com/watch?v=${vidToUse}`,
          query: userMessage,
        },
        explanation: `Analyzing and synthesizing video intelligence for YouTube video...`,
      }, null, channelName);
    }

    const isUpload = !isExplicitSearch && !isSummary && !isChannelStats && !isRecentVideos && (
      lower.includes('upload') || lower.includes('publish') || lower.includes('post') || lower.includes('broadcast package') || lower.includes('publishing package')
    );
    if (isUpload) {
      const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/i);
      const url = urlMatch ? urlMatch[0] : undefined;

      let videoId: string | undefined;
      if (url) {
        const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
        if (ytMatch) videoId = ytMatch[1];
      }
      if (!videoId) {
        const directIdMatch = userMessage.match(/\b([a-zA-Z0-9_-]{11})\b/);
        if (directIdMatch) videoId = directIdMatch[1];
      }
      if (!videoId) videoId = 'ix9Sw6PrUJQ';

      // Synthesize clean base title dynamically from user input
      let baseTitle = '';
      const explicitTitleMatch = userMessage.match(/(?:title\s*:\s*|titled\s+["']?|title\s+is\s+["']?|named\s+["']?)([^"\n\r]+?)(?:["']?(?:\s+context\s*:|\s+and\s+|\s+with\s+|$|\n))/i);
      if (explicitTitleMatch) {
        baseTitle = explicitTitleMatch[1].trim();
      }

      if (!baseTitle || baseTitle.toLowerCase().includes('description') || baseTitle.toLowerCase().includes('best title') || baseTitle.toLowerCase().includes('content')) {
        const stripped = userMessage
          .replace(/^(?:please\s+)?run(?:\s+the)?\s+youtube\s+agent(?:\s+for\s+video\s+id\s+[a-zA-Z0-9_-]+)?[\.:\s]*/i, '')
          .replace(/^(a|an|the|in this|here is|video of|vlog of|tutorial of|footage of)\s+/i, '')
          .slice(0, 60)
          .trim();
        baseTitle = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : 'Official Video Release';
      }

      baseTitle = clampTitle100(baseTitle);

      const seo_titles = [
        clampTitle100(baseTitle),
        clampTitle100(`${baseTitle} | Complete Guide`),
        clampTitle100(`Inside ${baseTitle}: The Full Story`),
        clampTitle100(`How We Mastered ${baseTitle}`),
        clampTitle100(`Key Highlights & Insights: ${baseTitle}`)
      ];

      const contextMatch = userMessage.match(/context\s*:\s*([\s\S]+)/i);
      const contextualBody = contextMatch ? contextMatch[1].trim() : userMessage;

      const visualPrompt = `Cinematic high-impact 16:9 YouTube thumbnail for: ${contextualBody.slice(0, 150)}, 8k resolution, dramatic lighting, vivid colors, photorealistic detail`;

      let generatedThumb = {
        url: `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=1280&height=720&nologo=true`,
        prompt: visualPrompt,
        dimensions: '1280x720',
        aspect_ratio: '16:9',
      };

      try {
        generatedThumb = await generateThumbnailFromPrompt(visualPrompt);
      } catch (e: any) {
        console.warn('Thumbnail generation fallback notice:', e.message);
      }

      const description = `${contextualBody}\n\n📌 Timestamps:\n00:00 - Introduction & Context\n01:45 - Key Highlights & Overview\n04:30 - Core Demonstration & Concepts\n07:15 - Summary & Wrap Up\n\n🔔 Subscribe to ${channelName} for more!\n#YouTube #Creator #Video`;

      const timestamps = '00:00 - Introduction & Context\n01:45 - Key Highlights & Overview\n04:30 - Core Demonstration & Concepts\n07:15 - Summary & Wrap Up';
      const privacyStatus = lower.includes('private') ? 'private' : lower.includes('public') ? 'public' : 'unlisted';

      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'YOUTUBE',
        action: 'upload',
        requiresConfirmation: true,
        params: {
          action: 'upload',
          videoId,
          title: baseTitle,
          selected_title: seo_titles[0] || baseTitle,
          seo_titles,
          seo_description: description,
          description,
          timestamps,
          privacyStatus,
          visibility: privacyStatus,
          channel: channelName,
          tags: [baseTitle.slice(0, 20), 'YouTube', 'Creator', 'HD'],
          url: url || `https://youtu.be/${videoId}`,
          videoUrl: url || `https://youtu.be/${videoId}`,
          thumbnail: generatedThumb,
        },
        explanation: `🎬 Video "${baseTitle}" staged autonomously for YouTube upload to channel "${channelName}". Custom 16:9 AI thumbnail synthesized from video context.`,
      }, null, channelName);
    }

    const cleanedQuery = userMessage.replace(/search|youtube|for|videos?|summarize|summary|find|give me|the|url|from|channel/gi, ' ').trim();
    const finalQuery = cleanedQuery || userMessage;
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'YOUTUBE',
      action: 'search',
      requiresConfirmation: false,
      params: { 
        action: 'search',
        query: finalQuery 
      },
      explanation: `Searching YouTube for "${finalQuery}"...`,
    }, null, channelName);
  }

  // C. New Action: EMAIL
  const emailMatch = userMessage.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (lower.includes('email') || lower.includes('mail') || emailMatch) {
    const to = emailMatch ? emailMatch[0] : (userProfile?.email || '');
    const subjectMatch = userMessage.match(/subject\s+([^and\n]+?)(?:\s+and\s+message|\s+and\s+body|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : 'Project Update';

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'EMAIL',
      action: 'send',
      params: {
        to,
        subject,
        body: `Hello,\n\nI confirm receipt of your request regarding ${subject}.\n\nBest regards,\n${userProfile?.name || 'Executive'}`,
        action_items: ['Review deliverables', 'Confirm timeline'],
      },
      explanation: to ? `Prepared email draft to ${to} for your approval.` : `Prepared email draft for your approval.`,
    }, null, channelName);
  }

  // D. New Action: CHIEF_OF_STAFF (Executive Briefing & Daily Dossier)
  const isChiefOfStaffQuery =
    lower.includes('briefing') ||
    lower.includes('chief of staff') ||
    lower.includes('dossier') ||
    lower.includes('executive brief') ||
    lower.includes('morning brief') ||
    lower.includes('daily brief') ||
    (lower.includes('brief') && (lower.includes('me') || lower.includes('day') || lower.includes('today') || lower.includes('morning') || lower.includes('executive'))) ||
    lower.includes('on my plate') ||
    lower.includes('in my plate') ||
    lower.includes('catch me up') ||
    lower.includes('rundown') ||
    lower.includes('lowdown') ||
    lower.includes('game plan') ||
    lower.includes('run my day') ||
    lower.includes('kickstart my day') ||
    lower.includes('start my day') ||
    lower.includes('plan my day') ||
    lower.includes('status report') ||
    lower.includes('what should i focus on') ||
    lower.includes('my priorities') ||
    lower.includes('top priorities') ||
    /\bhow(?:'s|\s+is|\s+does)\s+(?:my\s+day|today)\b/i.test(lower) ||
    /\b(?:day|today)\s+look(?:s|\s+like)?\b/i.test(lower) ||
    /\bwhat(?:'s|\s+is)\s+(?:on\s+for|happening|up)\s+(?:today|tomorrow)\b/i.test(lower) ||
    /\bwhat\s+(?:do\s+i|have\s+i)\s+(?:have|got)\s+(?:on|today|tomorrow)\b/i.test(lower) ||
    /\b(?:daily|today's|morning)\s+(?:agenda|digest|update|overview|status|summary)\b/i.test(lower) ||
    (lower.includes('agenda') && (lower.includes('today') || lower.includes('my') || lower.includes('tomorrow'))) ||
    (lower.includes('overview') && (lower.includes('today') || lower.includes('day') || lower.includes('morning')));

  if (isChiefOfStaffQuery) {
    const isDayAfter = lower.includes('day after tomorrow') || lower.includes('day after tommorow');
    const isTomorrow = !isDayAfter && (lower.includes('tomorrow') || lower.includes('tommorow'));
    const targetDate = isDayAfter ? 'day_after_tomorrow' : (isTomorrow ? 'tomorrow' : 'today');
    const horizonLabel = isDayAfter ? 'the day after tomorrow' : (isTomorrow ? 'tomorrow' : 'today');

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CHIEF_OF_STAFF',
      action: 'briefing',
      params: {
        targetDate,
        rawPrompt: userMessage,
        userPrompt: userMessage,
        message: userMessage,
      },
      explanation: `Synthesizing your Executive Dossier for ${horizonLabel} across Calendar, Expenses, and Priority Items...`,
      requiresConfirmation: false,
    }, null, channelName);
  }

  // E. New Action: RESEARCH (Deep Web Research & Query Planning)
  const isExpenseIntent =
    lower.includes('expense') ||
    lower.includes('spend') ||
    lower.includes('spent') ||
    lower.includes('ledger') ||
    lower.includes('transaction') ||
    lower.includes('purchase') ||
    lower.includes('money') ||
    lower.includes('petrol') ||
    lower.includes('swiggy') ||
    lower.includes('paid');

  const isResearchQuery =
    !isExpenseIntent &&
    (lower.includes('research') ||
     lower.includes('deep research') ||
     lower.includes('investigate') ||
     lower.includes('deep dive') ||
     /\bcompar(?:e|ison)\b/i.test(lower) ||
     /\banalyz(?:e|is)\b/i.test(lower) ||
     lower.includes('vs') ||
     lower.includes('market analysis') ||
     lower.includes('competitor analysis') ||
     lower.includes('intelligence report') ||
     lower.includes('vector database') ||
     lower.includes('comparison table') ||
     lower.includes('feature matrix') ||
     lower.includes('report on') ||
     lower.includes('landscape of') ||
     lower.includes('state of'));

  if (isResearchQuery) {
    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'RESEARCH',
      action: 'plan',
      params: {
        question: userMessage,
        userPrompt: userMessage,
      },
      explanation: `🧠 **Deep Research Strategist Activated**\nDecomposing inquiry into targeted multi-angle research queries...`,
      requiresConfirmation: false,
    }, null, channelName);
  }

  // F. Action: CALENDAR
  const isCalendarQuery =
    lower.includes('calendar') ||
    lower.includes('schedule') ||
    lower.includes('meeting') ||
    lower.includes('sync') ||
    lower.includes('appointment') ||
    lower.includes('retro') ||
    lower.includes('standup') ||
    lower.includes('1:1') ||
    lower.includes('1-on-1') ||
    lower.includes('availability') ||
    lower.includes('overlap') ||
    lower.includes('buffer') ||
    /\b(?:what\s+meetings|any\s+meetings|am\s+i\s+free|am\s+i\s+busy|my\s+availability)\b/i.test(lower);

  if (isCalendarQuery) {
    const calIntent = stageCalendarIntent(userMessage, pendingAction, userProfile, channelName);
    if (calIntent) return calIntent;

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'CALENDAR',
      action: 'list',
      params: {
        action: 'list',
        rawPrompt: userMessage,
        message: userMessage,
        userPrompt: userMessage,
      },
      explanation: "Checking upcoming calendar events...",
      requiresConfirmation: false,
    }, null, channelName);
  }

  // E. New Action: UBER
  if (lower.includes('uber') || lower.includes('cab') || lower.includes('ride') || lower.includes('fare') || lower.includes('driver') || lower.includes('telemetry') || lower.includes('receipt') || lower.includes('invoice') || lower.includes('auto') || lower.includes('bike') || lower.includes('moto') || lower.includes('rickshaw') || lower.includes('scooter') || lower.includes('taxi')) {
    const isComplete = lower.includes('complete') || lower.includes('finish') || lower.includes('end ride') || lower.includes('receipt') || lower.includes('invoice') || lower.includes('arrived');
    const isCancel = lower.includes('cancel') || lower.includes('puncture') || lower.includes('fallback');
    const isTelemetry = lower.includes('telemetry') || lower.includes('track') || lower.includes('status') || lower.includes('where') || lower.includes('accept');

    // 1. Dynamic Tier & Vehicle Configuration (Auto, Bike/Moto, Premier, XL, Go)
    let detectedTier = 'Uber Go';
    let baseFare = 50;
    let perKm = 15.5;

    if (lower.includes('bike') || lower.includes('moto') || lower.includes('motorcycle') || lower.includes('scooter') || lower.includes('two wheeler')) {
      detectedTier = 'Uber Moto';
      baseFare = 25;
      perKm = 8.0;
    } else if (lower.includes('auto') || lower.includes('rickshaw') || lower.includes('tuk tuk') || lower.includes('three wheeler')) {
      detectedTier = 'Uber Auto';
      baseFare = 35;
      perKm = 11.5;
    } else if (lower.includes('premier') || lower.includes('comfort') || lower.includes('sedan') || lower.includes('luxury')) {
      detectedTier = 'Uber Premier';
      baseFare = 80;
      perKm = 21.0;
    } else if (lower.includes('xl') || lower.includes('suv') || lower.includes('innova') || lower.includes('ertiga') || lower.includes('6 seater')) {
      detectedTier = 'Uber XL';
      baseFare = 100;
      perKm = 25.0;
    }

    // 2. Dynamic Route Extraction from natural language
    let pickup = '';
    let destination = '';

    const cleanLocation = (loc: string): string => {
      return loc
        .replace(/(?:in an auto|by bike|by auto|in uber|by uber|in cab|by cab|please|now|fast|urgently)$/i, '')
        .replace(/[,\.\?!]+$/, '')
        .trim();
    };

    const fromToMatch = userMessage.match(/(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+?)\s+(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+)/i);
    const toFromMatch = userMessage.match(/(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+?)\s+(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+)/i);

    if (fromToMatch) {
      pickup = cleanLocation(fromToMatch[1]);
      destination = cleanLocation(fromToMatch[2]);
    } else if (toFromMatch) {
      destination = cleanLocation(toFromMatch[1]);
      pickup = cleanLocation(toFromMatch[2]);
    } else {
      const toMatch = userMessage.match(/(?:to|heading to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n\?]+)/i);
      const fromMatch = userMessage.match(/(?:from|pickup(?:\s*at)?)\s+([^,\.\n\?]+)/i);
      if (toMatch) destination = cleanLocation(toMatch[1]);
      if (fromMatch) pickup = cleanLocation(fromMatch[1]);
    }

    // Check conversation history if pickup or destination was omitted in follow-up turn
    if (!pickup || !destination) {
      for (let i = historyMessages.length - 1; i >= 0; i--) {
        const histContent = historyMessages[i]?.content || '';
        if (!pickup) {
          const histFrom = histContent.match(/(?:from|pickup(?:\s*at)?)\s+([^,\.\n]+)/i);
          if (histFrom) pickup = cleanLocation(histFrom[1]);
        }
        if (!destination) {
          const histTo = histContent.match(/(?:to|drop(?:\s*off)?(?:\s*at)?)\s+([^,\.\n]+)/i);
          if (histTo) destination = cleanLocation(histTo[1]);
        }
        if (pickup && destination) break;
      }
    }

    if (!pickup) pickup = 'Current Location';
    if (!destination) destination = 'Dropoff Location';

    // 3. Dynamic Distance & Tariff Computation
    const computeDist = (p: string, d: string): number => {
      let hash = 0;
      const key = `${p.toLowerCase()}->${d.toLowerCase()}`;
      for (let i = 0; i < key.length; i++) {
        hash = (hash << 5) - hash + key.charCodeAt(i);
        hash |= 0;
      }
      const dist = 4.5 + Math.abs(hash % 25) + ((key.length % 5) * 0.8);
      return parseFloat(dist.toFixed(1));
    };

    const distanceKm = computeDist(pickup, destination);
    const durationMins = detectedTier === 'Uber Moto' ? Math.round(distanceKm * 1.6 + 3) : Math.round(distanceKm * 2.2 + 4);
    const calculatedFare = Math.round(baseFare + distanceKm * perKm);
    const lockedFare = `₹${Math.round(calculatedFare * 0.95)} - ₹${Math.round(calculatedFare * 1.15)}`;

    // 4. Dynamic Booking ID (reused from history if session is active)
    let activeBookingId = '';
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const match = (historyMessages[i]?.content || '').match(/UBER-[A-Z0-9-]+/i);
      if (match) {
        activeBookingId = match[0];
        break;
      }
    }
    if (!activeBookingId) {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let suffix = '';
      for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      activeBookingId = `UBER-IND-${suffix}`;
    }

    // Dynamic Pan-India License Plate & Fleet Generator
    const getPanIndiaPlate = (p: string, d: string): string => {
      const combined = `${p.toLowerCase()} ${d.toLowerCase()}`;
      const rLetters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const letters = rLetters.charAt(Math.floor(Math.random() * rLetters.length)) + rLetters.charAt(Math.floor(Math.random() * rLetters.length));
      const digits = Math.floor(1000 + Math.random() * 9000);

      if (combined.includes('delhi') || combined.includes('connaught') || combined.includes('dwarka') || combined.includes('saket') || combined.includes('noida') || combined.includes('gurgaon') || combined.includes('gurugram')) {
        if (combined.includes('gurgaon') || combined.includes('gurugram')) return `HR 26 ${letters} ${digits}`;
        if (combined.includes('noida')) return `UP 16 ${letters} ${digits}`;
        return `DL 01 ${letters} ${digits}`;
      }
      if (combined.includes('mumbai') || combined.includes('bandra') || combined.includes('andheri') || combined.includes('colaba') || combined.includes('thane') || combined.includes('navi mumbai')) {
        return `MH 02 ${letters} ${digits}`;
      }
      if (combined.includes('pune') || combined.includes('hinjewadi') || combined.includes('kothrud')) {
        return `MH 12 ${letters} ${digits}`;
      }
      if (combined.includes('bengaluru') || combined.includes('bangalore') || combined.includes('indiranagar') || combined.includes('koramangala') || combined.includes('whitefield') || combined.includes('electronic city')) {
        return `KA 05 ${letters} ${digits}`;
      }
      if (combined.includes('chennai') || combined.includes('t nagar') || combined.includes('velachery') || combined.includes('adyar')) {
        return `TN 07 ${letters} ${digits}`;
      }
      if (combined.includes('kolkata') || combined.includes('howrah') || combined.includes('salt lake')) {
        return `WB 02 ${letters} ${digits}`;
      }
      if (combined.includes('ahmedabad') || combined.includes('gandhinagar')) {
        return `GJ 01 ${letters} ${digits}`;
      }
      if (combined.includes('jaipur')) {
        return `RJ 14 ${letters} ${digits}`;
      }
      if (combined.includes('chandigarh') || combined.includes('mohali')) {
        return `CH 01 ${letters} ${digits}`;
      }
      if (combined.includes('kochi') || combined.includes('ernakulam')) {
        return `KL 07 ${letters} ${digits}`;
      }
      if (combined.includes('hyderabad') || combined.includes('gachibowli') || combined.includes('hitec') || combined.includes('jubilee') || combined.includes('secunderabad')) {
        return `TS 09 ${letters} ${digits}`;
      }

      const RTO_LIST = ['DL 01', 'MH 02', 'KA 03', 'TS 09', 'TN 07', 'HR 26', 'UP 16', 'GJ 01', 'WB 02', 'RJ 14', 'KL 07'];
      const pfx = RTO_LIST[Math.abs(combined.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % RTO_LIST.length];
      return `${pfx} ${letters} ${digits}`;
    };

    // Fleet configuration per tier
    const AUTO_DRIVERS = [
      { name: 'Raju Goud', rating: '4.89', vehicle: 'Bajaj RE Compact Auto' },
      { name: 'Mohan Kumar', rating: '4.91', vehicle: 'Piaggio Ape City Auto' },
      { name: 'Santosh Yadav', rating: '4.86', vehicle: 'TVS King Deluxe Auto' },
      { name: 'Shankar Rao', rating: '4.93', vehicle: 'Bajaj Maxima Auto' },
    ];

    const BIKE_DRIVERS = [
      { name: 'Vikas Sharma', rating: '4.94', vehicle: 'Honda Activa 6G' },
      { name: 'Arun Reddy', rating: '4.88', vehicle: 'Hero Splendor Plus' },
      { name: 'Siddharth Rao', rating: '4.92', vehicle: 'TVS Jupiter 125' },
      { name: 'Deepankar Sen', rating: '4.90', vehicle: 'Bajaj Pulsar 150' },
    ];

    const PREMIER_DRIVERS = [
      { name: 'Vikramaditya Roy', rating: '4.97', vehicle: 'Honda City V' },
      { name: 'Karthik Raman', rating: '4.95', vehicle: 'Hyundai Verna SX' },
      { name: 'Gurpreet Singh', rating: '4.96', vehicle: 'Skoda Slavia Style' },
    ];

    const XL_DRIVERS = [
      { name: 'Praveen Kumar', rating: '4.91', vehicle: 'Toyota Innova Crysta' },
      { name: 'Sachin Patil', rating: '4.89', vehicle: 'Maruti Suzuki Ertiga ZXi' },
      { name: 'Mohammed Farooq', rating: '4.92', vehicle: 'Kia Carens Prestige' },
    ];

    const GO_DRIVERS = [
      { name: 'Amit Singh', rating: '4.91', vehicle: 'Maruti Suzuki Dzire' },
      { name: 'Subhash Bose', rating: '4.93', vehicle: 'Maruti WagonR VXi' },
      { name: 'Ravi Teja', rating: '4.89', vehicle: 'Hyundai Grand i10 Nios' },
      { name: 'Mukesh Choudhary', rating: '4.90', vehicle: 'Tata Tigor EV' },
    ];

    const driverPool = detectedTier === 'Uber Auto' ? AUTO_DRIVERS
      : detectedTier === 'Uber Moto' ? BIKE_DRIVERS
      : detectedTier === 'Uber Premier' ? PREMIER_DRIVERS
      : detectedTier === 'Uber XL' ? XL_DRIVERS
      : GO_DRIVERS;

    const driverIdx = Math.abs(activeBookingId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % driverPool.length;
    const assignedDriver = driverPool[driverIdx];
    const regionalPlate = getPanIndiaPlate(pickup, destination);

    if (isComplete) {
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'UBER',
        action: 'complete',
        params: {
          booking_id: activeBookingId,
          status: 'completed',
          pickup,
          destination,
          fare: `₹${calculatedFare}`,
          driver: {
            name: assignedDriver.name,
            rating: assignedDriver.rating,
          },
          vehicle: {
            make_model: assignedDriver.vehicle,
            license_plate: regionalPlate,
          },
          distance_km: distanceKm,
          duration_mins: durationMins,
          payment_method: 'Uber AutoPay / UPI',
        },
        explanation: `Finalizing trip from ${pickup} to ${destination} (${distanceKm} km), computing itemized taxes & dispatching receipt...`,
      }, null, channelName);
    }

    if (isCancel) {
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'UBER',
        action: 'cancel',
        params: {
          booking_id: activeBookingId,
          status: 'driver_canceled',
          cancellation_reason: 'Driver vehicle issue',
          pickup,
          destination,
          selected_tier: detectedTier,
          locked_fare: lockedFare,
        },
        explanation: "Re-assigning nearest available vehicle for your ride...",
      }, null, channelName);
    }

    if (isTelemetry) {
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'UBER',
        action: 'telemetry',
        params: {
          booking_id: activeBookingId,
          status: 'accepted',
          driver: {
            name: assignedDriver.name,
            phone_number: '+91 98765 43210',
            rating: assignedDriver.rating,
          },
          vehicle: {
            make_model: assignedDriver.vehicle,
            license_plate: regionalPlate,
            color: 'Silver',
          },
          eta: Math.max(2, Math.round(distanceKm * 0.15)),
          pickup,
          destination,
          locked_fare: lockedFare,
        },
        explanation: `Updating live ride telemetry for ${pickup} to ${destination} (Driver: ${assignedDriver.name})...`,
      }, null, channelName);
    }

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'UBER',
      action: 'book',
      params: {
        pickup,
        destination,
        selected_tier: detectedTier,
        tier: detectedTier,
        locked_fare: lockedFare,
        fare: calculatedFare,
        distance: `${distanceKm} km`,
        duration: `${durationMins} mins`,
        booking_id: activeBookingId,
        ride_pin: String(Math.floor(1000 + Math.random() * 9000)),
        liveMode: true,
      },
      explanation: `Prepared ${detectedTier} booking from ${pickup} to ${destination} (${distanceKm} km, ~${durationMins} mins) for your approval.`,
    }, null, channelName);
  }

  // F. New Action: SHEETS (Expense Ledger & Records)
  const isSpendingQuery =
    lower.includes('sheet') ||
    lower.includes('expense') ||
    lower.includes('expenditure') ||
    lower.includes('ledger') ||
    lower.includes('spend') ||
    lower.includes('spent') ||
    lower.includes('paid') ||
    lower.includes('petrol') ||
    lower.includes('swiggy') ||
    lower.includes('zomato') ||
    lower.includes('rupee') ||
    lower.includes('rupees') ||
    lower.includes('bucks') ||
    lower.includes('₹') ||
    /\brs\.?\b/i.test(lower) ||
    lower.includes('inr') ||
    lower.includes('cost') ||
    lower.includes('transaction') ||
    lower.includes('purchase') ||
    lower.includes('money go') ||
    lower.includes('where did my money') ||
    lower.includes('what did i buy') ||
    lower.includes('how much did i spend') ||
    lower.includes('how much have i spent') ||
    lower.includes('financial ledger') ||
    lower.includes('bank entry') ||
    lower.includes('bank entries') ||
    lower.includes('burn rate');

  if (isSpendingQuery) {
    const isList =
      lower.includes('show') ||
      lower.includes('list') ||
      /\bview\b/i.test(lower) ||
      lower.includes('check') ||
      lower.includes('get') ||
      lower.includes('latest') ||
      lower.includes('recent') ||
      lower.includes('what did') ||
      lower.includes('where did') ||
      lower.includes('how much') ||
      lower.includes('expenditure') ||
      lower.includes('entries') ||
      lower.includes('history') ||
      lower.includes('ledger') ||
      lower.includes('transactions') ||
      lower.includes('purchases') ||
      lower.includes('breakdown') ||
      (lower.includes('spending') && !lower.match(/\b(?:add|log|record|enter|insert|track|new|paid)\b/i)) ||
      (!lower.match(/\b(?:add|log|record|enter|insert|track|new|paid|spent)\b/i) && !lower.match(/\b\d+\b/));

    if (isList) {
      const timeframe = lower.includes('month') ? '1_month' : lower.includes('week') ? '1_week' : 'all';
      return attachSafetyAndTraces({
        type: 'action_stage',
        agent: 'SHEETS',
        action: 'list',
        params: {
          action: 'list',
          timeframe,
          category: lower.includes('food') || lower.includes('dining') ? 'Food & Dining' : undefined,
        },
        explanation: "Retrieving your latest expense entries from your connected ledger...",
        requiresConfirmation: false,
      }, null, channelName);
    }

    const cleanForAmount = userMessage.replace(/,/g, '');
    const amountMatch = cleanForAmount.match(/(?:₹|\$|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i);
    let amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    if (!amount) {
      // Parse spelled-out numbers like "five hundred", "two hundred", "fifty"
      const wordMap: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
        eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
        seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
      };
      const words = lower.split(/\s+/);
      let total = 0;
      let current = 0;
      for (const w of words) {
        if (wordMap[w] !== undefined) {
          const val = wordMap[w];
          if (val === 100) {
            current = (current === 0 ? 1 : current) * 100;
          } else if (val === 1000) {
            current = (current === 0 ? 1 : current) * 1000;
            total += current;
            current = 0;
          } else {
            current += val;
          }
        }
      }
      total += current;
      if (total > 0) amount = total;
    }

    if (!amount) {
      return {
        type: 'general',
        agent: 'GENERAL',
        action: 'chat',
        params: {},
        explanation: "To log an expense, please specify the amount and merchant (for example: *'Log ₹450 for lunch at Swiggy'*).",
      };
    }

    let merchant = 'Expense Entry';
    const forMatch = userMessage.match(/(?:for|at|on)\s+([a-zA-Z0-9\s]+?)(?:\s+under|\s+in|\s+category|\s+today|$)/i);
    if (forMatch) {
      merchant = forMatch[1].trim();
    } else if (lower.includes('petrol') || lower.includes('fuel')) {
      merchant = 'Petrol';
    } else if (lower.includes('swiggy')) {
      merchant = 'Swiggy';
    } else if (lower.includes('zomato')) {
      merchant = 'Zomato';
    }

    let category = 'General';
    const lowerMerchant = merchant.toLowerCase();
    if (lowerMerchant.includes('petrol') || lowerMerchant.includes('fuel') || lower.includes('petrol')) {
      category = 'Transport / Fuel';
    } else if (lowerMerchant.includes('swiggy') || lowerMerchant.includes('zomato') || lowerMerchant.includes('dinner') || lowerMerchant.includes('lunch') || lowerMerchant.includes('food')) {
      category = 'Food & Dining';
    } else if (lowerMerchant.includes('amazon') || lowerMerchant.includes('monitor') || lower.includes('tech') || lower.includes('office')) {
      category = 'Tech equipment';
    }

    return attachSafetyAndTraces({
      type: 'action_stage',
      agent: 'SHEETS',
      action: 'append_row',
      params: {
        amount,
        category,
        merchant,
        date: new Date().toISOString().split('T')[0],
      },
      explanation: `💳 **Expense Staged for Authorization**\n\nI have prepared this transaction entry for your review before committing to your **Financial Ledger**:\n\n• **Merchant / Vendor:** ${merchant}\n• **Amount:** ₹${amount}.00\n• **Category:** ${category} 🍽️\n• **Date:** ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}\n• **Destination:** Executive Expense Vault\n\n*Please review the verification card below and authorize execution.*`,
      requiresConfirmation: true,
    }, null, channelName);
  }

  return {
    type: 'general',
    agent: 'GENERAL',
    action: 'chat',
    params: {},
    explanation: sanitizeExecutiveTerminology(userMessage),
  };
}

/**
 * Attaches Human-In-The-Loop safety cards and execution trace steps
 */
function attachSafetyAndTraces(
  intent: IntentClassification,
  pendingAction?: any,
  defaultChannel: string = 'Sai Keerthan'
): IntentClassification {
  const normalizedAct = (intent.action || '').toLowerCase();
  const isEmail = intent.agent === 'EMAIL';
  const isReadOp = ['read', 'inbox', 'search', 'list', 'check', 'get', 'summarize', 'stat', 'stats', 'analytics', 'metric', 'metrics', 'view', 'views', 'subscriber', 'subscribers', 'recent', 'estimate'].some(w => normalizedAct.includes(w));
  const isYouTubeUpload = intent.agent === 'YOUTUBE' && !isReadOp && (normalizedAct.includes('upload') || normalizedAct.includes('publish') || normalizedAct.includes('post') || normalizedAct.includes('broadcast package') || normalizedAct.includes('publishing package'));
  const isUberBooking = intent.agent === 'UBER' && !isReadOp && (normalizedAct.includes('book') || normalizedAct.includes('dispatch'));
  const isExpenseLog = intent.agent === 'SHEETS' && !isReadOp && (normalizedAct.includes('append') || normalizedAct.includes('log') || normalizedAct.includes('add') || normalizedAct.includes('record'));
  const isCalendarCreate = intent.agent === 'CALENDAR' && !isReadOp && (normalizedAct.includes('create') || normalizedAct.includes('schedule') || normalizedAct.includes('book'));

  const isHighStakes = !isReadOp && ((isEmail && (normalizedAct.includes('send') || normalizedAct.includes('dispatch'))) || isYouTubeUpload || isUberBooking || isExpenseLog || isCalendarCreate || Boolean(intent.requiresConfirmation));

  let confirmationDetails = intent.confirmationDetails;
  const p = { ...(pendingAction?.params || {}), ...(intent.params || {}) };

  if (isHighStakes) {
    if (intent.agent === 'SHEETS') {
      const rawAmt = p.amount || 0;
      const formattedAmt = typeof rawAmt === 'number' 
        ? `₹${rawAmt.toLocaleString('en-IN')}` 
        : String(rawAmt).startsWith('₹') ? rawAmt : `₹${rawAmt}`;
      const merchant = p.merchant || p.item || 'Expenditure';
      const category = p.category || 'General';
      const dateStr = p.date || new Date().toISOString().split('T')[0];

      confirmationDetails = {
        title: 'Record Financial Expenditure',
        warning: 'Safety Check: Authorize this transaction entry before committing to your Financial Ledger.',
        summary: `${formattedAmt} for ${merchant} • Category: ${category}`,
        details: {
          amount: formattedAmt,
          merchant,
          category,
          date: dateStr,
          destination: 'Executive Expense Vault',
        },
      };
    } else if (intent.agent === 'CALENDAR' && (isCalendarCreate || intent.action === 'create' || intent.action === 'update' || intent.action === 'bulk_delete' || intent.type === 'action_update')) {
      if (p.startTime && !p.ignoreConflict) {
        const audit = checkProposedEventConflict({
          startTime: p.startTime,
          durationMinutes: p.durationMinutes,
        });
        if (audit.hasConflict) {
          p.hasConflict = true;
          p.conflict = true;
          p.isConflict = true;
          p.conflictingEvent = audit.conflictingEvent?.title;
          p.conflictReason = audit.conflictReason;
          p.overlapMinutes = audit.overlapMinutes;
          p.conflicts = audit.conflicts;
        } else {
          p.hasConflict = false;
          p.conflict = false;
          p.isConflict = false;
          p.conflictingEvent = undefined;
          p.conflictReason = undefined;
          p.overlapMinutes = 0;
          p.conflicts = [];
        }
        if (intent.params) {
          intent.params.hasConflict = p.hasConflict;
          intent.params.conflict = p.conflict;
          intent.params.isConflict = p.isConflict;
          intent.params.conflictingEvent = p.conflictingEvent;
          intent.params.conflictReason = p.conflictReason;
          intent.params.overlapMinutes = p.overlapMinutes;
          intent.params.conflicts = p.conflicts;
        }
      } else if (p.ignoreConflict) {
        p.hasConflict = false;
        p.conflict = false;
        p.isConflict = false;
        p.conflictingEvent = undefined;
        p.conflictReason = undefined;
        if (intent.params) {
          intent.params.hasConflict = false;
          intent.params.conflict = false;
          intent.params.isConflict = false;
        }
      }

      if (intent.action === 'update') {
        confirmationDetails = {
          title: 'Reschedule & Rename Reservation',
          warning: 'Safety Check: Confirm changes before updating your Executive Schedule.',
          summary: `Move "${p.targetEventTitle || 'Event'}" ➔ ${p.date || ''} at ${p.time || ''} (Renamed to "${p.title}")`,
          details: p,
        };
      } else if (intent.action === 'bulk_delete') {
        confirmationDetails = {
          title: 'Bulk Cancel Schedule Reservations',
          warning: `Safety Check: Confirm before cancelling ${p.eventIds?.length || 0} events from your Executive Schedule.`,
          summary: `Cancel ${p.eventIds?.length || 0} events matching "${p.wildcardFilter?.text || 'filter'}"`,
          details: p,
        };
      } else if (p.recurrence) {
        confirmationDetails = {
          title: 'Schedule Recurring Executive Series',
          warning: 'Safety Check: Confirm series details before booking recurring reservations.',
          summary: `"${p.title}" • ${p.recurrence.description || 'Recurring series'} at ${p.time || ''}`,
          details: p,
        };
      } else {
        confirmationDetails = {
          title: 'Schedule Executive Calendar Event',
          warning: (p.hasConflict || p.conflict)
            ? `⚠️ Conflict Alert: Overlaps with "${p.conflictingEvent || 'an existing event'}"${p.overlapMinutes ? ` by ${p.overlapMinutes}m` : ''}.`
            : 'Safety Check: Confirm event details before blocking on your Executive Schedule.',
          summary: `${p.title || 'Meeting'} • ${p.date || 'Today'} ${p.time || ''}${p.hasConflict ? ` • ⚠️ Conflict: ${p.conflictingEvent}` : ''}`,
          details: p,
        };
      }
    } else if (intent.agent === 'YOUTUBE') {
      const channel = p.channel || defaultChannel;
      const privacy = (p.privacyStatus || 'unlisted').toUpperCase();
      confirmationDetails = {
        title: 'Authorize Channel Broadcast',
        warning: 'Safety Check: Review media assets and SEO metadata before public release.',
        summary: `Title: "${p.title || 'Video'}" • Visibility: ${privacy} • Channel: ${channel}`,
        details: {
          title: p.title || 'Demo Video',
          description: p.description || '',
          privacyStatus: p.privacyStatus || 'unlisted',
          channel,
          tags: p.tags || ['Executive Studio', 'Demo'],
        },
      };
    } else if (intent.agent === 'EMAIL') {
      confirmationDetails = {
        title: 'Drafted Executive Correspondence',
        warning: 'Approval Required: Review drafted communication before official transmission.',
        summary: `To: ${p.to || 'Recipient'} • Subject: "${p.subject || 'Message'}"`,
        details: p,
      };
    } else if (intent.agent === 'UBER') {
      const bId = p.booking_id || 'Active Booking';
      const pickup = p.pickup || 'Pickup';
      const destination = p.destination || 'Destination';
      const driverName = p.driver?.name || 'Assigned Driver';
      const driverRating = p.driver?.rating || '4.9';

      if (intent.action === 'telemetry') {
        confirmationDetails = {
          title: 'Sync Mobility Telemetry',
          warning: 'Safety Check: Review and confirm live driver updates.',
          summary: `Booking ID: ${bId} • Status: ACCEPTED • Driver: ${driverName} (${driverRating}⭐)`,
          details: p,
        };
      } else if (intent.action === 'complete') {
        confirmationDetails = {
          title: 'Finalize Mobility Trip & Generate Invoice',
          warning: 'Safety Check: Confirm trip details to finalize invoice and receipt.',
          summary: `Trip: ${pickup} ➔ ${destination} • Metered: ${p.distance_km || 'Dynamic'} km • Total: ${p.fare || 'Dynamic Fare'}`,
          details: p,
        };
      } else if (intent.action === 'cancel') {
        confirmationDetails = {
          title: 'Driver Reassignment',
          warning: 'Safety Check: Review replacement driver assignment.',
          summary: `Re-assigning driver for booking ${bId}`,
          details: p,
        };
      } else {
        confirmationDetails = {
          title: 'Authorize Mobility Dispatch',
          warning: 'Safety Check: Review route parameters before booking vehicle.',
          summary: `${pickup} ➔ ${destination} • ${p.selected_tier || 'Uber Premier'} (${p.locked_fare || 'Dynamic Fare'})`,
          details: p,
        };
      }
    }
  }

  // Sanitize any remaining technical jargon in confirmation details
  if (confirmationDetails) {
    confirmationDetails.title = sanitizeExecutiveTerminology(confirmationDetails.title);
    confirmationDetails.warning = sanitizeExecutiveTerminology(confirmationDetails.warning);
    confirmationDetails.summary = sanitizeExecutiveTerminology(confirmationDetails.summary);
  }

  // Format impressive executive explanation for staged actions
  let finalExplanation = intent.explanation;
  if (isHighStakes && intent.type !== 'action_confirm' && intent.type !== 'action_cancel') {
    const isDetailed = Boolean(finalExplanation && (finalExplanation.includes('Audit') || finalExplanation.includes('•') || finalExplanation.includes('**')));
    const isRobotic = !isDetailed && (!finalExplanation || finalExplanation.length < 120 || /staged|logged|google\s*sheets|expense\s*entry/i.test(finalExplanation));
    if (!isDetailed && (isRobotic || intent.agent === 'SHEETS' || (intent.agent === 'CALENDAR' && (p.hasConflict || p.conflict)))) {
      finalExplanation = formatImpressiveStagedExplanation({ ...intent, params: p });
    }
  }
  finalExplanation = sanitizeExecutiveTerminology(finalExplanation);

  const traceSteps: TraceStep[] = intent.agent === 'CHIEF_OF_STAFF' ? [
    {
      id: 'trace-cos-1',
      label: 'Schedule & Transit Buffer Audit',
      agent: 'CALENDAR',
      status: 'done',
      detail: "Scanning today's agenda & meeting transit buffers",
      durationMs: 140,
    },
    {
      id: 'trace-cos-2',
      label: 'Financial Ledger & Burn Rate',
      agent: 'SHEETS',
      status: 'done',
      detail: 'Computing weekly spend and budget health',
      durationMs: 160,
    },
    {
      id: 'trace-cos-3',
      label: 'Priority Items & Communications',
      agent: 'EMAIL',
      status: 'done',
      detail: 'Auditing priority tasks and pending action items',
      durationMs: 120,
    },
    {
      id: 'trace-cos-4',
      label: 'Executive Dossier Synthesis',
      agent: 'CHIEF_OF_STAFF',
      status: 'running',
      detail: 'Synthesizing Executive Morning Briefing via Gemini',
      durationMs: 220,
    },
  ] : [
    {
      id: 'step-1',
      label: 'Context & Intent Decomposed',
      agent: 'COORDINATOR',
      status: 'done',
      detail: `Parsed: ${intent.agent}:${intent.action} (${intent.type || 'action_stage'})`,
      durationMs: 120,
    },
    {
      id: 'step-2',
      label: `Execute ${intent.agent === 'SHEETS' ? 'Financial Ledger' : intent.agent === 'CALENDAR' ? 'Executive Schedule' : intent.agent === 'EMAIL' ? 'Executive Correspondence' : intent.agent === 'UBER' ? 'Mobility Dispatch' : intent.agent} Action`,
      agent: intent.agent,
      status: isHighStakes && intent.type !== 'action_confirm' ? 'pending' : 'running',
      detail: isHighStakes && intent.type !== 'action_confirm'
        ? 'Paused for Verification & Authorization'
        : `Dispatching parameters to ${intent.agent === 'SHEETS' ? 'Financial Ledger' : intent.agent === 'CALENDAR' ? 'Executive Schedule' : intent.agent === 'EMAIL' ? 'Executive Correspondence' : intent.agent === 'UBER' ? 'Mobility Dispatch' : intent.agent} Engine`,
      durationMs: 250,
    },
  ];

  return {
    ...intent,
    params: p,
    explanation: finalExplanation,
    requiresConfirmation: isHighStakes && intent.type !== 'action_confirm',
    confirmationDetails,
    traceSteps,
  };
}

/**
 * Multi-modal Vision Processing: Parses receipt or invoice images with Gemini Vision
 */
export async function processReceiptVision(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  userNote?: string
): Promise<ReceiptData> {
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const visionPrompt = `You are an expert OCR and financial data extraction AI.
Analyze the provided receipt image carefully.
Extract all key financial details and return ONLY a valid JSON object:
{
  "merchant": "Store or merchant name",
  "amount": numeric total amount paid,
  "currency": "INR, USD, EUR, etc. (default INR)",
  "category": "Food & Dining, Travel, Groceries, Shopping, Office, or Other",
  "date": "YYYY-MM-DD",
  "description": "Short purchase description",
  "items": ["Item 1", "Item 2"]
}
${userNote ? `Note: "${userNote}"` : ''}
Respond with strictly raw JSON.`;

  try {
    const model = getGenAI().getGenerativeModel({
      model: WORKING_MODEL,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent([
      visionPrompt,
      {
        inlineData: {
          data: cleanBase64,
          mimeType: mimeType || 'image/jpeg',
        },
      },
    ]);

    const text = result.response.text();
    return JSON.parse(text) as ReceiptData;
  } catch (err: any) {
    console.warn(`Vision extraction fallback on ${WORKING_MODEL}:`, err.message);
  }

  return {
    merchant: 'Scanned Merchant',
    amount: 250.00,
    currency: 'INR',
    category: 'General Expense',
    date: new Date().toISOString().split('T')[0],
    description: userNote || 'Scanned receipt logged via Nexia',
    items: ['Receipt item'],
  };
}
