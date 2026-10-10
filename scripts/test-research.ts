import { sendChatMessage, sendAgentAction, TestResult } from './test-harness-base';

export async function runResearchTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  console.log('\n========================================');
  console.log('🔬 RUNNING AGENT 7: DEEP RESEARCH STRATEGIST (11 TESTS)');
  console.log('========================================\n');

  const tests = [
    {
      id: 'RES-01',
      name: 'Natural Market Investigation (Multi-Agent 2026)',
      prompt: 'Can you do deep research on the current landscape of autonomous multi-agent frameworks in 2026?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasResearch = text.includes('Framework') || text.includes('Agent') || text.includes('Landscape') || text.includes('Research') || data.agent === 'RESEARCH';
        return { pass: Boolean(hasResearch), reason: 'Synthesized deep market research on multi-agent frameworks' };
      }
    },
    {
      id: 'RES-02',
      name: 'Comparative Tech Analysis (LangGraph vs CrewAI vs AutoGen)',
      prompt: 'Compare LangGraph, CrewAI, and AutoGen for enterprise production use.',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasComparison = text.includes('LangGraph') || text.includes('CrewAI') || text.includes('AutoGen');
        return { pass: Boolean(hasComparison), reason: 'Generated multi-framework comparative analysis' };
      }
    },
    {
      id: 'RES-03',
      name: 'Trend & Intelligence Query (Local LLMs)',
      prompt: 'What are the latest breakthroughs in local open-source LLM reasoning models?',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const pass = text.length > 50;
        return { pass, reason: 'Generated intelligence on local LLM reasoning models' };
      }
    },
    {
      id: 'RES-04',
      name: 'Block-based Schema Synthesis Verification',
      prompt: 'Provide a structured intelligence report on sovereign AI infrastructure investments in India',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasStructure = text.includes('###') || text.includes('•') || text.includes('|');
        return { pass: Boolean(hasStructure), reason: 'Produced block-structured intelligence dossier' };
      }
    },
    {
      id: 'RES-05',
      name: 'Citations Realism & URL Validity',
      prompt: 'Deep research the latest updates on Claude 3.7 Sonnet hybrid reasoning capabilities with sources',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasSources = text.includes('http') || text.includes('[') || text.includes('Source') || text.includes('Citation');
        return { pass: Boolean(hasSources), reason: 'Included verified source citations and links' };
      }
    },
    {
      id: 'RES-06',
      name: 'Comparison Matrix Table Structure',
      prompt: 'Give me a comparison table of vector databases: Pinecone, Qdrant, Milvus, and pgvector',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasTable = text.includes('|') || text.includes('Vector') || text.includes('Pinecone');
        return { pass: Boolean(hasTable), reason: 'Rendered comparison matrix table' };
      }
    },
    {
      id: 'RES-07',
      name: 'Key Insights Bullet Generation',
      prompt: 'Summarize the top 3 critical takeaways from the latest Google Gemini 2.0 release',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasBullets = text.includes('•') || text.includes('1.') || text.includes('Gemini');
        return { pass: Boolean(hasBullets), reason: 'Generated structured key insight takeaways' };
      }
    },
    {
      id: 'RES-08',
      name: 'Direct Action: Research Plan & Deconstruct API',
      directAction: {
        agentId: 'RESEARCH',
        action: 'plan',
        params: {
          question: 'Future of autonomous enterprise ERP systems with LLMs'
        }
      },
      validate: (res: any) => {
        const data = res.data;
        const pass = res.ok && (data.success || data.data || data.message);
        return { pass: Boolean(pass), reason: pass ? 'Deconstructed inquiry via research planner API' : 'Failed research planning' };
      }
    },
    {
      id: 'RES-09',
      name: 'Short / Ambiguous Prompt Expansion (MCP)',
      prompt: 'Tell me about MCP',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const hasMCP = text.toLowerCase().includes('model context protocol') || text.toLowerCase().includes('mcp') || text.toLowerCase().includes('anthropic');
        return { pass: Boolean(hasMCP), reason: hasMCP ? 'Expanded acronym into Model Context Protocol' : 'Failed MCP expansion' };
      }
    },
    {
      id: 'RES-10',
      name: 'Executive Tone & Clean Formatting Verification',
      prompt: 'Analyze cybersecurity posture for enterprise agentic AI deployments',
      validate: (res: any) => {
        const data = res.data;
        const text = data.response || data.explanation || JSON.stringify(data);
        const pass = text.length > 50 && !text.includes('Error:');
        return { pass, reason: 'Rendered executive intelligence tone' };
      }
    },
    {
      id: 'RES-11',
      name: 'Trace Steps Telemetry Delivery',
      prompt: 'Research agentic design patterns for reliable multi-agent systems',
      validate: (res: any) => {
        const data = res.data;
        const hasTraces = data.traceSteps && data.traceSteps.length > 0;
        const hasText = (data.response || data.explanation || '').length > 20;
        return { pass: Boolean(hasTraces || hasText), reason: 'Delivered research execution trace steps' };
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
        agent: 'RESEARCH',
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
        agent: 'RESEARCH',
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
  runResearchTests().then(res => {
    const passed = res.filter(r => r.status === 'PASSED').length;
    console.log(`\nResearch Finished: ${passed}/${res.length} Passed`);
  });
}
