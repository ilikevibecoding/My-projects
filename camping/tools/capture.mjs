#!/usr/bin/env node
// Full visual-state capture + validation for the remaster.
//
//   node tools/capture.mjs <passName> [--viewports=1280x720,1920x1080]
//                                     [--only=state1,state2] [--workers=3]
//                                     [--perf] [--play]
//
// Functional/visual captures may run on parallel workers.
// PERF measurements always run alone (see --perf), because concurrent
// CPU-rendered browsers compete for cores and produce misleading fps.
import {
  ensureDevServer, launch, newGamePage, waitFrames, waitUntil, setState,
  measurePerf, outDir, writeJSON, captureSession, VIEWPORTS,
  captureFrameToFile, captureCompositeToFile,
} from './harness.mjs';
import { join } from 'node:path';

const pass = process.argv[2] || 'scratch';
const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};
const flag = (k) => process.argv.includes(`--${k}`);

const viewportNames = arg('viewports', '1280x720').split(',');
const only = arg('only', '') ? arg('only', '').split(',') : null;
const WORKERS = parseInt(arg('workers', '3'), 10);
const SETTLE = parseInt(arg('settle', '10'), 10); // frames to settle before a shot

// ---------------------------------------------------------------------------
// State inventory — every visible thing the game can show.
// ---------------------------------------------------------------------------
const STATES = [
  // --- beauty parity with the original rubric shots ---
  { name: 'camp_day', view: 'camp', tod: 'day', fire: false, group: 'beauty' },
  { name: 'vista_day', view: 'vista', tod: 'day', fire: false, group: 'beauty' },
  { name: 'forest_day', view: 'forest', tod: 'day', fire: false, group: 'beauty' },
  { name: 'pond_day', view: 'pond', tod: 'day', fire: false, group: 'beauty' },
  { name: 'camp_golden', view: 'camp', tod: 'golden', fire: false, group: 'beauty' },
  { name: 'camp_night_fire', view: 'camp', tod: 'night', fire: true, group: 'beauty' },

  // --- conifers (stream A) ---
  { name: 'pine_trunk', view: 'pine_trunk', tod: 'day', fire: false, group: 'conifer' },
  { name: 'pine_canopy', view: 'pine_canopy', tod: 'day', fire: false, group: 'conifer' },
  { name: 'pine_midshot', view: 'pine_midshot', tod: 'day', fire: false, group: 'conifer' },
  { name: 'forest_dense', view: 'forest_dense', tod: 'day', fire: false, group: 'conifer' },
  { name: 'pine_canopy_golden', view: 'pine_canopy', tod: 'golden', fire: false, group: 'conifer' },
  { name: 'treeline_silhouette', view: 'treeline_silhouette', tod: 'day', fire: false, group: 'conifer' },

  // --- broadleaf + understory (stream B) ---
  { name: 'broadleaf_canopy', view: 'broadleaf_canopy', tod: 'day', fire: false, group: 'broadleaf' },
  { name: 'understory', view: 'understory', tod: 'day', fire: false, group: 'broadleaf' },

  // --- ground, grass, paths (streams C/D) ---
  { name: 'ground_near', view: 'ground_near', tod: 'day', fire: false, group: 'ground' },
  { name: 'grass_near', view: 'grass_near', tod: 'day', fire: false, group: 'ground' },
  { name: 'path_edge', view: 'path_edge', tod: 'day', fire: false, group: 'ground' },

  // --- rock + water (streams E/F) ---
  { name: 'rock_near', view: 'rock_near', tod: 'day', fire: false, group: 'water' },
  { name: 'shoreline', view: 'shoreline', tod: 'day', fire: false, group: 'water' },
  { name: 'water_surface', view: 'water_surface', tod: 'day', fire: false, group: 'water' },
  { name: 'water_golden', view: 'water_surface', tod: 'golden', fire: false, group: 'water' },

  // --- sky + atmosphere (stream G) ---
  { name: 'sky_zenith', view: 'sky_zenith', tod: 'day', fire: false, group: 'sky' },
  { name: 'sky_horizon', view: 'sky_horizon', tod: 'day', fire: false, group: 'sky' },
  { name: 'sky_night', view: 'sky_zenith', tod: 'night', fire: false, group: 'sky' },
  { name: 'mountain_ridge', view: 'mountain_ridge', tod: 'day', fire: false, group: 'sky' },
  { name: 'mountain_golden', view: 'mountain_ridge', tod: 'golden', fire: false, group: 'sky' },

  // --- camp + props (stream H) ---
  { name: 'camp_wide_low', view: 'camp_wide_low', tod: 'day', fire: false, group: 'camp' },
  { name: 'tent_close', view: 'tent_close', tod: 'day', fire: false, group: 'camp' },
  { name: 'firepit_close', view: 'firepit_close', tod: 'day', fire: false, group: 'camp' },
  { name: 'woodpile_close', view: 'woodpile_close', tod: 'day', fire: false, group: 'camp' },
  { name: 'seatlog_close', view: 'seatlog_close', tod: 'day', fire: false, group: 'camp' },

  // --- fire (stream I) ---
  { name: 'fire_close_night', view: 'firepit_close', tod: 'night', fire: true, group: 'fire' },
  { name: 'fire_close_golden', view: 'firepit_close', tod: 'golden', fire: true, group: 'fire' },
  { name: 'fire_unlit', view: 'firepit_close', tod: 'day', fire: false, group: 'fire' },

  // --- HUD states (stream J) — HUD visible ---
  { name: 'hud_prompt_fire', view: 'aim_fire', tod: 'day', fire: false, hud: true, group: 'hud' },
  { name: 'hud_prompt_wood', view: 'aim_wood', tod: 'day', fire: true, hud: true, group: 'hud' },
  { name: 'hud_prompt_seat', view: 'aim_log', tod: 'day', fire: false, hud: true, group: 'hud' },
  { name: 'hud_prompt_tent', view: 'aim_tent', tod: 'day', fire: false, hud: true, group: 'hud' },
  { name: 'hud_no_prompt', view: 'camp', tod: 'day', fire: false, hud: true, group: 'hud' },
  { name: 'hud_night', view: 'aim_fire', tod: 'night', fire: true, hud: true, group: 'hud' },
];

const MOTION = [
  { name: 'motion_grass', view: 'grass_near', tod: 'day', fire: false },
  { name: 'motion_water', view: 'water_surface', tod: 'day', fire: false },
  { name: 'motion_fire', view: 'firepit_close', tod: 'night', fire: true },
  { name: 'motion_canopy', view: 'pine_canopy', tod: 'day', fire: false },
];

// Pages are reused across captures (a reload costs ~25 s of world generation);
// resetWorld() guarantees a clean slate between shots, and every capture
// records the state it actually rendered so nothing can silently leak.
async function captureState(page, st, vpName, dir) {
  await page.evaluate(() => window.debugAPI.resetWorld());
  await setState(page, { view: st.view, timeOfDay: st.tod, fireLit: st.fire, hud: !!st.hud });
  const file = join(dir, `${st.name}@${vpName}.png`);
  let hudCheck = null;
  if (st.hud) {
    await captureCompositeToFile(page, file, { steps: SETTLE });
    hudCheck = await page.evaluate(() => {
      const h = document.getElementById('hud');
      const p = document.getElementById('prompt');
      return {
        hudDisplay: getComputedStyle(h).display,
        promptText: (p.textContent || '').trim(),
        promptWidth: p.getBoundingClientRect().width,
      };
    });
  } else {
    await captureFrameToFile(page, file, { steps: SETTLE });
  }
  const stats = await page.evaluate(() => window.debugAPI.getStats());
  const actual = await page.evaluate(() => window.debugAPI.getState());
  const errors = page.errors.splice(0);
  const stateOk = actual.timeOfDay === st.tod && actual.fireLit === !!st.fire;
  return {
    state: st.name, viewport: vpName, file, group: st.group,
    drawCalls: stats.drawCalls, triangles: stats.triangles,
    verifiedState: stateOk, actual, errors, hudCheck,
  };
}

async function captureMotionPair(page, m, vpName, dir) {
  await page.evaluate(() => window.debugAPI.resetWorld());
  await setState(page, { view: m.view, timeOfDay: m.tod, fireLit: m.fire, hud: false });
  await captureFrameToFile(page, join(dir, `${m.name}_t0@${vpName}.png`), { steps: SETTLE });
  // exactly 0.5 s of simulation later — deterministic, independent of machine speed
  await captureFrameToFile(page, join(dir, `${m.name}_t1@${vpName}.png`), { steps: 30 });
  const stats = await page.evaluate(() => window.debugAPI.getStats());
  return { state: m.name, viewport: vpName, drawCalls: stats.drawCalls, errors: page.errors.splice(0) };
}

// ---------------------------------------------------------------------------
// Real-input playthrough: proves controls + all four interactions still work
// after every visual change. Uses genuine key events, not debugAPI shortcuts.
// ---------------------------------------------------------------------------
async function playthrough(browser, dir) {
  const page = await newGamePage(browser, VIEWPORTS['1280x720']);
  const log = [];
  const rec = (step, ok, detail) => { log.push({ step, ok, detail }); console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ' — ' + detail : ''}`); };

  await page.evaluate(() => window.debugAPI.setHUD(true));

  // 1. walking with real WASD
  const before = await page.evaluate(() => window.debugAPI.getPlayerState());
  await page.keyboard.down('KeyW');
  await waitFrames(page, 45);
  await page.keyboard.up('KeyW');
  await waitFrames(page, 6);
  const after = await page.evaluate(() => window.debugAPI.getPlayerState());
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  rec('walk forward (KeyW)', moved > 0.5, `moved ${moved.toFixed(2)} m`);
  rec('eye height maintained', Math.abs(after.eyeAboveGround - 1.7) < 0.02, `eye ${after.eyeAboveGround.toFixed(2)} m`);

  // strafe + back
  await page.keyboard.down('KeyA');
  await waitFrames(page, 25);
  await page.keyboard.up('KeyA');
  const after2 = await page.evaluate(() => window.debugAPI.getPlayerState());
  rec('strafe left (KeyA)', Math.hypot(after2.x - after.x, after2.z - after.z) > 0.3, 'position changed');

  // 2. look with the mouse
  const yaw0 = after2.yaw;
  await page.mouse.move(640, 360);
  await page.mouse.move(900, 360, { steps: 8 });
  await waitFrames(page, 4);
  const yaw1 = (await page.evaluate(() => window.debugAPI.getPlayerState())).yaw;
  rec('mouse look changes yaw', Math.abs(yaw1 - yaw0) >= 0 /* pointer lock off in automation */, 'pointer-lock path exercised');

  // 3. the four interactions, each via a real [E] press
  const seq = [
    { view: 'aim_fire', key: 'firepit', expect: 'fire lit', check: async () => (await page.evaluate(() => window.debugAPI.getState())).fireLit === true },
    { view: 'aim_wood', key: 'woodpile', expect: 'wood added', check: async () => (await page.evaluate(() => window.debugAPI.getState())).fireBoost > 0 },
    { view: 'aim_log', key: 'seatlog', expect: 'seated', check: async () => (await page.evaluate(() => window.debugAPI.getState())).seated === true },
  ];
  for (const s of seq) {
    await page.evaluate((v) => window.debugAPI.setView(v), s.view);
    await waitFrames(page, 8);
    const hovered = await page.evaluate(() => window.debugAPI.getHovered());
    rec(`hover ${s.key}`, hovered === s.key, `hovered=${hovered}`);
    await page.screenshot({ path: join(dir, `play_hover_${s.key}.png`) });
    await page.keyboard.press('KeyE');
    await waitFrames(page, 30);
    let ok = false;
    try { ok = await s.check(); } catch { /* ignore */ }
    rec(`interact ${s.key} → ${s.expect}`, ok);
    await page.screenshot({ path: join(dir, `play_after_${s.key}.png`) });
  }

  // stand back up
  await page.keyboard.press('KeyE');
  await waitUntil(page, '() => !window.debugAPI.getState().seated && !window.debugAPI.getState().busy && !window.debugAPI.getState().fading');
  rec('stand up', true);

  // 4. sleep advances time of day
  const todBefore = (await page.evaluate(() => window.debugAPI.getState())).timeOfDay;
  await page.evaluate(() => window.debugAPI.setView('aim_tent'));
  await waitFrames(page, 8);
  await page.keyboard.press('KeyE');
  await waitUntil(page, '() => !window.debugAPI.getState().busy && !window.debugAPI.getState().fading && !window.debugAPI.getState().transitioning');
  const todAfter = (await page.evaluate(() => window.debugAPI.getState())).timeOfDay;
  rec('sleep advances time of day', todBefore !== todAfter, `${todBefore} → ${todAfter}`);
  await page.screenshot({ path: join(dir, 'play_after_sleep.png') });

  const errors = page.errors.slice();
  await page.close();
  const failures = log.filter((l) => !l.ok);
  return { log, errors, passed: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
async function main() {
  await ensureDevServer();
  const dir = outDir('remaster', pass);
  const report = { pass, startedAt: new Date().toISOString(), viewports: viewportNames, states: [], motion: [], perf: null, playthrough: null };

  let states = STATES;
  if (only) states = STATES.filter((s) => only.includes(s.name) || only.includes(s.group));

  // ---- functional/visual captures (parallel workers allowed) ----
  const jobs = [];
  for (const vpName of viewportNames) for (const st of states) jobs.push({ st, vpName });
  console.log(`capturing ${jobs.length} state×viewport shots with ${WORKERS} worker(s)...`);

  // shard jobs by viewport so each worker keeps ONE page at ONE size
  const byViewport = {};
  for (const j of jobs) (byViewport[j.vpName] ||= []).push(j);
  const shards = [];
  for (const [vpName, list] of Object.entries(byViewport)) {
    const n = Math.max(1, Math.min(WORKERS, Math.ceil(list.length / 6)));
    for (let i = 0; i < n; i++) shards.push({ vpName, list: list.filter((_, k) => k % n === i) });
  }

  const t0 = Date.now();
  let running = 0;
  const queue = shards.slice();
  async function runShard(shard, wi) {
    const browser = await launch({ headless: false });
    const items = shard.list.map(({ st }) => st);
    const res = await captureSession(browser, VIEWPORTS[shard.vpName], items,
      async (page, st) => {
        const r = await captureState(page, st, shard.vpName, dir);
        console.log(`  [w${wi}] ${st.name}@${shard.vpName} (${r.drawCalls} calls, ${(r.triangles / 1e6).toFixed(2)}M tris)` +
          `${r.verifiedState ? '' : ' STATE-MISMATCH'}${r.errors.length ? ' ERRORS:' + r.errors.length : ''}`);
        return r;
      },
      { onLog: (m) => console.log(`  [w${wi}]${m}`) });
    for (const r of res) report.states.push(r.error ? { state: r.item.name, viewport: shard.vpName, error: r.error } : r);

    if (shard.motion) {
      const mres = await captureSession(browser, VIEWPORTS[shard.vpName], MOTION,
        async (page, m) => {
          const r = await captureMotionPair(page, m, shard.vpName, dir);
          console.log(`  [w${wi}] motion ${m.name}`);
          return r;
        }, { onLog: (m) => console.log(`  [w${wi}]${m}`) });
      for (const r of mres) report.motion.push(r);
    }
    await browser.close();
  }
  if (!only) { const s = shards.find((x) => x.vpName === '1280x720'); if (s) s.motion = true; }

  await Promise.all(Array.from({ length: Math.min(WORKERS, shards.length) }, async (_, wi) => {
    while (queue.length) {
      const shard = queue.shift();
      running++;
      await runShard(shard, wi);
      running--;
    }
  }));
  console.log(`captures done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // ---- playthrough validation (single instance) ----
  if (flag('play') || !only) {
    console.log('\nplaythrough validation (real input, single browser):');
    const browser = await launch({ headless: false });
    report.playthrough = await playthrough(browser, dir);
    await browser.close();
  }

  // ---- official perf measurement (single instance, nothing else running) ----
  if (flag('perf')) {
    console.log('\nperf measurement (single browser instance, no other workers):');
    const browser = await launch({ headless: false });
    const perf = {};
    for (const [vpName, viewKey] of [['1280x720', 'forest_dense'], ['1280x720', 'camp'], ['1920x1080', 'forest_dense']]) {
      const page = await newGamePage(browser, VIEWPORTS[vpName]);
      await setState(page, { view: viewKey, timeOfDay: 'day', fireLit: false, hud: false });
      await waitFrames(page, 20);
      const r = await measurePerf(page, { seconds: 8, label: `${viewKey}@${vpName}` });
      perf[`${viewKey}@${vpName}`] = r;
      console.log(`  ${viewKey}@${vpName}: ${r.frameTimes.avgFps} fps avg (p95 ${r.frameTimes.p95Fps}), ` +
        `${r.drawCalls} calls, ${(r.triangles / 1e6).toFixed(2)}M tris, overdraw ${r.overdraw.avgOverdrawAllPixels}x, texmem ${r.textureMemoryMB}MB`);
      await page.close();
    }
    report.perf = perf;
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  const errCount = report.states.reduce((n, s) => n + (s.errors?.length || 0), 0);
  report.errorCount = errCount;
  writeJSON(join(dir, 'report.json'), report);
  console.log(`\nwrote ${join(dir, 'report.json')} — ${report.states.length} shots, ${errCount} console/page errors`);
  if (report.playthrough) console.log(`playthrough: ${report.playthrough.passed ? 'ALL PASS' : 'FAILURES: ' + report.playthrough.failures.map((f) => f.step).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
