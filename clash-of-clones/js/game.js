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
const N = 40;                  // village grid size
const TW2 = 32, TH2 = 16;      // half tile width/height in world px
const SAVE_KEY = 'clash_of_clones_parody_v1';
const BATTLE_TIME = 180;
const OBSTACLE_SPAWN_EVERY = 200;   // seconds
const OBSTACLE_MAX = 34;
const GEM_BOX_EVERY = 900;          // seconds

/* Per-sprite fit tweaks applied after transparent-padding trim. */
const DRAW_TWEAKS = {
  town_hall: { k: 0.98, dy: 0.06 },
  clan_castle: { k: 0.92, dy: 0.04 },
  army_camp: { k: 0.96, dy: 0.02 },
  builder_hut: { k: 0.8, dy: 0.02 },
  mortar: { k: 0.78, dy: 0.0 },
  cannon: { k: 0.82, dy: 0.0 },
  archer_tower: { k: 0.8, dy: 0.02 },
  wizard_tower: { k: 0.82, dy: 0.02 },
  air_defense: { k: 0.78, dy: 0.02 },
  hidden_tesla: { k: 0.82, dy: 0.04 },
  bomb_tower: { k: 0.8, dy: 0.02 },
  xbow: { k: 0.9, dy: 0.0 },
  inferno_tower: { k: 0.72, dy: 0.02 },
  spell_factory: { k: 0.92, dy: 0.02 },
  laboratory: { k: 0.9, dy: 0.02 },
  deco_torch: { k: 0.62, dy: 0.05 },
  deco_flag: { k: 0.6, dy: 0.06 },
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

/* Trim transparent padding so sprites fill their footprints consistently. */
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
  const margin = 300;
  cam.x = clamp(cam.x, -N * TW2 - margin, N * TW2 + margin);
  cam.y = clamp(cam.y, -margin, N * TH2 * 2 + margin);
  cam.zoom = clamp(cam.zoom, cam.min, cam.max);
}

function fitCamera() {
  cam.x = 0;
  cam.y = N * TH2;
  const fit = Math.min(vw / (N * TW2 * 1.3), vh / (N * TH2 * 2.3));
  cam.zoom = clamp(Math.max(fit, vw < 700 ? 0.62 : fit), cam.min, cam.max);
}

/* ============================ ground prerender ============================ */
let groundCanvas = null, groundOrigin = { x: 0, y: 0 };
function prerenderGround() {
  const B = 9; // decorative border tiles
  const w = (N + B * 2) * TW2 * 2, h = (N + B * 2) * TH2 * 2;
  groundCanvas = document.createElement('canvas');
  groundCanvas.width = w; groundCanvas.height = h;
  const g = groundCanvas.getContext('2d');
  groundOrigin = { x: -(N + B * 2) * TW2, y: -B * TH2 * 2 };

  const diamond = (cx, cy, fill, grow = 0) => {
    g.beginPath();
    g.moveTo(cx, cy - TH2 - grow);
    g.lineTo(cx + TW2 + grow * 2, cy);
    g.lineTo(cx, cy + TH2 + grow);
    g.lineTo(cx - TW2 - grow * 2, cy);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };

  // CoC-like palette: saturated light plot, darker meadow, dark forest floor
  for (let gx = -B; gx < N + B; gx++) {
    for (let gy = -B; gy < N + B; gy++) {
      const wpos = gridToWorld(gx + 0.5, gy + 0.5);
      const cx = wpos.x - groundOrigin.x, cy = wpos.y - groundOrigin.y;
      const inside = gx >= 0 && gx < N && gy >= 0 && gy < N;
      const check = (gx + gy) % 2;
      if (inside) {
        diamond(cx, cy, check ? '#8ec44f' : '#88be49', 0.5);
      } else {
        const d = Math.max(-gx, -gy, gx - N + 1, gy - N + 1);
        if (d <= 2) diamond(cx, cy, check ? '#77ad3f' : '#72a73b', 0.5);
        else diamond(cx, cy, check ? '#5d9432' : '#598f2f', 0.5);
      }
    }
  }

  // plot boundary: light worn edge just outside the buildable square
  g.strokeStyle = 'rgba(255,255,240,0.35)';
  g.lineWidth = 3;
  const corners = [[0, 0], [N, 0], [N, N], [0, N]];
  g.beginPath();
  corners.forEach(([gx, gy], i) => {
    const p = gridToWorld(gx, gy);
    if (i === 0) g.moveTo(p.x - groundOrigin.x, p.y - groundOrigin.y);
    else g.lineTo(p.x - groundOrigin.x, p.y - groundOrigin.y);
  });
  g.closePath();
  g.stroke();
  g.strokeStyle = 'rgba(40,80,20,0.25)';
  g.lineWidth = 6;
  g.stroke();

  // grass mottling inside the plot
  for (let i = 0; i < 300; i++) {
    const gx = rand(0.5, N - 0.5), gy = rand(0.5, N - 0.5);
    const p = gridToWorld(gx, gy);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(30,70,10,0.05)';
    g.beginPath();
    g.ellipse(p.x - groundOrigin.x, p.y - groundOrigin.y, rand(8, 26), rand(4, 12), 0, 0, Math.PI * 2);
    g.fill();
  }
  // tiny grass tufts
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 500; i++) {
    const p = gridToWorld(rand(0, N), rand(0, N));
    g.fillRect(p.x - groundOrigin.x, p.y - groundOrigin.y, 2.5, 1.5);
  }

  // forest ring: dense trees + rocks in the outer band, sparser near plot
  const flora = [];
  for (let i = 0; i < 340; i++) {
    const side = i % 4;
    let gx, gy;
    const depth = rand(0, 1) ** 1.6 * (B - 1.6) + 1.4; // biased deep
    if (side === 0) { gx = -depth; gy = rand(-depth, N + depth); }
    else if (side === 1) { gx = N + depth; gy = rand(-depth, N + depth); }
    else if (side === 2) { gy = -depth; gx = rand(-depth, N + depth); }
    else { gy = N + depth; gx = rand(-depth, N + depth); }
    const deep = depth > 3.4;
    const name = deep
      ? pick(['tree_medium', 'tree_medium', 'tree_small', 'tree_medium'])
      : pick(['tree_small', 'bush', 'stone_1', 'mushroom', 'tree_medium', 'stone_rare']);
    flora.push({ name, gx, gy, s: deep ? rand(50, 74) : rand(30, 48) });
  }
  flora.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
  for (const f of flora) {
    const img = IMG[f.name];
    if (!img || !img.naturalWidth) continue;
    const p = gridToWorld(f.gx, f.gy);
    const h2 = f.s * (img.naturalHeight / img.naturalWidth);
    g.drawImage(img, p.x - groundOrigin.x - f.s / 2, p.y - groundOrigin.y - h2 + 6, f.s, h2);
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
    obstacles: [],
    army: {}, queue: [],
    lastSeen: nowS(),
    lastObSpawn: nowS(),
    lastGemBox: nowS() - GEM_BOX_EVERY + 240,
    muted: false, cheat: false,
    wins: 0, losses: 0, obstaclesCleared: 0,
  };
}

function newBuilding(type, gx, gy, level = 1) {
  return {
    id: uid++, type, gx, gy, level,
    workEndsAt: 0, workTotal: 0,
    stored: 0, lastCollect: nowS(),
  };
}
function newObstacle(type, gx, gy) {
  return { id: uid++, type, gx, gy, removeEndsAt: 0, removeTotal: 0 };
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* blocked */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.buildings)) return null;
    // migrate older saves
    if (!Array.isArray(s.obstacles)) s.obstacles = [];
    if (s.lastObSpawn === undefined) s.lastObSpawn = nowS();
    if (s.lastGemBox === undefined) s.lastGemBox = nowS() - GEM_BOX_EVERY + 240;
    if (s.cheat === undefined) s.cheat = false;
    if (s.obstaclesCleared === undefined) s.obstaclesCleared = 0;
    return s;
  } catch (e) { return null; }
}

/* ---------- derived stats ---------- */
const bDef = (b) => BUILDINGS[b.type];
const oDef = (o) => OBSTACLES[o.type];
const levelMul = (base, mul, level) => base * Math.pow(mul || 1, level - 1);
const isConstructing = (b) => b.workEndsAt > nowS();
const isRemoving = (o) => o.removeEndsAt > nowS();
const cheatOn = () => !!(state && state.cheat);

function thLevel() {
  if (cheatOn()) return 5;
  const th = state.buildings.find((b) => b.type === 'town_hall');
  return th ? th.level : 1;
}
function realThLevel() {
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
function maxCountFor(type) {
  const d = BUILDINGS[type];
  return cheatOn() ? (d.cheatMax ?? 99) : d.maxCount(thLevel());
}

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
  const cap = state.buildings
    .filter((b) => b.type === 'army_camp' && !isConstructing(b))
    .reduce((s, b) => s + campHousing(b), 0);
  return cheatOn() ? Math.max(cap, 500) : cap;
}
function armySize(includeQueue = false) {
  let n = 0;
  for (const t in state.army) n += state.army[t] * TROOPS[t].housing;
  if (includeQueue) for (const q of state.queue) n += TROOPS[q.troop].housing;
  return n;
}
function builderTotal() { return cheatOn() ? 99 : 2 + state.buildings.filter((b) => b.type === 'builder_hut').length; }
function buildersBusy() {
  return state.buildings.filter((b) => isConstructing(b)).length
    + state.obstacles.filter((o) => isRemoving(o)).length;
}

function countType(type) { return state.buildings.filter((b) => b.type === type).length; }

function canAfford(cost) {
  if (cheatOn()) return true;
  return (!cost.gold || state.gold >= cost.gold)
    && (!cost.elixir || state.elixir >= cost.elixir)
    && (!cost.gems || state.gems >= cost.gems);
}
function payCost(cost) {
  if (cheatOn()) return;
  if (cost.gold) state.gold -= cost.gold;
  if (cost.elixir) state.elixir -= cost.elixir;
  if (cost.gems) state.gems -= cost.gems;
}
function addRes(res, amount) {
  const cap = cheatOn() ? Infinity : storageCap(res);
  const before = state[res];
  state[res] = clamp(state[res] + amount, 0, cap);
  return state[res] - before;
}

function xpLevel() {
  let total = 0;
  for (const b of state.buildings) total += b.level;
  total += state.wins * 3 + state.obstaclesCleared;
  return Math.max(1, Math.floor(Math.sqrt(total) * 1.15));
}

/* ---------- occupancy (buildings + obstacles) ---------- */
function occupancyGrid(exceptId = -1, buildings = state.buildings, obstacles = state.obstacles) {
  const grid = new Array(N * N).fill(null);
  for (const b of buildings) {
    if (b.id === exceptId || b.dead) continue;
    const size = bDef(b).size;
    for (let x = b.gx; x < b.gx + size; x++)
      for (let y = b.gy; y < b.gy + size; y++)
        if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = b;
  }
  if (obstacles) {
    for (const o of obstacles) {
      const size = oDef(o).size;
      for (let x = o.gx; x < o.gx + size; x++)
        for (let y = o.gy; y < o.gy + size; y++)
          if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = o;
    }
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

/* ---------- obstacles ---------- */
function spawnObstacle(type = null, silent = false) {
  if (state.obstacles.length >= OBSTACLE_MAX) return null;
  type = type || pick(OBSTACLE_SPAWN_POOL);
  const size = OBSTACLES[type].size;
  const grid = occupancyGrid();
  for (let tries = 0; tries < 250; tries++) {
    const gx = randi(0, N - size), gy = randi(0, N - size);
    let free = true;
    for (let x = gx; x < gx + size && free; x++)
      for (let y = gy; y < gy + size && free; y++)
        if (grid[y * N + x]) free = false;
    if (!free) continue;
    const o = newObstacle(type, gx, gy);
    state.obstacles.push(o);
    if (!silent) spawnHomeParticles({ gx, gy, type: null, sizeOverride: size }, '#b6e388');
    return o;
  }
  return null;
}
function seedObstacles(count = 14) {
  for (let i = 0; i < count; i++) spawnObstacle(null, true);
  spawnObstacle('gem_box', true);
}
function obstacleTick() {
  const t = nowS();
  // regular regrowth (also accumulates offline, up to 4 at once)
  let spawns = 0;
  while (t - state.lastObSpawn >= OBSTACLE_SPAWN_EVERY && spawns < 4) {
    state.lastObSpawn += OBSTACLE_SPAWN_EVERY;
    if (spawnObstacle()) spawns++;
    else break;
  }
  if (spawns > 0) state.lastObSpawn = Math.max(state.lastObSpawn, t - OBSTACLE_SPAWN_EVERY * 0.99);
  // gem box
  if (t - state.lastGemBox >= GEM_BOX_EVERY && !state.obstacles.some((o) => o.type === 'gem_box')) {
    if (spawnObstacle('gem_box')) {
      state.lastGemBox = t;
      toast('A Gem Box appeared somewhere in your village!', 'gem_box');
    }
  }
  // finish removals
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const o = state.obstacles[i];
    if (o.removeEndsAt && o.removeEndsAt <= t) {
      const d = oDef(o);
      state.obstacles.splice(i, 1);
      state.obstaclesCleared++;
      // rewards
      let gems = 0;
      if (d.gems) gems = d.gems;
      else if (Math.random() < d.gemChance) gems = randi(1, 6);
      for (const res in d.reward) {
        const [a, b2] = d.reward[res];
        const got = addRes(res, randi(a, b2));
        if (got > 0) spawnFloatText(o, `+${fmt(got)}`, res === 'gold' ? '#ffd23e' : '#e08cf0', oDef(o).size);
      }
      if (gems > 0) {
        state.gems += gems;
        setTimeout(() => Sound.gem(), 220);
        spawnFloatText(o, `+${gems} 💎`, '#8df57f', d.size, -18);
        toast(o.type === 'gem_box' ? `The Gem Box held ${gems} gems!` : `Found ${gems} gems under the ${d.name.toLowerCase()}!`, 'res_gem');
      } else if (Math.random() < 0.4) {
        toast(pick(CHOP_QUIPS), d.img);
      }
      Sound.poof();
      spawnHomeParticles({ gx: o.gx, gy: o.gy, sizeOverride: d.size }, '#cfe8a8');
      if (selected && selected.id === o.id) deselect();
      refreshHUD(); save();
    }
  }
}

/* ============================ economy tick ============================ */
function economyTick() {
  const t = nowS();
  for (const b of state.buildings) {
    const d = bDef(b);
    if (b.workEndsAt && b.workEndsAt <= t) {
      b.workEndsAt = 0; b.workTotal = 0;
      spawnHomeParticles(b, '#ffe27a');
      Sound.upgrade();
      toast(`${d.name} is now level ${b.level}!`, d.img);
      refreshHUD();
      if (selected && selected.id === b.id) showInfo(b);
    }
    if (d.production && !isConstructing(b)) {
      const dt = t - b.lastCollect;
      b.stored = clamp(b.stored + (prodPerHour(b) / 3600) * dt, 0, prodCap(b));
      b.lastCollect = t;
    } else if (d.production) {
      b.lastCollect = t;
    }
  }
  obstacleTick();
  // training queue
  while (state.queue.length) {
    const q = state.queue[0];
    if (q.endsAt > t && !cheatOn()) break;
    if (armySize() + TROOPS[q.troop].housing > armyCap()) break;
    state.army[q.troop] = (state.army[q.troop] || 0) + 1;
    state.queue.shift();
    if (armyModalOpen()) renderArmyModal();
  }
  // cheat: bottomless wallet
  if (cheatOn()) {
    state.gold = CHEAT_RESOURCES;
    state.elixir = CHEAT_RESOURCES;
    if (state.gems < CHEAT_RESOURCES) state.gems = CHEAT_RESOURCES;
  }
}

/* ============================ scenes ============================ */
let scene = 'home'; // 'home' | 'battle'
let selected = null;        // building OR obstacle (obstacle has .removeEndsAt)
let placing = null;         // {type, gx, gy, isNew, building}
let wallMode = null;        // {cells: Set('x,y'), anchor, preview: []}
let battle = null;

const isObstacle = (ent) => ent && OBSTACLES[ent.type] !== undefined;

/* ============================ input ============================ */
const pointers = new Map();
let dragState = null;
let pinchStart = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), zoom: cam.zoom,
      mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2, camX: cam.x, camY: cam.y,
    };
    dragState = null;
    if (wallMode) wallMode.anchor = null;
    return;
  }
  const w = screenToWorld(e.clientX, e.clientY);
  if (wallMode && scene === 'home') {
    const g = worldToGrid(w.x, w.y);
    const gx = Math.floor(g.gx), gy = Math.floor(g.gy);
    if (gx >= 0 && gy >= 0 && gx < N && gy < N) {
      wallMode.anchor = { gx, gy };
      wallMode.preview = wallLineCells(wallMode.anchor, { gx, gy });
      dragState = { mode: 'wall', moved: false };
      return;
    }
    dragState = { mode: 'pan', startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y, moved: false };
    return;
  }
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
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    cam.zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), cam.min, cam.max);
    cam.x = pinchStart.camX - (mx - pinchStart.mx) / cam.zoom;
    cam.y = pinchStart.camY - (my - pinchStart.my) / cam.zoom;
    clampCam();
    return;
  }
  if (!dragState) return;

  if (dragState.mode === 'wall' && wallMode && wallMode.anchor) {
    const w = screenToWorld(e.clientX, e.clientY);
    const g = worldToGrid(w.x, w.y);
    const gx = clamp(Math.floor(g.gx), 0, N - 1), gy = clamp(Math.floor(g.gy), 0, N - 1);
    wallMode.preview = wallLineCells(wallMode.anchor, { gx, gy });
    dragState.moved = true;
    return;
  }
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

  if (mode === 'wall' && wallMode) {
    // commit preview into pending cells (tap toggles a single cell)
    if (tap && wallMode.preview.length === 1) {
      const key = wallMode.preview[0];
      if (wallMode.cells.has(key)) wallMode.cells.delete(key);
      else if (wallCellFree(key)) wallMode.cells.add(key);
    } else {
      for (const key of wallMode.preview) if (wallCellFree(key)) wallMode.cells.add(key);
    }
    wallMode.preview = [];
    wallMode.anchor = null;
    Sound.tap();
    updateWallBar();
    return;
  }
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

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && wallMode && document.activeElement !== $('cheatInput')) { buildPendingWalls(); }
  if (e.key === 'Escape' && wallMode) { exitWallMode(); }
  if (e.key === 'Escape' && placing) { cancelPlacing(); }
});

function homeTap(w) {
  if (placing || wallMode) return;
  const g = worldToGrid(w.x, w.y);
  const gx = Math.floor(g.gx), gy = Math.floor(g.gy);
  let hit = null;
  if (gx >= 0 && gy >= 0 && gx < N && gy < N) {
    const grid = occupancyGrid();
    hit = grid[gy * N + gx];
  }
  if (hit) {
    Sound.tap();
    hit.popT = 0.22;
    selectEntity(hit);
  } else {
    deselect();
  }
}

/* ============================ selection & info panel ============================ */
function selectEntity(ent) {
  selected = ent;
  if (!isObstacle(ent)) {
    const d = bDef(ent);
    if (d.production && ent.stored >= 1 && !isConstructing(ent)) collectFrom(ent);
  }
  showInfo(ent);
}
function deselect() {
  selected = null;
  $('infoPanel').classList.add('hidden');
}

function showInfo(ent) {
  $('infoPanel').classList.remove('hidden');
  const chip = (icon, label) => `<span class="stat-chip">${icon ? `<img src="assets/${icon}.png"/>` : ''}${label}</span>`;

  if (isObstacle(ent)) {
    const d = oDef(ent);
    $('infoImg').src = `assets/${d.img}.png`;
    $('infoName').textContent = d.name;
    $('infoLevel').textContent = isRemoving(ent) ? `Clearing — ${fmtTime(ent.removeEndsAt - nowS())}` : 'Obstacle';
    $('infoDesc').textContent = d.desc;
    const stats = [chip(null, `⏱️ ${d.time}s to clear`)];
    if (d.gems) stats.push(chip('res_gem', `always ${d.gems} gems`));
    else stats.push(chip('res_gem', `${Math.round(d.gemChance * 100)}% gem chance`));
    $('infoStats').innerHTML = stats.join('');
    $('infoMove').classList.add('hidden');
    $('infoCollect').classList.add('hidden');
    $('infoUpgrade').classList.add('hidden');
    const rm = $('infoRemove');
    const fin = $('infoFinish');
    if (isRemoving(ent)) {
      rm.classList.add('hidden');
      fin.classList.remove('hidden');
      fin.textContent = `Finish now (${gemFinishCostObstacle(ent)} 💎)`;
    } else {
      rm.classList.remove('hidden');
      fin.classList.add('hidden');
      const res = d.cost.gold ? 'gold' : 'elixir';
      rm.innerHTML = `Remove — ${fmt(d.cost[res])} ${res === 'gold' ? '🟡' : '🟣'}`;
    }
    return;
  }

  const b = ent;
  const d = bDef(b);
  $('infoImg').src = `assets/${d.img}.png`;
  $('infoName').textContent = d.name;
  $('infoLevel').textContent = isConstructing(b)
    ? (b.level === 1 && b.workTotal ? 'Under construction' : `Upgrading to ${b.level}`) + ` — ${fmtTime(b.workEndsAt - nowS())}`
    : `Level ${b.level}`;
  $('infoDesc').textContent = d.desc;

  const stats = [];
  stats.push(chip(null, `❤️ ${fmt(buildingHp(b))} HP`));
  if (d.defense) {
    const dps = Math.round(levelMul(d.defense.dps, d.defense.dpsMul, b.level));
    const targetLabel = d.defense.targets === 'both' ? '☁️ air + ground'
      : d.defense.targets === 'air' ? '☁️ air only' : '🥾 ground only';
    stats.push(chip(null, `⚔️ ${dps} DPS`), chip(null, `🎯 range ${d.defense.range}`), chip(null, targetLabel));
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

  $('infoRemove').classList.add('hidden');
  $('infoMove').classList.remove('hidden');

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
    up.innerHTML = cheatOn()
      ? `Upgrade — free (cheat)`
      : `Upgrade — ${fmt(cost[res])} ${res === 'gold' ? '🟡' : res === 'elixir' ? '🟣' : '💎'}`;
  }
  $('infoMove').disabled = false;
}

function gemFinishCost(b) { return Math.max(1, Math.ceil((b.workEndsAt - nowS()) / 20)); }
function gemFinishCostObstacle(o) { return Math.max(1, Math.ceil((o.removeEndsAt - nowS()) / 20)); }

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
$('infoCollect').addEventListener('click', () => { if (selected && !isObstacle(selected)) { collectFrom(selected); showInfo(selected); } });
$('infoUpgrade').addEventListener('click', () => {
  const b = selected;
  if (!b || isObstacle(b) || isConstructing(b)) return;
  const d = bDef(b);
  if (b.level >= d.maxLevel) return;
  if (!cheatOn() && b.type !== 'town_hall' && b.level >= realThLevel() + 1) {
    toast('Upgrade your Town Hall first!', 'town_hall'); Sound.error(); return;
  }
  if (buildersBusy() >= builderTotal()) { toast('All builders are busy!', 'builder'); Sound.error(); return; }
  const cost = upgradeCost(b);
  if (!canAfford(cost)) { toast('Not enough resources!', cost.gold ? 'res_gold' : 'res_elixir'); Sound.error(); return; }
  payCost(cost);
  b.level++;
  if (cheatOn()) {
    b.workEndsAt = 0; b.workTotal = 0;
    spawnHomeParticles(b, '#ffe27a');
    Sound.upgrade();
  } else {
    const t = upgradeTime(b);
    b.workEndsAt = nowS() + t;
    b.workTotal = t;
    Sound.build();
  }
  refreshHUD(); showInfo(b); save();
});
$('infoFinish').addEventListener('click', () => {
  const ent = selected;
  if (!ent) return;
  if (isObstacle(ent)) {
    if (!isRemoving(ent)) return;
    const cost = gemFinishCostObstacle(ent);
    if (state.gems < cost) { toast('Not enough gems! (tap the gem bar, they\'re free)', 'res_gem'); Sound.error(); return; }
    state.gems -= cost;
    ent.removeEndsAt = nowS() - 0.01;
    refreshHUD(); save();
    return;
  }
  if (!isConstructing(ent)) return;
  const cost = gemFinishCost(ent);
  if (state.gems < cost) { toast('Not enough gems! (tap the gem bar, they\'re free)', 'res_gem'); Sound.error(); return; }
  state.gems -= cost;
  ent.workEndsAt = nowS() - 0.01;
  refreshHUD(); save();
});
$('infoMove').addEventListener('click', () => {
  if (!selected || isObstacle(selected)) return;
  startPlacing(selected.type, false, selected);
});
$('infoRemove').addEventListener('click', () => {
  const o = selected;
  if (!o || !isObstacle(o) || isRemoving(o)) return;
  const d = oDef(o);
  if (buildersBusy() >= builderTotal()) { toast('All builders are busy!', 'builder'); Sound.error(); return; }
  if (!canAfford(d.cost)) { toast('Not enough resources!', d.cost.gold ? 'res_gold' : 'res_elixir'); Sound.error(); return; }
  payCost(d.cost);
  const time = cheatOn() ? 1.2 : d.time;
  o.removeEndsAt = nowS() + time;
  o.removeTotal = time;
  Sound.chop();
  refreshHUD(); showInfo(o); save();
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
    if (d.buildTime > 0 && !cheatOn()) {
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

/* ============================ WALL DRAG MODE ============================ */
function startWallMode() {
  deselect(); cancelPlacing();
  closeModal('shopModal');
  wallMode = { cells: new Set(), preview: [], anchor: null };
  $('wallBar').classList.remove('hidden');
  updateWallBar();
  toast('Drag on the grass to draw wall lines!', 'wall');
}
function exitWallMode() {
  wallMode = null;
  $('wallBar').classList.add('hidden');
}
function wallCellFree(key) {
  const [x, y] = key.split(',').map(Number);
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  const grid = occupancyGrid();
  return !grid[y * N + x];
}
function wallLineCells(a, b) {
  // straight line along the dominant axis, from anchor to cursor
  const cells = [];
  const dx = b.gx - a.gx, dy = b.gy - a.gy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx >= 0 ? 1 : -1;
    for (let x = a.gx; x !== b.gx + step; x += step) cells.push(`${x},${a.gy}`);
  } else {
    const step = dy >= 0 ? 1 : -1;
    for (let y = a.gy; y !== b.gy + step; y += step) cells.push(`${a.gx},${y}`);
  }
  return cells;
}
function wallUnitCost() { return BUILDINGS.wall.cost.gold; }
function updateWallBar() {
  if (!wallMode) return;
  const n = wallMode.cells.size;
  const existing = countType('wall');
  const maxW = maxCountFor('wall');
  $('wallCount').textContent = `${n} wall${n === 1 ? '' : 's'} (${existing}/${maxW} built)`;
  $('wallCost').innerHTML = cheatOn()
    ? `<img src="assets/res_gold.png"/>free`
    : `<img src="assets/res_gold.png"/>${fmt(n * wallUnitCost())}`;
}
function buildPendingWalls() {
  if (!wallMode || wallMode.cells.size === 0) { exitWallMode(); return; }
  const maxW = maxCountFor('wall');
  let built = 0, blocked = 0, broke = 0;
  for (const key of wallMode.cells) {
    if (countType('wall') >= maxW) { broke++; continue; }
    if (!wallCellFree(key)) { blocked++; continue; }
    if (!canAfford(BUILDINGS.wall.cost)) { broke++; continue; }
    payCost(BUILDINGS.wall.cost);
    const [x, y] = key.split(',').map(Number);
    state.buildings.push(newBuilding('wall', x, y));
    built++;
  }
  if (built > 0) {
    Sound.place();
    toast(`Built ${built} wall${built === 1 ? '' : 's'}!`, 'wall');
  }
  if (broke > 0) toast(countType('wall') >= maxW ? 'Wall limit reached!' : 'Ran out of gold for some walls!', 'res_gold');
  if (built === 0 && broke === 0 && blocked > 0) toast('Those spots are taken!');
  refreshHUD(); save();
  exitWallMode();
}
$('wallOk').addEventListener('click', buildPendingWalls);
$('wallNo').addEventListener('click', exitWallMode);

/* ============================ HUD & modals ============================ */
function refreshHUD() {
  $('goldCount').textContent = cheatOn() ? '∞' : fmt(state.gold);
  $('elixirCount').textContent = cheatOn() ? '∞' : fmt(state.elixir);
  $('gemCount').textContent = cheatOn() ? '∞' : fmt(state.gems);
  $('trophyCount').textContent = fmt(state.trophies);
  $('goldMax').textContent = cheatOn() ? '∞' : fmt(storageCap('gold'));
  $('elixirMax').textContent = cheatOn() ? '∞' : fmt(storageCap('elixir'));
  $('goldBar').style.width = cheatOn() ? '100%' : clamp(state.gold / storageCap('gold') * 100, 0, 100) + '%';
  $('elixirBar').style.width = cheatOn() ? '100%' : clamp(state.elixir / storageCap('elixir') * 100, 0, 100) + '%';
  $('chiefName').textContent = state.name;
  $('chiefSub').textContent = `${state.village} · TH${realThLevel()}${cheatOn() ? ' · CHEAT' : ''}`;
  $('xpLevel').textContent = xpLevel();
  $('builderCount').textContent = cheatOn() ? '∞' : `${builderTotal() - buildersBusy()}/${builderTotal()}`;
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

/* ---------- shop (tabbed) ---------- */
let shopTab = 'defenses';
function renderShopTabs() {
  const tabs = $('shopTabs');
  tabs.innerHTML = '';
  for (const t of SHOP_TABS) {
    const btn = document.createElement('button');
    btn.className = 'shop-tab' + (shopTab === t.id ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => { shopTab = t.id; Sound.tap(); renderShop(); });
    tabs.appendChild(btn);
  }
}
function renderShop() {
  renderShopTabs();
  const grid = $('shopGrid');
  const th = thLevel();
  grid.innerHTML = '';
  for (const type of SHOP_ORDER) {
    const d = BUILDINGS[type];
    if (d.shopTab !== shopTab) continue;
    const count = countType(type);
    const max = maxCountFor(type);
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
      <div class="si-cost"><img src="assets/res_${res}.png"/>${cheatOn() ? 'free' : fmt(costAmount)}</div>
      <div class="si-count">${locked ? `needs TH${[1, 2, 3, 4, 5].find((L) => d.maxCount(L) > 0) || '?'}` : full ? `max built (${count}/${max})` : `${count}/${max} built`}</div>
    `;
    el.addEventListener('click', () => {
      if (locked) { toast(`Unlocks at a higher Town Hall level`, 'town_hall'); Sound.error(); return; }
      if (full) { toast(`You've built the maximum${cheatOn() ? '' : ' for your Town Hall'}`, d.img); Sound.error(); return; }
      if (!afford) { toast('Not enough resources!', `res_${res}`); Sound.error(); return; }
      if (type === 'wall') { Sound.tap(); startWallMode(); return; }
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
    const locked = (!cheatOn() && th < tr.thRequired) || !hasBarracks;
    const el = document.createElement('div');
    el.className = 'train-item' + (locked ? ' locked' : '') + (tr.hero ? ' hero-item' : '');
    el.innerHTML = `
      <img src="assets/${tr.icon}.png"/>
      <div class="ti-name">${tr.name}</div>
      <div class="ti-cost"><img src="assets/res_elixir.png"/>${cheatOn() ? 'free' : fmt(tr.cost.elixir)}</div>
      <div class="ti-house">🏕️ ${tr.housing} · ⏱️ ${cheatOn() ? '0s' : tr.trainTime + 's'}</div>
    `;
    el.title = tr.desc;
    el.addEventListener('click', () => {
      if (!hasBarracks) { toast('Build a Barracks first!', 'barracks'); Sound.error(); return; }
      if (!cheatOn() && th < tr.thRequired) { toast(`${tr.name} unlocks at TH${tr.thRequired}`, 'town_hall'); Sound.error(); return; }
      if (armySize(true) + tr.housing > armyCap()) { toast('Army camps are full!', 'army_camp'); Sound.error(); return; }
      if (!cheatOn() && state.elixir < tr.cost.elixir) { toast('Not enough elixir!', 'res_elixir'); Sound.error(); return; }
      if (!cheatOn()) state.elixir -= tr.cost.elixir;
      const lastEnd = state.queue.length ? state.queue[state.queue.length - 1].endsAt : nowS();
      state.queue.push({ troop: t, endsAt: cheatOn() ? nowS() : Math.max(nowS(), lastEnd) + tr.trainTime });
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

/* ---------- cheat console ---------- */
$('cheatBtn').addEventListener('click', () => {
  Sound.tap();
  $('cheatStatus').textContent = cheatOn() ? 'Cheat mode is ON. Type "nerf" to turn it off.' : '';
  $('cheatStatus').classList.remove('bad');
  $('cheatInput').value = '';
  openModal('cheatModal');
  setTimeout(() => $('cheatInput').focus(), 60);
});
function tryCheat() {
  const code = $('cheatInput').value.trim().toLowerCase();
  const status = $('cheatStatus');
  if (!code) return;
  if (code.includes('clash')) {
    state.cheat = true;
    state.gold = CHEAT_RESOURCES; state.elixir = CHEAT_RESOURCES; state.gems = CHEAT_RESOURCES;
    // finish anything in progress
    for (const b of state.buildings) { b.workEndsAt = 0; b.workTotal = 0; }
    Sound.cheatCode();
    status.classList.remove('bad');
    status.textContent = 'CHEAT ACTIVATED! Unlimited everything. Go build your dream base.';
    toast('Cheat mode ON — everything is unlocked and free!', 'res_gem');
    confettiBurst();
    refreshHUD(); save();
    if (!$('shopModal').classList.contains('hidden')) renderShop();
    setTimeout(() => closeModal('cheatModal'), 900);
  } else if (code === 'nerf' || code === 'off' || code === 'disable') {
    state.cheat = false;
    state.gold = Math.min(state.gold, storageCap('gold'));
    state.elixir = Math.min(state.elixir, storageCap('elixir'));
    if (state.gems > 1e6) state.gems = 500;
    status.classList.remove('bad');
    status.textContent = 'Cheat mode off. Back to honest villaging.';
    toast('Cheat mode OFF');
    refreshHUD(); save();
  } else {
    status.classList.add('bad');
    status.textContent = 'Nothing happened. The goblins snicker at your spelling.';
    Sound.error();
  }
  $('cheatInput').value = '';
}
$('cheatGo').addEventListener('click', tryCheat);
$('cheatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryCheat(); });

function confettiBurst() {
  const c = gridToWorld(N / 2, N / 2);
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: c.x + rand(-40, 40), y: c.y + rand(-30, 10),
      vx: rand(-260, 260), vy: rand(-420, -80),
      life: rand(0.8, 1.7), t: 0,
      color: pick(['#ffd23e', '#8df57f', '#7ec4ff', '#f79ce8', '#ff8a5c']),
      size: rand(4, 8),
    });
  }
}

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
  const size = b.sizeOverride || (b.type && BUILDINGS[b.type] ? BUILDINGS[b.type].size : (b.type && OBSTACLES[b.type] ? OBSTACLES[b.type].size : 2));
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
function spawnFloatText(b, txt, color, sizeOverride = null, yOff = 0) {
  const size = sizeOverride || (BUILDINGS[b.type] ? BUILDINGS[b.type].size : 2);
  const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
  floaties.push({ x: c.x, y: c.y - size * TH2 - 20 + yOff, txt, color, t: 0, life: 1.2 });
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

/* ============================ drawing ============================ */
function drawDiamond(gx, gy, w, h, fill, stroke = null) {
  const p = gridToWorld(gx, gy);
  const a = gridToWorld(gx + w, gy);
  const b2 = gridToWorld(gx + w, gy + h);
  const c = gridToWorld(gx, gy + h);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(a.x, a.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

/* ---------- procedural connected walls ---------- */
const WALL_PALETTES = {
  1: { top: '#c9995c', left: '#8a6034', right: '#a4763f', cap: '#e0b276' },   // wood
  2: { top: '#cfcfd6', left: '#8e8e99', right: '#ababb5', cap: '#e8e8ee' },   // stone
  3: { top: '#d8d8e2', left: '#93939f', right: '#b2b2bf', cap: '#f7e29a' },   // stone + gold cap
  4: { top: '#eadfa8', left: '#a08a4a', right: '#c4ad64', cap: '#ffe27a' },   // gold
  5: { top: '#cfe6f7', left: '#6f93b8', right: '#9dc0dd', cap: '#eaf7ff' },   // crystal
};
function isoBox(cx, cy, halfW, halfH, height, pal, alpha = 1) {
  ctx.globalAlpha = alpha;
  // left face
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy - height);
  ctx.lineTo(cx, cy + halfH - height);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
  ctx.fillStyle = pal.left;
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(cx + halfW, cy - height);
  ctx.lineTo(cx, cy + halfH - height);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.closePath();
  ctx.fillStyle = pal.right;
  ctx.fill();
  // top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH - height);
  ctx.lineTo(cx + halfW, cy - height);
  ctx.lineTo(cx, cy + halfH - height);
  ctx.lineTo(cx - halfW, cy - height);
  ctx.closePath();
  ctx.fillStyle = pal.top;
  ctx.fill();
  ctx.globalAlpha = 1;
}
function drawWallCell(gx, gy, level, alpha, hasE, hasS, damaged = 0) {
  const pal = WALL_PALETTES[clamp(level, 1, 5)];
  const c = gridToWorld(gx + 0.5, gy + 0.5);
  const H = 17 + level * 1.5;
  // connectors first (behind post): toward +x (screen right-down) and +y (screen left-down)
  if (hasE) {
    const m = gridToWorld(gx + 1, gy + 0.5);
    isoBox(m.x, m.y, TW2 * 0.42, TH2 * 0.42, H * 0.62, pal, alpha);
  }
  if (hasS) {
    const m = gridToWorld(gx + 0.5, gy + 1);
    isoBox(m.x, m.y, TW2 * 0.42, TH2 * 0.42, H * 0.62, pal, alpha);
  }
  // post
  isoBox(c.x, c.y, TW2 * 0.52, TH2 * 0.52, H, pal, alpha);
  // cap
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  const capY = c.y - H - TH2 * 0.52;
  ctx.moveTo(c.x, capY - 3);
  ctx.lineTo(c.x + TW2 * 0.3, capY + TH2 * 0.22);
  ctx.lineTo(c.x, capY + TH2 * 0.52);
  ctx.lineTo(c.x - TW2 * 0.3, capY + TH2 * 0.22);
  ctx.closePath();
  ctx.fillStyle = pal.cap;
  ctx.fill();
  // cracks when damaged
  if (damaged > 0.4) {
    ctx.strokeStyle = 'rgba(30,20,10,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y - H * 0.4);
    ctx.lineTo(c.x - 1, c.y - H * 0.1);
    ctx.lineTo(c.x - 7, c.y + 4);
    ctx.moveTo(c.x + 5, c.y - H * 0.55);
    ctx.lineTo(c.x + 2, c.y - H * 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function wallNeighborSet(buildings, extraKeys = null) {
  const set = new Set();
  for (const b of buildings) if (b.type === 'wall' && !b.dead) set.add(`${b.gx},${b.gy}`);
  if (extraKeys) for (const k of extraKeys) set.add(k);
  return set;
}

function drawBuildingSprite(b, alpha = 1) {
  const d = bDef(b);
  const img = IMG[d.img];
  if (!img || !img.naturalWidth) return;
  const tw = DRAW_TWEAKS[b.type] || {};
  let k = tw.k || 0.9;
  const size = d.size;
  const c = gridToWorld(b.gx + size / 2, b.gy + size / 2);
  // selection pop
  if (b.popT && b.popT > 0) {
    k *= 1 + 0.07 * Math.sin((1 - b.popT / 0.22) * Math.PI);
  }
  const w = size * TW2 * 2 * k;
  const h = w * (img.naturalHeight / img.naturalWidth);
  const bottom = c.y + size * TH2 * (0.92 + (tw.dy || 0));
  ctx.globalAlpha = alpha;
  if (b.hpNow !== undefined && b.hpNow < b.hpMax * 0.5 && !b.dead) {
    ctx.filter = 'brightness(0.75) saturate(0.8)';
  }
  ctx.drawImage(img, c.x - w / 2, bottom - h, w, h);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  if (scene === 'home' && isConstructing(b)) {
    drawWorkOverlay(c.x, c.y, size, h, clamp(1 - (b.workEndsAt - nowS()) / b.workTotal, 0, 1), b.id);
  }
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
  if (scene === 'home' && b.level > 1 && !d.deco && b.type !== 'wall') {
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

function drawObstacleSprite(o, alpha = 1) {
  const d = oDef(o);
  const img = IMG[d.img];
  if (!img || !img.naturalWidth) return;
  const size = d.size;
  const c = gridToWorld(o.gx + size / 2, o.gy + size / 2);
  let k = 0.85;
  if (o.popT && o.popT > 0) k *= 1 + 0.07 * Math.sin((1 - o.popT / 0.22) * Math.PI);
  const w = size * TW2 * 2 * k;
  const h = w * (img.naturalHeight / img.naturalWidth);
  const bottom = c.y + size * TH2 * 0.9;
  // shake while being removed
  let ox = 0;
  if (isRemoving(o)) ox = Math.sin(perfNow * 26 + o.id) * 1.6;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, c.x - w / 2 + ox, bottom - h, w, h);
  ctx.globalAlpha = 1;
  if (o.type === 'gem_box') {
    // sparkle
    const tw = (Math.sin(perfNow * 4 + o.id * 2) + 1) / 2;
    ctx.globalAlpha = 0.35 + tw * 0.55;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✨', c.x + Math.sin(perfNow * 1.7) * 8, c.y - h * 0.7 - 8);
    ctx.globalAlpha = 1;
  }
  if (scene === 'home' && isRemoving(o)) {
    drawWorkOverlay(c.x, c.y, size, h, clamp(1 - (o.removeEndsAt - nowS()) / o.removeTotal, 0, 1), o.id, true);
  }
}

/* builder sprite + progress bar over construction/removal sites */
function drawWorkOverlay(cx, cy, size, spriteH, frac, seed, chopping = false) {
  const bw = size * TW2 * 1.1, bh2 = 9;
  const bx = cx - bw / 2, by = cy - size * TH2 - spriteH * 0.35 - 20;
  ctx.fillStyle = 'rgba(8,14,26,0.8)';
  ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, bh2 + 4, 5); ctx.fill();
  ctx.fillStyle = '#7ede63';
  ctx.beginPath(); ctx.roundRect(bx, by, bw * frac, bh2, 4); ctx.fill();
  // builder hops beside the site
  const bimg = IMG.builder;
  if (bimg && bimg.naturalWidth) {
    const hop = Math.abs(Math.sin(perfNow * 5 + seed)) * 7;
    const bw2 = 30;
    const bh3 = bw2 * (bimg.naturalHeight / bimg.naturalWidth);
    const sideX = cx + size * TW2 * 0.55;
    const sideY = cy + size * TH2 * 0.35;
    ctx.beginPath();
    ctx.ellipse(sideX, sideY + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.drawImage(bimg, sideX - bw2 / 2, sideY - bh3 - hop, bw2, bh3);
    // impact puffs
    if (Math.sin(perfNow * 5 + seed) > 0.92) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = chopping ? '#c8996a' : '#e8e0c8';
      ctx.beginPath(); ctx.arc(sideX - 10 + rand(-2, 2), sideY - 4, rand(2, 4), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(chopping ? '⛏️' : '🔨', cx, by - 6);
}

function drawHpBar(x, y, w, frac, color = '#7ede63') {
  ctx.fillStyle = 'rgba(8,14,26,0.75)';
  ctx.beginPath(); ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, 7, 3); ctx.fill();
  ctx.fillStyle = frac > 0.5 ? color : frac > 0.25 ? '#ffd23e' : '#ff6b6b';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w * clamp(frac, 0, 1), 5, 2.5); ctx.fill();
}

/* ============================ village render ============================ */
function renderHome() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#3f7326';
  ctx.fillRect(0, 0, vw, vh);
  applyCamera();

  if (groundCanvas) ctx.drawImage(groundCanvas, groundOrigin.x, groundOrigin.y);

  // selection footprint
  if (selected && !placing && !wallMode) {
    const size = isObstacle(selected) ? oDef(selected).size : bDef(selected).size;
    drawDiamond(selected.gx, selected.gy, size, size, 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.85)');
  }
  // placement ghost footprint
  if (placing) {
    const size = BUILDINGS[placing.type].size;
    const ok = placementValid(placing.type, placing.gx, placing.gy, placing.building ? placing.building.id : -1);
    drawDiamond(placing.gx, placing.gy, size, size, ok ? 'rgba(140,255,120,0.4)' : 'rgba(255,90,90,0.45)', ok ? '#9dff9d' : '#ff8a8a');
  }
  // wall mode overlays
  if (wallMode) {
    // subtle grid tint
    drawDiamond(0, 0, N, N, 'rgba(255,255,255,0.05)');
  }

  // painter's order: walls + buildings + obstacles sorted by depth
  const wallKeys = wallNeighborSet(state.buildings, wallMode ? [...wallMode.cells, ...(wallMode.preview.filter(wallCellFree))] : null);
  const ents = [];
  for (const b of state.buildings) {
    if (placing && placing.building && placing.building.id === b.id) continue;
    ents.push({ depth: b.gx + b.gy + bDef(b).size, b });
  }
  for (const o of state.obstacles) ents.push({ depth: o.gx + o.gy + oDef(o).size, o });
  if (wallMode) {
    for (const key of wallMode.cells) {
      const [x, y] = key.split(',').map(Number);
      ents.push({ depth: x + y + 1, ghostWall: { gx: x, gy: y, pending: true } });
    }
    for (const key of wallMode.preview) {
      if (wallMode.cells.has(key) || !wallCellFree(key)) continue;
      const [x, y] = key.split(',').map(Number);
      ents.push({ depth: x + y + 1, ghostWall: { gx: x, gy: y, preview: true } });
    }
  }
  ents.sort((a, b) => a.depth - b.depth);

  for (const e of ents) {
    if (e.b) {
      if (e.b.popT > 0) e.b.popT -= 0.016;
      if (e.b.type === 'wall') {
        drawWallCell(e.b.gx, e.b.gy, e.b.level, 1,
          wallKeys.has(`${e.b.gx + 1},${e.b.gy}`), wallKeys.has(`${e.b.gx},${e.b.gy + 1}`));
      } else {
        drawBuildingSprite(e.b);
      }
    } else if (e.o) {
      if (e.o.popT > 0) e.o.popT -= 0.016;
      drawObstacleSprite(e.o);
    } else if (e.ghostWall) {
      const g = e.ghostWall;
      drawDiamond(g.gx, g.gy, 1, 1, g.preview ? 'rgba(255,255,255,0.18)' : 'rgba(140,255,120,0.2)');
      drawWallCell(g.gx, g.gy, 1, g.preview ? 0.38 : 0.55,
        wallKeys.has(`${g.gx + 1},${g.gy}`), wallKeys.has(`${g.gx},${g.gy + 1}`));
    }
  }

  if (placing) {
    const ghost = placing.building || { ...newBuilding(placing.type, placing.gx, placing.gy), id: -99 };
    const tmp = { ...ghost, gx: placing.gx, gy: placing.gy, type: placing.type };
    if (placing.type === 'wall') drawWallCell(placing.gx, placing.gy, ghost.level || 1, 0.75, false, false);
    else drawBuildingSprite(tmp, 0.75);
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
  const th = realThLevel();
  const buildings = [];
  let eid = 1;
  const mk = (type, gx, gy, level) => {
    const d = BUILDINGS[type];
    const hp = Math.round(levelMul(d.hp, d.hpMul || 1.2, level));
    const b = {
      id: eid++, type, gx, gy, level,
      hpMax: hp, hpNow: hp, dead: false,
      lootGold: 0, lootElixir: 0,
      cooldown: rand(0, 0.5),
    };
    buildings.push(b);
    return b;
  };

  const c = N / 2;
  const lvl = clamp(th + randi(-1, 1), 1, 6);

  mk('town_hall', c - 2, c - 2, clamp(lvl, 1, 5));
  const r = 7;
  for (let x = c - r; x <= c + r; x++) {
    for (let y = c - r; y <= c + r; y++) {
      const onRing = (x === c - r || x === c + r || y === c - r || y === c + r);
      if (onRing) mk('wall', x, y, clamp(lvl, 1, 5));
    }
  }

  const innerSpots = [
    [c - 5, c - 5], [c + 2, c - 5], [c - 5, c + 2], [c + 2, c + 2],
    [c - 5, c - 1], [c + 2, c - 1], [c - 1, c - 5], [c - 1, c + 2],
  ].sort(() => Math.random() - 0.5);
  const defensePlan = [];
  defensePlan.push('cannon', 'cannon', 'archer_tower');
  if (lvl >= 2) defensePlan.push('mortar', 'archer_tower');
  if (lvl >= 3) defensePlan.push('wizard_tower', 'air_defense');
  if (lvl >= 4) defensePlan.push('hidden_tesla', 'xbow');
  if (lvl >= 5) defensePlan.push('inferno_tower');
  defensePlan.slice(0, innerSpots.length).forEach((t, i) => {
    const [gx, gy] = innerSpots[i];
    mk(t, gx, gy, clamp(lvl + (t === 'cannon' ? 1 : 0), 1, BUILDINGS[t].maxLevel));
  });

  const occupied = () => occupancyGrid(-1, buildings, null);
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
  if (lvl >= 3) placeOuter('bomb_tower', clamp(lvl, 1, 6));
  placeOuter('barracks', lvl);
  placeOuter('army_camp', lvl);

  // scatter decorative obstacles far from the action
  const obstacles = [];
  for (let i = 0; i < 10; i++) {
    const type = pick(OBSTACLE_SPAWN_POOL);
    const size = OBSTACLES[type].size;
    for (let tries = 0; tries < 40; tries++) {
      const gx = randi(0, N - size), gy = randi(0, N - size);
      const distC = Math.max(Math.abs(gx - c), Math.abs(gy - c));
      if (distC < r + 7) continue;
      obstacles.push({ id: 9000 + i, type, gx, gy, removeEndsAt: 0 });
      break;
    }
  }

  const totalGold = Math.round(600 * lvl * rand(1.0, 1.7));
  const totalElixir = Math.round(600 * lvl * rand(1.0, 1.7));
  const goldHolders = buildings.filter((b) => ['gold_storage', 'gold_mine', 'town_hall'].includes(b.type));
  const elixirHolders = buildings.filter((b) => ['elixir_storage', 'elixir_collector', 'town_hall'].includes(b.type));
  goldHolders.forEach((b) => b.lootGold = Math.round(totalGold / goldHolders.length));
  elixirHolders.forEach((b) => b.lootElixir = Math.round(totalElixir / elixirHolders.length));

  return { buildings, obstacles, level: lvl, name: pick(ENEMY_VILLAGE_NAMES) };
}

function startMatchmaking() {
  if (armySize() === 0) {
    toast('Train an army first! Tap the army button.', 'icon_barbarian');
    Sound.error();
    return;
  }
  deselect(); cancelPlacing(); exitWallMode();
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
    grid: occupancyGrid(-1, enemy.buildings, null),
    troops: [],
    projectiles: [],
    zaps: [],
    time: BATTLE_TIME,
    started: false,
    ended: false,
    stars: 0,
    destroyedWeight: 0,
    totalWeight: enemy.buildings.filter((b) => b.type !== 'wall' && !bDef(b).deco).length,
    lootGold: 0, lootElixir: 0,
    army: { ...state.army },
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
  let pool = alive;
  if (def.targets === 'wall') {
    const walls = battle.enemy.buildings.filter((b) => !b.dead && b.type === 'wall');
    pool = walls.length ? walls : alive;
  } else if (def.targets === 'defense') {
    const defs = alive.filter((b) => bDef(b).defense);
    if (defs.length) pool = defs;
  } else if (def.targets === 'resource') {
    const res = alive.filter((b) => bDef(b).production || bDef(b).storage);
    if (res.length) pool = res;
  }
  if (!pool.length) return null;
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

function damageBuilding(b, dmg) {
  if (b.dead) return;
  b.hpNow -= dmg;
  if (b.hpNow <= 0) {
    b.hpNow = 0;
    b.dead = true;
    Sound.crumble();
    battleExplosion(buildingCenter(b), bDef(b).size);
    const size = bDef(b).size;
    for (let x = b.gx; x < b.gx + size; x++)
      for (let y = b.gy; y < b.gy + size; y++)
        if (x >= 0 && y >= 0 && x < N && y < N && battle.grid[y * N + x] === b) battle.grid[y * N + x] = null;
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

function troopAttack(tr, goal, def) {
  const isWall = goal.type === 'wall';
  const dmg = (isWall ? def.dps * 4 : def.dps);
  if (def.suicide) {
    // wall breaker: boom!
    damageBuilding(goal, def.dps * (isWall ? 8 : 1));
    // splash nearby walls
    const gc = buildingCenter(goal);
    for (const b of battle.enemy.buildings) {
      if (b.dead || b === goal || b.type !== 'wall') continue;
      const bc = buildingCenter(b);
      if (Math.hypot(bc.x - gc.x, bc.y - gc.y) <= (def.splash || 1.2)) damageBuilding(b, def.dps * 4);
    }
    tr.dead = true;
    Sound.boom();
    battleExplosion({ x: tr.x, y: tr.y }, 1.2, '#ffb35c');
    return;
  }
  if (def.zap) {
    damageBuilding(goal, dmg);
    const gc = buildingCenter(goal);
    battle.zaps.push({ x1: tr.x, y1: tr.y, x2: gc.x, y2: gc.y, t: 0.16, color: '#9fdcff', hover: TROOPS[tr.type].flying ? 46 : 10 });
    if (def.splash) {
      for (const b of battle.enemy.buildings) {
        if (b.dead || b === goal) continue;
        if (distToBuilding({ x: gc.x, y: gc.y }, b) <= def.splash) damageBuilding(b, dmg * 0.4);
      }
    }
    Sound.zap();
    return;
  }
  if (def.range >= 2) {
    const tc = buildingCenter(goal);
    battle.projectiles.push({
      x: tr.x, y: tr.y, tx: tc.x, ty: tc.y, speed: 9,
      dmg, splash: def.splash || 0, side: 'player', targetB: goal,
      color: tr.type === 'wizard' ? '#63b3ff' : tr.type === 'witch' ? '#c98cf5' : '#d8c9a0',
    });
    Sound.shoot();
  } else {
    damageBuilding(goal, dmg);
  }
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

    /* healer: follow + heal friends */
    if (def.targets === 'heal') {
      let patient = null, bestScore = -1;
      for (const other of troops) {
        if (other.dead || other === tr || TROOPS[other.type].targets === 'heal') continue;
        const hurt = 1 - other.hpNow / other.hpMax;
        const d = Math.hypot(other.x - tr.x, other.y - tr.y);
        const score = hurt * 10 - d * 0.15;
        if (score > bestScore) { bestScore = score; patient = other; }
      }
      if (patient) {
        const d = Math.hypot(patient.x - tr.x, patient.y - tr.y);
        if (d > def.range) {
          tr.x += ((patient.x - tr.x) / d) * def.speed * dt;
          tr.y += ((patient.y - tr.y) / d) * def.speed * dt;
        }
        if (d <= def.range + 0.5) {
          for (const other of troops) {
            if (other.dead || other === tr || TROOPS[other.type].targets === 'heal') continue;
            if (Math.hypot(other.x - tr.x, other.y - tr.y) <= def.range + 0.5 && other.hpNow < other.hpMax) {
              other.hpNow = Math.min(other.hpMax, other.hpNow + def.healPerSec * dt);
            }
          }
          if (Math.random() < dt * 6) {
            battleParticles.push({
              x: gridToWorld(tr.x, tr.y).x + rand(-14, 14), y: gridToWorld(tr.x, tr.y).y + rand(-4, 10),
              vx: rand(-6, 6), vy: rand(-34, -16), life: rand(0.4, 0.8), t: 0, color: '#a5f77f', size: rand(2, 4),
            });
          }
        }
      }
      continue;
    }

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
        troopAttack(tr, goal, def);
      }
    } else {
      const size = bDef(goal).size;
      const cx = clamp(tr.x, goal.gx, goal.gx + size);
      const cy = clamp(tr.y, goal.gy, goal.gy + size);
      const dx = cx - tr.x, dy = cy - tr.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = tr.x + (dx / len) * def.speed * dt;
      const ny = tr.y + (dy / len) * def.speed * dt;
      if (!def.flying && !def.jumpsWalls) {
        const wall = wallInPath(tr, tr.x + (dx / len) * 0.55, tr.y + (dy / len) * 0.55);
        if (wall && !tr.wallTarget && goal.type !== 'wall') { tr.wallTarget = wall; continue; }
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
      if (def.targets === 'air' && !flying) continue;
      const dist = Math.hypot(tr.x - bc.x, tr.y - bc.y);
      if (dist > def.range + 0.3) continue;
      if (def.minRange && dist < def.minRange) continue;
      if (dist < bestD) { bestD = dist; best = tr; }
    }
    if (!best) continue;
    b.cooldown = def.cooldown;
    const dps = Math.round(levelMul(def.dps, def.dpsMul, b.level)) * def.cooldown;
    if (def.zap || def.beam) {
      best.hpNow -= dps;
      battle.zaps.push({
        x1: bc.x, y1: bc.y, x2: best.x, y2: best.y, t: def.beam ? 0.3 : 0.15,
        color: def.beam ? '#ff9a3d' : '#8fd8ff',
        hover: TROOPS[best.type].flying ? 46 : 8, srcH: 34,
      });
      if (def.beam) Sound.beam(); else Sound.zap();
      if (best.hpNow <= 0) { best.dead = true; battleExplosion({ x: best.x, y: best.y }, 0.8, '#9c9c9c'); }
    } else {
      battle.projectiles.push({
        x: bc.x, y: bc.y, targetT: best,
        speed: b.type === 'mortar' ? 4.5 : def.missile ? 7 : def.bolt ? 13 : 10,
        dmg: dps, splash: def.splash || 0, side: 'enemy',
        arc: b.type === 'mortar', t: 0, missile: def.missile,
        color: b.type === 'wizard_tower' ? '#c76cff' : b.type === 'archer_tower' ? '#ffe9b0' : b.type === 'air_defense' ? '#ff6b6b' : b.type === 'xbow' ? '#ffe9b0' : '#4a4a4a',
      });
      Sound.shoot();
    }
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
      if (p.side === 'player') {
        if (p.targetB && !p.targetB.dead) damageBuilding(p.targetB, p.dmg);
        if (p.splash) {
          for (const b of battle.enemy.buildings) {
            if (b.dead || b === p.targetB) continue;
            if (distToBuilding({ x: target.x, y: target.y }, b) <= p.splash) damageBuilding(b, p.dmg * 0.5);
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

  battle.zaps = battle.zaps.filter((z) => (z.t -= dt) > 0);

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
  ctx.fillStyle = '#3f7326';
  ctx.fillRect(0, 0, vw, vh);
  applyCamera();
  if (groundCanvas) ctx.drawImage(groundCanvas, groundOrigin.x, groundOrigin.y);

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

  const wallKeys = wallNeighborSet(battle.enemy.buildings);
  const ents = [];
  for (const b of battle.enemy.buildings) if (!b.dead) ents.push({ depth: b.gx + b.gy + bDef(b).size, b });
  for (const o of battle.enemy.obstacles) ents.push({ depth: o.gx + o.gy + oDef(o).size, o });
  for (const tr of battle.troops) if (!tr.dead) ents.push({ depth: tr.x + tr.y + (TROOPS[tr.type].flying ? 100 : 0), tr });
  ents.sort((a, b) => a.depth - b.depth);

  for (const e of ents) {
    if (e.b) {
      if (e.b.type === 'wall') {
        drawWallCell(e.b.gx, e.b.gy, e.b.level, 1,
          wallKeys.has(`${e.b.gx + 1},${e.b.gy}`), wallKeys.has(`${e.b.gx},${e.b.gy + 1}`),
          1 - e.b.hpNow / e.b.hpMax);
        if (e.b.hpNow < e.b.hpMax) {
          const c = buildingCenter(e.b);
          const w = gridToWorld(c.x, c.y);
          drawHpBar(w.x, w.y - 40, TW2 * 0.9, e.b.hpNow / e.b.hpMax);
        }
      } else {
        drawBuildingSprite(e.b, 1);
        if (e.b.hpNow < e.b.hpMax) {
          const c = buildingCenter(e.b);
          const w = gridToWorld(c.x, c.y);
          drawHpBar(w.x, w.y - bDef(e.b).size * TH2 * 2.2, bDef(e.b).size * TW2, e.b.hpNow / e.b.hpMax);
        }
      }
    } else if (e.o) {
      drawObstacleSprite(e.o);
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
    ctx.arc(w.x, w.y + yOff - 14, p.arc ? 5.5 : p.missile ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.missile) {
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(w.x - (p.lastX !== undefined ? 0 : 0) - rand(2, 6), w.y + yOff - 12 + rand(-2, 2), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ccc';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // zaps / beams
  for (const z of battle.zaps) {
    const a = gridToWorld(z.x1, z.y1);
    const b2 = gridToWorld(z.x2, z.y2);
    const y1 = a.y - (z.srcH || 10), y2 = b2.y - (z.hover || 8);
    ctx.strokeStyle = z.color;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = clamp(z.t * 6, 0, 1);
    ctx.beginPath();
    ctx.moveTo(a.x, y1);
    const segs = 5;
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      ctx.lineTo(lerp(a.x, b2.x, f) + rand(-5, 5), lerp(y1, y2, f) + rand(-5, 5));
    }
    ctx.lineTo(b2.x, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
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
      if (selected && Math.floor(t / 500) !== Math.floor((t - dt * 1000) / 500)) {
        if (isObstacle(selected) ? isRemoving(selected) : isConstructing(selected)) showInfo(selected);
      }
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
  uid = Math.max(
    state.buildings.reduce((m, b) => Math.max(m, b.id), 0),
    state.obstacles.reduce((m, o) => Math.max(m, o.id), 0),
  ) + 1;
  if (isNew || state.obstacles.length === 0) seedObstacles(14);
  if (state.muted) { Sound.toggleMute(); $('muteBtn').textContent = '🔇'; }

  const away = nowS() - state.lastSeen;
  prerenderGround();
  fitCamera();
  refreshHUD();

  $('loader').classList.add('fade');
  setTimeout(() => $('loader').remove(), 600);
  $('hud').classList.remove('hidden');

  if (isNew) {
    setTimeout(() => toast('Welcome, Chief! This is a parody — everything is free.', 'res_gem'), 600);
    setTimeout(() => toast('Tap the Shop to build. Chop trees for loot and gems!', 'tree_medium'), 3400);
    setTimeout(() => toast('Train troops, then hit Attack to raid goblins!', 'icon_barbarian'), 6200);
  } else if (away > 120) {
    setTimeout(() => toast(`Welcome back! Your village kept working while you were gone ${fmtTime(away)}.`, 'builder'), 700);
  }

  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);

  requestAnimationFrame(loop);
})();
