// Verifies the LIVE githack link boots: no console errors, title renders,
// a night can start, and the 3D room renders. Screenshots to /tmp/nn-live/.
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2];
if (!URL) { console.error('usage: node live-verify.js <url>'); process.exit(1); }

(async () => {
  fs.mkdirSync('/tmp/nn-live', { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure() || {}).errorText));

  console.log('loading', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

  // githack shows a one-time "Open the page" interstitial for new visitors
  const interstitial = page.locator('text=Open the page');
  if (await interstitial.count()) {
    console.log('githack interstitial detected — clicking through (one-time per visitor)');
    await interstitial.first().click();
    await page.waitForLoadState('domcontentloaded');
  }

  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/nn-live/live-01-title.png' });
  console.log('title OK');

  // Start night 1 via the actual UI button
  await page.click('.night-btn:not(.locked)');
  await page.waitForFunction(() => window.__game && window.__game.state === 'night', null, { timeout: 30000 });
  await page.waitForTimeout(2500); // let intro fade + room render
  await page.screenshot({ path: '/tmp/nn-live/live-02-room.png' });
  console.log('night started OK; hour =', await page.evaluate(() => window.__game.hour));

  // Move to left door + flashlight to exercise input/render paths
  await page.keyboard.press('KeyA');
  await page.waitForFunction(() => !window.__game.player.moving, null, { timeout: 15000 });
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/nn-live/live-03-door-flash.png' });
  await page.keyboard.up('KeyF');
  console.log('door+flash OK');

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res((n / 2).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  console.log('fps (swiftshader):', fps);

  // ignore noise from the githack interstitial's own ad loader (pre-game)
  const fatal = errors.filter((e) => !/favicon|ethicalads|ERR_BLOCKED_BY_RESPONSE/i.test(e));
  console.log(fatal.length ? 'ERRORS:\n' + fatal.join('\n') : 'no console errors');
  await browser.close();
  process.exit(fatal.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
