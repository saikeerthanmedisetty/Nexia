import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client, saveTokens } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '/dashboard';
    const error = searchParams.get('error');

    if (error) {
      console.warn('[Google Auth Callback] User cancelled or error:', error);
      return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(error)}`, req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/dashboard?error=missing_code', req.url));
    }

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/api/auth/google/callback`;

    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Retrieve basic user info from Google to personalize dashboard
    let userEmail = 'saikeerthanmedisetty686@gmail.com';
    let userName = 'Sai Keerthan';

    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userinfo = await oauth2.userinfo.get();
      if (userinfo.data.email) userEmail = userinfo.data.email;
      if (userinfo.data.name) userName = userinfo.data.name;
    } catch (e: any) {
      console.warn('[Google Auth Callback] Userinfo fetch notice:', e.message);
    }

    // Persist tokens securely to MongoDB Atlas and disk fallback
    await saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
      userEmail,
      userName,
    });

    const returnUrl = state.startsWith('/') ? state : '/dashboard';
    const redirectUrl = new URL(returnUrl, req.url);
    redirectUrl.searchParams.set('google', 'connected');
    return NextResponse.redirect(redirectUrl);
  } catch (err: any) {
    console.error('[Google Auth Callback] Exchange error:', err);
    return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(err.message || 'auth_failed')}`, req.url));
  }
}
