// HUD: hotbar rendering, debug line, overlay control.
import { HOTBAR } from './blocks.js';
import { buildAtlas } from './textures.js';
import { ATLAS_COLS, ATLAS_ROWS } from './blocks.js';
import { blockDef } from './blocks.js';

// Render a small icon for a block id by cropping the atlas tile onto a canvas.
function blockIcon(atlasCanvas, tileIndex, sizePx) {
  const c = document.createElement('canvas');
  c.width = sizePx;
  c.height = sizePx;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const tw = atlasCanvas.width / ATLAS_COLS;
  const th = atlasCanvas.height / ATLAS_ROWS;
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  ctx.drawImage(atlasCanvas, col * tw, row * th, tw, th, 0, 0, sizePx, sizePx);
  return c.toDataURL();
}

export class Hud {
  constructor() {
    this.hotbarEl = document.getElementById('hotbar');
    this.debugEl = document.getElementById('debug');
    this.overlayEl = document.getElementById('overlay');
    this.slots = [];
    this._buildHotbar();
  }

  _buildHotbar() {
    // Build a temporary atlas canvas to crop icons from.
    const tex = buildAtlas();
    const atlasCanvas = tex.image; // CanvasTexture image is the source canvas

    this.hotbarEl.innerHTML = '';
    HOTBAR.forEach((entry, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const def = blockDef(entry.id);
      const tile = def.faces ? def.faces[2] : 0; // top face tile
      const img = document.createElement('img');
      img.src = blockIcon(atlasCanvas, tile, 48);
      img.alt = entry.label;
      slot.appendChild(img);

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      slot.appendChild(num);

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = entry.label;
      slot.appendChild(label);

      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    });
    this.setSelected(0);
  }

  setSelected(index) {
    this.slots.forEach((s, i) => s.classList.toggle('active', i === index));
  }

  setDebug(text) {
    if (this.debugEl) this.debugEl.textContent = text;
  }

  setOverlay(visible) {
    if (this.overlayEl) this.overlayEl.classList.toggle('hidden', !visible);
  }
}
