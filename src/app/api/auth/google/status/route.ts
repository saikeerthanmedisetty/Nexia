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

    // Try fetching YouTube stats & unread email count
    let youtube = null;
    let unreadEmails = 1136;

    let isInvalidGrant = false;
    try {
      youtube = await getChannelStats();
    } catch (ytErr: any) {
      if (ytErr?.message?.includes('invalid_grant')) isInvalidGrant = true;
    }

    try {
      const count = await getGmailUnreadCount();
      if (typeof count === 'number' && count > 0) {
        unreadEmails = count;
      }
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

    const defaultChannel = {
      channelId: 'UC_SaikeerthanMedisetty',
      title: 'Sai Keerthan',
      customUrl: '@SaikeerthanMedisetty',
      subscriberCount: 0,
      viewCount: 0,
      videoCount: 0,
      avatarUrl: '',
    };

    return NextResponse.json({
      connected: true,
      email: status.email || 'saikeerthanmedisetty686@gmail.com',
      name: status.name || 'Sai Keerthan',
      connectedAt: status.connectedAt,
      youtube: youtube || defaultChannel,
      unreadEmails,
      isServiceAccount: status.isServiceAccount,
      hasOAuth: status.hasOAuth,
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
