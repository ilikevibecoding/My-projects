// Sanity check: production build boots and renders frames.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = 5195;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (d.toString().includes('Local:')) setTimeout(res, 300); });
  setTimeout(() => rej(new Error('preview timeout')), 20000);
});
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/#debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 120000 });
  console.log('BUILD_OK: app booted and rendered frames');
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  setTimeout(() => process.exit(0), 300).unref();
}
