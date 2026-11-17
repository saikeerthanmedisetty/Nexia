import { NextResponse } from 'next/server';
import { isGoogleConnected, disconnectGoogle } from '@/lib/google/auth';
import { getChannelStats } from '@/lib/google/youtube';
import { getGmailUnreadCount } from '@/lib/google/gmail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const status = await isGoogleConnected();

    if (!status.connected || !status.hasOAuth) {
      return NextResponse.json({
        connected: false,
        hasOAuth: false,
        isServiceAccount: status.isServiceAccount || false,
        email: status.email || 'saikeerthanmedisetty686@gmail.com',
        name: status.name || 'Sai Keerthan',
        unreadEmails: 0,
        youtube: null,
      });
    }

    let youtube = null;
    let unreadEmails = 0;
    let isInvalidGrant = false;

    try {
      youtube = await getChannelStats();
    } catch (ytErr: any) {
      console.warn('[Google Status] YouTube fetch notice:', ytErr?.message);
      if (ytErr?.message?.includes('invalid_grant')) isInvalidGrant = true;
    }

    try {
      unreadEmails = await getGmailUnreadCount();
    } catch (gmErr: any) {
      console.warn('[Google Status] Gmail count notice:', gmErr?.message);
      if (gmErr?.message?.includes('invalid_grant')) isInvalidGrant = true;
    }

    if (isInvalidGrant) {
      return NextResponse.json({
        connected: false,
        hasOAuth: false,
        needsReconnect: true,
        email: status.email,
        name: status.name,
        error: 'Google authorization has expired. Please reconnect.',
      });
    }

    return NextResponse.json({
      connected: true,
      hasOAuth: true,
      email: status.email || 'saikeerthanmedisetty686@gmail.com',
      name: status.name || 'Sai Keerthan',
      connectedAt: status.connectedAt,
      youtube,
      unreadEmails,
      isServiceAccount: status.isServiceAccount,
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
      const res = NextResponse.json({ success: true, connected: false });
      res.cookies.delete('nexia_google_token');
      return res;
    }
    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
