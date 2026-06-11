// Procedural canvas texture generation. Everything in the game is drawn here.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

export function tex(canvas, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// Layered value-noise canvas (grayscale, centered around mid gray).
export function noiseCanvas(rand, size, octaves = 5, contrast = 1) {
  const [c, ctx] = cv(size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let o = 0; o < octaves; o++) {
    const res = 4 << o;
    const [oc, octx] = cv(res);
    const img = octx.createImageData(res, res);
    for (let i = 0; i < res * res; i++) {
      const v = (rand() * 255) | 0;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.55 / (o + 1.2) * contrast;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(oc, 0, 0, size, size);
  }
  ctx.globalAlpha = 1;
  return c;
}

// Sobel height -> tangent-space normal map.
export function normalFromHeight(heightCanvas, strength = 2.5) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const sctx = heightCanvas.getContext('2d');
  const src = sctx.getImageData(0, 0, w, h).data;
  const [c, ctx] = cv(w, h);
  const out = ctx.createImageData(w, h);
  const hAt = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 0.5 + 0.5 > 1 ? 255 : ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function scratches(ctx, rand, n, w, h, color, alpha, maxLen = 90) {
  ctx.save();
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.3 + rand() * 0.7);
    ctx.lineWidth = rand() < 0.8 ? 1 : 2;
    const x = rand() * w, y = rand() * h;
    const a = rand() * Math.PI * 2, l = 6 + rand() * maxLen;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.restore();
}

function stains(ctx, rand, n, w, h, color, alpha, maxR = 60) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = 8 + rand() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = alpha * (0.3 + rand() * 0.7);
    g.addColorStop(0, color.replace('A', a.toFixed(3)));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function bolt(ctx, hctx, x, y, r = 4) {
  ctx.fillStyle = 'rgba(40,42,46,0.85)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(150,150,155,0.9)';
  ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, 7); ctx.fill();
  if (hctx) {
    hctx.fillStyle = '#2a2a2a';
    hctx.beginPath(); hctx.arc(x, y, r + 1, 0, 7); hctx.fill();
    hctx.fillStyle = '#b0b0b0';
    hctx.beginPath(); hctx.arc(x, y, r * 0.6, 0, 7); hctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Painted hull panels. Texture covers 4.8m x 2.5m (4 cols x 2 rows of panels).
// ---------------------------------------------------------------------------
export function makeHullMaps(rand, { base = [46, 14, 0.78], accent = '#b85c1e', size = 1024 } = {}) {
  const W = size, H = Math.round(size * (2.5 / 4.8));
  const [c, ctx] = cv(W, H);
  const [hc, hctx] = cv(W, H);
  const [rc, rctx] = cv(W, H);

  hctx.fillStyle = '#7a7a7a'; hctx.fillRect(0, 0, W, H);
  rctx.fillStyle = '#9c9c9c'; rctx.fillRect(0, 0, W, H);

  const cols = 4, rows = 2;
  const pw = W / cols, ph = H / rows;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * pw, y = j * ph;
      const [hh, ss, ll] = base;
      const dl = (rand() - 0.5) * 0.07;
      const isAccent = rand() < 0.10;
      ctx.fillStyle = isAccent ? accent : `hsl(${hh + (rand() - 0.5) * 8}, ${ss}%, ${(ll + dl) * 100}%)`;
      ctx.fillRect(x, y, pw, ph);

      // panel inner inset + bevel
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 10, y + 10, pw - 20, ph - 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 13, y + 13, pw - 26, ph - 26);

      hctx.fillStyle = '#6a6a6a';
      hctx.fillRect(x + 10, y + 10, pw - 20, ph - 20);
      hctx.fillStyle = '#7e7e7e';
      hctx.fillRect(x + 16, y + 16, pw - 32, ph - 32);

      // some panels get a vent or a stripe or a label block
      const det = rand();
      if (det < 0.22) {
        // vent slots
        const vx = x + pw * 0.25, vy = y + ph * (0.3 + rand() * 0.35), vw = pw * 0.5;
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = 'rgba(20,22,25,0.85)';
          ctx.fillRect(vx, vy + k * 9, vw, 4.5);
          hctx.fillStyle = '#404040';
          hctx.fillRect(vx, vy + k * 9, vw, 4.5);
        }
      } else if (det < 0.40) {
        // accent stripe
        ctx.fillStyle = rand() < 0.6 ? accent : '#3d6e6c';
        const sy = y + ph * (0.18 + rand() * 0.5);
        ctx.fillRect(x + 16, sy, pw - 32, 10 + rand() * 8);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#1c1c1c';
        for (let k = 0; k < 14; k++) ctx.fillRect(x + 16 + rand() * (pw - 36), sy + rand() * 14, 3 + rand() * 6, 2);
        ctx.globalAlpha = 1;
      } else if (det < 0.52) {
        // stenciled label block
        ctx.fillStyle = 'rgba(35,38,42,0.78)';
        const lx = x + pw * (0.1 + rand() * 0.4), ly = y + ph * (0.15 + rand() * 0.55);
        for (let k = 0; k < 3 + rand() * 4; k++) {
          ctx.fillRect(lx + k * 11, ly, 7, 12 + rand() * 6);
        }
        if (rand() < 0.5) {
          ctx.fillStyle = accent;
          ctx.fillRect(lx - 4, ly + 22, 30 + rand() * 30, 4);
        }
      }

      // corner bolts
      bolt(ctx, hctx, x + 16, y + 16, 4);
      bolt(ctx, hctx, x + pw - 16, y + 16, 4);
      bolt(ctx, hctx, x + 16, y + ph - 16, 4);
      bolt(ctx, hctx, x + pw - 16, y + ph - 16, 4);

      // roughness: painted = mid, with per-panel variation
      rctx.fillStyle = `rgb(${140 + ((rand() * 40) | 0)},0,0)`;
      const rv = 145 + ((rand() - 0.5) * 50) | 0;
      rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
    }
  }

  // seams between panels
  ctx.strokeStyle = 'rgba(12,13,15,0.9)';
  ctx.lineWidth = 4;
  hctx.strokeStyle = '#1e1e1e';
  hctx.lineWidth = 5;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, H); ctx.stroke();
    hctx.beginPath(); hctx.moveTo(i * pw, 0); hctx.lineTo(i * pw, H); hctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ph); ctx.lineTo(W, j * ph); ctx.stroke();
    hctx.beginPath(); hctx.moveTo(0, j * ph); hctx.lineTo(W, j * ph); hctx.stroke();
  }

  // grime: multiply noise, stronger near seams
  const n = noiseCanvas(rand, 256, 5);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.30;
  ctx.drawImage(n, 0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  stains(ctx, rand, 26, W, H, 'rgba(48,40,30,A)', 0.30, 70);
  stains(ctx, rand, 12, W, H, 'rgba(20,22,26,A)', 0.22, 40);
  scratches(ctx, rand, 70, W, H, 'rgba(190,192,196,0.8)', 0.5, 60);
  scratches(ctx, rand, 40, W, H, 'rgba(30,30,32,0.7)', 0.35, 80);

  // scratches make it shinier; grime rougher
  scratches(rctx, rand, 70, W, H, 'rgba(70,70,70,1)', 0.5, 60);
  rctx.globalCompositeOperation = 'lighten';
  rctx.globalAlpha = 0.35;
  rctx.drawImage(n, 0, 0, W, H);
  rctx.globalCompositeOperation = 'source-over';
  rctx.globalAlpha = 1;

  return {
    map: tex(c),
    roughnessMap: tex(rc, { srgb: false }),
    normalMap: tex(normalFromHeight(hc, 2.0), { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// Worn structural metal, 1m x 1m.
// ---------------------------------------------------------------------------
export function makeMetalMaps(rand, { tone = 96, brushed = true, size = 512 } = {}) {
  const [c, ctx] = cv(size);
  const [rc, rctx] = cv(size);
  const [hc, hctx] = cv(size);
  ctx.fillStyle = `rgb(${tone},${tone + 2},${tone + 6})`;
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#6e6e6e'; rctx.fillRect(0, 0, size, size);

  if (brushed) {
    for (let i = 0; i < 420; i++) {
      const y = rand() * size;
      const a = 0.04 + rand() * 0.10;
      const lum = rand() < 0.5 ? 255 : 0;
      ctx.strokeStyle = `rgba(${lum},${lum},${lum},${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(size, y);
      ctx.stroke();
      rctx.strokeStyle = `rgba(${lum > 0 ? 60 : 140},${lum > 0 ? 60 : 140},${lum > 0 ? 60 : 140},${a * 1.4})`;
      rctx.beginPath(); rctx.moveTo(0, y); rctx.lineTo(size, y); rctx.stroke();
    }
  }

  const n = noiseCanvas(rand, 128, 4);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.32;
  ctx.drawImage(n, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  stains(ctx, rand, 16, size, size, 'rgba(30,26,20,A)', 0.4, 60);
  scratches(ctx, rand, 90, size, size, 'rgba(210,212,218,0.9)', 0.45, 70);
  scratches(ctx, rand, 50, size, size, 'rgba(25,25,28,0.8)', 0.4, 50);
  scratches(rctx, rand, 90, size, size, 'rgba(55,55,55,1)', 0.5, 70);
  rctx.globalCompositeOperation = 'lighten';
  rctx.globalAlpha = 0.45;
  rctx.drawImage(n, 0, 0, size, size);
  rctx.globalCompositeOperation = 'source-over';
  rctx.globalAlpha = 1;
  stains(rctx, rand, 16, size, size, 'rgba(200,200,200,A)', 0.5, 60);

  return {
    map: tex(c),
    roughnessMap: tex(rc, { srgb: false }),
    normalMap: tex(normalFromHeight(noiseCanvas(rand, 256, 5), 0.8), { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// Deck floor: tread plate, 2.4m x 2.4m (2x2 plates of 1.2m).
// ---------------------------------------------------------------------------
export function makeFloorMaps(rand, { size = 1024 } = {}) {
  const [c, ctx] = cv(size);
  const [hc, hctx] = cv(size);
  const [rc, rctx] = cv(size);
  ctx.fillStyle = 'rgb(62,64,69)';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#787878'; rctx.fillRect(0, 0, size, size);

  // tread ovals
  const step = size / 24;
  for (let j = 0; j < 24; j++) {
    for (let i = 0; i < 24; i++) {
      const x = i * step + step / 2 + (j % 2 ? step / 2 : 0);
      const y = j * step + step / 2;
      const ang = (i + j) % 2 ? 0.78 : -0.78;
      ctx.save(); hctx.save();
      ctx.translate(x % size, y); ctx.rotate(ang);
      hctx.translate(x % size, y); hctx.rotate(ang);
      ctx.fillStyle = 'rgba(86,88,94,0.9)';
      ctx.fillRect(-9, -3, 18, 6);
      ctx.fillStyle = 'rgba(30,31,34,0.55)';
      ctx.fillRect(-9, 2, 18, 2);
      hctx.fillStyle = '#b4b4b4';
      hctx.fillRect(-9, -3, 18, 6);
      ctx.restore(); hctx.restore();
    }
  }

  // plate seams every half texture (1.2 m)
  for (const p of [0, size / 2, size]) {
    ctx.strokeStyle = 'rgba(10,11,13,0.95)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    hctx.strokeStyle = '#262626'; hctx.lineWidth = 7;
    hctx.beginPath(); hctx.moveTo(p, 0); hctx.lineTo(p, size); hctx.stroke();
    hctx.beginPath(); hctx.moveTo(0, p); hctx.lineTo(size, p); hctx.stroke();
  }
  for (const p of [0, size / 2, size]) {
    for (const q of [size * 0.08, size * 0.42, size * 0.58, size * 0.92]) {
      bolt(ctx, hctx, Math.min(Math.max(p + (p === 0 ? 14 : p === size ? -14 : 0), 8), size - 8), q, 5);
    }
  }

  // central wear path (lighter, smoother) — runs along V
  const wear = ctx.createLinearGradient(0, 0, size, 0);
  wear.addColorStop(0.0, 'rgba(150,150,154,0)');
  wear.addColorStop(0.5, 'rgba(150,150,154,0.16)');
  wear.addColorStop(1.0, 'rgba(150,150,154,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, size, size);
  const wearR = rctx.createLinearGradient(0, 0, size, 0);
  wearR.addColorStop(0.0, 'rgba(64,64,64,0)');
  wearR.addColorStop(0.5, 'rgba(64,64,64,0.5)');
  wearR.addColorStop(1.0, 'rgba(64,64,64,0)');
  rctx.fillStyle = wearR;
  rctx.fillRect(0, 0, size, size);

  const n = noiseCanvas(rand, 256, 5);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(n, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  stains(ctx, rand, 30, size, size, 'rgba(22,20,16,A)', 0.5, 80);
  scratches(ctx, rand, 130, size, size, 'rgba(180,182,188,0.8)', 0.4, 90);
  scratches(rctx, rand, 130, size, size, 'rgba(60,60,60,1)', 0.5, 90);

  return {
    map: tex(c),
    roughnessMap: tex(rc, { srgb: false }),
    normalMap: tex(normalFromHeight(hc, 2.2), { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// Fabric (mattress / blanket / cushion). 0.5m tile.
// ---------------------------------------------------------------------------
export function makeFabricMaps(rand, { color = '#cfc6b4', size = 256 } = {}) {
  const [c, ctx] = cv(size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  // weave
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + (y % 6 === 0 ? 0.05 : 0)})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let x = 0; x < size; x += 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(x, 0, 1, size);
  }
  const n = noiseCanvas(rand, 64, 3);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.22;
  ctx.drawImage(n, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // quilt seams
  ctx.strokeStyle = 'rgba(0,0,0,0.20)';
  ctx.lineWidth = 2;
  for (const p of [0, size / 2]) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  const [hcq, hq] = cv(size);
  hq.fillStyle = '#888'; hq.fillRect(0, 0, size, size);
  hq.strokeStyle = '#404040'; hq.lineWidth = 3;
  for (const p of [0, size / 2]) {
    hq.beginPath(); hq.moveTo(p, 0); hq.lineTo(p, size); hq.stroke();
    hq.beginPath(); hq.moveTo(0, p); hq.lineTo(size, p); hq.stroke();
  }
  hq.globalAlpha = 0.6; hq.drawImage(noiseCanvas(rand, 128, 4), 0, 0, size, size);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(hcq, 1.2), { srgb: false }),
  };
}

// ---------------------------------------------------------------------------
// Floor grate alpha pattern.
// ---------------------------------------------------------------------------
export function makeGrateMaps(rand, { size = 256 } = {}) {
  const [c, ctx] = cv(size);
  const [ac, actx] = cv(size);
  actx.fillStyle = '#000'; actx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgb(52,54,58)'; ctx.fillRect(0, 0, size, size);
  const bar = size / 8;
  actx.fillStyle = '#fff';
  for (let i = 0; i < 8; i++) {
    actx.fillRect(0, i * bar, size, bar * 0.42);
    actx.fillRect(i * bar, 0, bar * 0.42, size);
  }
  const n = noiseCanvas(rand, 64, 3);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(n, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  scratches(ctx, rand, 40, size, size, 'rgba(190,190,195,0.8)', 0.5, 40);
  return { map: tex(c), alphaMap: tex(ac, { srgb: false }) };
}

// ---------------------------------------------------------------------------
// Hazard stripes (door trims), 1m x 0.25m strip.
// ---------------------------------------------------------------------------
export function makeHazardMap(rand, { size = 512 } = {}) {
  const H = size / 4;
  const [c, ctx] = cv(size, H);
  ctx.fillStyle = '#c46a1f';
  ctx.fillRect(0, 0, size, H);
  ctx.fillStyle = '#16181b';
  for (let x = -H; x < size + H; x += H) {
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + H * 0.6, H); ctx.lineTo(x + H * 0.6 + H, 0); ctx.lineTo(x + H, 0);
    ctx.closePath(); ctx.fill();
  }
  const n = noiseCanvas(rand, 64, 3);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(n, 0, 0, size, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  scratches(ctx, rand, 30, size, H, 'rgba(200,200,205,0.9)', 0.6, 50);
  return tex(c);
}

// ---------------------------------------------------------------------------
// Cockpit / wall screens (emissive UI).
// ---------------------------------------------------------------------------
export function makeScreenMap(rand, kind = 'nav', { w = 512, h = 320 } = {}) {
  const [c, ctx] = cv(w, h);
  ctx.fillStyle = '#04090d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(25,212,208,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  const teal = 'rgba(36,222,214,', orange = 'rgba(255,150,60,';
  if (kind === 'nav') {
    // radar circle + blips
    const cx = w * 0.30, cy = h * 0.52, R = h * 0.34;
    for (let r = R; r > 0; r -= R / 3) {
      ctx.strokeStyle = teal + '0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    const grad = ctx.createConicGradient ? null : null;
    ctx.fillStyle = teal + '0.18)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, -0.5, 0.45); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i === 2 ? orange + '0.95)' : teal + '0.9)';
      const a = rand() * 6.28, r = rand() * R * 0.9;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.5, 0, 7); ctx.fill();
    }
    // text column
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = (i === 3 ? orange : teal) + (0.35 + rand() * 0.55) + ')';
      ctx.fillRect(w * 0.62, 30 + i * 28, 30 + rand() * (w * 0.3), 9);
    }
  } else if (kind === 'eng') {
    // bar graphs
    const n = 8;
    for (let i = 0; i < n; i++) {
      const bh = (0.25 + rand() * 0.65) * (h - 80);
      ctx.fillStyle = i === 5 ? orange + '0.9)' : teal + '0.8)';
      ctx.fillRect(30 + i * ((w - 60) / n), h - 36 - bh, (w - 60) / n - 10, bh);
      ctx.fillStyle = teal + '0.25)';
      ctx.fillRect(30 + i * ((w - 60) / n), 40, (w - 60) / n - 10, h - 76);
    }
  } else if (kind === 'wave') {
    ctx.strokeStyle = teal + '0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 14; x < w - 14; x += 4) {
      const y = h * 0.5 + Math.sin(x * 0.05) * h * 0.18 + (rand() - 0.5) * h * 0.1;
      x === 14 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = orange + '0.7)';
    ctx.beginPath();
    for (let x = 14; x < w - 14; x += 6) {
      const y = h * 0.72 + Math.cos(x * 0.03) * h * 0.08;
      x === 14 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = teal + '0.6)';
      ctx.fillRect(20 + i * (w / 4.4), 18, w / 6, 8);
    }
  } else { // 'text' terminal
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = (rand() < 0.15 ? orange : teal) + (0.3 + rand() * 0.6) + ')';
      let x = 20;
      const words = 2 + (rand() * 5) | 0;
      for (let k = 0; k < words; k++) {
        const ww = 14 + rand() * 70;
        ctx.fillRect(x, 20 + i * ((h - 40) / 12), ww, 8);
        x += ww + 12;
        if (x > w - 40) break;
      }
    }
  }
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.5);
  return tex(c);
}

// ---------------------------------------------------------------------------
// Space: gas giant texture (equirect bands).
// ---------------------------------------------------------------------------
export function makePlanetMap(rand, { hueA = 16, hueB = 36, size = 1024 } = {}) {
  const W = size, H = size / 2;
  const [c, ctx] = cv(W, H);
  // banded base
  let y = 0;
  while (y < H) {
    const bh = H * (0.03 + rand() * 0.10);
    const t = y / H;
    const hue = hueA + (hueB - hueA) * (0.5 + 0.5 * Math.sin(t * 9 + rand() * 2));
    const sat = 30 + rand() * 28;
    const lit = 38 + rand() * 26 - Math.abs(t - 0.5) * 22;
    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.fillRect(0, y, W, bh + 1);
    y += bh;
  }
  // turbulence: horizontal smearing of noise
  const n = noiseCanvas(rand, 256, 5);
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.10;
    ctx.globalCompositeOperation = i % 2 ? 'overlay' : 'multiply';
    ctx.drawImage(n, -i * 37, 0, W * 2.2, H);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // storm ovals
  for (let i = 0; i < 7; i++) {
    const x = rand() * W, yy = H * (0.25 + rand() * 0.5);
    const rw = 18 + rand() * 60, rh = rw * (0.3 + rand() * 0.3);
    const g = ctx.createRadialGradient(x, yy, 0, x, yy, rw);
    g.addColorStop(0, `hsla(${hueB + 10}, 50%, ${55 + rand() * 18}%, 0.55)`);
    g.addColorStop(1, 'hsla(30, 40%, 50%, 0)');
    ctx.save();
    ctx.translate(x, yy); ctx.scale(1, rh / rw); ctx.translate(-x, -yy);
    ctx.fillStyle = g;
    ctx.fillRect(x - rw, yy - rw, rw * 2, rw * 2);
    ctx.restore();
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeRockyMap(rand, { size = 512 } = {}) {
  const W = size, H = size / 2;
  const [c, ctx] = cv(W, H);
  ctx.fillStyle = 'hsl(206, 18%, 38%)';
  ctx.fillRect(0, 0, W, H);
  const n = noiseCanvas(rand, 256, 6);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(n, 0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(n, -W * 0.3, 0, W * 1.8, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // craters
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = rand() * H, r = 2 + rand() * 14;
    ctx.fillStyle = 'rgba(20,24,30,0.35)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(190,200,210,0.25)';
    ctx.beginPath(); ctx.arc(x, y - r * 0.35, r * 0.75, 0, 7); ctx.fill();
  }
  // ice caps
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(225,235,240,0.9)');
  g.addColorStop(0.12, 'rgba(225,235,240,0)');
  g.addColorStop(0.88, 'rgba(225,235,240,0)');
  g.addColorStop(1, 'rgba(225,235,240,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Soft round sprite for stars.
export function makeStarSprite() {
  const [c, ctx] = cv(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false });
}

// Nebula cloud billboard.
export function makeNebulaSprite(rand, colA = [185, 70, 50], colB = [22, 80, 60], size = 512) {
  const [c, ctx] = cv(size);
  const blobs = 60;
  for (let i = 0; i < blobs; i++) {
    const t = i / blobs;
    const ang = rand() * 6.28;
    const dist = Math.pow(rand(), 1.6) * size * 0.32;
    const x = size / 2 + Math.cos(ang) * dist;
    const y = size / 2 + Math.sin(ang) * dist * 0.7;
    const r = size * (0.04 + rand() * 0.14) * (1 - dist / (size * 0.45));
    const [h1, s1, l1] = rand() < 0.5 ? colA : colB;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(r, 2));
    g.addColorStop(0, `hsla(${h1 + (rand() - 0.5) * 24}, ${s1}%, ${l1}%, ${0.05 + rand() * 0.07})`);
    g.addColorStop(1, `hsla(${h1}, ${s1}%, ${l1 * 0.6}%, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // embedded stars
  for (let i = 0; i < 30; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  return tex(c);
}
