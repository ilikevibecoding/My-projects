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
  await page.waitForFunction(() => window.debugAPI && window.debugAPI.ready, null, { timeout: 120000 });

  // SwiftShader renders < 1 fps; wait on rendered-frame count rather than wall
  // time so "wait 2 seconds to settle" still means "several frames settled".
  async function settleFrames(n, timeout = 120000) {
    const start = await page.evaluate(() => window.debugAPI.frames());
    await page.waitForFunction(
      ({ start, n }) => window.debugAPI.frames() >= start + n,
      { start, n }, { timeout, polling: 250 }
    );
  }

  async function snap(file) {
    const dataUrl = await page.evaluate(() => window.debugAPI.capture(0.9));
    const b64 = dataUrl.split(',')[1];
    writeFileSync(path.join(outDir, file), Buffer.from(b64, 'base64'));
  }

  const views = ['cockpit', 'corridor', 'quarters', 'window'];
  const stats = {};
  for (const v of views) {
    await page.evaluate((name) => window.debugAPI.setView(name), v);
    await page.waitForTimeout(2000);
    await settleFrames(4);
    await snap(`${v}.jpg`);
    stats[v] = await page.evaluate(() => window.debugAPI.stats());
    console.log(`shot: ${v}`, JSON.stringify(stats[v]));
  }

  // --- interaction smoke test ---
  const interactions = [
    { id: 'bed', x: 3.4, z: 4.2, yaw: -2.59, pitch: -0.55 },
    { id: 'galley', x: -3.9, z: -3.2, yaw: Math.PI / 2, pitch: -0.7 },
    { id: 'bathroom', x: -2.6, z: 3.9, yaw: 2.16, pitch: -0.57 },
  ];
  const interactResults = {};
  for (const it of interactions) {
    await page.evaluate(({ x, z, yaw, pitch }) => window.debugAPI.teleport(x, z, yaw, pitch), it);
    await settleFrames(3);
    const hover = await page.evaluate(() => window.debugAPI.hoverTarget());
    const prompt = await page.evaluate(() => ({
      text: document.getElementById('prompt').textContent,
      on: document.getElementById('prompt').classList.contains('on'),
    }));
    let fired = false, midState = null;
    if (hover === it.id) {
      await page.evaluate(() => window.debugAPI.press('KeyE'));
      await page.waitForTimeout(1100);
      await settleFrames(2);
      fired = true;
      midState = await page.evaluate(() => ({
        fade: document.getElementById('fade').classList.contains('on'),
        message: document.getElementById('message').textContent,
        status: document.getElementById('status').textContent,
      }));
      await snap(`interact_${it.id}.jpg`);
      await page.waitForTimeout(2600);
      await settleFrames(2);
    }
    interactResults[it.id] = { hover, prompt, fired, midState };
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
