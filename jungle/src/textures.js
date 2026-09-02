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

// Linear-space (non-colour) data tile: height maps sampled by the ground shader.
function heightTexture(canvas) {
  const texture = toTexture(canvas, { srgb: false });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// Pack a linear data field (height, caustics) into the alpha channel of a
// painted tile so the ground shader reads both in one sample. WebGPU allows
// only 16 sampled textures per shader stage (the terrain material alone was
// at 17 + shadow maps and failed to build its pipeline), so every channel
// counts. A 2D canvas stores premultiplied pixels — alpha < 1 would corrupt
// the colour — so the pair is uploaded as a DataTexture instead, rows
// reversed to match the flipY orientation of every CanvasTexture tile.
function packAlphaTexture(colorCanvas, alphaField, { srgb = true } = {}) {
  const size = colorCanvas.width;
  const src = colorCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const srcRow = (size - 1 - y) * size;
    const dstRow = y * size;
    for (let x = 0; x < size; x += 1) {
      const s = (srcRow + x) * 4;
      const d = (dstRow + x) * 4;
      data[d] = src[s];
      data[d + 1] = src[s + 1];
      data[d + 2] = src[s + 2];
      const a = alphaField[srcRow + x];
      data[d + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
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

// ---------- seamless drawing helpers for paired albedo + height canvases ----------

// Run `draw(ctx)` at every wrapped copy a feature with bounding box
// [x0, y0, x1, y1] needs so the tile stays seamless.
function wrapDraw(ctx, x0, y0, x1, y1, draw) {
  const { width, height } = ctx.canvas;
  const xs = [0];
  if (x0 < 0) xs.push(width);
  if (x1 > width) xs.push(-width);
  const ys = [0];
  if (y0 < 0) ys.push(height);
  if (y1 > height) ys.push(-height);
  for (const ox of xs) {
    for (const oy of ys) {
      ctx.save();
      ctx.translate(ox, oy);
      draw(ctx);
      ctx.restore();
    }
  }
}

// Height canvases are grey: white raises, black lowers. `amount` in -1..1.
function heightInk(amount) {
  const a = Math.min(1, Math.abs(amount));
  return amount >= 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
}

// Separable wrap-around box blur of a float field (running sums, O(n)).
function blurField(field, size, radius) {
  const tmp = new Float32Array(size * size);
  const inv = 1 / (radius * 2 + 1);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += field[row + ((k + size) % size)];
    for (let x = 0; x < size; x += 1) {
      tmp[row + x] = sum * inv;
      sum += field[row + ((x + radius + 1) % size)] - field[row + ((x - radius + size) % size)];
    }
  }
  const out = new Float32Array(size * size);
  for (let x = 0; x < size; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += tmp[((k + size) % size) * size + x];
    for (let y = 0; y < size; y += 1) {
      out[y * size + x] = sum * inv;
      sum += tmp[((y + radius + 1) % size) * size + x] - tmp[((y - radius + size) % size) * size + x];
    }
  }
  return out;
}

function readHeights(canvas) {
  const size = canvas.width;
  const data = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * 4] / 255;
  return out;
}

function writeHeights(canvas, heights) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < heights.length; i += 1) {
    const v = Math.round(Math.min(1, Math.max(0, heights[i])) * 255);
    const o = i * 4;
    image.data[o] = v;
    image.data[o + 1] = v;
    image.data[o + 2] = v;
    image.data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

// Cavity shading baked into an albedo canvas: pixels sitting below their
// blurred neighbourhood (crevices, the soil around a pebble, cracks) darken;
// tiny ridges get a faint lift. Direction-free, so it never fights the
// dynamic light — it reads as damp dirt collecting in the low spots.
function bakeCavity(colorCanvas, heights, radius, strength) {
  const size = colorCanvas.width;
  const ctx = colorCanvas.getContext('2d');
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const blurred = blurField(heights, size, radius);
  for (let i = 0; i < heights.length; i += 1) {
    const d = blurred[i] - heights[i];
    const shade = d > 0 ? 1 - Math.min(0.6, d * strength) : 1 + Math.min(0.12, -d * strength * 0.25);
    const o = i * 4;
    data[o] = Math.min(255, data[o] * shade);
    data[o + 1] = Math.min(255, data[o + 1] * shade);
    data[o + 2] = Math.min(255, data[o + 2] * shade);
  }
  ctx.putImageData(image, 0, 0);
}

const smooth01 = (t) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

// A half-buried pebble drawn on both canvases: shadow underneath, body with a
// lit top-left and a dark underside, a specular chip on top; dome in height.
function drawPebble(cc, hc, x, y, r, aspect, rot, tone, hLift = 0.85) {
  const rr = r * 1.4;
  wrapDraw(cc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(28, 20, 12, 0.5)';
    ctx.beginPath();
    ctx.ellipse(r * 0.18, r * 0.34, r * 1.12, r * aspect * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(-r * 0.7, -r * 0.7, r * 0.6, r * 0.7);
    g.addColorStop(0, tone[0]);
    g.addColorStop(0.55, tone[1]);
    g.addColorStop(1, tone[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * aspect, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(236, 226, 206, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * aspect * 0.36, r * 0.34, r * aspect * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  wrapDraw(hc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
    ctx.translate(x, y);
    ctx.rotate(rot);
    // the soil is pressed down in a small ring around the stone
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.35, r * aspect * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,255,255,${hLift})`);
    g.addColorStop(0.55, `rgba(255,255,255,${hLift * 0.75})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * aspect, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Pointed leaf (two quadratic arcs) with a midrib and vein pairs, drawn at the
// origin along +x; `len`/`wid` are half sizes.
function leafPath(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(-len, 0);
  ctx.quadraticCurveTo(-len * 0.25, -wid * 1.7, len, 0);
  ctx.quadraticCurveTo(-len * 0.25, wid * 1.7, -len, 0);
  ctx.closePath();
}

function drawLeaf(cc, hc, random, x, y, len, wid, rot, color, { veins = true, shadow = true, height = 0.24, edgeTint = null } = {}) {
  const rr = len + 3;
  wrapDraw(cc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (shadow) {
      ctx.save();
      ctx.translate(len * 0.05, wid * 0.35 + 1.2);
      ctx.fillStyle = 'rgba(20, 14, 8, 0.42)';
      leafPath(ctx, len, wid);
      ctx.fill();
      ctx.restore();
    }
    if (edgeTint) {
      const g = ctx.createLinearGradient(0, -wid, 0, wid);
      g.addColorStop(0, edgeTint);
      g.addColorStop(0.5, color);
      g.addColorStop(1, edgeTint);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = color;
    }
    leafPath(ctx, len, wid);
    ctx.fill();
    if (veins) {
      ctx.strokeStyle = 'rgba(40, 26, 12, 0.4)';
      ctx.lineWidth = Math.max(0.6, wid * 0.12);
      ctx.beginPath();
      ctx.moveTo(-len * 0.95, 0);
      ctx.lineTo(len * 0.9, 0);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.4, wid * 0.07);
      ctx.strokeStyle = 'rgba(40, 26, 12, 0.22)';
      const pairs = 2 + Math.floor(random() * 3);
      for (let k = 0; k < pairs; k += 1) {
        const t = -len * 0.6 + (k / pairs) * len * 1.3;
        ctx.beginPath();
        ctx.moveTo(t, 0);
        ctx.lineTo(t + len * 0.3, -wid * 0.8);
        ctx.moveTo(t, 0);
        ctx.lineTo(t + len * 0.3, wid * 0.8);
        ctx.stroke();
      }
    }
  });
  if (hc && height !== 0) {
    wrapDraw(hc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = heightInk(height);
      leafPath(ctx, len, wid);
      ctx.fill();
      // leaves curl: the edges lift a touch more than the blade
      ctx.strokeStyle = heightInk(height * 0.5);
      ctx.lineWidth = Math.max(0.8, wid * 0.22);
      leafPath(ctx, len * 0.98, wid * 0.98);
      ctx.stroke();
    });
  }
}

// Straight-ish twig with a bark-dark core and a lit upper edge.
function drawTwig(cc, hc, x0, y0, x1, y1, w, alpha = 0.9, height = 0.45) {
  const pad = w + 2;
  const bx0 = Math.min(x0, x1) - pad;
  const by0 = Math.min(y0, y1) - pad;
  const bx1 = Math.max(x0, x1) + pad;
  const by1 = Math.max(y0, y1) + pad;
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.06;
  const my = (y0 + y1) / 2 - (x1 - x0) * 0.06;
  wrapDraw(cc, bx0, by0, bx1, by1, (ctx) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(24, 16, 10, ${alpha * 0.45})`;
    ctx.lineWidth = w + 1.8;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.8, y0 + 1.4);
    ctx.quadraticCurveTo(mx + 0.8, my + 1.4, x1 + 0.8, y1 + 1.4);
    ctx.stroke();
    ctx.strokeStyle = `rgba(74, 56, 38, ${alpha})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(132, 108, 80, ${alpha * 0.35})`;
    ctx.lineWidth = Math.max(0.5, w * 0.28);
    ctx.beginPath();
    ctx.moveTo(x0, y0 - w * 0.25);
    ctx.quadraticCurveTo(mx, my - w * 0.25, x1, y1 - w * 0.25);
    ctx.stroke();
  });
  if (hc) {
    wrapDraw(hc, bx0, by0, bx1, by1, (ctx) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = heightInk(height * 0.4);
      ctx.lineWidth = w + 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
      ctx.strokeStyle = heightInk(height);
      ctx.lineWidth = Math.max(0.6, w * 0.6);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
    });
  }
}

// ---------- ground tiles ----------

// Jungle floor grass: an olive two-tone lawn with clover patches, dead blades,
// litter and bare earth worn through in patches. Returns { color, height,
// heights } so the normal map can come from real relief.
export function createGrassTextureSet(size = 1024) {
  const colorCanvas = makeCanvas(size);
  const heightCanvas = makeCanvas(size);
  const cc = colorCanvas.getContext('2d');
  const hc = heightCanvas.getContext('2d');
  const random = mulberry32(101);
  const s = size / 512;

  const tone = tileableFbm(size, 1011, { octaves: 4, baseCells: 3, gain: 0.55, contrast: 1.35 });
  const wear = tileableFbm(size, 1012, { octaves: 3, baseCells: 4, gain: 0.5, contrast: 1.7 });
  const clover = tileableFbm(size, 1013, { octaves: 3, baseCells: 5, gain: 0.5, contrast: 1.6 });
  const tuft = tileableFbm(size, 1014, { octaves: 5, baseCells: 14, gain: 0.55, contrast: 1.6 });

  const image = cc.createImageData(size, size);
  const data = image.data;
  const baseH = new Float32Array(size * size);
  // two lawn tones: a cool blue-green and a warm yellow-olive
  const cool = [60, 100, 44];
  const warm = [88, 116, 40];
  const soil = [104, 82, 58];
  for (let i = 0; i < size * size; i += 1) {
    const t = tone[i];
    const bare = smooth01((wear[i] - 0.7) / 0.12);
    const tf = tuft[i];
    let r = cool[0] + (warm[0] - cool[0]) * t;
    let g = cool[1] + (warm[1] - cool[1]) * t;
    let b = cool[2] + (warm[2] - cool[2]) * t;
    const shade = 0.78 + tf * 0.42;
    r *= shade;
    g *= shade;
    b *= shade;
    r = r * (1 - bare) + soil[0] * (0.8 + tf * 0.35) * bare;
    g = g * (1 - bare) + soil[1] * (0.8 + tf * 0.35) * bare;
    b = b * (1 - bare) + soil[2] * (0.8 + tf * 0.35) * bare;
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
    baseH[i] = 0.5 + (tf - 0.5) * 0.2 - bare * 0.22;
  }
  cc.putImageData(image, 0, 0);
  writeHeights(heightCanvas, baseH);

  const wearAt = (x, y) => wear[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)];
  const cloverAt = (x, y) => clover[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)];

  // grit and tiny stones where the earth shows through
  for (let i = 0; i < 700 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    if (wearAt(x, y) < 0.74) continue;
    const r = (0.7 + random() * 1.6) * s;
    const tones = random() > 0.5 ? ['#a08e78', '#82725e', '#5a4e40'] : ['#8a7458', '#6e5a44', '#4a3a2c'];
    drawPebble(cc, hc, x, y, r, 0.65 + random() * 0.35, random() * Math.PI, tones, 0.6);
  }

  // blade strokes — live greens, yellowed and dead brown blades, thinner where worn
  const bladeCount = Math.round(2100 * s * s);
  for (let i = 0; i < bladeCount; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const w = wearAt(x, y);
    if (random() < smooth01((w - 0.64) / 0.14) * 0.92) continue;
    const len = (5 + random() * 14) * s;
    const lean = (random() - 0.5) * 6 * s;
    const pick = random();
    const c = pick > 0.62
      ? 'rgba(112, 168, 70, 0.55)'
      : pick > 0.3
        ? 'rgba(40, 80, 28, 0.5)'
        : pick > 0.13
          ? 'rgba(154, 144, 72, 0.42)'
          : 'rgba(112, 86, 48, 0.42)';
    const lw = (0.8 + random() * 1.2) * s;
    const bx0 = Math.min(x, x + lean) - 3;
    const bx1 = Math.max(x, x + lean) + 3;
    wrapDraw(cc, bx0, y - len - 3, bx1, y + 3, (ctx) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.5, y - len * 0.6, x + lean, y - len);
      ctx.stroke();
    });
    wrapDraw(hc, bx0, y - len - 3, bx1, y + 3, (ctx) => {
      ctx.strokeStyle = heightInk(0.28);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.5, y - len * 0.6, x + lean, y - len);
      ctx.stroke();
    });
  }

  // clover patches: trefoil leaves with a pale heart, a few white flower heads
  for (let i = 0; i < 1400 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    if (random() > smooth01((cloverAt(x, y) - 0.55) / 0.2) * 0.95 + 0.04) continue;
    if (wearAt(x, y) > 0.72) continue;
    const leafR = (2.2 + random() * 1.6) * s;
    const spread = leafR * 1.05;
    const base = random() > 0.5 ? [86, 142, 58] : [64, 118, 48];
    const rr = spread + leafR + 2;
    const rot = random() * Math.PI * 2;
    wrapDraw(cc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(18, 34, 12, 0.4)';
      ctx.beginPath();
      ctx.arc(0.8, 1.4, spread + leafR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k += 1) {
        const a = (k / 3) * Math.PI * 2;
        const lx = Math.cos(a) * spread;
        const ly = Math.sin(a) * spread;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, leafR);
        g.addColorStop(0, `rgb(${base[0] + 60}, ${base[1] + 50}, ${base[2] + 40})`);
        g.addColorStop(0.35, `rgb(${base[0]}, ${base[1]}, ${base[2]})`);
        g.addColorStop(1, `rgb(${base[0] - 22}, ${base[1] - 26}, ${base[2] - 14})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(lx, ly, leafR, leafR * 0.82, a, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    wrapDraw(hc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
      ctx.translate(x, y);
      ctx.fillStyle = heightInk(0.42);
      ctx.beginPath();
      ctx.arc(0, 0, spread + leafR * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    if (random() < 0.04) {
      wrapDraw(cc, x - 4, y - 4, x + 4, y + 4, (ctx) => {
        ctx.fillStyle = 'rgba(236, 232, 214, 0.85)';
        for (let k = 0; k < 6; k += 1) {
          const a = random() * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 1.4 * s, y + Math.sin(a) * 1.4 * s, 0.9 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  // dead leaves and twigs blown into the grass
  const leafPalette = ['#8a5a2b', '#a86f34', '#6b4a22', '#b98a3f', '#7d6a2c', '#4f3a1d'];
  for (let i = 0; i < 90 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const len = (4 + random() * 6) * s;
    drawLeaf(cc, hc, random, x, y, len, len * (0.3 + random() * 0.2), random() * Math.PI, leafPalette[Math.floor(random() * leafPalette.length)], { veins: false, height: 0.2 });
  }
  for (let i = 0; i < 26 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const a = random() * Math.PI;
    const l = (10 + random() * 22) * s;
    drawTwig(cc, hc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, (0.8 + random() * 1.2) * s, 0.75, 0.3);
  }

  const heights = readHeights(heightCanvas);
  bakeCavity(colorCanvas, heights, Math.round(3 * s), 1.2);
  return { color: toTexture(colorCanvas), height: heightTexture(heightCanvas), heights, size };
}

export function createGrassTexture() {
  return createGrassTextureSet().color;
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

// Tileable multi-octave value noise on a wrapping lattice (integer cell counts
// per tile so every octave tiles exactly). Returns Float32Array in [0, 1].
function tileableFbm(size, seed, { octaves = 5, baseCells = 4, gain = 0.5, contrast = 1.5 } = {}) {
  const random = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let cells = baseCells;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();
    const scale = cells / size;
    for (let y = 0; y < size; y += 1) {
      const v = y * scale;
      const j0 = Math.floor(v);
      const j1 = (j0 + 1) % cells;
      const fv = v - j0;
      const sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
      for (let x = 0; x < size; x += 1) {
        const u = x * scale;
        const i0 = Math.floor(u);
        const i1 = (i0 + 1) % cells;
        const fu = u - i0;
        const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10);
        const a = lattice[j0 * cells + i0];
        const b = lattice[j0 * cells + i1];
        const c = lattice[j1 * cells + i0];
        const d = lattice[j1 * cells + i1];
        const top = a + (b - a) * su;
        const bottom = c + (d - c) * su;
        out[y * size + x] += amp * (top + (bottom - top) * sv);
      }
    }
    norm += amp;
    amp *= gain;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i += 1) {
    const v = 0.5 + (out[i] / norm - 0.5) * contrast;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

// Wrapping Voronoi: per pixel the nearest-seed distance (f1), the second
// nearest (f2, so f2 - f1 is a crack field) and the nearest cell id.
function voronoiField(size, cells, seed, jitter = 0.95) {
  const random = mulberry32(seed);
  const seeds = new Float32Array(cells * cells * 2);
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      seeds[(j * cells + i) * 2] = i + 0.5 + (random() - 0.5) * jitter;
      seeds[(j * cells + i) * 2 + 1] = j + 0.5 + (random() - 0.5) * jitter;
    }
  }
  const f1 = new Float32Array(size * size);
  const f2 = new Float32Array(size * size);
  const id = new Uint16Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y += 1) {
    const v = y * scale;
    const cj = Math.floor(v);
    for (let x = 0; x < size; x += 1) {
      const u = x * scale;
      const ci = Math.floor(u);
      let best = Infinity;
      let second = Infinity;
      let bestId = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        const jj = (cj + dj + cells) % cells;
        for (let di = -1; di <= 1; di += 1) {
          const ii = (ci + di + cells) % cells;
          const k = jj * cells + ii;
          // seed position in the (possibly wrapped) neighbour cell
          const sx = seeds[k * 2] + (ci + di - ii);
          const sy = seeds[k * 2 + 1] + (cj + dj - jj);
          const d = Math.hypot(u - sx, v - sy);
          if (d < best) {
            second = best;
            best = d;
            bestId = k;
          } else if (d < second) {
            second = d;
          }
        }
      }
      const p = y * size + x;
      f1[p] = best;
      f2[p] = second;
      id[p] = bestId;
    }
  }
  return { f1, f2, id, cells };
}

// Weathered jointed rock: fracture plates (two Voronoi scales) with dark
// cracks and a light chiselled edge, per-plate tone, grain, lichen and faint
// sedimentary banding. Written per pixel so it tiles exactly.
export function createRockTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(303);
  const image = ctx.createImageData(size, size);
  const data = image.data;

  const plates = voronoiField(size, 5, 3031, 0.95);
  const fine = voronoiField(size, 12, 3032, 1.0);
  const grain = tileableFbm(size, 3033, { octaves: 6, baseCells: 8, contrast: 1.7 });
  const mottle = tileableFbm(size, 3034, { octaves: 3, baseCells: 2, contrast: 1.4 });
  const lichenField = tileableFbm(size, 3035, { octaves: 4, baseCells: 6, contrast: 2.2 });
  // fractures are partial: this field fades joints in and out along their length
  const crackMask = tileableFbm(size, 3036, { octaves: 4, baseCells: 5, contrast: 1.8 });
  const plateTone = new Float32Array(plates.cells * plates.cells);
  for (let i = 0; i < plateTone.length; i += 1) plateTone[i] = 0.92 + random() * 0.16;
  const fineTone = new Float32Array(fine.cells * fine.cells);
  for (let i = 0; i < fineTone.length; i += 1) fineTone[i] = 0.95 + random() * 0.1;

  // A real height field for the normal map (the albedo's luminance only
  // yields the thin crack grooves, which is why cliff faces read as troweled
  // plaster): each plate bulges and bevels down into its joints, the finer
  // plates add smaller bevels, grain and mottle add roughness.
  const heightCanvas = makeCanvas(size);
  const heightCtx = heightCanvas.getContext('2d');
  const heightImage = heightCtx.createImageData(size, size);
  const heightData = heightImage.data;
  const smooth01 = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  const base = [0x72, 0x74, 0x6c];
  const warm = [0x82, 0x7a, 0x68];
  const cool = [0x62, 0x6a, 0x6c];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const p = y * size + x;
      const crackW = plates.f2[p] - plates.f1[p];
      const fineW = fine.f2[p] - fine.f1[p];
      // cracks: dark core, light lip on the upper-left side (the "chisel"),
      // both gated by the crack mask so the joint network is broken up
      const cm = crackMask[p];
      const gate = Math.min(1, Math.max(0, (cm - 0.38) / 0.3));
      const gateFine = Math.min(1, Math.max(0, (cm - 0.5) / 0.3));
      const crack = Math.max(0, 1 - crackW / 0.05) * gate;
      const fineCrack = Math.max(0, 1 - fineW / 0.075) * 0.5 * gateFine;
      {
        const bevel = 1 - (1 - smooth01(0, 0.26, crackW)) * (0.35 + 0.65 * gate);
        const fineBevel = 1 - (1 - smooth01(0, 0.3, fineW)) * (0.3 + 0.7 * gateFine);
        const hgt = bevel * 0.42 + fineBevel * 0.13 + grain[p] * 0.26 + mottle[p] * 0.19;
        const hv = Math.round(Math.min(1, Math.max(0, hgt)) * 255);
        const ho = p * 4;
        heightData[ho] = hv;
        heightData[ho + 1] = hv;
        heightData[ho + 2] = hv;
        heightData[ho + 3] = 255;
      }
      const pUp = ((y - 2 + size) % size) * size + ((x - 2 + size) % size);
      const lip = Math.max(0, 1 - (plates.f2[pUp] - plates.f1[pUp]) / 0.05) * gate * (1 - crack);
      const tone = plateTone[plates.id[p]] * fineTone[fine.id[p]];
      const g = grain[p];
      const m = mottle[p];
      // sedimentary banding, gently warped by the mottle field
      const band = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 9 + m * 4.5);
      let shade = tone * (0.84 + g * 0.32) * (0.9 + m * 0.2) * (0.96 + band * 0.06);
      shade *= 1 - crack * crack * 0.42 - fineCrack * fineCrack * 0.28;
      shade += lip * 0.08;
      // warm/cool drift between plates
      const t = m;
      let r = (base[0] * (1 - t) + warm[0] * t) * 0.5 + cool[0] * 0.5 * (1 - t) + base[0] * 0.5 * t;
      let gg = (base[1] * (1 - t) + warm[1] * t) * 0.5 + cool[1] * 0.5 * (1 - t) + base[1] * 0.5 * t;
      let b = (base[2] * (1 - t) + warm[2] * t) * 0.5 + cool[2] * 0.5 * (1 - t) + base[2] * 0.5 * t;
      r *= shade;
      gg *= shade;
      b *= shade;
      // lichen: pale grey-green crusts on the plates, rust in the seams
      const lichen = Math.min(0.7, Math.max(0, lichenField[p] - 0.74) * 2.6) * (1 - crack);
      if (lichen > 0) {
        r = r * (1 - lichen) + 0x96 * lichen;
        gg = gg * (1 - lichen) + 0x9a * lichen;
        b = b * (1 - lichen) + 0x7c * lichen;
      }
      const rust = crack * Math.max(0, m - 0.55) * 1.2;
      r = r * (1 - rust) + 0x8a * rust;
      gg = gg * (1 - rust) + 0x5e * rust;
      b = b * (1 - rust) + 0x3a * rust;
      const o = p * 4;
      data[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[o + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
      data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // a few moss cushions in the seams (wrapped discs)
  speckle(ctx, random, 220, 7, 0.14, ['#4d6b35', '#3c5829']);

  heightCtx.putImageData(heightImage, 0, 0);
  const tex = toTexture(canvas);
  tex.userData.height = toTexture(heightCanvas, { srgb: false });
  return tex;
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

// Walked jungle dirt (1024²): packed earth with damp/dry tonal drift, soil
// crumbs at two scales, dried-mud patches with crack networks, half-buried
// pebbles, exposed roots, twigs, blown-in leaf fragments, puddle stain rings
// and fine grit. Albedo and height are painted in parallel; the normal map is
// derived from the height so pebbles bump up and cracks dip.
export function createDirtTextureSet(size = 1024) {
  const colorCanvas = makeCanvas(size);
  const heightCanvas = makeCanvas(size);
  const cc = colorCanvas.getContext('2d');
  const hc = heightCanvas.getContext('2d');
  const random = mulberry32(606);
  const s = size / 512;

  const tone = tileableFbm(size, 6061, { octaves: 4, baseCells: 3, gain: 0.55, contrast: 1.3 });
  const clods = tileableFbm(size, 6062, { octaves: 5, baseCells: 10, gain: 0.55, contrast: 1.7 });
  const grit = tileableFbm(size, 6063, { octaves: 3, baseCells: 64, gain: 0.6, contrast: 1.7 });
  const mud = tileableFbm(size, 6064, { octaves: 3, baseCells: 3, gain: 0.5, contrast: 1.6 });
  const crumbs = voronoiField(size, 40, 6065, 1.0);
  const plates = voronoiField(size, 18, 6066, 0.9);
  const platesFine = voronoiField(size, 40, 6067, 1.0);
  const crumbHeight = new Float32Array(crumbs.cells * crumbs.cells);
  for (let i = 0; i < crumbHeight.length; i += 1) crumbHeight[i] = 0.25 + random() * 0.75;
  const plateTilt = new Float32Array(plates.cells * plates.cells);
  for (let i = 0; i < plateTilt.length; i += 1) plateTilt[i] = random();

  const image = cc.createImageData(size, size);
  const data = image.data;
  const baseH = new Float32Array(size * size);
  const damp = [92, 68, 46];
  const dry = [152, 120, 86];
  const iron = [138, 90, 58];
  const mudTone = [160, 138, 108];
  for (let i = 0; i < size * size; i += 1) {
    const t = tone[i];
    // dried-mud patches are the exception, not the rule (a full-tile crack
    // network read as flagstone paving from a few metres), and the cracks are
    // partial: they fade in and out along their length with the clod noise
    const mudGate = smooth01((mud[i] - 0.7) / 0.12);
    const crackW = plates.f2[i] - plates.f1[i];
    const crackGate = smooth01((clods[i] - 0.32) / 0.36);
    const crack = Math.max(0, 1 - crackW / 0.035) * mudGate * crackGate;
    const fineCrack = Math.max(0, 1 - (platesFine.f2[i] - platesFine.f1[i]) / 0.03) * smooth01((mud[i] - 0.78) / 0.1) * crackGate;
    // soil crumbs: a dome per Voronoi cell, flattened where the mud dried smooth
    const crumb = Math.max(0, 1 - crumbs.f1[i] * 1.5) * crumbHeight[crumbs.id[i]] * (1 - mudGate * 0.85);
    // mud plates curl up at the edges as they dry
    const curl = mudGate * smooth01(1 - crackW / 0.35) * 0.35 * (0.6 + plateTilt[plates.id[i]] * 0.4);
    let h = 0.48 + (clods[i] - 0.5) * 0.3 + crumb * 0.2 + (grit[i] - 0.5) * 0.1 * (1 - mudGate * 0.7);
    h += curl * 0.07 - crack * crack * 0.16 - fineCrack * 0.06;
    baseH[i] = h;

    // albedo: damp ↔ dry drift, a red iron patch where the tone is high, pale
    // dried mud, darker in the cracks, fine grit noise
    const ironMix = smooth01((t - 0.72) / 0.2) * 0.6;
    let r = damp[0] + (dry[0] - damp[0]) * t;
    let g = damp[1] + (dry[1] - damp[1]) * t;
    let b = damp[2] + (dry[2] - damp[2]) * t;
    r = r * (1 - ironMix) + iron[0] * ironMix;
    g = g * (1 - ironMix) + iron[1] * ironMix;
    b = b * (1 - ironMix) + iron[2] * ironMix;
    const mudMix = mudGate * 0.55;
    r = r * (1 - mudMix) + mudTone[0] * mudMix;
    g = g * (1 - mudMix) + mudTone[1] * mudMix;
    b = b * (1 - mudMix) + mudTone[2] * mudMix;
    const shade = (0.86 + (h - 0.5) * 0.55) * (0.93 + grit[i] * 0.14) * (1 - crack * crack * 0.24 - fineCrack * 0.14);
    const o = i * 4;
    data[o] = r * shade;
    data[o + 1] = g * shade;
    data[o + 2] = b * shade;
    data[o + 3] = 255;
  }
  cc.putImageData(image, 0, 0);
  writeHeights(heightCanvas, baseH);

  const mudAt = (x, y) => mud[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)];

  // puddle stain rings: a dark damp floor with a tide-mark of silt at the rim
  for (let i = 0; i < 9; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = (22 + random() * 44) * s;
    const squash = 0.6 + random() * 0.4;
    const rot = random() * Math.PI;
    const rr = r * 1.3;
    wrapDraw(cc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.filter = `blur(${3 * s}px)`;
      ctx.fillStyle = 'rgba(38, 26, 16, 0.24)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 36, 22, 0.42)';
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.02, r * squash * 1.02, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(178, 156, 124, 0.26)';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.1, r * squash * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.filter = 'none';
    });
    wrapDraw(hc, x - rr, y - rr, x + rr, y + rr, (ctx) => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * squash, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // exposed roots: a few long low ridges, bark-dark with a lit crest
  for (let i = 0; i < 5; i += 1) {
    const x0 = random() * size;
    const y0 = random() * size;
    const angle = random() * Math.PI * 2;
    const len = (110 + random() * 150) * s;
    const bend = (random() - 0.5) * 110 * s;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    const cx = (x0 + x1) / 2 - Math.sin(angle) * bend;
    const cy = (y0 + y1) / 2 + Math.cos(angle) * bend;
    const w = (3 + random() * 4) * s;
    const pad = w * 2 + 4;
    const bx0 = Math.min(x0, x1, cx) - pad;
    const by0 = Math.min(y0, y1, cy) - pad;
    const bx1 = Math.max(x0, x1, cx) + pad;
    const by1 = Math.max(y0, y1, cy) + pad;
    const taper = random() > 0.5;
    wrapDraw(cc, bx0, by0, bx1, by1, (ctx) => {
      ctx.lineCap = 'round';
      // soil banked against the root
      ctx.strokeStyle = 'rgba(40, 28, 18, 0.35)';
      ctx.lineWidth = w * 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + w * 0.4);
      ctx.quadraticCurveTo(cx, cy + w * 0.4, x1, y1 + w * 0.4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(58, 42, 28, 0.92)';
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(118, 92, 64, 0.7)';
      ctx.lineWidth = w * 0.45;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - w * 0.2);
      ctx.quadraticCurveTo(cx, cy - w * 0.2, x1, y1 - w * 0.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(168, 140, 104, 0.4)';
      ctx.lineWidth = w * 0.16;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - w * 0.3);
      ctx.quadraticCurveTo(cx, cy - w * 0.3, x1, y1 - w * 0.3);
      ctx.stroke();
      // bark ticks across the root
      ctx.strokeStyle = 'rgba(30, 20, 12, 0.35)';
      ctx.lineWidth = Math.max(0.7, w * 0.12);
      for (let k = 0; k < len / (9 * s); k += 1) {
        const t = (k + 0.5) / (len / (9 * s));
        const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
        const tx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
        const ty = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl;
        const ny = tx / tl;
        const hw = w * (0.3 + random() * 0.2) * (taper ? 1 - t * 0.5 : 1);
        ctx.beginPath();
        ctx.moveTo(px - nx * hw, py - ny * hw);
        ctx.lineTo(px + nx * hw, py + ny * hw);
        ctx.stroke();
      }
    });
    wrapDraw(hc, bx0, by0, bx1, by1, (ctx) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = heightInk(0.28);
      ctx.lineWidth = w * 1.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      ctx.strokeStyle = heightInk(0.5);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      ctx.strokeStyle = heightInk(0.55);
      ctx.lineWidth = w * 0.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
    });
  }

  // half-buried pebbles: greys, warm browns, a few pale quartz chips
  const pebbleTones = [
    ['#a89c8c', '#7e7264', '#4c443c'],
    ['#9a8874', '#6e5e4c', '#43382c'],
    ['#8c8c88', '#66665f', '#3b3b38'],
    ['#b8a894', '#8a7a66', '#54483a'],
    ['#d8d0c0', '#a89e8c', '#6a6256'],
    ['#7c6a58', '#57483a', '#33291f'],
  ];
  // stones gather where run-off washed the fines away (a patchy gravel field),
  // with a sparse scatter everywhere else
  const gravel = tileableFbm(size, 6068, { octaves: 3, baseCells: 4, gain: 0.5, contrast: 1.6 });
  const gravelAt = (x, y) => gravel[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)];
  const pebbleCount = Math.round(260 * s * s);
  for (let i = 0; i < pebbleCount; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const patch = smooth01((gravelAt(x, y) - 0.5) / 0.25);
    if (random() > patch * 0.9 + 0.12) continue;
    const big = random() < 0.1;
    const r = (big ? 3.5 + random() * 4 : 0.9 + random() * 2.2) * s;
    drawPebble(cc, hc, x, y, r, 0.55 + random() * 0.4, random() * Math.PI, pebbleTones[Math.floor(random() * pebbleTones.length)], big ? 0.95 : 0.75);
  }

  // twigs and leaf fragments blown onto the path
  // ~9 twigs per m² at the coarse octave; the instanced twigs supply the rest
  for (let i = 0; i < 9 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const a = random() * Math.PI;
    const l = (12 + random() * 30) * s;
    drawTwig(cc, hc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, (1 + random() * 1.4) * s, 0.72, 0.38);
  }
  const bits = ['#7e5830', '#6a4a22', '#907438', '#4c5a28', '#7a5a34', '#a08046', '#5a4020'];
  for (let i = 0; i < 95 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    if (mudAt(x, y) > 0.7 && random() < 0.6) continue;
    const len = (2.5 + random() * 5) * s;
    drawLeaf(cc, hc, random, x, y, len, len * (0.32 + random() * 0.2), random() * Math.PI, bits[Math.floor(random() * bits.length)], { veins: len > 5 * s, height: 0.22 });
  }

  // fine grit: light sand grains and dark humus specks
  speckle(cc, random, Math.round(3200 * s * s), 1.0 * s, 0.18, ['#a89070', '#3a2a1c', '#907858', '#b8a484']);

  const heights = readHeights(heightCanvas);
  bakeCavity(colorCanvas, heights, Math.round(4 * s), 1.6);
  // height rides in the albedo's alpha (color.a) — see packAlphaTexture
  return { color: packAlphaTexture(colorCanvas, heights), height: heightTexture(heightCanvas), heights, size };
}

export function createDirtTexture() {
  return createDirtTextureSet().color;
}

// Forest-floor leaf litter (1024²): dark damp humus with seeds and twigs under
// a deep pile of overlapping pointed leaves — browns, ochres, russet, a few
// still green, a few blackened and wet. Leaves cast a small shadow on the one
// below so the pile has depth; the height map stacks with them.
export function createLitterTextureSet(size = 1024) {
  const colorCanvas = makeCanvas(size);
  const heightCanvas = makeCanvas(size);
  const cc = colorCanvas.getContext('2d');
  const hc = heightCanvas.getContext('2d');
  const random = mulberry32(707);
  const s = size / 512;

  const humus = tileableFbm(size, 7071, { octaves: 5, baseCells: 6, gain: 0.55, contrast: 1.6 });
  const dampF = tileableFbm(size, 7072, { octaves: 3, baseCells: 3, gain: 0.5, contrast: 1.4 });
  const image = cc.createImageData(size, size);
  const data = image.data;
  const baseH = new Float32Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    const hm = humus[i];
    const d = dampF[i];
    const shade = 0.7 + hm * 0.6;
    const o = i * 4;
    data[o] = (50 - d * 14) * shade;
    data[o + 1] = (36 - d * 10) * shade;
    data[o + 2] = (22 - d * 6) * shade;
    data[o + 3] = 255;
    baseH[i] = 0.3 + (hm - 0.5) * 0.16;
  }
  cc.putImageData(image, 0, 0);
  writeHeights(heightCanvas, baseH);
  // seeds, bark chips and rotted fragments in the humus
  speckle(cc, random, Math.round(2400 * s * s), 2.2 * s, 0.4, ['#5a4630', '#2a1e12', '#6a5238', '#3c2c1a']);

  // the pile is uneven: drifts where leaves gather, thin spots where the humus shows
  const drift = tileableFbm(size, 7073, { octaves: 3, baseCells: 3, gain: 0.5, contrast: 1.5 });
  const driftAt = (x, y) => drift[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)];

  // buried layer: old, dark, half-rotted leaves
  const rotted = ['#3e2e1a', '#4a3520', '#342616', '#553d22'];
  for (let i = 0; i < 420 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    if (random() > driftAt(x, y) * 1.3 + 0.15) continue;
    const len = (5 + random() * 12) * s;
    drawLeaf(cc, hc, random, x, y, len, len * (0.32 + random() * 0.25), random() * Math.PI, rotted[Math.floor(random() * rotted.length)], { veins: false, shadow: false, height: 0.12 });
  }
  // twigs under the top leaves
  for (let i = 0; i < 70 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const a = random() * Math.PI;
    const l = (10 + random() * 30) * s;
    drawTwig(cc, hc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, (1 + random() * 1.6) * s, 0.85, 0.35);
  }
  // fresh fall: the visible pile
  const palette = [
    ['#8a5a2b', '#a87a48'],
    ['#a86f34', '#c48a48'],
    ['#6b4a22', '#8a6432'],
    ['#b98a3f', '#d0a860'],
    ['#7d6a2c', '#9a8640'],
    ['#5d7a2f', '#7c9a44'],
    ['#c49a4a', '#dcb468'],
    ['#4f3a1d', '#6a4e2a'],
    ['#9a4e28', '#b86a3c'],
    ['#2e2416', '#3c3020'],
    ['#8f7a3a', '#ad9650'],
  ];
  for (let i = 0; i < 500 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    if (random() > driftAt(x, y) * 1.4 + 0.1) continue;
    // mostly small leaves, a long tail of big broadleaf fall (up to ~30 cm)
    const big = random();
    const len = (big < 0.12 ? 16 + random() * 14 : big < 0.45 ? 9 + random() * 8 : 4.5 + random() * 6) * s;
    const [c0, c1] = palette[Math.floor(random() * palette.length)];
    drawLeaf(cc, hc, random, x, y, len, len * (0.28 + random() * 0.26), random() * Math.PI, c1, { veins: len > 7 * s, shadow: true, height: 0.2 + Math.min(0.15, len / (120 * s)), edgeTint: c0 });
  }
  // a few twigs on top
  for (let i = 0; i < 24 * s * s; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const a = random() * Math.PI;
    const l = (14 + random() * 34) * s;
    drawTwig(cc, hc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, (1.2 + random() * 1.8) * s, 0.95, 0.5);
  }

  const heights = readHeights(heightCanvas);
  bakeCavity(colorCanvas, heights, Math.round(3 * s), 1.4);
  return { color: packAlphaTexture(colorCanvas, heights), height: heightTexture(heightCanvas), heights, size };
}

export function createLitterTexture() {
  return createLitterTextureSet().color;
}

// Alpha atlas (512×256) of two small clusters of fallen leaves, one per half,
// for instanced leaf clumps lying on the trail. Transparent background.
export function createLeafCardTexture(seed = 7373) {
  const size = 256;
  const canvas = makeCanvas(size * 2, size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(seed);
  ctx.clearRect(0, 0, size * 2, size);
  const palette = [
    ['#8a5a2b', '#a87a48'],
    ['#a86f34', '#c48a48'],
    ['#6b4a22', '#8a6432'],
    ['#b98a3f', '#d0a860'],
    ['#9a4e28', '#b86a3c'],
    ['#7d6a2c', '#9a8640'],
    ['#5d7a2f', '#7c9a44'],
    ['#4a3a20', '#66502e'],
  ];
  for (let half = 0; half < 2; half += 1) {
    const cx = size * (half + 0.5);
    const count = 6 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + random() * 0.8;
      const rad = size * (0.06 + random() * 0.17);
      const x = cx + Math.cos(a) * rad;
      const y = size / 2 + Math.sin(a) * rad;
      const len = 44 + random() * 30;
      const [c0, c1] = palette[Math.floor(random() * palette.length)];
      // keep every leaf inside its half of the atlas
      const clampedX = Math.min(cx + size / 2 - len - 4, Math.max(cx - size / 2 + len + 4, x));
      const clampedY = Math.min(size - len - 4, Math.max(len + 4, y));
      drawLeaf(ctx, null, random, clampedX, clampedY, len, len * (0.3 + random() * 0.25), random() * Math.PI, c1, { veins: true, shadow: true, edgeTint: c0, height: 0 });
    }
  }
  const texture = toTexture(canvas, { repeat: false });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// Tangent-space normal map from a float height field in [0, 1] (wrap-around
// central differences, optional box blur so the result isn't pixel-noisy).
export function createNormalFromHeights(heights, size, strength = 4.0, blur = 1) {
  let field = heights;
  for (let pass = 0; pass < blur; pass += 1) field = blurField(field, size, 1);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    const yD = ((y - 1 + size) % size) * size;
    const yU = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const xL = (x - 1 + size) % size;
      const xR = (x + 1) % size;
      let nx = (field[row + xL] - field[row + xR]) * strength;
      let ny = (field[yD + x] - field[yU + x]) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (row + x) * 4;
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
export function createNoiseTexture(size = 512, seed = 808) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  // Blobby, non-periodic-looking tileable FBM. Shaders sample this at every
  // scale from whole-map mottling to boulder moss, so it must have detail at
  // every octave and no plane-wave structure (a cosine sum reads as stripes
  // whenever it is thresholded).
  const field = tileableFbm(size, seed, { octaves: 6, baseCells: 3, gain: 0.55, contrast: 1.45 });
  for (let i = 0; i < size * size; i += 1) {
    const byte = Math.round(field[i] * 255);
    const idx = i * 4;
    image.data[idx] = byte;
    image.data[idx + 1] = byte;
    image.data[idx + 2] = byte;
    image.data[idx + 3] = 255;
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

  // vertical striations: the wander is a sum of sinusoids with periods that
  // divide the tile height, so a fibre leaves the bottom edge exactly where it
  // re-enters at the top (a random walk showed a seam every repeat on tall trunks)
  const TAU = Math.PI * 2;
  for (let i = 0; i < 130; i += 1) {
    const x0 = random() * 256;
    const light = random() > 0.5;
    ctx.strokeStyle = light
      ? `rgba(${tint.r + 38}, ${tint.g + 32}, ${tint.b + 26}, ${0.16 + random() * 0.2})`
      : `rgba(${Math.max(0, tint.r - 42)}, ${Math.max(0, tint.g - 34)}, ${Math.max(0, tint.b - 26)}, ${0.2 + random() * 0.24})`;
    ctx.lineWidth = 1.5 + random() * 4;
    const k1 = 1 + Math.floor(random() * 2);
    const k2 = 3 + Math.floor(random() * 3);
    const p1 = random() * TAU;
    const p2 = random() * TAU;
    const a1 = 4 + random() * 8;
    const a2 = 1.5 + random() * 3;
    const wander = (y) => a1 * Math.sin((y / 512) * TAU * k1 + p1) + a2 * Math.sin((y / 512) * TAU * k2 + p2);
    for (const dx of [-256, 0, 256]) {
      ctx.beginPath();
      ctx.moveTo(x0 + dx + wander(-24), -24);
      for (let y = 0; y <= 536; y += 24) {
        ctx.lineTo(x0 + dx + wander(y), y);
      }
      ctx.stroke();
    }
  }

  // a few faint, partial ring cracks (drawn again a tile up/down so those
  // near the edge wrap); 22 full-width rings made every trunk a cardboard tube
  for (let i = 0; i < 9; i += 1) {
    const y0 = random() * 512;
    ctx.strokeStyle = `rgba(30, 20, 12, ${0.06 + random() * 0.12})`;
    ctx.lineWidth = 1 + random() * 1.6;
    // partial: a crack runs 25–65 % of the way round, then peters out
    const xs = random() * 256;
    const len = 64 + random() * 100;
    const jitter = [];
    for (let x = 0; x <= len; x += 18) jitter.push((random() - 0.5) * 6);
    for (const dy of [-512, 0, 512]) {
      const y = y0 + dy;
      if (y < -8 || y > 520) continue;
      for (const dx of [-256, 0]) {
        ctx.beginPath();
        ctx.moveTo(xs + dx, y + jitter[0]);
        let j = 0;
        for (let x = 0; x <= len; x += 18, j += 1) {
          ctx.lineTo(xs + dx + x, y + jitter[j]);
        }
        ctx.stroke();
      }
    }
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
      const tipX = stemX + side * len;
      const tipY = y + 16 + t * 10;
      // a continuous tapered blade under the leaflets plus a midrib: rows of
      // disjoint ellipses eroded into dotted lines under mipmapping + alpha test
      const nx = -(tipY - y);
      const nz = tipX - stemX;
      const nl = Math.hypot(nx, nz) || 1;
      const halfW = 5.5;
      ctx.fillStyle = `rgba(${48 + random() * 20}, ${112 + random() * 30}, ${38 + random() * 16}, 0.9)`;
      ctx.beginPath();
      ctx.moveTo(stemX + (nx / nl) * halfW, y + (nz / nl) * halfW);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(stemX - (nx / nl) * halfW, y - (nz / nl) * halfW);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a5c1e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stemX, y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      // overlapping leaflets give the blade its serrated silhouette
      const segs = 9;
      for (let s = 0; s < segs; s += 1) {
        const st = s / segs;
        const px = stemX + (tipX - stemX) * st;
        const py = y + (tipY - y) * st;
        const ll = (1 - st) * 14 + 5;
        ctx.fillStyle = `rgba(${52 + random() * 30}, ${125 + random() * 40}, ${40 + random() * 20}, 0.95)`;
        ctx.beginPath();
        ctx.ellipse(px, py, ll * 0.55, ll * 0.26, side * (0.5 + st * 0.4), 0, Math.PI * 2);
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

export function createAllTextures({ grass = null } = {}) {
  // the caustics web rides in the noise tile's alpha so the terrain shader
  // (which already samples the noise everywhere) needs no extra texture unit
  const noise = createNoiseTexture();
  const caustics = createCausticsTexture();
  const cSize = caustics.image.width;
  const nSize = noise.image.width;
  const causticsPixels = caustics.image.getContext('2d').getImageData(0, 0, cSize, cSize).data;
  const causticsField = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y += 1) {
    const cy = Math.floor((y / nSize) * cSize);
    for (let x = 0; x < nSize; x += 1) {
      const cx = Math.floor((x / nSize) * cSize);
      causticsField[y * nSize + x] = causticsPixels[(cy * cSize + cx) * 4] / 255;
    }
  }
  return {
    grass: grass ?? createGrassTexture(),
    sand: createSandTexture(),
    rock: createRockTexture(),
    moss: createMossTexture(),
    noise: packAlphaTexture(noise.image, causticsField, { srgb: false }),
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
    caustics,
  };
}

// Full texture set including derived normal maps (call once at startup).
export function createAllTexturesWithNormals() {
  const t0 = performance.now();
  // ground tiles are painted as albedo + height pairs; the grass set built by
  // createAllTextures is replaced here so the normal comes from real relief
  const grass = createGrassTextureSet();
  const dirt = createDirtTextureSet();
  const litter = createLitterTextureSet();
  const textures = createAllTextures({ grass: grass.color });
  textures.grassHeight = grass.height;
  textures.dirt = dirt.color;
  textures.dirtHeight = dirt.height;
  textures.litter = litter.color;
  textures.litterHeight = litter.height;
  textures.leafCard = createLeafCardTexture(7373);
  for (const key of ['grass', 'dirt', 'litter', 'grassHeight', 'dirtHeight', 'litterHeight']) {
    textures[key].anisotropy = 4;
  }
  // the rock ships its own height field (plate bevels, not just crack grooves)
  textures.rockNormal = createNormalFromCanvas(textures.rock.userData.height || textures.rock, 9.0, 1);
  textures.sandNormal = createNormalFromCanvas(textures.sand, 1.4, 1);
  textures.dirtNormal = createNormalFromHeights(dirt.heights, dirt.size, 7.0, 1);
  textures.litterNormal = createNormalFromHeights(litter.heights, litter.size, 6.0, 1);
  textures.grassNormal = createNormalFromHeights(grass.heights, grass.size, 4.0, 1);
  textures.dirtNormal.anisotropy = 4;
  textures.litterNormal.anisotropy = 4;
  textures.grassNormal.anisotropy = 4;
  textures.barkNormal = createNormalFromCanvas(textures.bark, 3.0, 1);
  textures.palmBarkNormal = createNormalFromCanvas(textures.palmBark, 3.0, 1);
  console.info(`[textures] ground tiles + normals painted in ${(performance.now() - t0).toFixed(0)} ms`);
  return textures;
}
