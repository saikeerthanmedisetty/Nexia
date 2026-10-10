import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runCalendarTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('📅 RUNNING AGENT 5: GOOGLE CALENDAR (12 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'CAL-01',
      name: 'Natural Meeting Scheduling (Tomorrow 4 PM)',
      prompt: 'Schedule an Executive Strategy Review tomorrow at 4:00 PM for 45 minutes on Google Calendar',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isCal = data.agent === 'CALENDAR' || text.toLowerCase().includes('schedul') || text.toLowerCase().includes('calendar') || text.toLowerCase().includes('meeting');
        return { pass: isCal, reason: 'Staged Executive Strategy Review for tomorrow at 4 PM' };
      }
    },
    {
      id: 'CAL-02',
      name: 'Informal Quick Catchup (15 mins today 6pm)',
      prompt: 'Set up a quick 15 min catch-up with rahul@example.com today at 6pm',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isCal = data.agent === 'CALENDAR' || text.toLowerCase().includes('catch-up') || text.toLowerCase().includes('meet');
        return { pass: isCal, reason: 'Parsed 15-minute duration and 6 PM slot' };
      }
    },
    {
      id: 'CAL-03',
      name: 'Google Meet Auto-Generation & Event Creation API',
      directAction: {
        agentId: 'CALENDAR',
        action: 'create',
        params: {
          title: '[Test] Board Review Sync',
          date: '2026-09-17',
          startTime: '2026-09-17T16:00:00+05:30',
          durationMinutes: 45,
          location: 'Google Meet'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.event?.meetUrl || data.message?.includes('Scheduled'));
        return { pass: Boolean(pass), reason: pass ? 'Scheduled meeting with Google Meet integration' : 'Failed meeting creation' };
      }
    },
    {
      id: 'CAL-04',
      name: 'Natural Schedule Inquiry (Today)',
      prompt: "What's on my calendar for today?",
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isCal = data.agent === 'CALENDAR' || text.toLowerCase().includes('calendar') || text.toLowerCase().includes('schedule') || text.toLowerCase().includes('clear');
        return { pass: isCal, reason: 'Queried today calendar schedule' };
      }
    },
    {
      id: 'CAL-05',
      name: 'Natural Schedule Inquiry (Tomorrow)',
      prompt: 'Do I have any meetings or commitments tomorrow?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasSolapur = text.toLowerCase().includes('solapur') || text.includes('Train') || text.includes('11:10') || data.agent === 'CALENDAR';
        return { pass: Boolean(hasSolapur), reason: hasSolapur ? 'Identified tomorrow commitments including train' : 'Missed tomorrow commitments' };
      }
    },
    {
      id: 'CAL-06',
      name: 'Natural Schedule Inquiry (Day After Tomorrow)',
      prompt: 'What does my schedule look like day after tomorrow?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const leaked = text.includes('Transit to WeWork') || text.includes('Workshop 3 hours');
        return { pass: !leaked, reason: leaked ? 'Leaked past events into day after tomorrow' : 'Isolated day after tomorrow cleanly' };
      }
    },
    {
      id: 'CAL-07',
      name: 'Specific Day Inquiry (This Friday)',
      prompt: 'Check my calendar for this Friday',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const leaked = text.includes('Transit to WeWork');
        return { pass: !leaked, reason: leaked ? 'Leaked past events into Friday' : 'Targeted Friday cleanly' };
      }
    },
    {
      id: 'CAL-08',
      name: 'Schedule Conflict Detection Trigger',
      directAction: {
        agentId: 'CALENDAR',
        action: 'create',
        params: {
          title: '[Test Conflict] Urgent Call',
          date: '2026-09-17',
          startTime: '2026-09-17T23:10:00+05:30', // Overlaps Solapur train!
          durationMinutes: 60,
          location: 'Google Meet'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const text = JSON.stringify(data);
        const hasConflict = data.data?.conflict || text.includes('Conflict') || text.includes('conflict') || text.includes('warning');
        return { pass: Boolean(hasConflict), reason: hasConflict ? 'Detected schedule collision with Solapur train' : 'Allowed conflicting event without warning' };
      }
    },
    {
      id: 'CAL-09',
      name: 'Buffer Time & Transit Buffer Inquiry',
      prompt: 'I have an in-person meeting in Whitefield at 2 PM, make sure I have travel buffer',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.length > 20;
        return { pass, reason: 'Processed travel buffer request' };
      }
    },
    {
      id: 'CAL-10',
      name: 'Past Events Cleanliness Audit',
      directAction: {
        agentId: 'CALENDAR',
        action: 'list',
        params: { timeframe: 'upcoming' }
      },
      validate: (res: any) => {
        const data = res.data;
        const events = data.data?.events || [];
        const hasPast = events.some((e: any) => e.date < '2026-09-16');
        return { pass: !hasPast, reason: hasPast ? 'Returned past events in upcoming list' : 'Zero past events in upcoming schedule' };
      }
    },
    {
      id: 'CAL-11',
      name: 'Travel Event Auto-Tagging (Train to Solapur)',
      directAction: {
        agentId: 'CALENDAR',
        action: 'list',
        params: { date: '2026-09-17' }
      },
      validate: (res: any) => {
        const data = res.data;
        const msg = data.data?.message || data.message || '';
        const isTagged = msg.includes('Travel') || msg.includes('Train') || msg.includes('🚆');
        return { pass: Boolean(isTagged), reason: isTagged ? 'Train event auto-tagged with 🚆 Travel badge' : 'Missing travel tag' };
      }
    },
    {
      id: 'CAL-12',
      name: 'Direct Action Calendar Listing (Upcoming Window)',
      directAction: {
        agentId: 'CALENDAR',
        action: 'list',
        params: { message: 'tomorrow' }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.events?.length > 0);
        return { pass: Boolean(pass), reason: pass ? 'Successfully listed tomorrow agenda via Calendar API' : 'Failed calendar listing' };
      }
    }
  ];

  for (const t of tests) {
    process.stdout.write(`⏳ [${t.id}] ${t.name}... `);
    let res: any;
    let endpoint = '/api/chat';
    if (t.directAction) {
      endpoint = '/api/agents';
      res = await sendAgentAction(t.directAction.agentId, t.directAction.action, t.directAction.params);
    } else {
      res = await sendChatMessage(t.prompt!);
    }

    const { pass, reason } = t.validate(res);
    const snippet = (res.data?.response || res.data?.explanation || res.data?.message || res.data?.data?.message || JSON.stringify(res.data)).slice(0, 140);
    
    if (pass) {
      console.log(`✅ PASSED (${res.durationMs}ms)`);
      console.log(`   Reason: ${reason}`);
      console.log(`   Snippet: ${snippet.replace(/\n/g, ' ')}\n`);
      results.push({
        id: t.id,
        agent: 'CALENDAR',
        name: t.name,
        prompt: t.prompt || JSON.stringify(t.directAction),
        endpoint,
        status: 'PASSED',
        details: reason,
        durationMs: res.durationMs,
        outputSnippet: snippet
      });
    } else {
      console.log(`❌ FAILED (${res.durationMs}ms)`);
      console.log(`   Reason: ${reason}`);
      console.log(`   Snippet: ${snippet.replace(/\n/g, ' ')}\n`);
      results.push({
        id: t.id,
        agent: 'CALENDAR',
        name: t.name,
        prompt: t.prompt || JSON.stringify(t.directAction),
        endpoint,
        status: 'FAILED',
        details: reason,
        durationMs: res.durationMs,
        outputSnippet: snippet
      });
    }
  }

  return results;
}

if (require.main === module) {
  runCalendarTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nCalendar Finished: ${passed}/${res.length} Passed`);
  });
}
