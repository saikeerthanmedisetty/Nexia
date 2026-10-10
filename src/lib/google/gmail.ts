import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  isUnread: boolean;
}

/**
 * Get count of unread messages in the primary inbox
 */
export async function getGmailUnreadCount(): Promise<number> {
  const auth = await getAuthenticatedClient();
  if (!auth) return 0;

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.labels.get({
      userId: 'me',
      id: 'INBOX',
    });
    return res.data.messagesUnread || 0;
  } catch (err: any) {
    console.warn('[Gmail API] Get unread count notice:', err?.message);
    if (err?.message?.includes('invalid_grant')) {
      throw err;
    }
    return 0;
  }
}

/**
 * List recent messages from user's primary inbox
 */
export async function listRecentEmails(maxResults = 10): Promise<GmailMessageSummary[]> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const gmail = google.gmail({ version: 'v1', auth });
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox',
  });

  const messages = listRes.data.messages || [];
  const summaries: GmailMessageSummary[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();
      const isUnread = (detail.data.labelIds || []).includes('UNREAD');

      summaries.push({
        id: msg.id,
        threadId: msg.threadId || msg.id,
        snippet: detail.data.snippet || '',
        subject,
        from,
        date,
        isUnread,
      });
    } catch {}
  }

  return summaries;
}

export interface SendGmailParams {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  threadId?: string;
  messageId?: string;
}

/**
 * Sends a real email directly through the official Gmail API
 */
export async function sendGmailMessage(params: SendGmailParams): Promise<{ success: boolean; messageId?: string; threadId?: string }> {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Workspace is not authenticated. Please connect your Google account.');
  }

  const gmail = google.gmail({ version: 'v1', auth });

  const senderName = params.fromName || 'Sai Keerthan (via Nexia)';
  
  // RFC 2822 formatted raw email string
  const cleanSubject = params.subject.startsWith('Re:') ? params.subject : params.subject;
  const utf8Subject = `=?utf-8?B?${Buffer.from(cleanSubject, 'utf-8').toString('base64')}?=`;
  
  const messageParts = [
    `From: "${senderName}" <me>`,
    `To: ${params.to}`,
    `Subject: ${utf8Subject}`,
    ...(params.messageId ? [`In-Reply-To: ${params.messageId.startsWith('<') ? params.messageId : `<${params.messageId}>`}`, `References: ${params.messageId.startsWith('<') ? params.messageId : `<${params.messageId}>`}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.body,
  ];
  const message = messageParts.join('\r\n');

  // Base64url encode the raw message
  const raw = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const requestBody: { raw: string; threadId?: string } = { raw };
  if (params.threadId) {
    requestBody.threadId = params.threadId;
  }

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  });

  return {
    success: true,
    messageId: res.data.id || undefined,
    threadId: res.data.threadId || params.threadId || undefined,
  };
}
