import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { Tiles } from './blocks.js';

export const TILE_PX = 16;
// Each tile sits in a larger cell with edge-replicated gutters so that MSAA
// sample extrapolation / glancing-angle sampling never bleeds into neighbors.
export const GUTTER_PX = 8;
export const CELL_PX = TILE_PX + GUTTER_PX * 2;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

class TilePainter {
  constructor(ctx, ox, oy, rng) {
    this.ctx = ctx;
    this.ox = ox;
    this.oy = oy;
    this.rng = rng;
  }

  px(x, y, r, g, b, a = 255) {
    this.ctx.fillStyle = `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${a / 255})`;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }

  // Fill the whole tile with a base color, jittered per pixel.
  noisy(r, g, b, jitter, a = 255) {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = (this.rng() - 0.5) * 2 * jitter;
        this.px(x, y, r + d, g + d, b + d, a);
      }
    }
  }

  speckle(count, r, g, b, a = 255) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(this.rng() * TILE_PX);
      const y = Math.floor(this.rng() * TILE_PX);
      this.px(x, y, r, g, b, a);
    }
  }
}

const painters = {
  [Tiles.GRASS_TOP](p) {
    p.noisy(106, 170, 64, 18);
    p.speckle(26, 84, 140, 48);
    p.speckle(12, 128, 192, 84);
  },

  [Tiles.GRASS_SIDE](p) {
    p.noisy(134, 96, 67, 14);
    p.speckle(16, 104, 72, 48);
    for (let x = 0; x < TILE_PX; x++) {
      const depth = 3 + Math.floor(p.rng() * 2.4);
      for (let y = 0; y < depth; y++) {
        const d = (p.rng() - 0.5) * 30;
        p.px(x, y, 102 + d, 166 + d, 62 + d);
      }
    }
  },

  [Tiles.DIRT](p) {
    p.noisy(134, 96, 67, 16);
    p.speckle(20, 104, 72, 48);
    p.speckle(10, 160, 120, 86);
  },

  [Tiles.STONE](p) {
    p.noisy(127, 127, 127, 12);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(p.rng() * 14);
      const y = Math.floor(p.rng() * 14);
      const shade = 104 + p.rng() * 18;
      p.px(x, y, shade, shade, shade);
      p.px(x + 1, y, shade, shade, shade);
      p.px(x, y + 1, shade + 8, shade + 8, shade + 8);
    }
  },

  [Tiles.COBBLESTONE](p) {
    p.noisy(72, 72, 74, 8);
    const stones = [
      [0, 0, 7, 7], [8, 0, 7, 6], [0, 8, 6, 7], [7, 7, 8, 8],
      [12, 5, 4, 4], [4, 12, 5, 4],
    ];
    for (const [sx, sy, w, h] of stones) {
      const base = 110 + p.rng() * 35;
      for (let y = sy + 1; y < Math.min(sy + h, TILE_PX); y++) {
        for (let x = sx + 1; x < Math.min(sx + w, TILE_PX); x++) {
          const d = (p.rng() - 0.5) * 22;
          p.px(x, y, base + d, base + d, base + d + 2);
        }
      }
    }
  },

  [Tiles.PLANKS](p) {
    for (let y = 0; y < TILE_PX; y++) {
      const board = Math.floor(y / 4);
      const seam = y % 4 === 0;
      for (let x = 0; x < TILE_PX; x++) {
        const grain = Math.sin((x + board * 5) * 0.9) * 8;
        const d = (p.rng() - 0.5) * 14 + grain;
        if (seam) p.px(x, y, 122 + d * 0.4, 92 + d * 0.4, 52 + d * 0.4);
        else p.px(x, y, 178 + d, 142 + d, 88 + d);
      }
      if (!seam && p.rng() < 0.3) {
        const x = Math.floor(p.rng() * TILE_PX);
        p.px(x, y, 130, 100, 58);
      }
    }
  },

  [Tiles.LOG_SIDE](p) {
    for (let x = 0; x < TILE_PX; x++) {
      const stripe = Math.sin(x * 1.7) * 12;
      for (let y = 0; y < TILE_PX; y++) {
        const d = (p.rng() - 0.5) * 12 + stripe;
        p.px(x, y, 104 + d, 78 + d, 44 + d);
      }
    }
    p.speckle(10, 70, 50, 26);
  },

  [Tiles.LOG_TOP](p) {
    p.noisy(154, 122, 72, 10);
    const cx = 7.5;
    const cy = 7.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > 7.2) {
          p.px(x, y, 104, 78, 44);
        } else if (Math.floor(dist) % 2 === 0) {
          const d = (p.rng() - 0.5) * 10;
          p.px(x, y, 168 + d, 136 + d, 84 + d);
        }
      }
    }
  },

  [Tiles.LEAVES](p) {
    p.noisy(58, 122, 44, 22);
    p.speckle(26, 36, 86, 28);
    p.speckle(16, 88, 158, 64);
  },

  [Tiles.SAND](p) {
    p.noisy(219, 206, 160, 12);
    p.speckle(18, 196, 180, 128);
    p.speckle(10, 235, 226, 190);
  },

  [Tiles.GLASS](p) {
    p.noisy(220, 240, 250, 4, 28);
    for (let i = 0; i < TILE_PX; i++) {
      p.px(i, 0, 226, 245, 252, 255);
      p.px(i, TILE_PX - 1, 226, 245, 252, 255);
      p.px(0, i, 226, 245, 252, 255);
      p.px(TILE_PX - 1, i, 226, 245, 252, 255);
    }
    for (let i = 3; i < 8; i++) p.px(i, 11 - i, 235, 248, 253, 150);
    for (let i = 6; i < 12; i++) p.px(i, 17 - i, 235, 248, 253, 110);
  },

  [Tiles.WATER](p) {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const wave = Math.sin((x + y * 2.4) * 0.8) * 12;
        const d = (p.rng() - 0.5) * 10 + wave;
        p.px(x, y, 40 + d, 96 + d, 196 + d, 178);
      }
    }
  },

  [Tiles.BEDROCK](p) {
    p.noisy(70, 70, 72, 26);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(p.rng() * 13);
      const y = Math.floor(p.rng() * 13);
      const dark = p.rng() < 0.5;
      const v = dark ? 34 : 112;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (p.rng() < 0.7) p.px(x + dx, y + dy, v, v, v + 2);
        }
      }
    }
  },

  [Tiles.SNOW_TOP](p) {
    p.noisy(240, 246, 250, 7);
    p.speckle(14, 214, 226, 238);
  },

  [Tiles.SNOW_SIDE](p) {
    p.noisy(134, 96, 67, 14);
    for (let x = 0; x < TILE_PX; x++) {
      const depth = 4 + Math.floor(p.rng() * 2.2);
      for (let y = 0; y < depth; y++) {
        const d = (p.rng() - 0.5) * 10;
        p.px(x, y, 240 + d, 246 + d, 250 + d);
      }
    }
  },

  [Tiles.COAL_ORE](p) {
    painters[Tiles.STONE](p);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(p.rng() * 12);
      const y = 1 + Math.floor(p.rng() * 12);
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (p.rng() < 0.85) p.px(x + dx, y + dy, 28, 28, 32);
        }
      }
    }
  },

  [Tiles.IRON_ORE](p) {
    painters[Tiles.STONE](p);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(p.rng() * 12);
      const y = 1 + Math.floor(p.rng() * 12);
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (p.rng() < 0.85) p.px(x + dx, y + dy, 226, 178, 144);
        }
      }
    }
  },
};

export class TextureAtlas {
  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLS * CELL_PX;
    canvas.height = ATLAS_ROWS * CELL_PX;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const t = TILE_PX;
    const g = GUTTER_PX;
    for (const [tileStr, paint] of Object.entries(painters)) {
      const tile = Number(tileStr);
      const col = tile % ATLAS_COLS;
      const row = Math.floor(tile / ATLAS_COLS);
      ctx.clearRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
      const ox = col * CELL_PX + g;
      const oy = row * CELL_PX + g;
      paint(new TilePainter(ctx, ox, oy, mulberry32(1234 + tile * 7919)));

      // Replicate tile edges into the gutters.
      ctx.drawImage(canvas, ox, oy, t, 1, ox, oy - g, t, g);
      ctx.drawImage(canvas, ox, oy + t - 1, t, 1, ox, oy + t, t, g);
      ctx.drawImage(canvas, ox, oy, 1, t, ox - g, oy, g, t);
      ctx.drawImage(canvas, ox + t - 1, oy, 1, t, ox + t, oy, g, t);
      ctx.drawImage(canvas, ox, oy, 1, 1, ox - g, oy - g, g, g);
      ctx.drawImage(canvas, ox + t - 1, oy, 1, 1, ox + t, oy - g, g, g);
      ctx.drawImage(canvas, ox, oy + t - 1, 1, 1, ox - g, oy + t, g, g);
      ctx.drawImage(canvas, ox + t - 1, oy + t - 1, 1, 1, ox + t, oy + t, g, g);
    }

    this.canvas = canvas;
    this.ctx = ctx;

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.texture = texture;
  }

  // Returns [u0, v0, u1, v1] for a tile, slightly inset to avoid bleeding.
  uvRect(tile) {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const w = ATLAS_COLS * CELL_PX;
    const h = ATLAS_ROWS * CELL_PX;
    const inset = 0.5;
    const u0 = (col * CELL_PX + GUTTER_PX + inset) / w;
    const u1 = (col * CELL_PX + GUTTER_PX + TILE_PX - inset) / w;
    // CanvasTexture flips Y, so v=1 is the canvas top.
    const v1 = 1 - (row * CELL_PX + GUTTER_PX + inset) / h;
    const v0 = 1 - (row * CELL_PX + GUTTER_PX + TILE_PX - inset) / h;
    return [u0, v0, u1, v1];
  }

  averageColor(tile) {
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const data = this.ctx.getImageData(
      col * CELL_PX + GUTTER_PX,
      row * CELL_PX + GUTTER_PX,
      TILE_PX,
      TILE_PX
    ).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (n === 0) return [255, 255, 255];
    return [r / n, g / n, b / n];
  }

  // Draws a small isometric cube preview onto a 2d canvas (for hotbar icons).
  drawIsoCube(targetCtx, size, topTile, sideTile) {
    const w = size;
    const h = size;
    const halfW = w / 2;
    const quartH = h / 4;
    const faceH = h * 0.5;
    const t = TILE_PX;

    const tileCanvas = (tile, brightness) => {
      const c = document.createElement('canvas');
      c.width = t;
      c.height = t;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      const col = tile % ATLAS_COLS;
      const row = Math.floor(tile / ATLAS_COLS);
      cc.drawImage(
        this.canvas,
        col * CELL_PX + GUTTER_PX,
        row * CELL_PX + GUTTER_PX,
        t,
        t,
        0,
        0,
        t,
        t
      );
      if (brightness < 1) {
        cc.globalCompositeOperation = 'source-atop';
        cc.fillStyle = `rgba(0,0,0,${1 - brightness})`;
        cc.fillRect(0, 0, t, t);
      }
      return c;
    };

    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;

    // Top face.
    targetCtx.setTransform(halfW / t, quartH / t, -halfW / t, quartH / t, halfW, 0);
    targetCtx.drawImage(tileCanvas(topTile, 1), 0, 0);

    // Left face.
    targetCtx.setTransform(halfW / t, quartH / t, 0, faceH / t, 0, quartH);
    targetCtx.drawImage(tileCanvas(sideTile, 0.72), 0, 0);

    // Right face.
    targetCtx.setTransform(halfW / t, -quartH / t, 0, faceH / t, halfW, quartH * 2);
    targetCtx.drawImage(tileCanvas(sideTile, 0.55), 0, 0);

    targetCtx.restore();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
