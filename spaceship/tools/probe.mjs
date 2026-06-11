// Quick perf probe in headless chromium.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 5189;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (d.toString().includes('Local:')) setTimeout(res, 400); });
  server.stderr.on('data', (d) => process.stderr.write(d));
  setTimeout(() => rej(new Error('vite timeout')), 20000);
});

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/#debug`, { waitUntil: 'load' });
console.log('loaded in', Date.now() - t0, 'ms');
try {
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 90000 });
  console.log('ready in', Date.now() - t0, 'ms');
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(2000);
    const stats = await page.evaluate(() => ({ ...window.debugAPI.stats(), frames: window.debugAPI.frames() }));
    console.log(`t=${Date.now() - t0}ms`, JSON.stringify(stats));
  }
} catch (e) {
  console.log('FAILED:', e.message);
}
await browser.close();
server.kill('SIGTERM');
process.exit(0);
