#!/usr/bin/env node
// Verify the live githack CDN URL renders the demo (temporary, deleted before commit).
import { chromium } from 'playwright-core';

const URL = process.argv[2] || 'https://rawcdn.githack.com/ilikevibecoding/My-projects/2e40dad11bcdbd9bbbc0d2fdf53a39d838246438/camping/dist/index.html';
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE:', m.type(), m.text().slice(0, 300)); });
page.on('requestfailed', (r) => console.log('REQFAIL:', r.url().slice(0, 120), r.failure()?.errorText));
await page.goto(URL, { timeout: 60000, waitUntil: 'load' });
console.log('loaded. canvas?', await page.evaluate(() => !!document.querySelector('canvas')));
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  await page.screenshot({ path: '/tmp/_pump.png' });
  await new Promise((r) => setTimeout(r, 500));
  ready = await page.evaluate(() => !!window.__APP_READY);
}
console.log('ready:', ready, 'frame:', await page.evaluate(() => window.__FRAME));
if (ready) {
  await page.evaluate(() => {
    window.debugAPI.setState({ timeOfDay: 'golden', fireLit: true });
    window.debugAPI.setView('camp');
  });
  for (let i = 0; i < 6; i++) await page.screenshot({ path: '/tmp/_pump.png' });
  await page.screenshot({ path: '/tmp/cdn_check.png' });
  console.log('shot saved to /tmp/cdn_check.png');
}
await browser.close();
