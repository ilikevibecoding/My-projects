/**
 * Optimizes raw Poly Haven glTF photoscans into lean runtime .glb files:
 *   dedup → flatten → join → weld → per-primitive simplify (foliage-aware)
 *   → webp texture compress/resize → prune → meshopt compression.
 *
 * Opaque geometry (trunks, rocks) is simplified aggressively; alpha-tested
 * foliage cards get a gentler ratio + locked borders so leaves don't dissolve.
 *
 * Usage: node scripts/optimize-assets.mjs [--only id1,id2] [--force]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join as joinMeshes,
  weld,
  prune,
  textureCompress,
  meshopt,
  simplifyPrimitive,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './asset-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw', 'models');
const OUT = join(ROOT, 'public', 'assets', 'models');

const onlyArg = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1].split(',') : null;
})();
const force = process.argv.includes('--force');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

function countTris(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (indices) tris += indices.getCount() / 3;
      else if (pos) tris += pos.getCount() / 3;
    }
  }
  return Math.round(tris);
}

async function optimizeModel(cfg) {
  const src = join(RAW, cfg.id, `${cfg.id}.gltf`);
  const dest = join(OUT, `${cfg.id}.glb`);
  if (!existsSync(src)) {
    console.log(`!! missing raw model ${cfg.id} — run fetch-assets first`);
    return null;
  }
  if (existsSync(dest) && !force) {
    console.log(`== ${cfg.id} already optimized (use --force to redo)`);
    return null;
  }

  const doc = await io.read(src);
  const trisBefore = countTris(doc);

  await doc.transform(dedup(), flatten(), joinMeshes());
  await doc.transform(weld());

  // Foliage-aware per-primitive simplification.
  const alphaRatio = cfg.alphaRatio ?? Math.min(0.5, (cfg.simplify ?? 1) * 6);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const isAlpha = mat && mat.getAlphaMode() !== 'OPAQUE';
      const ratio = isAlpha ? alphaRatio : (cfg.simplify ?? 1);
      if (ratio >= 1) continue;
      // NOTE: lockBorder=true would freeze every vertex of alpha leaf-cards
      // (cards are 100% border), so borders stay unlocked; foliage is instead
      // protected by a gentler ratio via cfg.alphaRatio.
      await simplifyPrimitive(prim, {
        simplifier: MeshoptSimplifier,
        ratio,
        error: (isAlpha ? cfg.alphaError : cfg.error) ?? cfg.error ?? 0.01,
      });
    }
  }

  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [cfg.maxTex ?? 2048, cfg.maxTex ?? 2048],
      quality: 82,
    }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );

  mkdirSync(OUT, { recursive: true });
  await io.write(dest, doc);

  const sizeMB = statSync(dest).size / 1e6;
  const trisAfter = countTris(doc);
  const flag = sizeMB > 8 ? '  ⚠ OVER 8MB BUDGET' : '';
  console.log(
    `ok ${cfg.id}: ${trisBefore.toLocaleString()} → ${trisAfter.toLocaleString()} tris, ${sizeMB.toFixed(2)} MB${flag}`
  );
  return { id: cfg.id, tris: trisAfter, sizeMB };
}

const models = onlyArg ? MODELS.filter((m) => onlyArg.includes(m.id)) : MODELS;
const results = [];
for (const cfg of models) {
  try {
    const r = await optimizeModel(cfg);
    if (r) results.push(r);
  } catch (e) {
    console.error(`FAILED ${cfg.id}: ${e.message}`);
    process.exitCode = 1;
  }
}

const total = results.reduce((s, r) => s + r.sizeMB, 0);
console.log(`\ntotal new output: ${total.toFixed(1)} MB across ${results.length} models`);
