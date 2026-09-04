// Near-field grass: a dense, streamed carpet of bent-blade tufts around the camera.
//
// The map is divided into 12 m cells. Cells inside the live radius (scaled by the
// quality preset) are scattered lazily and deterministically (seed = cell coords +
// WORLD.seed) with the same ecological rule as vegetation.js's static grass —
// canopy, trails, slope, sand, water, ruins plinth, landmarks, trunks, shore
// boulders — and cached. Whenever the camera has moved a couple of metres or the
// set of live cells changed, the live tufts are re-packed into three meshes
// (near / mid / far LOD: 7 / 6 / 3 blades, 40 / 18 / 9 triangles per tuft, with
// per-tuft jitter on the LOD thresholds so no ring is visible). Each mesh is a
// plain Mesh over an InstancedBufferGeometry:
// per-tuft data is two vec4 instance attributes (base xyz + height scale, yaw /
// two randoms / packed canopy+rank) and the whole transform, the wind and the
// camera push are applied analytically in the vertex stage — no instance matrices,
// no vertex-stage texture reads.
//
// Blades: quadratic-Bezier strips that arc outward and droop, tapering to a point,
// twisted along their length, so a tuft has a real silhouette from every angle.
// The material samples the terrain's own grass albedo (fragment stage, same world
// uv scale as terrain.js) into the blade roots so the tufts read as the lawn
// standing up rather than props placed on it.

import * as THREE from 'three/webgpu';
import {
  time,
  positionGeometry,
  positionWorld,
  positionView,
  normalGeometry,
  cameraPosition,
  cameraNormalMatrix,
  attribute,
  uv,
  texture,
  uniform,
  vec2,
  vec3,
  float,
  sin,
  cos,
  mix,
  smoothstep,
  dot,
  cross,
  step,
  sign,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, createFbm2D, smoothstep as sstep, clamp as clampJs, lerp } from './noise.js';

const TAU = Math.PI * 2;
const WIND_HEADING = 0.7; // same dominant direction as vegetation.js

// Where the streamed disc dissolves (metres from the camera; follows the quality
// preset). Other modules can fade their own far grass IN over the same range
// (`smoothstep(GRASS_DISC_FADE.start, GRASS_DISC_FADE.end, dist)`) so the two
// systems hand over instead of overlapping.
export const GRASS_DISC_FADE = { start: uniform(42), end: uniform(52) };
// vegetation.js puts small ground cover on layer 1 so the water's planar
// reflection can skip it; the grass belongs there too.
const GROUND_COVER_LAYER = 1;

const CELL = 12; // m
const MAX_DENSITY = 9; // candidate tufts per m² before the ecological weighting
const CANDIDATE_K = Math.ceil(Math.sqrt(CELL * CELL * MAX_DENSITY)); // stratified k×k grid per cell
const CACHE_MAX = 220; // cells kept alive (≈ 30 KB each)
const REFILL_MOVE = 2.0; // m the camera may move before the live set is re-packed
const BUILD_BUDGET_MS = 5; // per frame, once the initial burst is done
const CAPACITY = [16000, 30000, 46000]; // tufts per LOD mesh
const ATLAS_COLUMNS = 5; // 4 blade variants + seed head
const TUFT_STRIDE = 8; // floats per cached tuft: x, y, z, hScale, yaw, rnd1, rnd2, canopy

// =====================================================================
// procedural blade atlas
// =====================================================================
// 5 columns × 128 px: four blade variants (two healthy greens, a sun-bleached
// yellow-green, a dead tan blade) and a seed head. Straight alpha with a soft
// tapered edge; the RGB stays blade-coloured under the transparent pixels so
// mipmaps never bleed dark halos into the edges.
function createBladeAtlas(seed = 4242) {
  const COL = 128;
  const W = COL * ATLAS_COLUMNS;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c2 = canvas.getContext('2d');
  const img = c2.createImageData(W, H);
  const d = img.data;
  const rng = mulberry32(seed);

  const variants = [
    { root: [56, 90, 32], mid: [98, 150, 56], tip: [150, 184, 92], vein: 1.2, scorch: 0.18 },
    { root: [48, 80, 36], mid: [82, 136, 60], tip: [122, 172, 92], vein: 1.16, scorch: 0.1 },
    { root: [70, 98, 36], mid: [132, 162, 64], tip: [178, 186, 104], vein: 1.12, scorch: 0.45 },
    { root: [100, 86, 46], mid: [166, 142, 76], tip: [204, 180, 114], vein: 1.06, scorch: 0 },
  ];
  const scorchColor = [150, 118, 58];

  for (let k = 0; k < 4; k += 1) {
    const v = variants[k];
    // longitudinal streaks: smooth random brightness per texel column
    const streak = new Float32Array(COL);
    let acc = 0;
    for (let x = 0; x < COL; x += 1) {
      acc = acc * 0.72 + (rng() - 0.5) * 0.28;
      streak[x] = acc * 0.5;
    }
    for (let y = 0; y < H; y += 1) {
      const t = 1 - y / (H - 1); // 0 root (bottom) → 1 tip (top)
      // the geometry carries the taper; the texture only softens the very edge
      // so heavy minification keeps the column's alpha high (no vanishing blades)
      const hw = (0.94 - 0.16 * t) * (COL / 2);
      const seg = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
      const a0 = t < 0.5 ? v.root : v.mid;
      const a1 = t < 0.5 ? v.mid : v.tip;
      const scorch = sstep(0.84, 1.0, t) * v.scorch;
      for (let x = 0; x < COL; x += 1) {
        const dx = Math.abs(x + 0.5 - COL / 2) / hw;
        let alpha = 1 - sstep(0.8, 1.0, dx);
        alpha *= 1 - sstep(0.96, 1.0, t) * 0.5;
        let r = lerp(a0[0], a1[0], seg);
        let g = lerp(a0[1], a1[1], seg);
        let b = lerp(a0[2], a1[2], seg);
        // central vein (lighter) and two soft darker ribs either side
        const vein = 1 + (v.vein - 1) * (1 - sstep(0.04, 0.2, dx));
        const rib = 1 - 0.09 * Math.exp(-((dx - 0.52) * (dx - 0.52)) / 0.012);
        // folded cross-section: one half of the blade catches more light than the
        // other, and the very edges roll away dark
        const fold = 1 + 0.11 * ((x + 0.5 - COL / 2) / hw);
        const shade = (vein * rib * fold * (1 + streak[x])) * (0.86 + 0.14 * (1 - dx));
        r *= shade;
        g *= shade;
        b *= shade;
        r = lerp(r, scorchColor[0], scorch);
        g = lerp(g, scorchColor[1], scorch);
        b = lerp(b, scorchColor[2], scorch);
        if (k === 3) {
          // dead blade: fine transverse banding + speckle
          const band = 1 + 0.06 * Math.sin(y * 0.9 + streak[x] * 40);
          r *= band;
          g *= band;
          b *= band;
        }
        const o = (y * W + k * COL + x) * 4;
        d[o] = Math.max(0, Math.min(255, r));
        d[o + 1] = Math.max(0, Math.min(255, g));
        d[o + 2] = Math.max(0, Math.min(255, b));
        d[o + 3] = Math.round(alpha * 255);
      }
    }
  }

  // seed head (column 4): a slim bristly spike on a thin stem
  {
    const x0 = 4 * COL;
    const cx = COL / 2;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < COL; x += 1) {
        const px = x + 0.5 - cx;
        const py = y + 0.5;
        // stem
        let alpha = 0;
        let r = 128;
        let g = 124;
        let b = 66;
        if (py > 150) {
          alpha = 1 - sstep(2.0, 4.0, Math.abs(px));
        }
        // head: elongated ellipse centred at y=90, ry=68, rx=16 with a ragged edge
        const ry = 68;
        const rx = 15 + 5 * Math.sin(py * 0.45) * Math.sin(py * 0.13 + 1.3);
        const q = (px * px) / (rx * rx) + ((py - 90) * (py - 90)) / (ry * ry);
        if (q < 1.25) {
          const edge = 1 - sstep(0.8, 1.2, q);
          if (edge > alpha) {
            alpha = edge;
            const grain = Math.sin(px * 1.7 + py * 2.3) * Math.sin(py * 0.9 - px * 0.6);
            const dark = grain > 0.35 ? 0.72 : 1;
            r = 184 * dark;
            g = 160 * dark;
            b = 98 * dark;
            // lit from above: top a little lighter
            const lift = 1 + 0.12 * (1 - py / 180);
            r *= lift;
            g *= lift;
            b *= lift;
          }
        }
        const o = (y * W + x0 + x) * 4;
        d[o] = Math.min(255, r);
        d[o + 1] = Math.min(255, g);
        d[o + 2] = Math.min(255, b);
        d[o + 3] = Math.round(alpha * 255);
      }
    }
  }

  c2.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// =====================================================================
// tuft geometry
// =====================================================================
// One tuft = `blades` Bezier strips fanned around the pivot (unit height ≈ 1;
// the per-instance height scale brings them to 0.2–0.75 m). Each blade carries:
//   position / normal / uv (u spans its atlas column, v = 0 root → 1 tip)
//   side  vec3: offset from the blade centreline to this vertex (for the
//               distance-dependent width boost in the vertex stage)
//   blade vec2: (per-blade random, isSeedHead)
function buildTuft({ blades, rows, seed, wide = 1, spike = false, lengths = [0.62, 1.0] }) {
  const rng = mulberry32(seed);
  const positions = [];
  const normals = [];
  const uvs = [];
  const sides = [];
  const info = [];
  const indices = [];
  let vertexCount = 0;
  const tRows = rows >= 3 ? [0, 0.42, 0.76, 1] : [0, 0.58, 1];

  const pickVariant = (r) => (r < 0.44 ? 0 : r < 0.78 ? 1 : r < 0.9 ? 2 : 3);

  function addBlade({ yaw, r0, L, bend, droop, w0, twist, variant, isSpike, bladeRand, rowsT }) {
    const ox = Math.sin(yaw);
    const oz = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    const bx = ox * r0;
    const bz = oz * r0;
    // Bezier in the (outward, up) plane
    const p1o = bend * 0.2;
    const p1y = L * 0.6;
    const p2o = bend;
    const p2y = L * (1 - droop);
    const base = vertexCount;
    const nRows = rowsT.length;
    const u0 = variant / ATLAS_COLUMNS;
    const u1 = (variant + 1) / ATLAS_COLUMNS;
    let tip = null;
    for (let r = 0; r < nRows; r += 1) {
      const t = rowsT[r];
      const mt = 1 - t;
      const Bo = 2 * mt * t * p1o + t * t * p2o;
      const By = 2 * mt * t * p1y + t * t * p2y;
      const dBo = 2 * mt * p1o + 2 * t * (p2o - p1o);
      const dBy = 2 * mt * p1y + 2 * t * (p2y - p1y);
      // tangent (3D)
      let tx = ox * dBo;
      let ty = dBy;
      let tz = oz * dBo;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // untwisted face normal = cross(side, tangent), side = (sx, 0, sz)
      let n0x = -sz * ty;
      let n0y = sz * tx - sx * tz;
      let n0z = sx * ty;
      const nl = Math.hypot(n0x, n0y, n0z) || 1;
      n0x /= nl;
      n0y /= nl;
      n0z /= nl;
      const a = twist * t;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // twisted across axis and its face normal
      const ax = ca * sx + sa * n0x;
      const ay = sa * n0y;
      const az = ca * sz + sa * n0z;
      let nx = ay * tz - az * ty;
      let ny = az * tx - ax * tz;
      let nz = ax * ty - ay * tx;
      const nnl = Math.hypot(nx, ny, nz) || 1;
      nx /= nnl;
      ny /= nnl;
      nz /= nnl;
      const cx = bx + ox * Bo;
      const cy = By;
      const cz = bz + oz * Bo;
      const w = w0 * (1 - sstep(0.3, 1.0, t));
      if (r === nRows - 1) {
        positions.push(cx, cy, cz);
        normals.push(nx, ny, nz);
        uvs.push((u0 + u1) * 0.5, t);
        sides.push(0, 0, 0);
        info.push(bladeRand, isSpike);
        vertexCount += 1;
        tip = { x: cx, y: cy, z: cz, tx, ty, tz, sx, sz, ox, oz };
      } else {
        const hx = ax * w * 0.5;
        const hy = ay * w * 0.5;
        const hz = az * w * 0.5;
        positions.push(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz);
        // edge normals roll outward so the strip shades like a rounded blade
        // rather than a flat card (≈ 30° tilt at the edges, smooth across)
        const roll = 0.58;
        const lx = nx - ax * roll;
        const ly = ny - ay * roll;
        const lz = nz - az * roll;
        const rx = nx + ax * roll;
        const ry = ny + ay * roll;
        const rz = nz + az * roll;
        const ll = Math.hypot(lx, ly, lz) || 1;
        const rl = Math.hypot(rx, ry, rz) || 1;
        normals.push(lx / ll, ly / ll, lz / ll, rx / rl, ry / rl, rz / rl);
        uvs.push(u0, t, u1, t);
        sides.push(-hx, -hy, -hz, hx, hy, hz);
        info.push(bladeRand, isSpike, bladeRand, isSpike);
        vertexCount += 2;
      }
    }
    for (let r = 0; r < nRows - 2; r += 1) {
      const a0 = base + r * 2;
      const a1 = a0 + 1;
      const b0 = a0 + 2;
      const b1 = a0 + 3;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
    const last = base + (nRows - 2) * 2;
    indices.push(last, last + 1, base + (nRows - 1) * 2);
    return tip;
  }

  for (let i = 0; i < blades; i += 1) {
    const yaw = (i / blades) * TAU + (rng() - 0.5) * 0.9;
    const bendN = rng();
    const L = lerp(lengths[0], lengths[1], rng());
    addBlade({
      yaw,
      r0: 0.02 + rng() * 0.08,
      L,
      bend: (0.18 + 0.55 * bendN) * L,
      droop: 0.04 + 0.28 * bendN * bendN,
      w0: (0.065 + 0.05 * rng()) * wide,
      twist: (rng() - 0.5) * 1.4,
      variant: pickVariant(rng()),
      isSpike: 0,
      bladeRand: rng(),
      rowsT: tRows,
    });
  }

  if (spike) {
    const yaw = rng() * TAU;
    const tip = addBlade({
      yaw,
      r0: 0.015,
      L: 1.22,
      bend: 0.14,
      droop: 0.02,
      w0: 0.022,
      twist: 0,
      variant: 3,
      isSpike: 1,
      bladeRand: rng(),
      rowsT: [0, 0.6, 1],
    });
    // seed head card at the spike tip, facing outward along the blade
    const hw = 0.05;
    const hh = 0.24;
    const base = vertexCount;
    const yb = tip.y - 0.04;
    positions.push(
      tip.x - tip.sx * hw, yb, tip.z - tip.sz * hw,
      tip.x + tip.sx * hw, yb, tip.z + tip.sz * hw,
      tip.x + tip.sx * hw, yb + hh, tip.z + tip.sz * hw,
      tip.x - tip.sx * hw, yb + hh, tip.z - tip.sz * hw
    );
    for (let k = 0; k < 4; k += 1) normals.push(tip.ox, 0, tip.oz);
    const u0 = 4 / ATLAS_COLUMNS;
    const u1 = 1;
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    sides.push(-tip.sx * hw, 0, -tip.sz * hw, tip.sx * hw, 0, tip.sz * hw, tip.sx * hw, 0, tip.sz * hw, -tip.sx * hw, 0, -tip.sz * hw);
    const br = rng();
    info.push(br, 1, br, 1, br, 1, br, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertexCount += 4;
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 3));
  geometry.setAttribute('blade', new THREE.Float32BufferAttribute(info, 2));
  geometry.setIndex(indices);
  return geometry;
}

// =====================================================================
// TSL helpers
// =====================================================================
function hueRotate(color, angle) {
  const k = vec3(0.57735, 0.57735, 0.57735);
  const c = cos(angle);
  const s = sin(angle);
  return color.mul(c).add(cross(k, color).mul(s)).add(k.mul(dot(k, color)).mul(float(1).sub(c)));
}

// Same gust front as vegetation.js so the grass breathes with the trees.
function gustEnvelope(wx, wz) {
  const front = sin(time.mul(0.27).sub(wx.mul(0.019)).sub(wz.mul(0.012)));
  const ripple = sin(time.mul(0.83).add(wx.mul(0.041)).add(wz.mul(0.023)).add(1.7));
  return smoothstep(-1.0, 1.2, front.add(ripple.mul(0.45))).mul(0.85).add(0.15);
}

// =====================================================================
// the grass system
// =====================================================================
export function createGrass(ctx) {
  const { scene, terrain, textures } = ctx;
  const t0 = performance.now();
  const half = WORLD.size / 2 - 3;
  ctx.camera?.layers.enable(GROUND_COVER_LAYER);

  // ---------- exact rendered terrain height (reads the terrain mesh grid) ----------
  const ground = (() => {
    const mesh = terrain?.mesh;
    const pos = mesh?.geometry?.attributes?.position;
    const segs = WORLD.terrainSegments;
    const n = segs + 1;
    const size = WORLD.size;
    const h2 = size / 2;
    const stepM = size / segs;
    let ok = Boolean(pos) && pos.count === n * n && pos.itemSize === 3;
    if (ok) {
      mesh.updateMatrixWorld(true);
      const e = mesh.matrixWorld.elements;
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].every((v, i) => Math.abs(e[i] - v) < 1e-6);
      ok = identity
        && Math.abs(pos.getX(0) + h2) < 1e-3 && Math.abs(pos.getZ(0) + h2) < 1e-3
        && Math.abs(pos.getX(n - 1) - h2) < 1e-3 && Math.abs(pos.getZ(n * n - 1) - h2) < 1e-3;
    }
    if (!ok) {
      const tmp = new THREE.Vector3();
      return {
        exact: false,
        height: (x, z) => terrain.sampleHeight(x, z),
        normalY: (x, z) => terrain.sampleNormal(x, z, tmp).y,
      };
    }
    const arr = pos.array;
    function height(x, z) {
      const gx = clampJs((x + h2) / stepM, 0, n - 1.0001);
      const gz = clampJs((z + h2) / stepM, 0, n - 1.0001);
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      const fx = gx - ix;
      const fz = gz - iz;
      const a = arr[(iz * n + ix) * 3 + 1];
      const d = arr[(iz * n + ix + 1) * 3 + 1];
      const b = arr[((iz + 1) * n + ix) * 3 + 1];
      const c = arr[((iz + 1) * n + ix + 1) * 3 + 1];
      // PlaneGeometry splits each quad along the (ix, iz+1)–(ix+1, iz) diagonal
      if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
      return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
    }
    function normalY(x, z) {
      const e = stepM;
      const dx = height(x - e, z) - height(x + e, z);
      const dz = height(x, z - e) - height(x, z + e);
      return (2 * e) / Math.sqrt(dx * dx + dz * dz + 4 * e * e);
    }
    return { exact: true, height, normalY };
  })();

  // ---------- canopy from the terrain's baked control map (free) ----------
  const canopyAt = (() => {
    const img = terrain?.controlTexture?.image;
    const data = img?.data;
    if (!data || !img.width) {
      return (x, z) => terrain.canopyDensity(x, z);
    }
    const w = img.width;
    const h = img.height;
    return (x, z) => {
      const gx = clampJs((x / WORLD.size + 0.5) * (w - 1), 0, w - 1.0001);
      const gz = clampJs((z / WORLD.size + 0.5) * (h - 1), 0, h - 1.0001);
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      const fx = gx - ix;
      const fz = gz - iz;
      const a = data[(iz * w + ix) * 4 + 1];
      const b = data[(iz * w + ix + 1) * 4 + 1];
      const c = data[((iz + 1) * w + ix) * 4 + 1];
      const dd = data[((iz + 1) * w + ix + 1) * 4 + 1];
      return lerp(lerp(a, b, fx), lerp(c, dd, fx), fz) / 255;
    };
  })();

  // ---------- keep-out: trunks (vegetation) + shore boulders (water, late) ----------
  const keepCell = 4;
  const keepMap = new Map();
  const keepKey = (ix, iz) => (ix + 2048) * 8192 + (iz + 2048);
  function keepInsert(x, z, r) {
    const k = keepKey(Math.floor(x / keepCell), Math.floor(z / keepCell));
    let bucket = keepMap.get(k);
    if (!bucket) keepMap.set(k, (bucket = []));
    bucket.push(x, z, r);
  }
  function keepBlocked(x, z) {
    const ix = Math.floor(x / keepCell);
    const iz = Math.floor(z / keepCell);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = keepMap.get(keepKey(ix + dx, iz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 3) {
          const ddx = bucket[i] - x;
          const ddz = bucket[i + 1] - z;
          const r = bucket[i + 2];
          if (ddx * ddx + ddz * ddz < r * r) return true;
        }
      }
    }
    return false;
  }
  const TRUNK_RADIUS = {
    'emergent-trunks': 1.7,
    'canopy-trunks': 0.95,
    'understory-trunks': 0.28,
    'palm-trunks': 0.38,
    'fan-palm-trunks': 0.22,
    'bamboo-culms': 0.12,
    'tree-fern-trunks': 0.28,
  };
  let trunkCount = 0;
  for (const mesh of ctx.vegetation?.meshes ?? []) {
    const base = TRUNK_RADIUS[mesh.name];
    if (!base || !mesh.isInstancedMesh) continue;
    const arr = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.instanceMatrix.count; i += 1) {
      const o = i * 16;
      const s = Math.hypot(arr[o], arr[o + 1], arr[o + 2]);
      if (s < 1e-3) continue;
      keepInsert(arr[o + 12], arr[o + 14], base * s + 0.06);
      trunkCount += 1;
    }
  }
  let rocksAdded = false;
  function addShoreRocks() {
    const spots = ctx.water?.rockSpots;
    if (!spots) return false;
    for (const r of spots) {
      keepInsert(r.x, r.z, (r.s ?? 1) * 0.95 + 0.05);
    }
    rocksAdded = true;
    return spots.length > 0;
  }

  // ---------- ecological rule ----------
  const clumpA = createFbm2D(WORLD.seed + 771, { octaves: 2 }); // same field as the static grass
  const clumpFine = createFbm2D(WORLD.seed + 775, { octaves: 2 });
  const trailHW = WORLD.trailHalfWidth;
  const landmarkHeight = ctx.landmarks?.heightAt ?? null;

  // returns [weight, height, canopy, clearing]
  const ruleOut = [0, 0, 0, 0];
  function rule(x, z) {
    ruleOut[0] = 0;
    const h = ground.height(x, z);
    if (h < 0.6) return ruleOut;
    const ny = ground.normalY(x, z);
    if (ny < 0.72) return ruleOut;
    const trail = terrain.trailDistance(x, z);
    if (trail < trailHW + 0.3) return ruleOut;
    const zone = terrain.zonesAt(x, z);
    if (zone.ruins > 0.85) return ruleOut;
    const canopy = canopyAt(x, z);
    let w = 1 - canopy * 0.6;
    w *= 0.5 + 0.5 * sstep(-0.4, 0.4, clumpA(x * 0.11, z * 0.11));
    w *= 0.7 + 0.3 * sstep(-0.3, 0.35, clumpFine(x * 0.37, z * 0.37));
    // the terrain shader turns to bare rock over slope 0.16..0.4
    w *= 1 - sstep(0.16, 0.34, 1 - ny);
    w *= 1 + zone.clearing * 0.5;
    w *= 1 - zone.ravine * 0.5;
    w *= 1 - zone.rim * 0.45;
    // trampled fringe beside the path
    w *= 0.35 + 0.65 * sstep(trailHW + 0.3, trailHW + 2.2, trail);
    // sand: same mask as terrain.js
    const water = terrain.waterProximity(x, z);
    if (water > 0.05) {
      w *= 1 - (1 - sstep(0.55, 1.9, h)) * water * 0.92;
    }
    ruleOut[0] = Math.min(1, w);
    ruleOut[1] = h;
    ruleOut[2] = canopy;
    ruleOut[3] = zone.clearing;
    return ruleOut;
  }

  // ---------- cell cache ----------
  const cells = new Map();
  let frame = 0;
  const cellKey = (cx, cz) => `${cx},${cz}`;

  function buildCell(cx, cz) {
    const tb = performance.now();
    const rng = mulberry32((WORLD.seed * 7919 + cx * 73856093 + cz * 19349663) >>> 0);
    const k = CANDIDATE_K;
    const n = k * k;
    const stepM = CELL / k;
    const x0 = cx * CELL;
    const z0 = cz * CELL;
    // stratified grid visited in a shuffled order so truncating the list thins
    // the cell uniformly (density presets, distance thinning)
    const order = new Uint16Array(n);
    for (let i = 0; i < n; i += 1) order[i] = i;
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const data = new Float32Array(n * TUFT_STRIDE);
    let count = 0;
    for (let q = 0; q < n; q += 1) {
      const j = order[q];
      const gx = j % k;
      const gz = (j - gx) / k;
      const x = x0 + (gx + rng()) * stepM;
      const z = z0 + (gz + rng()) * stepM;
      const rAccept = rng();
      const rHeight = rng();
      const rnd1 = rng();
      const rnd2 = rng();
      const yaw = rng() * TAU;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const out = rule(x, z);
      const w = out[0];
      if (w <= 0 || rAccept > w) continue;
      const h = out[1];
      if (landmarkHeight) {
        const lh = landmarkHeight(x, z);
        if (Number.isFinite(lh) && lh > h - 0.35) continue;
      }
      if (keepBlocked(x, z)) continue;
      const canopy = out[2];
      // more short than tall (blade length 0.62–1 × this → 0.22–0.75 m); the
      // meadow grows a little taller, the deep shade shorter
      let hs = 0.36 + 0.4 * rHeight * rHeight;
      hs *= 1 + out[3] * 0.15;
      hs *= 1 - canopy * 0.2;
      const o = count * TUFT_STRIDE;
      data[o] = x;
      data[o + 1] = h - 0.035;
      data[o + 2] = z;
      data[o + 3] = hs;
      data[o + 4] = yaw;
      data[o + 5] = rnd1;
      data[o + 6] = rnd2;
      data[o + 7] = canopy;
      count += 1;
    }
    const cell = {
      cx,
      cz,
      x0,
      z0,
      x1: x0 + CELL,
      z1: z0 + CELL,
      count,
      data: count === n ? data : data.slice(0, count * TUFT_STRIDE),
      lastUsed: frame,
    };
    stats.buildMs += performance.now() - tb;
    stats.cellsBuilt += 1;
    return cell;
  }

  // ---------- geometry / material ----------
  const atlas = createBladeAtlas();
  const geometries = [
    buildTuft({ blades: 7, rows: 3, seed: WORLD.seed + 901, spike: true }),
    buildTuft({ blades: 6, rows: 2, seed: WORLD.seed + 902, wide: 1.45 }),
    buildTuft({ blades: 3, rows: 2, seed: WORLD.seed + 903, wide: 2.2, lengths: [0.72, 1.0] }),
  ];
  const triPerTuft = geometries.map((g) => g.index.count / 3);

  const uRadius = uniform(54);
  const uNearFull = uniform(18);
  const uThinMin = uniform(0.3);
  const uFadeStart = GRASS_DISC_FADE.start;
  const uFadeEnd = GRASS_DISC_FADE.end;
  const uSunDir = uniform(new THREE.Vector3(0.3, 0.9, 0.3));

  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
    roughness: 0.62, // waxy sheen at grazing angles
    metalness: 0,
    alphaTest: 0.36,
  });
  material.name = 'near-grass';
  {
    const iBase = attribute('iBase', 'vec4'); // x, y, z, height scale
    const iParam = attribute('iParam', 'vec4'); // yaw, rnd1, rnd2, floor(canopy*255) + rank
    const side = attribute('side', 'vec3');
    const bladeInfo = attribute('blade', 'vec2');
    const t = uv().y;
    const yaw = iParam.x;
    const rnd1 = iParam.y;
    const rnd2 = iParam.z;
    const canopy = iParam.w.floor().div(255);
    const rank = iParam.w.fract();
    const hScale = iBase.w;
    const wScale = rnd2.mul(0.35).add(0.85);
    const base = iBase.xyz;
    const cy = cos(yaw);
    const sy = sin(yaw);

    // ---- vertex: transform + width boost + spike toggle + wind + camera push ----
    const tuftDist = base.sub(cameraPosition).length().toVarying('vTuftDist');
    // blades widen with distance so minified tufts keep their coverage instead
    // of thinning to nothing (the far LODs are already wider in the geometry)
    const widthBoost = smoothstep(6.0, 48.0, tuftDist).mul(1.7).add(1.0);
    const spikeOn = step(0.66, rnd2);
    const keep = mix(float(1), spikeOn, bladeInfo.y);
    let p = positionGeometry.sub(side).add(side.mul(widthBoost)).mul(keep);
    p = vec3(p.x.mul(wScale), p.y.mul(hScale), p.z.mul(wScale));
    const pr = vec3(p.x.mul(cy).add(p.z.mul(sy)), p.y, p.z.mul(cy).sub(p.x.mul(sy)));

    const env = gustEnvelope(base.x, base.z);
    const phase = base.x.mul(0.13).add(base.z.mul(0.1)).add(rnd1.mul(TAU));
    const tm = time.mul(1.7).add(phase);
    const gust = sin(tm).add(sin(tm.mul(1.83).add(1.3)).mul(0.5)).add(sin(tm.mul(3.4).add(2.2)).mul(0.25));
    // bending grows with height² so roots stay planted; tall tufts swing more
    const heightF = t.mul(t).mul(hScale);
    const sway = gust.mul(0.17).mul(env).mul(heightF);
    const dir = float(WIND_HEADING).add(rnd1.sub(0.5).mul(0.7));
    const flutter = sin(time.mul(6.3).add(phase.mul(2.3)).add(bladeInfo.x.mul(TAU)).add(t.mul(3.0)))
      .mul(0.03)
      .mul(heightF)
      .mul(env.mul(0.7).add(0.3));
    const toCam = base.xz.sub(cameraPosition.xz);
    const dCam = toCam.length();
    const push = smoothstep(0.25, 1.5, dCam).oneMinus().mul(0.45).mul(t.mul(t));
    const pushDir = toCam.div(dCam.max(0.02));
    const offset = vec3(
      sway.mul(cos(dir)).add(flutter.mul(cos(dir.add(1.5708)))).add(pushDir.x.mul(push)),
      sway.abs().mul(-0.3).sub(push.mul(0.35)),
      sway.mul(sin(dir)).add(flutter.mul(sin(dir.add(1.5708)))).add(pushDir.y.mul(push))
    );
    material.positionNode = base.add(pr).add(offset);

    // ---- normal: rounded blade normal (yawed) flipped toward the viewer, softened toward up ----
    // The geometry normals roll across each blade, so neighbouring blades and
    // the two halves of one blade take different light; the up-blend keeps the
    // carpet lit like the lawn it grows from.
    const ng = normalGeometry;
    const nWorld = vec3(ng.x.mul(cy).add(ng.z.mul(sy)), ng.y, ng.z.mul(cy).sub(ng.x.mul(sy)));
    let nView = cameraNormalMatrix.mul(nWorld).normalize();
    nView = nView.mul(sign(dot(nView, positionView.negate())));
    const upView = cameraNormalMatrix.mul(vec3(0, 1, 0)).normalize();
    material.normalNode = mix(nView, upView, 0.5).normalize();

    // ---- colour ----
    const tex = texture(atlas, uv());
    const gxz = positionWorld.xz;
    // the terrain's grass albedo at the same world scale (terrain.js: worldXZ*0.12, far octave 0.021)
    const g1 = texture(textures.grass, gxz.mul(0.12)).rgb;
    const g2 = texture(textures.grass, gxz.mul(0.021).add(0.37)).rgb;
    const mottle = texture(textures.noise, gxz.mul(0.012)).r;
    const groundAlbedo = mix(g1, g2, 0.35).mul(mix(float(0.8), float(1.12), mottle));

    // per-tuft hue / value spread, then a per-blade value spread so the blades
    // inside one tuft separate from each other
    let col = hueRotate(tex.rgb, rnd1.sub(0.5).mul(0.22)).mul(mix(float(0.78), float(1.2), rnd2));
    col = col.mul(mix(float(0.8), float(1.14), bladeInfo.x));
    // roots take the ground tone so the blades grow out of the lawn, and every
    // blade leans a little toward the local lawn colour so a sunlit tuft never
    // turns neon against the turf it stands in
    const rootMix = smoothstep(0.02, 0.5, t).oneMinus();
    col = mix(col, groundAlbedo, rootMix.mul(0.6).add(0.18));
    // the lawn's large-scale tonal patches continue up the blades
    col = col.mul(mix(float(0.8), float(1.12), mottle));
    // canopy shade (terrain.js darkens by canopy*0.2) with a cool, damp cast under the trees
    col = col.mul(mix(vec3(1.0, 1.0, 1.0), vec3(0.76, 0.84, 0.88), canopy));
    // self-occlusion in the clump (kept gentle: cast shadow + GTAO already darken the roots)
    col = col.mul(mix(float(0.62), float(1.0), smoothstep(0.0, 0.5, t)));
    // with distance the tufts converge on the lawn colour, so the far edge of
    // the streamed disc and the terrain beyond it are one continuous surface
    col = mix(col, groundAlbedo.mul(1.04), smoothstep(14.0, 50.0, tuftDist).mul(0.45));
    material.colorNode = col;

    // ---- alpha: soft texture edge, far alpha-test relief, stochastic distance dissolve, rank thinning ----
    const dissolveAt = mix(uFadeStart, uFadeEnd, rnd1);
    const dissolve = smoothstep(dissolveAt.sub(3.0), dissolveAt, tuftDist);
    const thinF = float(1).sub(float(1).sub(uThinMin).mul(smoothstep(uNearFull, uRadius, tuftDist)));
    const rankFade = smoothstep(thinF.sub(0.12), thinF, rank);
    const farRelief = smoothstep(8.0, 40.0, tuftDist).mul(0.16); // keeps minified thin blades from vanishing
    material.opacityNode = tex.a.add(farRelief).mul(float(1).sub(dissolve.max(rankFade)));

    // ---- back-lit translucency toward the sun (tips only) ----
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    // (no direct sun reaches the floor under a closed canopy, so no glow there)
    const backlight = viewDir.dot(uSunDir).negate().clamp(0, 1).pow(3).mul(canopy.mul(0.85).oneMinus());
    material.emissiveNode = col.mul(vec3(0.7, 0.9, 0.4)).mul(backlight.mul(0.38)).mul(smoothstep(0.15, 0.9, t));
  }

  // ---------- meshes ----------
  const meshes = [];
  const baseAttrs = [];
  const paramAttrs = [];
  for (let lod = 0; lod < 3; lod += 1) {
    const geo = geometries[lod];
    const cap = CAPACITY[lod];
    const baseAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const paramAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    baseAttr.setUsage(THREE.DynamicDrawUsage);
    paramAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iBase', baseAttr);
    geo.setAttribute('iParam', paramAttr);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), WORLD.size);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `near-grass-lod${lod}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.layers.set(GROUND_COVER_LAYER);
    scene.add(mesh);
    meshes.push(mesh);
    baseAttrs.push(baseAttr);
    paramAttrs.push(paramAttr);
  }

  // ---------- streaming state ----------
  const stats = {
    instances: 0,
    perLod: [0, 0, 0],
    triangles: 0,
    drawCalls: 0,
    liveCells: 0,
    cachedCells: 0,
    pendingCells: 0,
    cellsBuilt: 0,
    buildMs: 0,
    refills: 0,
    lastRefillMs: 0,
    overflow: 0,
    radius: 0,
    density: 0,
    exactHeights: ground.exact,
    trunks: trunkCount,
    cullFrustum: true, // testing hook: false packs the whole disc as before
    culledCells: 0,
  };
  let densityScale = 0.8;
  let lodDist = [16, 33];
  let liveRadius = 54;
  let lastRefillX = Infinity;
  let lastRefillZ = Infinity;
  let lastCamX = Infinity;
  let lastCamZ = Infinity;
  let dirty = true;
  let initialised = false;
  const live = [];
  const counts = [0, 0, 0];

  const thinFactor = (d) => 1 - (1 - uThinMin.value) * sstep(uNearFull.value, uRadius.value, d);

  // View culling of the live disc. The grass is on the ground-cover layer (the
  // water's mirror camera never draws it) and casts no shadow, so only the main
  // camera can see a tuft: cells outside a widened main frustum are left out
  // of the packed buffers. The margin (extra half-angle + tuft reach) covers
  // wind, the camera push and small turns; a larger turn triggers a refill.
  const FRUSTUM_MARGIN_DEG = 7;
  const TUFT_REACH = 2.5; // metres a blade tip can reach beyond the cell footprint
  const REFILL_TURN = Math.cos((2.5 * Math.PI) / 180);
  const cullFrustum = new THREE.Frustum();
  const cullMatrix = new THREE.Matrix4();
  const cullCamera = new THREE.PerspectiveCamera();
  const cullBox = new THREE.Box3();
  const camDir = new THREE.Vector3();
  const lastDir = new THREE.Vector3(NaN, NaN, NaN);
  function updateCullFrustum(camera) {
    cullCamera.fov = Math.min(170, camera.fov + FRUSTUM_MARGIN_DEG * 2);
    cullCamera.aspect = camera.aspect;
    cullCamera.near = camera.near;
    cullCamera.far = camera.far;
    cullCamera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    cullMatrix.copy(camera.matrixWorld).invert().premultiply(cullCamera.projectionMatrix);
    cullFrustum.setFromProjectionMatrix(cullMatrix);
  }
  function cellVisible(cell) {
    if (cell.yMin === undefined) {
      let yMin = Infinity;
      let yMax = -Infinity;
      const data = cell.data;
      for (let i = 0; i < cell.count; i += 1) {
        const y = data[i * TUFT_STRIDE + 1];
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
      cell.yMin = yMin === Infinity ? 0 : yMin;
      cell.yMax = yMax === -Infinity ? 0 : yMax;
    }
    cullBox.min.set(cell.x0 - TUFT_REACH, cell.yMin - TUFT_REACH, cell.z0 - TUFT_REACH);
    cullBox.max.set(cell.x1 + TUFT_REACH, cell.yMax + TUFT_REACH, cell.z1 + TUFT_REACH);
    return cullFrustum.intersectsBox(cullBox);
  }

  function refill(camX, camZ) {
    const tr = performance.now();
    counts[0] = 0;
    counts[1] = 0;
    counts[2] = 0;
    let overflow = 0;
    let culledCells = 0;
    const [L0, L1] = lodDist;
    const useFrustum = stats.cullFrustum && Boolean(ctx.camera);
    if (useFrustum) updateCullFrustum(ctx.camera);
    for (const cell of live) {
      const nLive = Math.min(cell.count, Math.round(cell.count * densityScale));
      if (nLive === 0) continue;
      if (useFrustum && !cellVisible(cell)) {
        culledCells += 1;
        continue;
      }
      const ddx = Math.max(cell.x0 - camX, 0, camX - cell.x1);
      const ddz = Math.max(cell.z0 - camZ, 0, camZ - cell.z1);
      const f = thinFactor(Math.sqrt(ddx * ddx + ddz * ddz)) + 0.03;
      const m = Math.min(nLive, Math.ceil(nLive * f));
      const data = cell.data;
      const invLive = 0.999 / nLive;
      for (let i = 0; i < m; i += 1) {
        const o = i * TUFT_STRIDE;
        const x = data[o];
        const z = data[o + 2];
        const dx = x - camX;
        const dz = z - camZ;
        const d2 = dx * dx + dz * dz;
        // per-tuft jitter on the LOD thresholds: no visible LOD ring
        const jitter = (data[o + 5] - 0.5) * 5;
        const l0 = L0 + jitter;
        const l1 = L1 + jitter * 1.6;
        const lod = d2 < l0 * l0 ? 0 : d2 < l1 * l1 ? 1 : 2;
        const n = counts[lod];
        if (n >= CAPACITY[lod]) {
          overflow += 1;
          continue;
        }
        const b = baseAttrs[lod].array;
        const pAr = paramAttrs[lod].array;
        const w = n * 4;
        b[w] = x;
        b[w + 1] = data[o + 1];
        b[w + 2] = z;
        b[w + 3] = data[o + 3];
        pAr[w] = data[o + 4];
        pAr[w + 1] = data[o + 5];
        pAr[w + 2] = data[o + 6];
        pAr[w + 3] = Math.floor(data[o + 7] * 255) + i * invLive;
        counts[lod] = n + 1;
      }
    }
    let total = 0;
    let tris = 0;
    let calls = 0;
    for (let lod = 0; lod < 3; lod += 1) {
      const n = counts[lod];
      geometries[lod].instanceCount = n;
      if (n > 0) {
        for (const attr of [baseAttrs[lod], paramAttrs[lod]]) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, n * 4);
          attr.needsUpdate = true;
        }
        calls += 1;
      }
      total += n;
      tris += n * triPerTuft[lod];
      stats.perLod[lod] = n;
    }
    stats.instances = total;
    stats.triangles = tris;
    stats.drawCalls = calls;
    stats.overflow = overflow;
    stats.culledCells = culledCells;
    stats.refills += 1;
    stats.lastRefillMs = performance.now() - tr;
    lastRefillX = camX;
    lastRefillZ = camZ;
    if (ctx.camera) lastDir.copy(ctx.camera.getWorldDirection(camDir));
    dirty = false;
  }

  function evict() {
    if (cells.size <= CACHE_MAX) return;
    const entries = [...cells.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const drop = cells.size - CACHE_MAX;
    for (let i = 0; i < drop; i += 1) {
      if (entries[i][1].lastUsed === frame) break;
      cells.delete(entries[i][0]);
    }
  }

  function update() {
    frame += 1;
    const cam = ctx.camera?.position;
    if (!cam) return;
    if (ctx.sky?.sunDirection) {
      uSunDir.value.copy(ctx.sky.sunDirection);
    } else if (ctx.sky?.sun?.position) {
      uSunDir.value.copy(ctx.sky.sun.position).normalize();
    }
    if (!rocksAdded && addShoreRocks()) {
      cells.clear(); // anything scattered before the boulders existed is stale
      dirty = true;
    }

    const camX = cam.x;
    const camZ = cam.z;
    const R = liveRadius + 1;
    const cx0 = Math.floor((camX - R) / CELL);
    const cx1 = Math.floor((camX + R) / CELL);
    const cz0 = Math.floor((camZ - R) / CELL);
    const cz1 = Math.floor((camZ + R) / CELL);
    // a teleport (or the very first frame) fills the whole disc at once; while
    // walking, new cells trickle in under a per-frame time budget
    const jumped = Math.hypot(camX - lastCamX, camZ - lastCamZ) > 10;
    lastCamX = camX;
    lastCamZ = camZ;
    const budget = initialised && !jumped ? BUILD_BUDGET_MS : Infinity;
    const tStart = performance.now();
    let pending = 0;
    let built = 0;
    const prevLive = live.length;
    live.length = 0;
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const x0 = cx * CELL;
        const z0 = cz * CELL;
        if (x0 > half || x0 + CELL < -half || z0 > half || z0 + CELL < -half) continue;
        const ddx = Math.max(x0 - camX, 0, camX - (x0 + CELL));
        const ddz = Math.max(z0 - camZ, 0, camZ - (z0 + CELL));
        if (ddx * ddx + ddz * ddz > R * R) continue;
        const key = cellKey(cx, cz);
        let cell = cells.get(key);
        if (!cell) {
          if (performance.now() - tStart > budget) {
            pending += 1;
            continue;
          }
          cell = buildCell(cx, cz);
          cells.set(key, cell);
          built += 1;
        }
        cell.lastUsed = frame;
        live.push(cell);
      }
    }
    initialised = true;
    const moved = Math.hypot(camX - lastRefillX, camZ - lastRefillZ) > REFILL_MOVE;
    // a turn past the frustum margin needs a repack as much as a step does
    const turned = stats.cullFrustum && ctx.camera && ctx.camera.getWorldDirection(camDir).dot(lastDir) < REFILL_TURN;
    if (dirty || built > 0 || moved || turned || live.length !== prevLive) {
      refill(camX, camZ);
      if (pending > 0) dirty = true; // finish streaming next frame
    }
    stats.liveCells = live.length;
    stats.cachedCells = cells.size;
    stats.pendingCells = pending;
    if (built > 0) evict();
  }

  function applyQuality(preset) {
    const density = clampJs(preset?.grassDensity ?? 0.8, 0.12, 1.25);
    densityScale = Math.min(1, density);
    liveRadius = 30 + 30 * Math.min(1, density);
    uRadius.value = liveRadius;
    uNearFull.value = liveRadius * 0.33;
    uThinMin.value = 0.3;
    uFadeStart.value = liveRadius * 0.78;
    uFadeEnd.value = liveRadius * 0.97;
    lodDist = [14 + 5 * density, 28 + 8 * density];
    atlas.anisotropy = preset?.anisotropy ?? 4;
    stats.radius = liveRadius;
    stats.density = densityScale;
    dirty = true;
  }
  applyQuality(ctx.quality ?? { grassDensity: 0.8, anisotropy: 4 });

  console.info(
    `[grass] atlas + 3 LOD tufts (${triPerTuft.join('/')} tris), ${trunkCount} trunk keep-outs, ` +
      `${ground.exact ? 'mesh-exact' : 'sampled'} heights, ready in ${(performance.now() - t0).toFixed(0)} ms`
  );

  return {
    update,
    applyQuality,
    stats,
    meshes,
    material,
    // testing hooks
    _cells: cells,
    _refill: () => {
      dirty = true;
    },
  };
}
