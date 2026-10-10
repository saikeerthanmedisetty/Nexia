import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface EmailItem {
  id: string;
  threadId?: string;
  subject: string;
  snippet: string;
  from: string;
  date: string;
}

export interface SynthesizedEmail {
  summary: string;
  proposedReply: string;
  needsReply: boolean;
  priority?: 'High' | 'Normal' | 'Low';
}

// In-memory cache to prevent redundant computation
const synthesisCache = new Map<string, SynthesizedEmail>();

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emails: EmailItem[] = Array.isArray(body.emails)
      ? body.emails
      : body.email
      ? [body.email]
      : [];

    if (emails.length === 0) {
      return NextResponse.json({ success: true, results: {} });
    }

    const results: Record<string, SynthesizedEmail> = {};
    const toSynthesize: EmailItem[] = [];

    // Check cache first
    for (const em of emails) {
      if (!em.id) continue;
      if (synthesisCache.has(em.id)) {
        results[em.id] = synthesisCache.get(em.id)!;
      } else {
        toSynthesize.push(em);
      }
    }

    // Process uncached emails
    if (toSynthesize.length > 0 && genAI) {
      // Process in small batches or individually with fast flash model
      await Promise.all(
        toSynthesize.slice(0, 10).map(async (email) => {
          try {
            const synthesized = await synthesizeSingleEmail(email);
            synthesisCache.set(email.id, synthesized);
            results[email.id] = synthesized;
          } catch (err: any) {
            console.warn(`[Email Synthesis] Fallback for email ${email.id}:`, err?.message);
            const fallback = generateFallbackSynthesis(email);
            synthesisCache.set(email.id, fallback);
            results[email.id] = fallback;
          }
        })
      );
    } else {
      // Offline / fallback path
      for (const email of toSynthesize) {
        const fallback = generateFallbackSynthesis(email);
        synthesisCache.set(email.id, fallback);
        results[email.id] = fallback;
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('[Email Synthesis Route Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error in synthesis' },
      { status: 500 }
    );
  }
}

async function synthesizeSingleEmail(email: EmailItem): Promise<SynthesizedEmail> {
  if (!genAI) {
    return generateFallbackSynthesis(email);
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
  });

  const prompt = `You are the Executive Communications Director for Sai Keerthan.
Analyze this incoming email and formulate:
1. "summary": A concise 1-2 sentence executive briefing highlighting the core matter, key dates/numbers, and action required.
2. "proposedReply": A high-caliber, context-aware executive response ready to send. Tailor it specifically to the sender's tone and context. Sign it "Best regards,\nSai Keerthan". If it is an automated newsletter, receipt, or notification where no reply is needed, provide a brief acknowledgment or polite reply.
3. "needsReply": boolean (true if an actual human expects a response or urgent inquiry; false if automated system alert or receipt).
4. "priority": "High" | "Normal" | "Low"

Strict instructions:
- Do NOT use prohibited jargon (never use words like "agent", "assistant", "AI", "workflow").
- Output strictly valid JSON with keys: "summary", "proposedReply", "needsReply", "priority".

Email Details:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Snippet/Body: ${email.snippet}
`;

  const response = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const text = response.response.text();
  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || 'Summary unavailable.',
      proposedReply: parsed.proposedReply || 'Thank you for your message.\n\nBest regards,\nSai Keerthan',
      needsReply: Boolean(parsed.needsReply),
      priority: parsed.priority || 'Normal',
    };
  } catch {
    return generateFallbackSynthesis(email);
  }
}

function generateFallbackSynthesis(email: EmailItem): SynthesizedEmail {
  const isAutomated =
    email.from.toLowerCase().includes('no-reply') ||
    email.from.toLowerCase().includes('noreply') ||
    email.from.toLowerCase().includes('alert') ||
    email.from.toLowerCase().includes('billing') ||
    email.subject.toLowerCase().includes('invoice') ||
    email.subject.toLowerCase().includes('ticket');

  const senderName = email.from.replace(/<.*?>/, '').trim() || 'Sender';

  if (isAutomated) {
    return {
      summary: `Automated notification regarding "${email.subject}". Content recorded for reference.`,
      proposedReply: `Hello,\n\nThank you. Receipt confirmed and noted for records.\n\nBest regards,\nSai Keerthan`,
      needsReply: false,
      priority: 'Low',
    };
  }

  return {
    summary: `Correspondence from ${senderName} regarding ${email.subject}. Immediate review recommended.`,
    proposedReply: `Dear ${senderName},\n\nThank you for reaching out regarding "${email.subject}". I have received your message and will review the details promptly.\n\nBest regards,\nSai Keerthan`,
    needsReply: true,
    priority: 'Normal',
  };
}
