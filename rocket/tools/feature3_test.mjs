// feature3_test.mjs — round 4:
//   1. rebrand: "Space X Simulator"
//   2. right-click pick: choose where the next part goes (anchor)
//   3. interstage shell encloses upper-stage engines; leaves WITH the booster
//   4. 3-2-1 countdown on Space (second press skips)
//   5. full flip: burn back down toward Earth
//   6. fly around the map (downrange travel)
//   7. 6-engine bottom cluster
//   8. fireworks at the space line
// Run: node tools/feature3_test.mjs [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = '/tmp/feature3_test';
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
await page.waitForFunction(() => window.debugAPI !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(2600);

// ---------- 1. rebrand ----------
check('title is Space X Simulator', (await page.title()) === 'Space X Simulator', await page.title());
const bannerTxt = await page.evaluate(() => document.querySelector('#builder-title .big').textContent);
check('builder banner rebranded', /SPACE\s*X\s*SIMULATOR/i.test(bannerTxt.replace(/\u00a0/g, ' ')), bannerTxt);

// ---------- 2. right-click pick (seam anchor) ----------
// default stack: [engineLarge, fins, tankLarge, pod]
// 2a. upper half of the big tank -> seam ABOVE it (gap 3)
let pt = await page.evaluate(() => debugAPI.partScreenPoint(2, 0.75));
await page.mouse.click(pt.x, pt.y, { button: 'right' });
await page.waitForTimeout(400);
let bi = await page.evaluate(() => debugAPI.builderInfo());
check('right-click upper half -> seam above the part', bi.anchor === 3,
  `anchor=${bi.anchor} stack=${bi.stackIds}`);
await page.click('.part-card[data-part="tankSmall"]');
await page.waitForTimeout(400);
bi = await page.evaluate(() => debugAPI.builderInfo());
check('part inserted exactly at the picked seam',
  bi.stackIds[3] === 'tankSmall' && bi.anchor === 4,
  `stack=${bi.stackIds} anchor=${bi.anchor}`);
// 2b. LOWER half of the bottom engine -> seam at the very bottom (gap 0):
// this is "click the bottom to add the booster down there"
pt = await page.evaluate(() => debugAPI.partScreenPoint(0, 0.18));
await page.mouse.click(pt.x, pt.y, { button: 'right' });
await page.waitForTimeout(400);
bi = await page.evaluate(() => debugAPI.builderInfo());
check('right-click bottom of bottom engine -> seam at the very bottom', bi.anchor === 0,
  `anchor=${bi.anchor}`);
await page.click('.part-card[data-part="engineLarge"]');
await page.waitForTimeout(400);
bi = await page.evaluate(() => debugAPI.builderInfo());
check('booster engine lands UNDER everything',
  bi.stackIds[0] === 'engineLarge' && bi.stackIds[1] === 'engineLarge' && bi.anchor === 1,
  `stack=${bi.stackIds} anchor=${bi.anchor}`);
await page.screenshot({ path: `${OUT}/1_anchor_insert.png` });
// clear anchor (right-click empty sky, away from rocket/UI)
await page.mouse.click(700, 80, { button: 'right' });
await page.waitForTimeout(250);
bi = await page.evaluate(() => debugAPI.builderInfo());
check('right-click empty space clears anchor', bi.anchor === null, `anchor=${bi.anchor}`);
// put the test stack back to default
await page.evaluate(() => debugAPI.loadDefaultRocket());
await page.waitForTimeout(400);

// ---------- 3. interstage shell: build a booster under the rocket ----------
await page.click('.part-card[data-part="decoupler"]');
await page.click('.part-card[data-part="engineLarge"]');
await page.click('.part-card[data-part="engineLarge"]');
await page.click('.part-card[data-part="tankSmall"]');
await page.waitForTimeout(500);
let ri = await page.evaluate(() => debugAPI.rocketInfo());
check('interstage shell wraps upper engines (rides on booster stage)',
  ri.stages.length === 2 && ri.stages[0].hasInterstage && !ri.stages[1].hasInterstage,
  JSON.stringify(ri.stages));
await page.screenshot({ path: `${OUT}/2_interstage_builder.png` });

// ---------- 4. countdown, then 5./6. flight tests ----------
await page.click('#launch-btn');
await page.waitForTimeout(900);
await page.keyboard.press('Space');                  // start countdown
await page.waitForTimeout(350);
let st = await page.evaluate(() => debugAPI.getState());
check('Space starts 3-2-1 countdown (not yet ignited)',
  st.ignited === false && st.countdown !== null && st.countdown <= 3,
  `countdown=${st.countdown} ignited=${st.ignited}`);
await page.evaluate(() => debugAPI.tick(3.4));       // run the count down
st = await page.evaluate(() => debugAPI.getState());
check('countdown reaches zero -> ignition', st.ignited === true, `ignited=${st.ignited}`);

// climb on the booster, then drop it — the shell must leave with it
await page.evaluate(() => debugAPI.tick(20));
await page.keyboard.press('Space');                  // stage!
await page.waitForTimeout(700);
ri = await page.evaluate(() => debugAPI.rocketInfo());
st = await page.evaluate(() => debugAPI.getState());
check('staging drops booster + shell together, upper engines take over',
  ri.stages[0].detached && ri.stages[0].hasInterstage && st.phase !== 'crashed',
  `stages=${JSON.stringify(ri.stages)} phase=${st.phase}`);
await page.evaluate(() => debugAPI.pause(false));
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/3_after_separation.png` });

// ---------- 5. full flip: point at the ground and burn back down ----------
const before = await page.evaluate(() => debugAPI.getState());
await page.keyboard.down('ArrowUp');
await page.evaluate(() => debugAPI.tick(6));         // tilt accumulates 0.7 rad/s
await page.keyboard.up('ArrowUp');
st = await page.evaluate(() => debugAPI.getState());
check('rocket flips completely over (axis points down)',
  st.axisUpDot < -0.85, `axisUpDot=${st.axisUpDot} tiltX=${st.tiltX}`);
await page.evaluate(() => debugAPI.tick(7));
const diving = await page.evaluate(() => debugAPI.getState());
check('burning back toward Earth (altitude dropping fast)',
  diving.alt < st.alt && diving.vSpeed < 0,
  `alt ${st.alt} -> ${diving.alt}, vSpeed ${diving.vSpeed}`);
await page.evaluate(() => debugAPI.pause(false));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/4_flipped_dive.png` });

// ---------- 6. fly around the map: bank ~60 deg and cruise downrange ----------
await page.evaluate(() => { debugAPI.setState({ phase: 'builder' }); debugAPI.pause(false); });
await page.waitForTimeout(800);
await page.click('#launch-btn');
await page.waitForTimeout(900);
await page.keyboard.press('Space');
await page.keyboard.press('Space');                  // skip countdown
await page.waitForTimeout(300);
await page.evaluate(() => debugAPI.tick(6));         // climb a bit first
await page.keyboard.down('ArrowUp');
await page.evaluate(() => debugAPI.tick(1.6));       // ~64 deg tilt
await page.keyboard.up('ArrowUp');
await page.evaluate(() => debugAPI.tick(20));        // cruise
st = await page.evaluate(() => debugAPI.getState());
check('flies around the map (downrange travel, still airborne)',
  st.downrange > 500 && st.phase !== 'crashed' && st.alt > 0,
  `downrange=${st.downrange}m alt=${st.alt}m phase=${st.phase}`);
await page.evaluate(() => debugAPI.pause(false));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/5_cross_country.png` });

// ---------- 7. six engines on the bottom ----------
await page.evaluate(() => { debugAPI.setState({ phase: 'builder' }); debugAPI.pause(false); });
await page.waitForTimeout(400);
await page.evaluate(() => debugAPI.loadDefaultRocket());   // fresh 1-engine stack
await page.waitForTimeout(400);
for (let i = 0; i < 5; i++) await page.click('.part-card[data-part="engineLarge"]');
await page.waitForTimeout(500);
ri = await page.evaluate(() => debugAPI.rocketInfo());
const twr6 = parseFloat(await page.evaluate(() => document.getElementById('st-twr').textContent));
check('six-engine bottom cluster builds + huge TWR',
  ri.nozzles === 6 && twr6 > 3,
  `nozzles=${ri.nozzles} TWR=${twr6}`);
await page.screenshot({ path: `${OUT}/6_six_engines.png` });

// ---------- 8. fireworks at the space line ----------
await page.evaluate(() => debugAPI.setState({ altitude: 4750, throttle: 1 }));
let stars = 0, spacePhase = '';
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => debugAPI.tick(1));
  const s = await page.evaluate(() => debugAPI.getState());
  const f = await page.evaluate(() => debugAPI.frameStats());
  if (s.phase === 'space') {
    spacePhase = s.phase;
    stars = Math.max(stars, f.particles.stars);
    if (stars > 0) break;
  }
}
check('fireworks burst at the space line', spacePhase === 'space' && stars > 30,
  `stars=${stars} phase=${spacePhase}`);
await page.evaluate(() => debugAPI.pause(false));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/7_fireworks.png` });

// ---------- console ----------
const benign = consoleErrors.filter((e) => !/favicon/i.test(e));
check('no console errors', benign.length === 0, benign.join(' | ').slice(0, 300));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed -> ${OUT}`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
