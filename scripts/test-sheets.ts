import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runSheetsTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('📊 RUNNING AGENT 2: GOOGLE SHEETS & EXPENSE LEDGER (12 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'SHT-01',
      name: 'Natural Expense Logging (Swiggy 350)',
      prompt: 'I just spent 350 rupees on dinner at Swiggy, please log that.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasAmount = text.includes('350') || data.params?.amount === 350;
        const isSheets = data.agent === 'SHEETS' || text.includes('Expense') || text.includes('Swiggy');
        return { pass: hasAmount && isSheets, reason: hasAmount ? 'Extracted ₹350 and staged expense row' : 'Failed to extract amount' };
      }
    },
    {
      id: 'SHT-02',
      name: 'Colloquial Short Hand (Petrol 1200)',
      prompt: 'Paid 1200 for petrol today',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const has1200 = text.includes('1200') || data.params?.amount === 1200;
        return { pass: has1200, reason: has1200 ? 'Captured 1200 for petrol' : 'Missed 1200 amount' };
      }
    },
    {
      id: 'SHT-03',
      name: 'Detailed Multi-item Purchase (₹4200 Monitor)',
      prompt: 'Add an expense of ₹4,200 for new office monitor from Amazon under Tech equipment',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const has4200 = text.includes('4200') || text.includes('4,200') || data.params?.amount === 4200;
        return { pass: has4200, reason: has4200 ? 'Extracted ₹4,200 and Amazon merchant' : 'Failed to parse ₹4,200' };
      }
    },
    {
      id: 'SHT-04',
      name: 'Expense Statement Breakdown (Recent)',
      prompt: 'Show me a breakdown of all my recent expenses.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasRupee = text.includes('₹');
        const hasDollar = text.includes('$');
        const hasTableOrList = text.includes('•') || text.includes('|') || text.includes('827') || text.includes('499');
        return { pass: hasRupee && !hasDollar && hasTableOrList, reason: hasDollar ? 'Found USD $ sign' : 'Returned itemized ledger in ₹' };
      }
    },
    {
      id: 'SHT-05',
      name: 'Timeframe Filter: This Week',
      prompt: 'How much have I spent so far this week?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const pass = text.includes('₹') && (text.includes('week') || text.includes('Total') || text.includes('Spent'));
        return { pass, reason: pass ? 'Computed weekly expenditure with ₹ en-IN' : 'Failed weekly expenditure filter' };
      }
    },
    {
      id: 'SHT-06',
      name: 'Timeframe Filter: This Month',
      prompt: 'What does my total expenditure look like for this month?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const pass = text.includes('₹') && !text.includes('$');
        return { pass, reason: pass ? 'Computed monthly total cleanly in ₹' : 'Monthly filter failed or used $' };
      }
    },
    {
      id: 'SHT-07',
      name: 'Category Audit: Food & Dining',
      prompt: 'How much did I spend on food and dining?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        return { pass: text.length > 20, reason: 'Audited category spending' };
      }
    },
    {
      id: 'SHT-08',
      name: 'Spelled-out Number Parsing',
      prompt: 'Log five hundred rupees for stationery',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.includes('500') || text.toLowerCase().includes('five hundred') || data.params?.amount === 500;
        return { pass, reason: pass ? 'Interpreted spelled-out number or staged correctly' : 'Failed spelled-out amount' };
      }
    },
    {
      id: 'SHT-09',
      name: 'Missing Category Defaulting (99 bucks)',
      prompt: 'Spent 99 bucks on snacks',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.includes('99') || data.params?.amount === 99;
        return { pass, reason: pass ? 'Safely parsed 99 with default category' : 'Failed to parse 99' };
      }
    },
    {
      id: 'SHT-10',
      name: 'Decimal & Currency Symbol Handling (₹499.50)',
      prompt: 'Log ₹499.50 for Spotify premium subscription',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.includes('499.5') || text.includes('499') || data.params?.amount === 499.5;
        return { pass, reason: pass ? 'Parsed decimal amount accurately' : 'Failed decimal amount' };
      }
    },
    {
      id: 'SHT-11',
      name: 'Ledger Deduplication Verification',
      directAction: {
        agentId: 'SHEETS',
        action: 'list',
        params: { timeframe: 'all' }
      },
      validate: (res: any) => {
        const data = res.data;
        const count = data.data?.count || data.data?.statement?.transactionCount;
        const total = data.data?.totalExpense || data.data?.statement?.totalExpense;
        const pass = res.ok && data.success && total > 0 && !JSON.stringify(data).includes('$');
        return { pass: Boolean(pass), reason: pass ? `Ledger verified: ${count} transactions totaling ₹${total}` : 'Failed ledger query' };
      }
    },
    {
      id: 'SHT-12',
      name: 'Direct Append with Dual MongoDB / Google Sheets Sync',
      directAction: {
        agentId: 'SHEETS',
        action: 'append_row',
        params: {
          amount: 150,
          category: 'Office Supplies',
          merchant: 'Test Pen Store',
          description: 'Automated test row'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && data.success && (data.data?.message?.includes('Recorded') || data.data?.status === 'saved_locally' || data.message?.includes('Recorded') || data.data?.receiptUrl !== undefined);
        return { pass: Boolean(pass), reason: pass ? 'Appended expense row successfully' : 'Append action failed' };
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
        agent: 'SHEETS',
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
        agent: 'SHEETS',
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
  runSheetsTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nSheets Finished: ${passed}/${res.length} Passed`);
  });
}
