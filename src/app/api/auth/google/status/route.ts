import { NextResponse } from 'next/server';
import { isGoogleConnected, disconnectGoogle } from '@/lib/google/auth';
import { getChannelStats } from '@/lib/google/youtube';
import { getGmailUnreadCount } from '@/lib/google/gmail';

export async function GET() {
  try {
    const status = await isGoogleConnected();

    if (!status.connected) {
      return NextResponse.json({
        connected: false,
      });
    }

    // Service Account mode: permanent 24/7 Google Calendar sync
    if (status.isServiceAccount) {
      const unreadEmails = await getGmailUnreadCount();
      return NextResponse.json({
        connected: true,
        email: status.email,
        name: status.name,
        connectedAt: status.connectedAt,
        youtube: null,
        unreadEmails: typeof unreadEmails === 'number' ? unreadEmails : 0,
        isServiceAccount: true,
      });
    }

    // Try fetching YouTube stats & unread email count (OAuth user mode)
    let youtube = null;
    let unreadEmails = 0;

    let isInvalidGrant = false;
    try {
      youtube = await getChannelStats();
    } catch (ytErr: any) {
      if (ytErr?.message?.includes('invalid_grant')) isInvalidGrant = true;
    }

    try {
      unreadEmails = await getGmailUnreadCount();
    } catch (gmErr: any) {
      if (gmErr?.message?.includes('invalid_grant')) isInvalidGrant = true;
    }

    if (isInvalidGrant) {
      return NextResponse.json({
        connected: false,
        needsReconnect: true,
        email: status.email,
        name: status.name,
      });
    }

    return NextResponse.json({
      connected: true,
      email: status.email,
      name: status.name,
      connectedAt: status.connectedAt,
      youtube,
      unreadEmails,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === 'disconnect') {
      await disconnectGoogle();
      return NextResponse.json({ success: true, connected: false });
    }
    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
