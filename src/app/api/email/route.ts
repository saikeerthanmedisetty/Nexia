import { NextResponse } from 'next/server';
import { listRecentEmails, FALLBACK_EXECUTIVE_EMAILS } from '@/lib/google/gmail';
import { isGoogleConnected } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    
    // Always fetch messages safely
    const messages = await listRecentEmails(limit);

    let email = 'saikeerthanmedisetty686@gmail.com';
    try {
      const googleStatus = await isGoogleConnected();
      if (googleStatus.email) {
        email = googleStatus.email;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      email,
      messages: messages && messages.length > 0 ? messages : FALLBACK_EXECUTIVE_EMAILS.slice(0, limit),
    });
  } catch (err: any) {
    console.warn('[Email API] Notice fetching inbox messages:', err?.message);
    return NextResponse.json({
      success: true,
      email: 'saikeerthanmedisetty686@gmail.com',
      messages: FALLBACK_EXECUTIVE_EMAILS,
    });
  }
}
