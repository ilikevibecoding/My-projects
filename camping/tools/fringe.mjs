#!/usr/bin/env node
/**
 * Dark-fringe detector — measures black outlines in a RENDERED frame.
 *
 * The atlas builder can prove its own mip chain is clean and the game can still
 * show black rims, because fringing can be introduced anywhere downstream (a
 * render target that was never dilated, bilinear sampling against transparent
 * black, sRGB-space filtering). The only trustworthy check is the finished
 * pixels, so this looks for the actual artefact: unnaturally dark pixels
 * hugging a foliage/sky boundary.
 *
 * usage: node tools/fringe.mjs <frame.png> [--dump=out.png]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const file = process.argv[2];
const dumpArg = process.argv.find((a) => a.startsWith('--dump='));

const png = PNG.sync.read(readFileSync(file));
const { width: w, height: h, data } = png;
const lum = new Float32Array(w * h);
const isSky = new Uint8Array(w * h);

for (let i = 0; i < w * h; i++) {
  const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
  lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // sky: bright, and blue at least as strong as green (excludes lit foliage)
  isSky[i] = (lum[i] > 0.45 && b >= g * 0.98) ? 1 : 0;
}

// A fringe pixel is dark, not sky, and lies within 2 px of sky. Real foliage in
// shadow is dark too, but it does not form a thin dark line along a sky edge,
// so we also require that the pixel is much darker than the nearby foliage.
const RADIUS = 2;
let fringe = 0;
let boundary = 0;
const marks = new Uint8Array(w * h);

for (let y = RADIUS; y < h - RADIUS; y++) {
  for (let x = RADIUS; x < w - RADIUS; x++) {
    const i = y * w + x;
    if (isSky[i]) continue;
    let nearSky = false;
    for (let dy = -RADIUS; dy <= RADIUS && !nearSky; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (isSky[(y + dy) * w + (x + dx)]) { nearSky = true; break; }
      }
    }
    if (!nearSky) continue;
    boundary++;

    // local foliage brightness: non-sky pixels a little further in
    let sum = 0, n = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
        const j = yy * w + xx;
        if (isSky[j]) continue;
        sum += lum[j]; n++;
      }
    }
    const local = n ? sum / n : 0;
    // clearly darker than its own neighbourhood, and dark in absolute terms
    if (lum[i] < 0.055 && lum[i] < local * 0.5) {
      fringe++;
      marks[i] = 1;
    }
  }
}

const pct = boundary ? (fringe / boundary) * 100 : 0;
console.log(`${file}`);
console.log(`  sky/foliage boundary pixels : ${boundary}`);
console.log(`  dark fringe pixels          : ${fringe}`);
console.log(`  fringe rate                 : ${pct.toFixed(2)}% of boundary`);
console.log(`  verdict                     : ${pct < 1 ? 'CLEAN' : pct < 4 ? 'MILD FRINGING' : 'VISIBLE BLACK OUTLINES'}`);

if (dumpArg) {
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const g = Math.round(lum[i] * 255 * 0.5);
    out.data[i * 4] = marks[i] ? 255 : g;
    out.data[i * 4 + 1] = marks[i] ? 0 : g;
    out.data[i * 4 + 2] = marks[i] ? 255 : g;
    out.data[i * 4 + 3] = 255;
  }
  const p = dumpArg.split('=')[1];
  writeFileSync(p, PNG.sync.write(out));
  console.log(`  marked image -> ${p}`);
}
