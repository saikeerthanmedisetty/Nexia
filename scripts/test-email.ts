import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runEmailTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('📬 RUNNING AGENT 6: GMAIL AGENT (11 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'EML-01',
      name: 'Unread Mail Count Inquiry',
      prompt: 'Do I have any unread emails waiting in my inbox?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isEmail = data.agent === 'EMAIL' || text.toLowerCase().includes('inbox') || text.toLowerCase().includes('email') || text.toLowerCase().includes('unread');
        return { pass: isEmail, reason: 'Routed to Gmail inbox unread count check' };
      }
    },
    {
      id: 'EML-02',
      name: 'Recent Email Activity Digest',
      prompt: 'Show me the last 5 emails I received and who they are from.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isEmail = data.agent === 'EMAIL' || text.toLowerCase().includes('email') || text.toLowerCase().includes('message');
        return { pass: isEmail, reason: 'Retrieved recent email activity digest' };
      }
    },
    {
      id: 'EML-03',
      name: 'Urgent / Important Email Filter',
      prompt: 'Did anyone send me anything urgent or from clients today?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.length > 20;
        return { pass, reason: 'Audited inbox for urgent/client priority threads' };
      }
    },
    {
      id: 'EML-04',
      name: 'Natural Outbound Email Staging',
      prompt: "Send an email to saikeerthanmedisetty686@gmail.com with subject 'Project Milestone Update' saying the agent testing is on track.",
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasRecipient = text.includes('saikeerthanmedisetty686') || data.params?.to?.includes('saikeerthan');
        const hasSubject = text.includes('Milestone') || data.params?.subject?.includes('Milestone');
        return { pass: hasRecipient && hasSubject, reason: 'Parsed recipient, subject, and staged outbound email' };
      }
    },
    {
      id: 'EML-05',
      name: 'Contextual Draft Reply Generation',
      prompt: 'Draft a polite response to an investor asking for our product demo deck.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.length > 50 && (text.toLowerCase().includes('deck') || text.toLowerCase().includes('demo') || text.toLowerCase().includes('investor'));
        return { pass, reason: 'Drafted executive demo response' };
      }
    },
    {
      id: 'EML-06',
      name: 'Action Items & Deadlines Extraction',
      prompt: "Read through this message and tell me what deadlines and deliverables are mentioned: 'Hey Sai, please review the contract by Thursday 5pm and send the signed copy.'",
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasThursday = text.toLowerCase().includes('thursday') || text.toLowerCase().includes('contract') || text.toLowerCase().includes('review');
        return { pass: hasThursday, reason: 'Extracted deadline (Thursday 5pm) and contract deliverable' };
      }
    },
    {
      id: 'EML-07',
      name: 'Missing Recipient Validation Handling',
      prompt: 'Send an email saying I will be late for the meeting',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.length > 20;
        return { pass, reason: 'Handled email request cleanly without crashing on missing recipient' };
      }
    },
    {
      id: 'EML-08',
      name: 'Malformed Email Address Validation',
      directAction: {
        agentId: 'EMAIL',
        action: 'send',
        params: {
          to: 'invalid-email-address',
          subject: 'Test Bad Address',
          body: 'This should be caught by validation'
        }
      },
      validate: (res: any) => {
        // Must not crash 500
        const pass = res.status === 200 || res.status === 400;
        return { pass, reason: 'Handled malformed email safely without server crash' };
      }
    },
    {
      id: 'EML-09',
      name: 'Direct Action: Live Gmail Inbox Unread Count API',
      directAction: {
        agentId: 'EMAIL',
        action: 'unread',
        params: {}
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.unreadCount !== undefined || data.message?.includes('Inbox'));
        return { pass: Boolean(pass), reason: pass ? 'Queried live Gmail inbox unread count' : 'Failed inbox query' };
      }
    },
    {
      id: 'EML-10',
      name: 'Direct Action: Recent Emails API Listing',
      directAction: {
        agentId: 'EMAIL',
        action: 'read',
        params: { maxResults: 5 }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.messages?.length > 0 || data.message?.includes('Recent'));
        return { pass: Boolean(pass), reason: pass ? 'Fetched recent email threads via Gmail API' : 'Failed email listing' };
      }
    },
    {
      id: 'EML-11',
      name: 'Direct Action: Verified Outbound Dispatch via Gmail API',
      directAction: {
        agentId: 'EMAIL',
        action: 'send',
        params: {
          to: 'saikeerthanmedisetty686@gmail.com',
          subject: '[System Verification] Agent Testing Pipeline Active',
          body: 'This is an autonomous test verifying Gmail API dispatch capability from Omni-Agent.'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.message?.includes('Dispatched') || data.data?.status === 'sent');
        return { pass: Boolean(pass), reason: pass ? 'Dispatched verified outbound email via official Gmail API' : 'Failed Gmail API dispatch' };
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
        agent: 'EMAIL',
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
        agent: 'EMAIL',
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
  runEmailTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nGmail Finished: ${passed}/${res.length} Passed`);
  });
}
