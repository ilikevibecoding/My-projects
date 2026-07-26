#!/usr/bin/env node
// Fold the built bundle into dist/index.html to produce one self-contained
// HTML file: no server, no CDN, no external requests. Double-click to play.
//
// NOTE: the replacement must be a FUNCTION. The minified bundle contains "$&"
// sequences, and String.replace expands those to the matched text, which
// silently splices the original <script> tag back into the middle of the code.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(ROOT, 'dist', 'assets');
const jsName = readdirSync(assets).find((f) => f.endsWith('.js'));
if (!jsName) throw new Error('no built bundle found — run `npx vite build` first');

const js = readFileSync(join(assets, jsName), 'utf8');
let html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
html = html.replace(/<script type="module"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`);
html = html.replace(/<!-- absolute CDN URL[^>]*-->/, () => '');

const leftovers = (html.match(/https?:\/\/(cdn\.jsdelivr|raw\.githack)[^"']*/g) || []);
if (leftovers.length) throw new Error(`inlining failed, ${leftovers.length} external refs remain`);

const out = join(ROOT, 'dist', 'campsite-standalone.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1048576).toFixed(2)} MB, ${(html.match(/<script/g) || []).length} script tag)`);
