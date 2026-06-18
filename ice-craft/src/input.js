// Input: pointer lock, keyboard/mouse state, hotbar selection.
import { HOTBAR } from './blocks.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.selected = 0; // hotbar index
    this.locked = false;
    this.sensitivity = 0.0022;

    // callbacks (assigned by main)
    this.onLook = null; // (dx, dy)
    this.onBreak = null;
    this.onPlace = null;
    this.onToggleFly = null;
    this.onSelect = null; // (index)
    this.onLockChange = null; // (locked)

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      // hotbar number keys
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= HOTBAR.length) {
          this.selected = n - 1;
          if (this.onSelect) this.onSelect(this.selected);
        }
      }
      if (e.code === 'KeyF') {
        if (this.onToggleFly) this.onToggleFly();
      }
      this.keys.add(e.code);
      // prevent page scroll on space
      if (e.code === 'Space') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener('click', () => {
      if (!this.locked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
      if (!this.locked) this.keys.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.onLook) this.onLook(e.movementX, e.movementY);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      if (e.button === 0 && this.onBreak) this.onBreak();
      else if (e.button === 2 && this.onPlace) this.onPlace();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selected = (this.selected + dir + HOTBAR.length) % HOTBAR.length;
      if (this.onSelect) this.onSelect(this.selected);
    }, { passive: false });
  }

  selectedBlock() {
    return HOTBAR[this.selected].id;
  }
}
