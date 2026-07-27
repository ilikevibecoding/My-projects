/**
 * Downloads the Poly Haven shortlist (CC0) into camping-world/raw/ (gitignored).
 * Resumable: files that already exist with the right size are skipped.
 *
 * Usage: node scripts/fetch-assets.mjs [--only models|textures|hdris]
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, GROUND_TEXTURES, HDRIS } from './asset-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const API = 'https://api.polyhaven.com';

const only = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : null;
})();

let downloaded = 0;
let skipped = 0;
let bytes = 0;

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function download(url, dest, size) {
  if (existsSync(dest) && (!size || statSync(dest).size === size)) {
    skipped++;
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (size && buf.length !== size) throw new Error(`size mismatch ${buf.length} != ${size} for ${url}`);
      writeFileSync(dest, buf);
      downloaded++;
      bytes += buf.length;
      console.log(`  ↓ ${dest.replace(RAW + '/', '')} (${(buf.length / 1e6).toFixed(1)} MB)`);
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  retry ${attempt + 1}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function fetchModel({ id, res }) {
  console.log(`model ${id} @${res}`);
  const files = await fetchJson(`${API}/files/${id}`);
  const entry = files.gltf?.[res]?.gltf;
  if (!entry) throw new Error(`no gltf@${res} for ${id}`);
  const dir = join(RAW, 'models', id);
  await download(entry.url, join(dir, `${id}.gltf`), entry.size);
  for (const [relPath, info] of Object.entries(entry.include ?? {})) {
    await download(info.url, join(dir, relPath), info.size);
  }
}

async function fetchGroundTextures(id) {
  console.log(`texture set ${id} @2k`);
  const files = await fetchJson(`${API}/files/${id}`);
  const wanted = [
    ['Diffuse', 'diff'],
    ['nor_gl', 'nor_gl'],
    ['arm', 'arm'],
    ['Displacement', 'disp'],
  ];
  for (const [key, suffix] of wanted) {
    const entry = files[key]?.['2k']?.jpg ?? files[key]?.['2k']?.png;
    if (!entry) {
      console.log(`  ! ${id} missing ${key}@2k — skipping channel`);
      continue;
    }
    const ext = entry.url.split('.').pop();
    await download(entry.url, join(RAW, 'textures', id, `${id}_${suffix}_2k.${ext}`), entry.size);
  }
}

async function fetchHdri(id) {
  console.log(`hdri ${id} @4k`);
  const files = await fetchJson(`${API}/files/${id}`);
  const entry = files.hdri?.['4k']?.hdr;
  if (!entry) throw new Error(`no hdr@4k for ${id}`);
  await download(entry.url, join(RAW, 'env', `${id}_4k.hdr`), entry.size);
}

async function runPool(tasks, limit = 4) {
  const queue = [...tasks];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const task = queue.shift();
      await task();
    }
  });
  await Promise.all(workers);
}

const tasks = [];
if (!only || only === 'models') for (const m of MODELS) tasks.push(() => fetchModel(m));
if (!only || only === 'textures') for (const t of GROUND_TEXTURES) tasks.push(() => fetchGroundTextures(t));
if (!only || only === 'hdris') for (const h of HDRIS) tasks.push(() => fetchHdri(h));

const t0 = Date.now();
await runPool(tasks, 4);
console.log(
  `\ndone: ${downloaded} downloaded (${(bytes / 1e6).toFixed(0)} MB), ${skipped} already present, ${((Date.now() - t0) / 1000).toFixed(0)}s`
);
