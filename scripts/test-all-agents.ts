import * as fs from 'node:fs';
import * as path from 'node:path';
import { runChiefOfStaffTests } from './test-chief-of-staff';
import { runSheetsTests } from './test-sheets';
import { runUberTests } from './test-uber';
import { runYouTubeTests } from './test-youtube';
import { runCalendarTests } from './test-calendar';
import { runEmailTests } from './test-email';
import { runResearchTests } from './test-research';
import { TestResult } from './test-harness-base';

async function main() {
  console.log('===============================================================');
  console.log('🚀 OMNI-AGENT MASTER AUTONOMOUS VERIFICATION SUITE (80 TESTS)');
  console.log('   Target: http://localhost:3000');
  console.log('   User: Sai Keerthan (saikeerthanmedisetty686@gmail.com)');
  console.log('   Date: 2026-09-16 | Mode: Zero-Mock Live Verification');
  console.log('===============================================================\n');

  const startTime = Date.now();
  const allResults: TestResult[] = [];

  try {
    const cosResults = await runChiefOfStaffTests();
    allResults.push(...cosResults);

    const sheetsResults = await runSheetsTests();
    allResults.push(...sheetsResults);

    const uberResults = await runUberTests();
    allResults.push(...uberResults);

    const ytResults = await runYouTubeTests();
    allResults.push(...ytResults);

    const calResults = await runCalendarTests();
    allResults.push(...calResults);

    const emailResults = await runEmailTests();
    allResults.push(...emailResults);

    const researchResults = await runResearchTests();
    allResults.push(...researchResults);
  } catch (err: any) {
    console.error('Fatal test runner error:', err);
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = allResults.filter(r => r.status === 'PASSED').length;
  const failed = allResults.filter(r => r.status === 'FAILED').length;

  console.log('\n===============================================================');
  console.log(`📊 MASTER TEST RESULTS SUMMARY (${totalDuration}s)`);
  console.log(`   Total Tests Executed: ${allResults.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Pass Rate: ${((passed / (allResults.length || 1)) * 100).toFixed(1)}%`);
  console.log('===============================================================\n');

  // Breakdown by agent
  const agentGroups: Record<string, TestResult[]> = {};
  for (const r of allResults) {
    if (!agentGroups[r.agent]) agentGroups[r.agent] = [];
    agentGroups[r.agent].push(r);
  }

  for (const [agent, tests] of Object.entries(agentGroups)) {
    const aPassed = tests.filter(t => t.status === 'PASSED').length;
    console.log(`• ${agent.padEnd(16)}: ${aPassed}/${tests.length} Passed`);
  }

  // Save full JSON test report
  const reportPath = path.join(process.cwd(), 'scripts', 'master-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}`);
}

main();
