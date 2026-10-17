import { NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/api/auth/google/callback`;

    const { searchParams } = url;
    const returnTo = searchParams.get('returnTo') || '/dashboard';
    const authUrl = generateAuthUrl(returnTo, redirectUri);
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error('[Google Auth] Init error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to initialize Google login' },
      { status: 500 }
    );
  }
}
