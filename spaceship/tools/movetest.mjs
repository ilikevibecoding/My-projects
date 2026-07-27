// Verify WASD maps to the camera's facing for all four cardinal yaws.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 5196;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (d.toString().includes('Local:')) setTimeout(res, 300); });
  setTimeout(() => rej(new Error('vite timeout')), 20000);
});
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
let fail = 0;
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/#debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.debugAPI.forceLock(true));

  // yaw=0 faces -Z; expected forward = (-sin(yaw), -cos(yaw))
  const cases = [
    { yaw: 0, name: 'facing -Z' },
    { yaw: Math.PI, name: 'facing +Z' },
    { yaw: Math.PI / 2, name: 'facing -X' },
    { yaw: -Math.PI / 2, name: 'facing +X' },
  ];
  for (const c of cases) {
    for (const [key, lx, lz] of [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0]]) {
      // start mid-corridor; expected world dir = R_y(yaw) * local
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const ex = lx * cos + lz * sin, ez = -lx * sin + lz * cos;
      await page.evaluate(({ yaw }) => window.debugAPI.teleport(0, 0, yaw, 0), { yaw: c.yaw });
      const p0 = await page.evaluate(() => window.debugAPI.playerPos());
      await page.evaluate((k) => window.debugAPI.setKey(k, true), key);
      const f0 = await page.evaluate(() => window.debugAPI.frames());
      await page.waitForFunction((f) => window.debugAPI.frames() >= f + 4, f0, { timeout: 60000, polling: 200 });
      await page.evaluate((k) => window.debugAPI.setKey(k, false), key);
      const p1 = await page.evaluate(() => window.debugAPI.playerPos());
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
      const len = Math.hypot(dx, dz);
      const dot = len > 1e-4 ? (dx * ex + dz * ez) / len : 0;
      const ok = dot > 0.95;
      if (!ok) fail++;
      console.log(`${c.name} ${key}: moved (${dx.toFixed(2)}, ${dz.toFixed(2)}) expected dir (${ex.toFixed(1)}, ${ez.toFixed(1)}) dot=${dot.toFixed(2)} ${ok ? 'OK' : 'WRONG'}`);
    }
  }
  console.log(fail === 0 ? 'MOVETEST_PASS' : `MOVETEST_FAIL (${fail})`);
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  setTimeout(() => process.exit(fail === 0 ? 0 : 1), 300).unref();
}
