import { chromium } from 'playwright-core';
import * as path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(process.cwd(), '.uber-browser-profile');

async function selectCash() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: true,
    viewport: { width: 420, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://m.uber.com/go/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.getByText('Pick-up location').first().click();
  await page.waitForTimeout(2000);

  const inputs = page.locator('input');
  await inputs.nth(0).fill('Hitec City');
  await page.waitForTimeout(2000);
  await page.locator('li[role="option"]').first().click();
  await page.waitForTimeout(2000);

  const inputs2 = page.locator('input');
  await inputs2.nth(1).fill('Inorbit Mall');
  await page.waitForTimeout(2000);
  await page.locator('li[role="option"]').first().click();
  await page.waitForTimeout(3500);

  console.log('Clicking Add payment method...');
  await page.getByText('Add payment method').first().click();
  await page.waitForTimeout(2500);

  // Find payments frame
  const payFrame = page.frames().find(f => f.url().includes('payments.uber.com'));
  if (payFrame) {
    console.log('Found payments iframe! URL:', payFrame.url());
    console.log('Clicking Cash inside payments iframe...');
    const cash = payFrame.getByText('Cash', { exact: true }).first();
    if (await cash.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cash.click();
      console.log('Successfully clicked Cash in iframe!');
    } else {
      console.log('Cash not visible via getByText, clicking via frame evaluate...');
      await payFrame.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const c = els.find(el => el.textContent && el.textContent.trim() === 'Cash');
        if (c) (c as HTMLElement).click();
      });
    }
  } else {
    console.log('Payment frame not found by url, trying coordinate click at (200, 440)...');
    await page.mouse.click(200, 440);
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'after_iframe_cash.png' });

  // Check the main page text and buttons
  const mainTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, div, span'))
      .map(e => e.textContent?.trim() || '')
      .filter(t => t.includes('Cash') || t.includes('Request') || t.includes('Add payment'));
  });
  console.log('Main page indicators after selecting Cash:', Array.from(new Set(mainTexts)));

  console.log('Saving storageState...');
  await context.storageState({ path: path.join(PROFILE_DIR, 'storageState.json') });
  console.log('Saved storageState.json successfully!');

  await context.close();
}

selectCash().catch(console.error);
