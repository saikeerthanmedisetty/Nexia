import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import type { CalendarEvent } from '../calendar';
import { getISTDateString, formatToISTTime } from '../utils';

/**
 * Target Calendar ID — uses the authorized executive calendar ID for Service Accounts & OAuth
 */
export function getTargetCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || 'saikeerthanmedisetty686@gmail.com';
}

/**
 * Query Google Calendar Freebusy API — used for FIND_SLOT operations
 */
export async function queryGoogleCalendarFreebusy(params: {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
}): Promise<{ busy: { start: string; end: string }[] }> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error('Google Workspace is not authenticated.');
  const calendar = google.calendar({ version: 'v3', auth });
  const targetId = getTargetCalendarId();
  const items = (params.calendarIds || [targetId]).map(id => ({ id }));
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items,
    },
  });
  const calData = res.data.calendars || {};
  const busy: { start: string; end: string }[] = [];
  for (const calId of Object.keys(calData)) {
    (calData[calId]?.busy || []).forEach((b: any) => {
      if (b.start && b.end) busy.push({ start: b.start, end: b.end });
    });
  }
  return { busy: busy.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()) };
}

/**
 * Patch EXDATE on a recurring Google Calendar event — skips one occurrence without deleting the series
 */
export async function patchGoogleCalendarRecurrence(
  eventId: string,
  recurrence: string[] // full recurrence array including RRULE + EXDATE lines
): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error('Google Workspace is not authenticated.');
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.patch({
    calendarId: getTargetCalendarId(),
    eventId,
    requestBody: { recurrence },
  });
}

/**
 * List real Google Calendar events from the primary calendar
 */
export async function listGoogleCalendarEvents(options?: {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}): Promise<CalendarEvent[]> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const defaultMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const defaultMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();

  const res = await calendar.events.list({
    calendarId: getTargetCalendarId(),
    timeMin: options?.timeMin || defaultMin,
    timeMax: options?.timeMax || defaultMax,
    singleEvents: true,
    showDeleted: false,
    orderBy: 'startTime',
    maxResults: options?.maxResults || 250,
  });

  const items = (res.data.items || []).filter(item => item.status !== 'cancelled');

  return items.map((item): CalendarEvent => {
    const start = item.start?.dateTime || item.start?.date || new Date().toISOString();
    const end = item.end?.dateTime || item.end?.date || new Date(new Date(start).getTime() + 45 * 60000).toISOString();
    
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const durationMinutes = Math.max(15, Math.round((endMs - startMs) / 60000));
    const durationFormatted = durationMinutes < 60
      ? `${durationMinutes}m`
      : `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ''}`;

    const date = getISTDateString(new Date(start));

    // Extract Google Meet or location link
    let meetUrl = item.hangoutLink || undefined;
    if (!meetUrl && item.conferenceData?.entryPoints) {
      const videoEntry = item.conferenceData.entryPoints.find(e => e.entryPointType === 'video');
      if (videoEntry?.uri) meetUrl = videoEntry.uri;
    }

    return {
      id: item.id || `gcal-${Date.now()}`,
      title: item.summary || 'Google Calendar Event',
      description: item.description || undefined,
      startTime: start,
      endTime: end,
      date,
      durationMinutes,
      durationFormatted,
      location: item.location || (meetUrl ? 'Google Meet' : 'In-Person / Virtual'),
      meetUrl,
      attendees: (item.attendees || []).map(a => a.email).filter(Boolean) as string[],
      type: 'meeting',
      status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
      createdAt: item.created || new Date().toISOString(),
    };
  });
}

/**
 * Creates a real event directly on Google Calendar with optional Google Meet link
 */
export async function createGoogleCalendarEvent(params: {
  title: string;
  date?: string;
  startTime: string; // ISO string or natural time
  durationMinutes?: number;
  description?: string;
  location?: string;
  attendees?: string[];
  recurrence?: string[];
  isAllDay?: boolean;
  endDate?: string;
  tentative?: boolean; // soft block — shows as "free" / tentative on calendar
}): Promise<CalendarEvent> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const duration = params.durationMinutes || 45;
  let startIso = params.startTime;
  if (!startIso.includes('T') || !startIso.includes(':')) {
    const targetDate = params.date || getISTDateString();
    startIso = new Date(`${targetDate}T15:00:00+05:30`).toISOString();
  }

  const startDate = new Date(startIso);
  const endDate = new Date(startDate.getTime() + duration * 60000);
  const endIso = endDate.toISOString();
  const dateStr = getISTDateString(startDate);

  const isVirtual = Boolean(
    params.location?.toLowerCase().includes('google meet') ||
    params.location?.toLowerCase().includes('meet') ||
    params.location?.toLowerCase().includes('zoom') ||
    params.location?.toLowerCase().includes('virtual') ||
    params.description?.toLowerCase().includes('google meet')
  );

  const rawAttendees = params.attendees || ['saikeerthanmedisetty686@gmail.com'];
  const validEmailAttendees = rawAttendees.filter(a => typeof a === 'string' && a.includes('@') && a.includes('.'));
  const namedParticipants = rawAttendees.filter(a => typeof a === 'string' && (!a.includes('@') || !a.includes('.')));

  let eventDescription = params.description || 'Scheduled via Nexia.';
  if (namedParticipants.length > 0) {
    eventDescription += `\nParticipants: ${namedParticipants.join(', ')}`;
  }

  const requestBody: any = {
    summary: params.title.trim(),
    description: eventDescription,
    location: params.location && params.location !== 'To be decided' ? params.location : (isVirtual ? 'Google Meet' : 'In-Person / To be decided'),
    start: params.isAllDay ? { date: params.date || startIso.split('T')[0] } : { dateTime: startIso },
    end: params.isAllDay ? { date: params.endDate || params.date || startIso.split('T')[0] } : { dateTime: endIso },
    attendees: (validEmailAttendees.length > 0 ? validEmailAttendees : ['saikeerthanmedisetty686@gmail.com']).map(email => ({ email })),
    ...(params.recurrence ? { recurrence: params.recurrence } : {}),
    // Tentative = transparent (shows as free slot, soft block)
    ...(params.tentative ? { transparency: 'transparent', status: 'tentative' } : {}),
    ...(isVirtual ? {
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    } : {}),
  };

  const res = await calendar.events.insert({
    calendarId: getTargetCalendarId(),
    requestBody,
    conferenceDataVersion: 1,
  });

  const created = res.data;
  const meetUrl = created.hangoutLink || undefined;

  return {
    id: created.id || `gcal-${Date.now()}`,
    title: created.summary || params.title,
    description: created.description || params.description,
    startTime: startIso,
    endTime: endIso,
    date: dateStr,
    durationMinutes: duration,
    durationFormatted: `${duration}m`,
    location: created.location || (params.location && params.location !== 'To be decided' ? params.location : (isVirtual ? 'Google Meet' : 'In-Person / To be decided')),
    meetUrl,
    attendees: (created.attendees || []).map(a => a.email).filter(Boolean) as string[],
    type: 'meeting',
    status: 'confirmed',
    createdAt: created.created || new Date().toISOString(),
  };
}

/**
 * Deletes a real event from Google Calendar
 */
export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated.');
  }

  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({
    calendarId: getTargetCalendarId(),
    eventId,
  });

  return true;
}

/**
 * Updates a real event on Google Calendar using patch
 */
export async function updateGoogleCalendarEvent(
  eventId: string,
  updates: {
    title?: string;
    date?: string;
    startTime?: string;
    durationMinutes?: number;
    description?: string;
    location?: string;
    attendees?: string[];
  }
): Promise<CalendarEvent> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const calendar = google.calendar({ version: 'v3', auth });

  const patchBody: any = {};
  if (updates.title) patchBody.summary = updates.title.trim();
  if (updates.description) patchBody.description = updates.description;
  if (updates.location) patchBody.location = updates.location;

  if (updates.startTime) {
    let startIso = updates.startTime;
    if (!startIso.includes('T') || !startIso.includes(':')) {
      const targetDate = updates.date || getISTDateString();
      startIso = new Date(`${targetDate}T15:00:00+05:30`).toISOString();
    }
    const duration = updates.durationMinutes || 45;
    const startDate = new Date(startIso);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    patchBody.start = { dateTime: startIso };
    patchBody.end = { dateTime: endDate.toISOString() };
  }

  if (updates.attendees) {
    const validEmails = updates.attendees.filter(a => typeof a === 'string' && a.includes('@') && a.includes('.'));
    if (validEmails.length > 0) {
      patchBody.attendees = validEmails.map(email => ({ email }));
    }
  }

  const res = await calendar.events.patch({
    calendarId: getTargetCalendarId(),
    eventId,
    requestBody: patchBody,
  });

  const updated = res.data;
  const start = updated.start?.dateTime || updated.start?.date || new Date().toISOString();
  const end = updated.end?.dateTime || updated.end?.date || new Date(new Date(start).getTime() + 45 * 60000).toISOString();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const duration = Math.max(15, Math.round((endMs - startMs) / 60000)) || 45;

  return {
    id: updated.id || eventId,
    title: updated.summary || updates.title || 'Updated Meeting',
    description: updated.description || updates.description,
    startTime: start,
    endTime: end,
    date: getISTDateString(new Date(start)),
    durationMinutes: duration,
    durationFormatted: `${duration}m`,
    location: updated.location || updates.location || 'In-Person / To be decided',
    meetUrl: updated.hangoutLink || undefined,
    attendees: (updated.attendees || []).map(a => a.email).filter(Boolean) as string[],
    type: 'meeting',
    status: 'confirmed',
    createdAt: updated.created || new Date().toISOString(),
  };
}
