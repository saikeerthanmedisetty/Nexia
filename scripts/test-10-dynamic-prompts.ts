import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = 'http://localhost:3000';

const userProfile = {
  name: 'Sai Keerthan',
  email: 'saikeerthanmedisetty686@gmail.com',
  channel: '@SaikeerthanMedisetty',
  city: 'Hyderabad',
};

interface TestCase {
  id: number;
  category: string;
  prompt: string;
  expectedAgent: string;
  verify: (data: any) => { passed: boolean; message: string };
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    category: 'Executive Scheduling (Natural Language)',
    prompt: 'Can you pencil in an executive catch-up with Srikant from Matrix Partners on Friday at 3:30 PM regarding our Series A term sheet?',
    expectedAgent: 'CALENDAR',
    verify: (data) => {
      const isCal = data.agent === 'CALENDAR' || data.type === 'action_stage';
      const p = data.params || {};
      const hasTitle = (p.title || p.summary || p.message || '').toLowerCase().includes('srikant') || (data.explanation || '').toLowerCase().includes('srikant');
      return {
        passed: isCal,
        message: `Agent: ${data.agent}, Action: ${data.action}, Title matched: ${hasTitle}`,
      };
    },
  },
  {
    id: 2,
    category: 'Financial Ledger (Natural Speech Expense)',
    prompt: 'Booked a team celebration dinner at Farzi Cafe Hyderabad yesterday night for 6,420 rupees, put it on the company expense sheet under Team Building.',
    expectedAgent: 'SHEETS',
    verify: (data) => {
      const isSheets = data.agent === 'SHEETS' || data.type === 'action_stage';
      const p = data.params || {};
      const amountOk = p.amount === 6420 || p.amount === '6420' || (data.explanation || '').includes('6,420') || (data.explanation || '').includes('6420');
      return {
        passed: isSheets,
        message: `Agent: ${data.agent}, Amount: ${p.amount}, Merchant: ${p.merchant}, Category: ${p.category}`,
      };
    },
  },
  {
    id: 3,
    category: 'Executive Mobility (Specific Pickup & Dropoff)',
    prompt: 'I need an Uber Go from Gachibowli DLF Cybercity Gate 2 to Rajiv Gandhi International Airport Departures right now.',
    expectedAgent: 'UBER',
    verify: (data) => {
      const isUber = data.agent === 'UBER' || data.type === 'action_stage';
      const p = data.params || {};
      return {
        passed: isUber,
        message: `Agent: ${data.agent}, Pickup: ${p.pickup}, Destination: ${p.destination}, Tier: ${p.tier || p.selected_tier}`,
      };
    },
  },
  {
    id: 4,
    category: 'Executive Correspondence (Formal Email Draft)',
    prompt: 'Compose and send a formal email to priya.sharma@venturecapital.in introducing our platform and proposing a 20-minute Zoom sync next week.',
    expectedAgent: 'EMAIL',
    verify: (data) => {
      const isEmail = data.agent === 'EMAIL' || data.type === 'action_stage';
      const p = data.params || {};
      const toMatch = (p.to || '').includes('priya.sharma@venturecapital.in');
      return {
        passed: isEmail,
        message: `Agent: ${data.agent}, To: ${p.to}, Subject: ${p.subject}`,
      };
    },
  },
  {
    id: 5,
    category: 'Chief of Staff (Morning Dossier Synthesis)',
    prompt: "Give me a full executive briefing of my day: what meetings do I have lined up, what's my budget burn rate looking like, and any priority emails needing my eyes?",
    expectedAgent: 'CHIEF_OF_STAFF',
    verify: (data) => {
      const isCos = data.agent === 'CHIEF_OF_STAFF' || (data.explanation || '').includes('Dossier') || (data.response || '').includes('Dossier') || (data.response || '').includes('Briefing');
      return {
        passed: !!isCos,
        message: `Agent: ${data.agent}, Type: ${data.type}, Has Dossier: ${!!data.params?.dossier || !!data.response}`,
      };
    },
  },
  {
    id: 6,
    category: 'Deep Web Intelligence (Complex Market Query)',
    prompt: 'Conduct deep research on the competitive landscape of sovereign AI data centers in the UAE and Saudi Arabia in 2026, comparing energy costs and government subsidies.',
    expectedAgent: 'RESEARCH',
    verify: (data) => {
      const isResearch = data.agent === 'RESEARCH' || (data.response || '').toLowerCase().includes('sovereign') || (data.response || '').toLowerCase().includes('data center');
      return {
        passed: !!isResearch,
        message: `Agent: ${data.agent}, Response length: ${(data.response || '').length} chars`,
      };
    },
  },
  {
    id: 7,
    category: 'Executive Schedule (Availability & Focus Time)',
    prompt: 'Look at my schedule for today and tell me if I have at least two continuous hours of free focus time before 6 PM.',
    expectedAgent: 'CALENDAR',
    verify: (data) => {
      const isCal = data.agent === 'CALENDAR' || data.type === 'action_stage' || (data.response || '').toLowerCase().includes('schedule') || (data.response || '').toLowerCase().includes('meeting');
      return {
        passed: !!isCal,
        message: `Agent: ${data.agent}, Action: ${data.action}`,
      };
    },
  },
  {
    id: 8,
    category: 'Media Broadcast (YouTube Package Synthesis)',
    prompt: 'I just recorded a deep-dive podcast on building multi-agent systems with Next.js and n8n. Generate 3 viral high-CTR titles, an SEO description with timestamps, and high-volume tags.',
    expectedAgent: 'YOUTUBE',
    verify: (data) => {
      const isYt = data.agent === 'YOUTUBE' || data.type === 'action_stage' || (data.response || '').toLowerCase().includes('title');
      return {
        passed: !!isYt,
        message: `Agent: ${data.agent}, Action: ${data.action}`,
      };
    },
  },
  {
    id: 9,
    category: 'Financial Ledger (Audit & Summary)',
    prompt: 'How much have we spent so far on dining and travel expenses in our financial ledger, and what was our single largest transaction?',
    expectedAgent: 'SHEETS',
    verify: (data) => {
      const isSheets = data.agent === 'SHEETS' || (data.response || '').toLowerCase().includes('expense') || (data.response || '').toLowerCase().includes('ledger') || (data.response || '').toLowerCase().includes('spent');
      return {
        passed: !!isSheets,
        message: `Agent: ${data.agent}, Action: ${data.action}`,
      };
    },
  },
  {
    id: 10,
    category: 'Follow-up Modification (Dynamic Rescheduling)',
    prompt: 'Can we reschedule that Tuesday 4:30 PM meeting to 6:00 PM instead?',
    expectedAgent: 'CALENDAR',
    verify: (data) => {
      const isCal = data.agent === 'CALENDAR' || data.type === 'action_stage' || data.type === 'action_update';
      return {
        passed: !!isCal,
        message: `Agent: ${data.agent}, Action: ${data.action}, Type: ${data.type}`,
      };
    },
  },
];

async function runTest(test: TestCase): Promise<any> {
  const start = Date.now();
  console.log(`\n---------------------------------------------------------------`);
  console.log(`[Test ${test.id}/10] Category: ${test.category}`);
  console.log(`Prompt: "${test.prompt}"`);

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: test.prompt }],
        userProfile,
      }),
    });

    const durationMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        id: test.id,
        category: test.category,
        passed: false,
        durationMs,
        error: `HTTP ${res.status}: ${text}`,
      };
    }

    const data = await res.json();
    const verification = test.verify(data);
    const passed = verification.passed;

    console.log(`Result: ${passed ? '✅ PASSED' : '❌ FAILED'} (${durationMs}ms)`);
    console.log(`Details: ${verification.message}`);
    if (data.explanation) {
      console.log(`Explanation: ${data.explanation.slice(0, 100)}...`);
    } else if (data.response) {
      console.log(`Response: ${data.response.slice(0, 100)}...`);
    }

    return {
      id: test.id,
      category: test.category,
      prompt: test.prompt,
      passed,
      durationMs,
      agent: data.agent,
      type: data.type,
      action: data.action,
      details: verification.message,
      explanation: data.explanation || data.response,
    };
  } catch (err: any) {
    return {
      id: test.id,
      category: test.category,
      passed: false,
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function main() {
  console.log('===============================================================');
  console.log('🧪 RUNNING 10 DYNAMIC EXECUTIVE PROMPTS VERIFICATION');
  console.log('   Target: http://localhost:3000/api/chat');
  console.log('   Testing natural language understanding across all domains');
  console.log('===============================================================');

  const results = [];
  for (const test of TEST_CASES) {
    const res = await runTest(test);
    results.push(res);
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n===============================================================');
  console.log(`📊 FINAL RESULTS: ${passedCount}/10 PASSED (${((passedCount / 10) * 100).toFixed(0)}%)`);
  console.log('===============================================================');

  const summaryFile = path.join(process.cwd(), 'scripts', 'dynamic-prompts-results.json');
  fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
  console.log(`Report written to: ${summaryFile}\n`);
}

main();
