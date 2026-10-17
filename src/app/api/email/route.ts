import { NextResponse } from 'next/server';
import { listRecentEmails } from '@/lib/google/gmail';
import { isGoogleConnected } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    
    // Fetch live messages from personal Gmail inbox
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
      messages: messages || [],
    });
  } catch (err: any) {
    console.warn('[Email API] Error fetching inbox messages:', err?.message);
    return NextResponse.json({
      success: true,
      email: 'saikeerthanmedisetty686@gmail.com',
      messages: [],
    });
  }
}
