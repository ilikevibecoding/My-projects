// tools/shots.mjs — deterministic screenshot + telemetry capture.
// Usage: node tools/shots.mjs --iter N [--url http://localhost:5173]
//
// Captures the six canonical views (plus liftoff_b one sim-second later for
// animation proof, plus staging evidence), then runs three scripted telemetry
// flights and a builder stats-change assertion. Everything lands in
// shots/iter_N/.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iterIdx = args.indexOf('--iter');
const ITER = iterIdx >= 0 ? args[iterIdx + 1] : 'dev';
const urlIdx = args.indexOf('--url');
const URL = urlIdx >= 0 ? args[urlIdx + 1] : 'http://127.0.0.1:5173';

const OUT = join(__dirname, '..', 'shots', `iter_${ITER}`);
mkdirSync(OUT, { recursive: true });

const VIEWS = ['builder', 'pad', 'liftoff', 'midair', 'high_altitude', 'space', 'staging'];

function log(...a) { console.log('[shots]', ...a); }

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleLines = [];
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`));

log('loading', URL);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.debugAPI, null, { timeout: 30000 });
// let textures/shaders compile + first frames settle
await page.waitForTimeout(2500);

// ---------------------------------------------------------------------------
// 1) The six canonical shots (+ extras)
// ---------------------------------------------------------------------------
for (const view of VIEWS) {
  log('view:', view);
  const res = await page.evaluate((v) => window.debugAPI.setView(v), view);
  if (typeof res === 'string' && res.startsWith('unknown')) log('  !!', res);
  // states are pre-warmed inside setView; let the frame present
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `${view}.png`) });

  if (view === 'liftoff') {
    // animation proof: advance exactly 1 sim-second, reframe, shoot again
    await page.evaluate(() => { window.debugAPI.tick(1); window.debugAPI.reframe('liftoff'); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, 'liftoff_b.png') });
  }
}

// frame stats snapshot (budget tracking) — taken on the liftoff-ish state
const frameStats = await page.evaluate(() => window.debugAPI.frameStats());
log('frameStats:', JSON.stringify(frameStats));

// ---------------------------------------------------------------------------
// 2) Telemetry runs (pure physics, fast)
// ---------------------------------------------------------------------------
const telemetry = {};
for (const scenario of ['main', 'lowtwr', 'coast', 'staged']) {
  log('telemetry:', scenario);
  telemetry[scenario] = await page.evaluate((s) => window.debugAPI.runTelemetry(s), scenario);
  const { samples, events } = telemetry[scenario];
  writeFileSync(join(OUT, `telemetry_${scenario}.json`), JSON.stringify(telemetry[scenario], null, 1));
  // human-readable log
  const lines = samples.map((s) =>
    `t=${String(s.t).padStart(6)}s alt=${String(s.alt).padStart(8)}m v=${String(s.speed).padStart(7)} ` +
    `vUp=${String(s.vSpeed).padStart(7)} m=${String(s.mass).padStart(8)}kg fuel=${String(s.fuel).padStart(7)}kg ` +
    `twr=${String(s.twr).padStart(6)} drag=${String(s.dragAcc).padStart(6)} rho=${String(s.rho).padStart(7)} ${s.phase}`);
  lines.push('', 'EVENTS: ' + events.map((e) => `${e.t}s:${e.type}`).join('  '));
  writeFileSync(join(OUT, `telemetry_${scenario}.log`), lines.join('\n'));
}

// quick verdicts to eyeball later
function verdicts() {
  const out = [];
  const main = telemetry.main.samples;
  const spaceEv = telemetry.main.events.find((e) => e.type === 'space');
  out.push(`main: space reached at t=${spaceEv ? spaceEv.t : 'NEVER'} (target 60-90s)`);
  const accelEarly = main[10] && main[5] ? (main[10].speed - main[5].speed) / 5 : NaN;
  const lastBurn = main.filter((s) => s.fuel > 0);
  const aL = lastBurn.at(-1), aL2 = lastBurn.at(-6);
  const accelLate = aL && aL2 ? (aL.speed - aL2.speed) / (aL.t - aL2.t) : NaN;
  out.push(`main: accel early=${accelEarly?.toFixed(2)} late=${accelLate?.toFixed(2)} (late should exceed early)`);
  // drag check: peak drag always lives low, despite speed being far higher up high
  const lowDragPeak = Math.max(...main.filter((s) => s.alt < 2500).map((s) => s.dragAcc));
  const highSample = main.find((s) => s.alt > 4500);
  out.push(`main: peak dragAcc below 2500m=${lowDragPeak.toFixed(3)} vs dragAcc @>4500m=${highSample?.dragAcc} ` +
    `(low must exceed high even though speed is higher up there)`);
  const lt = telemetry.lowtwr.samples;
  out.push(`lowtwr: maxAlt=${Math.max(...lt.map((s) => s.alt))} (must stay ~0), fuel burned ${lt[0].fuel - lt.at(-1).fuel}kg`);
  const co = telemetry.coast.samples;
  const apo = Math.max(...co.map((s) => s.alt));
  out.push(`coast: apogee=${apo}m (< 5000), end phase=${co.at(-1).phase} (expect crashed)`);
  const stg = telemetry.staged.events.filter((e) => e.type === 'stage');
  out.push(`staged: stage events=${JSON.stringify(stg)}`);
  return out.join('\n');
}
const verdictText = verdicts();
log('\n' + verdictText);

// ---------------------------------------------------------------------------
// 3) Builder stats-change assertion (clicks the real UI)
// ---------------------------------------------------------------------------
await page.evaluate(() => window.debugAPI.setView('builder'));
await page.waitForTimeout(400);
const statsBefore = await page.evaluate(() => ({
  mass: document.getElementById('st-mass').textContent,
  thrust: document.getElementById('st-thrust').textContent,
  fuel: document.getElementById('st-fuel').textContent,
  twr: document.getElementById('st-twr').textContent,
}));
await page.click('[data-part="tankLarge"]');
await page.waitForTimeout(300);
const statsAfter = await page.evaluate(() => ({
  mass: document.getElementById('st-mass').textContent,
  thrust: document.getElementById('st-thrust').textContent,
  fuel: document.getElementById('st-fuel').textContent,
  twr: document.getElementById('st-twr').textContent,
}));
await page.screenshot({ path: join(OUT, 'builder_added_tank.png') });
const statsChanged = JSON.stringify(statsBefore) !== JSON.stringify(statsAfter);
log('builder stats before:', JSON.stringify(statsBefore));
log('builder stats after :', JSON.stringify(statsAfter), statsChanged ? '(CHANGED ok)' : '(!! DID NOT CHANGE)');

writeFileSync(join(OUT, 'report.txt'), [
  `iteration: ${ITER}`,
  `date: ${new Date().toISOString()}`,
  '',
  'FRAME STATS (SwiftShader headless — budgets, not real fps):',
  JSON.stringify(frameStats, null, 1),
  '',
  'TELEMETRY VERDICTS:',
  verdictText,
  '',
  `BUILDER STATS: before=${JSON.stringify(statsBefore)} after=${JSON.stringify(statsAfter)} changed=${statsChanged}`,
  '',
  'CONSOLE:',
  ...consoleLines.slice(-60),
].join('\n'));

await browser.close();
log('done ->', OUT);
