#!/usr/bin/env node
// diff.mjs <a.png> <b.png> -> mean abs pixel diff (0-255 scale)
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
const a = PNG.sync.read(readFileSync(process.argv[2]));
const b = PNG.sync.read(readFileSync(process.argv[3]));
let sum = 0, n = 0;
for (let i = 0; i < a.data.length; i += 4) {
  sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
  n += 3;
}
console.log('meanAbsDiff:', (sum / n).toFixed(3));
