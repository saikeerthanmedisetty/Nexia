import { chromium } from 'playwright-core';
import * as path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(process.cwd(), '.uber-browser-profile');

async function inspectTripsHistory() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: true,
    viewport: { width: 420, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  // Go to activity / trips
  await page.goto('https://riders.uber.com/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('URL on riders.uber.com/trips:', page.url());
  await page.screenshot({ path: 'riders_trips.png' });

  const text1 = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('=== RIDERS TRIPS ===');
  console.log(text1.slice(0, 500));
  console.log('====================');

  await page.goto('https://m.uber.com/go/activity', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('URL on m.uber.com/go/activity:', page.url());
  await page.screenshot({ path: 'm_uber_activity.png' });

  const text2 = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('=== M UBER ACTIVITY ===');
  console.log(text2.slice(0, 500));
  console.log('=======================');

  await context.close();
}

inspectTripsHistory().catch(console.error);
