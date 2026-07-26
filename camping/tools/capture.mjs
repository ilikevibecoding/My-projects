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
  // Real keyboard/mouse events drive the game's own handlers; the simulation is
  // advanced explicitly so the result does not depend on how fast this machine
  // can rasterise. Same input path as a player, deterministic timing.
  const page = await newGamePage(browser, VIEWPORTS['1280x720']);
  const log = [];
  const rec = (step, ok, detail) => {
    log.push({ step, ok, detail });
    console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ' — ' + detail : ''}`);
  };
  const step = (n) => page.evaluate((k) => window.debugAPI.step(k, 1 / 60), n);
  const stepUntil = (predSrc, max = 900) => page.evaluate(([src, m]) => {
    const fn = new Function(`return (${src})`)();
    for (let i = 0; i < m; i++) {
      if (fn()) return i;
      window.debugAPI.step(1, 1 / 60);
    }
    return -1;
  }, [predSrc.toString(), max]);
  const state = () => page.evaluate(() => window.debugAPI.getState());
  const pstate = () => page.evaluate(() => window.debugAPI.getPlayerState());

  await page.evaluate(() => window.debugAPI.setHUD(true));

  // 1. walking with real key events
  const before = await pstate();
  await page.keyboard.down('KeyW');
  await step(45);
  await page.keyboard.up('KeyW');
  await step(6);
  const after = await pstate();
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  rec('walk forward (KeyW)', moved > 0.5, `moved ${moved.toFixed(2)} m`);
  rec('eye height follows terrain', Math.abs(after.eyeAboveGround - 1.7) < 0.05, `eye ${after.eyeAboveGround.toFixed(2)} m`);

  await page.keyboard.down('KeyA');
  await step(25);
  await page.keyboard.up('KeyA');
  await step(4);
  const after2 = await pstate();
  rec('strafe left (KeyA)', Math.hypot(after2.x - after.x, after2.z - after.z) > 0.3,
    `moved ${Math.hypot(after2.x - after.x, after2.z - after.z).toFixed(2)} m`);

  await page.keyboard.down('KeyS');
  await step(20);
  await page.keyboard.up('KeyS');
  await step(4);
  const after3 = await pstate();
  rec('walk back (KeyS)', Math.hypot(after3.x - after2.x, after3.z - after2.z) > 0.2, 'position changed');

  // 2. mouse look — needs pointer lock, which needs a real user gesture
  await page.mouse.click(640, 360);
  await step(4);
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  if (locked) {
    const yaw0 = (await pstate()).yaw;
    await page.mouse.move(900, 360, { steps: 10 });
    await step(4);
    const yaw1 = (await pstate()).yaw;
    rec('mouse look changes yaw', Math.abs(yaw1 - yaw0) > 0.01, `yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);
    await page.keyboard.press('Escape');
    await step(4);
  } else {
    rec('pointer lock acquired on click', false, 'not granted in automation — mouse look not exercised');
  }

  // 3. every interaction, each triggered by a real [E] press
  const seq = [
    { view: 'aim_fire', key: 'firepit', expect: 'fire lit', check: (s) => s.fireLit === true },
    // the tossed log has to arc through the air before it feeds the fire
    {
      view: 'aim_wood', key: 'woodpile', expect: 'wood reaches the fire',
      settle: '() => window.debugAPI.getState().fireBoost > 0',
      check: (s) => s.fireBoost > 0,
    },
    { view: 'aim_log', key: 'seatlog', expect: 'seated', check: (s) => s.seated === true },
  ];
  for (const s of seq) {
    await page.evaluate((v) => window.debugAPI.setView(v), s.view);
    await step(8);
    const hovered = await page.evaluate(() => window.debugAPI.getHovered());
    rec(`hover ${s.key}`, hovered === s.key, `hovered=${hovered}`);
    await captureCompositeToFile(page, join(dir, `play_hover_${s.key}.png`), { steps: 2 });
    await page.keyboard.press('KeyE');
    await stepUntil(`() => { const st = window.debugAPI.getState(); return !st.busy && !st.fading; }`, 900);
    if (s.settle) await stepUntil(s.settle, 600);
    await step(20);
    const st = await state();
    rec(`interact ${s.key} → ${s.expect}`, s.check(st), JSON.stringify({ fireLit: st.fireLit, fireBoost: +(st.fireBoost || 0).toFixed(2), seated: st.seated }));
    await captureCompositeToFile(page, join(dir, `play_after_${s.key}.png`), { steps: 2 });
  }

  // stand back up
  await page.keyboard.press('KeyE');
  const stoodAt = await stepUntil(`() => { const s = window.debugAPI.getState(); return !s.seated && !s.busy && !s.fading; }`, 900);
  rec('stand up from seat', stoodAt >= 0, `after ${stoodAt} steps`);

  // 4. sleep advances the time of day
  const todBefore = (await state()).timeOfDay;
  await page.evaluate(() => window.debugAPI.setView('aim_tent'));
  await step(8);
  rec('hover tent', (await page.evaluate(() => window.debugAPI.getHovered())) === 'tent');
  await page.keyboard.press('KeyE');
  const doneAt = await stepUntil(`() => { const s = window.debugAPI.getState(); return !s.busy && !s.fading && !s.transitioning; }`, 1800);
  const todAfter = (await state()).timeOfDay;
  rec('sleep advances time of day', todBefore !== todAfter && doneAt >= 0, `${todBefore} → ${todAfter}`);
  await captureCompositeToFile(page, join(dir, 'play_after_sleep.png'), { steps: 2 });

  // 5. the world still renders after the whole sequence
  const finalStats = await page.evaluate(() => window.debugAPI.getStats());
  rec('scene still renders at the end', finalStats.drawCalls > 0, `${finalStats.drawCalls} draw calls`);

  const errors = page.errors.slice();
  rec('no console/page errors', errors.length === 0, errors.length ? errors.map((e) => e.text.slice(0, 80)).join(' | ') : '');
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
      // one fresh page per measurement so the watchdog window never elapses
      const page = await newGamePage(browser, VIEWPORTS[vpName]);
      await setState(page, { view: viewKey, timeOfDay: 'day', fireLit: false, hud: false });
      await page.evaluate(() => window.debugAPI.step(10, 1 / 60));
      const r = await measurePerf(page, { seconds: 15, label: `${viewKey}@${vpName}` });
      perf[`${viewKey}@${vpName}`] = r;
      console.log(`  ${viewKey}@${vpName}: ${r.fps} fps (${r.frameTimeMs} ms/frame), ${r.drawCalls} calls, ` +
        `${(r.triangles / 1e6).toFixed(2)}M tris, overdraw ${r.overdraw.avgOverdrawAllPixels}x, ` +
        `texmem ${r.textureMemoryMB}MB, visFoliage ${r.foliage?.visibleInstances}${r.contextLostDuringRun ? '  [CONTEXT LOST]' : ''}`);
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
