// Screenshot + self-play harness for Five Nights of Nightmares.
// Usage: node shot.js <scenario>
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/tmp/nn-shots';
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:8765/index.html';

async function boot(url, viewport = { width: 1280, height: 720 }) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  return { browser, page, errors };
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
}

async function waitNight(page) {
  await page.waitForFunction(() => window.__game && window.__game.state === 'night', null, { timeout: 20000 });
}

// press a movement key and wait for the camera tween to finish
async function move(page, key, expectStation) {
  await page.keyboard.press(key);
  await page.waitForFunction(() => !window.__game.player.moving, null, { timeout: 8000 });
  await page.waitForTimeout(120);
  const st = await page.evaluate(() => window.__game.player.station);
  if (expectStation && st !== expectStation) {
    throw new Error(`expected station ${expectStation}, got ${st} (after ${key})`);
  }
  return st;
}

async function flashShot(page, name, holdMs = 700) {
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(holdMs);
  await shot(page, name);
  await page.keyboard.up('KeyF');
}

async function measureFps(page) {
  return page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res((n / 2).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
}

async function main() {
  const scenario = process.argv[2] || 'title';

  if (scenario === 'title') {
    const { browser, page, errors } = await boot(BASE);
    await page.waitForTimeout(1200);
    await shot(page, '01-title');
    console.log('fps:', await measureFps(page));
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }

  if (scenario === 'room') {
    const { browser, page, errors } = await boot(BASE + '?night=1&debug=1');
    await waitNight(page);
    await page.waitForTimeout(600);
    await shot(page, '02-room-dark');
    await flashShot(page, '03-room-flash');
    await move(page, 'KeyA', 'doorL');
    await flashShot(page, '04-leftdoor-flash');
    await shot(page, '05-leftdoor-dark');
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    await shot(page, '06-leftdoor-held');
    await page.keyboard.up('Space');
    await move(page, 'KeyD', 'center');
    await move(page, 'KeyD', 'doorR');
    await flashShot(page, '07-rightdoor-flash');
    await move(page, 'KeyA', 'center');
    await move(page, 'KeyW', 'closet');
    await flashShot(page, '08-closet-peek', 1600);
    await move(page, 'KeyS', 'center');
    await move(page, 'KeyS', 'bed');
    await flashShot(page, '09-bed-flash');
    console.log('fps:', await measureFps(page));
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }

  if (scenario === 'monsters') {
    const { browser, page, errors } = await boot(BASE + '?night=1&debug=1&seed=7');
    await waitNight(page);
    await page.evaluate(() => { window.__game.thump.level = 0; window.__game.peck.level = 0; window.__game.gnats.level = 0; window.__game.snatch.level = 0; });
    await page.evaluate(() => { window.__game.thump.state = 'far'; });
    await move(page, 'KeyA', 'doorL');
    await flashShot(page, '10-thump-far');
    await page.evaluate(() => { window.__game.thump.state = 'near'; });
    await flashShot(page, '11-thump-near');
    await page.evaluate(() => { window.__game.thump.state = 'hidden'; });
    await move(page, 'KeyD', 'center');
    await move(page, 'KeyD', 'doorR');
    await page.evaluate(() => { window.__game.peck.state = 'far'; });
    await flashShot(page, '12-peck-far');
    await page.evaluate(() => { window.__game.peck.state = 'near'; });
    await flashShot(page, '12b-peck-near');
    await page.evaluate(() => { window.__game.peck.state = 'hidden'; });
    await move(page, 'KeyA', 'center');
    await move(page, 'KeyW', 'closet');
    await page.evaluate(() => { window.__game.snatch.stage = 1; });
    await flashShot(page, '13-closet-plush-sus', 1700);
    await page.evaluate(() => { window.__game.snatch.stage = 2; });
    await flashShot(page, '14-closet-crouched', 1700);
    await page.evaluate(() => { window.__game.snatch.stage = 3; window.__game.snatch.attackWait = -999; });
    await flashShot(page, '15-closet-standing', 700);
    await page.evaluate(() => { window.__game.snatch.stage = 0; });
    await move(page, 'KeyS', 'center');
    await move(page, 'KeyS', 'bed');
    await page.evaluate(() => { window.__game.gnats.count = 3; window.__game.gnats.doom = -999; });
    await flashShot(page, '16-gnats-bed', 450);
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }

  if (scenario === 'jumpscare') {
    const { browser, page, errors } = await boot(BASE + '?night=1&debug=1');
    await waitNight(page);
    await page.evaluate(() => window.__game._kill('thump'));
    await page.waitForTimeout(420);
    await shot(page, '17-jumpscare-mid');
    await page.waitForTimeout(450);
    await shot(page, '18-jumpscare-end');
    await page.waitForFunction(() => window.__game.state === 'dead', null, { timeout: 8000 });
    await page.waitForTimeout(800);
    await shot(page, '19-death-screen');
    console.log('state:', await page.evaluate(() => window.__game.state));
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }

  if (scenario === 'grimm') {
    const { browser, page, errors } = await boot(BASE + '?night=5&debug=1&seed=3');
    await waitNight(page);
    await page.evaluate(() => {
      window.__game.grimm.level = 0; // freeze brain, we drive it manually
      window.__game.grimm.phase = 'staged';
      window.__game.grimm.location = 'L';
    });
    await move(page, 'KeyA', 'doorL');
    await flashShot(page, '20-grimm-hall-staged');
    await page.evaluate(() => { window.__game.grimm.phase = 'threat'; });
    await flashShot(page, '20b-grimm-hall-threat', 300);
    await page.evaluate(() => { window.__game.grimm.location = 'bed'; window.__game.grimm.phase = 'staged'; });
    await move(page, 'KeyD', 'center');
    await move(page, 'KeyS', 'bed');
    await flashShot(page, '21-grimm-bed', 450);
    await page.evaluate(() => { window.__game.grimm.location = 'closet'; });
    await move(page, 'KeyS', 'center');
    await move(page, 'KeyW', 'closet');
    await flashShot(page, '22-grimm-closet', 1700);
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }

  if (scenario === 'win') {
    const { browser, page, errors } = await boot(BASE + '?night=1&debug=1');
    await waitNight(page);
    await page.evaluate(() => { window.__game.t = 318; });
    await page.waitForFunction(() => window.__game.state === 'win', null, { timeout: 10000 });
    await page.waitForTimeout(2200);
    await shot(page, '23-win-screen');
    console.log('unlocked:', await page.evaluate(() => window.__game.unlocked));
    console.log('console errors:', errors.length ? errors : 'none');
    await browser.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
