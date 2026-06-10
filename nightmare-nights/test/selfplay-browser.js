// In-browser self-play: plays a real night end-to-end in headless Chrome,
// reacting only to the game's audio cues (hooked) + station knowledge.
// Usage: node selfplay-browser.js <night> <policy>   policy: play | idle
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/tmp/nn-shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/index.html';

async function boot(url) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  return { browser, page, errors };
}

async function main() {
  const night = parseInt(process.argv[2] || '1', 10);
  const policy = process.argv[3] || 'play';
  const ts = 2;
  const { browser, page, errors } = await boot(`${BASE}?night=${night}&debug=1&seed=11&ts=${ts}`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'night', null, { timeout: 20000 });

  // hook the cue stream — this is the bot's hearing
  await page.evaluate(() => {
    window.__cues = [];
    const g = window.__game;
    const orig = g._cue.bind(g);
    g._cue = (n, d) => { window.__cues.push([n, d || null]); orig(n, d); };
  });

  // bot memory
  const mem = {
    breathing: { L: false, R: false },
    steps: { L: 0, R: 0 },
    closet: 0, bed: 0,
    bossLoc: null,
  };
  let keysDown = { Space: false, KeyF: false };

  async function setKey(code, down) {
    if (keysDown[code] === down) return;
    keysDown[code] = down;
    if (down) await page.keyboard.down(code); else await page.keyboard.up(code);
  }

  async function moveTo(target) {
    // movement graph: center is the hub
    const st = await page.evaluate(() => window.__game.player.station);
    if (st === target) return;
    await setKey('Space', false);
    await setKey('KeyF', false);
    const hop = async (key) => {
      await page.keyboard.press(key);
      await page.waitForFunction(() => !window.__game.player.moving, null, { timeout: 8000 }).catch(() => {});
    };
    const KEY = { doorL: 'KeyA', doorR: 'KeyD', closet: 'KeyW', bed: 'KeyS' };
    if (st !== 'center') await hop(st === 'bed' ? 'KeyS' : st === 'doorL' ? 'KeyD' : st === 'doorR' ? 'KeyA' : 'KeyS');
    if (target !== 'center') await hop(KEY[target]);
  }

  const t0 = Date.now();
  let shots = 0;
  let lastShot = 0;
  let listen = 0;

  while (true) {
    const s = await page.evaluate(() => ({
      state: window.__game.state,
      t: window.__game.t,
      station: window.__game.player.station,
      moving: window.__game.player.moving,
      cues: window.__cues.splice(0),
    }));
    if (s.state === 'win' || s.state === 'dead') {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/sp-n${night}-${policy}-final.png` });
      const deathBy = await page.evaluate(() => window.__game.deathBy);
      console.log(`RESULT night=${night} policy=${policy}: ${s.state}${deathBy ? ' by ' + deathBy : ''} at t=${s.t.toFixed(0)}s`);
      break;
    }
    if (Date.now() - t0 > 8 * 60 * 1000) {
      console.log('TIMEOUT — game time', s.t);
      break;
    }

    // hear
    for (const [n, d] of s.cues) {
      const side = d && d.side, loc = d && d.location;
      if (n === 'breathing') mem.breathing[side] = d.on;
      else if (n === 'hallAppear' || n === 'hallAdvance' || n === 'atDoor') { if (side) mem.steps[side] = 8; }
      else if (n === 'retreatSteps' || n === 'hallRetreatRun') { if (side) mem.steps[side] = 0; }
      else if (n === 'closetCreak') mem.closet = Math.max(mem.closet, d.stage >= 2 ? 2 : 1);
      else if (n === 'closetRattle') mem.closet = 2;
      else if (n === 'closetCalm') mem.closet = Math.max(0, mem.closet - 1);
      else if (n === 'gnatGiggle') mem.bed += 1;
      else if (n === 'gnatScatter') mem.bed = 0;
      else if (n === 'bossLaugh' || n === 'bossStaged') mem.bossLoc = loc;
      else if (n === 'bossRepelled') mem.bossLoc = null;
    }
    mem.steps.L = Math.max(0, mem.steps.L - 0.4);
    mem.steps.R = Math.max(0, mem.steps.R - 0.4);

    // periodic screenshots
    if (s.t - lastShot > 60) {
      lastShot = s.t;
      shots += 1;
      await page.screenshot({ path: `${OUT}/sp-n${night}-${policy}-${String(shots).padStart(2, '0')}.png` });
    }

    if (policy === 'idle') { await page.waitForTimeout(300); continue; }
    if (s.moving) { await page.waitForTimeout(120); continue; }

    // act
    if (mem.bossLoc) {
      const want = mem.bossLoc === 'L' ? 'doorL' : mem.bossLoc === 'R' ? 'doorR' : mem.bossLoc;
      if (s.station !== want) { await moveTo(want); listen = 0; continue; }
      if (mem.bossLoc === 'bed') { await setKey('KeyF', true); } else { await setKey('Space', true); }
      await page.waitForTimeout(200);
      continue;
    }
    if (s.station === 'doorL' && mem.breathing.L) { await setKey('KeyF', false); await setKey('Space', true); await page.waitForTimeout(200); continue; }
    if (s.station === 'doorR' && mem.breathing.R) { await setKey('KeyF', false); await setKey('Space', true); await page.waitForTimeout(200); continue; }

    if (mem.bed >= 1 && s.station !== 'bed') { await moveTo('bed'); listen = 0; continue; }
    if (s.station === 'bed') {
      if (mem.bed > 0) { await setKey('KeyF', true); await page.waitForTimeout(250); continue; }
      await setKey('KeyF', false); await moveTo('center'); continue;
    }
    if (mem.closet >= 2 && s.station !== 'closet') { await moveTo('closet'); listen = 0; continue; }
    if (s.station === 'closet') {
      if (mem.closet >= 1) {
        await setKey('Space', true);
        await page.waitForTimeout(2600 / ts * 2);
        mem.closet = 0;
        continue;
      }
      await setKey('Space', false); await moveTo('center'); continue;
    }

    if (s.station === 'doorL' || s.station === 'doorR') {
      const side = s.station === 'doorL' ? 'L' : 'R';
      listen += 1;
      if (listen <= 2) { await page.waitForTimeout(350); continue; }     // listen window
      if (!mem.breathing[side]) {
        await setKey('KeyF', true);                                      // silent -> flash
        await page.waitForTimeout(500);
        await setKey('KeyF', false);
      }
      listen = 0;
      await moveTo('center');
      continue;
    }

    // center hub: chase footsteps, else patrol L/R alternating
    if (mem.steps.L >= mem.steps.R && mem.steps.L > 0) { await moveTo('doorL'); listen = 0; continue; }
    if (mem.steps.R > 0) { await moveTo('doorR'); listen = 0; continue; }
    await moveTo(Math.random() > 0.5 ? 'doorL' : 'doorR');
    listen = 0;
  }

  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
