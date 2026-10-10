import { NextRequest, NextResponse } from 'next/server';
import { dispatchUberHeadless, checkUberSession } from '@/lib/uber-headless';

export async function GET() {
  const session = checkUberSession();
  return NextResponse.json({
    hasSession: session.hasSession,
    profilePath: session.profilePath,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pickup, destination, tier = 'Uber Go', liveMode = true } = body;

    if (!pickup || !destination) {
      return NextResponse.json(
        { success: false, error: 'Pickup and destination are required' },
        { status: 400 }
      );
    }

    const result = await dispatchUberHeadless({
      pickup,
      destination,
      tier,
      liveMode,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
