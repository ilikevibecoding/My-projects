// Entry point: wires terrain, sky, vegetation, water, camp, player,
// interactions, post stack and the debug API together.
import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { createSky } from './sky.js';
import { TimeOfDay, PRESETS } from './timeofday.js';
import { createGrass, createTrees, createRocks, updateVegetation, LAYER_NO_REFLECT } from './vegetation.js';
import { createWater } from './water.js';
import { createCamp } from './camp.js';
import { Player } from './player.js';
import { Interactions } from './interact.js';
import { createPost } from './post.js';
import { installDebugAPI } from './debug.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3500);
camera.layers.enable(LAYER_NO_REFLECT);
scene.fog = new THREE.FogExp2(PRESETS.day.fogColor.clone(), PRESETS.day.fogDensity);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const terrain = createTerrain();
scene.add(terrain);

const sky = createSky();
scene.add(sky.mesh);

const grass = createGrass();
scene.add(grass);

const trees = createTrees();
scene.add(trees);

const rocks = createRocks();
scene.add(rocks);

const camp = createCamp(scene);

const water = createWater(renderer, scene);
scene.add(water.mesh);

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.5;
scene.add(sun);
scene.add(sun.target);

const hemi = new THREE.HemisphereLight(0xa8c8ee, 0x8d8166, 0.55);
scene.add(hemi);

// ---------------------------------------------------------------------------
// Post / time of day
// ---------------------------------------------------------------------------
const post = createPost(renderer, scene, camera);
const timeOfDay = new TimeOfDay({ sun, hemi, skyUniforms: sky.uniforms, scene, post });

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hud = (() => {
  const promptEl = document.getElementById('prompt');
  const statusEl = document.getElementById('status');
  const fadeEl = document.getElementById('fade');
  const hudEl = document.getElementById('hud');
  const hintEl = document.getElementById('hint');
  let statusTimer = null;
  setTimeout(() => { hintEl.style.opacity = '0'; hintEl.style.transition = 'opacity 2s'; }, 7000);
  return {
    setPrompt(t) { promptEl.textContent = t; },
    setStatus(t) {
      statusEl.textContent = t;
      statusEl.style.opacity = '0.95';
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { statusEl.style.opacity = '0'; }, 5000);
    },
    fade(dur, atBlack) {
      fadeEl.style.transition = `opacity ${dur}s ease`;
      fadeEl.style.opacity = '1';
      setTimeout(() => {
        atBlack?.();
        fadeEl.style.opacity = '0';
      }, dur * 1000 + 60);
    },
    setVisible(v) { hudEl.style.display = v ? '' : 'none'; },
  };
})();

// ---------------------------------------------------------------------------
// Player + interactions + debug
// ---------------------------------------------------------------------------
const player = new Player(camera, renderer.domElement);
const interactions = new Interactions({ camera, camp, player, timeOfDay, hud });
const debugAPI = installDebugAPI({ player, timeOfDay, camp, interactions, renderer, hud, scene, camera });

window.__FRAME = 0;
window.__APP_READY = false;

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let time = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  player.update(dt);
  timeOfDay.update(dt);
  interactions.update(dt, time);
  camp.update(dt, time);

  updateVegetation([grass, ...trees.children], time, camera.position);
  sky.uniforms.uTime.value = time;
  sky.mesh.position.copy(camera.position); // dome follows camera
  water.update(time, scene.fog, timeOfDay.sunDir, sun.color);

  // sun shadows follow the camera so the play area is always covered
  const sd = timeOfDay.sunDir;
  sun.position.set(camera.position.x + sd.x * 160, camera.position.y + sd.y * 160, camera.position.z + sd.z * 160);
  sun.target.position.copy(camera.position);

  post.update(time);
  debugAPI._tickFPS();
  renderer.info.reset(); // count ALL passes of this frame (autoReset is off)
  post.composer.render();

  window.__FRAME++;
  if (!window.__APP_READY) window.__APP_READY = true;

  requestAnimationFrame(animate);
}
animate();
