// interact_test.mjs — end-to-end interaction test for the follow-up features:
//   1. right-drag orbit (builder + flight) and wheel zoom
//   2. procedural audio: unlock on gesture, engine loop RMS, mute toggle
//   3. full real-input launch flow (click LAUNCH, press Space) stays clean
// Run: node tools/interact_test.mjs [url]   (default: dev server on 127.0.0.1:5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:5173';

const OUT = '/tmp/interact_test';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

const cx = 512, cy = 288;

// ---------- 1. builder right-drag orbit ----------
const cam0 = await page.evaluate(() => debugAPI.cameraInfo());
await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'right' });
await page.mouse.move(cx + 240, cy + 60, { steps: 12 });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(700);
const cam1 = await page.evaluate(() => debugAPI.cameraInfo());
check('builder right-drag changes yaw', Math.abs(cam1.userYaw - cam0.userYaw) > 0.5,
  `yaw ${cam0.userYaw} -> ${cam1.userYaw}`);
const moved = Math.hypot(cam1.pos[0] - cam0.pos[0], cam1.pos[2] - cam0.pos[2]);
check('builder camera actually moved', moved > 3, `xz moved ${moved.toFixed(1)}m`);
await page.screenshot({ path: `${OUT}/1_builder_dragged.png` });

// wheel zoom
await page.mouse.wheel(0, -800);
await page.waitForTimeout(600);
const cam2 = await page.evaluate(() => debugAPI.cameraInfo());
check('wheel zooms in', cam2.userZoom < cam1.userZoom, `zoom ${cam1.userZoom} -> ${cam2.userZoom}`);

// context menu must be suppressed on the canvas
const ctxMenuPrevented = await page.evaluate(() => {
  const canvas = document.querySelector('#app canvas');
  const ev = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
  canvas.dispatchEvent(ev);
  return ev.defaultPrevented;
});
check('canvas contextmenu suppressed', ctxMenuPrevented);

// ---------- 2. audio unlocks on gesture ----------
// the clicks/drags above were real input -> ctx should exist & run
const a0 = await page.evaluate(() => debugAPI.audioStats());
check('audio ctx running after gesture', a0.ctxState === 'running', JSON.stringify(a0));

// ---------- 3. real launch flow: click LAUNCH, press Space ----------
await page.click('#launch-btn');
await page.waitForTimeout(1200);
await page.keyboard.press('Space');     // starts the countdown
await page.keyboard.press('Space');     // second press skips -> ignition sound
await page.waitForTimeout(1500);
const a1 = await page.evaluate(() => debugAPI.audioStats());
check('engine loop audible after ignition', a1.rms > 0.0015 && a1.engineLevel > 0.05, JSON.stringify(a1));
await page.screenshot({ path: `${OUT}/2_flight_ignited.png` });

// camera reset for flight, then right-drag orbits around the climbing rocket
const camF0 = await page.evaluate(() => debugAPI.cameraInfo());
check('manual orbit reset on launch', Math.abs(camF0.userYaw) < 1e-6, `yaw ${camF0.userYaw}`);
await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'right' });
await page.mouse.move(cx - 300, cy - 40, { steps: 14 });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(900);
const camF1 = await page.evaluate(() => debugAPI.cameraInfo());
check('flight right-drag changes yaw', Math.abs(camF1.userYaw) > 0.6, `yaw -> ${camF1.userYaw}`);
check('flight mode still chase', camF1.mode === 'chase', camF1.mode);
await page.screenshot({ path: `${OUT}/3_flight_dragged.png` });

// ---------- 4. mute toggle ----------
await page.keyboard.press('KeyM');
await page.waitForTimeout(700);
const a2 = await page.evaluate(() => debugAPI.audioStats());
check('M mutes (rms collapses)', a2.muted === true && a2.rms < 0.002, JSON.stringify(a2));
const btnState = await page.evaluate(() => document.getElementById('sound-btn').textContent);
check('sound button reflects mute', btnState === '🔇', btnState);
await page.keyboard.press('KeyM');
await page.waitForTimeout(900);
const a3 = await page.evaluate(() => debugAPI.audioStats());
check('unmute restores engine sound', a3.muted === false && a3.rms > 0.0015, JSON.stringify(a3));

// ---------- 5. flight continues clean off the pad ----------
// headless SwiftShader runs the sim well below real-time; poll for the climb
// (TWR ~1.06 stack: ~13 m after 7 sim-seconds is nominal)
let st = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  st = await page.evaluate(() => debugAPI.getState());
  if (st.alt > 8 && st.vSpeed > 0.5) break;
}
check('rocket climbing', st.alt > 8 && st.vSpeed > 0.5, `alt ${st.alt} vSpeed ${st.vSpeed} t ${st.t}`);
await page.screenshot({ path: `${OUT}/4_flight_later.png` });

check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 400));

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed -> ${OUT}`);
process.exit(fails ? 1 : 0);
