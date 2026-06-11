// Headless screenshot harness. Usage: node tools/shots.mjs <iterN>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iter = process.argv[2] || 'dev';
const outDir = path.join(root, 'shots', `iter_${iter}`);
mkdirSync(outDir, { recursive: true });

const PORT = 5189;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const onData = (d) => {
      const s = d.toString();
      if (!ready && (s.includes('Local:') || s.includes('ready in'))) {
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
  args: [
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[page error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[page exception]', err.message));

  await page.goto(`http://localhost:${PORT}/#debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 60000 });

  const views = ['cockpit', 'corridor', 'quarters', 'window'];
  const stats = {};
  for (const v of views) {
    await page.evaluate((name) => window.debugAPI.setView(name), v);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, `${v}.jpg`), quality: 85, type: 'jpeg' });
    stats[v] = await page.evaluate(() => window.debugAPI.stats());
    console.log(`shot: ${v}`, JSON.stringify(stats[v]));
  }

  // --- interaction smoke test ---
  const interactions = [
    { id: 'bed', x: 3.4, z: 4.2, yaw: 2.4, pitch: -0.35 },
    { id: 'galley', x: -3.9, z: -3.2, yaw: Math.PI / 2, pitch: -0.25 },
    { id: 'bathroom', x: -2.8, z: 4.4, yaw: Math.PI / 2, pitch: -0.15 },
  ];
  const interactResults = {};
  for (const it of interactions) {
    await page.evaluate(({ x, z, yaw, pitch }) => window.debugAPI.teleport(x, z, yaw, pitch), it);
    await page.waitForTimeout(600);
    const hover = await page.evaluate(() => window.debugAPI.hoverTarget());
    let fired = false;
    if (hover === it.id) {
      await page.evaluate(() => window.debugAPI.press('KeyE'));
      await page.waitForTimeout(1100);
      fired = true;
      await page.screenshot({ path: path.join(outDir, `interact_${it.id}.jpg`), quality: 80, type: 'jpeg' });
      await page.waitForTimeout(2500);
    }
    interactResults[it.id] = { hover, fired };
    console.log(`interact ${it.id}:`, JSON.stringify(interactResults[it.id]));
  }

  writeFileSync(
    path.join(outDir, 'stats.json'),
    JSON.stringify({ stats, interactResults }, null, 2)
  );
  console.log(`done -> ${outDir}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
