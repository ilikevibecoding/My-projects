// Procedural canvas textures — every texture in the game is generated here.
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function grain(ctx, w, h, alpha, count) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Worn navy wallpaper with a faint star/rocket pattern (a kid's room gone wrong).
export function wallpaperTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#1d2333';
  ctx.fillRect(0, 0, 512, 512);
  // vertical stripe shading
  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = (x / 64) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, 0, 64, 512);
  }
  // faded stars
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 3 + Math.random() * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = `rgba(140, 150, 130, ${0.10 + Math.random() * 0.10})`;
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const a = (p * 4 * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // moisture stains
  for (let i = 0; i < 9; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * 512, Math.random() * 512, 4,
      Math.random() * 512, Math.random() * 512, 60 + Math.random() * 110);
    g.addColorStop(0, 'rgba(8, 9, 6, 0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  grain(ctx, 512, 512, 0.05, 2600);
  return toTexture(c, 3, 1.6);
}

// Dark old floorboards.
export function floorTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#241a12';
  ctx.fillRect(0, 0, 512, 512);
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    const offset = (y / plankH) % 2 ? 128 : 0;
    for (let x = -128; x < 512; x += 256) {
      const shade = 0.85 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${Math.floor(48 * shade)}, ${Math.floor(34 * shade)}, ${Math.floor(22 * shade)})`;
      ctx.fillRect(x + offset, y, 254, plankH - 2);
      // wood streaks
      for (let s = 0; s < 9; s++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.10})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sy = y + Math.random() * plankH;
        ctx.moveTo(x + offset, sy);
        ctx.bezierCurveTo(x + offset + 80, sy + (Math.random() - 0.5) * 7,
          x + offset + 170, sy + (Math.random() - 0.5) * 7, x + offset + 254, sy);
        ctx.stroke();
      }
    }
  }
  grain(ctx, 512, 512, 0.06, 2200);
  return toTexture(c, 3, 3);
}

// Round braided rug.
export function rugTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  const rings = ['#43303c', '#332738', '#56383a', '#2c2330', '#473240'];
  for (let r = 124; r > 6; r -= 9) {
    ctx.fillStyle = rings[Math.floor(r / 9) % rings.length];
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, 256, 256, 0.07, 700);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Hallway carpet.
export function hallFloorTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2e2436';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 280; i++) {
    ctx.fillStyle = `rgba(${48 + Math.random() * 30}, ${36 + Math.random() * 22}, ${56 + Math.random() * 28}, 0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 6, 3 + Math.random() * 6);
  }
  grain(ctx, 256, 256, 0.05, 900);
  return toTexture(c, 2, 8);
}

// A child's crayon drawing — original art, intentionally crude.
export function crayonDrawingTexture(variant) {
  const [c, ctx] = makeCanvas(256, 320);
  ctx.fillStyle = '#cfc7ae';
  ctx.fillRect(0, 0, 256, 320);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const wob = (x, y, r) => {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.4) {
      const rr = r + Math.sin(a * 5 + variant) * r * 0.07;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  if (variant === 0) {
    // family stick figures + one tall dark extra figure
    ctx.strokeStyle = '#7d3030';
    wob(70, 90, 24);
    ctx.beginPath(); ctx.moveTo(70, 114); ctx.lineTo(70, 200); ctx.moveTo(40, 150); ctx.lineTo(100, 150);
    ctx.moveTo(70, 200); ctx.lineTo(46, 256); ctx.moveTo(70, 200); ctx.lineTo(94, 256); ctx.stroke();
    ctx.strokeStyle = '#37536b';
    wob(150, 110, 18);
    ctx.beginPath(); ctx.moveTo(150, 128); ctx.lineTo(150, 196); ctx.moveTo(128, 152); ctx.lineTo(172, 152);
    ctx.moveTo(150, 196); ctx.lineTo(132, 244); ctx.moveTo(150, 196); ctx.lineTo(168, 244); ctx.stroke();
    ctx.strokeStyle = '#1c1c20';
    wob(216, 70, 20);
    ctx.beginPath(); ctx.moveTo(216, 90); ctx.lineTo(216, 230); ctx.moveTo(190, 130); ctx.lineTo(242, 130); ctx.stroke();
    ctx.fillStyle = '#1c1c20';
    ctx.fillRect(208, 60, 5, 5); ctx.fillRect(222, 60, 5, 5);
  } else if (variant === 1) {
    // a sun, a house, scratched-out window
    ctx.strokeStyle = '#9a7c2c';
    wob(58, 58, 26);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      ctx.beginPath();
      ctx.moveTo(58 + Math.cos(a) * 32, 58 + Math.sin(a) * 32);
      ctx.lineTo(58 + Math.cos(a) * 48, 58 + Math.sin(a) * 48);
      ctx.stroke();
    }
    ctx.strokeStyle = '#5a4632';
    ctx.strokeRect(90, 150, 120, 110);
    ctx.beginPath(); ctx.moveTo(80, 152); ctx.lineTo(150, 96); ctx.lineTo(220, 152); ctx.stroke();
    ctx.strokeStyle = '#23232a';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.moveTo(118 + Math.random() * 28, 172 + Math.random() * 30);
      ctx.lineTo(118 + Math.random() * 28, 172 + Math.random() * 30);
      ctx.stroke();
    }
  } else {
    // big scribbled eyes in the dark
    ctx.fillStyle = '#23232a';
    ctx.fillRect(18, 18, 220, 284);
    ctx.fillStyle = '#cfc7ae';
    wob(92, 140, 4); wob(168, 140, 4);
    ctx.fillStyle = '#b9b193';
    ctx.beginPath(); ctx.arc(92, 140, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(168, 140, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b9b193';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(80, 210); ctx.quadraticCurveTo(130, 248, 184, 210); ctx.stroke();
  }
  grain(ctx, 256, 320, 0.04, 500);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Striped blanket.
export function blanketTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const cols = ['#3c2f4a', '#2e2740', '#463252'];
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = cols[(y / 32) % cols.length];
    ctx.fillRect(0, y, 256, 32);
  }
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y); ctx.bezierCurveTo(80, y + 8, 170, y - 8, 256, y);
    ctx.stroke();
  }
  grain(ctx, 256, 256, 0.05, 800);
  return toTexture(c, 2, 2);
}

// Burlap-ish hide for monsters.
export function hideTexture(baseR, baseG, baseB) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, 256, 256);
  // weave
  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle = `rgba(0,0,0,${y % 8 ? 0.10 : 0.04})`;
    ctx.fillRect(0, y, 256, 2);
  }
  for (let x = 0; x < 256; x += 4) {
    ctx.fillStyle = `rgba(0,0,0,${x % 8 ? 0.07 : 0.03})`;
    ctx.fillRect(x, 0, 2, 256);
  }
  // tears & stitches
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.strokeStyle = 'rgba(8,6,4,0.55)';
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.strokeStyle = 'rgba(160,150,130,0.4)';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 5; s++) {
      ctx.beginPath();
      ctx.moveTo(x + s * 7, y - 5);
      ctx.lineTo(x + s * 7 + 4, y + 5);
      ctx.stroke();
    }
  }
  grain(ctx, 256, 256, 0.08, 1600);
  return toTexture(c, 1, 1);
}
