#!/usr/bin/env node
// Magnify a region of a capture with nearest-neighbour sampling, so individual
// texels are visible. Used to inspect foliage edges for dark fringing.
//
// usage: node tools/zoom.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [, , inPath, outPath, xs, ys, ws, hs, ss] = process.argv;
const x0 = parseInt(xs, 10), y0 = parseInt(ys, 10);
const w = parseInt(ws, 10), h = parseInt(hs, 10);
const scale = parseInt(ss || '6', 10);

const src = PNG.sync.read(readFileSync(inPath));
const out = new PNG({ width: w * scale, height: h * scale });
for (let y = 0; y < h * scale; y++) {
  for (let x = 0; x < w * scale; x++) {
    const sx = Math.min(src.width - 1, x0 + Math.floor(x / scale));
    const sy = Math.min(src.height - 1, y0 + Math.floor(y / scale));
    const si = (sy * src.width + sx) * 4;
    const di = (y * (w * scale) + x) * 4;
    out.data[di] = src.data[si];
    out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2];
    out.data[di + 3] = 255;
  }
}
writeFileSync(outPath, PNG.sync.write(out));
console.log(`${outPath}  ${w}x${h} @${scale}x from (${x0},${y0}) of ${src.width}x${src.height}`);
