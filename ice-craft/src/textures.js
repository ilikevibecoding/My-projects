// Procedural texture atlas generation for IceCraft.
// Builds a single canvas atlas (ATLAS_COLS x ATLAS_ROWS tiles) and returns a
// THREE.CanvasTexture configured for crisp, blocky (NearestFilter) sampling,
// plus opaque + transparent materials that share the atlas.
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, TILE } from './blocks.js';

const TILE_PX = 32; // pixels per tile

// small seeded RNG for texture detail
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fill(ctx, x0, y0, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, TILE_PX, TILE_PX);
}

// Sprinkle per-pixel brightness noise over a tile for texture.
function speckle(ctx, x0, y0, rng, amount, tintR, tintG, tintB) {
  const img = ctx.getImageData(x0, y0, TILE_PX, TILE_PX);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 2 * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n + tintR));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n + tintG));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n + tintB));
  }
  ctx.putImageData(img, x0, y0);
}

function drawCracks(ctx, x0, y0, rng, color, count) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    let x = x0 + Math.floor(rng() * TILE_PX);
    let y = y0 + Math.floor(rng() * TILE_PX);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < steps; s++) {
      x += Math.floor((rng() - 0.5) * 10);
      y += Math.floor((rng() - 0.5) * 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBricks(ctx, x0, y0, base, mortar) {
  fill(ctx, x0, y0, base);
  ctx.strokeStyle = mortar;
  ctx.lineWidth = 2;
  const rows = 4;
  const rh = TILE_PX / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y0 + r * rh;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0 + TILE_PX, yy);
    ctx.stroke();
    const offset = r % 2 === 0 ? 0 : TILE_PX / 2;
    for (let bx = 0; bx <= 1; bx++) {
      const xx = x0 + offset + bx * (TILE_PX / 2);
      if (xx <= x0 + TILE_PX) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + rh);
        ctx.stroke();
      }
    }
  }
  ctx.strokeRect(x0 + 1, y0 + 1, TILE_PX - 2, TILE_PX - 2);
}

function tileXY(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  return [col * TILE_PX, row * TILE_PX];
}

export function buildAtlas() {
  const canvas =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(ATLAS_COLS * TILE_PX, ATLAS_ROWS * TILE_PX);
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const rng = mulberry32(98765);

  // SNOW (top): bright white with faint blue speckle
  let [x, y] = tileXY(TILE.SNOW);
  fill(ctx, x, y, '#f4f9ff');
  speckle(ctx, x, y, rng, 14, 0, 0, 6);

  // SNOW_SIDE: white top band over icy blue
  [x, y] = tileXY(TILE.SNOW_SIDE);
  fill(ctx, x, y, '#bfe0f5');
  speckle(ctx, x, y, rng, 16, 0, 0, 0);
  fill(ctx, x, y, '#f4f9ff'); // overwrite then carve: simpler -> redraw band
  ctx.fillStyle = '#bfe0f5';
  ctx.fillRect(x, y + 10, TILE_PX, TILE_PX - 10);
  speckle(ctx, x, y + 10, rng, 16, 0, 0, 0);

  // PACKED_ICE: solid icy blue with cracks
  [x, y] = tileXY(TILE.PACKED_ICE);
  fill(ctx, x, y, '#9ecbe8');
  speckle(ctx, x, y, rng, 18, 0, 0, 0);
  drawCracks(ctx, x, y, rng, 'rgba(120,170,205,0.7)', 4);

  // BLUE_ICE: deep saturated blue, glossy
  [x, y] = tileXY(TILE.BLUE_ICE);
  fill(ctx, x, y, '#5aa6df');
  speckle(ctx, x, y, rng, 16, 0, 0, 0);
  drawCracks(ctx, x, y, rng, 'rgba(40,110,170,0.7)', 3);

  // ICE (translucent): pale cyan, light cracks
  [x, y] = tileXY(TILE.ICE);
  fill(ctx, x, y, '#cdeafb');
  speckle(ctx, x, y, rng, 10, 0, 0, 0);
  drawCracks(ctx, x, y, rng, 'rgba(150,200,235,0.6)', 3);

  // GLACIER_STONE: cold grey-blue stone
  [x, y] = tileXY(TILE.GLACIER_STONE);
  fill(ctx, x, y, '#8a98a6');
  speckle(ctx, x, y, rng, 24, 0, 0, 4);
  drawCracks(ctx, x, y, rng, 'rgba(70,80,90,0.6)', 5);

  // ICE_BRICK: brick pattern in icy blue
  [x, y] = tileXY(TILE.ICE_BRICK);
  drawBricks(ctx, x, y, '#a9d4ef', 'rgba(90,150,190,0.9)');
  speckle(ctx, x, y, rng, 8, 0, 0, 0);

  // SNOW_BRICK: brick pattern in white
  [x, y] = tileXY(TILE.SNOW_BRICK);
  drawBricks(ctx, x, y, '#eaf3fb', 'rgba(150,180,205,0.9)');
  speckle(ctx, x, y, rng, 6, 0, 0, 0);

  // CRYSTAL: glowing cyan with a bright core
  [x, y] = tileXY(TILE.CRYSTAL);
  fill(ctx, x, y, '#7ff0ff');
  speckle(ctx, x, y, rng, 22, 0, 0, 0);
  ctx.fillStyle = 'rgba(220,255,255,0.85)';
  ctx.fillRect(x + 10, y + 6, 12, 20);

  // FROZEN_DIRT: dark cold brown-grey
  [x, y] = tileXY(TILE.FROZEN_DIRT);
  fill(ctx, x, y, '#5c5147');
  speckle(ctx, x, y, rng, 22, 6, 2, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

export function buildMaterials() {
  const map = buildAtlas();
  const opaque = new THREE.MeshLambertMaterial({
    map,
    vertexColors: true,
  });
  const transparent = new THREE.MeshLambertMaterial({
    map,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: true,
  });
  return { opaque, transparent, map };
}
