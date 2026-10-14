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
 * Synchronously retrieves saved tokens from environment variables (Priority 1 for Vercel/Cloud)
 * or local disk cache
 */
export function getSavedTokensSync(): GoogleTokenData | null {
  // 1. Check environment variable token configuration (24/7 serverless cloud priority)
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      access_token: process.env.GOOGLE_ACCESS_TOKEN || null,
      userEmail: process.env.GOOGLE_USER_EMAIL || 'saikeerthanmedisetty686@gmail.com',
      userName: process.env.GOOGLE_USER_NAME || 'Sai Keerthan',
      token_type: 'Bearer',
      connectedAt: new Date().toISOString(),
    };
  }

  if (process.env.GOOGLE_TOKENS_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_TOKENS_JSON);
      if (parsed && (parsed.refresh_token || parsed.access_token)) {
        return parsed;
      }
    } catch {}
  }

  // 2. Fallback to local cache file
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
 * Asynchronously retrieves saved tokens (Environment variables first, MongoDB Atlas second, with local disk fallback)
 */
export async function getSavedTokens(): Promise<GoogleTokenData | null> {
  // 1. Direct environment variable check
  const envTokens = getSavedTokensSync();
  if (envTokens?.refresh_token) {
    return envTokens;
  }

  // 2. Try MongoDB Atlas
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

  // 3. Fallback to local cache
  return getSavedTokensSync();
}

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
}

export let serviceAccountDiagnostics: {
  envFound: boolean;
  envLength: number;
  keysFound: string[];
  error: string | null;
} = {
  envFound: false,
  envLength: 0,
  keysFound: [],
  error: null,
};

/**
 * Parses and returns Google Cloud Service Account credentials if configured
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  serviceAccountDiagnostics.envFound = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  serviceAccountDiagnostics.envLength = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0;

  // 1. From environment variable (Vercel & .env.local)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
    // Try standard JSON.parse first
    try {
      const parsed = JSON.parse(raw);
      if (parsed) {
        serviceAccountDiagnostics.keysFound = Object.keys(parsed);
        if (parsed.client_email && parsed.private_key) {
          serviceAccountDiagnostics.error = null;
          return parsed as ServiceAccountCredentials;
        } else {
          serviceAccountDiagnostics.error = 'client_email or private_key missing in parsed JSON';
        }
      }
    } catch (e: any) {
      serviceAccountDiagnostics.error = 'JSON.parse: ' + e?.message;
    }

    // Try unquoting outer quotes if wrapped
    try {
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        const parsed = JSON.parse(raw.slice(1, -1));
        if (parsed && parsed.client_email && parsed.private_key) {
          serviceAccountDiagnostics.error = null;
          return parsed as ServiceAccountCredentials;
        }
      }
    } catch {}

    // Fallback: Parse as JavaScript Object literal (handles single quotes or unquoted keys)
    try {
      const fn = new Function('return (' + raw + ');');
      const parsed = fn();
      if (parsed) {
        serviceAccountDiagnostics.keysFound = Object.keys(parsed);
        if (parsed.client_email && parsed.private_key) {
          serviceAccountDiagnostics.error = null;
          return parsed as ServiceAccountCredentials;
        }
      }
    } catch (err: any) {
      serviceAccountDiagnostics.error = (serviceAccountDiagnostics.error || '') + ' | JS obj: ' + err?.message;
      console.warn('[Google Auth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err?.message);
    }
  } else {
    serviceAccountDiagnostics.error = 'GOOGLE_SERVICE_ACCOUNT_JSON is undefined in process.env';
  }

  // 2. From service-account.json disk fallback
  try {
    const serviceAccountFile = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(serviceAccountFile)) {
      const data = fs.readFileSync(serviceAccountFile, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && parsed.client_email && parsed.private_key) {
        return parsed as ServiceAccountCredentials;
      }
    }
  } catch {}

  return null;
}

/**
 * Returns an authenticated Google Auth Client (Service Account or OAuth2) ready for API calls,
 * with automatic token auto-refresh listener attached.
 */
export async function getAuthenticatedClient(): Promise<any> {
  // 1. Priority 1: Service Account (Permanent 24/7 Enterprise Key)
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    return new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key.replace(/\\n/g, '\n'),
      scopes: GOOGLE_SCOPES,
    });
  }

  // 2. Priority 2: Saved OAuth Tokens
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
  isServiceAccount?: boolean;
}> {
  // 1. Check Service Account first (Permanent 24/7)
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    return {
      connected: true,
      email: process.env.GOOGLE_CALENDAR_ID || 'saikeerthanmedisetty686@gmail.com',
      name: 'Nexia Workspace (Service Account)',
      connectedAt: 'Permanent 24/7',
      isServiceAccount: true,
    };
  }

  // 2. Fallback to OAuth tokens
  const tokens = await getSavedTokens();
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
    return { connected: false };
  }

  return {
    connected: true,
    email: tokens.userEmail || 'saikeerthanmedisetty686@gmail.com',
    name: tokens.userName || 'Sai Keerthan',
    connectedAt: tokens.connectedAt,
    isServiceAccount: false,
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
