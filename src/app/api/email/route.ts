import { NextResponse } from 'next/server';
import { listRecentEmails } from '@/lib/google/gmail';
import { isGoogleConnected } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const googleStatus = await isGoogleConnected();
    if (!googleStatus.connected) {
      return NextResponse.json({
        success: false,
        error: 'Google account not connected',
        email: null,
        messages: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const messages = await listRecentEmails(limit);

    return NextResponse.json({
      success: true,
      email: googleStatus.email,
      messages: messages || [],
    });
  } catch (err: any) {
    console.warn('[Email API] Error fetching inbox messages:', err?.message);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to fetch emails',
        messages: [],
      },
      { status: 500 }
    );
  }
}
