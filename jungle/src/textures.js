// Procedural canvas textures — every texture in the jungle is painted in code.

import * as THREE from 'three/webgpu';
import { mulberry32 } from './noise.js';

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, { srgb = true, repeat = true } = {}) {
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
  return texture;
}

// Seamless speckles: discs that overlap a tile edge are repeated on the opposite
// side so the texture wraps without a visible seam.
function speckle(ctx, random, count, size, alpha, palette) {
  const { width, height } = ctx.canvas;
  for (let i = 0; i < count; i += 1) {
    const color = palette[Math.floor(random() * palette.length)];
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
    const r = size * (0.35 + random() * 0.65);
    const x = random() * width;
    const y = random() * height;
    const xs = [x];
    const ys = [y];
    if (x < r) xs.push(x + width);
    if (x > width - r) xs.push(x - width);
    if (y < r) ys.push(y + height);
    if (y > height - r) ys.push(y - height);
    for (const px of xs) {
      for (const py of ys) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- ground tiles ----------

export function createGrassTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(101);

  // olive jungle floor — not lawn green: mixed live/dead blades, soil showing through
  // (flat base + wrapped blobs: gradients are not seamless and quilt when tiled)
  ctx.fillStyle = '#3f652a';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 40, 120, 0.22, ['#3a5f26', '#466d2b', '#385a25', '#4a6f2e']);

  // soil + shadow patches under the blades
  speckle(ctx, random, 900, 14, 0.18, ['#2c3f1c', '#4a3d24', '#253618']);
  speckle(ctx, random, 2600, 5, 0.16, ['#5a8a3a', '#2d4f21', '#6b9a44', '#3b5f27', '#7a8a3c']);

  // blade strokes — live greens, yellowed and dead brown blades
  for (let i = 0; i < 2100; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const len = 5 + random() * 14;
    const lean = (random() - 0.5) * 6;
    const r = random();
    ctx.strokeStyle = r > 0.62
      ? 'rgba(104, 160, 66, 0.5)'
      : r > 0.28
        ? 'rgba(44, 84, 30, 0.45)'
        : r > 0.12
          ? 'rgba(150, 140, 70, 0.4)'
          : 'rgba(110, 84, 46, 0.42)';
    ctx.lineWidth = 0.8 + random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.5, y - len * 0.6, x + lean, y - len);
    ctx.stroke();
  }

  // clover / small round leaves
  for (let i = 0; i < 260; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    ctx.fillStyle = random() > 0.5 ? 'rgba(78, 128, 52, 0.55)' : 'rgba(58, 104, 42, 0.55)';
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 + random();
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return toTexture(canvas);
}

export function createSandTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(202);

  ctx.fillStyle = '#dcc697';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 40, 120, 0.2, ['#d8c190', '#e3cf9e', '#d2ba87', '#e6d3a4']);

  speckle(ctx, random, 5200, 2.4, 0.2, ['#f0e0b4', '#b89a66', '#cdb27e', '#a98e60']);
  speckle(ctx, random, 240, 4.5, 0.25, ['#8f7a52', '#f7ecc8']);

  // ripple shading
  for (let i = 0; i < 26; i += 1) {
    const y = random() * 512;
    ctx.strokeStyle = 'rgba(150, 124, 82, 0.12)';
    ctx.lineWidth = 5 + random() * 9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 8);
    }
    ctx.stroke();
  }

  return toTexture(canvas);
}

export function createRockTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(303);

  ctx.fillStyle = '#707264';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 40, 120, 0.2, ['#6a6c60', '#7b7d70', '#5f6154', '#7e8072']);

  // large tonal plates (weathered blocks) then fine grain
  speckle(ctx, random, 90, 60, 0.16, ['#8a8c7c', '#55584b', '#74776a', '#8f8a78']);
  speckle(ctx, random, 2400, 7, 0.14, ['#8d9080', '#565a4c', '#9aa08c', '#4c5044']);
  speckle(ctx, random, 6000, 1.6, 0.22, ['#a0a394', '#3e4238', '#8a8d7e']);

  // strata cracks with a light edge (chiselled look)
  for (let i = 0; i < 48; i += 1) {
    const y0 = random() * 512;
    const width = 1 + random() * 2.2;
    const points = [];
    let y = y0;
    for (let x = 0; x <= 512; x += 24) {
      y += (random() - 0.5) * 14;
      points.push([x, y]);
    }
    ctx.strokeStyle = 'rgba(190, 192, 176, 0.16)';
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, py], k) => (k === 0 ? ctx.moveTo(x, py - width) : ctx.lineTo(x, py - width)));
    ctx.stroke();
    ctx.strokeStyle = `rgba(34, 38, 30, ${0.24 + random() * 0.22})`;
    ctx.beginPath();
    points.forEach(([x, py], k) => (k === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)));
    ctx.stroke();
  }
  // vertical fissures
  for (let i = 0; i < 18; i += 1) {
    const x0 = random() * 512;
    ctx.strokeStyle = `rgba(30, 34, 28, ${0.2 + random() * 0.2})`;
    ctx.lineWidth = 0.8 + random() * 1.6;
    ctx.beginPath();
    let x = x0;
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 20) {
      x += (random() - 0.5) * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // lichen + mossy patches in crevices
  speckle(ctx, random, 260, 9, 0.12, ['#4d6b35', '#3c5829']);
  speckle(ctx, random, 420, 5, 0.16, ['#9aa06a', '#c9c98a', '#7e8a55']);
  speckle(ctx, random, 160, 3.5, 0.2, ['#c98d5a', '#a8683c']);

  return toTexture(canvas);
}

export function createMossTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(404);

  ctx.fillStyle = '#2e5522';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 4200, 4, 0.22, ['#3f7030', '#24461b', '#4f8a3a', '#1d3a16']);
  speckle(ctx, random, 700, 2, 0.3, ['#65a04a', '#79b35a']);

  return toTexture(canvas);
}

export function createDirtTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(606);

  ctx.fillStyle = '#6f5238';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 40, 120, 0.22, ['#6b4f36', '#7a5b3e', '#5e452f', '#7c6044']);

  speckle(ctx, random, 3600, 3.5, 0.2, ['#8a6a48', '#4d3826', '#95784f', '#3f2d1e']);
  // pebbles + grit (small, low-contrast — bright dots read as litter from eye height)
  for (let i = 0; i < 520; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 0.8 + random() * 2.2;
    ctx.fillStyle = random() > 0.5 ? 'rgba(128, 116, 96, 0.4)' : 'rgba(66, 54, 40, 0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + random() * 0.4), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214, 196, 168, 0.1)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // packed-earth tonal patches + boot-worn darkening
  speckle(ctx, random, 60, 70, 0.1, ['#5a4128', '#83654a', '#6e5238']);
  // faint root streaks
  for (let i = 0; i < 40; i += 1) {
    ctx.strokeStyle = `rgba(60, 42, 28, ${0.2 + random() * 0.2})`;
    ctx.lineWidth = 1.5 + random() * 3;
    ctx.beginPath();
    let x = random() * 512;
    let y = random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s += 1) {
      x += (random() - 0.5) * 60;
      y += (random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return toTexture(canvas);
}

export function createLitterTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(707);

  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, random, 3000, 4, 0.25, ['#4c3a25', '#2c2114', '#55412a']);

  // fallen leaves — ellipses in browns, ochres, a few still-green
  const palette = ['#8a5a2b', '#a86f34', '#6b4a22', '#b98a3f', '#7d6a2c', '#5d7a2f', '#c49a4a', '#4f3a1d'];
  for (let i = 0; i < 900; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const len = 5 + random() * 12;
    const wid = len * (0.35 + random() * 0.3);
    const rot = random() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.globalAlpha = 0.7 + random() * 0.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    ctx.fill();
    // midrib
    ctx.strokeStyle = 'rgba(40, 26, 12, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // twigs
  for (let i = 0; i < 120; i += 1) {
    ctx.strokeStyle = `rgba(70, 50, 30, ${0.5 + random() * 0.4})`;
    ctx.lineWidth = 1 + random() * 1.5;
    const x = random() * 512;
    const y = random() * 512;
    const a = random() * Math.PI;
    const l = 8 + random() * 22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  return toTexture(canvas);
}

// Derive a tangent-space normal map from the luminance of an albedo canvas
// (dark cracks read as grooves, bright specks as bumps).
export function createNormalFromCanvas(sourceTexture, strength = 2.0, blur = 1) {
  const source = sourceTexture.image;
  const size = source.width;
  const srcCtx = source.getContext('2d');
  const src = srcCtx.getImageData(0, 0, size, size).data;

  const heights = new Float32Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    heights[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  }
  // small box blur so the normals aren't pixel-noisy
  for (let pass = 0; pass < blur; pass += 1) {
    const copy = heights.slice();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += copy[((y + dy + size) % size) * size + ((x + dx + size) % size)];
          }
        }
        heights[y * size + x] = sum / 9;
      }
    }
  }

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hL = heights[y * size + ((x - 1 + size) % size)];
      const hR = heights[y * size + ((x + 1) % size)];
      const hD = heights[((y - 1 + size) % size) * size + x];
      const hU = heights[((y + 1) % size) * size + x];
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      out.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const texture = toTexture(canvas, { srgb: false });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// Tileable monochrome noise — sampled in shaders for terrain mottling.
export function createNoiseTexture(size = 256, seed = 808) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  const image = ctx.createImageData(size, size);

  // Low-frequency blobby noise: sum of a few random cosine waves (tileable).
  const waves = [];
  for (let i = 0; i < 7; i += 1) {
    waves.push({
      fx: Math.round(1 + random() * 4),
      fy: Math.round(1 + random() * 4),
      phase: random() * Math.PI * 2,
      amp: 0.4 + random() * 0.6,
    });
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      let norm = 0;
      for (const w of waves) {
        v += w.amp * Math.cos(((x * w.fx + y * w.fy) / size) * Math.PI * 2 + w.phase);
        norm += w.amp;
      }
      v = v / norm; // [-1, 1]
      const byte = Math.round((v * 0.5 + 0.5) * 255);
      const idx = (y * size + x) * 4;
      image.data[idx] = byte;
      image.data[idx + 1] = byte;
      image.data[idx + 2] = byte;
      image.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, { srgb: false });
}

// ---------- bark ----------

export function createBarkTexture(seed = 505, tint = { r: 96, g: 70, b: 48 }) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);

  ctx.fillStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
  ctx.fillRect(0, 0, 256, 512);

  // vertical striations
  for (let i = 0; i < 130; i += 1) {
    const x0 = random() * 256;
    const light = random() > 0.5;
    ctx.strokeStyle = light
      ? `rgba(${tint.r + 38}, ${tint.g + 32}, ${tint.b + 26}, ${0.16 + random() * 0.2})`
      : `rgba(${Math.max(0, tint.r - 42)}, ${Math.max(0, tint.g - 34)}, ${Math.max(0, tint.b - 26)}, ${0.2 + random() * 0.24})`;
    ctx.lineWidth = 1.5 + random() * 4;
    ctx.beginPath();
    let x = x0;
    ctx.moveTo(x, -10);
    for (let y = 0; y <= 512; y += 36) {
      x += (random() - 0.5) * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // horizontal ring cracks
  for (let i = 0; i < 22; i += 1) {
    const y = random() * 512;
    ctx.strokeStyle = `rgba(30, 20, 12, ${0.12 + random() * 0.18})`;
    ctx.lineWidth = 1 + random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 18) {
      ctx.lineTo(x, y + (random() - 0.5) * 6);
    }
    ctx.stroke();
  }

  speckle(ctx, random, 350, 3, 0.2, ['#503a26', '#7a5c3e', '#2e2014']);

  return toTexture(canvas);
}

// ---------- foliage cards (alpha-tested) ----------

function leafGradient(ctx, x0, y0, x1, y1, c0, c1) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, c0);
  gradient.addColorStop(1, c1);
  return gradient;
}

// A cluster of many small leaves — used for tree canopies. Alpha-tested.
export function createCanopyTexture(seed = 606) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);

  ctx.clearRect(0, 0, size, size);

  const palettes = [
    ['#2d6a1f', '#418f2c'],
    ['#357a24', '#4da336'],
    ['#27581b', '#3a7d28'],
    ['#3f8f2a', '#5cb53f'],
  ];

  // Dense center, sparse edge so card silhouettes look organic
  for (let i = 0; i < 1500; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.78) * size * 0.46;
    const x = size / 2 + Math.cos(angle) * radius;
    const y = size / 2 + Math.sin(angle) * radius * 0.92;
    const leafLen = 10 + random() * 22;
    const leafWid = leafLen * (0.32 + random() * 0.2);
    const rot = random() * Math.PI * 2;
    const palette = palettes[Math.floor(random() * palettes.length)];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = leafGradient(ctx, 0, -leafLen / 2, 0, leafLen / 2, palette[0], palette[1]);
    ctx.beginPath();
    ctx.ellipse(0, 0, leafWid / 2, leafLen / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // midrib
    ctx.strokeStyle = 'rgba(20, 48, 14, 0.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -leafLen / 2);
    ctx.lineTo(0, leafLen / 2);
    ctx.stroke();
    ctx.restore();
  }

  // round off the silhouette so distant cards never read as squares
  ctx.globalCompositeOperation = 'destination-in';
  const falloff = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
  falloff.addColorStop(0, 'rgba(0,0,0,1)');
  falloff.addColorStop(0.82, 'rgba(0,0,0,1)');
  falloff.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  return toTexture(canvas, { repeat: false });
}

// Big tropical leaf (banana / monstera style), drawn pointing up.
export function createBananaLeafTexture(seed = 707) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);

  const cx = 128;
  ctx.fillStyle = leafGradient(ctx, 0, 512, 0, 0, '#2c6e1e', '#55b13a');
  ctx.beginPath();
  ctx.moveTo(cx, 6);
  ctx.bezierCurveTo(232, 80, 244, 290, cx + 30, 500);
  ctx.lineTo(cx - 30, 500);
  ctx.bezierCurveTo(12, 290, 24, 80, cx, 6);
  ctx.closePath();
  ctx.fill();

  // rib
  ctx.strokeStyle = 'rgba(220, 245, 180, 0.85)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, 10);
  ctx.lineTo(cx, 506);
  ctx.stroke();

  // veins + rips along the edges (banana leaves tear naturally)
  for (let i = 0; i < 26; i += 1) {
    const t = i / 26;
    const y = 30 + t * 450;
    const reach = 96 * (1 - Math.abs(t - 0.45) * 1.1);
    ctx.strokeStyle = 'rgba(28, 66, 18, 0.5)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx + reach * 0.5, y + 14, cx + reach, y + 34);
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx - reach * 0.5, y + 14, cx - reach, y + 34);
    ctx.stroke();

    if (random() > 0.62) {
      // tear: erase a thin wedge from the edge inward
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const side = random() > 0.5 ? 1 : -1;
      const edgeX = cx + side * reach;
      ctx.beginPath();
      ctx.moveTo(edgeX + side * 24, y + 30);
      ctx.lineTo(cx + side * reach * 0.45, y + 26 + random() * 14);
      ctx.lineTo(edgeX + side * 24, y + 52 + random() * 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  return toTexture(canvas, { repeat: false });
}

// Palm frond: central stem with paired leaflets, pointing up.
export function createPalmFrondTexture(seed = 808) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);

  const cx = 128;
  ctx.strokeStyle = '#5d8a37';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, 500);
  ctx.quadraticCurveTo(cx + 6, 250, cx, 12);
  ctx.stroke();

  for (let i = 0; i < 30; i += 1) {
    const t = i / 30;
    const y = 26 + t * 460;
    const len = 92 * Math.sin(Math.PI * (0.16 + 0.84 * (1 - t))) + 16;
    const droop = 28 + t * 36;
    for (const side of [-1, 1]) {
      const g = leafGradient(ctx, cx, y, cx + side * len, y + droop, '#3f8f28', '#71c04b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + side * len * 0.5, y + droop * 0.3 - 7, cx + side * len, y + droop);
      ctx.quadraticCurveTo(cx + side * len * 0.5, y + droop * 0.42 + 7, cx, y + 9);
      ctx.closePath();
      ctx.globalAlpha = 0.92 + random() * 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  return toTexture(canvas, { repeat: false });
}

// Fern frond — lacy pinnate silhouette.
export function createFernTexture(seed = 909) {
  const canvas = makeCanvas(256, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 512);

  const cx = 128;
  ctx.strokeStyle = '#2f6b22';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, 504);
  ctx.quadraticCurveTo(cx - 8, 260, cx + 4, 20);
  ctx.stroke();

  for (let i = 0; i < 24; i += 1) {
    const t = i / 24;
    const y = 36 + t * 440;
    const stemX = cx - 8 * Math.sin(t * 2.4) + 2;
    const len = 86 * Math.sin(Math.PI * (0.12 + 0.88 * (1 - t))) + 8;
    for (const side of [-1, 1]) {
      // each pinna is a row of tiny leaflets
      const tipX = stemX + side * len;
      const tipY = y + 16 + t * 10;
      const segs = 7;
      for (let s = 0; s < segs; s += 1) {
        const st = s / segs;
        const px = stemX + (tipX - stemX) * st;
        const py = y + (tipY - y) * st;
        const ll = (1 - st) * 13 + 3;
        ctx.fillStyle = `rgba(${52 + random() * 30}, ${125 + random() * 40}, ${40 + random() * 20}, 0.95)`;
        ctx.beginPath();
        ctx.ellipse(px, py, ll * 0.5, ll * 0.22, side * (0.5 + st * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return toTexture(canvas, { repeat: false });
}

// Tuft of grass blades.
export function createGrassBladeTexture(seed = 1010) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 256);

  for (let i = 0; i < 34; i += 1) {
    const baseX = 38 + random() * 180;
    const top = 18 + random() * 60;
    const lean = (random() - 0.5) * 80;
    const width = 4 + random() * 6;
    const g = leafGradient(ctx, baseX, 256, baseX + lean, top, '#3a7a26', '#7cc24f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, 256);
    ctx.quadraticCurveTo(baseX - width / 4 + lean * 0.4, 150, baseX + lean, top);
    ctx.quadraticCurveTo(baseX + width / 4 + lean * 0.4, 152, baseX + width / 2, 256);
    ctx.closePath();
    ctx.fill();
  }

  return toTexture(canvas, { repeat: false });
}

// Bright tropical flower on a stem.
export function createFlowerTexture(seed = 1111) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 256);

  // stem + leaves
  ctx.strokeStyle = '#3c7a2a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(128, 252);
  ctx.quadraticCurveTo(120, 170, 128, 104);
  ctx.stroke();
  ctx.fillStyle = '#46892f';
  ctx.beginPath();
  ctx.ellipse(102, 196, 30, 11, -0.6, 0, Math.PI * 2);
  ctx.ellipse(154, 172, 30, 11, 0.55, 0, Math.PI * 2);
  ctx.fill();

  // petals
  const colors = [
    ['#ff4f7e', '#ffa3bd'],
    ['#ff7a3c', '#ffc09a'],
    ['#e84fff', '#f3aaff'],
    ['#ff3c50', '#ff9d8a'],
  ];
  const palette = colors[Math.floor(random() * colors.length)];
  const cx = 128;
  const cy = 86;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.fillStyle = leafGradient(
      ctx,
      cx,
      cy,
      cx + Math.cos(a) * 60,
      cy + Math.sin(a) * 60,
      palette[0],
      palette[1]
    );
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(34, 0, 34, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffe45e';
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98a1b';
  for (let i = 0; i < 8; i += 1) {
    const a = random() * Math.PI * 2;
    const r = random() * 9;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  return toTexture(canvas, { repeat: false });
}

// Hanging vine strip with leaves along it.
export function createVineTexture(seed = 1212) {
  const canvas = makeCanvas(128, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 128, 512);

  ctx.strokeStyle = '#4a6b2c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  let x = 64;
  for (let y = 0; y <= 512; y += 32) {
    x += (random() - 0.5) * 14;
    x = Math.max(28, Math.min(100, x));
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // leaves along the vine
  for (let i = 0; i < 30; i += 1) {
    const y = 14 + random() * 488;
    const side = random() > 0.5 ? 1 : -1;
    const lx = 64 + (random() - 0.5) * 26;
    const len = 13 + random() * 15;
    ctx.fillStyle = leafGradient(ctx, lx, y, lx + side * len, y, '#37761f', '#5fae3c');
    ctx.save();
    ctx.translate(lx, y);
    ctx.rotate(side * (0.5 + random() * 0.7));
    ctx.beginPath();
    ctx.ellipse(len * 0.55, 0, len * 0.62, len * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return toTexture(canvas, { repeat: false });
}

// Soft round particle sprite (mist, splash, pollen).
export function createSpriteTexture(inner = 'rgba(255,255,255,0.95)', outer = 'rgba(255,255,255,0)') {
  const canvas = makeCanvas(128);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(canvas, { repeat: false });
}

// Butterfly wing pair (drawn for a horizontal quad, body along center).
export function createButterflyTexture(seed = 1313) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, 256, 256);

  const palettes = [
    ['#3fa7ff', '#1c5dbb', '#bfe6ff'],
    ['#ffb53c', '#c4641a', '#ffe9b8'],
    ['#ff5ca8', '#a81c5e', '#ffd3e8'],
  ];
  const [c0, c1, c2] = palettes[Math.floor(random() * palettes.length)];

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.scale(side, 1);
    // forewing
    ctx.fillStyle = leafGradient(ctx, 0, 0, 110, -80, c0, c1);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.bezierCurveTo(70, -110, 124, -86, 112, -26);
    ctx.bezierCurveTo(104, 6, 52, 16, 6, 6);
    ctx.closePath();
    ctx.fill();
    // hindwing
    ctx.fillStyle = leafGradient(ctx, 0, 0, 90, 80, c1, c0);
    ctx.beginPath();
    ctx.moveTo(6, 8);
    ctx.bezierCurveTo(72, 18, 96, 66, 64, 102);
    ctx.bezierCurveTo(34, 124, 8, 76, 6, 18);
    ctx.closePath();
    ctx.fill();
    // spots
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(74, -52, 11, 0, Math.PI * 2);
    ctx.arc(52, 56, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // body
  ctx.fillStyle = '#2b1d12';
  ctx.beginPath();
  ctx.ellipse(128, 124, 7, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  return toTexture(canvas, { repeat: false });
}

// Caustics tile — bright refracted light web on black, tileable-ish.
export function createCausticsTexture(seed = 1414) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';

  // web of soft arcs
  for (let i = 0; i < 260; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 18 + random() * 60;
    const start = random() * Math.PI * 2;
    const sweep = 0.8 + random() * 1.6;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + random() * 0.12})`;
    ctx.lineWidth = 2 + random() * 4;
    ctx.beginPath();
    ctx.arc(x, y, r, start, start + sweep);
    ctx.stroke();

    // wrap copies for tiling
    for (const [ox, oy] of [[-size, 0], [size, 0], [0, -size], [0, size]]) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, start, start + sweep);
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  return toTexture(canvas, { srgb: false });
}

export function createAllTextures() {
  return {
    grass: createGrassTexture(),
    sand: createSandTexture(),
    rock: createRockTexture(),
    moss: createMossTexture(),
    noise: createNoiseTexture(),
    bark: createBarkTexture(505),
    palmBark: createBarkTexture(515, { r: 124, g: 99, b: 70 }),
    canopy: createCanopyTexture(606),
    canopyB: createCanopyTexture(616),
    bananaLeaf: createBananaLeafTexture(),
    palmFrond: createPalmFrondTexture(),
    fern: createFernTexture(),
    grassBlade: createGrassBladeTexture(),
    flower: createFlowerTexture(1111),
    flowerB: createFlowerTexture(2111),
    vine: createVineTexture(),
    softSprite: createSpriteTexture(),
    butterfly: createButterflyTexture(1313),
    butterflyB: createButterflyTexture(2313),
    caustics: createCausticsTexture(),
  };
}

// Full texture set including derived normal maps (call once at startup).
export function createAllTexturesWithNormals() {
  const textures = createAllTextures();
  textures.dirt = createDirtTexture();
  textures.litter = createLitterTexture();
  textures.rockNormal = createNormalFromCanvas(textures.rock, 3.2, 1);
  textures.sandNormal = createNormalFromCanvas(textures.sand, 1.4, 1);
  textures.dirtNormal = createNormalFromCanvas(textures.dirt, 2.6, 1);
  textures.litterNormal = createNormalFromCanvas(textures.litter, 2.4, 1);
  textures.grassNormal = createNormalFromCanvas(textures.grass, 1.2, 2);
  textures.barkNormal = createNormalFromCanvas(textures.bark, 3.0, 1);
  textures.palmBarkNormal = createNormalFromCanvas(textures.palmBark, 3.0, 1);
  return textures;
}
