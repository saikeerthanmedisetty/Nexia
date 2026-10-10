import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ExecutiveSynthesisOptions {
  userPrompt: string;
  agent: 'YOUTUBE' | 'CALENDAR' | 'EMAIL' | 'UBER' | 'SHEETS' | 'CHIEF_OF_STAFF' | 'RESEARCH' | 'GENERAL';
  action?: string;
  facts: Record<string, any>;
  fallbackResponse: string;
}

const EXECUTIVE_SYNTHESIS_SYSTEM_PROMPT = `You are Nexia, an elite Executive Chief of Staff for Sai Keerthan.
You take verified operational facts retrieved from real connected services and synthesize a natural, polished, conversational executive answer.

STRICT EXECUTIVE RULES:
1. Tone: Warm, confident, authoritative, and direct. Talk like a real human Chief of Staff, never like a rigid bot, script, or developer debug terminal.
2. Directly answer the user's specific question in your first sentence.
3. ZERO BACKEND JARGON:
   - NEVER mention backend API names (e.g., do NOT say "YouTube Data API v3", "Gmail API", "Google Calendar API", "n8n webhook", "Playwright", "Puppeteer").
   - NEVER print raw developer identifiers (e.g., do NOT print alphanumeric Channel IDs like "UCN0MNfZC...", event IDs, or database ObjectIDs).
   - NEVER include technical debug footers like "*Synced live via official...*" or "*Directly fetched from...*".
4. Graceful Empty States:
   - If a channel has 0 subscribers or 0 videos, state it cleanly and conversationally: confirm the channel is connected and offer to help publish or stage content when ready.
   - If a calendar day is clear, state that the calendar is clear and note any upcoming priorities on the horizon.
   - If an inbox has 0 unread messages, confirm that the inbox is caught up.
5. Formatting: Use bold for key numbers, dates, or names. Keep paragraphs concise and scannable. Only use bullet points when comparing or listing multiple items.
6. Number Formatting: Use Indian numbering formatting (e.g., ₹1,20,000 or ₹1,450). Time is always IST.
7. FACT-FAITHFULNESS & NO MUTATION FABRICATION:
   - When reporting on CALENDAR (action 'list'): You are ONLY summarizing existing scheduled events from Verified Operational Facts. NEVER claim or state that you scheduled, created, or booked any meeting. If the user prompt asks to schedule something, do NOT say it has been scheduled unless action is explicitly 'create' and facts confirm an event was created!
   - When reporting on SHEETS (action 'list'): You are ONLY summarizing existing expenses from the ledger. NEVER claim you logged, added, or recorded a new transaction.
   - When reporting on EMAIL (action 'read'): You are ONLY reporting inbox contents. NEVER claim you sent an email.
   - When reporting on YOUTUBE (action 'stats' or 'list'): You are ONLY reporting channel metrics or uploaded videos. NEVER claim you published or uploaded a video.
8. EXECUTIVE CALENDAR GROUND TRUTH & AVAILABILITY INTEGRITY:
   - When action is 'check_availability' or facts include 'availability':
     * STRICTLY obey the \`availability\` facts provided.
     * If \`availability.isFree\` is false: NEVER claim the user is "completely free" or has "no meetings or conflicts scheduled". You MUST state that there is a conflict, explicitly naming each conflicting event and its exact IST time range (e.g. "Executive Strategy Review at 4:00 PM – 4:45 PM IST").
     * If \`availability.canAccommodate\` is true: Explicitly state the exact open window where the meeting fits (e.g. "However, you have an open window between 2:00 PM and 4:00 PM IST where your 1-hour discussion can easily fit").
     * If \`availability.isFree\` is true: State that the entire requested window is open and free of conflicts.
   - When reporting on multi-day schedules (e.g., today and tomorrow):
     * Check \`todaySchedule\` (or events on today's date) and \`tomorrowSchedule\` (or events on tomorrow's date) separately.
     * If today has events (such as travel or meetings), NEVER say today is clear! List today's events under Today, and tomorrow's events under Tomorrow.
     * NEVER repeat or duplicate the same event unless it genuinely exists multiple times in the verified facts.`;

/**
 * Synthesizes a natural, high-end Chief of Staff response using verified live facts.
 */
export async function synthesizeExecutiveResponse(options: ExecutiveSynthesisOptions): Promise<string> {
  const { userPrompt, agent, action, facts, fallbackResponse } = options;

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!apiKey) {
    return cleanFallback(fallbackResponse);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

    const userContent = `User Prompt: "${userPrompt}"
Operational Domain: ${agent}
Action: ${action || 'query'}
Verified Operational Facts:
${JSON.stringify(facts, null, 2)}

Synthesize the final executive conversational response for the user:`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: EXECUTIVE_SYNTHESIS_SYSTEM_PROMPT,
        });

        const res = await model.generateContent(userContent);
        const text = res.response.text().trim();
        if (text && text.length > 10) {
          return text;
        }
      } catch (err: any) {
        console.warn(`[executiveSynthesis] Model ${modelName} notice:`, err?.message);
      }
    }
  } catch (outerErr: any) {
    console.warn('[executiveSynthesis] Outer synthesis notice:', outerErr?.message);
  }

  return cleanFallback(fallbackResponse);
}

/**
 * Removes any lingering developer plumbing or raw API badges from a fallback string.
 */
export function cleanFallback(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*Synced live via official YouTube Data API v3\* ✅/gi, '')
    .replace(/\*Directly fetched from YouTube Data API v3\* ✅/gi, '')
    .replace(/\*Synced live via official.*?✅/gi, '')
    .replace(/•\s*\*\*Channel ID:\*\*\s*`[^`]+`/gi, '')
    .replace(/•\s*\*\*Status:\*\*\s*Confirmed & Recorded Securely ✅/gi, '• **Status:** Confirmed ✅')
    .replace(/via official Gmail API/gi, 'from your connected inbox')
    .replace(/via official YouTube Data API v3/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
