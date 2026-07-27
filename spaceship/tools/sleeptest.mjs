// Verifies sleeping in the bed wakes into DAY lighting (no sticky blue night
// mode), and that night mode still engages automatically late in the clock.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 5189;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let ready = false;
    const onData = (d) => {
      if (!ready && (d.toString().includes('Local:') || d.toString().includes('ready in'))) {
        ready = true;
        setTimeout(() => resolve(proc), 400);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => { if (!ready) reject(new Error(`vite exited ${code}`)); });
    setTimeout(() => { if (!ready) reject(new Error('vite timeout')); }, 30000);
  });
}

const server = await startServer();
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});

let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
  await page.goto(`http://localhost:${PORT}/#debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 120000 });

  async function settleFrames(n, timeout = 120000) {
    const start = await page.evaluate(() => window.debugAPI.frames());
    await page.waitForFunction(
      ({ start, n }) => window.debugAPI.frames() >= start + n,
      { start, n }, { timeout, polling: 250 }
    );
  }
  const status = () => page.evaluate(() => document.getElementById('status').textContent);
  async function snap(file) {
    const dataUrl = await page.evaluate(() => window.debugAPI.capture(0.9));
    writeFileSync(path.join(root, 'shots', 'probe', file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  function check(name, ok) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) failed = true;
  }

  // 1) force night via the clock, confirm REST CYCLE engages on its own
  await page.evaluate(() => window.debugAPI.setClock(23));
  await settleFrames(30); // let the lighting lerp reach night
  const night = await page.evaluate(() => window.debugAPI.cycleState());
  check(`clock 23:00 -> rest cycle engaged (got ${JSON.stringify(night)})`, night.restCycle && night.cycleT < 0.15);
  await page.evaluate(() => window.debugAPI.setView('quarters'));
  await settleFrames(4);
  await snap('sleep_night.jpg');

  // 2) sleep in the bed; must wake at 07:00 in day lighting
  await page.evaluate(() => window.debugAPI.teleport(3.4, 4.2, -2.59, -0.55));
  await settleFrames(3);
  const hover = await page.evaluate(() => window.debugAPI.hoverTarget());
  check(`hovering bed (got "${hover}")`, hover === 'bed');
  await page.evaluate(() => window.debugAPI.press('KeyE'));
  await page.waitForTimeout(1100);
  const msg = await page.evaluate(() => document.getElementById('message').textContent);
  check(`sleep message (got "${msg}")`, msg === 'YOU SLEEP UNTIL MORNING');
  await page.waitForTimeout(2600);
  await settleFrames(8); // let the lighting lerp settle
  const wakeStatus = await status();
  check(`woke at 07:0x in day cycle (got "${wakeStatus}")`, /T\+07:0\d · CRUISE/.test(wakeStatus));
  await page.evaluate(() => window.debugAPI.setView('quarters'));
  await settleFrames(4);
  await snap('sleep_wake.jpg');
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  console.log(failed ? 'SLEEPTEST_FAIL' : 'SLEEPTEST_PASS');
  setTimeout(() => process.exit(failed ? 1 : 0), 500).unref();
}
