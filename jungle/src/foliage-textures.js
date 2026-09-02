// Procedural foliage textures for the extra vegetation species (bamboo, bushes,
// broadleaf plants, flowers, ground cover, lianas…). Every texture is painted
// on a canvas with a seeded RNG; albedo maps are sRGB, alpha-tested cards are
// non-repeating, tiling maps (culms, ropes) repeat.

import * as THREE from 'three/webgpu';
import { mulberry32 } from './noise.js';
import { createBarkTexture, createCanopyTexture, createFernTexture, createNormalFromCanvas } from './textures.js';

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { srgb = true, repeat = false } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function gradient(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Pointed leaf outline centered on the origin, base at +len/2, tip at -len/2.
function leafPath(ctx, len, wid, bulge = 0.55) {
  ctx.beginPath();
  ctx.moveTo(0, len / 2);
  ctx.bezierCurveTo(wid * bulge, len * 0.28, wid * 0.62, -len * 0.12, 0, -len / 2);
  ctx.bezierCurveTo(-wid * 0.62, -len * 0.12, -wid * bulge, len * 0.28, 0, len / 2);
  ctx.closePath();
}

function drawLeaf(ctx, x, y, len, wid, rot, c0, c1, { midrib = true, veins = 0, alpha = 1, bulge = 0.55, ribColor = 'rgba(18, 48, 14, 0.45)' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient(ctx, 0, len / 2, 0, -len / 2, c0, c1);
  leafPath(ctx, len, wid, bulge);
  ctx.fill();
  if (midrib) {
    ctx.strokeStyle = ribColor;
    ctx.lineWidth = Math.max(0.7, wid * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, len / 2);
    ctx.lineTo(0, -len / 2);
    ctx.stroke();
  }
  for (let i = 1; i <= veins; i += 1) {
    const t = i / (veins + 1);
    const vy = len / 2 - t * len;
    const reach = wid * 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1));
    ctx.strokeStyle = 'rgba(30, 70, 22, 0.32)';
    ctx.lineWidth = Math.max(0.5, wid * 0.025);
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(reach * 0.5, vy - len * 0.06, reach, vy - len * 0.11);
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(-reach * 0.5, vy - len * 0.06, -reach, vy - len * 0.11);
    ctx.stroke();
  }
  ctx.restore();
}

function roundOff(ctx, size, inner = 0.3, hold = 0.82) {
  ctx.globalCompositeOperation = 'destination-in';
  const falloff = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size * 0.5);
  falloff.addColorStop(0, 'rgba(0,0,0,1)');
  falloff.addColorStop(hold, 'rgba(0,0,0,1)');
  falloff.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- leaf clusters (tree crowns, bushes) ----------

// Dense cluster of leaves with an organic round silhouette. `shape` picks the
// leaf style: 'oval' (generic), 'round' (bush), 'small' (emergent crown),
// 'compound' (pinnate leaflets on stems).
export function createLeafClusterTexture({
  seed = 1,
  size = 512,
  count = 900,
  lenRange = [12, 28],
  aspect = 0.42,
  palettes = [['#2d6a1f', '#418f2c'], ['#357a24', '#4da336'], ['#27581b', '#3a7d28']],
  radiusPow = 0.78,
  squash = 0.92,
  shape = 'oval',
  highlight = 0.08,
} = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), radiusPow) * size * 0.46;
    const x = size / 2 + Math.cos(angle) * radius;
    const y = size / 2 + Math.sin(angle) * radius * squash;
    const len = lenRange[0] + random() * (lenRange[1] - lenRange[0]);
    const rot = random() * Math.PI * 2;
    const palette = palettes[Math.floor(random() * palettes.length)];
    // leaves toward the top of the cluster catch more light
    const lift = 1 - y / size;
    const c0 = mixHex(palette[0], '#ffffff', highlight * lift);
    const c1 = mixHex(palette[1], '#ffffff', highlight * lift * 1.6);

    if (shape === 'compound') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(60, 90, 30, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.5);
      ctx.lineTo(0, -len * 0.5);
      ctx.stroke();
      const pairs = 3 + Math.floor(random() * 3);
      for (let p = 0; p < pairs; p += 1) {
        const t = (p + 0.5) / pairs;
        const py = len * 0.5 - t * len;
        const ll = len * 0.34 * (1 - t * 0.35);
        for (const side of [-1, 1]) {
          drawLeaf(ctx, side * ll * 0.45, py, ll, ll * 0.4, side * 1.15, c0, c1, { midrib: false });
        }
      }
      ctx.restore();
    } else {
      const wid = len * (shape === 'round' ? 0.72 : shape === 'small' ? 0.5 : aspect) * (0.85 + random() * 0.3);
      drawLeaf(ctx, x, y, len, wid, rot, c0, c1, { bulge: shape === 'round' ? 0.72 : 0.55, midrib: len > 10 });
    }
  }

  roundOff(ctx, size);
  return toTexture(canvas);
}

// ---------- bamboo ----------

// Tiling culm map: one internode per repeat, dark node band at the top with a
// pale sheath ring under it.
export function createBambooCulmTexture(seed = 3101) {
  // square so createNormalFromCanvas (which reads width x width) stays aligned
  const w = 256;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);

  ctx.fillStyle = gradient(ctx, 0, 0, w, 0, '#8ea63f', '#a9bd4c');
  ctx.fillRect(0, 0, w, h);
  // curvature shading across the culm
  ctx.fillStyle = gradient(ctx, 0, 0, w, 0, 'rgba(40, 60, 10, 0.35)', 'rgba(255, 255, 200, 0.0)');
  ctx.fillRect(0, 0, w * 0.5, h);
  ctx.fillStyle = gradient(ctx, w * 0.5, 0, w, 0, 'rgba(255, 255, 200, 0.0)', 'rgba(40, 60, 10, 0.3)');
  ctx.fillRect(w * 0.5, 0, w * 0.5, h);

  // fine vertical fibres
  for (let i = 0; i < 90; i += 1) {
    const x = random() * w;
    ctx.strokeStyle = random() > 0.5 ? `rgba(200, 220, 120, ${0.08 + random() * 0.12})` : `rgba(70, 90, 20, ${0.08 + random() * 0.14})`;
    ctx.lineWidth = 0.7 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (random() - 0.5) * 3, h);
    ctx.stroke();
  }
  // speckles / age spots
  for (let i = 0; i < 60; i += 1) {
    ctx.fillStyle = `rgba(90, 80, 30, ${0.1 + random() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(random() * w, random() * h, 1 + random() * 3, 0.6 + random() * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // darker zone just under the node, node band, pale sheath ring
  ctx.fillStyle = gradient(ctx, 0, 0, 0, 40, 'rgba(50, 70, 20, 0.5)', 'rgba(50, 70, 20, 0)');
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#e0dd9a';
  ctx.fillRect(0, 0, w, 7);
  ctx.fillStyle = '#4a5a1c';
  ctx.fillRect(0, h - 9, w, 9);
  ctx.fillStyle = 'rgba(30, 40, 10, 0.6)';
  ctx.fillRect(0, h - 4, w, 2);
  ctx.fillStyle = gradient(ctx, 0, h - 30, 0, h - 9, 'rgba(50, 70, 20, 0)', 'rgba(50, 70, 20, 0.45)');
  ctx.fillRect(0, h - 30, w, 21);

  const tex = toTexture(canvas, { repeat: true });
  return tex;
}

// Sparse spray of long lanceolate bamboo leaves from a node.
export function createBambooLeafTexture(seed = 3202) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  const ox = 128;
  const oy = 232;
  // twigs
  for (let i = 0; i < 4; i += 1) {
    const a = -Math.PI / 2 + (random() - 0.5) * 2.2;
    ctx.strokeStyle = '#7b8f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + Math.cos(a) * 60, oy + Math.sin(a) * 60 - 10, ox + Math.cos(a) * 120, oy + Math.sin(a) * 110);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i += 1) {
    const a = -Math.PI / 2 + (random() - 0.5) * 2.6;
    const d = 30 + random() * 90;
    const x = ox + Math.cos(a) * d;
    const y = oy + Math.sin(a) * d * 0.9;
    const len = 70 + random() * 60;
    const wid = 11 + random() * 7;
    const droop = (random() - 0.5) * 0.9;
    drawLeaf(ctx, x, y, len, wid, a + Math.PI / 2 + droop, '#4c7f28', '#8fb64c', { bulge: 0.42, midrib: true, ribColor: 'rgba(230, 240, 170, 0.5)' });
  }
  return toTexture(canvas);
}

// ---------- palms / broadleaf ----------

// Fan palm leaf: radiating pleated segments from the petiole tip.
export function createFanPalmTexture(seed = 3303) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  const cx = 128;
  const cy = 168;
  ctx.strokeStyle = '#6f8b34';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, 254);
  ctx.lineTo(cx, cy);
  ctx.stroke();

  const segs = 26;
  for (let i = 0; i < segs; i += 1) {
    const t = i / (segs - 1);
    const a = -Math.PI + t * Math.PI; // upper half sweep
    const len = 120 + Math.sin(t * Math.PI) * 32 + (random() - 0.5) * 10;
    const halfW = 0.058;
    const light = 0.5 + 0.5 * Math.cos((t - 0.5) * Math.PI);
    ctx.fillStyle = gradient(ctx, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, mixHex('#2f6a1f', '#4f8f30', light * 0.5), mixHex('#3f7d26', '#78ad42', light));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - halfW) * len, cy + Math.sin(a - halfW) * len);
    ctx.lineTo(cx + Math.cos(a) * (len + 8), cy + Math.sin(a) * (len + 8));
    ctx.lineTo(cx + Math.cos(a + halfW) * len, cy + Math.sin(a + halfW) * len);
    ctx.closePath();
    ctx.fill();
    // pleat shadow line
    ctx.strokeStyle = 'rgba(25, 55, 15, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - halfW) * len * 0.96, cy + Math.sin(a - halfW) * len * 0.96);
    ctx.stroke();
  }
  return toTexture(canvas);
}

// Elephant-ear / taro: huge heart-shaped blade, petiole from the bottom.
export function createTaroTexture(seed = 3404) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);
  const cx = 128;
  const attach = 330;

  // petiole
  ctx.strokeStyle = gradient(ctx, 0, 512, 0, attach, '#5a8a2f', '#7fae44');
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(cx, 512);
  ctx.quadraticCurveTo(cx + 6, 420, cx, attach);
  ctx.stroke();

  // heart blade: lobes below the attach point, tip at the top
  ctx.fillStyle = gradient(ctx, 0, 400, 0, 20, '#1e5a1c', '#3f8f2f');
  ctx.beginPath();
  ctx.moveTo(cx, attach + 6); // notch
  ctx.bezierCurveTo(cx + 60, attach + 70, cx + 130, attach - 20, cx + 118, 200);
  ctx.bezierCurveTo(cx + 108, 110, cx + 40, 60, cx, 16);
  ctx.bezierCurveTo(cx - 40, 60, cx - 108, 110, cx - 118, 200);
  ctx.bezierCurveTo(cx - 130, attach - 20, cx - 60, attach + 70, cx, attach + 6);
  ctx.closePath();
  ctx.fill();

  // glossy sheen
  ctx.fillStyle = gradient(ctx, 40, 120, 220, 300, 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(cx - 20, 190, 70, 110, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // pale radiating veins from the attach point
  ctx.strokeStyle = 'rgba(200, 235, 170, 0.55)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(cx, attach);
  ctx.lineTo(cx, 30);
  ctx.stroke();
  for (let i = 0; i < 9; i += 1) {
    const t = (i + 1) / 10;
    const a = -Math.PI / 2 + (t - 0.5) * 2.6;
    const len = 120 + Math.sin(t * Math.PI) * 130;
    ctx.lineWidth = 1.6 + random() * 0.8;
    ctx.strokeStyle = 'rgba(200, 235, 170, 0.42)';
    ctx.beginPath();
    ctx.moveTo(cx, attach - 10);
    ctx.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, attach - 10 + Math.sin(a) * len * 0.6, cx + Math.cos(a) * len * 0.92, attach - 30 + Math.sin(a) * len);
    ctx.stroke();
  }
  return toTexture(canvas);
}

// Split-leaf philodendron / monstera: lobed dark glossy leaf.
export function createPhilodendronTexture(seed = 3505) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);
  const cx = 128;

  ctx.strokeStyle = '#4f7d2c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx, 512);
  ctx.quadraticCurveTo(cx - 8, 440, cx, 380);
  ctx.stroke();

  ctx.fillStyle = gradient(ctx, 0, 400, 0, 20, '#16471a', '#2f7a2c');
  ctx.beginPath();
  ctx.moveTo(cx, 392);
  ctx.bezierCurveTo(cx + 70, 420, cx + 126, 330, cx + 116, 210);
  ctx.bezierCurveTo(cx + 106, 100, cx + 30, 40, cx, 14);
  ctx.bezierCurveTo(cx - 30, 40, cx - 106, 100, cx - 116, 210);
  ctx.bezierCurveTo(cx - 126, 330, cx - 70, 420, cx, 392);
  ctx.closePath();
  ctx.fill();

  // lobes: carve slits from the edges toward the midrib
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i += 1) {
    const t = (i + 0.5) / 7;
    const y = 70 + t * 300;
    for (const side of [-1, 1]) {
      const edgeX = cx + side * (118 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) + 4);
      const inner = cx + side * (18 + random() * 22);
      ctx.beginPath();
      ctx.moveTo(edgeX + side * 10, y - 4);
      ctx.quadraticCurveTo((edgeX + inner) / 2, y - 14 + random() * 6, inner, y + 2);
      ctx.quadraticCurveTo((edgeX + inner) / 2, y + 14, edgeX + side * 10, y + 20 + random() * 10);
      ctx.closePath();
      ctx.fill();
    }
  }
  // fenestrations
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(cx + (random() - 0.5) * 90, 120 + random() * 220, 5 + random() * 8, 10 + random() * 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(190, 225, 160, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, 392);
  ctx.lineTo(cx, 26);
  ctx.stroke();
  ctx.fillStyle = gradient(ctx, 60, 100, 200, 260, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(cx - 24, 170, 46, 90, -0.25, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

// Bush: dense rounded cluster of mid-size leaves.
export function createBushTexture(seed = 3606) {
  return createLeafClusterTexture({
    seed,
    size: 512,
    count: 700,
    lenRange: [22, 40],
    shape: 'round',
    palettes: [['#2f6d21', '#4a9a30'], ['#3a7f28', '#63b13f'], ['#2b5e1d', '#4f9633'], ['#4c8f2c', '#79c04a']],
    radiusPow: 0.62,
    squash: 0.88,
    highlight: 0.12,
  });
}

// ---------- flowers ----------

// Heliconia / bird-of-paradise: zigzag red-orange bracts on a tall stem with two leaves.
export function createHeliconiaTexture(seed = 3707) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);
  const cx = 128;

  // leaves
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + side * 30, 330);
    ctx.rotate(side * 0.55);
    ctx.fillStyle = gradient(ctx, 0, 120, 0, -120, '#2f6f22', '#5fae3a');
    leafPath(ctx, 260, 70, 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(210, 240, 170, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.lineTo(0, -120);
    ctx.stroke();
    ctx.restore();
  }
  // stem
  ctx.strokeStyle = gradient(ctx, 0, 512, 0, 120, '#4f8a2c', '#8fb040');
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, 512);
  ctx.quadraticCurveTo(cx + 10, 330, cx - 4, 130);
  ctx.stroke();
  // bracts alternate sides climbing the stem
  const bracts = 6;
  for (let i = 0; i < bracts; i += 1) {
    const t = i / (bracts - 1);
    const y = 150 - t * 110 + 40;
    const side = i % 2 === 0 ? -1 : 1;
    const len = 78 - t * 22;
    ctx.save();
    ctx.translate(cx - 4 + side * 6, y);
    ctx.rotate(side * (1.25 - t * 0.25));
    ctx.fillStyle = gradient(ctx, 0, 0, 0, -len, '#c8231a', '#ff7a1c');
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(26, -len * 0.45, 4, -len);
    ctx.quadraticCurveTo(-10, -len * 0.5, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd93a';
    ctx.beginPath();
    ctx.ellipse(6, -len + 6, 5, 9, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  void random;
  return toTexture(canvas);
}

// Small orchid spray for tree trunks: strap leaves + arching stem of blossoms.
export function createOrchidTexture(seed = 3808) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(128 + side * 16, 236);
    ctx.rotate(side * 0.9);
    ctx.fillStyle = gradient(ctx, 0, 40, 0, -60, '#2f6a24', '#5ea63c');
    leafPath(ctx, 120, 34, 0.6);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = '#6f9a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 236);
  ctx.bezierCurveTo(140, 150, 90, 100, 150, 40);
  ctx.stroke();

  const palettes = [['#ff7fc0', '#ffe1f0', '#c2186e'], ['#f4f0ff', '#ffffff', '#c34a9a'], ['#e75fd5', '#f7c6ff', '#7a1a8a']];
  const [petal0, petal1, lip] = palettes[Math.floor(random() * palettes.length)];
  const blooms = [[112, 165], [96, 118], [128, 80], [162, 48]];
  blooms.forEach(([bx, by], bi) => {
    const r = 24 - bi * 2;
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a);
      ctx.fillStyle = gradient(ctx, 0, 0, r, 0, petal1, petal0);
      ctx.beginPath();
      ctx.ellipse(r * 0.55, 0, r * 0.55, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = lip;
    ctx.beginPath();
    ctx.ellipse(bx, by + r * 0.3, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe66b';
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
  return toTexture(canvas);
}

// Meadow flowers: variant 0 = daisies + buttercups, variant 1 = purple spikes + pink bells.
export function createMeadowFlowerTexture(variant = 0, seed = 3909) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed + variant * 17);
  ctx.clearRect(0, 0, size, size);

  const stems = 12;
  for (let i = 0; i < stems; i += 1) {
    const x0 = 60 + random() * 136;
    const top = 40 + random() * 90;
    const lean = (random() - 0.5) * 70;
    ctx.strokeStyle = `rgba(${70 + random() * 30}, ${130 + random() * 40}, ${50 + random() * 20}, 0.95)`;
    ctx.lineWidth = 1.6 + random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, 256);
    ctx.quadraticCurveTo(x0 + lean * 0.3, 180, x0 + lean, top);
    ctx.stroke();
    // a small leaf on the stem
    drawLeaf(ctx, x0 + lean * 0.2 + (random() - 0.5) * 8, 200 + random() * 30, 26, 9, (random() - 0.5) * 2.4, '#3b7a2a', '#6db347', { midrib: false });

    const fx = x0 + lean;
    const fy = top;
    if (variant === 0) {
      const daisy = random() > 0.42;
      const petals = daisy ? 9 : 5;
      const pr = daisy ? 13 : 10;
      for (let p = 0; p < petals; p += 1) {
        const a = (p / petals) * Math.PI * 2;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(a);
        ctx.fillStyle = daisy ? gradient(ctx, 0, 0, pr, 0, '#fdfdf6', '#ffffff') : gradient(ctx, 0, 0, pr, 0, '#ffd228', '#ffe96a');
        ctx.beginPath();
        ctx.ellipse(pr * 0.55, 0, pr * 0.5, daisy ? pr * 0.17 : pr * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = daisy ? '#f2b826' : '#c98a10';
      ctx.beginPath();
      ctx.arc(fx, fy, daisy ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const spike = random() > 0.4;
      if (spike) {
        for (let k = 0; k < 9; k += 1) {
          const t = k / 9;
          ctx.fillStyle = mixHex('#6a2fb8', '#c39bff', t * 0.7 + random() * 0.2);
          ctx.beginPath();
          ctx.ellipse(fx + (k % 2 === 0 ? -5 : 5) * (1 - t * 0.5), fy + 40 - t * 44, 5.5 - t * 2, 4 - t * 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let k = 0; k < 3; k += 1) {
          ctx.fillStyle = mixHex('#e0489a', '#ffb3d9', random() * 0.5);
          ctx.beginPath();
          ctx.moveTo(fx + (k - 1) * 8, fy + 8);
          ctx.lineTo(fx + (k - 1) * 8 - 6, fy + 24);
          ctx.lineTo(fx + (k - 1) * 8 + 6, fy + 24);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  return toTexture(canvas);
}

// ---------- grasses / reeds ----------

// Tall meadow grass: many thin arching blades, green at the base fading to an
// olive tip, and a few sparse, dark-tan seed panicles (kept small so a field of
// this never reads as wheat).
export function createTallGrassTexture(seed = 4010) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);

  const blade = (baseX, top, lean, width, c0, c1) => {
    ctx.fillStyle = gradient(ctx, baseX, 512, baseX + lean, top, c0, c1);
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, 512);
    ctx.quadraticCurveTo(baseX - width / 4 + lean * 0.3, 300, baseX + lean, top);
    ctx.quadraticCurveTo(baseX + width / 4 + lean * 0.3, 302, baseX + width / 2, 512);
    ctx.closePath();
    ctx.fill();
  };
  // back layer: darker, shorter blades give depth behind the front ones
  for (let i = 0; i < 22; i += 1) {
    blade(30 + random() * 196, 150 + random() * 160, (random() - 0.5) * 110, 3 + random() * 4, '#2f5a1c', '#5f8a30');
  }
  for (let i = 0; i < 34; i += 1) {
    const baseX = 36 + random() * 184;
    const top = 30 + random() * 140;
    const lean = (random() - 0.5) * 140;
    const width = 2.5 + random() * 4;
    const seedHead = random() > 0.74;
    blade(baseX, top, lean, width, '#3e7024', seedHead ? '#9aa64e' : mixHex('#8fb548', '#b8c45a', random()));
    if (seedHead) {
      // a small drooping panicle of dashes at the tip
      const n = 4 + Math.floor(random() * 3);
      for (let k = 0; k < n; k += 1) {
        const t = k / n;
        ctx.fillStyle = `rgba(${135 + random() * 30}, ${120 + random() * 25}, ${70 + random() * 20}, 0.85)`;
        ctx.beginPath();
        ctx.ellipse(baseX + lean * (1 - t * 0.1) + (k % 2 ? 2.5 : -2.5), top + t * 26, 1.4, 3.4, lean * 0.004, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return toTexture(canvas);
}

export function createReedTexture(seed = 4111) {
  const canvas = makeCanvas(128, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 128, 512);

  for (let i = 0; i < 11; i += 1) {
    const baseX = 22 + random() * 84;
    const top = 10 + random() * 90;
    const lean = (random() - 0.5) * 36;
    const width = 4 + random() * 4;
    const head = i % 4 === 0;
    ctx.fillStyle = gradient(ctx, baseX, 512, baseX + lean, top, '#3f7b2c', head ? '#8aa24a' : '#98c04f');
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, 512);
    ctx.quadraticCurveTo(baseX + lean * 0.4, 280, baseX + lean, top);
    ctx.quadraticCurveTo(baseX + lean * 0.4, 282, baseX + width / 2, 512);
    ctx.closePath();
    ctx.fill();
    if (head) {
      ctx.fillStyle = gradient(ctx, 0, top, 0, top + 70, '#8a5a2c', '#5a3818');
      ctx.beginPath();
      ctx.ellipse(baseX + lean, top + 40, 6, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

// ---------- ground cover ----------

export function createSeedlingTexture(seed = 4212) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI / 2 + (random() - 0.5) * 2.4;
    const d = 30 + random() * 60;
    const x = 128 + Math.cos(a) * d;
    const y = 236 + Math.sin(a) * d * 0.8;
    ctx.strokeStyle = '#5f9a3a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(128, 246);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawLeaf(ctx, x, y - 22, 60 + random() * 30, 34 + random() * 16, a + Math.PI / 2 + (random() - 0.5) * 0.6, '#3d8a2a', '#8bd15a', { bulge: 0.72, veins: 2 });
  }
  return toTexture(canvas);
}

export function createMushroomTexture(seed = 4313) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  const caps = [['#c8873a', '#f0b769'], ['#b2542a', '#e88a4f'], ['#d8c29a', '#f4e6c8'], ['#8d5a33', '#c98f5a']];
  const n = 4 + Math.floor(random() * 2);
  for (let i = 0; i < n; i += 1) {
    const x = 50 + random() * 156;
    const h = 60 + random() * 90;
    const capW = 30 + random() * 40;
    const capH = capW * (0.45 + random() * 0.25);
    const baseY = 250 - random() * 20;
    const [c0, c1] = caps[Math.floor(random() * caps.length)];
    // stem
    ctx.fillStyle = gradient(ctx, x - 8, 0, x + 8, 0, '#d9cbb0', '#f4ecd8');
    ctx.beginPath();
    ctx.roundRect(x - 7 - capW * 0.06, baseY - h, 14 + capW * 0.12, h, 6);
    ctx.fill();
    // cap
    ctx.fillStyle = gradient(ctx, 0, baseY - h - capH, 0, baseY - h + 6, c1, c0);
    ctx.beginPath();
    ctx.ellipse(x, baseY - h + 2, capW, capH, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(x, baseY - h + 12, x - capW, baseY - h + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(80, 40, 20, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, baseY - h + 3, capW * 0.92, 5, 0, 0, Math.PI);
    ctx.fill();
    // spots
    for (let s = 0; s < 4; s += 1) {
      ctx.fillStyle = 'rgba(255, 245, 225, 0.55)';
      ctx.beginPath();
      ctx.arc(x + (random() - 0.5) * capW * 1.3, baseY - h - capH * random() * 0.7, 2 + random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

// Bromeliad rosette (epiphyte) with a red flush at the heart.
export function createBromeliadTexture(seed = 4414) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);

  const cx = 128;
  const cy = 226;
  for (let i = 0; i < 15; i += 1) {
    const t = i / 14;
    const a = -Math.PI + t * Math.PI + (random() - 0.5) * 0.12;
    const len = 90 + Math.sin(t * Math.PI) * 60 + random() * 20;
    const inner = Math.abs(t - 0.5) < 0.2;
    const c0 = inner ? '#b0322c' : '#3b7f2b';
    const c1 = inner ? '#ff6a5a' : '#8cc94e';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = gradient(ctx, 0, 0, 0, -len, c0, c1);
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-10, -len * 0.5, 0, -len);
    ctx.quadraticCurveTo(10, -len * 0.5, 12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 46, 12, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

// Woody liana rope strip (tiling vertically) with a few small leaves.
export function createLianaTexture(seed = 4515) {
  const canvas = makeCanvas(64, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 64, 512);

  for (let strand = 0; strand < 2; strand += 1) {
    ctx.strokeStyle = strand === 0 ? '#5a4128' : '#3e2c1a';
    ctx.lineWidth = strand === 0 ? 11 : 7;
    ctx.beginPath();
    for (let y = -10; y <= 522; y += 8) {
      const x = 32 + Math.sin(y * 0.045 + strand * Math.PI) * 9;
      if (y === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // twist highlights
  for (let y = 0; y <= 512; y += 14) {
    ctx.strokeStyle = `rgba(150, 120, 80, ${0.25 + random() * 0.25})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(40, y + 6);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i += 1) {
    const y = 20 + random() * 470;
    const side = random() > 0.5 ? 1 : -1;
    drawLeaf(ctx, 32 + side * 14, y, 26 + random() * 12, 14, side * 1.2 + (random() - 0.5) * 0.4, '#356f22', '#5fa63c', { midrib: false });
  }
  return toTexture(canvas, { repeat: true });
}

// ---------- the set ----------

// Vertically tileable hanging vine: a strand that returns to its start x at the
// bottom edge so long vines can repeat it, with leaf pairs along the strand
// (leaves that cross the seam are drawn on both edges).
export function createVineTexture(seed = 4616) {
  const w = 128;
  const h = 512;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, w, h);

  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    // closed wander: sin terms vanish at both ends so top == bottom
    const x = 64 + Math.sin(t * Math.PI * 2) * 14 + Math.sin(t * Math.PI * 4 + 1.3) * 7;
    pts.push([x, t * h]);
  }
  const strand = (offsetY, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y + offsetY) : ctx.lineTo(x, y + offsetY)));
    ctx.stroke();
  };
  strand(0, 6, '#3f5a24');
  strand(0, 3, '#6a7f3a');
  // second, thinner strand twisted around the first
  ctx.strokeStyle = '#4c6a2a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = x + Math.sin((y / h) * Math.PI * 6) * 6;
    if (i === 0) ctx.moveTo(px, y);
    else ctx.lineTo(px, y);
  });
  ctx.stroke();

  const strandX = (y) => {
    const t = ((y % h) + h) % h / h;
    return 64 + Math.sin(t * Math.PI * 2) * 14 + Math.sin(t * Math.PI * 4 + 1.3) * 7;
  };
  for (let i = 0; i < 34; i += 1) {
    const y = random() * h;
    const side = random() > 0.5 ? 1 : -1;
    const len = 14 + random() * 16;
    const wid = len * (0.42 + random() * 0.2);
    const rot = side * (1.1 + random() * 0.6) + (random() - 0.5) * 0.4;
    const c0 = mixHex('#2f6a1e', '#45882a', random());
    const c1 = mixHex('#5aa63a', '#7cc24a', random());
    for (const oy of [0, -h, h]) {
      const yy = y + oy;
      if (yy < -len || yy > h + len) continue;
      drawLeaf(ctx, strandX(y) + side * len * 0.45, yy, len, wid, rot, c0, c1, { midrib: true });
    }
  }
  const texture = toTexture(canvas, { repeat: true });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createFoliageTextures() {
  const set = {
    // tree crowns — dense clusters (few see-through holes) so the canopy closes
    // into a continuous sea from the vistas; three distinct palettes so
    // neighbouring trees read as different species
    canopyEmergent: createLeafClusterTexture({
      seed: 5101,
      count: 2600,
      lenRange: [7, 15],
      shape: 'small',
      palettes: [['#1f4a1a', '#33722a'], ['#1d5222', '#3a8334'], ['#26561a', '#45852c']],
      radiusPow: 0.85,
      highlight: 0.1,
    }),
    // A: mid green, oval leaves
    canopyA: createLeafClusterTexture({
      seed: 5111,
      count: 1500,
      lenRange: [13, 28],
      palettes: [['#2b661f', '#479634'], ['#33742a', '#55a63c'], ['#275d1c', '#458c36']],
      radiusPow: 0.8,
      highlight: 0.1,
    }),
    // B: darker blue-green, rounder leaves (umbrella crowns)
    canopyB: createLeafClusterTexture({
      seed: 5122,
      count: 1200,
      lenRange: [15, 30],
      shape: 'round',
      palettes: [['#1c5228', '#327d3a'], ['#215a2b', '#3c8b45'], ['#184a20', '#2d7433']],
      radiusPow: 0.8,
      highlight: 0.08,
    }),
    // C: fine olive foliage (layered crowns) — small leaves read as a different
    // texture scale from A/B without turning into starbursts on the flat caps
    canopyC: createLeafClusterTexture({
      seed: 5202,
      count: 2300,
      lenRange: [8, 17],
      shape: 'small',
      palettes: [['#3a6b22', '#5c9236'], ['#456f24', '#6d9c3a'], ['#2f5f1d', '#4f8a2e']],
      radiusPow: 0.8,
      highlight: 0.07,
    }),
    canopyUnderstory: createLeafClusterTexture({
      seed: 5303,
      count: 420,
      lenRange: [24, 46],
      aspect: 0.5,
      palettes: [['#2f6e22', '#4f9a35'], ['#377a28', '#5da63c'], ['#2a5f1f', '#458c2f']],
      radiusPow: 0.72,
      squash: 0.85,
      highlight: 0.08,
    }),
    bush: createBushTexture(),
    // stems / trunks
    bambooCulm: createBambooCulmTexture(),
    bambooLeaf: createBambooLeafTexture(),
    // barks are kept fairly light: the shaded side of a trunk only gets the
    // hemisphere light, so dark albedo reads as burnt black
    emergentBark: createBarkTexture(545, { r: 138, g: 126, b: 110 }),
    canopyBark: createBarkTexture(565, { r: 126, g: 108, b: 88 }),
    understoryBark: createBarkTexture(575, { r: 118, g: 114, b: 98 }),
    treeFernBark: createBarkTexture(555, { r: 92, g: 70, b: 50 }),
    treeFernFrond: createFernTexture(929),
    fernB: createFernTexture(939),
    canopyD: createCanopyTexture(626),
    // broadleaf + palms
    fanPalm: createFanPalmTexture(),
    taro: createTaroTexture(),
    philodendron: createPhilodendronTexture(),
    // flowers
    heliconia: createHeliconiaTexture(),
    orchid: createOrchidTexture(),
    meadowA: createMeadowFlowerTexture(0),
    meadowB: createMeadowFlowerTexture(1),
    // grasses / ground
    tallGrass: createTallGrassTexture(),
    reed: createReedTexture(),
    seedling: createSeedlingTexture(),
    mushroom: createMushroomTexture(),
    bromeliad: createBromeliadTexture(),
    liana: createLianaTexture(),
    vine: createVineTexture(),
  };
  set.emergentBarkNormal = createNormalFromCanvas(set.emergentBark, 2.8, 1);
  set.canopyBarkNormal = createNormalFromCanvas(set.canopyBark, 3.0, 1);
  set.understoryBarkNormal = createNormalFromCanvas(set.understoryBark, 2.4, 1);
  set.treeFernBarkNormal = createNormalFromCanvas(set.treeFernBark, 2.6, 1);
  set.bambooNormal = createNormalFromCanvas(set.bambooCulm, 1.6, 1);
  return set;
}
