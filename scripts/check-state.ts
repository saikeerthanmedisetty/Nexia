import { chromium } from 'playwright-core';
import * as path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(process.cwd(), '.uber-browser-profile');

async function checkCurrentState() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: true,
    viewport: { width: 420, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://m.uber.com/go/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  console.log('Current URL on m.uber.com:', page.url());
  const bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('Body text on m.uber.com:', bodyText.slice(0, 400));
  await page.screenshot({ path: 'current_m_uber.png' });

  // Navigate to trips / activity
  await page.goto('https://m.uber.com/go/trips', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('Trips page URL:', page.url());
  const tripsText = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('Trips text:', tripsText.slice(0, 400));
  await page.screenshot({ path: 'trips_page.png' });

  // Check account profile name / phone / email
  await page.goto('https://m.uber.com/go/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Profile page URL:', page.url());
  const profileText = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('Profile details:', profileText.slice(0, 300));
  await page.screenshot({ path: 'profile_page.png' });

  await context.close();
}

checkCurrentState().catch(console.error);
