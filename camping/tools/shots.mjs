#!/usr/bin/env node
// Screenshot harness: drives the app headless via system Chrome + Playwright,
// captures the six rubric shots, motion pairs, interaction sequence and stats.
//
// Usage: node tools/shots.mjs iter_1 [--skip-interact]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const iterName = process.argv[2] || 'iter_0';
const skipInteract = process.argv.includes('--skip-interact');
const OUT = join(ROOT, 'shots', iterName);
mkdirSync(OUT, { recursive: true });

const URL = 'http://127.0.0.1:5173/';
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

// The six required shots: name -> { view, state }
const SHOTS = [
  { name: 'camp_day', view: 'camp', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'vista_day', view: 'vista', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'forest_day', view: 'forest', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'pond_day', view: 'pond', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'camp_golden', view: 'camp', state: { timeOfDay: 'golden', fireLit: false } },
  { name: 'camp_night_fire', view: 'camp', state: { timeOfDay: 'night', fireLit: true } },
];

// motion-pair shots (two frames ~1s apart prove animation)
const MOTION = [
  { name: 'motion_grass', view: 'forest', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'motion_water', view: 'pond', state: { timeOfDay: 'day', fireLit: false } },
  { name: 'motion_fire', view: 'aim_fire', state: { timeOfDay: 'night', fireLit: true } },
];

async function ensureDevServer() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return null;
  } catch { /* not running */ }
  console.log('starting vite dev server...');
  const child = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', detached: true,
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return child;
    } catch { /* retry */ }
  }
  throw new Error('vite dev server did not come up');
}

async function waitFrames(page, n, timeoutMs = 120000) {
  const start = await page.evaluate(() => window.__FRAME);
  await page.waitForFunction(
    (args) => window.__FRAME >= args.start + args.n,
    { start, n },
    { timeout: timeoutMs, polling: 250 },
  );
}

async function settle(page, ms = 2000, frames = 5) {
  await Promise.all([
    new Promise((r) => setTimeout(r, ms)),
    waitFrames(page, frames),
  ]);
}

// Headless chrome only renders frames when the compositor is asked for them
// (screenshots do that); an idle waitForFunction lets rAF crawl at <1fps and
// sim-time-based state (fire boost decay, fades) stalls. This pumps frames
// with throwaway screenshots until the in-page predicate passes.
async function pumpUntil(page, predicate, maxPumps = 80) {
  for (let i = 0; i < maxPumps; i++) {
    if (await page.evaluate(predicate)) return i;
    await page.screenshot({ path: '/tmp/_pump.png' });
  }
  throw new Error(`pumpUntil: predicate still false after ${maxPumps} pumps`);
}

async function main() {
  await ensureDevServer();

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--headless=new',
      '--use-angle=swiftshader',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  console.log('loading app...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__APP_READY === true, null, { timeout: 180000, polling: 500 });
  console.log('app ready. warming up...');
  await waitFrames(page, 10);

  const stats = {};

  // ---- six rubric shots (HUD hidden for clean beauty shots) ----
  await page.evaluate(() => window.debugAPI.setHUD(false));
  for (const s of SHOTS) {
    process.stdout.write(`shot ${s.name}... `);
    await page.evaluate((args) => {
      window.debugAPI.setState(args.state);
      window.debugAPI.setView(args.view);
    }, s);
    await settle(page);
    await page.screenshot({ path: join(OUT, `${s.name}.png`) });
    stats[s.name] = await page.evaluate(() => window.debugAPI.getStats());
    console.log(`done (${stats[s.name].drawCalls} calls, ${stats[s.name].triangles} tris, ${stats[s.name].fps} fps-sw)`);
  }

  // ---- motion pairs ----
  for (const s of MOTION) {
    process.stdout.write(`motion ${s.name}... `);
    await page.evaluate((args) => {
      window.debugAPI.setState(args.state);
      window.debugAPI.setView(args.view);
    }, s);
    await settle(page);
    await page.screenshot({ path: join(OUT, `${s.name}_t0.png`) });
    await settle(page, 1000, 3);
    await page.screenshot({ path: join(OUT, `${s.name}_t1.png`) });
    console.log('done');
  }

  // ---- interaction sequence ----
  if (!skipInteract) {
    await page.evaluate(() => window.debugAPI.setHUD(true));

    console.log('interactions: light fire');
    await page.evaluate(() => {
      window.debugAPI.setState({ timeOfDay: 'golden', fireLit: false });
      window.debugAPI.setView('aim_fire');
    });
    await settle(page, 1200, 4);
    await page.screenshot({ path: join(OUT, 'interact_fire_prompt.png') });
    await page.evaluate(() => window.debugAPI.interact());
    await settle(page, 1500, 4);
    await page.screenshot({ path: join(OUT, 'interact_fire_lit.png') });

    console.log('interactions: add wood');
    await page.evaluate(() => window.debugAPI.setView('aim_wood'));
    await settle(page, 800, 3);
    await page.screenshot({ path: join(OUT, 'interact_wood_prompt.png') });
    await page.evaluate(() => window.debugAPI.interact());
    await settle(page, 900, 3);
    await page.screenshot({ path: join(OUT, 'interact_wood_toss.png') });

    console.log('interactions: sit');
    await page.evaluate(() => window.debugAPI.setView('aim_log'));
    await settle(page, 800, 3);
    await page.screenshot({ path: join(OUT, 'interact_log_prompt.png') });
    await page.evaluate(() => window.debugAPI.interact());
    // wait for the add-wood surge to die down so the seated shot shows a calm fire
    await pumpUntil(page, () => {
      const s = window.debugAPI.getState();
      return s.fireBoost < 0.12 && !s.busy && !s.fading;
    });
    await settle(page, 1500, 4);
    await page.screenshot({ path: join(OUT, 'interact_seated.png') });
    await page.evaluate(() => window.debugAPI.interact()); // stand
    await pumpUntil(page, () => {
      const s = window.debugAPI.getState();
      return !s.busy && !s.seated && !s.fading;
    });

    console.log('interactions: sleep');
    const before = await page.evaluate(() => window.debugAPI.getState().timeOfDay);
    await page.evaluate(() => window.debugAPI.setView('aim_tent'));
    await settle(page, 800, 3);
    await page.screenshot({ path: join(OUT, 'interact_tent_prompt.png') });
    await page.evaluate(() => window.debugAPI.interact());
    await pumpUntil(page, () => { // sleep fade + ToD transition fully done
      const s = window.debugAPI.getState();
      return !s.busy && !s.fading && !s.transitioning;
    });
    await settle(page, 1500, 6);
    await page.screenshot({ path: join(OUT, 'interact_after_sleep.png') });
    const after = await page.evaluate(() => window.debugAPI.getState().timeOfDay);
    stats.sleepChangedTime = { before, after, ok: before !== after };
    console.log(`sleep: ${before} -> ${after}`);

    // ---- player physics sanity: walk forward 3s, check grounding/bounds ----
    console.log('physics: walking...');
    await page.evaluate(() => {
      window.debugAPI.setState({ timeOfDay: 'day' });
      window.debugAPI.setView('aim_fire');
      window.debugAPI.setMoveInput({ f: true });
    });
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await settle(page, 500, 2);
      samples.push(await page.evaluate(() => window.debugAPI.getPlayerState()));
    }
    await page.evaluate(() => window.debugAPI.setMoveInput({}));
    stats.walk = {
      samples: samples.map((s) => ({
        eyeAboveGround: Math.round(s.eyeAboveGround * 100) / 100,
        radius: Math.round(s.radius * 10) / 10,
      })),
      grounded: samples.every((s) => s.eyeAboveGround > 1.55 && s.eyeAboveGround < 1.85),
      inBounds: samples.every((s) => s.radius < 115),
    };
  }

  stats.pageErrors = errors;
  writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  console.log(`wrote ${OUT}/stats.json`);
  if (errors.length) {
    console.log('PAGE ERRORS:');
    for (const e of errors.slice(0, 10)) console.log('  ' + e);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
