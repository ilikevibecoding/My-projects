import * as THREE from 'three';
import { FirstPersonControls } from './player/controls.js';
import { buildWorld } from './world/index.js';
import { initHarness, isShotMode, VIEWPOINTS } from './debug/harness.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const loadingEl = document.getElementById('loading');

const shotMode = isShotMode();
const params = new URLSearchParams(location.search);
const pixelRatioOverride = params.get('px') ? parseFloat(params.get('px')) : null;

// --- renderer ---
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(pixelRatioOverride ?? Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

// --- scene + camera ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);

// --- controls ---
const controls = new FirstPersonControls(camera, renderer.domElement);

// --- frame stepping support for the harness ---
let frameWaiters = [];
function requestFrames(n) {
  return new Promise((resolve) => frameWaiters.push({ n, resolve }));
}

// --- boot ---
const world = await buildWorld(scene, renderer, (p) => {
  loadingEl.textContent = `Loading the wilderness… ${Math.round(p * 100)}%`;
});
controls.getTerrainHeight = world.getTerrainHeight;
controls.colliders = world.colliders;
controls.setPose(8, 10, Math.PI * 0.85, -0.05); // spawn looking toward the campsite

const harness = initHarness({
  camera,
  renderer,
  getTerrainHeight: world.getTerrainHeight,
  requestFrames,
});

loadingEl.classList.add('hidden');

if (shotMode) {
  controls.enabled = false;
  overlay.classList.add('hidden');
} else {
  overlay.classList.remove('hidden');
  overlay.addEventListener('click', () => controls.lock());
  controls.onLockChange = (locked) => overlay.classList.toggle('hidden', locked);
}

// --- resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- main loop ---
let lastTime = performance.now();
let elapsed = 0;

function renderFrame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;

  if (!shotMode) controls.update(dt);
  // shot mode uses a frozen wind time so screenshots are deterministic
  world.update(shotMode ? 42.0 : elapsed, dt, camera);

  renderer.render(scene, camera);

  if (frameWaiters.length) {
    for (const w of frameWaiters) w.n -= 1;
    const done = frameWaiters.filter((w) => w.n <= 0);
    frameWaiters = frameWaiters.filter((w) => w.n > 0);
    for (const w of done) w.resolve();
  }
}

renderer.setAnimationLoop(renderFrame);
harness.markReady();

// expose for quick console debugging (not used by gameplay)
window.__scene = scene;
window.__camera = camera;
if (!shotMode) window.__controls = controls;
console.log(`[camp] boot ok — shotMode=${shotMode}, views=${VIEWPOINTS.length}`);
