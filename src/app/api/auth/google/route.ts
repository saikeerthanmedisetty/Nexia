import { NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/google/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const returnTo = searchParams.get('returnTo') || '/dashboard';
    const authUrl = generateAuthUrl(returnTo);
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error('[Google Auth] Init error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to initialize Google login' },
      { status: 500 }
    );
  }
}
