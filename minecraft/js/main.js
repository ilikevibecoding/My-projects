import * as THREE from 'three';
import { REACH_DISTANCE, RENDER_DISTANCE, CHUNK_SIZE, SEA_LEVEL } from './constants.js';
import { Blocks, BLOCK_DEFS, HOTBAR_BLOCKS, tileForFace } from './blocks.js';
import { TextureAtlas } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Sky } from './sky.js';
import { playBreak, playPlace, playSplash } from './audio.js';
import { seedFromString } from './rng.js';

// ----------------------------------------------------------------- seed

function resolveSeed() {
  const params = new URLSearchParams(location.search);
  let seedStr = params.get('seed');
  try {
    if (!seedStr) seedStr = localStorage.getItem('blockcraft:seed');
    if (!seedStr) seedStr = String(Math.floor(Math.random() * 1e9));
    localStorage.setItem('blockcraft:seed', seedStr);
  } catch {
    if (!seedStr) seedStr = '1337';
  }
  const seed = /^\d+$/.test(seedStr) ? parseInt(seedStr, 10) >>> 0 : seedFromString(seedStr);
  return { seed, seedStr };
}

const { seed, seedStr } = resolveSeed();

// ----------------------------------------------------------------- three

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const atlas = new TextureAtlas();
const world = new World(scene, atlas, seed);
const player = new Player(world);
const sky = new Sky(scene);
const particles = new Particles(scene);

const defaultFogNear = scene.fog.near;
const defaultFogFar = scene.fog.far;

// Spawn on land if possible.
(function spawn() {
  let sx = 0;
  let sz = 0;
  for (let r = 0; r <= 26; r++) {
    let found = false;
    for (let a = 0; a < 8; a++) {
      const x = Math.round(Math.cos((a / 8) * Math.PI * 2) * r * 8);
      const z = Math.round(Math.sin((a / 8) * Math.PI * 2) * r * 8);
      if (world.gen.heightAt(x, z) > SEA_LEVEL + 1) {
        sx = x;
        sz = z;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  player.teleportToSurface(sx + 0.5, sz + 0.5);
})();

// Block highlight outline.
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 })
);
highlight.visible = false;
scene.add(highlight);

// ----------------------------------------------------------------- input

const input = {
  forward: 0,
  strafe: 0,
  sprint: false,
  jump: false,
  down: false,
};
const keys = new Set();
let locked = false;
let selectedSlot = 0;

function refreshAxes() {
  input.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  input.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  input.jump = keys.has('Space');
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.down = input.sprint;
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  refreshAxes();

  if (e.code === 'KeyF' && locked) {
    player.flying = !player.flying;
    if (player.flying) player.velocity.y = 0;
    flashStatus(player.flying ? 'Flying enabled' : 'Flying disabled');
  }
  if (/^Digit[1-9]$/.test(e.code)) {
    selectSlot(parseInt(e.code.slice(5), 10) - 1);
  }
});

document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  refreshAxes();
});

window.addEventListener('blur', () => {
  keys.clear();
  refreshAxes();
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.rotate(e.movementX, e.movementY, 0.0022);
});

// ------------------------------------------------------- block interaction

function currentTarget() {
  const dir = player.lookDirection();
  return raycastVoxel(world, player.eyePosition, dir, REACH_DISTANCE);
}

function breakBlock() {
  const hit = currentTarget();
  if (!hit || hit.id === Blocks.BEDROCK) return;
  const tile = tileForFace(hit.id, 0);
  world.setBlock(hit.x, hit.y, hit.z, Blocks.AIR);
  particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, atlas.averageColor(tile), 18);
  playBreak();
}

function placeBlock() {
  const hit = currentTarget();
  if (!hit) return;
  const x = hit.x + hit.normal[0];
  const y = hit.y + hit.normal[1];
  const z = hit.z + hit.normal[2];
  const existing = world.getBlock(x, y, z);
  if (existing !== Blocks.AIR && existing !== Blocks.WATER) return;
  if (player.overlapsBlock(x, y, z)) return;
  if (world.setBlock(x, y, z, HOTBAR_BLOCKS[selectedSlot])) playPlace();
}

function pickBlock() {
  const hit = currentTarget();
  if (!hit) return;
  const remap = {
    [Blocks.SNOWY_GRASS]: Blocks.GRASS,
    [Blocks.COAL_ORE]: Blocks.STONE,
    [Blocks.IRON_ORE]: Blocks.STONE,
    [Blocks.BEDROCK]: Blocks.STONE,
  };
  const id = remap[hit.id] ?? hit.id;
  const idx = HOTBAR_BLOCKS.indexOf(id);
  if (idx >= 0) selectSlot(idx);
}

let actionTimer = null;
function startAction(fn) {
  stopAction();
  fn();
  actionTimer = setInterval(fn, 240);
}
function stopAction() {
  if (actionTimer) {
    clearInterval(actionTimer);
    actionTimer = null;
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) startAction(breakBlock);
  else if (e.button === 2) startAction(placeBlock);
  else if (e.button === 1) {
    e.preventDefault();
    pickBlock();
  }
});
document.addEventListener('mouseup', stopAction);
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener(
  'wheel',
  (e) => {
    if (!locked) return;
    const delta = Math.sign(e.deltaY);
    selectSlot((selectedSlot + delta + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length);
  },
  { passive: true }
);

// ----------------------------------------------------------------- HUD

const overlay = document.getElementById('overlay');
const playButton = document.getElementById('play-button');
const newWorldButton = document.getElementById('new-world-button');
const resetButton = document.getElementById('reset-button');
const seedLabel = document.getElementById('seed-label');
const hud = document.getElementById('hud');
const infoLabel = document.getElementById('info');
const statusLabel = document.getElementById('status');
const underwaterTint = document.getElementById('underwater');
const hotbarEl = document.getElementById('hotbar');

seedLabel.textContent = 'Seed: ' + seedStr;

let statusTimer = null;
function flashStatus(text) {
  statusLabel.textContent = text;
  statusLabel.classList.add('visible');
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusLabel.classList.remove('visible'), 1600);
}

const slotEls = [];
function buildHotbar() {
  for (let i = 0; i < HOTBAR_BLOCKS.length; i++) {
    const id = HOTBAR_BLOCKS[i];
    const def = BLOCK_DEFS[id];
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.title = def.name;

    const icon = document.createElement('canvas');
    icon.width = 44;
    icon.height = 44;
    const ctx = icon.getContext('2d');
    atlas.drawIsoCube(ctx, 44, def.tiles[0], def.tiles[2]);
    slot.appendChild(icon);

    const key = document.createElement('span');
    key.className = 'slot-key';
    key.textContent = String(i + 1);
    slot.appendChild(key);

    slot.addEventListener('click', () => selectSlot(i));
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  }
}

function selectSlot(i) {
  if (i < 0 || i >= HOTBAR_BLOCKS.length) return;
  selectedSlot = i;
  for (let s = 0; s < slotEls.length; s++) {
    slotEls[s].classList.toggle('selected', s === i);
  }
  flashStatus(BLOCK_DEFS[HOTBAR_BLOCKS[i]].name);
}

buildHotbar();
selectSlot(0);
statusLabel.classList.remove('visible');

// ----------------------------------------------------------- pointer lock

function requestLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* ignored */
  }
}

playButton.addEventListener('click', requestLock);

newWorldButton.addEventListener('click', () => {
  const newSeed = String(Math.floor(Math.random() * 1e9));
  try {
    localStorage.setItem('blockcraft:seed', newSeed);
  } catch {
    /* ignored */
  }
  location.href = location.pathname + '?seed=' + newSeed;
});

resetButton.addEventListener('click', () => {
  try {
    localStorage.removeItem(world.storageKey);
  } catch {
    /* ignored */
  }
  location.reload();
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  overlay.classList.toggle('hidden', locked);
  hud.classList.toggle('paused', !locked);
  if (!locked) {
    stopAction();
    keys.clear();
    refreshAxes();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', () => world.saveEdits());

// ----------------------------------------------------------------- loop

const clock = new THREE.Clock();
let fps = 60;
let wasInWater = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (dt > 0) fps += ((1 / dt) - fps) * 0.05;

  if (locked) {
    player.update(dt, input);
    if (player.inWater !== wasInWater) {
      if (player.inWater) playSplash();
      wasInWater = player.inWater;
    }
  }

  player.applyCamera(camera);
  world.update(player.position.x, player.position.z);
  sky.update(dt, camera.position);
  particles.update(dt);

  // Underwater look.
  if (player.headInWater) {
    scene.fog.color.set(0x16447e);
    scene.background.set(0x16447e);
    scene.fog.near = 1;
    scene.fog.far = 22;
    underwaterTint.classList.add('visible');
  } else {
    scene.fog.near = defaultFogNear;
    scene.fog.far = defaultFogFar;
    underwaterTint.classList.remove('visible');
  }

  // Targeted block outline.
  if (locked) {
    const hit = currentTarget();
    if (hit) {
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      highlight.visible = true;
    } else {
      highlight.visible = false;
    }
  } else {
    highlight.visible = false;
  }

  const p = player.position;
  infoLabel.textContent =
    `${Math.round(fps)} fps  ·  ` +
    `x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}  z ${p.z.toFixed(0)}  ·  ` +
    `${sky.clockString()}` +
    (player.flying ? '  ·  flying' : '') +
    (world.pendingChunks > 0 ? `  ·  loading ${world.pendingChunks}` : '');

  renderer.render(scene, camera);
}

// Debug/testing handle.
window.blockcraft = { world, player, sky, camera };

// Warm up the area around spawn before the first frame renders.
world.update(player.position.x, player.position.z);
animate();
