import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import {
  getCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  calculateFreeTimeAndConflicts,
  getISTDateString,
} from '@/lib/calendar';
import { recordTask } from '@/lib/tasks';
import { isGoogleConnected } from '@/lib/google/auth';
import { listGoogleCalendarEvents, createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google/calendar';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'all') as any;
    const date = searchParams.get('date') || undefined;

    const targetDateStr = date || (range === 'tomorrow'
      ? (() => {
          const tom = new Date();
          tom.setDate(tom.getDate() + 1);
          return getISTDateString(tom);
        })()
      : getISTDateString(new Date()));

    const todayStr = getISTDateString(new Date());
    const tomDate = new Date();
    tomDate.setDate(tomDate.getDate() + 1);
    const tomorrowStr = getISTDateString(tomDate);

    let events = await getCalendarEvents({ range, date });

    // Sync with real Google Calendar if connected (Google Calendar is the single source of truth)
    const googleStatus = await isGoogleConnected();
    if (googleStatus.connected) {
      try {
        let timeMin: string | undefined;
        let timeMax: string | undefined;
        if (date) {
          const d = new Date(`${date}T00:00:00+05:30`);
          timeMin = new Date(d.getTime() - 24 * 3600 * 1000).toISOString();
          timeMax = new Date(d.getTime() + 48 * 3600 * 1000).toISOString();
        }
        const gcalEvents = await listGoogleCalendarEvents(timeMin ? { timeMin, timeMax } : undefined);
        const activeGcal = (gcalEvents || []).filter((e: any) => e.status !== 'cancelled');

        // Also keep any freshly created local events (within last 3 minutes) that might still be syncing
        const nowMs = Date.now();
        const pendingLocal = events.filter((e: any) =>
          e.id?.startsWith('evt-') &&
          e.status !== 'cancelled' &&
          (nowMs - new Date(e.createdAt || 0).getTime() < 180_000)
        );

        let merged = [...activeGcal, ...pendingLocal].sort(
          (a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        if (date) {
          merged = merged.filter((e: any) => e.date === date);
        } else if (range === 'today') {
          merged = merged.filter((e: any) => e.date === todayStr);
        } else if (range === 'tomorrow') {
          merged = merged.filter((e: any) => e.date === tomorrowStr);
        }
        events = merged;
      } catch (gcalErr: any) {
        console.warn('[Calendar API] Google Calendar sync notice:', gcalErr?.message);
      }
    }

    const analysis = calculateFreeTimeAndConflicts(events, targetDateStr);
    const todayEvents = events.filter((e) => e.date === todayStr);
    const tomorrowEvents = events.filter((e) => e.date === tomorrowStr);

    return NextResponse.json({
      success: true,
      targetDate: targetDateStr,
      events,
      freeBlocks: analysis.freeBlocks,
      conflicts: analysis.conflicts,
      metrics: {
        todayCount: todayEvents.length,
        tomorrowCount: tomorrowEvents.length,
        totalFreeMinutes: analysis.totalFreeMinutes,
        totalMeetingMinutes: analysis.totalMeetingMinutes,
        conflictCount: analysis.conflicts.length,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, date, startTime, endTime, durationMinutes, location, attendees, description } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'Meeting title is required' }, { status: 400 });
    }

    const { event, conflict, conflictAlert } = await createCalendarEvent({
      title,
      date,
      startTime,
      endTime,
      durationMinutes: Number(durationMinutes) || 45,
      location: location || 'To be decided',
      attendees,
      description,
    });

    // Automatically record this action in the Agent Task ledger
    await recordTask({
      agentId: 'CALENDAR',
      action: 'create',
      title: `Scheduled Meeting: ${event.title}`,
      status: 'completed',
      details: `Scheduled for ${event.date} at ${event.startTime}. Duration: ${event.durationFormatted}. Meet URL: ${event.meetUrl}`,
      durationMs: 320,
      params: {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        durationMinutes: event.durationMinutes,
        meetUrl: event.meetUrl,
      },
      result: {
        eventId: event.id,
        meetUrl: event.meetUrl,
        conflict,
      },
    });

    // Sync with real Google Calendar if connected
    let gcalEvent = null;
    const googleStatus = await isGoogleConnected();
    if (googleStatus.connected) {
      try {
        gcalEvent = await createGoogleCalendarEvent({
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          durationMinutes: event.durationMinutes,
          location: event.location,
          attendees: event.attendees,
          description: event.description,
        });
        if (gcalEvent) {
          const { replaceCalendarEventId } = await import('@/lib/calendar');
          replaceCalendarEventId(event.id, gcalEvent.id, gcalEvent.meetUrl);
          event.id = gcalEvent.id;
          if (gcalEvent.meetUrl) {
            event.meetUrl = gcalEvent.meetUrl;
          }
        }
      } catch (gcalErr: any) {
        console.warn('[Calendar API] Google Calendar create notice:', gcalErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      event,
      gcalEvent,
      conflict,
      conflictAlert,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Event ID is required' }, { status: 400 });
    }

    const deleted = await deleteCalendarEvent(id);

    // Also attempt deletion on Google Calendar if connected
    const googleStatus = await isGoogleConnected();
    if (googleStatus.connected) {
      try {
        await deleteGoogleCalendarEvent(id);
      } catch (gcalErr: any) {
        console.warn('[Calendar API] Google Calendar delete notice:', gcalErr?.message);
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
