// Boot: renderer, camera, world, player, audio, UI, game, input, loop.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { PostFX } from './post.js';
import { Game } from './game.js';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 60);
scene.add(camera);

const world = buildWorld(scene);
const audio = new AudioEngine();
const ui = new UI();
const player = new Player(camera, world, audio);
const post = new PostFX(renderer);
const game = new Game({ scene, camera, world, player, audio, ui, post });

// ---------- resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 78 : 68; // wider on portrait phones
  camera.updateProjectionMatrix();
  post.setSize(w, h, pr);
  ui.resize();
}
window.addEventListener('resize', resize);
resize();

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  switch (e.code) {
    case 'KeyA': case 'ArrowLeft': player.go('left'); break;
    case 'KeyD': case 'ArrowRight': player.go('right'); break;
    case 'KeyW': case 'ArrowUp': player.go('up'); break;
    case 'KeyS': case 'ArrowDown': player.go('down'); break;
    case 'Space': player.setHolding(true); e.preventDefault(); break;
    case 'KeyF': player.setFlash(true); break;
    // no default
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') player.setHolding(false);
  if (e.code === 'KeyF') player.setFlash(false);
});
window.addEventListener('blur', () => {
  player.setHolding(false);
  player.setFlash(false);
});

// movement zones (click/tap)
const zoneDirs = { 'zone-left': 'left', 'zone-right': 'right', 'zone-up': 'up', 'zone-down': 'down' };
for (const [id, dir] of Object.entries(zoneDirs)) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    player.go(dir);
  });
}
// action zone = hold the door / closet shut
const actionZone = document.getElementById('zone-action');
actionZone.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  actionZone.setPointerCapture(e.pointerId);
  player.setHolding(true);
});
const releaseHold = () => player.setHolding(false);
actionZone.addEventListener('pointerup', releaseHold);
actionZone.addEventListener('pointercancel', releaseHold);
actionZone.addEventListener('lostpointercapture', releaseHold);

// hold anywhere on the scene = flashlight
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  player.setFlash(true);
});
window.addEventListener('pointerup', () => player.setFlash(false));
window.addEventListener('pointercancel', () => player.setFlash(false));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// audio unlock on any first interaction once in-game
window.addEventListener('pointerdown', () => audio.resume());
window.addEventListener('keydown', () => audio.resume());

// ---------- loop ----------
let last = performance.now();
let frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  frames++;

  player.update(dt);
  game.update(dt);
  post.render(scene, camera, now / 1000);
}
requestAnimationFrame(loop);

// signal for automated tests
window.__ready = true;
