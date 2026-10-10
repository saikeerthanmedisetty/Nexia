import { NextResponse } from 'next/server';
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { file, folder = 'nexia/uploads', filename } = body;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File data is required (base64 or URL)' },
        { status: 400 }
      );
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: 'Cloudinary credentials are not configured in .env.local',
        url: null,
      }, { status: 200 });
    }

    const result = await uploadToCloudinary(file, folder, { filename });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to upload media to Cloudinary',
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      configured: true,
      url: result.url,
      publicId: result.publicId,
      bytes: result.bytes,
      format: result.format,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API Upload Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
