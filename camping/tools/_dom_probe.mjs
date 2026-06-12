#!/usr/bin/env node
// What does the browser ACTUALLY receive from githack? (temporary, deleted before commit)
import { chromium } from 'playwright-core';

const URL = process.argv[2];
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('response', (r) => console.log('RESP:', r.status(), r.headers()['content-type'] || '-', r.url().slice(0, 140)));
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
page.on('console', (m) => console.log('CONSOLE[' + m.type() + ']:', m.text().slice(0, 300)));
await page.goto(URL, { timeout: 60000, waitUntil: 'networkidle' }).catch((e) => console.log('goto:', e.message.slice(0, 120)));
console.log('TITLE:', await page.title());
console.log('SCRIPTS:', await page.evaluate(() => [...document.querySelectorAll('script')].map((s) => (s.src || 'inline').slice(0, 140))));
console.log('BODY(0,400):', (await page.evaluate(() => document.body.innerHTML.slice(0, 400))).replace(/\n/g, ' '));
await browser.close();
