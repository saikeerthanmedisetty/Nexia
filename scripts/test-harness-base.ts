import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = 'http://localhost:3000';

export interface TestResult {
  id: string;
  agent: string;
  name: string;
  prompt: string;
  endpoint: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  details: string;
  durationMs: number;
  outputSnippet?: string;
  error?: string;
}

export const userProfile = {
  name: 'Sai Keerthan',
  email: 'saikeerthanmedisetty686@gmail.com',
  channel: '@SaikeerthanMedisetty',
  city: 'Hyderabad',
};

export async function sendChatMessage(content: string, history: any[] = []): Promise<any> {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [...history, { role: 'user', content }],
      userProfile,
    }),
  });
  const durationMs = Date.now() - start;
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    const raw = await res.text().catch(() => '');
    json = { success: false, raw, response: raw };
  }
  return { status: res.status, ok: res.ok, data: json, durationMs };
}

export async function sendAgentAction(agentId: string, action: string, params: any = {}): Promise<any> {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      action,
      params: { ...params, userProfile },
    }),
  });
  const durationMs = Date.now() - start;
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    const raw = await res.text().catch(() => '');
    json = { success: false, raw, message: raw };
  }
  return { status: res.status, ok: res.ok, data: json, durationMs };
}
