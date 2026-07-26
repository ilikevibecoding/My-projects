#!/usr/bin/env node
/**
 * Foliage atlas builder.
 *
 * Turns generated reference sheets shot on a pure black background into
 * alpha-tested foliage cards that survive mipmapping.
 *
 * The black-background trap: an image composited over black already contains
 * colour PRE-MULTIPLIED by coverage. If you just key an alpha channel and stop
 * there, every partially covered edge pixel keeps its darkened colour; once the
 * GPU averages those pixels into lower mips the needles grow black outlines.
 *
 * So this tool:
 *   1. estimates coverage per pixel,
 *   2. UN-premultiplies (rgb /= alpha) to recover true needle colour,
 *   3. flood-dilates that colour outwards into the transparent region, so the
 *      colour channel is defined everywhere a mip filter can reach,
 *   4. tight-crops each specimen to kill wasted transparent area (and with it
 *      wasted overdraw),
 *   5. packs the specimens into one power-of-two atlas,
 *   6. verifies that the mip chain does not darken.
 *
 * Usage: node tools/atlas.mjs <source.png> <outName> [--tiles=2x2] [--size=1024]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};

// ---------------------------------------------------------------------------
// 1. coverage estimate + un-premultiply
// ---------------------------------------------------------------------------
/**
 * @param lo below this luminance a pixel is pure background
 * @param hi at/above this luminance a pixel is fully covered
 */
export function keyFromBlack(png, { lo = 0.035, hi = 0.30 } = {}) {
  const { width: w, height: h, data } = png;
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    // coverage tracks the brightest channel: hue is irrelevant to how much of
    // the pixel the needle covers, and using luminance would under-key the
    // dark blue-green needles.
    const maxc = Math.max(r, g, b);
    let a = (maxc - lo) / (hi - lo);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    // un-premultiply: recover the needle's true colour at partial coverage
    const inv = a > 0.004 ? 1 / a : 0;
    out.data[i * 4] = Math.min(255, Math.round(r * inv * 255));
    out.data[i * 4 + 1] = Math.min(255, Math.round(g * inv * 255));
    out.data[i * 4 + 2] = Math.min(255, Math.round(b * inv * 255));
    out.data[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/**
 * Drop specks: isolated fragments left by the generator inflate the tight crop
 * (wasting atlas space and adding transparent overdraw) and read as floating
 * dots on a card.
 */
export function removeSpecks(png, minArea = 250) {
  const { width: w, height: h, data } = png;
  const seen = new Uint8Array(w * h);
  const solid = (i) => data[i * 4 + 3] >= 8;
  let removed = 0;
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !solid(start)) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const comp = [];
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (seen[j] || !solid(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (comp.length < minArea) {
      for (const i of comp) data[i * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 2. edge dilation — push colour outwards so mip filtering never samples black
// ---------------------------------------------------------------------------
export function dilate(png, passes = 24) {
  const { width: w, height: h } = png;
  const rgb = new Uint8Array(png.data.length);
  rgb.set(png.data);
  // known[i] = this pixel has a usable colour
  let known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = png.data[i * 4 + 3] > 0 ? 1 : 0;

  for (let p = 0; p < passes; p++) {
    const next = known.slice();
    let filled = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!known[j]) continue;
            r += rgb[j * 4]; g += rgb[j * 4 + 1]; b += rgb[j * 4 + 2]; n++;
          }
        }
        if (n) {
          rgb[i * 4] = Math.round(r / n);
          rgb[i * 4 + 1] = Math.round(g / n);
          rgb[i * 4 + 2] = Math.round(b / n);
          next[i] = 1;
          filled++;
        }
      }
    }
    known = next;
    if (!filled) break;
  }
  // keep original alpha, take dilated colour
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[i * 4];
    png.data[i * 4 + 1] = rgb[i * 4 + 1];
    png.data[i * 4 + 2] = rgb[i * 4 + 2];
  }
  return png;
}

// ---------------------------------------------------------------------------
// 3. tight crop
// ---------------------------------------------------------------------------
export function bbox(png, region, alphaThreshold = 8) {
  const { width: w } = png;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (png.data[(y * w + x) * 4 + 3] >= alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function blit(src, srcRect, dst, dx, dy) {
  for (let y = 0; y < srcRect.h; y++) {
    for (let x = 0; x < srcRect.w; x++) {
      const si = ((srcRect.y + y) * src.width + (srcRect.x + x)) * 4;
      const di = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

function resize(src, rect, tw, th) {
  const out = new PNG({ width: tw, height: th });
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      // box filter in premultiplied space, then un-premultiply — averaging
      // straight RGBA would drag transparent colour into the result
      const x0 = rect.x + (x / tw) * rect.w, x1 = rect.x + ((x + 1) / tw) * rect.w;
      const y0 = rect.y + (y / th) * rect.h, y1 = rect.y + ((y + 1) / th) * rect.h;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(y0); sy < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); sy++) {
        for (let sx = Math.floor(x0); sx < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); sx++) {
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
          const i = (sy * src.width + sx) * 4;
          const al = src.data[i + 3] / 255;
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al;
          a += al; n++;
        }
      }
      const di = (y * tw + x) * 4;
      if (!n || a <= 0.0001) { out.data[di + 3] = 0; continue; }
      out.data[di] = Math.min(255, Math.round(r / a));
      out.data[di + 1] = Math.min(255, Math.round(g / a));
      out.data[di + 2] = Math.min(255, Math.round(b / a));
      out.data[di + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

/** Average colour of covered pixels — used to prove mips do not darken. */
function coveredMean(png) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3];
    if (a < 8) continue;
    r += png.data[i * 4]; g += png.data[i * 4 + 1]; b += png.data[i * 4 + 2]; n++;
  }
  return n ? { r: +(r / n).toFixed(1), g: +(g / n).toFixed(1), b: +(b / n).toFixed(1), covered: n } : null;
}

/** Emulate GPU mip generation to confirm no dark fringe creeps in. */
function mipCheck(png, levels = 5) {
  const out = [];
  let cur = png;
  for (let l = 0; l < levels; l++) {
    const tw = Math.max(1, cur.width >> 1), th = Math.max(1, cur.height >> 1);
    cur = resize(cur, { x: 0, y: 0, w: cur.width, h: cur.height }, tw, th);
    const m = coveredMean(cur);
    out.push({ level: l + 1, size: `${tw}x${th}`, mean: m });
  }
  return out;
}

// ---------------------------------------------------------------------------
function main() {
  const srcPath = process.argv[2];
  const outName = process.argv[3] || 'atlas';
  if (!srcPath) { console.error('usage: node tools/atlas.mjs <source.png> <outName>'); process.exit(1); }
  const [tx, ty] = arg('tiles', '2x2').split('x').map(Number);
  const atlasSize = parseInt(arg('size', '1024'), 10);
  const lo = parseFloat(arg('lo', '0.035'));
  const hi = parseFloat(arg('hi', '0.30'));

  const src = PNG.sync.read(readFileSync(srcPath));
  console.log(`source ${src.width}x${src.height}`);

  const keyed = keyFromBlack(src, { lo, hi });
  const specks = removeSpecks(keyed, parseInt(arg('minarea', '250'), 10));
  if (specks) console.log(`removed ${specks} speck component(s)`);

  // find each specimen inside its grid cell, tight-cropped
  const cellW = Math.floor(src.width / tx), cellH = Math.floor(src.height / ty);
  const specimens = [];
  for (let gy = 0; gy < ty; gy++) {
    for (let gx = 0; gx < tx; gx++) {
      const region = { x: gx * cellW, y: gy * cellH, w: cellW, h: cellH };
      const bb = bbox(keyed, region);
      if (!bb) { console.log(`  cell ${gx},${gy}: empty`); continue; }
      const fill = ((bb.w * bb.h) / (cellW * cellH) * 100).toFixed(1);
      console.log(`  cell ${gx},${gy}: bbox ${bb.w}x${bb.h} (${fill}% of cell)`);
      specimens.push(bb);
    }
  }

  // dilate on the full keyed image so colour bleeds across crop edges too
  dilate(keyed, 20);

  // pack: one row per grid row, each tile scaled into an equal slot
  const cols = tx, rows = Math.ceil(specimens.length / tx);
  const slotW = Math.floor(atlasSize / cols), slotH = Math.floor(atlasSize / rows);
  const atlas = new PNG({ width: atlasSize, height: atlasSize });
  const PAD = 6; // guard band so mip levels never blend neighbouring tiles
  const uvs = [];
  specimens.forEach((bb, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    // preserve aspect ratio inside the slot
    const availW = slotW - PAD * 2, availH = slotH - PAD * 2;
    const scale = Math.min(availW / bb.w, availH / bb.h);
    const tw = Math.max(1, Math.round(bb.w * scale));
    const th = Math.max(1, Math.round(bb.h * scale));
    const tile = resize(keyed, bb, tw, th);
    const dx = cx * slotW + Math.floor((slotW - tw) / 2);
    const dy = cy * slotH + Math.floor((slotH - th) / 2);
    blit(tile, { x: 0, y: 0, w: tw, h: th }, atlas, dx, dy);
    uvs.push({
      index: i,
      px: { x: dx, y: dy, w: tw, h: th },
      uv: { u0: dx / atlasSize, v0: 1 - (dy + th) / atlasSize, u1: (dx + tw) / atlasSize, v1: 1 - dy / atlasSize },
      aspect: +(tw / th).toFixed(4),
    });
  });

  // dilate the packed atlas as well: tiles were resampled, so their new edges
  // need their own colour bleed before mipmapping
  dilate(atlas, 8);

  const outDir = join(ROOT, 'src', 'assets');
  mkdirSync(outDir, { recursive: true });
  const pngPath = join(outDir, `${outName}.png`);
  writeFileSync(pngPath, PNG.sync.write(atlas));

  // ---- validation ----
  const mips = mipCheck(atlas, 5);
  const base = coveredMean(atlas);
  const worst = mips.reduce((acc, m) => {
    if (!m.mean) return acc;
    const dl = (m.mean.r + m.mean.g + m.mean.b) / (base.r + base.g + base.b);
    return Math.min(acc, dl);
  }, 1);
  let opaque = 0, partial = 0, clear = 0;
  for (let i = 0; i < atlas.width * atlas.height; i++) {
    const a = atlas.data[i * 4 + 3];
    if (a > 250) opaque++; else if (a > 8) partial++; else clear++;
  }
  const meta = {
    source: srcPath,
    atlas: `${outName}.png`,
    size: atlasSize,
    tiles: uvs,
    coverage: {
      opaquePct: +(opaque / (atlasSize ** 2) * 100).toFixed(1),
      partialPct: +(partial / (atlasSize ** 2) * 100).toFixed(1),
      emptyPct: +(clear / (atlasSize ** 2) * 100).toFixed(1),
    },
    mipDarkeningWorstRatio: +worst.toFixed(3),
    mipMeans: mips,
    baseMean: base,
  };
  writeFileSync(join(outDir, `${outName}.json`), JSON.stringify(meta, null, 2));

  console.log(`\nwrote ${pngPath}`);
  console.log(`coverage: ${meta.coverage.opaquePct}% opaque, ${meta.coverage.partialPct}% partial, ${meta.coverage.emptyPct}% empty`);
  console.log('mip chain mean colour of covered pixels:');
  console.log(`  base    ${JSON.stringify(base)}`);
  for (const m of mips) console.log(`  mip ${m.level}   ${m.size.padEnd(9)} ${JSON.stringify(m.mean)}`);
  console.log(`mip darkening worst ratio: ${meta.mipDarkeningWorstRatio} (1.0 = no darkening; <0.9 would mean black halos)`);
}

main();
