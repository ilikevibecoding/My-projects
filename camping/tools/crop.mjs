#!/usr/bin/env node
// crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [inP, outP, x, y, w, h, scale = '2'] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(inP));
const X = +x, Y = +y, W = +w, H = +h, S = +scale;
const out = new PNG({ width: W * S, height: H * S });
for (let j = 0; j < H * S; j++) {
  for (let i = 0; i < W * S; i++) {
    const sx = X + Math.floor(i / S), sy = Y + Math.floor(j / S);
    const si = (sy * src.width + sx) * 4, di = (j * out.width + i) * 4;
    for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
  }
}
writeFileSync(outP, PNG.sync.write(out));
console.log('wrote', outP);
