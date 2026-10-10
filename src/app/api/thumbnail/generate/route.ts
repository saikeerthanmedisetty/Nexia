import { NextRequest, NextResponse } from 'next/server';
import { generateThumbnailFromPrompt } from '@/lib/thumbnail';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Valid prompt string is required' }, { status: 400 });
    }

    const thumbnail = await generateThumbnailFromPrompt(prompt);
    return NextResponse.json({ success: true, thumbnail });
  } catch (error: any) {
    console.error('[API thumbnail generate error]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
