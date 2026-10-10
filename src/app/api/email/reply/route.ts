import { NextResponse } from 'next/server';
import { sendGmailMessage } from '@/lib/google/gmail';
import { isGoogleConnected } from '@/lib/google/auth';

export async function POST(req: Request) {
  try {
    const googleStatus = await isGoogleConnected();
    if (!googleStatus.connected) {
      return NextResponse.json(
        { success: false, error: 'Google account is not connected.' },
        { status: 401 }
      );
    }

    const { to, subject, body, threadId, messageId } = await req.json();

    if (!to || !body) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, body' },
        { status: 400 }
      );
    }

    // Clean recipient string (extract email if inside <...>)
    const emailMatch = to.match(/<([^>]+)>/);
    const cleanTo = emailMatch ? emailMatch[1] : to.trim();

    const result = await sendGmailMessage({
      to: cleanTo,
      subject: subject || 'Re: Correspondence',
      body,
      threadId,
      messageId,
      fromName: 'Sai Keerthan',
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error: any) {
    console.error('[Email Reply Route Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to dispatch email reply.' },
      { status: 500 }
    );
  }
}
