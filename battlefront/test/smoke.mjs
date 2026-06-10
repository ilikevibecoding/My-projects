// Headless smoke test for Galactic Battlefront.
// Usage: node test/smoke.mjs [--shots-dir DIR] [--url URL]
// Requires: playwright-core + a local Chrome (set CHROME_PATH to override).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const SHOTS = argVal('--shots-dir', '/tmp/bf-shots');
const URL = argVal('--url', 'http://localhost:8077/battlefront/index.html?test=1&speed=4&quality=low');
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

mkdirSync(SHOTS, { recursive: true });

const errors = [];
let failed = false;
function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
  return ok;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--window-size=1280,720'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', msg => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text());
});
page.on('pageerror', err => errors.push('pageerror: ' + err.message));

console.log('Loading', URL);
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

// 1) boots to menu
await page.waitForFunction(() => window.__TEST && window.__TEST.state !== 'loading', null, { timeout: 20000 });
const state1 = await page.evaluate(() => window.__TEST.state);
check('boots out of loading', ['menu', 'deploy', 'playing'].includes(state1), `state=${state1}`);
await page.screenshot({ path: `${SHOTS}/01-menu.png` });

// 2) test-mode auto-start reaches playing
await page.waitForFunction(() => window.__TEST.state === 'playing', null, { timeout: 25000 });
check('reaches playing state', true);
const soldiers = await page.evaluate(() => window.__TEST.soldiers);
check('bot armies spawned', soldiers >= 24, `soldiers=${soldiers}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}/02-early-battle.png` });

// 3) canvas renders non-blank
const blank = await page.evaluate(() => {
  const cv = document.getElementById('game-canvas');
  const c2 = document.createElement('canvas');
  c2.width = 64; c2.height = 64;
  const ctx = c2.getContext('2d');
  ctx.drawImage(cv, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum / (64 * 64 * 3);
});
check('canvas renders non-blank', blank > 8, `avg brightness=${blank.toFixed(1)}`);

// 4) battle simulation until sim-clock reaches ~75s: tickets must drain, a post must flip
const ticketsBefore = await page.evaluate(() => window.__TEST.tickets);
const postsBefore = await page.evaluate(() => window.__TEST.posts);
console.log('tickets before:', JSON.stringify(ticketsBefore));
console.log('posts before:', JSON.stringify(postsBefore));
const simStart = await page.evaluate(() => window.__TEST.simTime);
await page.waitForFunction(t0 => window.__TEST.simTime - t0 > 75, simStart, { timeout: 180000, polling: 1000 });
console.log('sim time elapsed:', await page.evaluate(() => window.__TEST.simTime.toFixed(1)));
const ticketsAfter = await page.evaluate(() => window.__TEST.tickets);
const postsAfter = await page.evaluate(() => window.__TEST.posts);
console.log('tickets after:', JSON.stringify(ticketsAfter));
console.log('posts after:', JSON.stringify(postsAfter));
check('tickets drained',
  ticketsAfter.coalition < ticketsBefore.coalition || ticketsAfter.dominion < ticketsBefore.dominion,
  `coa ${ticketsBefore.coalition}->${ticketsAfter.coalition}, dom ${ticketsBefore.dominion}->${ticketsAfter.dominion}`);
const flips = Object.keys(postsAfter).filter(id =>
  postsAfter[id].owner !== postsBefore[id].owner || Math.abs(postsAfter[id].progress - postsBefore[id].progress) > 0.2);
check('post ownership/progress changed', flips.length > 0, `changed: ${flips.join(',') || 'none'}`);
await page.screenshot({ path: `${SHOTS}/03-mid-battle.png` });

// 5) end screen flow
await page.evaluate(() => window.__TEST.forceTickets(1, 0));
await page.waitForFunction(() => window.__TEST.state === 'end', null, { timeout: 8000 });
check('match ends when tickets hit zero', true);
await page.screenshot({ path: `${SHOTS}/04-end.png` });

// 6) error budget — ignore benign WebGL-software warnings + favicon
const realErrors = errors.filter(e =>
  !/SwiftShader|swiftshader|GroupMarkerNotSet|Automatic fallback|GPU stall|WebGL.*deprecated|AudioContext|favicon/i.test(e));
check('zero console/page errors', realErrors.length === 0, realErrors.slice(0, 6).join(' | '));

await browser.close();
console.log(failed ? '\nSMOKE: FAILED' : '\nSMOKE: PASSED');
process.exit(failed ? 1 : 0);
