import { v2 as cloudinary } from 'cloudinary';

// Check if Cloudinary environment credentials are provided
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const isConfigured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isConfigured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

export interface CloudinaryUploadResult {
  success: boolean;
  url: string | null;
  publicId?: string;
  bytes?: number;
  format?: string;
  error?: string;
}

/**
 * Returns true if Cloudinary environment variables are configured.
 */
export function isCloudinaryConfigured(): boolean {
  return isConfigured;
}

/**
 * Safely upload a base64 or remote URL image to Cloudinary.
 * Built with zero-crash resilience: if Cloudinary is unconfigured or offline,
 * it returns a clean fallback result rather than throwing an unhandled exception.
 */
export async function uploadToCloudinary(
  fileData: string,
  folder: string = 'nexia/receipts',
  options?: {
    filename?: string;
    tags?: string[];
  }
): Promise<CloudinaryUploadResult> {
  if (!isConfigured) {
    // Cloudinary keys not yet placed in .env.local - graceful fallback
    return {
      success: false,
      url: null,
      error: 'Cloudinary credentials not configured in .env.local',
    };
  }

  try {
    const uploadOptions: any = {
      folder,
      resource_type: 'auto',
      tags: ['nexia', ...(options?.tags || [])],
    };

    if (options?.filename) {
      uploadOptions.public_id = options.filename.replace(/\.[^/.]+$/, '');
    }

    const result = await cloudinary.uploader.upload(fileData, uploadOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
    };
  } catch (err: any) {
    console.warn('[Cloudinary Upload Notice]:', err.message);
    return {
      success: false,
      url: null,
      error: err.message || 'Upload failed',
    };
  }
}

export default cloudinary;
