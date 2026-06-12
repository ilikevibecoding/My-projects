import { chromium } from 'playwright';
import fs from 'fs';

const url = process.argv[2];
const browser = await chromium.launch({ args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-features=UserAgentClientHint',
  '--disable-blink-features=AutomationControlled',
] });
const page = await browser.newPage({
  viewport: { width: 1024, height: 576 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});

const responses = [];
page.on('response', (r) => responses.push(`${r.status()} ${r.headers()['content-type'] || '?'} ${r.url()}`));

const resp = await page.goto(url, { waitUntil: 'load', timeout: 90000 });
console.log('document status:', resp.status(), resp.headers()['content-type']);
try {
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.frames() > 0, null, { timeout: 240000 });
  const frames = await page.evaluate(() => window.debugAPI.frames());
  const data = await page.evaluate(() => window.debugAPI.capture());
  fs.writeFileSync('shots/probe/cdn.jpg', Buffer.from(data.split(',')[1], 'base64'));
  console.log('BOOT_OK frames rendered:', frames);
} catch {
  console.log('BOOT_TIMEOUT');
  console.log('debugAPI present:', await page.evaluate(() => !!window.debugAPI));
}
console.log('responses:'); for (const r of responses) console.log(' ', r);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
