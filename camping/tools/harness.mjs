// Shared harness plumbing for the visual remaster.
//
// Key environment facts this encodes (measured, see REMASTER.md):
//  * This machine has NO GPU. Every Chrome path resolves to ANGLE/SwiftShader.
//  * Idle headless Chrome throttles rAF to ~0.3 fps. HEADED Chrome on DISPLAY=:1
//    with anti-throttle flags renders continuously (~12 fps on the baseline
//    scene), which is 40x faster and needs no screenshot "pumping" hacks.
//  * Official perf numbers must come from ONE browser instance (parallel
//    CPU-rendered workers compete for cores and produce bogus fps).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const URL_APP = 'http://127.0.0.1:5173/';
export const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

export const ANTI_THROTTLE = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
  '--disable-frame-rate-limit',
];

// CRITICAL (measured): with no GPU present, Chrome's *automatic* software
// fallback runs the scene at ~0.25 fps, while explicitly selecting the ANGLE
// SwiftShader backend runs the identical scene at ~9-13 fps — a 36x difference,
// same unmasked renderer string. Without this flag the harness is unusable.
// Set ANGLE_BACKEND=none on a machine with a real GPU.
export const ANGLE_BACKEND = process.env.ANGLE_BACKEND || 'swiftshader';
export const ANGLE_ARGS = ANGLE_BACKEND === 'none' ? [] : [`--use-angle=${ANGLE_BACKEND}`];

export const VIEWPORTS = {
  '1280x720': { width: 1280, height: 720 },
  '1920x1080': { width: 1920, height: 1080 },
  '1366x768': { width: 1366, height: 768 },
};

export async function ensureDevServer() {
  try {
    const res = await fetch(URL_APP, { signal: AbortSignal.timeout(2500) });
    if (res.ok) return null;
  } catch { /* not up */ }
  console.log('starting vite dev server...');
  const child = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', detached: true,
  });
  child.unref();
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(URL_APP, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return child;
    } catch { /* retry */ }
  }
  throw new Error('vite dev server did not come up');
}

export async function launch({ headless = false } = {}) {
  return chromium.launch({
    executablePath: CHROME,
    headless,
    args: ['--no-sandbox', '--disable-gpu-sandbox', ...ANGLE_ARGS, ...ANTI_THROTTLE],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
  });
}

/**
 * Fresh page, loaded app, error capture attached.
 * Every capture starts from a real reload so state can never leak between shots.
 */
/**
 * SwiftShader's GPU process is killed by a watchdog roughly 90 s into a
 * session and every ~60 s after that; three.js cannot recover from the lost
 * context, so everything captured afterwards is blank. Rather than fighting
 * the environment we keep every page session short and recycle it before the
 * window closes (see SESSION_BUDGET_MS / captureSession()).
 */
export const SESSION_BUDGET_MS = 60000;

export async function newGamePage(browser, viewport = VIEWPORTS['1280x720'], opts = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  // Enter manual mode BEFORE the app boots: any window of continuous software
  // rendering (even just during load) can trip the GPU watchdog and kill the
  // context, which poisons every later capture on this page.
  const manual = opts.manual !== false;
  await page.addInitScript((isManual) => {
    if (isManual) window.__MANUAL_MODE = true;
    window.__CTX_LOST = false;
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...a) {
      const c = g.apply(this, a);
      if (String(a[0]).startsWith('webgl')) {
        this.addEventListener('webglcontextlost', () => { window.__CTX_LOST = true; });
      }
      return c;
    };
  }, manual);
  const errors = [];
  page.on('pageerror', (e) => errors.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!t.includes('favicon') && !t.includes('404')) errors.push({ type: 'console', text: t.slice(0, 400) });
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('favicon')) errors.push({ type: 'requestfailed', text: `${u.slice(0, 160)} ${r.failure()?.errorText}` });
  });
  page.errors = errors;
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await waitAppReady(page);
  // deterministic simulation for reproducible animation state
  const step = opts.fixedStep ?? 1 / 60;
  if (step > 0) await page.evaluate((s) => window.debugAPI.setFixedStep(s), step);
  // Manual mode is the default for captures: the harness drives simulation and
  // rendering explicitly. Continuous software rendering is what trips Chrome's
  // GPU watchdog (context loss ≈90 s in), and it also makes animation timing
  // depend on machine load. Playthrough/perf runs opt out.
  if (manual) await page.evaluate(() => window.debugAPI.setManualMode(true));
  page.__born = Date.now();
  return page;
}

/**
 * Deterministic capture: advance the simulation by a known number of fixed
 * steps, render one frame, and pull the canvas back as a PNG — all in a single
 * synchronous in-page call. ~4 s per shot, and it never loses the context.
 */
export async function captureFrameToFile(page, path, { steps = 8, dt = 1 / 60 } = {}) {
  const url = await page.evaluate(([s, d]) => window.debugAPI.captureFrame({ steps: s, dt: d }), [steps, dt]);
  if (!url || !url.startsWith('data:image/png')) throw new Error('captureFrame returned no image');
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (buf.length < 5000) throw new Error(`suspiciously small frame (${buf.length} bytes)`);
  writeFileSync(path, buf);
  return buf.length;
}

/**
 * Capture including DOM overlays (HUD). Renders one frame manually, then uses
 * a normal screenshot to composite the DOM on top; cheap because nothing is
 * rendering in the background.
 */
export async function captureCompositeToFile(page, path, { steps = 8, dt = 1 / 60 } = {}) {
  await page.evaluate(([s, d]) => { window.debugAPI.step(s, d); window.debugAPI.renderOnce(); }, [steps, dt]);
  await page.screenshot({ path, timeout: 120000 });
}

/** True when the GPU process died under this page (all later shots are blank). */
export async function isContextLost(page) {
  return page.evaluate(() => window.__CTX_LOST === true).catch(() => true);
}

/**
 * Runs `fn(page)` for each item, transparently recycling the page before the
 * watchdog window elapses and retrying items that landed on a dead context.
 */
export async function captureSession(browser, viewport, items, fn, { onLog = () => {} } = {}) {
  let page = await newGamePage(browser, viewport);
  const results = [];
  const queue = items.slice();
  const attempts = new Map();
  while (queue.length) {
    const item = queue[0];
    const n = (attempts.get(item) || 0);
    if (n >= 3) { queue.shift(); results.push({ item, error: 'failed after 3 attempts' }); continue; }
    const stale = Date.now() - page.__born > SESSION_BUDGET_MS;
    if (stale || await isContextLost(page)) {
      onLog(`   recycling page (${stale ? 'session budget' : 'context lost'})`);
      await page.close().catch(() => {});
      page = await newGamePage(browser, viewport);
    }
    attempts.set(item, n + 1);
    try {
      const r = await fn(page, item);
      if (r && r.drawCalls === 0) throw new Error('blank frame (0 draw calls)');
      queue.shift();
      results.push({ item, ...r });
    } catch (e) {
      onLog(`   retry ${item.name || ''}: ${String(e.message || e).slice(0, 90)}`);
      await page.close().catch(() => {});
      page = await newGamePage(browser, viewport);
    }
  }
  await page.close().catch(() => {});
  return results;
}

/**
 * CRITICAL (measured): never hold an open CDP evaluation while you expect the
 * page to render. `page.evaluate(() => new Promise(...))` and
 * `page.waitForFunction(...)` keep a Runtime.awaitPromise / polling session
 * open, which runs a nested message loop in the renderer and starves
 * requestAnimationFrame — the same scene drops from ~9 fps to ~0.1 fps.
 *
 * Every wait below is therefore: sleep in Node (page runs completely free),
 * then make one short synchronous evaluate to read state.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFrames(page, n, timeoutMs = 180000) {
  if (n <= 0) return;
  const start = await page.evaluate(() => window.__FRAME);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(100);
    const f = await page.evaluate(() => window.__FRAME);
    if (f >= start + n) return;
  }
  throw new Error(`waitFrames(${n}) timed out`);
}

/** Poll a synchronous in-page predicate, sleeping in Node between checks. */
export async function waitUntil(page, predicateFn, timeoutMs = 180000) {
  const src = typeof predicateFn === 'string' ? predicateFn : predicateFn.toString();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await page.evaluate((s) => {
      try { return !!(new Function(`return (${s})`)())(); } catch { return false; }
    }, src);
    if (ok) return;
    await sleep(120);
  }
  throw new Error(`waitUntil timed out: ${src.slice(0, 120)}`);
}

/** Wait for app readiness without holding an evaluation open. */
export async function waitAppReady(page, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => window.__APP_READY === true).catch(() => false);
    if (ready) return;
    await sleep(250);
  }
  throw new Error('app never became ready');
}

export async function setState(page, { view, timeOfDay, fireLit, hud = false }) {
  await page.evaluate(({ view, timeOfDay, fireLit, hud }) => {
    if (timeOfDay !== undefined || fireLit !== undefined) {
      window.debugAPI.setState({ timeOfDay, fireLit });
    }
    if (view) window.debugAPI.setView(view);
    window.debugAPI.setHUD(hud);
  }, { view, timeOfDay, fireLit, hud });
}

/**
 * Official perf measurement. MUST be called on a lone browser instance.
 * Uses real frame timings collected inside the render loop.
 */
/**
 * Official performance measurement. MUST run on a lone browser instance:
 * concurrent CPU-rendered workers fight over the same four cores and produce
 * meaningless numbers.
 *
 * Frames are counted by wall clock rather than trusting in-page timers —
 * SwiftShader rasterises on its own threads, so the JS-side frame time only
 * measures command submission (~0.02 ms) and wildly overstates throughput.
 *
 * The measurement window is deliberately short: continuous software rendering
 * trips Chrome's GPU watchdog at roughly 90 s.
 */
export async function measurePerf(page, { seconds = 15, label = '' } = {}) {
  // measure the *static* costs first, while still in manual mode
  const overdraw = await page.evaluate(() => window.debugAPI.measureOverdraw(240));
  const texmem = await page.evaluate(() => window.debugAPI.getTextureMemory());
  const foliage = await page.evaluate(() => window.debugAPI.getFoliageStats());

  // now free-run for the throughput sample
  await page.evaluate(() => {
    window.debugAPI.setFixedStep(0);
    window.debugAPI.setManualMode(false);
    window.debugAPI.resetPerf();
  });
  await new Promise((r) => setTimeout(r, 1500)); // let it reach steady state
  const f0 = await page.evaluate(() => window.__FRAME);
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000)); // no CDP traffic here
  const f1 = await page.evaluate(() => window.__FRAME);
  const elapsed = (Date.now() - t0) / 1000;
  const stats = await page.evaluate(() => window.debugAPI.getStats());
  const lost = await page.evaluate(() => window.__CTX_LOST === true);
  await page.evaluate(() => {
    window.debugAPI.setManualMode(true);
    window.debugAPI.setFixedStep(1 / 60);
  });

  const fps = (f1 - f0) / elapsed;
  return {
    label,
    renderer: stats.renderer,
    contextLostDuringRun: lost,
    fps: +fps.toFixed(2),
    frameTimeMs: +(1000 / fps).toFixed(1),
    framesSampled: f1 - f0,
    sampleSeconds: +elapsed.toFixed(1),
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    memory: stats.memory,
    textureMemoryMB: texmem.mb,
    textureCount: texmem.textures,
    overdraw,
    foliage,
  };
}

/**
 * Screenshot a settled frame.
 *
 * The render loop saturates every core on this software rasterizer, which
 * starves Chrome's capture path: an unpaused screenshot takes ~40 s, a paused
 * one takes ~0.33 s (measured). So we settle, freeze rendering, capture the
 * last drawn frame (canvas contents persist), then resume.
 */
export async function settledShot(page, path, settleFrames = 10) {
  await waitFrames(page, settleFrames);
  // stats must be read while rendering is live (a paused frame reports zeros)
  const stats = await page.evaluate(() => window.debugAPI.getStats());
  // freeze only after a complete frame so the compositor has an image to grab
  await page.evaluate(() => window.debugAPI.pauseAfterFrame());
  await waitUntil(page, () => window.__PAUSE_RENDER === true, 120000);
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.screenshot({ path, timeout: 90000 });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      // let the compositor produce a fresh frame, then freeze again
      await page.evaluate(() => window.debugAPI.setPaused(false));
      await waitFrames(page, 2);
      await page.evaluate(() => window.debugAPI.pauseAfterFrame());
      await waitUntil(page, () => window.__PAUSE_RENDER === true, 120000);
    }
  }
  await page.evaluate(() => window.debugAPI.setPaused(false));
  if (lastErr) throw lastErr;
  return stats;
}

export function outDir(...parts) {
  const d = join(ROOT, 'shots', ...parts);
  mkdirSync(d, { recursive: true });
  return d;
}

export function writeJSON(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
