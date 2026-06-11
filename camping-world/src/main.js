import * as THREE from 'three';
import { FirstPersonControls } from './player/controls.js';
import { buildWorld } from './world/index.js';
import { initPost } from './fx/post.js';
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
// sunny-exterior exposure: keeps ground out of the ACES shoulder so colors
// stay saturated and shadow contrast reads
renderer.toneMappingExposure = 0.62;
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

// debug: ?nogeo=1 renders sky/background only (isolates background artifacts)
if (params.has('nogeo')) {
  scene.traverse((n) => {
    if (n.isMesh) n.visible = false;
  });
}
// debug: ?pole=1 adds a tall white pole at camp — its cast shadow is the
// ground truth for "is the shadow pipeline working at all"
if (params.has('pole')) {
  const pole = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 12, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
  );
  pole.castShadow = true;
  pole.position.set(1.5, world.getTerrainHeight(1.5, 1.0) + 6, 1.0);
  scene.add(pole);
}
// debug: ?noenv=1 kills IBL so only the directional sun lights the scene
if (params.has('noenv')) {
  scene.environment = null;
}
{
  const sun = world.sky?.sun;
  window.__dbg = {
    shadowMapEnabled: renderer.shadowMap.enabled,
    shadowMapType: renderer.shadowMap.type,
    sunCastShadow: sun?.castShadow,
    sunIntensity: sun?.intensity,
    envIntensity: scene.environmentIntensity,
    sunPos: sun?.position.toArray().map((v) => Math.round(v)),
    camLeft: sun?.shadow.camera.left,
    camProj0: sun?.shadow.camera.projectionMatrix.elements[0],
    exposure: renderer.toneMappingExposure,
    fogDensity: scene.fog?.density,
    hasEnv: !!scene.environment,
    lightCount: (() => {
      let n = 0;
      scene.traverse((o) => o.isLight && n++);
      return n;
    })(),
  };
}
// debug: ?exp=0.85 overrides exposure
if (params.get('exp')) renderer.toneMappingExposure = parseFloat(params.get('exp'));

// --- post stack (disable with ?nopost=1) ---
const usePost = !params.has('nopost');
const post = usePost ? initPost(renderer, scene, camera) : null;

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
  if (post) post.setSize(window.innerWidth, window.innerHeight);
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
  const worldTime = shotMode ? 42.0 : elapsed;
  world.update(worldTime, dt, camera);

  if (post) post.render(worldTime);
  else renderer.render(scene, camera);

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
