// Landmarks — the authored set-dressing pass: a signature giant tree, an
// overgrown stone-circle ruin, fallen logs and a log bridge, exposed root
// networks and ravine root arches, rock formations and trail dressing.
// Everything is procedural, deterministic (mulberry32) and cheap: repeated
// pieces are InstancedMeshes, unique pieces are merged into a handful of
// static meshes. All texture sampling happens in the fragment stage.
//
// API: createLandmarks(ctx) → { update(dt, t), applyQuality(preset),
//   heightAt(x, z), meshes, stats, places, walkables }
// heightAt returns the walkable surface height at (x, z) for logs, platforms,
// stairs, stepping stones… (-Infinity when nothing is there); the player
// should use Math.max(terrain.sampleHeight(x, z), landmarks.heightAt(x, z)).
// Solid obstacles (trunks, standing pillars, stumps, monoliths) report their
// top height, which is far above the feet — the controller's existing step /
// wall test then treats them as walls. Tier faces are 0.62 m (wall), stair
// risers 0.31 m (walkable). `places` lists authored positions for debugging.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  texture,
  positionLocal,
  positionWorld,
  normalWorld,
  normalMap,
  float,
  vec2,
  vec3,
  smoothstep,
  mix,
  clamp,
  time,
  sin,
  cos,
  abs,
  pow,
  hash,
  instanceIndex,
  uv,
  attribute,
  length,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, smoothstep as smoothstepJs, clamp as clampJs, lerp } from './noise.js';
import { createNormalFromCanvas } from './textures.js';

const TAU = Math.PI * 2;
const NONE = -Infinity;

// Dead emergent on the cliff top east of the falls (skyline landmark from
// spawn / the lagoon shore). Belongs in config as WORLD.sentinelSnag.
const SNAG = WORLD.sentinelSnag || { x: 30, z: -105, height: 28 };

// ============================================================ textures (drawn here)

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// Tooled masonry: gray-beige stone with chisel bands, pitting, hairline cracks,
// lichen and a dark mortar border (each block face maps to the full tile).
function createStoneTexture(seed = 4101) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);

  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, '#9a9384');
  base.addColorStop(0.5, '#a49c8a');
  base.addColorStop(1, '#908978');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // grain
  for (let i = 0; i < 5200; i += 1) {
    const palette = ['#b0a897', '#7d7666', '#b8b1a2', '#6f6857', '#a79f8b'];
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.globalAlpha = 0.08 + random() * 0.14;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 1 + random() * 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // chisel bands: rows of short diagonal strokes, alternating direction
  const bandH = 26;
  for (let band = 0; band * bandH < size; band += 1) {
    const dir = band % 2 ? 1 : -1;
    for (let i = 0; i < 64; i += 1) {
      const x = random() * size;
      const y = band * bandH + random() * bandH;
      const len = 6 + random() * 12;
      const light = random() > 0.5;
      ctx.strokeStyle = light ? `rgba(235, 228, 210, ${0.05 + random() * 0.09})` : `rgba(48, 42, 32, ${0.08 + random() * 0.14})`;
      ctx.lineWidth = 0.8 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * len * 0.72, y + len * 0.7);
      ctx.stroke();
    }
  }

  // pitting
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(52, 46, 36, ${0.2 + random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 0.8 + random() * 2.6, 0, TAU);
    ctx.fill();
  }

  // hairline cracks
  for (let i = 0; i < 7; i += 1) {
    let x = random() * size;
    let y = random() * size;
    ctx.strokeStyle = `rgba(40, 36, 28, ${0.35 + random() * 0.3})`;
    ctx.lineWidth = 0.8 + random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s += 1) {
      x += (random() - 0.5) * 46;
      y += (random() - 0.3) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // lichen blotches
  for (let i = 0; i < 30; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 5 + random() * 16;
    ctx.fillStyle = random() > 0.5 ? 'rgba(146, 160, 112, 0.22)' : 'rgba(178, 176, 136, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    for (let k = 0; k < 5; k += 1) {
      ctx.beginPath();
      ctx.arc(x + (random() - 0.5) * r * 2.2, y + (random() - 0.5) * r * 2.2, r * 0.35, 0, TAU);
      ctx.fill();
    }
  }

  // mortar border: soft dark rim so every block face reads as a separate stone
  ctx.strokeStyle = 'rgba(70, 66, 56, 0.55)';
  ctx.lineWidth = 56;
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(58, 54, 45, 0.95)';
  ctx.lineWidth = 30;
  ctx.strokeRect(0, 0, size, size);

  return toTexture(canvas);
}

// Twisted fiber rope, wraps along v.
function createRopeTexture(seed = 4202) {
  const canvas = makeCanvas(64, 256);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.fillStyle = '#a58d5e';
  ctx.fillRect(0, 0, 64, 256);
  for (let y = -32; y < 256 + 32; y += 16) {
    ctx.strokeStyle = 'rgba(78, 60, 34, 0.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-4, y);
    ctx.lineTo(68, y + 26);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214, 190, 140, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, y + 8);
    ctx.lineTo(68, y + 34);
    ctx.stroke();
  }
  for (let i = 0; i < 260; i += 1) {
    ctx.strokeStyle = `rgba(${120 + random() * 90}, ${95 + random() * 70}, ${50 + random() * 40}, 0.5)`;
    ctx.lineWidth = 0.8;
    const x = random() * 64;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + random() * 6, y + 2 + random() * 5);
    ctx.stroke();
  }
  return toTexture(canvas);
}

// ============================================================ geometry helpers

function indexedGeometry(positions, uvs, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Grid → triangle indices (rows × cols vertices, index = row * cols + col).
// `flip` reverses the winding (needed for lathes parametrized (cos a, y, sin a)).
function gridIndices(rows, cols, indices = [], flip = false) {
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      if (flip) indices.push(a, d, b, b, d, e);
      else indices.push(a, b, d, b, e, d);
    }
  }
  return indices;
}

// Make sure the triangles face away from a per-vertex "inside" reference.
function ensureOutward(geometry, insideFn) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const inside = new THREE.Vector3();
  let vote = 0;
  const step = Math.max(1, Math.floor(pos.count / 64));
  for (let i = 0; i < pos.count; i += step) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    insideFn(i, p, inside);
    vote += n.dot(p.clone().sub(inside)) >= 0 ? 1 : -1;
  }
  if (vote < 0) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

// Average the normals of the duplicated seam column of a closed lathe/tube
// (cols = radial + 1, last column duplicates the first for UVs).
function weldSeamNormals(geometry, rows, cols) {
  const nrm = geometry.attributes.normal;
  for (let r = 0; r < rows; r += 1) {
    const a = r * cols;
    const b = a + cols - 1;
    const nx = nrm.getX(a) + nrm.getX(b);
    const ny = nrm.getY(a) + nrm.getY(b);
    const nz = nrm.getZ(a) + nrm.getZ(b);
    const len = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / len, ny / len, nz / len);
    nrm.setXYZ(b, nx / len, ny / len, nz / len);
  }
  nrm.needsUpdate = true;
}

function withCap(geometry, values = 0) {
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count);
  if (typeof values === 'number') {
    arr.fill(values);
  } else {
    arr.set(values);
  }
  geometry.setAttribute('aCap', new THREE.BufferAttribute(arr, 1));
  return geometry;
}

// Tapered tube along a polyline (parallel-transport frames). radiusAt(t).
function tubeAlong(points, radiusAt, radialSegments = 8, { uRepeat = 2, vScale = 0.7, closeEnd = false } = {}) {
  const n = points.length;
  const tangents = [];
  for (let i = 0; i < n; i += 1) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(points[1], points[0]);
    else if (i === n - 1) t.subVectors(points[n - 1], points[n - 2]);
    else t.subVectors(points[i + 1], points[i - 1]);
    if (t.lengthSq() < 1e-10) t.set(0, 1, 0);
    tangents.push(t.normalize());
  }
  const ref = Math.abs(tangents[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const normal = ref.clone().addScaledVector(tangents[0], -ref.dot(tangents[0])).normalize();
  const binormal = new THREE.Vector3();
  const positions = [];
  const uvs = [];
  const cols = radialSegments + 1;
  let arc = 0;
  const centers = [];
  for (let i = 0; i < n; i += 1) {
    const t = tangents[i];
    if (i > 0) {
      normal.addScaledVector(t, -normal.dot(t));
      if (normal.lengthSq() < 1e-8) {
        normal.copy(ref).addScaledVector(t, -ref.dot(t));
      }
      normal.normalize();
      arc += points[i].distanceTo(points[i - 1]);
    }
    binormal.crossVectors(t, normal);
    const r = radiusAt(i / (n - 1), i);
    centers.push(points[i].clone());
    for (let j = 0; j < cols; j += 1) {
      const a = (j / radialSegments) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(
        points[i].x + (normal.x * ca + binormal.x * sa) * r,
        points[i].y + (normal.y * ca + binormal.y * sa) * r,
        points[i].z + (normal.z * ca + binormal.z * sa) * r
      );
      uvs.push((j / radialSegments) * uRepeat, arc * vScale);
    }
  }
  const indices = gridIndices(n, cols);
  let capStart = -1;
  if (closeEnd) {
    capStart = positions.length / 3;
    const last = points[n - 1];
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, 0.5);
    const ring = (n - 1) * cols;
    for (let j = 0; j < radialSegments; j += 1) {
      indices.push(capStart, ring + j, ring + j + 1);
    }
  }
  const geometry = indexedGeometry(positions, uvs, indices);
  ensureOutward(geometry, (i, p, out) => {
    const row = Math.min(n - 1, Math.floor(i / cols));
    out.copy(centers[row]);
  });
  weldSeamNormals(geometry, n, cols);
  return geometry;
}

// Chamfered box centered at the origin (flat facets; every face maps 0..1).
function chamferBox(w, h, d, c) {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const half = [hx, hy, hz];
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const cc = Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45);

  // vertex of corner (sx, sy, sz) belonging to the face plane of `axis`
  function corner(sx, sy, sz, axis) {
    const s = [sx, sy, sz];
    return [0, 1, 2].map((k) => s[k] * (k === axis ? half[k] : half[k] - cc));
  }

  function addPolygon(points, normal) {
    // uv: project along the dominant axis of the normal
    const dominant = [0, 1, 2].reduce((best, k) => (Math.abs(normal[k]) > Math.abs(normal[best]) ? k : best), 0);
    const u = dominant === 0 ? 2 : 0;
    const v = dominant === 1 ? 2 : 1;
    const base = positions.length / 3;
    // winding: make the polygon face along `normal`
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const flip = cx * normal[0] + cy * normal[1] + cz * normal[2] < 0;
    const ordered = flip ? points.slice().reverse() : points;
    for (const p of ordered) {
      positions.push(p[0], p[1], p[2]);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(0.5 + (0.5 * p[u]) / half[u], 0.5 + (0.5 * p[v]) / half[v]);
    }
    for (let i = 1; i < ordered.length - 1; i += 1) {
      indices.push(base, base + i, base + i + 1);
    }
  }

  const signs = [-1, 1];
  // faces
  for (let axis = 0; axis < 3; axis += 1) {
    for (const s of signs) {
      const others = [0, 1, 2].filter((k) => k !== axis);
      const pts = [];
      for (const s1 of signs) {
        for (const s2 of signs) {
          const sv = [0, 0, 0];
          sv[axis] = s;
          sv[others[0]] = s1;
          sv[others[1]] = s2;
          pts.push(corner(sv[0], sv[1], sv[2], axis));
        }
      }
      // order as a quad: (−,−) (−,+) (+,+) (+,−)
      const quad = [pts[0], pts[1], pts[3], pts[2]];
      const normal = [0, 0, 0];
      normal[axis] = s;
      addPolygon(quad, normal);
    }
  }
  // edges
  for (let axisA = 0; axisA < 3; axisA += 1) {
    for (let axisB = axisA + 1; axisB < 3; axisB += 1) {
      const axisE = [0, 1, 2].find((k) => k !== axisA && k !== axisB);
      for (const sa of signs) {
        for (const sb of signs) {
          const pts = [];
          for (const se of signs) {
            const sv = [0, 0, 0];
            sv[axisA] = sa;
            sv[axisB] = sb;
            sv[axisE] = se;
            pts.push([corner(sv[0], sv[1], sv[2], axisA), corner(sv[0], sv[1], sv[2], axisB)]);
          }
          const quad = [pts[0][0], pts[1][0], pts[1][1], pts[0][1]];
          const normal = [0, 0, 0];
          normal[axisA] = sa * Math.SQRT1_2;
          normal[axisB] = sb * Math.SQRT1_2;
          addPolygon(quad, normal);
        }
      }
    }
  }
  // corners
  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        const tri = [corner(sx, sy, sz, 0), corner(sx, sy, sz, 1), corner(sx, sy, sz, 2)];
        const k = 1 / Math.sqrt(3);
        addPolygon(tri, [sx * k, sy * k, sz * k]);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// Deterministic per-position hash (so duplicated vertices move together).
function posHash(x, y, z, seed = 0) {
  let h = Math.imul(Math.round(x * 1000) | 0, 374761393) ^ Math.imul(Math.round(y * 1000) | 0, 668265263) ^ Math.imul(Math.round(z * 1000) | 0, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Boulder: jittered icosahedron, slightly flattened, faceted. Top ≈ +0.95.
function boulderGeometry(seed = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = posHash(x, y, z, seed);
    const low = 1 + 0.16 * Math.sin(2.3 * x + 1.1 + seed) * Math.sin(1.9 * z - 0.6) + 0.1 * Math.sin(3.1 * y + 2.0);
    const s = low * (0.9 + h * 0.2);
    pos.setXYZ(i, x * s, y * s * 0.82, z * s);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Standing stone: tapered, jittered, faceted slab (unit: 1 wide, 1 tall, 1 deep; base at y=0).
function monolithGeometry(seed = 2) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 5, 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = y + 0.5; // 0 bottom → 1 top
    const taper = 1 - 0.28 * t;
    const h1 = posHash(x, y, z, seed) - 0.5;
    const h2 = posHash(z, x, y, seed + 7) - 0.5;
    const h3 = posHash(y, z, x, seed + 13) - 0.5;
    pos.setXYZ(i, x * taper + h1 * 0.09 + Math.sin(t * 6 + seed) * 0.03, t + h2 * 0.05, z * taper + h3 * 0.09);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Fallen log along +y, unit length, base radius 1 → 0.7, jagged broken ends
// (aCap = 1 on the end grain so the material can darken it).
function logGeometry(seed = 3) {
  const random = mulberry32(seed);
  const radial = 14;
  const segs = 9;
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const caps = [];
  const rimJag = [];
  for (let j = 0; j <= radial; j += 1) {
    rimJag.push([(random() - 0.5) * 0.07, (random() - 0.5) * 0.07]);
  }
  rimJag[radial] = rimJag[0];
  for (let i = 0; i <= segs; i += 1) {
    const y = i / segs;
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * TAU;
      let r = (1 - 0.3 * y) * (1 + 0.06 * Math.sin(3 * a + y * 6) + 0.04 * Math.sin(7 * a + 1) + 0.05 * Math.sin(2 * a - y * 4));
      let yy = y;
      if (i === 0) {
        yy += rimJag[j][0];
        r *= 0.97;
      } else if (i === segs) {
        yy += rimJag[j][1];
        r *= 0.97;
      }
      positions.push(Math.cos(a) * r, yy, Math.sin(a) * r);
      uvs.push((j / radial) * 3, y * 4);
      caps.push(0);
    }
  }
  // (cos a, y, sin a) lathe → flipped winding faces outward
  const indices = gridIndices(segs + 1, cols, [], true);
  // end caps: duplicate rim vertices (hard edge), fan to a recessed center
  for (const end of [0, 1]) {
    const row = end === 0 ? 0 : segs;
    const centerIndex = positions.length / 3;
    positions.push(0, end === 0 ? -0.02 : 1.02, 0);
    uvs.push(0.5, 0.5);
    caps.push(1);
    const ringStart = positions.length / 3;
    for (let j = 0; j <= radial; j += 1) {
      const src = row * cols + j;
      positions.push(positions[src * 3], positions[src * 3 + 1], positions[src * 3 + 2]);
      const a = (j / radial) * TAU;
      uvs.push(0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48);
      caps.push(1);
    }
    for (let j = 0; j < radial; j += 1) {
      // bottom cap faces -y: (C, j, j+1); top cap faces +y: (C, j+1, j)
      if (end === 0) indices.push(centerIndex, ringStart + j, ringStart + j + 1);
      else indices.push(centerIndex, ringStart + j + 1, ringStart + j);
    }
  }
  const geometry = indexedGeometry(positions, uvs, indices);
  weldSeamNormals(geometry, segs + 1, cols);
  withCap(geometry, caps);
  return geometry;
}

// Broken stump: flared fluted base, splintered top with an end-grain cap.
// Options turn it into a tall dead trunk: `taper` (radius loss toward the top),
// `lean(t) → [dx, dz]` (center offset by normalized height), `jagAmp`, `flareLen`.
function stumpGeometry(radius, height, seed, { taper = 0, rings = 9, jagAmp = height * 0.35, flareLen = 1.3, lean = null, radial = 20 } = {}) {
  const random = mulberry32(seed);
  const cols = radial + 1;
  const positions = [];
  const uvs = [];
  const caps = [];
  const phase = random() * TAU;
  const jag = [];
  for (let j = 0; j <= radial; j += 1) {
    const a = (j / radial) * TAU;
    jag.push(0.28 * Math.sin(2 * a + phase) + 0.2 * Math.sin(5 * a + 1.3) + (random() - 0.5) * 0.22);
  }
  jag[radial] = jag[0];
  const centerAt = (y) => (lean ? lean(clampJs(y / height, 0, 1)) : [0, 0]);
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    const y = -0.7 + (height + 0.7) * Math.pow(t, 1.25);
    const [lx, lz] = centerAt(y);
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * TAU;
      const flare = 1 + 0.55 * Math.exp(-(y + 0.7) / flareLen) * (0.5 + 0.5 * Math.cos(6 * a + phase));
      const wobble = 1 + 0.05 * Math.sin(3 * a + y * 2) + 0.03 * Math.sin(8 * a);
      const r = radius * flare * wobble * (1 - taper * clampJs(y / height, 0, 1));
      const yy = i === rings ? y + jag[j] * jagAmp : y;
      positions.push(lx + Math.cos(a) * r, yy, lz + Math.sin(a) * r);
      uvs.push((j / radial) * 4, y / 2.2);
      caps.push(0);
    }
  }
  const indices = gridIndices(rings + 1, cols, [], true);
  const centerIndex = positions.length / 3;
  const [tx, tz] = centerAt(height);
  positions.push(tx, height + 0.08, tz);
  uvs.push(0.5, 0.5);
  caps.push(1);
  const ringStart = positions.length / 3;
  const topRow = rings * cols;
  for (let j = 0; j <= radial; j += 1) {
    const src = topRow + j;
    positions.push(tx + (positions[src * 3] - tx) * 0.985, positions[src * 3 + 1], tz + (positions[src * 3 + 2] - tz) * 0.985);
    const a = (j / radial) * TAU;
    uvs.push(0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48);
    caps.push(1);
  }
  for (let j = 0; j < radial; j += 1) {
    indices.push(centerIndex, ringStart + j + 1, ringStart + j); // faces +y
  }
  const geometry = indexedGeometry(positions, uvs, indices);
  weldSeamNormals(geometry, rings + 1, cols);
  withCap(geometry, caps);
  return geometry;
}

// Fluted pillar drum (height 1.35, radius ≈ 0.42), 2 stone repeats around.
function drumGeometry() {
  const geometry = new THREE.CylinderGeometry(0.4, 0.44, 1.35, 24, 1, false);
  const pos = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  const torsoCount = 25 * 2; // (radial + 1) × (heightSegments + 1) — caps follow
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.01) {
      const a = Math.atan2(z, x);
      const s = 1 + 0.035 * Math.cos(12 * a);
      pos.setXYZ(i, x * s, pos.getY(i), z * s);
    }
    if (i < torsoCount) {
      uvAttr.setX(i, uvAttr.getX(i) * 2); // 2 stone repeats around
    }
  }
  pos.needsUpdate = true;
  uvAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Stone lantern / waymarker post, base at y = 0, ~2 m tall.
function lanternGeometry() {
  const parts = [];
  const add = (geometry, y) => {
    geometry.translate(0, y, 0);
    parts.push(geometry);
  };
  add(chamferBox(0.72, 0.18, 0.72, 0.04), 0.09);
  add(chamferBox(0.26, 0.98, 0.26, 0.03), 0.18 + 0.49);
  add(chamferBox(0.52, 0.09, 0.52, 0.03), 1.16 + 0.045);
  add(chamferBox(0.4, 0.42, 0.4, 0.03), 1.25 + 0.21);
  const roof = new THREE.ConeGeometry(0.5, 0.3, 4, 1);
  roof.rotateY(Math.PI / 4);
  add(roof, 1.46 + 0.15);
  const finial = new THREE.SphereGeometry(0.075, 10, 7);
  add(finial, 1.61 + 0.07);
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Shelf mushroom: half-disc bracket, back edge at the origin, extends +x (unit radius).
function mushroomGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rings = [0.12, 0.5, 0.8, 1.0];
  const steps = 12;
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let ri = 0; ri < rings.length; ri += 1) {
      const f = rings[ri];
      for (let s = 0; s <= steps; s += 1) {
        const a = -Math.PI * 0.52 + (s / steps) * Math.PI * 1.04;
        const x = Math.cos(a) * f;
        const z = Math.sin(a) * f * 0.85;
        const y = side > 0 ? 0.17 * (1 - f * f) + 0.02 : -0.06 * (1 - f) - 0.015;
        positions.push(x, y, z);
        uvs.push(f, side > 0 ? 1 : 0);
      }
    }
    for (let ri = 0; ri < rings.length - 1; ri += 1) {
      for (let s = 0; s < steps; s += 1) {
        const a = base + ri * (steps + 1) + s;
        const b = a + 1;
        const c = a + steps + 1;
        const d = c + 1;
        if (side > 0) indices.push(a, b, c, b, d, c); // top faces +y
        else indices.push(a, c, b, b, c, d); // underside faces -y
      }
    }
  }
  const geometry = indexedGeometry(positions, uvs, indices);
  return geometry;
}

// Cross-quads (for crown clusters), pivot at the center.
function crossedCards(width, height, cards = 3, cap = true) {
  const parts = [];
  for (let i = 0; i < cards; i += 1) {
    const plane = new THREE.PlaneGeometry(width, height);
    plane.rotateY((i / cards) * Math.PI);
    parts.push(plane);
  }
  if (cap) {
    const top = new THREE.PlaneGeometry(width, width);
    top.rotateX(-Math.PI / 2);
    top.translate(0, height * 0.2, 0);
    parts.push(top);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Soften normals toward up and bake a flipped-winding copy (two-sided, no DoubleSide).
function prepareFoliage(geometry, upFactor = 0.65) {
  const normal = geometry.attributes.normal;
  for (let i = 0; i < normal.count; i += 1) {
    const nx = normal.getX(i) * (1 - upFactor);
    const ny = Math.abs(normal.getY(i)) * (1 - upFactor) + upFactor;
    const nz = normal.getZ(i) * (1 - upFactor);
    const len = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(i, nx / len, ny / len, nz / len);
  }
  normal.needsUpdate = true;
  const flipped = geometry.clone();
  const idx = flipped.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const merged = mergeGeometries([geometry, flipped]);
  geometry.dispose();
  flipped.dispose();
  return merged;
}

// ============================================================ the landmarks

export function createLandmarks(ctx) {
  const { scene, terrain, textures } = ctx;
  const groundAt = (x, z) => terrain.sampleHeight(x, z);
  const normalTmp = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const quat = new THREE.Quaternion();
  const quatYaw = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  const meshes = [];
  const stats = { pieces: {}, triangles: 0, drawCalls: 0 };
  const places = { giantTree: { ...WORLD.giantTree }, snag: { x: SNAG.x, z: SNAG.z }, ruins: { x: WORLD.ruins.x, z: WORLD.ruins.z }, stumps: [], logs: [], bridge: null, arches: [] };
  const ownTextures = [];

  // ------------------------------------------------------------ textures
  const stoneTex = createStoneTexture();
  const stoneNormal = createNormalFromCanvas(stoneTex, 2.4, 1);
  const ropeTex = createRopeTexture();
  ownTextures.push(stoneTex, stoneNormal, ropeTex);

  // ------------------------------------------------------------ shared TSL pieces
  const upness = normalWorld.y;
  const noiseXZ = (scale, offset = 0) => texture(textures.noise, positionWorld.xz.mul(scale).add(offset)).r;
  const noiseVert = (scale) =>
    texture(textures.noise, vec2(positionWorld.x.add(positionWorld.z).mul(scale), positionWorld.y.mul(scale * 1.3))).r;
  const mossTexture = () => {
    const mossFlat = texture(textures.moss, positionWorld.xz.mul(0.5));
    const mossWall = texture(textures.moss, vec2(positionWorld.x.add(positionWorld.z), positionWorld.y).mul(0.5));
    return mix(mossWall, mossFlat, smoothstep(0.3, 0.7, abs(upness))).rgb;
  };

  // ---- bark: giant tree, roots, stumps, logs, posts (aCap marks end grain) ----
  // `pale` blends toward the silvery gray-brown of an emergent kapok so the
  // signature tree stays readable in the deep shade under its own crown.
  // `bleach` desaturates toward the silver-gray of sun-dried dead wood.
  // `bounce` adds a touch of fake bounce light so a trunk that stands in its own
  // crown's shadow all day keeps some readable texture.
  function makeBarkMaterial({ pale = 0, bleach = 0, mossScale = 1, bounce = 0 } = {}) {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
    const cap = attribute('aCap', 'float');
    let barkTex = texture(textures.bark, uv()).rgb;
    if (pale > 0) {
      barkTex = mix(barkTex, vec3(0.66, 0.6, 0.5).mul(barkTex.mul(2.2).add(0.35)), pale);
    }
    if (bleach > 0) {
      const lum = barkTex.r.mul(0.3).add(barkTex.g.mul(0.59)).add(barkTex.b.mul(0.11));
      barkTex = mix(barkTex, vec3(1.0, 0.97, 0.9).mul(lum.mul(1.6).add(0.24)), bleach);
    }
    const nA = noiseXZ(0.19);
    const nB = noiseVert(0.11);
    const mossNoise = smoothstep(0.4, 0.66, nA.mul(0.55).add(nB.mul(0.45)));
    const mossTop = smoothstep(0.05, 0.6, upness).mul(mossNoise);
    // damp shade moss on the lower meters of trunks (fades with height above the valley floor)
    const mossLow = smoothstep(0.5, 9.0, positionWorld.y).oneMinus().mul(smoothstep(0.48, 0.74, nB)).mul(0.65);
    const moss = clamp(mossTop.add(mossLow), 0, 1).mul(cap.oneMinus()).mul(mossScale);
    let albedo = mix(barkTex, mossTexture().mul(1.05), moss);
    const ringR = length(uv().sub(vec2(0.5, 0.5)));
    const rings = sin(ringR.mul(64)).mul(0.5).add(0.5);
    const grain = vec3(0.5, 0.38, 0.26).mul(rings.mul(0.35).add(0.72)).mul(mix(float(0.8), float(1.1), noiseXZ(0.9)));
    albedo = mix(albedo, grain, cap);
    albedo = albedo.mul(mix(float(0.84), float(1.1), noiseXZ(0.05, 0.3)));
    material.colorNode = albedo;
    if (bounce > 0) material.emissiveNode = albedo.mul(bounce);
    material.normalNode = normalMap(texture(textures.barkNormal, uv()).rgb, vec2(mix(float(0.95), float(0.25), moss.max(cap))));
    material.roughnessNode = mix(float(0.92), float(0.99), moss);
    return material;
  }
  const barkMaterial = makeBarkMaterial({ bounce: 0.05 });
  const giantBarkMaterial = makeBarkMaterial({ pale: 0.6, mossScale: 0.8, bounce: 0.08 });
  const deadWoodMaterial = makeBarkMaterial({ pale: 0.3, bleach: 0.8, mossScale: 0.25 });

  // ---- masonry: blocks, pillar drums, lanterns ----
  const stoneMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  {
    const stone = texture(stoneTex, uv());
    const nA = noiseXZ(0.23);
    const nB = noiseVert(0.16);
    const mossTop = smoothstep(0.15, 0.7, upness).mul(smoothstep(0.38, 0.62, nA));
    const streaks = smoothstep(0.52, 0.74, nB).mul(0.35); // damp streaks / lichen on the walls
    const moss = clamp(mossTop.add(streaks), 0, 1);
    let albedo = mix(stone.rgb, mossTexture().mul(0.95), moss.mul(0.88));
    albedo = albedo.mul(mix(float(0.84), float(1.1), noiseXZ(0.09, 0.7)));
    stoneMaterial.colorNode = albedo;
    stoneMaterial.emissiveNode = albedo.mul(0.05); // faint bounce so shaded masonry keeps its texture
    stoneMaterial.normalNode = normalMap(texture(stoneNormal, uv()).rgb, vec2(mix(float(0.85), float(0.25), moss)));
    stoneMaterial.roughnessNode = mix(float(0.88), float(0.98), moss);
  }

  // ---- boulders: triplanar rock + rockNormal, moss on top, wet below the waterline ----
  const boulderMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0 });
  {
    const triW = pow(abs(normalWorld), vec3(4.0));
    const triSum = triW.x.add(triW.y).add(triW.z);
    const wX = triW.x.div(triSum);
    const wY = triW.y.div(triSum);
    const wZ = triW.z.div(triSum);
    const sc = 0.32;
    const rock = texture(textures.rock, positionWorld.xz.mul(sc)).mul(wY)
      .add(texture(textures.rock, positionWorld.xy.mul(sc)).mul(wZ))
      .add(texture(textures.rock, positionWorld.zy.mul(sc)).mul(wX));
    const rockN = texture(textures.rockNormal, positionWorld.xz.mul(sc)).rgb.mul(wY)
      .add(texture(textures.rockNormal, positionWorld.xy.mul(sc)).rgb.mul(wZ))
      .add(texture(textures.rockNormal, positionWorld.zy.mul(sc)).rgb.mul(wX));
    const mossNoise = smoothstep(0.36, 0.62, noiseXZ(0.33).mul(0.6).add(noiseVert(0.2).mul(0.4)));
    const dry = smoothstep(0.3, 1.8, positionWorld.y);
    const moss = smoothstep(0.2, 0.75, upness).mul(mossNoise).mul(dry);
    const wet = smoothstep(-0.4, 0.5, positionWorld.y).oneMinus();
    let albedo = mix(rock.rgb, mossTexture(), moss.mul(0.9));
    albedo = albedo.mul(mix(float(0.84), float(1.12), noiseXZ(0.07, 0.6)));
    albedo = albedo.mul(wet.mul(0.42).oneMinus());
    boulderMaterial.colorNode = albedo;
    boulderMaterial.normalNode = normalMap(rockN, vec2(mix(float(1.0), float(0.3), moss)));
    boulderMaterial.roughnessNode = mix(float(0.95), float(0.99), moss).sub(wet.mul(0.5));
  }

  // ---- rope ----
  const ropeMaterial = new THREE.MeshStandardNodeMaterial({ map: ropeTex, roughness: 0.96, metalness: 0 });

  // ---- shelf mushrooms: banded cap, cream underside (uv.x = radial, uv.y = top/bottom) ----
  const mushroomMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
  {
    const f = uv().x;
    const bands = sin(f.mul(19).add(hash(instanceIndex).mul(6))).mul(0.5).add(0.5);
    const capColor = mix(vec3(0.72, 0.42, 0.16), vec3(0.34, 0.19, 0.09), smoothstep(0.35, 0.65, bands));
    const rim = smoothstep(0.86, 1.0, f);
    const top = mix(capColor, vec3(0.9, 0.82, 0.55), rim);
    const under = vec3(0.86, 0.8, 0.62);
    const tint = mix(float(0.8), float(1.15), hash(instanceIndex.add(9)));
    mushroomMaterial.colorNode = mix(under, top, uv().y).mul(tint);
  }

  // ---- alpha-tested foliage cards (crown, vines, epiphyte ferns) ----
  function foliageMaterial(map, { tintSpread = 0.12, wind = null, roughness = 0.85, lift = 1 } = {}) {
    const material = new THREE.MeshStandardNodeMaterial({
      map,
      side: THREE.FrontSide,
      roughness,
      metalness: 0,
      alphaTest: 0.45,
    });
    const brightness = mix(float(1 - tintSpread), float(1 + tintSpread), hash(instanceIndex.add(123))).mul(lift);
    const greenShift = mix(float(1 - tintSpread * 0.5), float(1 + tintSpread * 0.5), hash(instanceIndex.add(321)));
    const mapColor = texture(map);
    material.colorNode = mapColor.rgb.mul(vec3(brightness, brightness.mul(greenShift), brightness));
    material.opacityNode = mapColor.a;
    if (wind) {
      const phase = hash(instanceIndex).mul(TAU);
      const t = time.mul(wind.speed).add(phase);
      const gust = sin(t).add(sin(t.mul(1.71).add(1.3)).mul(0.5)).add(sin(t.mul(3.13).add(2.2)).mul(0.27));
      // hanging cards: the free end (uv.y = 0) swings, the pivot (uv.y = 1) stays put
      const factor = wind.hangFromTop ? uv().y.oneMinus().clamp(0, 1).pow(1.5) : float(1);
      const sway = gust.mul(wind.strength).mul(factor);
      const dir = hash(instanceIndex.add(77)).mul(TAU);
      material.positionNode = positionLocal.add(vec3(sway.mul(cos(dir)), 0, sway.mul(sin(dir))));
    }
    return material;
  }

  // ------------------------------------------------------------ walkable surfaces (heightAt)
  const walk = {
    discs: [], // { x, z, r, y }
    capsules: [], // { ax, az, bx, bz, ya, yb, r }
    ellipsoids: [], // { x, y, z, yaw, sx, sy, sz }
    stairs: [], // { x, z, dx, dz, start, depth, rise, topY, count, halfWidth }
    custom: [], // fn(x, z) → height | NONE
  };

  function heightAt(x, z) {
    let best = NONE;
    for (const d of walk.discs) {
      const dx = x - d.x;
      const dz = z - d.z;
      if (dx * dx + dz * dz <= d.r * d.r && d.y > best) best = d.y;
    }
    for (const c of walk.capsules) {
      const vx = c.bx - c.ax;
      const vz = c.bz - c.az;
      const len2 = vx * vx + vz * vz || 1e-6;
      const t = (((x - c.ax) * vx + (z - c.az) * vz) / len2);
      if (t < -0.02 || t > 1.02) continue;
      const tc = clampJs(t, 0, 1);
      const px = c.ax + vx * tc;
      const pz = c.az + vz * tc;
      const d = Math.hypot(x - px, z - pz);
      const limit = c.r * 0.82;
      if (d > limit) continue;
      const h = lerp(c.ya, c.yb, tc) + Math.sqrt(Math.max(0, c.r * c.r - d * d));
      if (h > best) best = h;
    }
    for (const e of walk.ellipsoids) {
      const dx = x - e.x;
      const dz = z - e.z;
      const c = Math.cos(-e.yaw);
      const s = Math.sin(-e.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const q = (lx * lx) / (e.sx * e.sx) + (lz * lz) / (e.sz * e.sz);
      if (q > 0.85) continue;
      const h = e.y + e.sy * Math.sqrt(1 - q) * 0.8;
      if (h > best) best = h;
    }
    for (const st of walk.stairs) {
      const dx = x - st.x;
      const dz = z - st.z;
      const along = dx * st.dx + dz * st.dz;
      const lateral = -dx * st.dz + dz * st.dx;
      if (Math.abs(lateral) > st.halfWidth) continue;
      const k = Math.floor((along - st.start) / st.depth);
      if (k < 0 || k >= st.count) continue;
      const h = st.topY - st.rise * k;
      if (h > best) best = h;
    }
    for (const fn of walk.custom) {
      const h = fn(x, z);
      if (h > best) best = h;
    }
    return best;
  }

  // ------------------------------------------------------------ helpers
  function register(mesh, { castShadow = false, cull = true, name }) {
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = cull;
    if (mesh.isInstancedMesh) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    } else {
      mesh.geometry.computeBoundingSphere();
    }
    scene.add(mesh);
    meshes.push(mesh);
    const geometry = mesh.geometry;
    const tris = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    const instances = mesh.isInstancedMesh ? mesh.count : 1;
    stats.pieces[name] = { instances, triangles: Math.round(tris * instances) };
    stats.triangles += Math.round(tris * instances);
    stats.drawCalls += 1;
    return mesh;
  }

  // Align local +y with the terrain normal, then yaw. Writes dummy.quaternion.
  function alignToSlope(x, z, yaw, blend = 1) {
    terrain.sampleNormal(x, z, normalTmp);
    if (blend < 1) {
      normalTmp.lerp(UP, 1 - blend).normalize();
    }
    quat.setFromUnitVectors(UP, normalTmp);
    quatYaw.setFromAxisAngle(UP, yaw);
    dummy.quaternion.copy(quat).multiply(quatYaw);
  }

  function trailPoint(trailIndex, segIndex, t) {
    const trail = WORLD.trails[trailIndex];
    const a = trail[segIndex];
    const b = trail[segIndex + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * t, z: a[1] + dz * t, dx: dx / len, dz: dz / len };
  }

  const zoneWeight = (x, z) => {
    const zone = terrain.zonesAt(x, z);
    return Math.max(zone.clearing, zone.overlook, zone.ruins);
  };

  const distToGiantTree = (x, z) => Math.hypot(x - WORLD.giantTree.x, z - WORLD.giantTree.z);
  const distToRuins = (x, z) => Math.hypot(x - WORLD.ruins.x, z - WORLD.ruins.z);

  // ============================================================ 1. signature giant tree
  const giant = { x: WORLD.giantTree.x, z: WORLD.giantTree.z, baseY: 0, height: 40 };
  const crownSpots = []; // { x, y, z, s }
  const vineSpots = []; // { x, y, z, s } hanging cards (pivot at the top)
  const fernSpots = []; // { x, y, z, s, yaw }
  const barkStatic = []; // geometries merged into the static bark mesh
  const logSpots = []; // { ax, ay, az, bx, by, bz, r, bridge? }
  const boulderSpots = []; // { x, y, z, yaw, sx, sy, sz, tilt }
  const monolithSpots = [];
  const blockSpots = []; // matrices for ruins blocks
  const drumSpots = [];
  const lanternSpots = [];
  const mushroomSpots = [];

  function buildGiantTree() {
    const random = mulberry32(WORLD.seed + 4001);
    const gx = giant.x;
    const gz = giant.z;
    let minGround = Infinity;
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * TAU;
      minGround = Math.min(minGround, groundAt(gx + Math.cos(a) * 4.5, gz + Math.sin(a) * 4.5));
    }
    giant.baseY = minGround - 0.35;
    const baseY = giant.baseY;
    const height = giant.height;
    const hollowAngle = -1.25; // mouth faces NNE, toward the bamboo-corridor trail
    const flutePhase = -8 * hollowAngle - Math.PI;
    const parts = [];

    // ---- fluted trunk (lathe) ----
    {
      const radial = 72;
      const rings = 46;
      const cols = radial + 1;
      const positions = [];
      const uvs = [];
      const yStart = -1.6;
      const rowCenters = [];
      for (let j = 0; j <= rings; j += 1) {
        const tj = j / rings;
        const y = yStart + (height - yStart) * Math.pow(tj, 1.45);
        const yc = Math.max(0, y);
        const R = (1.4 + 2.1 * Math.exp(-yc / 4.6)) * (1 - 0.4 * clampJs(yc / height, 0, 1));
        const amp = 0.52 * Math.exp(-yc / 5.5) + 0.06;
        // the hollow: fully open below 1.9 m, closing into a pointed arch by 4.8 m
        const hollowY = 1 - smoothstepJs(1.9, 4.8, y);
        const hollowK = 0.55 + 0.45 * hollowY; // the slot narrows toward the top
        const lean = clampJs(yc / 10, 0, 1);
        const cx = Math.sin(yc * 0.21) * 0.5 * lean;
        const cz = Math.cos(yc * 0.17 + 1) * 0.4 * lean;
        rowCenters.push(new THREE.Vector3(cx, y, cz));
        for (let i = 0; i <= radial; i += 1) {
          const a = (i / radial) * TAU;
          const flute = 0.5 + 0.5 * Math.cos(8 * a + flutePhase + Math.sin(yc * 0.35) * 0.25);
          let r = R * (1 + amp * flute);
          r *= 1 + 0.05 * Math.sin(3 * a + yc * 0.6) + 0.035 * Math.sin(5 * a - yc * 0.9 + 2) + 0.02 * Math.sin(13 * a + yc * 2.1);
          let da = a - hollowAngle;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          const hm = (1 - smoothstepJs(0.15 * hollowK, 0.38 * hollowK, Math.abs(da))) * hollowY;
          r *= 1 - 0.76 * hm;
          positions.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
          uvs.push((i / radial) * 9, y / 5.5);
        }
      }
      const indices = gridIndices(rings + 1, cols, [], true);
      const trunk = indexedGeometry(positions, uvs, indices);
      ensureOutward(trunk, (i, p, out) => out.copy(rowCenters[Math.min(rings, Math.floor(i / cols))]));
      weldSeamNormals(trunk, rings + 1, cols);
      withCap(trunk, 0);
      parts.push(trunk);
    }

    // ---- buttress roots: tapered wedges continuing the flute crests along the ground ----
    const buttresses = [];
    for (let k = 0; k < 8; k += 1) {
      const angle = hollowAngle + Math.PI / 8 + (k * Math.PI) / 4;
      const flank = k === 0 || k === 7;
      const len = (flank ? 7.5 : 6) + random() * 2.2;
      const hT = (flank ? 3.6 : 3.0) + random() * 0.6;
      const halfW = 0.55 + random() * 0.2;
      const start = 3.2;
      const S = 16;
      const profile = [-1, -0.82, -0.45, 0, 0.45, 0.82, 1];
      const heights = [0, 0.3, 0.8, 1, 0.8, 0.3, 0];
      const C = profile.length;
      const positions = [];
      const uvs = [];
      const bend = (random() - 0.5) * 0.5;
      const axisPts = [];
      for (let s = 0; s <= S; s += 1) {
        const t = s / S;
        const dist = start + len * t;
        const a = angle + bend * t * t;
        const px = Math.cos(a) * dist;
        const pz = Math.sin(a) * dist;
        const ground = groundAt(gx + px, gz + pz) - baseY;
        const hRidge = hT * Math.pow(1 - t, 1.55) + 0.12;
        const w = halfW * (0.35 + 0.65 * (1 - t)) * (1 + 0.12 * Math.sin(t * 9 + k));
        const lx = -Math.sin(a);
        const lz = Math.cos(a);
        axisPts.push(new THREE.Vector3(px, ground - 0.2, pz));
        for (let c = 0; c < C; c += 1) {
          const lat = profile[c] * w;
          const isBase = c === 0 || c === C - 1;
          const y = isBase ? ground - 0.45 : ground + heights[c] * hRidge;
          positions.push(px + lx * lat, y, pz + lz * lat);
          uvs.push((c / (C - 1)) * 2, dist / 2.4);
        }
      }
      const wedge = indexedGeometry(positions, uvs, gridIndices(S + 1, C));
      ensureOutward(wedge, (i, p, out) => out.copy(axisPts[Math.min(S, Math.floor(i / C))]));
      withCap(wedge, 0);
      parts.push(wedge);
      buttresses.push({ angle, bend, len, hT, halfW, start });
    }

    // ---- limbs (bent tapered tubes) with forks, crown clusters, lianas and epiphytes ----
    const lianaSpecs = [];
    // clear bole up to ~20 m, then a wide, flat emergent umbrella
    const limbDefs = [
      { y: 21.0, yaw: 0.3, len: 15.5, r: 0.78 },
      { y: 24.0, yaw: 1.45, len: 14.0, r: 0.72 },
      { y: 27.0, yaw: 2.6, len: 14.0, r: 0.68 },
      { y: 30.0, yaw: 3.75, len: 12.0, r: 0.62 },
      { y: 32.5, yaw: 4.9, len: 11.0, r: 0.56 },
      { y: 35.0, yaw: 5.9, len: 9.0, r: 0.48 },
    ];
    const trunkRadiusAt = (y) => (1.4 + 2.1 * Math.exp(-y / 4.6)) * (1 - 0.4 * clampJs(y / height, 0, 1));
    const trunkCenterAt = (y) => {
      const lean = clampJs(y / 10, 0, 1);
      return [Math.sin(y * 0.21) * 0.5 * lean, Math.cos(y * 0.17 + 1) * 0.4 * lean];
    };

    function limbPath(start, yaw, len, seed, riseScale = 1) {
      const pts = [];
      const N = 16;
      const dx = Math.cos(yaw);
      const dz = Math.sin(yaw);
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const rise = len * (0.4 * t - 0.27 * t * t) * riseScale;
        const wig = Math.sin(t * 5.2 + seed) * 0.05 * len * t;
        pts.push(new THREE.Vector3(
          start.x + dx * len * t - dz * wig,
          start.y + rise + Math.sin(t * 7 + seed * 1.7) * 0.025 * len * t,
          start.z + dz * len * t + dx * wig
        ));
      }
      return pts;
    }

    function addLimb(pts, r0, r1, radial, seedYaw, depth) {
      const tube = tubeAlong(pts, (t) => lerp(r0, r1, Math.pow(t, 0.9)), radial, { uRepeat: 3, vScale: 0.45 });
      withCap(tube, 0);
      parts.push(tube);
      const len = pts[0].distanceTo(pts[pts.length - 1]);
      // crown clusters along the outer part, more at the tip
      for (let i = 0; i < pts.length; i += 1) {
        const t = i / (pts.length - 1);
        if (t < 0.42 || i % 2) continue;
        const p = pts[i];
        const spread = 0.6 + t * 1.8;
        const count = t > 0.9 ? 3 : 1;
        for (let c = 0; c < count; c += 1) {
          crownSpots.push({
            x: gx + p.x + (random() - 0.5) * spread * 2,
            y: baseY + p.y + 1.1 + random() * 1.6,
            z: gz + p.z + (random() - 0.5) * spread * 2,
            s: (0.85 + random() * 0.45) * (1 - depth * 0.15),
          });
        }
      }
      // epiphyte ferns riding the top of the limb
      for (let i = 2; i < pts.length - 2; i += 3) {
        if (random() < 0.7) {
          const p = pts[i];
          const t = i / (pts.length - 1);
          const rr = lerp(r0, r1, t);
          fernSpots.push({ x: gx + p.x, y: baseY + p.y + rr * 0.75, z: gz + p.z, s: 1.1 + random() * 0.9, yaw: random() * TAU });
        }
      }
      // lianas & leafy vines hanging from the underside
      for (let i = 4; i < pts.length - 1; i += 2) {
        const t = i / (pts.length - 1);
        const rr = lerp(r0, r1, t);
        const p = pts[i];
        if (random() < 0.55) {
          lianaSpecs.push({ x: p.x, y: p.y - rr * 0.6, z: p.z, len: 6 + random() * 16, r: 0.07 + random() * 0.07 });
        }
        if (random() < 0.5) {
          vineSpots.push({ x: gx + p.x + (random() - 0.5) * 0.6, y: baseY + p.y - rr * 0.5, z: gz + p.z + (random() - 0.5) * 0.6, s: 1.3 + random() * 1.2 });
        }
      }
      void len;
      void seedYaw;
    }

    for (let k = 0; k < limbDefs.length; k += 1) {
      const def = limbDefs[k];
      const yaw = def.yaw + (random() - 0.5) * 0.3;
      const [cx, cz] = trunkCenterAt(def.y);
      const start = new THREE.Vector3(cx + Math.cos(yaw) * trunkRadiusAt(def.y) * 0.45, def.y, cz + Math.sin(yaw) * trunkRadiusAt(def.y) * 0.45);
      const pts = limbPath(start, yaw, def.len, k * 3.1);
      addLimb(pts, def.r, def.r * 0.22, 12, yaw, 0);
      // forks
      for (const ft of [0.5, 0.76]) {
        const idx = Math.round(ft * (pts.length - 1));
        const side = random() > 0.5 ? 1 : -1;
        const fyaw = yaw + side * (0.5 + random() * 0.35);
        const fr = lerp(def.r, def.r * 0.22, ft) * 0.6;
        const fpts = limbPath(pts[idx].clone(), fyaw, def.len * (0.45 + random() * 0.15), k * 7.7 + ft, 1.3);
        addLimb(fpts, fr, fr * 0.25, 8, fyaw, 1);
      }
    }
    // top crown dome: broad and flat, the way emergents spread above the canopy
    for (let i = 0; i < 22; i += 1) {
      const a = random() * TAU;
      const rr = Math.pow(random(), 0.6) * 9.0;
      const [cx, cz] = trunkCenterAt(height - 1);
      crownSpots.push({
        x: gx + cx + Math.cos(a) * rr,
        y: baseY + height - 2.0 + random() * 4.0 - rr * 0.22,
        z: gz + cz + Math.sin(a) * rr,
        s: 1.05 + random() * 0.5,
      });
    }

    // lianas: thin woody ropes, some reaching the ground and rooting
    for (const spec of lianaSpecs) {
      const pts = [];
      const N = 9;
      const groundHere = groundAt(gx + spec.x, gz + spec.z) - baseY;
      const maxLen = spec.y - groundHere + 0.4;
      const len = Math.min(spec.len, maxLen);
      const drift = (random() - 0.5) * 1.6;
      const driftZ = (random() - 0.5) * 1.6;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const sway = Math.sin(t * Math.PI) * 0.35;
        pts.push(new THREE.Vector3(spec.x + drift * t + sway, spec.y - len * t, spec.z + driftZ * t + sway * 0.6));
      }
      const tube = tubeAlong(pts, (t) => spec.r * (1 - 0.35 * t), 5, { uRepeat: 1, vScale: 0.9 });
      withCap(tube, 0);
      parts.push(tube);
    }

    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    merged.translate(gx, baseY, gz);
    const mesh = new THREE.Mesh(merged, giantBarkMaterial);
    register(mesh, { castShadow: true, name: 'lm-giant-tree' });

    // ---- surface roots snaking out between the buttresses ----
    const rootRandom = mulberry32(WORLD.seed + 4002);
    for (let k = 0; k < 16; k += 1) {
      const baseAngle = hollowAngle + (Math.floor(k / 2) * Math.PI) / 4 + (k % 2 ? 0.16 : -0.16);
      if (Math.abs(Math.atan2(Math.sin(baseAngle - hollowAngle), Math.cos(baseAngle - hollowAngle))) < 0.5) continue;
      const len = 7 + rootRandom() * 8;
      const r0 = 0.28 + rootRandom() * 0.14;
      const pts = [];
      const N = 12;
      let a = baseAngle;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        a += (rootRandom() - 0.5) * 0.22;
        const dist = 3.2 + len * t;
        const px = gx + Math.cos(a) * dist;
        const pz = gz + Math.sin(a) * dist;
        const rr = r0 * (1 - 0.8 * t);
        const g = groundAt(px, pz);
        const arch = Math.sin(t * Math.PI * 2.2 + k) * 0.5 + 0.5; // occasionally lifts out of the ground
        pts.push(new THREE.Vector3(px, g - rr * 0.55 + arch * rr * 0.9, pz));
      }
      const tube = tubeAlong(pts, (t) => r0 * (1 - 0.8 * t) + 0.02, 7, { uRepeat: 2, vScale: 0.7 });
      withCap(tube, 0);
      barkStatic.push(tube);
    }

    // ---- collision: solid core + hollow + buttress ridges ----
    walk.custom.push((x, z) => {
      const dx = x - gx;
      const dz = z - gz;
      const r = Math.hypot(dx, dz);
      if (r > 14) return NONE;
      const ang = Math.atan2(dz, dx);
      let da = ang - hollowAngle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      // trunk wall, following the carved hollow (same falloff as the lathe, +0.35 m margin)
      const hm = 1 - smoothstepJs(0.15, 0.38, Math.abs(da));
      if (r < 3.5 * (1 - 0.76 * hm) + 0.35) return baseY + 8;
      let best = NONE;
      for (const b of buttresses) {
        // invert the gentle bend approximately: use the straight axis
        let rel = ang - b.angle;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        const along = r * Math.cos(rel);
        const lateral = r * Math.sin(rel);
        const t = (along - b.start) / b.len;
        if (t < 0 || t > 1) continue;
        const w = b.halfW * (0.35 + 0.65 * (1 - t));
        if (Math.abs(lateral) > w) continue;
        const hRidge = b.hT * Math.pow(1 - t, 1.55) + 0.12;
        const h = groundAt(x, z) + hRidge * Math.pow(1 - Math.abs(lateral) / w, 0.6);
        if (h > best) best = h;
      }
      return best;
    });
  }

  // ============================================================ 1b. sentinel snag on the falls' cliff top
  // A bleached dead emergent on the cliff top east of the waterfall: the one
  // landmark on the skyline from spawn and the lagoon shore, and the vista at
  // the west end of the terrace climb. (Proposed config entry: WORLD.sentinelSnag.)
  function buildSentinelSnag() {
    const random = mulberry32(WORLD.seed + 4005);
    const sx = SNAG.x;
    const sz = SNAG.z;
    let minGround = Infinity;
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * TAU;
      minGround = Math.min(minGround, groundAt(sx + Math.cos(a) * 1.9, sz + Math.sin(a) * 1.9));
    }
    const baseY = minGround - 0.25;
    const height = SNAG.height;
    const radius = 1.45;
    const taper = 0.64;
    const lean = (t) => [Math.sin(t * 2.4) * 1.2 * t, Math.sin(t * 1.7 + 0.8) * 0.9 * t];
    const radiusAt = (y) => radius * (1 - taper * clampJs(y / height, 0, 1));
    const parts = [];
    parts.push(stumpGeometry(radius, height, WORLD.seed + 4006, { taper, rings: 16, jagAmp: 2.8, flareLen: 2.6, lean, radial: 24 }));

    // bare limbs: straight-ish tapered tubes with snapped tips; the top ones are stubs
    function deadLimb(start, yaw, len, up, r0, radial) {
      const pts = [];
      const N = 9;
      const seed = random() * 10;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const d = len * t;
        const horiz = Math.cos(up) * d;
        const rise = Math.sin(up) * d + 0.04 * len * Math.sin(t * Math.PI);
        const wig = Math.sin(t * 4.5 + seed) * 0.06 * len * t;
        pts.push(new THREE.Vector3(
          start.x + Math.cos(yaw) * horiz - Math.sin(yaw) * wig,
          start.y + rise,
          start.z + Math.sin(yaw) * horiz + Math.cos(yaw) * wig
        ));
      }
      const tube = tubeAlong(pts, (t) => lerp(r0, r0 * 0.2, Math.pow(t, 0.8)), radial, { uRepeat: 2, vScale: 0.6 });
      withCap(tube, 0);
      parts.push(tube);
      return pts;
    }
    // the lower limbs sit inside the cliff-top canopy; the upper ones draw the skyline
    const limbs = [
      { y: 12.0, yaw: 0.9, len: 7.5, up: 0.5, r: 0.46 },
      { y: 16.0, yaw: 3.6, len: 6.5, up: 0.4, r: 0.42 },
      { y: 19.5, yaw: 2.1, len: 2.4, up: 0.6, r: 0.38 },
      { y: 21.0, yaw: 5.2, len: 6.8, up: 0.5, r: 0.38 },
      { y: 23.5, yaw: 0.2, len: 6.4, up: 0.62, r: 0.34 },
      { y: 25.5, yaw: 4.0, len: 3.4, up: 0.8, r: 0.3 },
      { y: 26.6, yaw: 1.6, len: 1.9, up: 0.9, r: 0.26 },
    ];
    for (const limb of limbs) {
      const yaw = limb.yaw + (random() - 0.5) * 0.3;
      const [cx, cz] = lean(clampJs(limb.y / height, 0, 1));
      const rT = radiusAt(limb.y);
      const start = new THREE.Vector3(cx + Math.cos(yaw) * rT * 0.55, limb.y, cz + Math.sin(yaw) * rT * 0.55);
      const pts = deadLimb(start, yaw, limb.len, limb.up, limb.r, 8);
      if (limb.len > 4) {
        const ft = 0.45 + random() * 0.2;
        const idx = Math.round(ft * (pts.length - 1));
        const fyaw = yaw + (random() > 0.5 ? 1 : -1) * (0.55 + random() * 0.3);
        deadLimb(pts[idx].clone(), fyaw, limb.len * (0.35 + random() * 0.2), limb.up + 0.25, lerp(limb.r, limb.r * 0.2, ft) * 0.75, 6);
      }
    }

    // root flare gripping the cliff top
    for (let k = 0; k < 7; k += 1) {
      let a = (k / 7) * TAU + random() * 0.4;
      const len = 2.8 + random() * 3.2;
      const r0 = 0.22 + random() * 0.14;
      const pts = [];
      const N = 9;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        a += (random() - 0.5) * 0.2;
        const d = radius * 0.8 + len * t;
        const px = sx + Math.cos(a) * d;
        const pz = sz + Math.sin(a) * d;
        const rr = r0 * (1 - 0.8 * t);
        pts.push(new THREE.Vector3(px - sx, groundAt(px, pz) - baseY - rr * 0.5 + (1 - t) * 0.35 + Math.sin(t * Math.PI) * rr * 0.6, pz - sz));
      }
      const tube = tubeAlong(pts, (t) => r0 * (1 - 0.8 * t) + 0.02, 7, { uRepeat: 2, vScale: 0.8 });
      withCap(tube, 0);
      parts.push(tube);
    }

    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    merged.translate(sx, baseY, sz);
    register(new THREE.Mesh(merged, deadWoodMaterial), { castShadow: true, name: 'lm-sentinel-snag' });
    walk.discs.push({ x: sx, z: sz, r: radius * 1.15, y: baseY + 8 }); // solid trunk

    // weathered boulders at its foot
    for (let k = 0; k < 4; k += 1) {
      const a = 0.6 + k * 1.5 + random() * 0.6;
      const d = 3.4 + random() * 2.4;
      const x = sx + Math.cos(a) * d;
      const z = sz + Math.sin(a) * d;
      const s = 0.55 + random() * 0.7;
      const sy = s * 0.75;
      const spot = { x, y: groundAt(x, z) + sy * 0.82 * 0.56, z, yaw: random() * TAU, sx: s * (0.9 + random() * 0.4), sy, sz: s * (0.9 + random() * 0.4), tilt: 1 };
      boulderSpots.push(spot);
      if (sy > 0.35) walk.ellipsoids.push(spot);
    }
  }

  // ============================================================ 2. ruins on the knoll
  function buildRuins() {
    const random = mulberry32(WORLD.seed + 4010);
    const cx = WORLD.ruins.x;
    const cz = WORLD.ruins.z;
    const tierTops = [6.62, 7.24, 7.86];
    const tierRadii = [7.6, 6.2, 4.8];
    const blockH = 0.62;
    const ringDepth = 1.4;
    const stairAngle = Math.atan2(4, 8); // toward the trail approach (south-east)
    const sdx = Math.cos(stairAngle);
    const sdz = Math.sin(stairAngle);
    const stairHalfWidth = 1.0;

    const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    const inStairSector = (a, radius, margin = 0.2) => Math.abs(Math.sin(angleDiff(a, stairAngle))) * radius < stairHalfWidth + margin && Math.cos(angleDiff(a, stairAngle)) > 0;

    function pushBlock(x, y, z, yaw, sx, sy, sz, tiltX = 0, tiltZ = 0) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(tiltX, yaw, tiltZ);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      blockSpots.push(dummy.matrix.clone());
    }

    // ---- three stepped tiers of ring blocks ----
    for (let t = 0; t < 3; t += 1) {
      const R = tierRadii[t];
      const top = tierTops[t];
      const n = Math.round((TAU * R) / 1.55);
      const offset = random() * TAU;
      for (let i = 0; i < n; i += 1) {
        const a = offset + (i / n) * TAU;
        if (inStairSector(a, R - ringDepth * 0.5, 0.35)) continue;
        const rc = R - ringDepth / 2;
        let x = cx + Math.cos(a) * rc;
        let z = cz + Math.sin(a) * rc;
        const sink = random() * 0.09;
        let tiltX = (random() - 0.5) * 0.05;
        let tiltZ = (random() - 0.5) * 0.05;
        let y = top - blockH / 2 - sink;
        const tangential = (TAU * R) / n - 0.05;
        // a few blocks have slumped outward
        if (random() < 0.07) {
          x += Math.cos(a) * (0.25 + random() * 0.5);
          z += Math.sin(a) * (0.25 + random() * 0.5);
          y -= 0.1 + random() * 0.15;
          tiltX += (random() - 0.5) * 0.3;
          tiltZ += (random() - 0.5) * 0.3;
        }
        pushBlock(x, y, z, -a, ringDepth, blockH, tangential, tiltX, tiltZ);
      }
    }
    // top paving slabs (inside the top ring)
    {
      const top = tierTops[2];
      const inner = tierRadii[2] - ringDepth + 0.15;
      const step = 1.35;
      for (let gxi = -3; gxi <= 3; gxi += 1) {
        for (let gzi = -3; gzi <= 3; gzi += 1) {
          const lx = gxi * step;
          const lz = gzi * step;
          if (Math.hypot(lx, lz) > inner) continue;
          const a = Math.atan2(lz, lx);
          if (Math.hypot(lx, lz) > inner - 0.7 && inStairSector(a, Math.hypot(lx, lz), 0.2)) continue;
          const heave = random() < 0.1 ? 0.08 : 0;
          pushBlock(cx + lx, top - 0.09 - random() * 0.04 + heave, cz + lz, (random() - 0.5) * 0.04, 1.4, 0.18, 1.4, (random() - 0.5) * 0.05 + heave, (random() - 0.5) * 0.05);
        }
      }
    }
    // tier tops are walkable everywhere except in the stair cut
    walk.custom.push((x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      const r = Math.hypot(dx, dz);
      if (r > tierRadii[0]) return NONE;
      const along = dx * sdx + dz * sdz;
      const lateral = -dx * sdz + dz * sdx;
      if (along > tierRadii[2] - 0.25 && Math.abs(lateral) <= stairHalfWidth + 0.05) return NONE;
      for (let t = 2; t >= 0; t -= 1) {
        if (r <= tierRadii[t]) return tierTops[t];
      }
      return NONE;
    });

    // ---- stair through the tiers ----
    {
      const steps = 5;
      const depth = 0.72;
      const rise = 0.31;
      const firstTop = tierTops[2] - rise; // 7.55
      const start = tierRadii[2] - 0.25;
      for (let k = 0; k < steps; k += 1) {
        const d = start + depth * (k + 0.5);
        const top = firstTop - rise * k;
        pushBlock(cx + sdx * d, top - 0.2, cz + sdz * d, -stairAngle, depth + 0.04, 0.4, stairHalfWidth * 2, 0, 0);
      }
      walk.stairs.push({ x: cx, z: cz, dx: sdx, dz: sdz, start, depth, rise, topY: firstTop, count: steps, halfWidth: stairHalfWidth });
      // worn mossy steps continuing down the knoll toward the trail
      const lower = [];
      for (let k = 0; k < 6; k += 1) {
        const d = 13.2 + k * 1.3;
        const x = cx + sdx * d;
        const z = cz + sdz * d;
        const g = groundAt(x, z);
        const top = g + 0.14;
        pushBlock(x, top - 0.2, z, -stairAngle + (random() - 0.5) * 0.05, 1.3, 0.4, 2.6 + (random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.04);
        lower.push({ d, top });
      }
      walk.custom.push((x, z) => {
        const dx = x - cx;
        const dz = z - cz;
        const lateral = -dx * sdz + dz * sdx;
        if (Math.abs(lateral) > 1.3) return NONE;
        const along = dx * sdx + dz * sdz;
        for (const s of lower) {
          if (Math.abs(along - s.d) <= 0.65) return s.top;
        }
        return NONE;
      });
    }

    // ---- pillars: 8 around the top tier, some broken / fallen ----
    const pillarR = 3.8;
    const drumH = 1.35;
    const capitalH = 0.35;
    const pillarBase = tierTops[2];
    const pillarAngles = [];
    for (let k = 0; k < 8; k += 1) {
      pillarAngles.push(stairAngle + Math.PI / 8 + (k * Math.PI) / 4);
    }
    function pushDrum(x, y, z, yaw, tiltX = 0, tiltZ = 0, order = 'XYZ') {
      dummy.position.set(x, y, z);
      dummy.rotation.set(tiltX, yaw, tiltZ, order);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      drumSpots.push(dummy.matrix.clone());
    }
    function standingPillar(k, drums, capital) {
      const a = pillarAngles[k];
      const x = cx + Math.cos(a) * pillarR;
      const z = cz + Math.sin(a) * pillarR;
      for (let d = 0; d < drums; d += 1) {
        pushDrum(x, pillarBase + drumH * (d + 0.5), z, random() * TAU, (random() - 0.5) * 0.012, (random() - 0.5) * 0.012);
      }
      const topY = pillarBase + drumH * drums;
      if (capital) {
        pushBlock(x, topY + capitalH / 2, z, a, 1.0, capitalH, 1.0);
      }
      walk.discs.push({ x, z, r: 0.5, y: topY + (capital ? capitalH : 0) });
      return { x, z, topY: topY + (capital ? capitalH : 0) };
    }
    // fallen drum lying on the ground/platform: axis horizontal along yaw
    function fallenDrum(x, z, yaw, restY, roll = 0) {
      // drum axis is local +y; lay it down: rotate about local x by 90°, then yaw
      dummy.position.set(x, restY + 0.42, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      quatYaw.setFromAxisAngle(UP, yaw);
      dummy.quaternion.premultiply(quatYaw);
      dummy.rotateY(roll);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      drumSpots.push(dummy.matrix.clone());
      // local +y → (0,0,1) after the X rotation → (sin yaw, 0, cos yaw) after the yaw
      const hx = Math.sin(yaw) * drumH * 0.5;
      const hz = Math.cos(yaw) * drumH * 0.5;
      walk.capsules.push({ ax: x - hx, az: z - hz, bx: x + hx, bz: z + hz, ya: restY + 0.42, yb: restY + 0.42, r: 0.42 });
    }

    const p0 = standingPillar(0, 3, true);
    const p1 = standingPillar(1, 3, true);
    standingPillar(2, 2, false);
    standingPillar(4, 3, false);
    standingPillar(5, 1, false);
    standingPillar(6, 3, true);
    const p7 = standingPillar(7, 3, true);
    // pillar 2's top drum tumbled onto the tier below
    {
      const a = pillarAngles[2];
      fallenDrum(cx + Math.cos(a) * 5.4, cz + Math.sin(a) * 5.4, a + 1.2, tierTops[1], 0.3);
    }
    // pillar 3 fell outward in three cracked segments across the tiers
    {
      const a = pillarAngles[3];
      const dists = [4.9, 6.7, 8.9];
      const rests = [tierTops[1], tierTops[0], groundAt(cx + Math.cos(a) * 8.9, cz + Math.sin(a) * 8.9) - 0.12];
      for (let i = 0; i < 3; i += 1) {
        const jitter = (random() - 0.5) * 0.25;
        fallenDrum(cx + Math.cos(a) * dists[i] - Math.sin(a) * jitter, cz + Math.sin(a) * dists[i] + Math.cos(a) * jitter, -a + (random() - 0.5) * 0.35, rests[i], random());
      }
      // its capital lies further down the slope
      const d = 11.2;
      const gx = cx + Math.cos(a) * d;
      const gz = cz + Math.sin(a) * d;
      pushBlock(gx, groundAt(gx, gz) + 0.1, gz, random() * TAU, 1.0, capitalH, 1.0, 0.4, 0.2);
    }
    // pillar 4's capital beside it
    {
      const a = pillarAngles[4];
      const gx = cx + Math.cos(a) * 3.0 - Math.sin(a) * 1.1;
      const gz = cz + Math.sin(a) * 3.0 + Math.cos(a) * 1.1;
      pushBlock(gx, tierTops[2] + capitalH / 2 + 0.02, gz, random() * TAU, 1.0, capitalH, 1.0, 0.08, 0.03);
    }
    // pillar 5's two drums lie on the paving
    {
      const a = pillarAngles[5];
      fallenDrum(cx + Math.cos(a) * 2.3 - Math.sin(a) * 0.9, cz + Math.sin(a) * 2.3 + Math.cos(a) * 0.9, a + 0.35, tierTops[2], 0.5);
      fallenDrum(cx + Math.cos(a) * 1.6 + Math.sin(a) * 0.9, cz + Math.sin(a) * 1.6 - Math.cos(a) * 0.9, a + 0.6, tierTops[2], 1.4);
    }
    // lintels: gateway over the stair (7→0) and 0→1
    function lintel(pa, pb) {
      const mx = (pa.x + pb.x) / 2;
      const mz = (pa.z + pb.z) / 2;
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const len = Math.hypot(dx, dz) + 1.0;
      const yaw = -Math.atan2(dz, dx);
      const y = Math.max(pa.topY, pb.topY) + 0.26;
      pushBlock(mx, y, mz, yaw, len, 0.5, 0.75, 0, (random() - 0.5) * 0.02);
    }
    lintel(p7, p0);
    lintel(p0, p1);
    // altar block at the center
    pushBlock(cx, tierTops[2] + 0.45, cz, stairAngle, 1.7, 0.9, 1.1);
    walk.discs.push({ x: cx, z: cz, r: 0.95, y: tierTops[2] + 0.9 });

    // ---- tumbled blocks on the knoll slopes ----
    for (let i = 0; i < 16; i += 1) {
      const a = random() * TAU;
      if (inStairSector(a, 10, 1.5)) continue;
      const d = 8.6 + random() * 6;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const s = 0.8 + random() * 0.7;
      const g = groundAt(x, z);
      pushBlock(x, g + s * 0.2, z, random() * TAU, s * 1.3, s * 0.7, s, (random() - 0.5) * 0.8, (random() - 0.5) * 0.8);
    }

    // ---- overgrowth: leafy vines draped over edges and pillars ----
    for (let i = 0; i < 12; i += 1) {
      const a = random() * TAU;
      if (inStairSector(a, tierRadii[0], 0.6)) continue;
      const R = tierRadii[0] + 0.05;
      vineSpots.push({ x: cx + Math.cos(a) * R, y: tierTops[0] + 0.1, z: cz + Math.sin(a) * R, s: 0.22 + random() * 0.14 });
    }
    for (let i = 0; i < 6; i += 1) {
      const a = random() * TAU;
      const R = tierRadii[1] + 0.05;
      vineSpots.push({ x: cx + Math.cos(a) * R, y: tierTops[1] + 0.1, z: cz + Math.sin(a) * R, s: 0.16 + random() * 0.1 });
    }
    for (const p of [p0, p1, p7]) {
      vineSpots.push({ x: p.x + (random() - 0.5) * 0.9, y: p.topY + 0.3, z: p.z + (random() - 0.5) * 0.9, s: 0.55 + random() * 0.3 });
    }
    // ferns sprouting from cracks on the tiers
    for (let i = 0; i < 10; i += 1) {
      const a = random() * TAU;
      const t = Math.floor(random() * 2);
      const R = tierRadii[t] - 0.4;
      fernSpots.push({ x: cx + Math.cos(a) * R, y: tierTops[t] - 0.05, z: cz + Math.sin(a) * R, s: 0.5 + random() * 0.4, yaw: random() * TAU });
    }
  }

  // ============================================================ 3. fallen logs, stumps, log bridge, mushrooms
  function buildLogsAndStumps() {
    const random = mulberry32(WORLD.seed + 4020);
    const half = WORLD.size / 2 - 20;
    const taken = [];
    const farFromTaken = (x, z, min) => taken.every((p) => Math.hypot(p.x - x, p.z - z) > min);

    function logOk(ax, az, bx, bz) {
      for (let i = 0; i <= 4; i += 1) {
        const t = i / 4;
        const x = lerp(ax, bx, t);
        const z = lerp(az, bz, t);
        if (groundAt(x, z) < 0.9) return false;
        if (terrain.trailDistance(x, z) < 3.2) return false;
        if (terrain.waterProximity(x, z) > 0.45) return false;
        if (distToGiantTree(x, z) < 15 || distToRuins(x, z) < 20) return false;
        if (terrain.zonesAt(x, z).overlook > 0.05) return false;
      }
      return true;
    }

    // a log resting on the ground between two points (axis lifted so the bark just sinks in)
    function restingLog(ax, az, bx, bz, r, embed = 0.28) {
      const samples = 9;
      const ga = groundAt(ax, az);
      const gb = groundAt(bx, bz);
      let hi = 0;
      for (let i = 1; i < samples; i += 1) {
        const t = i / samples;
        const g = groundAt(lerp(ax, bx, t), lerp(az, bz, t));
        hi = Math.max(hi, g - lerp(ga, gb, t));
      }
      // axis sits (1 - embed)·r above the end points; a bump in the middle props it up
      const lift = r * (1 - embed) + Math.max(0, hi - r * 0.55);
      return { ax, ay: ga + lift, az, bx, by: gb + lift, bz, r };
    }

    // ---- stump set pieces: broken giant + its fallen trunk + roots + fungi ----
    const stumpCandidates = [
      [0, 3, 0.5, 1], [2, 1, 0.5, -1], [3, 1, 0.55, -1], [1, 4, 0.45, 1], [0, 8, 0.5, 1], [2, 3, 0.5, 1], [1, 6, 0.5, -1], [3, 3, 0.5, 1],
      [0, 6, 0.4, -1], [2, 4, 0.55, -1], [3, 4, 0.5, 1], [1, 2, 0.5, -1], [0, 7, 0.6, 1], [2, 5, 0.4, 1],
    ];
    let stumps = 0;
    for (const [trail, seg, t, side] of stumpCandidates) {
      if (stumps >= 5) break;
      const p = trailPoint(trail, seg, t);
      const off = 6.5 + random() * 1.5;
      const x = p.x - p.dz * side * off;
      const z = p.z + p.dx * side * off;
      const g = groundAt(x, z);
      terrain.sampleNormal(x, z, normalTmp);
      if (g < 1.4 || normalTmp.y < 0.86 || terrain.waterProximity(x, z) > 0.3 || zoneWeight(x, z) > 0.1) continue;
      if (distToGiantTree(x, z) < 22 || distToRuins(x, z) < 22 || !farFromTaken(x, z, 30)) continue;
      // the trunk fell away from the trail
      const fallYaw = Math.atan2(p.dx * side, -p.dz * side) + (random() - 0.5) * 0.8;
      const len = 9 + random() * 5;
      const r = 0.55 + random() * 0.2;
      const sx = x + Math.cos(fallYaw) * (2.2 + r);
      const sz = z + Math.sin(fallYaw) * (2.2 + r);
      const ex = sx + Math.cos(fallYaw) * len;
      const ez = sz + Math.sin(fallYaw) * len;
      if (!logOk(sx, sz, ex, ez)) continue;
      taken.push({ x, z });
      stumps += 1;
      places.stumps.push({ x, z });
      const stumpR = r * 1.25;
      const stumpH = 1.6 + random() * 1.1;
      const stump = stumpGeometry(stumpR, stumpH, WORLD.seed + 300 + stumps);
      stump.translate(x, g - 0.05, z);
      barkStatic.push(stump);
      walk.discs.push({ x, z, r: stumpR * 1.05, y: g + stumpH });
      // roots fanning out from the stump
      const roots = 6 + Math.floor(random() * 3);
      for (let k = 0; k < roots; k += 1) {
        let a = (k / roots) * TAU + random() * 0.5;
        const rl = 2.5 + random() * 3.5;
        const r0 = 0.16 + random() * 0.12;
        const pts = [];
        const N = 8;
        for (let i = 0; i < N; i += 1) {
          const tt = i / (N - 1);
          a += (random() - 0.5) * 0.25;
          const d = stumpR * 0.7 + rl * tt;
          const px = x + Math.cos(a) * d;
          const pz = z + Math.sin(a) * d;
          const rr = r0 * (1 - 0.75 * tt);
          const arch = Math.sin(tt * Math.PI) * 0.35;
          pts.push(new THREE.Vector3(px, groundAt(px, pz) - rr * 0.5 + arch * rr * 1.5 + (1 - tt) * 0.25, pz));
        }
        const tube = tubeAlong(pts, (tt) => r0 * (1 - 0.75 * tt) + 0.015, 6, { uRepeat: 2, vScale: 0.9 });
        withCap(tube, 0);
        barkStatic.push(tube);
      }
      logSpots.push({ ...restingLog(sx, sz, ex, ez, r, 0.3), fungi: 4 });
    }

    // ---- the sentinel snag's snapped crown limb, lying on the cliff top behind it ----
    {
      const a = SNAG.fallYaw ?? -0.6;
      const ax = SNAG.x + Math.cos(a) * 3.6;
      const az = SNAG.z + Math.sin(a) * 3.6;
      const bx = ax + Math.cos(a + 0.25) * 8.5;
      const bz = az + Math.sin(a + 0.25) * 8.5;
      logSpots.push({ ...restingLog(ax, az, bx, bz, 0.4, 0.3), fungi: 0 });
    }

    // ---- scattered logs across the explorable core ----
    let tries = 0;
    let placed = 0;
    while (placed < 15 && tries < 4000) {
      tries += 1;
      const x = (random() * 2 - 1) * half * 0.85;
      const z = (random() * 2 - 1) * half * 0.85;
      const td = terrain.trailDistance(x, z);
      if (td < 5 || td > 17) continue;
      if (terrain.zonesAt(x, z).clearing > 0.3) continue; // meadow grass would swallow it
      const yaw = random() * TAU;
      const len = 6 + random() * 7;
      const r = 0.38 + random() * 0.28;
      const ex = x + Math.cos(yaw) * len;
      const ez = z + Math.sin(yaw) * len;
      if (!logOk(x, z, ex, ez) || !farFromTaken((x + ex) / 2, (z + ez) / 2, 22)) continue;
      terrain.sampleNormal(x, z, normalTmp);
      if (normalTmp.y < 0.8) continue;
      taken.push({ x: (x + ex) / 2, z: (z + ez) / 2 });
      placed += 1;
      logSpots.push({ ...restingLog(x, z, ex, ez, r, 0.28), fungi: random() < 0.65 ? 2 + Math.floor(random() * 3) : 0 });
    }

    // ---- log bridge: two trunks meeting on a mid-river boulder ----
    {
      const z = 36;
      const cxRiver = terrain.riverCenterX(z);
      const rockTop = 1.0;
      const findBank = (dir) => {
        for (let d = 0; d < 30; d += 0.25) {
          const x = cxRiver + dir * d;
          if (groundAt(x, z + dir * 1.2) > 1.35) return x;
        }
        return cxRiver + dir * 14;
      };
      const westX = findBank(-1) - 1.2;
      const eastX = findBank(1) + 1.2;
      const r = 0.5;
      const rockR = 2.3;
      // island boulder (top ≈ rockTop, bottom well below the river bed)
      boulderSpots.push({ x: cxRiver, y: rockTop - 0.82 * 2.2, z: z + 0.6, yaw: 0.7, sx: rockR, sy: 2.2, sz: rockR * 0.9, tilt: 0 });
      walk.discs.push({ x: cxRiver, z: z + 0.6, r: rockR * 0.8, y: rockTop });
      // west log: bank → rock
      const wa = { x: westX, z: z - 1.2 };
      const wb = { x: cxRiver - rockR * 0.55, z: z + 0.35 };
      const ea = { x: cxRiver + rockR * 0.55, z: z + 0.85 };
      const eb = { x: eastX, z: z + 2.4 };
      const gW = groundAt(wa.x, wa.z);
      const gE = groundAt(eb.x, eb.z);
      places.bridge = { x: cxRiver, z, westX, eastX };
      logSpots.push({ ax: wa.x, ay: gW + 0.28 - r, az: wa.z, bx: wb.x, by: rockTop + 0.35 - r, bz: wb.z, r, fungi: 0, bridge: true });
      logSpots.push({ ax: ea.x, ay: rockTop + 0.35 - r, az: ea.z, bx: eb.x, by: gE + 0.28 - r, bz: eb.z, r, fungi: 0, bridge: true });
      // a couple of stones at the water's edge under the log ends
      for (const [px, pz] of [[wa.x + 1.6, wa.z + 0.9], [eb.x - 1.5, eb.z - 1.0]]) {
        const g = groundAt(px, pz);
        boulderSpots.push({ x: px, y: g - 0.35, z: pz, yaw: random() * TAU, sx: 1.0, sy: 0.7, sz: 0.9, tilt: 0 });
      }
    }

    // ---- instanced logs ----
    const logGeo = logGeometry(WORLD.seed + 11);
    const logMesh = new THREE.InstancedMesh(logGeo, barkMaterial, logSpots.length);
    const axis = new THREE.Vector3();
    logSpots.forEach((l, i) => {
      axis.set(l.bx - l.ax, l.by - l.ay, l.bz - l.az);
      const len = axis.length();
      axis.normalize();
      dummy.position.set(l.ax, l.ay, l.az);
      quat.setFromUnitVectors(UP, axis);
      quatYaw.setFromAxisAngle(UP, random() * TAU);
      dummy.quaternion.copy(quat).multiply(quatYaw);
      dummy.scale.set(l.r, len, l.r);
      dummy.updateMatrix();
      logMesh.setMatrixAt(i, dummy.matrix);
      walk.capsules.push({ ax: l.ax, az: l.az, bx: l.bx, bz: l.bz, ya: l.ay, yb: l.by, r: l.r * 0.95 });
      places.logs.push({ x: (l.ax + l.bx) / 2, z: (l.az + l.bz) / 2, dx: axis.x, dz: axis.z, len, bridge: Boolean(l.bridge) });
      // shelf mushrooms on the shaded flanks
      for (let m = 0; m < l.fungi; m += 1) {
        const t = 0.15 + random() * 0.7;
        const side = random() > 0.5 ? 1 : -1;
        const nx = -axis.z * side;
        const nz = axis.x * side;
        const rr = l.r * (1 - 0.3 * t) * 0.97;
        const ang = 0.35 + random() * 0.45; // radians below the top, on the flank
        const px = lerp(l.ax, l.bx, t) + nx * Math.sin(ang) * rr;
        const pz = lerp(l.az, l.bz, t) + nz * Math.sin(ang) * rr;
        const py = lerp(l.ay, l.by, t) + Math.cos(ang) * rr - 0.03;
        mushroomSpots.push({ x: px, y: py, z: pz, yaw: Math.atan2(-nz, nx), s: 0.14 + random() * 0.2 });
      }
    });
    register(logMesh, { castShadow: true, cull: false, name: 'lm-logs' });
  }

  // ============================================================ 4. ravine root arches
  function buildRavineArches() {
    const random = mulberry32(WORLD.seed + 4030);
    const arches = [-36, -49, -52.5, -64];
    for (const z of arches) {
      const cxG = WORLD.ravine.x + Math.sin(z * 0.03) * WORLD.ravine.wiggle;
      const floor = groundAt(cxG, z);
      places.arches.push({ x: cxG, z });
      const roots = 3 + Math.floor(random() * 2);
      for (let k = 0; k < roots; k += 1) {
        const zo = (random() - 0.5) * 1.6;
        const xa = cxG - 8.6 - random() * 1.2;
        const xb = cxG + 8.6 + random() * 1.2;
        const za = z + zo + (random() - 0.5) * 1.5;
        const zb = z + zo + (random() - 0.5) * 1.5;
        const ya = groundAt(xa, za) - 0.25;
        const yb = groundAt(xb, zb) - 0.25;
        const apex = floor + 3.9 + random() * 1.1;
        const r0 = 0.3 + random() * 0.2;
        const pts = [];
        const N = 22;
        for (let i = 0; i < N; i += 1) {
          const t = i / (N - 1);
          const base = lerp(ya, yb, t);
          const lift = (apex - Math.max(ya, yb)) * Math.pow(Math.sin(Math.PI * t), 0.85);
          pts.push(new THREE.Vector3(
            lerp(xa, xb, t) + Math.sin(t * 11 + k) * 0.15,
            base + lift + Math.sin(t * 9 + k * 2) * 0.12,
            lerp(za, zb, t) + Math.sin(t * Math.PI * 2 + k) * 0.45
          ));
        }
        const tube = tubeAlong(pts, (t) => r0 * (0.75 + 0.5 * Math.sin(Math.PI * t) ** 0.5) + 0.03, 8, { uRepeat: 2, vScale: 0.6 });
        withCap(tube, 0);
        barkStatic.push(tube);
        // anchoring rootlets at both ends
        for (const [ex, ez] of [[xa, za], [xb, zb]]) {
          for (let j = 0; j < 2; j += 1) {
            const a = random() * TAU;
            const rl = 1.5 + random() * 1.5;
            const p2 = [];
            for (let i = 0; i < 5; i += 1) {
              const t = i / 4;
              const px = ex + Math.cos(a) * rl * t;
              const pz = ez + Math.sin(a) * rl * t;
              p2.push(new THREE.Vector3(px, groundAt(px, pz) - 0.05 + Math.sin(t * Math.PI) * 0.12, pz));
            }
            const rt = tubeAlong(p2, (t) => r0 * 0.5 * (1 - 0.8 * t) + 0.015, 5, { uRepeat: 1, vScale: 1 });
            withCap(rt, 0);
            barkStatic.push(rt);
          }
        }
        // vines hanging off the arch
        if (k < 2) {
          for (let v = 0; v < 2; v += 1) {
            const p = pts[8 + Math.floor(random() * 6)];
            vineSpots.push({ x: p.x, y: p.y - 0.15, z: p.z, s: 0.35 + random() * 0.3 });
          }
        }
      }
    }
  }

  // ============================================================ 5. rocks
  function buildRocks() {
    const random = mulberry32(WORLD.seed + 4040);

    // The boulder geometry spans ±0.82·sy vertically; sink `embed` of its height into the ground.
    function groundedBoulder(x, z, sx, sy, sz, { embed = 0.2, yaw = random() * TAU, alignBlend = 1 } = {}) {
      const g = groundAt(x, z);
      const y = g + sy * 0.82 * (1 - 2 * embed);
      boulderSpots.push({ x, y, z, yaw, sx, sy, sz, tilt: alignBlend });
      if (sy > 0.35) {
        walk.ellipsoids.push({ x, y, z, yaw, sx, sy, sz });
      }
    }

    // ---- overlook: standing stones, a balanced rock, the sitting rock ----
    {
      const ox = WORLD.overlook.x;
      const oz = WORLD.overlook.z;
      const stones = [
        { a: 5.2, d: 5.2, h: 4.2, w: 1.5 },
        { a: 5.75, d: 6.4, h: 3.2, w: 1.2 },
        { a: 0.35, d: 5.6, h: 4.6, w: 1.6 },
        { a: 1.05, d: 6.2, h: 2.6, w: 1.3 },
        { a: 1.55, d: 6.6, h: 2.2, w: 1.1 },
        { a: 4.6, d: 6.4, h: 3.5, w: 1.3 },
      ];
      for (const s of stones) {
        const x = ox + Math.cos(s.a) * s.d;
        const z = oz + Math.sin(s.a) * s.d;
        const g = groundAt(x, z);
        monolithSpots.push({ x, y: g - 0.35, z, yaw: random() * TAU, sx: s.w, sy: s.h, sz: s.w * (0.55 + random() * 0.2), tiltX: (random() - 0.5) * 0.1, tiltZ: (random() - 0.5) * 0.1 });
        walk.discs.push({ x, z, r: s.w * 0.55, y: g + s.h });
      }
      // balanced boulder on the shortest stone
      const bs = stones[4];
      const bx = ox + Math.cos(bs.a) * bs.d;
      const bz = oz + Math.sin(bs.a) * bs.d;
      boulderSpots.push({ x: bx, y: groundAt(bx, bz) - 0.35 + bs.h - 0.1 + 0.75 * 0.85, z: bz, yaw: 1.2, sx: 0.95, sy: 0.75, sz: 0.85, tilt: 0 });
      // the sitting rock at the cliff edge
      const sx = ox - 6.4;
      const sz = oz - 0.8;
      groundedBoulder(sx, sz, 1.7, 0.5, 1.25, { embed: 0.3, yaw: 0.2, alignBlend: 0 });
      // plateau boulders
      for (let i = 0; i < 7; i += 1) {
        const a = 4.3 + random() * 3.4;
        const d = 4.5 + random() * 3.5;
        const x = ox + Math.cos(a) * d;
        const z = oz + Math.sin(a) * d;
        const s = 0.5 + random() * 0.8;
        groundedBoulder(x, z, s * (0.9 + random() * 0.4), s * 0.8, s * (0.9 + random() * 0.4));
      }
    }

    // ---- terrace risers: boulder fields where the shelves step ----
    {
      const tz = WORLD.terraces;
      const cands = [];
      for (let z = tz.z - 48; z <= tz.z + 48; z += 3) {
        for (let x = tz.x - 48; x <= tz.x + 48; x += 3) {
          const zone = terrain.zonesAt(x, z);
          if (zone.terrace < 0.35) continue;
          terrain.sampleNormal(x, z, normalTmp);
          if (normalTmp.y > 0.86 || normalTmp.y < 0.45) continue;
          if (groundAt(x, z) < 3) continue;
          if (terrain.trailDistance(x, z) < 3.5) continue;
          cands.push({ x: x + (random() - 0.5) * 2.4, z: z + (random() - 0.5) * 2.4, steep: 1 - normalTmp.y });
        }
      }
      // deterministic shuffle
      for (let i = cands.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const t = cands[i];
        cands[i] = cands[j];
        cands[j] = t;
      }
      const chosen = [];
      for (const c of cands) {
        if (chosen.length >= 56) break;
        if (chosen.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 3.2)) chosen.push(c);
      }
      for (const c of chosen) {
        const s = 0.45 + random() * 1.1 + c.steep * 1.6;
        groundedBoulder(c.x, c.z, s * (0.85 + random() * 0.5), s * (0.7 + random() * 0.3), s * (0.85 + random() * 0.5), { embed: 0.18 + random() * 0.08 });
      }
    }

    // ---- ravine: mossy boulders along the gully edges ----
    for (let i = 0; i < 14; i += 1) {
      const z = -78 + i * 8.2 + (random() - 0.5) * 4;
      const cxG = WORLD.ravine.x + Math.sin(z * 0.03) * WORLD.ravine.wiggle;
      const side = i % 2 ? 1 : -1;
      const x = cxG + side * (3.6 + random() * 2.6);
      if (terrain.trailDistance(x, z) < 3) continue;
      const s = 0.6 + random() * 1.2;
      groundedBoulder(x, z, s * (0.9 + random() * 0.4), s * 0.85, s * (0.9 + random() * 0.4), { embed: 0.24 });
    }

    // ---- ridge crest: weathered boulders along the skyline ----
    for (let i = 0; i < 16; i += 1) {
      const z = -70 + i * 10.5 + (random() - 0.5) * 6;
      const x = WORLD.ridge.x + Math.sin(z * 0.02) * 10 + (random() - 0.5) * 9;
      if (Math.hypot(x - WORLD.overlook.x, z - WORLD.overlook.z) < 16) continue;
      if (terrain.trailDistance(x, z) < 3.5) continue;
      const s = 0.9 + random() * 1.7;
      groundedBoulder(x, z, s * (0.9 + random() * 0.5), s * (0.75 + random() * 0.3), s * (0.9 + random() * 0.5), { embed: 0.22 });
    }

    // ---- stepping stones across the two river crossings of the trail network ----
    // A natural rock bar: low, wide, mostly submerged boulders with an odd gap;
    // every fifth one is a bigger anchor stone. Tops sit 0.12–0.55 m above the water.
    function steppingStones(trailIndex, segFrom, segTo) {
      const trail = WORLD.trails[trailIndex];
      let carry = 0;
      let count = 0;
      for (let s = segFrom; s <= segTo; s += 1) {
        const a = trail[s];
        const b = trail[s + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let d = carry;
        while (d < len) {
          const t = d / len;
          const x = lerp(a[0], b[0], t) + (random() - 0.5) * 1.2;
          const z = lerp(a[1], b[1], t) + (random() - 0.5) * 1.2;
          const g = groundAt(x, z);
          d += 1.8 + random() * 0.6;
          if (g > 0.3) continue; // dry ground: no stone needed
          if (random() < 0.1) continue; // a missing stone now and then
          count += 1;
          const anchor = count % 5 === 0;
          const top = anchor ? 0.4 + random() * 0.15 : 0.12 + random() * 0.18;
          const sy = Math.max(0.45, (top - g + 0.3) / 1.64);
          const sx = Math.max(anchor ? 1.2 + random() * 0.3 : 0.6 + random() * 0.4, sy * 0.75);
          boulderSpots.push({ x, y: top - sy * 0.82, z, yaw: random() * TAU, sx, sy, sz: sx * (0.8 + random() * 0.35), tilt: 0 });
          walk.discs.push({ x, z, r: sx * 0.72, y: top });
        }
        carry = d - len;
      }
    }
    steppingStones(0, 3, 5);
    steppingStones(1, 4, 6);

    // ---- instanced boulders ----
    const boulderGeo = boulderGeometry(WORLD.seed + 5);
    const boulders = new THREE.InstancedMesh(boulderGeo, boulderMaterial, boulderSpots.length);
    boulderSpots.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      if (b.tilt > 0) {
        alignToSlope(b.x, b.z, b.yaw, b.tilt);
      } else {
        dummy.quaternion.setFromAxisAngle(UP, b.yaw);
      }
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      boulders.setMatrixAt(i, dummy.matrix);
    });
    register(boulders, { castShadow: true, cull: false, name: 'lm-boulders' });

    const monoGeo = monolithGeometry(WORLD.seed + 6);
    const monoliths = new THREE.InstancedMesh(monoGeo, boulderMaterial, monolithSpots.length);
    monolithSpots.forEach((m, i) => {
      dummy.position.set(m.x, m.y, m.z);
      dummy.rotation.set(m.tiltX, m.yaw, m.tiltZ);
      dummy.scale.set(m.sx, m.sy, m.sz);
      dummy.updateMatrix();
      monoliths.setMatrixAt(i, dummy.matrix);
    });
    register(monoliths, { castShadow: true, name: 'lm-monoliths' });
  }

  // ============================================================ 6. trail dressing
  function buildTrailDressing() {
    const random = mulberry32(WORLD.seed + 4050);

    // ---- stone lanterns / waymarkers beside junctions and approaches ----
    const markers = [
      [0, 4, 0.92, 1], // shore junction (30,6) approach
      [1, 0, 0.35, -1], // start of the clearing trail
      [0, 1, 0.15, 1], // spawn junction (-22,20)
      [1, 3, 0.85, -1], // clearing junction (62,64)
      [3, 1, 0.6, 1], // bamboo corridor near the giant tree
      [0, 9, 0.5, -1], // overlook climb
      [2, 2, 0.5, 1], // ravine trail
      [1, 7, 0.55, 1], // ruins approach
    ];
    for (const [trail, seg, t, side] of markers) {
      const p = trailPoint(trail, seg, t);
      const off = 3.1;
      const x = p.x - p.dz * side * off;
      const z = p.z + p.dx * side * off;
      const g = groundAt(x, z);
      if (g < 0.8) continue;
      lanternSpots.push({ x, y: g - 0.08, z, yaw: Math.atan2(p.dx, -p.dz) + (random() - 0.5) * 0.3, s: 0.9 + random() * 0.25 });
      walk.discs.push({ x, z, r: 0.42, y: g + 1.9 });
    }
    const lanternGeo = lanternGeometry();
    const lanterns = new THREE.InstancedMesh(lanternGeo, stoneMaterial, lanternSpots.length);
    lanternSpots.forEach((l, i) => {
      dummy.position.set(l.x, l.y, l.z);
      alignToSlope(l.x, l.z, l.yaw, 0.5);
      dummy.scale.set(l.s, l.s, l.s);
      dummy.updateMatrix();
      lanterns.setMatrixAt(i, dummy.matrix);
    });
    register(lanterns, { castShadow: false, cull: false, name: 'lm-waymarkers' });

    // ---- rope-and-post railing along the overlook's cliff edge ----
    const ox = WORLD.overlook.x;
    const oz = WORLD.overlook.z;
    const posts = [];
    const postR = 8.7;
    for (let a = 1.95; a <= 4.35; a += 0.235) {
      const x = ox + Math.cos(a) * postR + (random() - 0.5) * 0.2;
      const z = oz + Math.sin(a) * postR + (random() - 0.5) * 0.2;
      const g = groundAt(x, z);
      posts.push({ x, z, g, h: 1.05 + (random() - 0.5) * 0.08, lean: (random() - 0.5) * 0.06 });
    }
    const ropeParts = [];
    posts.forEach((p, i) => {
      const top = new THREE.Vector3(p.x + p.lean, p.g + p.h, p.z + p.lean * 0.5);
      const post = tubeAlong([new THREE.Vector3(p.x, p.g - 0.35, p.z), top], () => 0.075, 8, { uRepeat: 1, vScale: 1.2, closeEnd: true });
      withCap(post, 0);
      barkStatic.push(post);
      if (i > 0) {
        const q = posts[i - 1];
        const from = new THREE.Vector3(q.x + q.lean, q.g + q.h - 0.12, q.z + q.lean * 0.5);
        const to = new THREE.Vector3(top.x, top.y - 0.12, top.z);
        const pts = [];
        const N = 10;
        for (let k = 0; k < N; k += 1) {
          const t = k / (N - 1);
          const sag = -0.19 * Math.sin(Math.PI * t);
          pts.push(new THREE.Vector3(lerp(from.x, to.x, t), lerp(from.y, to.y, t) + sag, lerp(from.z, to.z, t)));
        }
        ropeParts.push(tubeAlong(pts, () => 0.035, 6, { uRepeat: 1, vScale: 1.6 }));
      }
    });
    const ropeGeo = mergeGeometries(ropeParts);
    ropeParts.forEach((p) => p.dispose());
    const rope = new THREE.Mesh(ropeGeo, ropeMaterial);
    register(rope, { castShadow: false, name: 'lm-rope' });
  }

  // ============================================================ build everything
  buildGiantTree();
  buildSentinelSnag();
  buildRuins();
  buildLogsAndStumps();
  buildRavineArches();
  buildRocks();
  buildTrailDressing();

  // ---- static bark mesh: roots, stumps, arches, posts ----
  {
    const merged = mergeGeometries(barkStatic);
    barkStatic.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, barkMaterial);
    register(mesh, { castShadow: true, cull: false, name: 'lm-roots' });
  }

  // ---- ruins blocks + drums ----
  {
    const blockGeo = chamferBox(1, 1, 1, 0.06);
    const blocks = new THREE.InstancedMesh(blockGeo, stoneMaterial, blockSpots.length);
    blockSpots.forEach((m, i) => blocks.setMatrixAt(i, m));
    register(blocks, { castShadow: true, name: 'lm-ruin-blocks' });

    const drumGeo = drumGeometry();
    const drums = new THREE.InstancedMesh(drumGeo, stoneMaterial, drumSpots.length);
    drumSpots.forEach((m, i) => drums.setMatrixAt(i, m));
    register(drums, { castShadow: true, name: 'lm-ruin-pillars' });
  }

  // ---- giant crown clusters ----
  {
    const random = mulberry32(WORLD.seed + 4060);
    const crownGeo = prepareFoliage(crossedCards(8.5, 6.6, 3, true), 0.78);
    const crownMat = foliageMaterial(textures.canopy, { tintSpread: 0.14, lift: 1.1, wind: { strength: 0.35, speed: 0.42 } });
    const crown = new THREE.InstancedMesh(crownGeo, crownMat, crownSpots.length);
    crownSpots.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set((random() - 0.5) * 0.4, random() * TAU, (random() - 0.5) * 0.4);
      dummy.scale.set(c.s, c.s * (0.8 + random() * 0.3), c.s);
      dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix);
    });
    register(crown, { castShadow: true, name: 'lm-giant-crown' });
  }

  // ---- hanging vine cards (giant tree lianas, ruins overgrowth, ravine arches) ----
  {
    const random = mulberry32(WORLD.seed + 4061);
    const vineBase = new THREE.PlaneGeometry(0.6, 6, 1, 6);
    vineBase.translate(0, -3, 0);
    const vineGeo = prepareFoliage(vineBase, 0.55);
    const vineMat = foliageMaterial(textures.vine, { tintSpread: 0.12, wind: { strength: 0.35, speed: 0.55, hangFromTop: true } });
    const vines = new THREE.InstancedMesh(vineGeo, vineMat, vineSpots.length);
    vineSpots.forEach((v, i) => {
      dummy.position.set(v.x, v.y, v.z);
      dummy.rotation.set(0, random() * TAU, 0);
      dummy.scale.set(v.s, v.s, v.s);
      dummy.updateMatrix();
      vines.setMatrixAt(i, dummy.matrix);
    });
    register(vines, { castShadow: false, cull: false, name: 'lm-vines' });
  }

  // ---- epiphyte ferns (limbs, ruin cracks) ----
  {
    const random = mulberry32(WORLD.seed + 4062);
    const parts = [];
    for (let i = 0; i < 6; i += 1) {
      const card = new THREE.PlaneGeometry(0.9, 1.4, 1, 3);
      card.translate(0, 0.7, 0);
      const pos = card.attributes.position;
      for (let k = 0; k < pos.count; k += 1) {
        const t = pos.getY(k) / 1.4;
        pos.setZ(k, pos.getZ(k) + Math.sin(t * Math.PI * 0.5) * 0.5);
      }
      card.computeVertexNormals();
      card.rotateX(0.75 + (random() - 0.5) * 0.3);
      card.rotateY((i / 6) * TAU + (random() - 0.5) * 0.4);
      parts.push(card);
    }
    const fernGeo = prepareFoliage(mergeGeometries(parts), 0.6);
    parts.forEach((p) => p.dispose());
    const fernMat = foliageMaterial(textures.fern, { tintSpread: 0.14, wind: { strength: 0.06, speed: 1.3 } });
    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, fernSpots.length);
    fernSpots.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.set(f.s, f.s, f.s);
      dummy.updateMatrix();
      ferns.setMatrixAt(i, dummy.matrix);
    });
    register(ferns, { castShadow: false, cull: false, name: 'lm-epiphytes' });
  }

  // ---- shelf mushrooms ----
  let mushrooms = null;
  {
    const mushGeo = mushroomGeometry();
    mushrooms = new THREE.InstancedMesh(mushGeo, mushroomMaterial, Math.max(1, mushroomSpots.length));
    mushroomSpots.forEach((m, i) => {
      dummy.position.set(m.x, m.y, m.z);
      dummy.rotation.set(0, m.yaw, 0);
      dummy.scale.set(m.s, m.s, m.s);
      dummy.updateMatrix();
      mushrooms.setMatrixAt(i, dummy.matrix);
    });
    register(mushrooms, { castShadow: false, cull: false, name: 'lm-mushrooms' });
  }

  // ------------------------------------------------------------ quality
  const instanceCounts = new Map();
  for (const mesh of meshes) {
    if (mesh.isInstancedMesh) instanceCounts.set(mesh, mesh.count);
  }
  function applyQuality(preset) {
    const density = preset.vegetationDensity;
    for (const mesh of meshes) {
      if (!mesh.isInstancedMesh) continue;
      const max = instanceCounts.get(mesh);
      if (mesh.name === 'lm-mushrooms' || mesh.name === 'lm-epiphytes') {
        mesh.count = density < 0.5 ? Math.max(1, Math.round(max * 0.4)) : max;
      } else {
        mesh.count = max; // landmarks are authored — never thin them out
      }
    }
    for (const tex of ownTextures) {
      tex.anisotropy = preset.anisotropy;
    }
  }

  return {
    meshes,
    stats,
    places,
    heightAt,
    walkables: walk,
    update() {},
    applyQuality,
  };
}
