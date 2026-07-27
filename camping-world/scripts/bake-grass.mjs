/**
 * Bakes grass clump scans into an 8-cell billboard atlas:
 *   public/assets/textures/grass/grass_atlas.png  (4×2 cells of 512px)
 *   public/assets/textures/grass/grass_atlas.json (per-cell real-world height)
 *
 * Color dilation fills transparent texels with nearest opaque color so
 * mipmapped alpha-tested cards don't get dark fringes.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'textures', 'grass');
const CELL = 512;
const COLS = 4;
const ROWS = 2;

const browser = await chromium.launch({
  executablePath: ['/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) => existsSync(p)),
  args: ['--no-sandbox', '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));

await page.goto('http://127.0.0.1:5174/bake.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__READY === true, null, { timeout: 300000, polling: 500 });

const count = Math.min(await page.evaluate(() => window.__clumpCount()), COLS * ROWS);
console.log(`[bake] ${count} clumps`);

const cells = [];
const meta = [];
for (let i = 0; i < count; i++) {
  const { dataURL, heightM, frameM } = await page.evaluate(
    ([idx, px]) => window.__bakeClump(idx, px),
    [i, CELL]
  );
  const buf = Buffer.from(dataURL.split(',')[1], 'base64');
  cells.push(buf);
  meta.push({ cell: i, heightM: Number(heightM.toFixed(3)), frameM: Number(frameM.toFixed(3)) });
  console.log(`[bake] clump ${i}: height ${heightM.toFixed(2)}m, frame ${frameM.toFixed(2)}m`);
}
await browser.close();

// --- composite atlas ---
const atlasW = COLS * CELL;
const atlasH = ROWS * CELL;
let atlas = sharp({
  create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(
  cells.map((buf, i) => ({
    input: buf,
    left: (i % COLS) * CELL,
    top: Math.floor(i / COLS) * CELL,
  }))
);

// --- color dilation into transparent texels (anti-fringe) ---
const raw = await atlas.raw().toBuffer();
const px = new Uint8Array(raw);
const W = atlasW;
const H = atlasH;
const idx = (x, y) => (y * W + x) * 4;
for (let pass = 0; pass < 12; pass++) {
  let changed = 0;
  const snapshot = Uint8Array.from(px);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (snapshot[i + 3] !== 0) continue;
      // average opaque neighbors
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = idx(nx, ny);
          if (snapshot[j + 3] > 0) {
            r += snapshot[j]; g += snapshot[j + 1]; b += snapshot[j + 2]; n++;
          }
        }
      }
      if (n > 0) {
        px[i] = r / n;
        px[i + 1] = g / n;
        px[i + 2] = b / n;
        px[i + 3] = 1; // mark visited but stay (effectively) transparent
        changed++;
      }
    }
  }
  if (!changed) break;
}
// zero-out the marker alpha so alphaTest never picks dilated texels
for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 1) px[i + 3] = 0;

mkdirSync(OUT_DIR, { recursive: true });
await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT_DIR, 'grass_atlas.png'));
writeFileSync(join(OUT_DIR, 'grass_atlas.json'), JSON.stringify({ cols: COLS, rows: ROWS, cells: meta }, null, 2));
console.log(`[bake] wrote ${join(OUT_DIR, 'grass_atlas.png')} (${W}x${H})`);
