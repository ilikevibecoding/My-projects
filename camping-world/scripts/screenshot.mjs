/**
 * Self-play screenshot harness.
 *
 * Renders the scene headlessly (system Chrome + SwiftShader WebGL2) from the
 * fixed viewpoints defined in src/debug/harness.js and writes PNGs + a stats
 * JSON (renderer.info budgets + console errors) for visual review.
 *
 * Usage:
 *   node scripts/screenshot.mjs --iter 03 [--views 0,2,5] [--out DIR] [--px 1]
 *
 * Reuses a running vite dev server on :5174, otherwise spawns one and leaves
 * it running for subsequent iterations.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = 'http://127.0.0.1:5174';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const iter = arg('iter', new Date().toISOString().replace(/[:.]/g, '-'));
const outDir = arg('out', '/opt/cursor/artifacts/shots');
const px = arg('px', '1');
const viewsArg = arg('views', null);
const width = parseInt(arg('width', '1920'), 10);
const height = parseInt(arg('height', '1080'), 10);

async function serverUp() {
  try {
    const res = await fetch(URL_BASE, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return console.log('[shots] reusing dev server on :5174');
  console.log('[shots] starting vite dev server…');
  const child = spawn('npx', ['vite', '--port', '5174', '--strictPort'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await serverUp()) return console.log('[shots] dev server ready');
  }
  throw new Error('vite dev server failed to start within 60s');
}

const CHROME_CANDIDATES = ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'];

async function main() {
  await ensureServer();
  mkdirSync(outDir, { recursive: true });

  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  const browser = await chromium.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
    ],
  });

  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) consoleMessages.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleMessages.push(`[pageerror] ${e.message}`));

  console.log('[shots] loading scene…');
  await page.goto(`${URL_BASE}/?shot=1&px=${px}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__READY === true, null, {
    timeout: 600000,
    polling: 1000,
  });
  console.log('[shots] scene ready');

  const viewNames = await page.evaluate(() => window.__views());
  const views = viewsArg
    ? viewsArg.split(',').map((v) => parseInt(v, 10))
    : viewNames.map((_, i) => i);

  const stats = { iter, timestamp: new Date().toISOString(), views: {}, console: consoleMessages };

  for (const i of views) {
    const name = await page.evaluate((idx) => window.__setView(idx), i);
    const file = join(outDir, `iter-${iter}-v${i}-${name}.png`);
    await page.screenshot({ path: file });
    stats.views[name] = await page.evaluate(() => window.__stats());
    console.log(`[shots] ${file}  calls=${stats.views[name].calls} tris=${stats.views[name].triangles}`);
  }

  const statsFile = join(outDir, `iter-${iter}-stats.json`);
  writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  console.log(`[shots] stats → ${statsFile}`);
  if (consoleMessages.length) {
    console.log('[shots] CONSOLE ISSUES:');
    for (const m of consoleMessages) console.log('  ' + m);
  } else {
    console.log('[shots] console clean');
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
