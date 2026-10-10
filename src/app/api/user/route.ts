import { NextResponse } from 'next/server';

let userProfile = {
  id: 'usr_saikeerthan',
  name: 'Sai Keerthan',
  email: 'saikeerthanmedisetty686@gmail.com',
  role: 'System Administrator',
  avatar: '',
  themePreference: 'dark',
  integrations: {
    email: 'Connected (Verified)',
    calendar: 'Connected (Active)',
    youtube: 'Connected (Active)',
    uber: 'Connected (Active)',
    sheets: 'Connected (Secure Store)',
    storage: 'Connected (Secure Store)',
  },
  updatedAt: new Date().toISOString(),
};

export async function GET() {
  return NextResponse.json({ user: userProfile }, {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}

export async function PATCH(req: Request) {
  try {
    const updates = await req.json();
    userProfile = {
      ...userProfile,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ success: true, user: userProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
