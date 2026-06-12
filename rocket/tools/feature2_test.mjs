// feature2_test.mjs — follow-up round 2:
//   A. engine clusters + decoupler ("connector") workflow builds a faster rocket
//   B. right-drag can orbit BELOW the rocket in space (pitch range + centering)
// Run: node tools/feature2_test.mjs [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = '/tmp/feature2_test';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
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

const twr = async () => parseFloat(await page.evaluate(() => document.getElementById('st-twr').textContent));
const thrust = async () => await page.evaluate(() => document.getElementById('st-thrust').textContent);

// ---------- A1. baseline flight: default stack, alt after 25 sim-seconds ----------
await page.click('#launch-btn');
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.evaluate(() => debugAPI.tick(25));
const baseSt = await page.evaluate(() => debugAPI.getState());
check('baseline rocket flies', baseSt.alt > 50, `alt@25s = ${baseSt.alt}m`);

// ---------- A2. build the beefy rocket through the real palette UI ----------
await page.evaluate(() => { debugAPI.setState({ phase: 'builder' }); debugAPI.pause(false); });
await page.waitForTimeout(1500); // let the builder orbit cam re-converge
const twr0 = await twr();
await page.click('.part-card[data-part="engineLarge"]');   // second booster engine -> cluster of 2
await page.waitForTimeout(400);
const twr1 = await twr();
check('second engine raises TWR (cluster works)', twr1 > twr0 + 0.5, `TWR ${twr0} -> ${twr1}, thrust ${await thrust()}`);
await page.screenshot({ path: `${OUT}/1_cluster_builder.png` });

// the user's build: connector under everything, then "two rockets on the
// bottom and two fuel things" — a booster stage below the original rocket
await page.click('.part-card[data-part="decoupler"]');     // connector slides under
await page.click('.part-card[data-part="engineLarge"]');   // booster engine 1 (bottom!)
await page.click('.part-card[data-part="engineLarge"]');   // booster engine 2
await page.click('.part-card[data-part="tankSmall"]');     // booster fuel 1
await page.click('.part-card[data-part="tankSmall"]');     // booster fuel 2
await page.waitForTimeout(500);
const boosterTwr = await twr();
const boosterThrust = await thrust();
check('booster stage drives launch TWR', boosterThrust.includes('132') && boosterTwr > 1.0,
  `bottom-stage thrust ${boosterThrust}, TWR ${boosterTwr}`);
await page.screenshot({ path: `${OUT}/2_two_stage_builder.png` });

// ---------- A3. booster flies, stages, upper cluster takes over ----------
await page.click('#launch-btn');
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.evaluate(() => debugAPI.tick(25));
const beefSt = await page.evaluate(() => debugAPI.getState());
check('booster rocket climbing', beefSt.alt > 100, `alt@25s ${beefSt.alt}m speed ${beefSt.speed}`);
await page.evaluate(() => debugAPI.pause(false));
await page.waitForTimeout(2500); // chase cam catches up after the warp
await page.screenshot({ path: `${OUT}/3_cluster_plumes.png` });

const plumes = await page.evaluate(() => debugAPI.frameStats());
check('frame healthy with booster stack', plumes.drawCalls < 420, `drawCalls ${plumes.drawCalls}`);

// ---------- A4. pop the connector: booster drops, twin-cluster takes over ----------
await page.keyboard.press('Space');                        // stage!
await page.waitForTimeout(800);
const ev = await page.evaluate(() => debugAPI.getState());
check('staged + still climbing', ev.alt > beefSt.alt && ev.phase !== 'crashed',
  `alt ${ev.alt}m phase ${ev.phase} twr ${ev.twr}`);
check('upper cluster TWR jumps after drop', ev.twr > 1.5, `post-stage TWR ${ev.twr}`);

// ---------- A5. render interpolation invariant (the anti-shake fix) ----------
let interpOk = true, interpDetail = '';
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(350);
  const rs = await page.evaluate(() => debugAPI.renderState());
  if (rs.lerpError > 0.001 || rs.alpha < 0 || rs.alpha >= 1) {
    interpOk = false; interpDetail = JSON.stringify(rs); break;
  }
  interpDetail = `alpha ${rs.alpha} lerpErr ${rs.lerpError} stepGap ${rs.stepGap}m fov ${rs.fov}`;
}
check('render interpolation exact between steps', interpOk, interpDetail);

// auto-chase must also keep the rocket centered now (no velocity look-ahead)
const rsAuto = await page.evaluate(() => debugAPI.renderState());
check('rocket centered in auto chase', Math.abs(rsAuto.screenX) < 0.3 && Math.abs(rsAuto.screenY) < 0.3,
  `screen offset (${rsAuto.screenX}, ${rsAuto.screenY})`);

// ---------- B. orbit BELOW the rocket once in space ----------
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => debugAPI.getState());
  if (st.alt > 5050) break;
  // keep sim moving fast under SwiftShader
  await page.evaluate(() => debugAPI.tick(4));
  await page.evaluate(() => debugAPI.pause(false));
}
const stSpace = await page.evaluate(() => debugAPI.getState());
check('reached space for camera test', stSpace.alt > 5000, `alt ${stSpace.alt}m`);
await page.evaluate(() => debugAPI.pause(false)); // climb loop can exit paused
await page.waitForTimeout(2500);                  // let the chase cam re-converge

// drag DOWNWARD-pitch (mouse up) far past the old -0.55 limit
await page.mouse.move(512, 288);
await page.mouse.down({ button: 'right' });
await page.mouse.move(512, 288 - 360, { steps: 14 });      // pitch -= 1.8 -> clamp -1.45
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(1200);
// the rocket must sit dead-center on screen while manually orbiting below
const rsBelow = await page.evaluate(() => debugAPI.renderState());
check('rocket stays centered during manual orbit',
  Math.abs(rsBelow.screenX) < 0.3 && Math.abs(rsBelow.screenY) < 0.3,
  `screen offset (${rsBelow.screenX}, ${rsBelow.screenY})`);
const cam = await page.evaluate(() => debugAPI.cameraInfo());
check('pitch reaches below-rocket range', cam.userPitch < -1.3, `userPitch ${cam.userPitch}`);
const camBelow = await page.evaluate(() => {
  const i = debugAPI.cameraInfo();
  const c = i.pos;
  const camAlt = Math.hypot(c[0], c[1] + 4000, c[2]) - 4000; // planet center (0,-4000,0)
  return { camAlt: +camAlt.toFixed(1), rocketAlt: debugAPI.getState().alt, mode: i.mode };
});
check('camera is physically below the rocket (and tracking it)',
  camBelow.mode === 'chase'
  && camBelow.camAlt < camBelow.rocketAlt - 8
  && camBelow.camAlt > camBelow.rocketAlt - 80,
  `cam ${camBelow.camAlt}m vs rocket ${camBelow.rocketAlt}m mode ${camBelow.mode}`);
await page.screenshot({ path: `${OUT}/4_below_rocket_space.png` });

check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed -> ${OUT}`);
process.exit(fails ? 1 : 0);
