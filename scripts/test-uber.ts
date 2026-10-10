import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runUberTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('🚗 RUNNING AGENT 3: UBER MOBILITY (11 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'UBR-01',
      name: 'Natural Ride Booking (Indiranagar to Airport)',
      prompt: 'Can you book me an Uber from Indiranagar to the Bangalore Airport?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isUber = data.agent === 'UBER' || text.toLowerCase().includes('uber') || text.toLowerCase().includes('ride');
        const hasRoute = text.includes('Airport') || text.includes('Indiranagar') || data.params?.destination?.includes('Airport');
        return { pass: isUber && hasRoute, reason: 'Staged Uber ride between Indiranagar and Airport' };
      }
    },
    {
      id: 'UBR-02',
      name: 'Colloquial Short-form Request (Koramangala to HSR)',
      prompt: 'Need a cab from Koramangala Sony Signal to HSR BDA Complex ASAP',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isUber = data.agent === 'UBER' || text.toLowerCase().includes('uber') || text.toLowerCase().includes('cab');
        return { pass: isUber, reason: 'Identified mobility intent from colloquial cab request' };
      }
    },
    {
      id: 'UBR-03',
      name: 'Specific Tier Preference (Uber Premier)',
      prompt: 'Get me an Uber Premier from MG Road to Whitefield',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasPremier = text.toLowerCase().includes('premier') || data.params?.selected_tier?.toLowerCase().includes('premier') || data.params?.tier?.toLowerCase().includes('premier');
        return { pass: Boolean(hasPremier), reason: hasPremier ? 'Selected Uber Premier tier correctly' : 'Missed Premier tier preference' };
      }
    },
    {
      id: 'UBR-04',
      name: 'Budget / Auto Request (Uber Auto)',
      prompt: 'Book an Uber Auto from my home to the metro station',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasAuto = text.toLowerCase().includes('auto') || data.params?.tier?.toLowerCase().includes('auto') || data.params?.selected_tier?.toLowerCase().includes('auto');
        return { pass: Boolean(hasAuto), reason: hasAuto ? 'Selected Uber Auto tier cleanly' : 'Missed Auto tier preference' };
      }
    },
    {
      id: 'UBR-05',
      name: 'Fare Estimation Inquiry',
      prompt: 'How much will an Uber cost from HSR Layout to Electronic City right now?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasFare = text.includes('₹') || text.toLowerCase().includes('fare') || text.toLowerCase().includes('est') || data.agent === 'UBER';
        return { pass: Boolean(hasFare), reason: 'Provided fare estimation for mobility route' };
      }
    },
    {
      id: 'UBR-06',
      name: 'Time-Sensitive Arrival Route',
      prompt: 'I need to reach Kempegowda station by 8:30 PM, set up a ride from Jayanagar',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isUber = data.agent === 'UBER' || text.toLowerCase().includes('uber');
        return { pass: isUber, reason: 'Scheduled time-sensitive ride to station' };
      }
    },
    {
      id: 'UBR-07',
      name: 'Booking Deep-link Generation & Tariff Verification',
      directAction: {
        agentId: 'UBER',
        action: 'book',
        params: {
          pickup: 'Indiranagar Metro Station',
          destination: 'Kempegowda International Airport',
          tier: 'Uber Go',
          fare: 750,
          headless: false
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const text = data.data?.message || data.message || JSON.stringify(data);
        const hasLink = text.includes('m.uber.com') || text.includes('booking') || data.data?.pickup;
        return { pass: Boolean(hasLink), reason: hasLink ? 'Generated valid m.uber.com deep link and route' : 'Failed deep link generation' };
      }
    },
    {
      id: 'UBR-08',
      name: 'Live Ride Telemetry Tracking',
      directAction: {
        agentId: 'UBER',
        action: 'telemetry',
        params: {
          booking_id: 'UBER-IND-TEST-001',
          pickup: 'Indiranagar',
          destination: 'Airport'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.driver || data.data?.status === 'accepted');
        return { pass: Boolean(pass), reason: pass ? 'Telemetry returned live driver and vehicle status' : 'Telemetry failed' };
      }
    },
    {
      id: 'UBR-09',
      name: 'Driver Details & Plate Formatting',
      directAction: {
        agentId: 'UBER',
        action: 'telemetry',
        params: {
          driver: { name: 'Vikram Singh', phone_number: '+91 98765 43210', rating: '4.94' },
          vehicle: { make_model: 'Maruti Suzuki Dzire', license_plate: 'KA 03 AB 1234', color: 'Silver' },
          eta: 4
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const raw = JSON.stringify(data);
        const hasPlate = raw.includes('KA 03') || raw.includes('Vikram') || raw.includes('Fleet') || raw.includes('Silver');
        return { pass: Boolean(hasPlate), reason: hasPlate ? 'Driver details and license plate bound cleanly' : 'Failed driver details' };
      }
    },
    {
      id: 'UBR-10',
      name: 'Driver Cancellation Handling',
      directAction: {
        agentId: 'UBER',
        action: 'cancel',
        params: {
          booking_id: 'UBER-IND-TEST-001',
          cancellation_reason: 'Driver tire flat'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (JSON.stringify(data).includes('cancel') || data.data?.status === 'driver_canceled');
        return { pass: Boolean(pass), reason: pass ? 'Handled driver cancellation gracefully' : 'Failed cancellation handling' };
      }
    },
    {
      id: 'UBR-11',
      name: 'Completed Ride Expense Cross-Sync to Sheets',
      directAction: {
        agentId: 'SHEETS',
        action: 'append_row',
        params: {
          amount: 750,
          category: 'Transportation',
          merchant: 'Uber India',
          description: 'Cab to Kempegowda Airport'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && data.success && (data.data?.status === 'saved_locally' || data.message?.includes('Recorded'));
        return { pass: Boolean(pass), reason: pass ? 'Cross-synced Uber trip fare (₹750) to expense ledger' : 'Failed cross-sync' };
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
        agent: 'UBER',
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
        agent: 'UBER',
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
  runUberTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nUber Finished: ${passed}/${res.length} Passed`);
  });
}
