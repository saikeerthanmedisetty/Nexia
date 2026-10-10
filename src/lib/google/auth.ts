import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { executeMongoOperation } from '../mongodb';

const TOKEN_CACHE_FILE = path.join(process.cwd(), '.google-tokens.json');

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface GoogleTokenData {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
  userEmail?: string;
  userName?: string;
  connectedAt?: string;
}

/**
 * Creates and returns a Google OAuth2 client instance
 */
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    console.warn('[Google Auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in environment variables.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google OAuth 2.0 Consent URL
 */
export function generateAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state: state || 'google_auth_state',
    include_granted_scopes: true,
  });
}

/**
 * Saves tokens securely in MongoDB Atlas and local disk cache fallback
 */
export async function saveTokens(tokens: GoogleTokenData): Promise<void> {
  const existing = (await getSavedTokens()) || getSavedTokensSync() || {};
  const refreshToken = tokens.refresh_token || existing.refresh_token;

  const merged = {
    ...existing,
    ...tokens,
    refresh_token: refreshToken,
    connectedAt: new Date().toISOString(),
  };

  // 1. Save to local disk cache fallback
  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[Google Auth] Save disk tokens notice:', err?.message);
  }

  // 2. Persist to MongoDB Atlas
  try {
    await executeMongoOperation(async (db: any) => {
      await db.collection('google_tokens').updateOne(
        { id: 'primary_google_account' },
        {
          $set: {
            ...merged,
            id: 'primary_google_account',
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    });
  } catch (err: any) {
    console.warn('[Google Auth] MongoDB token save notice:', err?.message);
  }
}

/**
 * Synchronously retrieves saved tokens from local cache
 */
export function getSavedTokensSync(): GoogleTokenData | null {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const data = fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8');
      if (data && data.trim()) {
        return JSON.parse(data);
      }
    }
  } catch (err: any) {
    console.warn('[Google Auth] Read disk tokens notice:', err?.message);
  }
  return null;
}

/**
 * Asynchronously retrieves saved tokens (MongoDB Atlas first, with local disk fallback)
 */
export async function getSavedTokens(): Promise<GoogleTokenData | null> {
  // Try MongoDB Atlas
  try {
    const record = await executeMongoOperation(async (db: any) => {
      return db.collection('google_tokens').findOne({ id: 'primary_google_account' });
    });
    if (record && (record.refresh_token || record.access_token)) {
      return record as GoogleTokenData;
    }
  } catch (err: any) {
    console.warn('[Google Auth] MongoDB fetch tokens notice:', err?.message);
  }

  // Fallback to local cache
  return getSavedTokensSync();
}

/**
 * Returns an authenticated Google OAuth2 Client ready for API calls,
 * with automatic token auto-refresh listener attached.
 */
export async function getAuthenticatedClient() {
  const tokens = await getSavedTokens();
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Auto-refresh hook
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('[Google Auth] Tokens refreshed automatically.');
    await saveTokens({
      ...newTokens,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
    });
  });

  return oauth2Client;
}

/**
 * Checks whether Google Workspace is connected and authenticated
 */
export async function isGoogleConnected(): Promise<{
  connected: boolean;
  email?: string;
  name?: string;
  connectedAt?: string;
}> {
  const tokens = await getSavedTokens();
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
    return { connected: false };
  }

  return {
    connected: true,
    email: tokens.userEmail || 'saikeerthanmedisetty686@gmail.com',
    name: tokens.userName || 'Sai Keerthan',
    connectedAt: tokens.connectedAt,
  };
}

/**
 * Disconnects the Google account and wipes stored tokens
 */
export async function disconnectGoogle(): Promise<boolean> {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      fs.unlinkSync(TOKEN_CACHE_FILE);
    }
  } catch {}

  try {
    await executeMongoOperation(async (db: any) => {
      await db.collection('google_tokens').deleteOne({ id: 'primary_google_account' });
    });
  } catch {}

  return true;
}
