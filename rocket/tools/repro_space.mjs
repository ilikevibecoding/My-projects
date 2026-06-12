// repro_space.mjs — one-off bug repro: builder -> click LAUNCH -> press Space
// (real user flow, real-time rendering), screenshot a burst of frames.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/repro_space';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/0_builder.png` });

await page.click('#launch-btn');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/1_prelaunch.png` });

await page.keyboard.press('Space');           // first space = ignition
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/2_ignite_${i}.png` });
}
console.log('focused element after space:', await page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName}#${a.id || '(no id)'}` : 'none';
}));
await browser.close();
console.log('done ->', OUT);
