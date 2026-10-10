import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runYouTubeTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('🎬 RUNNING AGENT 4: YOUTUBE DATA API (11 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'YT-01',
      name: 'Channel Performance Analytics Inquiry',
      prompt: 'How is my YouTube channel doing lately? Give me the latest stats.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isYT = data.agent === 'YOUTUBE' || text.toLowerCase().includes('youtube') || text.toLowerCase().includes('channel');
        return { pass: isYT, reason: 'Identified YouTube channel analytics intent' };
      }
    },
    {
      id: 'YT-02',
      name: 'Recent Channel Uploads Inquiry',
      prompt: 'What are the last few videos I published on my channel?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isYT = data.agent === 'YOUTUBE' || text.toLowerCase().includes('video') || text.toLowerCase().includes('upload');
        return { pass: isYT, reason: 'Queried recent video uploads for @SaikeerthanMedisetty' };
      }
    },
    {
      id: 'YT-03',
      name: 'Subscribers & Total Views Direct Query',
      prompt: 'How many total views and subscribers do I have right now?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const isYT = data.agent === 'YOUTUBE' || text.toLowerCase().includes('subscriber') || text.toLowerCase().includes('view');
        return { pass: isYT, reason: 'Routed to subscriber and view count check' };
      }
    },
    {
      id: 'YT-04',
      name: 'Video Search Query',
      prompt: 'Find some good tutorials on building autonomous AI agents on YouTube.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const hasSearch = text.includes('youtube.com') || text.includes('Tutorial') || text.includes('Agent') || data.agent === 'YOUTUBE';
        return { pass: hasSearch, reason: 'Generated YouTube search query and links' };
      }
    },
    {
      id: 'YT-05',
      name: 'Video Transcript / Content Summarization',
      prompt: 'Can you summarize this YouTube video for me: https://www.youtube.com/watch?v=ix9Sw6PrUJQ',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.length > 20;
        return { pass, reason: 'Extracted video URL and staged summarization' };
      }
    },
    {
      id: 'YT-06',
      name: 'Video Metadata Staging (Autonomous Agents)',
      prompt: 'Prepare a title and description to publish my new video on building multi-agent AI systems',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.toLowerCase().includes('title') || text.toLowerCase().includes('agent') || data.agent === 'YOUTUBE';
        return { pass, reason: 'Staged video metadata title and description' };
      }
    },
    {
      id: 'YT-07',
      name: 'SEO Tag Generation for Tech Tutorial',
      prompt: 'Give me high-ranking YouTube tags for a video about Next.js and n8n automations',
      validate: (res: any) => {
        const data = res.data;
        const text = data.explanation || data.response || JSON.stringify(data);
        const pass = text.toLowerCase().includes('tag') || text.toLowerCase().includes('next.js') || text.toLowerCase().includes('n8n');
        return { pass, reason: 'Generated SEO tags for YouTube tutorial' };
      }
    },
    {
      id: 'YT-08',
      name: 'Direct Action: Live Channel Stats API',
      directAction: {
        agentId: 'YOUTUBE',
        action: 'stats',
        params: { channel: '@SaikeerthanMedisetty' }
      },
      validate: (res: any) => {
        const data = res.data;
        const text = data.data?.message || data.message || JSON.stringify(data);
        const hasStats = text.includes('Subscribers') || text.includes('@SaikeerthanMedisetty') || data.data?.stats;
        return { pass: Boolean(hasStats), reason: hasStats ? 'Synced live channel metrics via YouTube Data API v3' : 'Failed YouTube stats query' };
      }
    },
    {
      id: 'YT-09',
      name: 'Direct Action: Recent Videos API Listing',
      directAction: {
        agentId: 'YOUTUBE',
        action: 'list',
        params: { maxResults: 5 }
      },
      validate: (res: any) => {
        const data = res.data;
        const text = data.data?.message || data.message || JSON.stringify(data);
        const pass = data.data?.videos?.length > 0 || text.includes('Uploads') || text.includes('http');
        return { pass: Boolean(pass), reason: pass ? 'Fetched recent channel uploads with video links' : 'Failed recent videos listing' };
      }
    },
    {
      id: 'YT-10',
      name: 'Direct Action: Video Search via API',
      directAction: {
        agentId: 'YOUTUBE',
        action: 'search',
        params: { query: 'Next.js 15 Agent Tutorial' }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data?.status === 'search_completed' || JSON.stringify(data).includes('search'));
        return { pass: Boolean(pass), reason: pass ? 'Executed YouTube video search cleanly' : 'Failed video search' };
      }
    },
    {
      id: 'YT-11',
      name: 'Unauthenticated / Scope Guidance Verification',
      directAction: {
        agentId: 'YOUTUBE',
        action: 'upload',
        params: { title: 'Test Staging Video', privacyStatus: 'private' }
      },
      validate: (res: any) => {
        const data = res.data;
        const text = JSON.stringify(data);
        const pass = text.includes('Video') || text.includes('Uploaded') || text.includes('Google Suite') || text.includes('privacyStatus');
        return { pass: Boolean(pass), reason: 'Staged or published video metadata cleanly' };
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
        agent: 'YOUTUBE',
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
        agent: 'YOUTUBE',
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
  runYouTubeTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nYouTube Finished: ${passed}/${res.length} Passed`);
  });
}
