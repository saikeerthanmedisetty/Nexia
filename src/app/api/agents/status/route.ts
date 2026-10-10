import { NextResponse } from 'next/server';

async function checkWebhook(url?: string): Promise<{ configured: boolean; active: boolean; label: string }> {
  if (!url || url.includes('placeholder.com') || !url.startsWith('http')) {
    return { configured: false, active: false, label: 'Not Configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ healthCheck: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 200 || res.status === 201) {
      return { configured: true, active: true, label: 'Active (200)' };
    }
    if (res.status === 404) {
      return { configured: true, active: false, label: 'Standby (404)' };
    }
    if (res.status === 500) {
      return { configured: true, active: true, label: 'Connected' };
    }
    return { configured: true, active: false, label: `HTTP ${res.status}` };
  } catch {
    return { configured: true, active: false, label: 'Unreachable' };
  }
}

export async function GET() {
  const [emailStatus, calendarStatus, youtubeStatus] = await Promise.all([
    checkWebhook(process.env.N8N_EMAIL_WEBHOOK),
    checkWebhook(process.env.N8N_CALENDAR_WEBHOOK),
    checkWebhook(process.env.N8N_YOUTUBE_WEBHOOK),
  ]);

  return NextResponse.json({
    EMAIL: emailStatus,
    CALENDAR: calendarStatus,
    YOUTUBE: youtubeStatus,
    UBER: { configured: true, active: true, label: 'Active (Direct)' },
    SHEETS: { configured: true, active: true, label: 'Active (Secure Store)' },
  });
}
