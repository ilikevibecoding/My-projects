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

export function createDirtTexture() {
  const canvas = makeCanvas(512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(606);

  ctx.fillStyle = '#6a4e36';
  ctx.fillRect(0, 0, 512, 512);
  // soft, out-of-focus tonal drift (damp / dry / iron-red patches) — blurred so
  // it reads as packed earth rather than as painted discs. ctx.filter is a
  // no-op where unsupported, which just leaves the blobs a little crisper.
  ctx.filter = 'blur(7px)';
  speckle(ctx, random, 70, 110, 0.3, ['#5b4230', '#7a5a3d', '#59412c', '#7e6146', '#6d4a30']);
  ctx.filter = 'blur(3px)';
  speckle(ctx, random, 220, 34, 0.24, ['#4f3826', '#82634a', '#6a5038', '#5f4a34']);
  ctx.filter = 'none';

  // clods + fine grit (low contrast: bright dots read as litter from eye height)
  speckle(ctx, random, 900, 9, 0.16, ['#7c5e42', '#4a3524', '#85684a']);
  speckle(ctx, random, 5200, 2.6, 0.18, ['#8a6a48', '#4d3826', '#95784f', '#3f2d1e']);
  speckle(ctx, random, 9000, 1.2, 0.2, ['#9a7c58', '#3c2b1d', '#7a5c40']);

  // half-buried pebbles with a shadow underneath and a small highlight on top
  for (let i = 0; i < 380; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const r = 0.9 + random() * 2.4;
    const rot = random() * Math.PI;
    ctx.fillStyle = 'rgba(40, 28, 18, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 0.6, y + 1.0, r * 1.05, r * 0.7, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = random() > 0.55 ? 'rgba(126, 112, 92, 0.6)' : 'rgba(92, 76, 58, 0.65)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + random() * 0.4), rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214, 196, 168, 0.14)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // a scatter of leaf fragments blown onto the path
  const bits = ['rgba(138, 96, 46, 0.55)', 'rgba(96, 70, 34, 0.6)', 'rgba(160, 124, 60, 0.45)', 'rgba(74, 90, 40, 0.5)'];
  for (let i = 0; i < 150; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const len = 2 + random() * 4.5;
    ctx.fillStyle = bits[Math.floor(random() * bits.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, len, len * 0.4, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // surface roots: a few smooth, low-contrast fibres (kept off the tile edge)
  for (let i = 0; i < 14; i += 1) {
    const x0 = 40 + random() * 432;
    const y0 = 40 + random() * 432;
    const angle = random() * Math.PI * 2;
    const len = 60 + random() * 120;
    const bend = (random() - 0.5) * 80;
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    const cx = (x0 + x1) / 2 - Math.sin(angle) * bend;
    const cy = (y0 + y1) / 2 + Math.cos(angle) * bend;
    const w = 1.6 + random() * 2.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(48, 34, 22, ${0.14 + random() * 0.12})`;
    ctx.lineWidth = w + 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(122, 96, 66, ${0.16 + random() * 0.12})`;
    ctx.lineWidth = w * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 0.6);
    ctx.quadraticCurveTo(cx, cy - 0.6, x1, y1 - 0.6);
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

  // horizontal ring cracks (drawn again a tile up/down so those near the edge wrap)
  for (let i = 0; i < 22; i += 1) {
    const y0 = random() * 512;
    ctx.strokeStyle = `rgba(30, 20, 12, ${0.12 + random() * 0.18})`;
    ctx.lineWidth = 1 + random() * 1.6;
    const jitter = [];
    for (let x = 0; x <= 256; x += 18) jitter.push((random() - 0.5) * 6);
    jitter[jitter.length - 1] = jitter[0];
    for (const dy of [-512, 0, 512]) {
      const y = y0 + dy;
      if (y < -8 || y > 520) continue;
      ctx.beginPath();
      ctx.moveTo(0, y + jitter[0]);
      let j = 0;
      for (let x = 0; x <= 256; x += 18, j += 1) {
        ctx.lineTo(x, y + jitter[j]);
      }
      ctx.stroke();
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
  // the rock ships its own height field (plate bevels, not just crack grooves)
  textures.rockNormal = createNormalFromCanvas(textures.rock.userData.height || textures.rock, 9.0, 1);
  textures.sandNormal = createNormalFromCanvas(textures.sand, 1.4, 1);
  textures.dirtNormal = createNormalFromCanvas(textures.dirt, 2.6, 1);
  textures.litterNormal = createNormalFromCanvas(textures.litter, 2.4, 1);
  textures.grassNormal = createNormalFromCanvas(textures.grass, 1.2, 2);
  textures.barkNormal = createNormalFromCanvas(textures.bark, 3.0, 1);
  textures.palmBarkNormal = createNormalFromCanvas(textures.palmBark, 3.0, 1);
  return textures;
}
