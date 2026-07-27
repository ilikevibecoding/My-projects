/**
 * Functional test for the first-person controller (headless).
 *
 * Asserts:
 *  - W key moves the camera forward (position changes, mostly horizontal)
 *  - Shift sprint is faster than walking
 *  - Eye height tracks terrain (camera y ≈ terrain + 1.7 wherever we end up)
 *  - A registered collider can't be walked through
 *  - No console errors
 *
 * Simulation is stepped DETERMINISTICALLY via controls.update(1/60) — the
 * full scene renders at <1 fps under SwiftShader, so wall-clock waits test
 * the software rasterizer's patience, not the controller. Key events still
 * travel the real input path (Playwright → DOM listener → controls.keys).
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const URL_BASE = 'http://127.0.0.1:5174';
const CHROME_CANDIDATES = ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'];

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_CANDIDATES.find((p) => existsSync(p)),
    args: [
      '--no-sandbox',
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  // Non-shot mode so controls are active; px=0.5 to keep SwiftShader fast.
  await page.goto(`${URL_BASE}/?px=0.5`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 600000, polling: 500 });

  const getState = () =>
    page.evaluate(() => ({
      pos: window.__camera.position.toArray(),
      ground: window.__controls.getTerrainHeight(
        window.__camera.position.x,
        window.__camera.position.z
      ),
    }));
  // step the simulation n frames at a fixed 60Hz dt (deterministic)
  const step = (n) =>
    page.evaluate((frames) => {
      for (let i = 0; i < frames; i++) window.__controls.update(1 / 60);
    }, n);
  const SIM_FRAMES = 120; // = 2.0s of simulated time

  // --- walk forward (real key event → DOM listener → fixed-step sim) ---
  const s0 = await getState();
  await page.keyboard.down('KeyW');
  await step(SIM_FRAMES);
  await page.keyboard.up('KeyW');
  await step(30); // damping run-out
  const s1 = await getState();
  const walkDist = Math.hypot(s1.pos[0] - s0.pos[0], s1.pos[2] - s0.pos[2]);
  check('walk moves forward', walkDist > 1.5 && walkDist < 8, `moved ${walkDist.toFixed(2)}m in 2s`);

  // --- sprint is faster ---
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await step(SIM_FRAMES);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await step(30);
  const s2 = await getState();
  const sprintDist = Math.hypot(s2.pos[0] - s1.pos[0], s2.pos[2] - s1.pos[2]);
  check('sprint faster than walk', sprintDist > walkDist * 1.4, `sprint ${sprintDist.toFixed(2)}m vs walk ${walkDist.toFixed(2)}m`);

  // --- eye height tracks terrain ---
  const eye = s2.pos[1] - s2.ground;
  check('eye height ≈ 1.7m above terrain', Math.abs(eye - 1.7) < 0.25, `eye=${eye.toFixed(2)}m`);

  // --- collider blocks movement ---
  // Collider at (50,0), player starts 2m west of it, walking east (+x).
  // Stays well inside the 120m world-bounds clamp so only the collider can stop us.
  const blocked = await page.evaluate(() => {
    const c = window.__controls;
    c.colliders.push({ x: 50.0, z: 0.0, radius: 0.8 });
    c.setPose(48.0, 0.0, -Math.PI / 2, 0); // facing +x toward the collider
    const ev = (type, code) =>
      document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    ev('keydown', 'KeyW');
    for (let i = 0; i < 150; i++) c.update(1 / 60); // 2.5s sim — plenty to cover 2m
    ev('keyup', 'KeyW');
    return { x: c.position.x, z: c.position.z };
  });
  // Without the collider we'd travel ~4m (to x≈52). Blocked face = 50 - 0.8 - 0.35 = 48.85.
  check(
    'tree collider blocks player',
    blocked.x > 48.5 && blocked.x < 48.95,
    `stopped at x=${blocked.x.toFixed(2)} (expected ≈ 48.85)`
  );

  check('no console errors', errors.length === 0, errors.join('; '));

  await browser.close();
  console.log(failures === 0 ? '\nALL MOVEMENT TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
