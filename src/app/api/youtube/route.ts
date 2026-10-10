import { NextResponse } from 'next/server';
import { getChannelStats, listChannelVideos, uploadYouTubeVideoMetadata } from '@/lib/google/youtube';
import { isGoogleConnected } from '@/lib/google/auth';

export async function GET() {
  try {
    const authStatus = await isGoogleConnected();
    if (!authStatus.connected) {
      return NextResponse.json({
        connected: false,
        message: 'Google account not connected. Authenticate with Google to view live YouTube analytics.',
        channel: null,
        videos: [],
      });
    }

    const channel = await getChannelStats();
    const videos = await listChannelVideos(6);

    return NextResponse.json({
      connected: true,
      channel,
      videos,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, tags, privacyStatus } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const result = await uploadYouTubeVideoMetadata({
      title,
      description: description || '',
      tags: tags || [],
      privacyStatus: privacyStatus || 'unlisted',
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
