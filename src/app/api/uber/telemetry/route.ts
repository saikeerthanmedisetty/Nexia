import { NextResponse } from 'next/server';

// In-memory telemetry cache for active sessions
const activeRidesTelemetry: Record<string, any> = {};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body.booking_id || body.request_id || body.session_id || 'active_session';
    
    activeRidesTelemetry[sessionId] = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    console.log(`[Uber Telemetry] Sync received for session ${sessionId}:`, {
      status: body.status,
      driver: body.driver?.name || body.driver?.driver_name,
      eta: body.eta_minutes || body.eta,
    });

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      status: body.status || 'sync_received',
      received_at: new Date().toISOString(),
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id') || searchParams.get('booking_id');

  if (sessionId && activeRidesTelemetry[sessionId]) {
    return NextResponse.json({ success: true, telemetry: activeRidesTelemetry[sessionId] });
  }

  return NextResponse.json({
    success: true,
    active_sessions: Object.keys(activeRidesTelemetry).length,
    sessions: activeRidesTelemetry,
  });
}
