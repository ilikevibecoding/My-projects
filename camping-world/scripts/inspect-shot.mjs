/**
 * Screenshot a single optimized model via inspect.html.
 * Usage: node scripts/inspect-shot.mjs <modelId> [tag] [angles=30,120]
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const modelId = process.argv[2];
const tag = process.argv[3] ?? 'a';
const angles = (process.argv[4] ?? '30,120').split(',').map(Number);
if (!modelId) {
  console.error('usage: node scripts/inspect-shot.mjs <modelId> [tag] [angles]');
  process.exit(1);
}

const outDir = '/opt/cursor/artifacts/inspect';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) =>
    existsSync(p)
  ),
  args: ['--no-sandbox', '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
page.on('console', (m) => console.log(`  [page] ${m.text()}`));
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:5174/inspect.html?model=${modelId}`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForFunction(() => window.__READY === true, null, { timeout: 300000, polling: 500 });
for (const a of angles) {
  await page.evaluate((deg) => window.__setAngle(deg), a);
  await page.waitForTimeout(400);
  const f = `${outDir}/${modelId}-${tag}-${a}.png`;
  await page.screenshot({ path: f });
  console.log(f);
}
await browser.close();
