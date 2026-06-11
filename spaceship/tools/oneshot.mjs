// Single debug view capture: node tools/oneshot.mjs <name> [x y z lx ly lz]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const name = process.argv[2] || 'cockpit';
const custom = process.argv.length >= 9 ? process.argv.slice(3, 9).map(Number) : null;
const PORT = 5190;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (d.toString().includes('Local:')) setTimeout(res, 400); });
  setTimeout(() => rej(new Error('vite timeout')), 20000);
});
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/#debug${process.env.HASHFLAGS || ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 120000 });
  if (custom) {
    await page.evaluate(([x, y, z, lx, ly, lz]) => {
      window.debugAPI.setView('cockpit');
      const cam = window.debugAPI;
      window.debugAPI.customView(x, y, z, lx, ly, lz);
    }, custom);
  } else {
    await page.evaluate((n) => window.debugAPI.setView(n), name);
  }
  const start = await page.evaluate(() => window.debugAPI.frames());
  await page.waitForFunction((s) => window.debugAPI.frames() >= s + 3, start, { timeout: 120000, polling: 250 });
  console.log('pick:', JSON.stringify(await page.evaluate(() => window.debugAPI.pick())));
  const dataUrl = await page.evaluate(() => window.debugAPI.capture(0.9));
  mkdirSync(path.join(root, 'shots', 'probe'), { recursive: true });
  const out = path.join(root, 'shots', 'probe', `${name}.jpg`);
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved', out);
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  setTimeout(() => process.exit(0), 300).unref();
}
