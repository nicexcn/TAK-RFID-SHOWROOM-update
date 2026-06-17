/**
 * Playwright E2E template for WSL2 environment.
 *
 * IMPORTANT: Must use --disable-gpu in launch args, otherwise page.screenshot
 * hangs forever (WSLg + Chrome GPU acceleration deadlock).
 *
 * Usage:
 *   1. Make sure dev server is running: npx next dev -p 3458
 *   2. Pre-warm pages with curl before screenshotting (cold compile is ~90s)
 *   3. node scripts/e2e-template.js
 *
 * Run from project root (this file's location) so playwright resolves.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3458';
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'], // CRITICAL: --disable-gpu for WSL2
  });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000); // dev server cold compile is slow

  try {
    // 1. Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-login.png') });

    await page.locator('input').first().fill('admin');
    await page.locator('input[type=password]').fill('admin1234');
    await page.locator('button').filter({ hasText: /sign/i }).click();
    await page.waitForURL(/admin/, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-dashboard.png'), fullPage: true });

    // 2. RFID Surface Scan
    await page.goto(`${BASE_URL}/admin/rfid`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-rfid.png'), fullPage: true });

    // 3. Simulator
    await page.locator('button').filter({ hasText: /จำลอง/ }).click();
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-rfid-after-sim.png'), fullPage: true });

    // 4. TV Display
    const tvPage = await ctx.newPage();
    await tvPage.goto(`${BASE_URL}/display`, { waitUntil: 'domcontentloaded' });
    await tvPage.waitForTimeout(5000);
    await tvPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-display.png') });

    console.log('All screenshots saved to', SCREENSHOTS_DIR);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
