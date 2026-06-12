// Canvas-generated procedural textures. No downloaded assets anywhere.
import * as THREE from 'three';
import { mulberry32, SimplexNoise } from './noise.js';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, { repeat = 1, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Tileable noise paint: sample seeded simplex with wrap-around blending.
function paintTileableNoise(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b, a] = fn(x / size, y / size);
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a === undefined ? 255 : a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Tileable simplex via 4-corner blend (sampling noise on a torus approximation)
function tileNoise(noise, u, v, freq) {
  // sample noise in a way that tiles: use sin/cos mapping onto a torus
  const TWO_PI = Math.PI * 2;
  const nx = Math.cos(u * TWO_PI) * freq;
  const ny = Math.sin(u * TWO_PI) * freq;
  const nz = Math.cos(v * TWO_PI) * freq;
  const nw = Math.sin(v * TWO_PI) * freq;
  // combine two 3D samples to fake 4D torus sampling
  return 0.5 * (noise.noise3D(nx, ny, nz) + noise.noise3D(ny, nz + 31.7, nw));
}

function fbmTile(noise, u, v, freq, octaves = 4) {
  let amp = 0.5, sum = 0, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(noise, u, v, f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

const texNoise = new SimplexNoise(987654);
const texNoise2 = new SimplexNoise(192837);

// ---------------------------------------------------------------------------
// Terrain splat textures
// ---------------------------------------------------------------------------
export function makeGrassTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    const base = fbmTile(texNoise, u, v, 6);          // large patches
    const mid = fbmTile(texNoise2, u, v, 18, 3);      // medium clumps
    const fine = tileNoise(texNoise, u + 0.33, v + 0.71, 60); // blade-ish speckle
    let g = 0.42 + base * 0.10 + mid * 0.08 + fine * 0.05;
    let r = g * (0.55 + base * 0.18 + fine * 0.08);
    let b = g * (0.34 + mid * 0.05);
    // occasional dry-yellow patch
    const dry = Math.max(0, fbmTile(texNoise2, u + 0.5, v + 0.2, 4) - 0.25) * 1.8;
    r += dry * 0.16; g += dry * 0.07; b -= dry * 0.02;
    return [r * 255, g * 255, b * 255];
  });
  return canvasTexture(c);
}

export function makeDirtTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    const base = fbmTile(texNoise, u + 0.17, v + 0.43, 8);
    const fine = fbmTile(texNoise2, u, v, 40, 3);
    const pebble = Math.max(0, tileNoise(texNoise, u + 0.6, v + 0.1, 90)) * 0.5;
    let r = 0.42 + base * 0.10 + fine * 0.06 + pebble * 0.10;
    let g = 0.31 + base * 0.08 + fine * 0.05 + pebble * 0.08;
    let b = 0.22 + base * 0.05 + fine * 0.03 + pebble * 0.06;
    return [r * 255, g * 255, b * 255];
  });
  return canvasTexture(c);
}

export function makeRockTexture(size = 512) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    const base = fbmTile(texNoise2, u + 0.8, v + 0.31, 5);
    const strata = Math.sin((v + fbmTile(texNoise, u, v, 7) * 0.15) * Math.PI * 14) * 0.04;
    const fine = fbmTile(texNoise, u + 0.05, v + 0.95, 30, 3);
    const crack = Math.max(0, 0.18 - Math.abs(tileNoise(texNoise2, u, v, 12))) * -1.0;
    let l = 0.58 + base * 0.13 + strata + fine * 0.06 + crack;
    let r = l * 1.02, g = l * 0.99, b = l * 0.96;
    // mossy hint in crevices
    const moss = Math.max(0, -crack) * 0.5;
    g += moss * 0.04; r -= moss * 0.01;
    return [r * 255, g * 255, b * 255];
  });
  return canvasTexture(c);
}

// ---------------------------------------------------------------------------
// Bark, wood rings, tent canvas
// ---------------------------------------------------------------------------
export function makeBarkTexture(size = 256, base = 0.20) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    // vertical ridges
    const ridge = Math.abs(Math.sin((u + fbmTile(texNoise, u, v, 6) * 0.08) * Math.PI * 18));
    const grain = fbmTile(texNoise2, u * 2, v, 24, 3);
    let l = base + ridge * 0.18 + grain * 0.09;
    return [l * 255 * 1.10, l * 255 * 0.80, l * 255 * 0.56];
  });
  return canvasTexture(c, { repeat: 1 });
}

export function makeBirchBarkTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    let l = 0.82 + fbmTile(texNoise, u, v, 10, 3) * 0.07;
    // dark horizontal lenticels
    const band = Math.max(0, 0.5 - Math.abs(tileNoise(texNoise2, u * 3, v * 8, 22))) ;
    const mark = band > 0.42 ? 0.45 : 0;
    l -= mark;
    return [l * 255, l * 255 * 0.97, l * 255 * 0.9];
  });
  return canvasTexture(c);
}

export function makeWoodRingsTexture(size = 128) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const ring = Math.sin(r * 40 + fbmTile(texNoise, u, v, 5) * 3) * 0.5 + 0.5;
    let l = 0.55 + ring * 0.16 - r * 0.12;
    return [l * 255 * 1.12, l * 255 * 0.88, l * 255 * 0.6];
  });
  return canvasTexture(c);
}

export function makeTentCanvasTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  paintTileableNoise(ctx, size, (u, v) => {
    // woven threads
    const weave = (Math.sin(u * Math.PI * 120) + Math.sin(v * Math.PI * 120)) * 0.03;
    const blotch = fbmTile(texNoise, u, v, 5) * 0.07;
    // base: warm burnt orange canvas (Firewatch-y)
    let r = 0.70 + weave + blotch * 1.4;
    let g = 0.36 + weave + blotch;
    let b = 0.20 + weave * 0.5 + blotch * 0.5;
    return [r * 255, g * 255, b * 255];
  });
  return canvasTexture(c);
}

// ---------------------------------------------------------------------------
// Water normal map (tileable), used as two scrolling layers
// ---------------------------------------------------------------------------
export function makeWaterNormalTexture(size = 256) {
  const [c, ctx] = makeCanvas(size);
  // derive normals from a tileable heightfield
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      h[y * size + x] = fbmTile(texNoise2, x / size, y / size, 8, 4);
    }
  }
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const s = 2.2; // bump strength
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (h[y * size + xp] - h[y * size + xm]) * s;
      const dy = (h[yp * size + x] - h[ym * size + x]) * s;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { srgb: false });
}

// ---------------------------------------------------------------------------
// Fire / smoke / ember / spark sprites
// ---------------------------------------------------------------------------
export function makeFlameSprite(size = 128) {
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size * 0.62, 2, size / 2, size * 0.55, size * 0.5);
  g.addColorStop(0, 'rgba(255,250,230,1)');
  g.addColorStop(0.25, 'rgba(255,210,110,0.95)');
  g.addColorStop(0.55, 'rgba(255,130,30,0.55)');
  g.addColorStop(0.85, 'rgba(200,40,10,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { srgb: false });
}

export function makeSmokeSprite(size = 128) {
  const [c, ctx] = makeCanvas(size);
  const rand = mulberry32(4242);
  // puffy cluster of soft circles
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * size * 0.22;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rad = size * (0.10 + rand() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const al = 0.05 + rand() * 0.07;
    g.addColorStop(0, `rgba(255,255,255,${al})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return canvasTexture(c, { srgb: false });
}

export function makeEmberSprite(size = 32) {
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.4, 'rgba(255,160,60,0.8)');
  g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { srgb: false });
}

// Soft round particle for stars
export function makeStarSprite(size = 32) {
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(220,230,255,0.5)');
  g.addColorStop(1, 'rgba(180,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { srgb: false });
}
