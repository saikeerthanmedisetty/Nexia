import { chromium } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(process.cwd(), '.uber-browser-profile');

async function main() {
  console.log('🚀 Launching Chrome for One-Time Uber Authentication...');
  console.log(`📁 Profile directory: ${PROFILE_DIR}`);

  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`❌ Google Chrome not found at ${CHROME_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: false,
    viewport: null, // Natural window size
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('\n======================================================');
  console.log('👉 Navigating to https://m.uber.com/go/home ...');
  console.log('1. If signed into another account, click the menu (top-right) and "Sign out".');
  console.log('2. Log into your Uber account using your exact Phone Number & SMS OTP (matching your phone app).');
  console.log('3. Once logged in and you see the Uber Ride / Map screen, return here and press ENTER.');
  console.log('======================================================\n');

  await page.goto('https://m.uber.com/go/home', { waitUntil: 'domcontentloaded' });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('Press [ENTER] after you have successfully logged in on Chrome: ', () => {
      rl.close();
      resolve();
    });
  });

  console.log('\n💾 Saving session cookies and tokens...');
  await context.storageState({ path: path.join(PROFILE_DIR, 'storageState.json') });
  await context.close();

  console.log('✅ Success! Your Uber session is saved in .uber-browser-profile.');
  console.log('🎉 Omni-Agent can now automate Uber headlessly in the background without touching the app!\n');
}

main().catch((err) => {
  console.error('❌ Error during Uber authentication:', err);
  process.exit(1);
});
