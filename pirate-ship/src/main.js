// ---------------------------------------------------------------------------
// main.js — bootstrap + game loop.
// Fixed 60 Hz physics with an accumulator; rendering at display rate.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { ShipPhysics } from './physics.js';
import { PirateShip } from './ship.js';
import { Ocean } from './ocean.js';
import { SkyEnv } from './sky.js';
import { buildIslands } from './islands.js';
import { buildVegetation } from './vegetation.js';
import { Effects } from './effects.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';

const FIXED_DT = 1 / 60;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 12000);
camera.position.set(120, 14, 90);

// shared time uniform for swaying vegetation / flapping birds
const timeUniform = { value: 0 };

const env = new SkyEnv(scene, renderer);
const ocean = new Ocean(scene, env);
buildIslands(scene);
const veg = buildVegetation(scene, timeUniform);

const body = new ShipPhysics();
const ship = new PirateShip(scene);
const effects = new Effects(scene, timeUniform);
const hud = new Hud();
const controls = new Controls(body, camera, canvas, hud);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- game loop ----------------------------------------------------------------

let simTime = 0;
let accumulator = 0;
let last = performance.now();
let fps = 60;

function frame() {
  requestAnimationFrame(frame);
  // use performance.now() rather than the rAF timestamp: the latter can run
  // on a virtualised clock (throttled/headless tabs) and lose real time
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was hidden — don't spiral
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;

  controls.applyInput();
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    simTime += FIXED_DT;
    body.step(FIXED_DT, simTime);
    accumulator -= FIXED_DT;
  }

  timeUniform.value = simTime;
  ship.update(body, simTime, dt);
  controls.updateCamera(dt, simTime);
  ocean.update(simTime, body.pos.x, body.pos.z, camera.position);
  env.update(dt, ship.group.position, camera.position);
  effects.update(body, simTime, dt);
  hud.update(body, controls.yaw, dt);

  renderer.render(scene, camera);

  if (!window.__firstFrameDone) {
    window.__firstFrameDone = true;
    document.getElementById('loading')?.classList.add('hidden');
  }
}
requestAnimationFrame(frame);

// --- debug / test hook ----------------------------------------------------------

window.__game = {
  body,
  camera,
  renderer,
  scene,
  ocean,
  vegetationCount: veg.count,
  get fps() {
    return fps;
  },
  get state() {
    return {
      simTime,
      x: body.pos.x,
      y: body.pos.y,
      z: body.pos.z,
      heading: body.heading,
      speed: body.speed,
      sail: body.sailIndex,
      anchored: body.anchored,
      aground: body.aground,
      fps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
  setSail(i) {
    body.setSail(i);
  },
};
