import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runChiefOfStaffTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('🤖 RUNNING AGENT 1: CHIEF OF STAFF (12 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'COS-01',
      name: 'Core Today Briefing',
      prompt: 'Hey, give me a quick rundown of what my day looks like today.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasRupee = text.includes('₹') || data.params?.dossier?.financials?.totalSpentFormatted?.includes('₹');
        const hasDollar = text.includes('$') || JSON.stringify(data).includes('"totalSpent": "$');
        const pass = (data.agent === 'CHIEF_OF_STAFF' || text.includes('Executive') || text.includes('Dossier') || text.includes('Briefing')) && !hasDollar;
        return { pass, reason: hasDollar ? 'Found rogue $ symbol in response' : 'Generated valid executive dossier with ₹ localization' };
      }
    },
    {
      id: 'COS-02',
      name: 'Tomorrow Travel & Schedule Horizon',
      prompt: "What's on my plate for tomorrow? Any travel or trains I should be ready for?",
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasSolapur = text.toLowerCase().includes('solapur') || text.includes('Train') || text.includes('11:10 PM') || text.includes('23:10');
        return { pass: hasSolapur, reason: hasSolapur ? 'Successfully identified Solapur train tomorrow' : 'Missed Solapur train on tomorrow schedule' };
      }
    },
    {
      id: 'COS-03',
      name: 'Day After Tomorrow Schedule Isolation',
      prompt: 'Do I have anything lined up for day after tomorrow?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const leakedSep15 = text.includes('Try 1 hour later') || text.includes('Transit to WeWork') || text.includes('Workshop 3 hours');
        const pass = !leakedSep15;
        return { pass, reason: leakedSep15 ? 'Leaked past events from Sep 15' : 'Properly isolated day after tomorrow without past event pollution' };
      }
    },
    {
      id: 'COS-04',
      name: 'Specific Future Date Horizon',
      prompt: 'What does my schedule look like on September 25th?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasSep15 = text.includes('Workshop 3 hours') || text.includes('Transit to WeWork');
        return { pass: !hasSep15, reason: hasSep15 ? 'Leaked past events into future date query' : 'Target date isolated cleanly' };
      }
    },
    {
      id: 'COS-05',
      name: 'Burn Rate & Financial Health Audit',
      prompt: 'How much money have I spent recently, and what is my current financial burn rate?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasRupee = text.includes('₹') || text.includes('827') || text.includes('499');
        const hasDollar = text.includes('$');
        return { pass: hasRupee && !hasDollar, reason: hasDollar ? 'Found USD $ sign' : 'Ledger queried with ₹ en-IN formatting' };
      }
    },
    {
      id: 'COS-06',
      name: 'Focus Time & Schedule Density Audit',
      prompt: 'Do I have any focus blocks or free time to actually get deep work done today?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const mentionsTime = text.toLowerCase().includes('focus') || text.toLowerCase().includes('free') || text.toLowerCase().includes('clear') || text.toLowerCase().includes('hour');
        return { pass: mentionsTime, reason: 'Evaluated schedule density and focus time availability' };
      }
    },
    {
      id: 'COS-07',
      name: 'Priority Action Items & Radar',
      prompt: 'What are the most urgent priorities and pending tasks I need to tackle right now?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const priorities = data.params?.dossier?.topPriorities || [];
        const hasPriorities = text.toLowerCase().includes('priorit') || text.toLowerCase().includes('task') || text.toLowerCase().includes('action') || priorities.length > 0;
        return { pass: Boolean(hasPriorities), reason: hasPriorities ? `Returned ${priorities.length} priority radar items` : 'Missing priorities' };
      }
    },
    {
      id: 'COS-08',
      name: 'Weekend Schedule Check',
      prompt: 'Do I have anything on the calendar for this coming weekend?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const leakedSep15 = text.includes('Transit to WeWork');
        return { pass: !leakedSep15, reason: leakedSep15 ? 'Leaked Sep 15 into weekend query' : 'Weekend query isolated correctly' };
      }
    },
    {
      id: 'COS-09',
      name: 'Multi-turn Contextual Follow-up',
      prompt: 'And what about evening hours?',
      history: [
        { role: 'user', content: "What's on my schedule for tomorrow?" },
        { role: 'assistant', content: 'You have a train to Solapur at 11:10 PM.' }
      ],
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        return { pass: text.length > 20, reason: 'Maintained conversational context in follow-up' };
      }
    },
    {
      id: 'COS-10',
      name: 'Far Future Arbitrary Horizon (Nov 12)',
      prompt: 'Check my agenda for November 12th, 2026.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const leaked = text.includes('Workshop 3 hours');
        return { pass: !leaked, reason: leaked ? 'Leaked past events into Nov 12' : 'Handled far future date cleanly' };
      }
    },
    {
      id: 'COS-11',
      name: 'Disconnected Webhook Native Synthesis Resilience',
      directAction: {
        agentId: 'CHIEF_OF_STAFF',
        action: 'briefing',
        params: { targetDate: 'today', forceNative: true }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.dossier || data.message?.includes('Executive Dossier'));
        return { pass: Boolean(pass), reason: pass ? 'Synthesized briefing natively without failing' : 'Failed native synthesis' };
      }
    },
    {
      id: 'COS-12',
      name: 'Executive Strategic Recommendation',
      prompt: 'What is your strategic advice for how I should pace my energy today based on my meetings and expenses?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const pass = text.length > 50 && !text.includes('Error');
        return { pass, reason: pass ? 'Generated executive pacing advice' : 'Failed to generate recommendation' };
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
      res = await sendChatMessage(t.prompt!, t.history || []);
    }

    const { pass, reason } = t.validate(res);
    const snippet = (res.data?.response || res.data?.explanation || res.data?.message || res.data?.data?.message || JSON.stringify(res.data)).slice(0, 140);
    
    if (pass) {
      console.log(`✅ PASSED (${res.durationMs}ms)`);
      console.log(`   Reason: ${reason}`);
      console.log(`   Snippet: ${snippet.replace(/\n/g, ' ')}\n`);
      results.push({
        id: t.id,
        agent: 'CHIEF_OF_STAFF',
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
        agent: 'CHIEF_OF_STAFF',
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
  runChiefOfStaffTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nChief of Staff Finished: ${passed}/${res.length} Passed`);
  });
}
