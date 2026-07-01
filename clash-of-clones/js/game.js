/* =====================================================================
   Clash of Clones — an unofficial fan parody
   Plain canvas + DOM. No build step, no server, no purchases. Ever.
   ===================================================================== */
'use strict';

/* ============================ helpers ============================ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nowS = () => Date.now() / 1000;

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 > 1e5 ? 1 : 0) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), sec = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/* ============================ constants ============================ */
const N = 36;                  // village grid size
const TW2 = 32, TH2 = 16;      // half tile width/height in world px
const SAVE_KEY = 'clash_of_clones_parody_v1';
const BATTLE_TIME = 180;

/* Per-sprite fit tweaks applied after transparent-padding trim.
   k scales sprite width relative to footprint width, dy nudges the anchor. */
const DRAW_TWEAKS = {
  town_hall: { k: 0.98, dy: 0.06 },
  clan_castle: { k: 0.92, dy: 0.04 },
  army_camp: { k: 0.96, dy: 0.02 },
  wall: { k: 1.12, dy: 0.1 },
  builder_hut: { k: 0.8, dy: 0.02 },
  mortar: { k: 0.78, dy: 0.0 },
  cannon: { k: 0.82, dy: 0.0 },
  archer_tower: { k: 0.8, dy: 0.02 },
  wizard_tower: { k: 0.82, dy: 0.02 },
  tree_small: { k: 0.85, dy: 0.06 },
  stone_rare: { k: 0.8, dy: 0.02 },
};

/* ============================ images ============================ */
const IMG = {};
function loadAssets(onProgress) {
  return new Promise((resolve) => {
    let done = 0;
    ASSETS.forEach((name) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        done++;
        onProgress(done / ASSETS.length);
        if (done === ASSETS.length) resolve();
      };
      img.src = `assets/${name}.png`;
      IMG[name] = img;
    });
  });
}

/* Trim transparent padding so sprites fill their footprints consistently.
   Falls back to the raw image if canvas readback is unavailable. */
function trimLoadedImages() {
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });
  for (const name of ASSETS) {
    const img = IMG[name];
    if (!img || !img.naturalWidth) continue;
    try {
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      octx.clearRect(0, 0, off.width, off.height);
      octx.drawImage(img, 0, 0);
      const data = octx.getImageData(0, 0, off.width, off.height).data;
      let minX = off.width, minY = off.height, maxX = -1, maxY = -1;
      for (let y = 0; y < off.height; y++) {
        for (let x = 0; x < off.width; x++) {
          if (data[(y * off.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) continue;
      const w = maxX - minX + 1, h = maxY - minY + 1;
      const cut = document.createElement('canvas');
      cut.width = w; cut.height = h;
      cut.getContext('2d').drawImage(img, minX, minY, w, h, 0, 0, w, h);
      cut.naturalWidth = w; cut.naturalHeight = h;
      IMG[name] = cut;
    } catch (e) { /* keep raw image */ }
  }
}

/* ============================ canvas & camera ============================ */
const canvas = $('game');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;

const cam = { x: 0, y: N * TH2, zoom: 1, min: 0.3, max: 3 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
}
window.addEventListener('resize', resize);
resize();

const gridToWorld = (gx, gy) => ({ x: (gx - gy) * TW2, y: (gx + gy) * TH2 });
const worldToGrid = (wx, wy) => ({ gx: (wx / TW2 + wy / TH2) / 2, gy: (wy / TH2 - wx / TW2) / 2 });
const screenToWorld = (sx, sy) => ({ x: (sx - vw / 2) / cam.zoom + cam.x, y: (sy - vh / 2) / cam.zoom + cam.y });

function applyCamera() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

function clampCam() {
  const margin = 260;
  cam.x = clamp(cam.x, -N * TW2 - margin, N * TW2 + margin);
  cam.y = clamp(cam.y, -margin, N * TH2 * 2 + margin);
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
}

function fitCamera() {
  cam.x = 0;
  cam.y = N * TH2;
  const fit = Math.min(vw / (N * TW2 * 1.35), vh / (N * TH2 * 2.35));
  // On tall/narrow screens fitting the whole diamond leaves it tiny; bias closer.
  cam.zoom = clamp(Math.max(fit, vw < 700 ? 0.62 : fit), cam.min, cam.max);
}

/* ============================ ground prerender ============================ */
let groundCanvas = null, groundOrigin = { x: 0, y: 0 };
function prerenderGround() {
  const B = 7; // decorative border tiles
  const w = (N + B * 2) * TW2 * 2, h = (N + B * 2) * TH2 * 2;
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = w; groundCanvas.height = h;
  const g = groundCanvas.getContext('2d');
  groundOrigin = { x: -(N + B * 2) * TW2, y: -B * TH2 * 2 };

  const diamond = (cx, cy, fill, inset = 0) => {
    g.beginPath();
    g.moveTo(cx, cy - TH2 + inset);
    g.lineTo(cx + TW2 - inset * 2, cy);
    g.lineTo(cx, cy + TH2 - inset);
    g.lineTo(cx - TW2 + inset * 2, cy);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  for (let gx = -B; gx < N + B; gx++) {
    for (let gy = -B; gy < N + B; gy++) {
      const wpos = gridToWorld(gx + 0.5, gy + 0.5);
      const cx = wpos.x - groundOrigin.x, cy = wpos.y - groundOrigin.y;
      const inside = gx >= 0 && gx < N && gy >= 0 && gy < N;
      if (inside) {
        diamond(cx, cy, (gx + gy) % 2 ? '#69b452' : '#63ac4d');
      } else {
        const d = Math.max(-gx, -gy, gx - N + 1, gy - N + 1);
        diamond(cx, cy, d > 2 ? ((gx + gy) % 2 ? '#3d7c36' : '#3a7533') : ((gx + gy) % 2 ? '#4f9440' : '#4a8c3c'));
      }
    }
  }
  // subtle grass tufts
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 420; i++) {
    const gx = rand(0, N), gy = rand(0, N);
    const wpos = gridToWorld(gx, gy);
    g.fillRect(wpos.x - groundOrigin.x, wpos.y - groundOrigin.y, 2.5, 1.5);
  }
  // border flora from fan kit obstacles
  const flora = ['tree_medium', 'tree_small', 'stone_1', 'tree_medium', 'tree_small'];
  for (let i = 0; i < 46; i++) {
    const side = i % 4;
    let gx, gy;
    if (side === 0) { gx = rand(-B + 1.2, -1); gy = rand(-B + 1.2, N + B - 2); }
    else if (side === 1) { gx = rand(N + 0.5, N + B - 2); gy = rand(-B + 1.2, N + B - 2); }
    else if (side === 2) { gy = rand(-B + 1.2, -1); gx = rand(-1, N + 1); }
    else { gy = rand(N + 0.5, N + B - 2); gx = rand(-1, N + 1); }
    const img = IMG[pick(flora)];
    if (!img || !img.naturalWidth) continue;
    const wpos = gridToWorld(gx, gy);
    const w2 = rand(40, 62);
    const h2 = w2 * (img.naturalHeight / img.naturalWidth);
    g.drawImage(img, wpos.x - groundOrigin.x - w2 / 2, wpos.y - groundOrigin.y - h2 + 6, w2, h2);
  }
}

/* ============================ game state ============================ */
let state = null;
let uid = 1;

function defaultState() {
  return {
    v: 1,
    gold: 900, elixir: 900, gems: 120, trophies: 0,
    name: 'Chief Knockoff', village: 'Parody Village',
    buildings: [],
    army: {}, queue: [],
    lastSeen: nowS(),
    muted: false,
    wins: 0, losses: 0,
    tutorialDone: false,
  };
}

function newBuilding(type, gx, gy, level = 1) {
  return {
    id: uid++, type, gx, gy, level,
    workEndsAt: 0, workTotal: 0,      // construction / upgrade timer
    stored: 0, lastCollect: nowS(),   // producers
  };
}

function starterVillage() {
  const s = defaultState();
  const c = N / 2;
  s.buildings.push(newBuilding('town_hall', c - 2, c - 2));
  s.buildings.push(newBuilding('gold_mine', c - 9, c - 3));
  s.buildings.push(newBuilding('elixir_collector', c + 4, c - 8));
  s.buildings.push(newBuilding('cannon', c + 4, c + 3));
  s.buildings.push(newBuilding('barracks', c - 8, c + 4));
  s.buildings.push(newBuilding('army_camp', c + 8, c - 2));
  return s;
}

function save() {
  if (!state) return;
  state.lastSeen = nowS();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.buildings)) return null;
    return s;
  } catch (e) { return null; }
}

/* ---------- derived stats ---------- */
const bDef = (b) => BUILDINGS[b.type];
const levelMul = (base, mul, level) => base * Math.pow(mul || 1, level - 1);
const isConstructing = (b) => b.workEndsAt > nowS();

function thLevel() {
  const th = state.buildings.find((b) => b.type === 'town_hall');
  return th ? th.level : 1;
}
function buildingHp(b) { const d = bDef(b); return Math.round(levelMul(d.hp, d.hpMul || 1.2, b.level)); }
function upgradeCost(b) {
  const d = bDef(b);
  const base = d.upgradeCostBase || d.cost;
  const out = {};
  for (const k in base) out[k] = Math.round(levelMul(base[k], d.costMul, b.level) / 5) * 5;
  return out;
}
function upgradeTime(b) { const d = bDef(b); return Math.round(d.buildTime * Math.pow(1.9, b.level - 1)); }
function prodPerHour(b) { const p = bDef(b).production; return Math.round(levelMul(p.perHour, p.perHourMul, b.level)); }
function prodCap(b) { const p = bDef(b).production; return Math.round(levelMul(p.cap, p.capMul, b.level)); }
function campHousing(b) { const d = bDef(b); return Math.round(levelMul(d.housing, d.housingMul, b.level)); }

function storageCap(res) {
  let cap = 0;
  for (const b of state.buildings) {
    const d = bDef(b);
    if (!d.storage) continue;
    const base = d.storage[res];
    if (base) cap += Math.round(levelMul(base, d.storage.mul || 1.8, b.level));
  }
  return Math.max(cap, 500);
}
function armyCap() {
  return state.buildings
    .filter((b) => b.type === 'army_camp' && !isConstructing(b))
    .reduce((s, b) => s + campHousing(b), 0);
}
function armySize(includeQueue = false) {
  let n = 0;
  for (const t in state.army) n += state.army[t] * TROOPS[t].housing;
  if (includeQueue) for (const q of state.queue) n += TROOPS[q.troop].housing;
  return n;
}
function builderTotal() { return 2 + state.buildings.filter((b) => b.type === 'builder_hut').length; }
function buildersBusy() { return state.buildings.filter((b) => isConstructing(b)).length; }

function countType(type) { return state.buildings.filter((b) => b.type === type).length; }

function canAfford(cost) {
  return (!cost.gold || state.gold >= cost.gold)
    && (!cost.elixir || state.elixir >= cost.elixir)
    && (!cost.gems || state.gems >= cost.gems);
}
function payCost(cost) {
  if (cost.gold) state.gold -= cost.gold;
  if (cost.elixir) state.elixir -= cost.elixir;
  if (cost.gems) state.gems -= cost.gems;
}
function addRes(res, amount) {
  const cap = storageCap(res);
  const before = state[res];
  state[res] = clamp(state[res] + amount, 0, cap);
  return state[res] - before;
}

/* ---------- occupancy ---------- */
function occupancyGrid(exceptId = -1, buildings = state.buildings) {
  const grid = new Array(N * N).fill(null);
  for (const b of buildings) {
    if (b.id === exceptId || b.dead) continue;
    const size = bDef(b).size;
    for (let x = b.gx; x < b.gx + size; x++)
      for (let y = b.gy; y < b.gy + size; y++)
        if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = b;
  }
  return grid;
}
function placementValid(type, gx, gy, exceptId = -1) {
  const size = BUILDINGS[type].size;
  if (gx < 0 || gy < 0 || gx + size > N || gy + size > N) return false;
  const grid = occupancyGrid(exceptId);
  for (let x = gx; x < gx + size; x++)
    for (let y = gy; y < gy + size; y++)
      if (grid[y * N + x]) return false;
  return true;
}
function findFreeSpot(type) {
  const size = BUILDINGS[type].size;
  const c = Math.floor(N / 2 - size / 2);
  for (let r = 0; r < N; r++) {
    for (let gx = Math.max(0, c - r); gx <= Math.min(N - size, c + r); gx++) {
      for (let gy = Math.max(0, c - r); gy <= Math.min(N - size, c + r); gy++) {
        if (Math.max(Math.abs(gx - c), Math.abs(gy - c)) !== r) continue;
        if (placementValid(type, gx, gy)) return { gx, gy };
      }
    }
  }
  return null;
}

/* ============================ economy tick ============================ */
function economyTick() {
  const t = nowS();
  for (const b of state.buildings) {
    const d = bDef(b);
    // finish construction
    if (b.workEndsAt && b.workEndsAt <= t) {
      b.workEndsAt = 0; b.workTotal = 0;
      spawnHomeParticles(b, '#ffe27a');
      Sound.upgrade();
      toast(`${d.name} is now level ${b.level}!`, d.img);
      refreshHUD();
      if (selected && selected.id === b.id) showInfo(b);
    }
    // production
    if (d.production && !isConstructing(b)) {
      const dt = t - b.lastCollect;
      b.stored = clamp(b.stored + (prodPerHour(b) / 3600) * dt, 0, prodCap(b));
      b.lastCollect = t;
    } else if (d.production) {
      b.lastCollect = t;
    }
  }
  // training queue
  while (state.queue.length) {
    const q = state.queue[0];
    if (q.endsAt > t) break;
    if (armySize() + TROOPS[q.troop].housing > armyCap()) break; // camps full, wait
    state.army[q.troop] = (state.army[q.troop] || 0) + 1;
    state.queue.shift();
    if (armyModalOpen()) renderArmyModal();
  }
}

/* offline gains happen implicitly through timestamps */

/* ============================ scenes ============================ */
let scene = 'home'; // 'home' | 'battle'
let selected = null;
let placing = null;  // {type, gx, gy, isNew, building}
let battle = null;

/* ============================ input ============================ */
const pointers = new Map();
let dragState = null; // {mode:'pan'|'place', startX, startY, camX, camY, moved}
let pinchStart = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: cam.zoom };
    dragState = null;
    return;
  }
  const w = screenToWorld(e.clientX, e.clientY);
  if (placing) {
    const g = worldToGrid(w.x, w.y);
    const size = BUILDINGS[placing.type].size;
    const inGhost = g.gx >= placing.gx - 0.7 && g.gx <= placing.gx + size + 0.7 && g.gy >= placing.gy - 0.7 && g.gy <= placing.gy + size + 0.7;
    dragState = inGhost
      ? { mode: 'place', moved: false }
      : { mode: 'pan', startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y, moved: false };
    return;
  }
  dragState = { mode: 'pan', startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && pinchStart) {
    const [p1, p2] = [...pointers.values()];
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    cam.zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), cam.min, cam.max);
    clampCam();
    return;
  }
  if (!dragState) return;

  if (dragState.mode === 'place' && placing) {
    const w = screenToWorld(e.clientX, e.clientY);
    const g = worldToGrid(w.x, w.y);
    const size = BUILDINGS[placing.type].size;
    placing.gx = clamp(Math.round(g.gx - size / 2), 0, N - size);
    placing.gy = clamp(Math.round(g.gy - size / 2), 0, N - size);
    dragState.moved = true;
    return;
  }
  const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
  if (Math.abs(dx) + Math.abs(dy) > 6) dragState.moved = true;
  cam.x = dragState.camX - dx / cam.zoom;
  cam.y = dragState.camY - dy / cam.zoom;
  clampCam();
});

function pointerEnd(e) {
  const wasPinch = pinchStart && pointers.size >= 2;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (wasPinch) { dragState = null; return; }
  if (!dragState) return;
  const tap = !dragState.moved;
  const mode = dragState.mode;
  dragState = null;
  if (!tap || mode === 'place') return;
  const w = screenToWorld(e.clientX, e.clientY);
  if (scene === 'home') homeTap(w);
  else if (scene === 'battle') battleTap(w);
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; dragState = null; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = screenToWorld(e.clientX, e.clientY);
  cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), cam.min, cam.max);
  const after = screenToWorld(e.clientX, e.clientY);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCam();
}, { passive: false });

function homeTap(w) {
  if (placing) return;
  const g = worldToGrid(w.x, w.y);
  const gx = Math.floor(g.gx), gy = Math.floor(g.gy);
  let hit = null;
  if (gx >= 0 && gy >= 0 && gx < N && gy < N) {
    const grid = occupancyGrid();
    hit = grid[gy * N + gx];
  }
  if (hit) {
    Sound.tap();
    selectBuilding(hit);
  } else {
    deselect();
  }
}

/* ============================ selection & info panel ============================ */
function selectBuilding(b) {
  selected = b;
  const d = bDef(b);
  if (d.production && b.stored >= 1 && !isConstructing(b)) collectFrom(b);
  showInfo(b);
}
function deselect() {
  selected = null;
  $('infoPanel').classList.add('hidden');
}

function showInfo(b) {
  const d = bDef(b);
  $('infoPanel').classList.remove('hidden');
  $('infoImg').src = `assets/${d.img}.png`;
  $('infoName').textContent = d.name;
  $('infoLevel').textContent = isConstructing(b)
    ? (b.level === 1 && b.workTotal ? 'Under construction' : `Upgrading to ${b.level}`) + ` — ${fmtTime(b.workEndsAt - nowS())}`
    : `Level ${b.level}`;
  $('infoDesc').textContent = d.desc;

  const stats = [];
  const chip = (icon, label) => `<span class="stat-chip">${icon ? `<img src="assets/${icon}.png"/>` : ''}${label}</span>`;
  stats.push(chip(null, `❤️ ${fmt(buildingHp(b))} HP`));
  if (d.defense) {
    const dps = Math.round(levelMul(d.defense.dps, d.defense.dpsMul, b.level));
    stats.push(chip(null, `⚔️ ${dps} DPS`), chip(null, `🎯 range ${d.defense.range}`), chip(null, d.defense.targets === 'both' ? '☁️ hits air+ground' : '🥾 ground only'));
  }
  if (d.production) {
    stats.push(chip(`res_${d.production.res}`, `${fmt(prodPerHour(b))}/h`), chip(`res_${d.production.res}`, `${fmt(b.stored)} / ${fmt(prodCap(b))} stored`));
  }
  if (d.storage) {
    if (d.storage.gold) stats.push(chip('res_gold', `holds ${fmt(levelMul(d.storage.gold, d.storage.mul || 1.8, b.level))}`));
    if (d.storage.elixir) stats.push(chip('res_elixir', `holds ${fmt(levelMul(d.storage.elixir, d.storage.mul || 1.8, b.level))}`));
  }
  if (d.housing) stats.push(chip(null, `🏕️ houses ${campHousing(b)}`));
  if (b.type === 'barracks') stats.push(chip(null, `⚒️ trains troops`));
  $('infoStats').innerHTML = stats.join('');

  const collectBtn = $('infoCollect');
  if (d.production && b.stored >= 1 && !isConstructing(b)) {
    collectBtn.classList.remove('hidden');
    collectBtn.innerHTML = `Collect ${fmt(b.stored)}`;
  } else collectBtn.classList.add('hidden');

  const up = $('infoUpgrade');
  const fin = $('infoFinish');
  if (isConstructing(b)) {
    up.classList.add('hidden');
    fin.classList.remove('hidden');
    fin.textContent = `Finish now (${gemFinishCost(b)} 💎)`;
  } else if (b.level >= d.maxLevel) {
    up.classList.remove('hidden');
    fin.classList.add('hidden');
    up.disabled = true;
    up.textContent = 'Max level';
  } else {
    up.classList.remove('hidden');
    fin.classList.add('hidden');
    const cost = upgradeCost(b);
    const res = cost.gold ? 'gold' : cost.elixir ? 'elixir' : 'gems';
    up.disabled = false;
    up.innerHTML = `Upgrade — ${fmt(cost[res])} ${res === 'gold' ? '🟡' : res === 'elixir' ? '🟣' : '💎'}`;
  }
  $('infoMove').disabled = false;
}

function gemFinishCost(b) {
  return Math.max(1, Math.ceil((b.workEndsAt - nowS()) / 20));
}

function collectFrom(b) {
  const d = bDef(b);
  const got = addRes(d.production.res, b.stored);
  if (got > 0) {
    b.stored -= got;
    if (d.production.res === 'gold') Sound.coin(); else Sound.elixir();
    spawnFloatText(b, `+${fmt(got)}`, d.production.res === 'gold' ? '#ffd23e' : '#e08cf0');
    refreshHUD();
  } else {
    toast('Storages are full! Spend something.', `res_${d.production.res}`);
    Sound.error();
  }
}

$('infoClose').addEventListener('click', deselect);
$('infoCollect').addEventListener('click', () => { if (selected) { collectFrom(selected); showInfo(selected); } });
$('infoUpgrade').addEventListener('click', () => {
  const b = selected;
  if (!b || isConstructing(b)) return;
  const d = bDef(b);
  if (b.level >= d.maxLevel) return;
  if (b.type !== 'town_hall' && b.level >= thLevel() + 1) {
    toast('Upgrade your Town Hall first!', 'town_hall'); Sound.error(); return;
  }
  if (buildersBusy() >= builderTotal()) { toast('All builders are busy!', 'builder'); Sound.error(); return; }
  const cost = upgradeCost(b);
  if (!canAfford(cost)) { toast('Not enough resources!', cost.gold ? 'res_gold' : 'res_elixir'); Sound.error(); return; }
  payCost(cost);
  b.level++;
  const t = upgradeTime(b);
  b.workEndsAt = nowS() + t;
  b.workTotal = t;
  Sound.build();
  refreshHUD(); showInfo(b); save();
});
$('infoFinish').addEventListener('click', () => {
  const b = selected;
  if (!b || !isConstructing(b)) return;
  const cost = gemFinishCost(b);
  if (state.gems < cost) { toast('Not enough gems! (tap the gem pill, they\'re free)', 'res_gem'); Sound.error(); return; }
  state.gems -= cost;
  b.workEndsAt = nowS() - 0.01;
  refreshHUD(); save();
});
$('infoMove').addEventListener('click', () => {
  if (!selected) return;
  startPlacing(selected.type, false, selected);
});

/* ============================ placement mode ============================ */
const placeBar = document.createElement('div');
placeBar.className = 'place-bar hidden';
placeBar.innerHTML = `<button class="place-ok">✓</button><button class="place-no">✕</button>`;
document.body.appendChild(placeBar);

function startPlacing(type, isNew, building = null) {
  deselect();
  closeModal('shopModal');
  const size = BUILDINGS[type].size;
  let gx, gy;
  if (building) { gx = building.gx; gy = building.gy; }
  else {
    const spot = findFreeSpot(type) || { gx: N / 2 - size / 2, gy: N / 2 - size / 2 };
    gx = spot.gx; gy = spot.gy;
  }
  placing = { type, gx, gy, isNew, building };
  placeBar.classList.remove('hidden');
}

placeBar.querySelector('.place-ok').addEventListener('click', () => {
  if (!placing) return;
  const ok = placementValid(placing.type, placing.gx, placing.gy, placing.building ? placing.building.id : -1);
  if (!ok) { Sound.error(); toast('Can\'t place it there!'); return; }
  if (placing.isNew) {
    const d = BUILDINGS[placing.type];
    if (!canAfford(d.cost)) { Sound.error(); toast('Not enough resources!'); cancelPlacing(); return; }
    payCost(d.cost);
    const b = newBuilding(placing.type, placing.gx, placing.gy);
    if (d.buildTime > 0) {
      b.workEndsAt = nowS() + d.buildTime;
      b.workTotal = d.buildTime;
    }
    state.buildings.push(b);
    Sound.place();
    spawnHomeParticles(b, '#c9f29b');
  } else {
    placing.building.gx = placing.gx;
    placing.building.gy = placing.gy;
    Sound.place();
  }
  placing = null;
  placeBar.classList.add('hidden');
  refreshHUD(); save();
});
placeBar.querySelector('.place-no').addEventListener('click', cancelPlacing);
function cancelPlacing() { placing = null; placeBar.classList.add('hidden'); }

/* ============================ HUD & modals ============================ */
function refreshHUD() {
  $('goldCount').textContent = fmt(state.gold);
  $('elixirCount').textContent = fmt(state.elixir);
  $('gemCount').textContent = fmt(state.gems);
  $('trophyCount').textContent = fmt(state.trophies);
  $('goldBar').style.width = clamp(state.gold / storageCap('gold') * 100, 0, 100) + '%';
  $('elixirBar').style.width = clamp(state.elixir / storageCap('elixir') * 100, 0, 100) + '%';
  $('chiefName').textContent = state.name;
  $('chiefSub').textContent = `${state.village} · TH${thLevel()}`;
  $('builderCount').textContent = `${builderTotal() - buildersBusy()}/${builderTotal()}`;
}

function toast(msg, icon = null) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon ? `<img src="assets/${icon}.png"/>` : ''}<span>${msg}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => closeModal(btn.dataset.close)));

/* ---------- shop ---------- */
function renderShop() {
  const grid = $('shopGrid');
  const th = thLevel();
  grid.innerHTML = '';
  for (const type of SHOP_ORDER) {
    const d = BUILDINGS[type];
    const count = countType(type);
    const max = d.maxCount(th);
    const maxEver = d.maxCount(5);
    const locked = max === 0;
    const full = !locked && count >= max;
    const res = d.cost.gold ? 'gold' : d.cost.elixir ? 'elixir' : 'gem';
    const costAmount = d.cost.gold || d.cost.elixir || d.cost.gems;
    const afford = canAfford(d.cost);

    const el = document.createElement('div');
    el.className = 'shop-item' + (locked || full ? ' locked' : '') + (!afford ? ' cant' : '');
    el.innerHTML = `
      <img src="assets/${d.img}.png" alt="${d.name}"/>
      <div class="si-name">${d.name}</div>
      <div class="si-desc">${d.desc}</div>
      <div class="si-cost"><img src="assets/res_${res}.png"/>${fmt(costAmount)}</div>
      <div class="si-count">${locked ? `needs TH${[1, 2, 3, 4, 5].find((L) => d.maxCount(L) > 0) || '?'}` : full ? `max built (${count}/${max})` : `${count}/${max} built${maxEver > max ? ` · more at higher TH` : ''}`}</div>
    `;
    el.addEventListener('click', () => {
      if (locked) { toast(`Unlocks at a higher Town Hall level`, 'town_hall'); Sound.error(); return; }
      if (full) { toast(`You've built the maximum for your Town Hall`, d.img); Sound.error(); return; }
      if (!afford) { toast('Not enough resources!', `res_${res}`); Sound.error(); return; }
      if (d.buildTime > 0 && buildersBusy() >= builderTotal()) { toast('All builders are busy!', 'builder'); Sound.error(); return; }
      Sound.tap();
      startPlacing(type, true);
    });
    grid.appendChild(el);
  }
}
$('shopBtn').addEventListener('click', () => { Sound.tap(); renderShop(); openModal('shopModal'); });

/* ---------- army ---------- */
const armyModalOpen = () => !$('armyModal').classList.contains('hidden');

function renderArmyModal() {
  $('armyCap').textContent = `${armySize()} / ${armyCap()} housing`;
  const cur = $('armyCurrent');
  cur.innerHTML = '';
  let any = false;
  for (const t of TROOP_ORDER) {
    const n = state.army[t] || 0;
    if (!n) continue;
    any = true;
    const u = document.createElement('div');
    u.className = 'army-unit';
    u.innerHTML = `<img src="assets/${TROOPS[t].icon}.png"/><b>×${n}</b>`;
    u.title = `${TROOPS[t].name} — tap to dismiss one`;
    u.addEventListener('click', () => {
      state.army[t]--;
      if (state.army[t] <= 0) delete state.army[t];
      Sound.tap(); renderArmyModal(); save();
    });
    cur.appendChild(u);
  }
  if (!any) cur.innerHTML = '<span class="army-empty">No troops yet. Train some below — they live in Army Camps.</span>';

  $('queueInfo').textContent = state.queue.length
    ? `· ${state.queue.length} in queue (${fmtTime(state.queue[state.queue.length - 1].endsAt - nowS())})`
    : '';

  const grid = $('trainGrid');
  grid.innerHTML = '';
  const th = thLevel();
  const hasBarracks = state.buildings.some((b) => b.type === 'barracks' && !isConstructing(b));
  for (const t of TROOP_ORDER) {
    const tr = TROOPS[t];
    const locked = th < tr.thRequired || !hasBarracks;
    const el = document.createElement('div');
    el.className = 'train-item' + (locked ? ' locked' : '');
    el.innerHTML = `
      <img src="assets/${tr.icon}.png"/>
      <div class="ti-name">${tr.name}</div>
      <div class="ti-cost"><img src="assets/res_elixir.png"/>${fmt(tr.cost.elixir)}</div>
      <div class="ti-house">🏕️ ${tr.housing} · ⏱️ ${tr.trainTime}s</div>
    `;
    el.title = tr.desc;
    el.addEventListener('click', () => {
      if (!hasBarracks) { toast('Build a Barracks first!', 'barracks'); Sound.error(); return; }
      if (th < tr.thRequired) { toast(`${tr.name} unlocks at TH${tr.thRequired}`, 'town_hall'); Sound.error(); return; }
      if (armySize(true) + tr.housing > armyCap()) { toast('Army camps are full!', 'army_camp'); Sound.error(); return; }
      if (state.elixir < tr.cost.elixir) { toast('Not enough elixir!', 'res_elixir'); Sound.error(); return; }
      state.elixir -= tr.cost.elixir;
      const lastEnd = state.queue.length ? state.queue[state.queue.length - 1].endsAt : nowS();
      state.queue.push({ troop: t, endsAt: Math.max(nowS(), lastEnd) + tr.trainTime });
      Sound.tap(); refreshHUD(); renderArmyModal(); save();
    });
    grid.appendChild(el);
  }
}
$('armyBtn').addEventListener('click', () => { Sound.tap(); renderArmyModal(); openModal('armyModal'); });

/* ---------- gems (parody store) ---------- */
$('gemPill').addEventListener('click', () => { Sound.tap(); openModal('gemModal'); });
document.querySelectorAll('.gem-offer').forEach((btn) =>
  btn.addEventListener('click', () => {
    state.gems += parseInt(btn.dataset.gems, 10);
    Sound.gem();
    toast(`+${btn.dataset.gems} gems. Total spent: $0.00`, 'res_gem');
    refreshHUD(); save();
  }));

/* ---------- chief rename ---------- */
$('chiefCard').addEventListener('click', () => {
  const name = prompt('Name your chief:', state.name);
  if (name && name.trim()) state.name = name.trim().slice(0, 18);
  const village = prompt('Name your village:', state.village);
  if (village && village.trim()) state.village = village.trim().slice(0, 22);
  refreshHUD(); save();
});

/* ---------- about / reset ---------- */
$('aboutBtn').addEventListener('click', () => openModal('aboutModal'));
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Delete your village and start over?')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});
$('muteBtn').addEventListener('click', () => {
  const m = Sound.toggleMute();
  state.muted = m;
  $('muteBtn').textContent = m ? '🔇' : '🔊';
  save();
});

/* ============================ home particles & floaties ============================ */
let particles = [];
let floaties = [];

function spawnHomeParticles(b, color) {
  const size = bDef(b).size;
  const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: c.x + rand(-size * TW2 * 0.4, size * TW2 * 0.4),
      y: c.y + rand(-size * TH2 * 0.4, size * TH2 * 0.4),
      vx: rand(-40, 40), vy: rand(-120, -40),
      life: rand(0.5, 1), t: 0, color, size: rand(3, 6),
    });
  }
}
function spawnFloatText(b, txt, color) {
  const size = bDef(b).size;
  const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
  floaties.push({ x: c.x, y: c.y - size * TH2 - 20, txt, color, t: 0, life: 1.2 });
}
function stepParticles(dt) {
  particles = particles.filter((p) => (p.t += dt) < p.life);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; }
  floaties = floaties.filter((f) => (f.t += dt) < f.life);
  for (const f of floaties) f.y -= 30 * dt;
}
function drawParticlesAndFloaties() {
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = '800 20px Nunito, sans-serif';
  for (const f of floaties) {
    ctx.globalAlpha = clamp(1.4 - f.t / f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ============================ village render ============================ */
function drawDiamond(gx, gy, w, h, fill, stroke = null) {
  const p = gridToWorld(gx, gy);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 0);
  const a = gridToWorld(gx + w, gy);
  const b2 = gridToWorld(gx + w, gy + h);
  const c = gridToWorld(gx, gy + h);
  ctx.lineTo(a.x, a.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawBuildingSprite(b, alpha = 1, isEnemy = false) {
  const d = bDef(b);
  const img = IMG[d.img];
  if (!img || !img.naturalWidth) return;
  const tw = DRAW_TWEAKS[b.type] || {};
  const k = tw.k || 0.9;
  const size = d.size;
  const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
  const w = size * TW2 * 2 * k;
  const h = w * (img.naturalHeight / img.naturalWidth);
  const bottom = c.y + size * TH2 * (0.92 + (tw.dy || 0));
  ctx.globalAlpha = alpha;
  // damage tint in battle
  if (b.hpNow !== undefined && b.hpNow < b.hpMax * 0.5 && !b.dead) {
    ctx.filter = 'brightness(0.75) saturate(0.8)';
  }
  ctx.drawImage(img, c.x - w / 2, bottom - h, w, h);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  // construction indicator
  if (scene === 'home' && isConstructing(b)) {
    const frac = clamp(1 - (b.workEndsAt - nowS()) / b.workTotal, 0, 1);
    const bw = size * TW2 * 1.1, bh2 = 9;
    const bx = c.x - bw / 2, by = c.y - size * TH2 - h * 0.35 - 18;
    ctx.fillStyle = 'rgba(8,14,26,0.8)';
    ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, bh2 + 4, 5); ctx.fill();
    ctx.fillStyle = '#7ede63';
    ctx.beginPath(); ctx.roundRect(bx, by, bw * frac, bh2, 4); ctx.fill();
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔨', c.x, by - 8);
  }
  // collect bubble
  if (scene === 'home' && d.production && !isConstructing(b) && b.stored >= prodCap(b) * 0.12) {
    const icon = IMG[`res_${d.production.res}`];
    const bob = Math.sin(perfNow * 3 + b.id) * 4;
    const iy = c.y - size * TH2 - h * 0.45 - 26 + bob;
    ctx.beginPath();
    ctx.arc(c.x, iy, 17, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.drawImage(icon, c.x - 12, iy - 12, 24, 24);
  }
  // level badge
  if (scene === 'home' && b.level > 1 && !d.deco) {
    const bx = c.x + size * TW2 * 0.52, by = c.y + size * TH2 * 0.1;
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#17233c'; ctx.fill();
    ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffd23e';
    ctx.font = '800 11px Nunito';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.level, bx, by + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawHpBar(x, y, w, frac, color = '#7ede63') {
  ctx.fillStyle = 'rgba(8,14,26,0.75)';
  ctx.beginPath(); ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, 7, 3); ctx.fill();
  ctx.fillStyle = frac > 0.5 ? color : frac > 0.25 ? '#ffd23e' : '#ff6b6b';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w * clamp(frac, 0, 1), 5, 2.5); ctx.fill();
}

function renderHome() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b5c33';
  ctx.fillRect(0, 0, vw, vh);
  applyCamera();

  if (groundCanvas) ctx.drawImage(groundCanvas, groundOrigin.x, groundOrigin.y);

  // selection footprint
  if (selected && !placing) {
    const size = bDef(selected).size;
    drawDiamond(selected.gx, selected.gy, size, size, 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.85)');
  }
  // placement ghost footprint
  if (placing) {
    const size = BUILDINGS[placing.type].size;
    const ok = placementValid(placing.type, placing.gx, placing.gy, placing.building ? placing.building.id : -1);
    drawDiamond(placing.gx, placing.gy, size, size, ok ? 'rgba(120,255,120,0.35)' : 'rgba(255,90,90,0.4)', ok ? '#9dff9d' : '#ff8a8a');
  }

  // painter's order
  const list = state.buildings
    .filter((b) => !(placing && placing.building && placing.building.id === b.id))
    .slice()
    .sort((a, b) => (a.gx + a.gy + bDef(a).size) - (b.gx + b.gy + bDef(b).size));
  for (const b of list) drawBuildingSprite(b);

  if (placing) {
    const ghost = placing.building || { ...newBuilding(placing.type, placing.gx, placing.gy), id: -99 };
    const tmp = { ...ghost, gx: placing.gx, gy: placing.gy, type: placing.type };
    drawBuildingSprite(tmp, 0.75);
  }

  drawParticlesAndFloaties();
  positionPlaceBar();
}

function positionPlaceBar() {
  if (!placing) return;
  const size = BUILDINGS[placing.type].size;
  const c = gridToWorld(placing.gx + size / 2, placing.gy + size);
  const sx = (c.x - cam.x) * cam.zoom + vw / 2;
  const sy = (c.y - cam.y) * cam.zoom + vh / 2;
  placeBar.style.left = `${clamp(sx, 80, vw - 80)}px`;
  placeBar.style.top = `${clamp(sy + 24, 60, vh - 60)}px`;
}

/* ============================ BATTLE ============================ */

function generateEnemyVillage() {
  const th = thLevel();
  const buildings = [];
  let eid = 1;
  const mk = (type, gx, gy, level) => {
    const d = BUILDINGS[type];
    const hp = Math.round(levelMul(d.hp, d.hpMul || 1.2, level));
    const b = {
      id: eid++, type, gx, gy, level,
      hpMax: hp, hpNow: hp, dead: false,
      stored: 0, lootGold: 0, lootElixir: 0,
      cooldown: rand(0, 0.5),
    };
    buildings.push(b);
    return b;
  };

  const c = N / 2;
  const lvl = clamp(th + randi(-1, 1), 1, 6);

  // Town hall + wall ring
  mk('town_hall', c - 2, c - 2, clamp(lvl, 1, 5));
  const r = 7;
  for (let x = c - r; x <= c + r; x++) {
    for (let y = c - r; y <= c + r; y++) {
      const onRing = (x === c - r || x === c + r || y === c - r || y === c + r);
      if (onRing) mk('wall', x, y, clamp(lvl, 1, 5));
    }
  }

  // defenses inside ring
  const innerSpots = [
    [c - 5, c - 5], [c + 2, c - 5], [c - 5, c + 2], [c + 2, c + 2],
    [c - 5, c - 1], [c + 2, c - 1], [c - 1, c - 5], [c - 1, c + 2],
  ].sort(() => Math.random() - 0.5);
  const defensePlan = [];
  defensePlan.push('cannon', 'cannon', 'archer_tower');
  if (lvl >= 2) defensePlan.push('mortar', 'archer_tower');
  if (lvl >= 3) defensePlan.push('wizard_tower', 'cannon');
  if (lvl >= 4) defensePlan.push('wizard_tower', 'archer_tower');
  defensePlan.slice(0, innerSpots.length).forEach((t, i) => {
    const [gx, gy] = innerSpots[i];
    mk(t, gx, gy, clamp(lvl + (t === 'cannon' ? 1 : 0), 1, 6));
  });

  // outer buildings
  const occupied = () => occupancyGrid(-1, buildings);
  const placeOuter = (type, level) => {
    for (let tries = 0; tries < 220; tries++) {
      const size = BUILDINGS[type].size;
      const gx = randi(1, N - size - 1), gy = randi(1, N - size - 1);
      const distC = Math.max(Math.abs(gx + size / 2 - c), Math.abs(gy + size / 2 - c));
      if (distC < r + 2 || distC > r + 5) continue;
      const grid = occupied();
      let free = true;
      for (let x = gx - 1; x < gx + size + 1 && free; x++)
        for (let y = gy - 1; y < gy + size + 1 && free; y++)
          if (x >= 0 && y >= 0 && x < N && y < N && grid[y * N + x]) free = false;
      if (!free) continue;
      return mk(type, gx, gy, level);
    }
    return null;
  };

  const nRes = 2 + lvl;
  for (let i = 0; i < nRes; i++) placeOuter(i % 2 ? 'gold_mine' : 'elixir_collector', clamp(lvl + 1, 1, 8));
  placeOuter('gold_storage', lvl);
  placeOuter('elixir_storage', lvl);
  if (lvl >= 2) { placeOuter('cannon', lvl); placeOuter('archer_tower', lvl); }
  placeOuter('barracks', lvl);
  placeOuter('army_camp', lvl);

  // distribute loot
  const totalGold = Math.round(600 * lvl * rand(1.0, 1.7));
  const totalElixir = Math.round(600 * lvl * rand(1.0, 1.7));
  const goldHolders = buildings.filter((b) => ['gold_storage', 'gold_mine', 'town_hall'].includes(b.type));
  const elixirHolders = buildings.filter((b) => ['elixir_storage', 'elixir_collector', 'town_hall'].includes(b.type));
  goldHolders.forEach((b) => b.lootGold = Math.round(totalGold / goldHolders.length));
  elixirHolders.forEach((b) => b.lootElixir = Math.round(totalElixir / elixirHolders.length));

  return { buildings, level: lvl, name: pick(ENEMY_VILLAGE_NAMES) };
}

function startMatchmaking() {
  if (armySize() === 0) {
    toast('Train an army first! Tap the army button.', 'icon_barbarian');
    Sound.error();
    return;
  }
  deselect(); cancelPlacing();
  $('matchScreen').classList.remove('hidden');
  $('matchText').textContent = 'Scouting for villages…';
  $('matchSub').textContent = pick([
    'Goblins are drawing the map with crayons',
    'Checking which villages left their doors open',
    'Matchmaking fee: $0.00 (parody perk)',
    'Asking a pigeon for directions',
  ]);
  Sound.tap();
  setTimeout(() => {
    $('matchScreen').classList.add('hidden');
    beginBattle();
  }, 1400);
}

function beginBattle() {
  const enemy = generateEnemyVillage();
  battle = {
    enemy,
    grid: occupancyGrid(-1, enemy.buildings),
    troops: [],
    projectiles: [],
    time: BATTLE_TIME,
    started: false,           // becomes true on first deploy
    ended: false,
    stars: 0,
    destroyedWeight: 0,
    totalWeight: enemy.buildings.filter((b) => b.type !== 'wall' && !bDef(b).deco).length,
    lootGold: 0, lootElixir: 0,
    army: { ...state.army },  // local copy to deploy from
    selectedTroop: TROOP_ORDER.find((t) => (state.army[t] || 0) > 0),
    endTimer: 0,
  };
  scene = 'battle';
  $('hud').classList.add('hidden');
  $('infoPanel').classList.add('hidden');
  $('aboutBtn').classList.add('hidden');
  $('battleHud').classList.remove('hidden');
  renderDeployBar();
  updateBattleHud();
  fitCamera();
  toast(`Raiding ${enemy.name} (level ${enemy.level})`, 'icon_goblin');
}

function renderDeployBar() {
  const bar = $('deployBar');
  bar.innerHTML = '';
  for (const t of TROOP_ORDER) {
    const n = battle.army[t] || 0;
    if (!n && !(state.army[t] > 0)) continue;
    const slot = document.createElement('div');
    slot.className = 'deploy-slot' + (battle.selectedTroop === t ? ' active' : '') + (n === 0 ? ' empty' : '');
    slot.innerHTML = `<img src="assets/${TROOPS[t].icon}.png"/><b>${n}</b>`;
    slot.addEventListener('click', () => {
      if ((battle.army[t] || 0) === 0) return;
      battle.selectedTroop = t;
      Sound.tap();
      renderDeployBar();
    });
    bar.appendChild(slot);
  }
}

function deployZoneOk(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return false;
  for (let x = Math.floor(gx) - 1; x <= Math.floor(gx) + 1; x++)
    for (let y = Math.floor(gy) - 1; y <= Math.floor(gy) + 1; y++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const b = battle.grid[y * N + x];
      if (b && !b.dead) return false;
    }
  return true;
}

function battleTap(w) {
  if (battle.ended) return;
  const g = worldToGrid(w.x, w.y);
  const t = battle.selectedTroop;
  if (!t || (battle.army[t] || 0) <= 0) { toast('Pick a troop from the bar below'); return; }
  if (!deployZoneOk(g.gx, g.gy)) {
    Sound.error();
    battle.badDeploy = { x: w.x, y: w.y, t: 0.5 };
    return;
  }
  battle.army[t]--;
  state.army[t]--;
  if (state.army[t] <= 0) delete state.army[t];
  const def = TROOPS[t];
  battle.troops.push({
    type: t,
    x: clamp(g.gx + rand(-0.35, 0.35), 0, N - 0.01),
    y: clamp(g.gy + rand(-0.35, 0.35), 0, N - 0.01),
    hpMax: def.hp, hpNow: def.hp,
    target: null, wallTarget: null,
    cooldown: 0, dead: false,
    wob: rand(0, Math.PI * 2),
  });
  battle.started = true;
  if (t === 'hog_rider') Sound.hogYell(); else Sound.deploy();
  if ((battle.army[t] || 0) <= 0) battle.selectedTroop = TROOP_ORDER.find((x) => (battle.army[x] || 0) > 0);
  renderDeployBar();
  save();
}

/* ---------- battle sim ---------- */
function buildingCenter(b) {
  const size = bDef(b).size;
  return { x: b.gx + size / 2, y: b.gy + size / 2 };
}
function distToBuilding(tr, b) {
  const size = bDef(b).size;
  const cx = clamp(tr.x, b.gx, b.gx + size);
  const cy = clamp(tr.y, b.gy, b.gy + size);
  return Math.hypot(tr.x - cx, tr.y - cy);
}

function pickTroopTarget(tr) {
  const def = TROOPS[tr.type];
  const alive = battle.enemy.buildings.filter((b) => !b.dead && b.type !== 'wall');
  if (!alive.length) return null;
  let pool = alive;
  if (def.targets === 'defense') {
    const defs = alive.filter((b) => bDef(b).defense);
    if (defs.length) pool = defs;
  } else if (def.targets === 'resource') {
    const res = alive.filter((b) => bDef(b).production || bDef(b).storage);
    if (res.length) pool = res;
  }
  let best = null, bestD = Infinity;
  for (const b of pool) {
    const d = distToBuilding(tr, b);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function wallInPath(tr, nx, ny) {
  const cx = Math.floor(nx), cy = Math.floor(ny);
  if (cx < 0 || cy < 0 || cx >= N || cy >= N) return null;
  const b = battle.grid[cy * N + cx];
  if (b && !b.dead && b.type === 'wall') return b;
  return null;
}

function damageBuilding(b, dmg, tr) {
  if (b.dead) return;
  b.hpNow -= dmg;
  if (b.hpNow <= 0) {
    b.hpNow = 0;
    b.dead = true;
    Sound.crumble();
    battleExplosion(buildingCenter(b), bDef(b).size);
    // clear from grid
    const size = bDef(b).size;
    for (let x = b.gx; x < b.gx + size; x++)
      for (let y = b.gy; y < b.gy + size; y++)
        if (x >= 0 && y >= 0 && x < N && y < N && battle.grid[y * N + x] === b) battle.grid[y * N + x] = null;
    // loot
    if (b.lootGold) { battle.lootGold += b.lootGold; battleFloat(b, `+${fmt(b.lootGold)}`, '#ffd23e'); }
    if (b.lootElixir) { battle.lootElixir += b.lootElixir; battleFloat(b, `+${fmt(b.lootElixir)}`, '#e08cf0'); }
    if (b.type !== 'wall' && !bDef(b).deco) {
      battle.destroyedWeight++;
      updateStars();
    }
    updateBattleHud();
  }
}

function updateStars() {
  const pct = battle.destroyedWeight / battle.totalWeight;
  let stars = 0;
  if (pct >= 0.5) stars++;
  if (battle.enemy.buildings.find((b) => b.type === 'town_hall').dead) stars++;
  if (pct >= 1) stars++;
  if (stars > battle.stars) { battle.stars = stars; Sound.star(); }
}

function stepBattle(dt) {
  if (battle.ended) return;
  if (battle.started) battle.time -= dt;

  const troops = battle.troops;
  const buildings = battle.enemy.buildings;

  /* troops */
  for (const tr of troops) {
    if (tr.dead) continue;
    const def = TROOPS[tr.type];

    // choose target
    if (tr.wallTarget && tr.wallTarget.dead) tr.wallTarget = null;
    if (!tr.wallTarget && (!tr.target || tr.target.dead)) {
      tr.target = pickTroopTarget(tr);
      if (!tr.target) continue;
    }
    const goal = tr.wallTarget || tr.target;
    if (!goal) continue;

    const d = distToBuilding(tr, goal);
    const range = Math.max(def.range, 0.55);
    if (d <= range) {
      tr.cooldown -= dt;
      if (tr.cooldown <= 0) {
        tr.cooldown = 1;
        // troops smash walls much faster than buildings, or raids stall forever
        const dmg = goal.type === 'wall' ? def.dps * 4 : def.dps;
        if (def.range >= 2) {
          // ranged troop: projectile
          const tc = buildingCenter(goal);
          battle.projectiles.push({
            x: tr.x, y: tr.y, tx: tc.x, ty: tc.y, speed: 9,
            dmg, splash: def.splash || 0, side: 'player', targetB: goal,
            color: tr.type === 'wizard' ? '#63b3ff' : '#d8c9a0',
          });
          Sound.shoot();
        } else {
          damageBuilding(goal, dmg, tr);
        }
      }
    } else {
      // move toward goal
      const size = bDef(goal).size;
      const cx = clamp(tr.x, goal.gx, goal.gx + size);
      const cy = clamp(tr.y, goal.gy, goal.gy + size);
      const dx = cx - tr.x, dy = cy - tr.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = tr.x + (dx / len) * def.speed * dt;
      const ny = tr.y + (dy / len) * def.speed * dt;
      if (!def.flying && !def.jumpsWalls) {
        const wall = wallInPath(tr, tr.x + (dx / len) * 0.55, tr.y + (dy / len) * 0.55);
        if (wall && !tr.wallTarget) { tr.wallTarget = wall; continue; }
      }
      tr.x = nx; tr.y = ny;
    }
  }

  /* defenses */
  for (const b of buildings) {
    if (b.dead) continue;
    const d = bDef(b);
    if (!d.defense) continue;
    b.cooldown -= dt;
    if (b.cooldown > 0) continue;
    const def = d.defense;
    const bc = buildingCenter(b);
    let best = null, bestD = Infinity;
    for (const tr of troops) {
      if (tr.dead) continue;
      const flying = TROOPS[tr.type].flying;
      if (def.targets === 'ground' && flying) continue;
      const dist = Math.hypot(tr.x - bc.x, tr.y - bc.y);
      if (dist > def.range + 0.3) continue;
      if (def.minRange && dist < def.minRange) continue;
      if (dist < bestD) { bestD = dist; best = tr; }
    }
    if (!best) continue;
    b.cooldown = def.cooldown;
    const dps = Math.round(levelMul(def.dps, def.dpsMul, b.level)) * def.cooldown;
    battle.projectiles.push({
      x: bc.x, y: bc.y, targetT: best, speed: b.type === 'mortar' ? 4.5 : 10,
      dmg: dps, splash: def.splash || 0, side: 'enemy',
      arc: b.type === 'mortar', t: 0,
      color: b.type === 'wizard_tower' ? '#c76cff' : b.type === 'archer_tower' ? '#ffe9b0' : '#4a4a4a',
    });
    Sound.shoot();
  }

  /* projectiles */
  battle.projectiles = battle.projectiles.filter((p) => {
    const target = p.side === 'player'
      ? { x: p.tx, y: p.ty }
      : (p.targetT && !p.targetT.dead ? { x: p.targetT.x, y: p.targetT.y } : { x: p.lastX ?? p.x, y: p.lastY ?? p.y });
    p.lastX = target.x; p.lastY = target.y;
    const dx = target.x - p.x, dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step + 0.05) {
      // impact
      if (p.side === 'player') {
        if (p.targetB && !p.targetB.dead) damageBuilding(p.targetB, p.dmg, null);
        if (p.splash) {
          for (const b of battle.enemy.buildings) {
            if (b.dead || b === p.targetB) continue;
            if (distToBuilding({ x: target.x, y: target.y }, b) <= p.splash) damageBuilding(b, p.dmg * 0.5, null);
          }
        }
      } else {
        const hitR = p.splash || 0.4;
        for (const tr of battle.troops) {
          if (tr.dead) continue;
          if (Math.hypot(tr.x - target.x, tr.y - target.y) <= hitR + 0.1) {
            tr.hpNow -= p.dmg;
            if (tr.hpNow <= 0) { tr.dead = true; battleExplosion({ x: tr.x, y: tr.y }, 0.8, '#9c9c9c'); }
          }
        }
        if (p.arc || p.splash) { Sound.boom(); battleExplosion(target, 1.1, '#ff9a3d'); }
      }
      return false;
    }
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
    if (p.arc) p.t += dt;
    return true;
  });

  /* end conditions */
  const anyTroopsLeft = battle.troops.some((t) => !t.dead) || Object.values(battle.army).some((n) => n > 0);
  const allDead = battle.destroyedWeight >= battle.totalWeight;
  if (battle.started && (battle.time <= 0 || allDead || !anyTroopsLeft)) {
    battle.endTimer += dt;
    if (allDead || battle.time <= 0 || battle.endTimer > 1.6) endBattle();
  }
  updateBattleTimer();
}

/* battle fx */
let battleParticles = [];
let battleFloaties = [];
function battleExplosion(cTile, size, color = '#ff9a3d') {
  const w = gridToWorld(cTile.x, cTile.y);
  for (let i = 0; i < 18; i++) {
    battleParticles.push({
      x: w.x + rand(-10, 10), y: w.y + rand(-8, 4),
      vx: rand(-90, 90), vy: rand(-160, -30),
      life: rand(0.4, 0.9), t: 0, color: pick([color, '#ffd23e', '#6b6b6b']),
      size: rand(3, 7) * Math.min(size, 2),
    });
  }
}
function battleFloat(b, txt, color) {
  const c = buildingCenter(b);
  const w = gridToWorld(c.x, c.y);
  battleFloaties.push({ x: w.x, y: w.y - 30, txt, color, t: 0, life: 1.4 });
}

function updateBattleHud() {
  const pct = Math.round(battle.destroyedWeight / battle.totalWeight * 100);
  $('battlePct').textContent = pct + '%';
  $('lootGold').textContent = fmt(battle.lootGold);
  $('lootElixir').textContent = fmt(battle.lootElixir);
  const spans = $('battleStars').querySelectorAll('span');
  spans.forEach((s, i) => {
    s.textContent = i < battle.stars ? '★' : '☆';
    s.classList.toggle('dim', i >= battle.stars);
  });
}
function updateBattleTimer() {
  const t = Math.max(0, Math.ceil(battle.time));
  $('battleTimer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function endBattle() {
  if (battle.ended) return;
  battle.ended = true;
  const stars = battle.stars;
  const pct = Math.round(battle.destroyedWeight / battle.totalWeight * 100);
  const won = stars > 0;
  const dTroph = won ? 6 + stars * 7 + randi(0, 5) : -randi(4, 12);
  state.trophies = Math.max(0, state.trophies + dTroph);
  addRes('gold', battle.lootGold);
  addRes('elixir', battle.lootElixir);
  if (won) { state.wins++; Sound.victory(); } else { state.losses++; Sound.defeat(); }
  save();

  setTimeout(() => {
    $('endTitle').textContent = won ? (stars === 3 ? 'TOTAL WIPEOUT!' : 'Victory!') : 'Defeat…';
    $('endTitle').classList.toggle('lose', !won);
    const spans = $('endStars').querySelectorAll('span');
    spans.forEach((s, i) => s.classList.toggle('dim', i >= stars));
    $('endPct').textContent = `${pct}% destruction`;
    $('endGold').textContent = fmt(battle.lootGold);
    $('endElixir').textContent = fmt(battle.lootElixir);
    $('endTrophies').textContent = (dTroph >= 0 ? '+' : '') + dTroph;
    $('endQuip').textContent = pick(won ? WIN_QUIPS : LOSE_QUIPS);
    openModal('battleEnd');
  }, 900);
}

$('endBattleBtn').addEventListener('click', () => {
  if (!battle || battle.ended) return;
  if (!battle.started) { goHome(); return; }
  endBattle();
});
$('goHomeBtn').addEventListener('click', () => { closeModal('battleEnd'); goHome(); });

function goHome() {
  battle = null;
  battleParticles = [];
  battleFloaties = [];
  scene = 'home';
  $('battleHud').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('aboutBtn').classList.remove('hidden');
  fitCamera();
  refreshHUD();
  save();
}

$('attackBtn').addEventListener('click', startMatchmaking);

/* ---------- battle render ---------- */
function renderBattle() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#274f2e';
  ctx.fillRect(0, 0, vw, vh);
  applyCamera();
  if (groundCanvas) ctx.drawImage(groundCanvas, groundOrigin.x, groundOrigin.y);

  // deploy zone hint (subtle red overlay on blocked cells near buildings) — only pre-battle
  if (!battle.started) {
    ctx.globalAlpha = 0.14;
    for (let gx = 0; gx < N; gx++) {
      for (let gy = 0; gy < N; gy++) {
        if (!deployZoneOk(gx + 0.5, gy + 0.5)) {
          drawDiamond(gx, gy, 1, 1, '#ff4040');
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // rubble where buildings fell
  for (const b of battle.enemy.buildings) {
    if (!b.dead || b.type === 'wall') continue;
    const size = bDef(b).size;
    drawDiamond(b.gx + 0.2, b.gy + 0.2, size - 0.4, size - 0.4, 'rgba(45,38,30,0.5)');
    const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
    ctx.fillStyle = 'rgba(78,66,54,0.9)';
    for (let i = 0; i < size * 2; i++) {
      const px = c.x + Math.sin(b.id * 37 + i * 5.13) * size * TW2 * 0.3;
      const py = c.y + Math.cos(b.id * 91 + i * 3.7) * size * TH2 * 0.3;
      ctx.beginPath();
      ctx.ellipse(px, py, 7 - i % 3 * 2, 4 - i % 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // entities sorted by depth
  const ents = [];
  for (const b of battle.enemy.buildings) if (!b.dead) ents.push({ depth: b.gx + b.gy + bDef(b).size, b });
  for (const tr of battle.troops) if (!tr.dead) ents.push({ depth: tr.x + tr.y + (TROOPS[tr.type].flying ? 100 : 0), tr });
  ents.sort((a, b) => a.depth - b.depth);

  for (const e of ents) {
    if (e.b) {
      drawBuildingSprite(e.b, 1, true);
      if (e.b.hpNow < e.b.hpMax) {
        const c = buildingCenter(e.b);
        const w = gridToWorld(c.x, c.y);
        drawHpBar(w.x, w.y - bDef(e.b).size * TH2 * 2.2, bDef(e.b).size * TW2, e.b.hpNow / e.b.hpMax);
      }
    } else {
      drawTroop(e.tr);
    }
  }

  // projectiles
  for (const p of battle.projectiles) {
    const w = gridToWorld(p.x, p.y);
    let yOff = 0;
    if (p.arc) yOff = -Math.sin(Math.min(1, p.t / 0.9) * Math.PI) * 46;
    ctx.beginPath();
    ctx.arc(w.x, w.y + yOff - 14, p.arc ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  // fx
  battleParticles = battleParticles.filter((p) => (p.t += battleDt) < p.life);
  for (const p of battleParticles) {
    p.x += p.vx * battleDt; p.y += p.vy * battleDt; p.vy += 220 * battleDt;
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  battleFloaties = battleFloaties.filter((f) => (f.t += battleDt) < f.life);
  ctx.textAlign = 'center';
  ctx.font = '800 19px Nunito, sans-serif';
  for (const f of battleFloaties) {
    f.y -= 26 * battleDt;
    ctx.globalAlpha = clamp(1.3 - f.t / f.life, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // bad deploy marker
  if (battle.badDeploy) {
    battle.badDeploy.t -= battleDt;
    if (battle.badDeploy.t <= 0) battle.badDeploy = null;
    else {
      ctx.strokeStyle = `rgba(255,70,70,${battle.badDeploy.t * 2})`;
      ctx.lineWidth = 5;
      const { x, y } = battle.badDeploy;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 14);
      ctx.moveTo(x + 14, y - 14); ctx.lineTo(x - 14, y + 14);
      ctx.stroke();
    }
  }
}

function drawTroop(tr) {
  const def = TROOPS[tr.type];
  const img = IMG[def.img];
  const w = gridToWorld(tr.x, tr.y);
  const flying = def.flying;
  const wob = Math.sin(perfNow * 6 + tr.wob) * (flying ? 5 : 1.5);
  const spriteW = def.scale * TW2 * 2;
  const spriteH = spriteW * (img.naturalHeight / img.naturalWidth);
  // shadow
  ctx.beginPath();
  ctx.ellipse(w.x, w.y + 3, spriteW * 0.28, spriteW * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  const yOff = flying ? -46 : 0;
  ctx.drawImage(img, w.x - spriteW / 2, w.y - spriteH + yOff + wob - 4, spriteW, spriteH);
  if (tr.hpNow < tr.hpMax) {
    drawHpBar(w.x, w.y - spriteH + yOff - 8, spriteW * 0.8, tr.hpNow / tr.hpMax, '#63d1ff');
  }
}

/* ============================ main loop ============================ */
let lastT = performance.now();
let perfNow = 0;
let battleDt = 0;
let saveTimer = 0;

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  perfNow = t / 1000;

  if (state) {
    economyTick();
    stepParticles(dt);
    if (scene === 'home') {
      renderHome();
      // live-refresh info panel timer
      if (selected && isConstructing(selected) && Math.floor(t / 500) !== Math.floor((t - dt * 1000) / 500)) showInfo(selected);
    } else if (scene === 'battle' && battle) {
      battleDt = dt;
      stepBattle(dt);
      if (battle) renderBattle();
    }
    saveTimer += dt;
    if (saveTimer > 6) { saveTimer = 0; save(); refreshHUD(); }
  }
  requestAnimationFrame(loop);
}

/* ============================ boot ============================ */
(async function boot() {
  const hints = LOADER_HINTS.slice();
  let hintIdx = 0;
  const hintTimer = setInterval(() => {
    $('loaderHint').textContent = hints[++hintIdx % hints.length];
  }, 900);

  await loadAssets((f) => { $('loaderFill').style.width = Math.round(f * 100) + '%'; });
  trimLoadedImages();
  clearInterval(hintTimer);

  state = load();
  const isNew = !state;
  if (isNew) state = starterVillage();
  uid = state.buildings.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  if (state.muted) { Sound.toggleMute(); $('muteBtn').textContent = '🔇'; }

  // offline welcome
  const away = nowS() - state.lastSeen;
  prerenderGround();
  fitCamera();
  refreshHUD();

  $('loader').classList.add('fade');
  setTimeout(() => $('loader').remove(), 600);
  $('hud').classList.remove('hidden');

  if (isNew) {
    setTimeout(() => toast('Welcome, Chief! This is a parody — everything is free.', 'res_gem'), 600);
    setTimeout(() => toast('Tap the 🔨 shop to build. Collectors make loot over time.', 'gold_mine'), 3400);
    setTimeout(() => toast('Train troops, then hit ATTACK to raid goblins!', 'icon_barbarian'), 6200);
  } else if (away > 120) {
    setTimeout(() => toast(`Welcome back! Your village kept working while you were gone ${fmtTime(away)}.`, 'builder'), 700);
  }

  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);

  requestAnimationFrame(loop);
})();
