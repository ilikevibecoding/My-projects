// main.js — Brick Wars: Spirit Quest. Bootstraps the renderer, the diorama,
// the hero, and runs the title → playing → won state machine.
//
// Unofficial fan parody for personal, non-commercial use. All assets are
// original and generated procedurally at runtime.

import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

import { PALETTE } from './bricks.js';
import { buildWorld } from './world.js';
import { createMinifig } from './minifig.js';
import { PlayerControls } from './controls.js';
import { SpiritManager } from './spirits.js';
import { SmashManager } from './smash.js';
import { BuildSite } from './build.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const NO_BLOOM = params.has('nobloom');

// ---------------------------------------------------------------------------
// Error surface (helps debugging on any machine)
// ---------------------------------------------------------------------------
const errorBanner = document.getElementById('error-banner');
window.addEventListener('error', (e) => {
  errorBanner.hidden = false;
  errorBanner.textContent = `Error: ${e.message}`;
});

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8c8ee);

const camera = new THREE.PerspectiveCamera(
  58,
  window.innerWidth / window.innerHeight,
  0.1,
  900
);
camera.position.set(0, 16, 34);

// crisp plastic speculars from a studio-style environment
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

// post: subtle bloom for the sword, spirits and stud glints
let composer = null;
if (!NO_BLOOM) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0.45,
    0.82
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// World + actors
// ---------------------------------------------------------------------------
const world = buildWorld(scene);

const hero = createMinifig({
  torsoColor: PALETTE.white,
  legColor: PALETTE.blue,
  skinColor: PALETTE.yellow,
  sword: true,
  swordColor: 0x55ccff,
});
scene.add(hero.group);

const controls = new PlayerControls(canvas, world);
const hud = new Hud();
const audio = new GameAudio();

const spirits = new SpiritManager(scene, world, {
  onCollect: (n, total, s) => {
    hud.setSpirits(n, total);
    hud.showToast(
      n === total
        ? 'All spirits found!'
        : `A spirit joins you — ${s.spot.label ?? 'somewhere'} (${n}/${total})`
    );
    audio.spiritChime();
    if (n === total - 1 && !buildSite.bricksDone) {
      hud.setHint('The last spirit waits atop the mesa — find the rattling brick pile', 9000);
    }
    if (n === total) winSoon();
  },
});
hud.setSpirits(0, spirits.total);

const smash = new SmashManager(scene, world, {
  onStud: (n) => {
    hud.setStuds(n);
    audio.studTick();
  },
  onSmash: () => {
    audio.crateSmash();
  },
});

const buildSite = new BuildSite(scene, world, {
  onSnap: () => audio.brickSnap(),
  onComplete: () => {
    audio.buildComplete();
    hud.showToast('Staircase built! Climb to the last spirit');
  },
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
let state = 'title'; // title | playing | won
let playT = 0;
let winTimer = -1;

const titleScreen = document.getElementById('title-screen');
const playButton = document.getElementById('play-button');
const restartButton = document.getElementById('restart-button');

function startGame() {
  if (state !== 'title') return;
  state = 'playing';
  titleScreen.hidden = true;
  hud.show();
  hud.setHint('Find the glowing spirits scattered across the flats', 7000);
  audio.init();
  controls.enabled = true;
  controls.requestLock();
  controls.applyCamera(camera, 0, true);
}

playButton.addEventListener('click', startGame);
restartButton.addEventListener('click', () => location.reload());

canvas.addEventListener('click', () => {
  if (state === 'playing') {
    if (document.pointerLockElement !== canvas) controls.requestLock();
    else doSwing();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && state === 'playing') doSwing();
});

function doSwing() {
  hero.startSwing();
  audio.swing();
  // small delay so the hit lands mid-swing
  setTimeout(() => {
    if (state !== 'playing') return;
    const heading = Math.atan2(-Math.sin(controls.yaw), -Math.cos(controls.yaw));
    smash.trySmash(controls.position, heading);
  }, 130);
}

function winSoon() {
  winTimer = 1.6;
}

function doWin() {
  if (state !== 'playing') return;
  state = 'won';
  document.exitPointerLock?.();
  audio.winFanfare();
  hud.showWin({
    studs: smash.studsCollected,
    smashed: smash.smashed,
    seconds: playT,
  });
}

// ---------------------------------------------------------------------------
// Main loop (fixed timestep simulation, rendered every rAF)
// ---------------------------------------------------------------------------
const FIXED = 1 / 60;
let last = performance.now();
let acc = 0;
let elapsed = 0;

function simulate(dt) {
  elapsed += dt;

  if (state === 'title') {
    // slow showcase orbit around the diorama
    const a = elapsed * 0.07;
    camera.position.set(Math.sin(a) * 34, 15 + Math.sin(elapsed * 0.18) * 3, Math.cos(a) * 34);
    camera.lookAt(0, 3, 0);
    spirits.update(dt, _farAway, elapsed);
    return;
  }

  if (state === 'playing' || state === 'won') {
    if (state === 'playing') {
      playT += dt;
      controls.update(dt);
    }

    // hero follows the controls body
    hero.group.position.copy(controls.position);
    const targetHeading =
      controls.moveSpeed01 > 0.05 ? controls.heading : hero.group.rotation.y;
    hero.group.rotation.y = dampAngle(hero.group.rotation.y, targetHeading, 14, dt);
    hero.animate(dt, {
      speed: controls.moveSpeed01,
      grounded: controls.grounded,
    });

    spirits.update(dt, controls.position, elapsed);
    smash.update(dt, controls.position);

    const holdingE = controls.keys.has('KeyE');
    buildSite.update(dt, controls.position, holdingE && state === 'playing');
    const showPrompt = state === 'playing' && buildSite.inRange(controls.position);
    hud.setBuildPrompt(showPrompt, buildSite.progress);

    if (state === 'playing') controls.applyCamera(camera, dt);

    if (winTimer > 0) {
      winTimer -= dt;
      if (winTimer <= 0) doWin();
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= FIXED) {
    simulate(FIXED);
    acc -= FIXED;
  }
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

const _farAway = new THREE.Vector3(9999, 0, 9999);

function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

// ---------------------------------------------------------------------------
// Debug/test hook (used by the automated smoke test)
// ---------------------------------------------------------------------------
window.__bw = {
  get state() {
    return state;
  },
  renderer,
  scene,
  camera,
  world,
  controls,
  spirits,
  smash,
  buildSite,
  hero,
  start: startGame,
  collectSpirit: (i) => spirits.collectIndex(i),
  teleport: (x, z) => {
    controls.position.set(x, world.groundHeight(x, z), z);
  },
  pressKey: (code, down = true) => {
    if (down) {
      controls.keys.add(code);
      controls.justPressed.add(code);
    } else {
      controls.keys.delete(code);
    }
  },
  swing: doSwing,
  info: () => ({
    state,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    spirits: `${spirits.collected}/${spirits.total}`,
    studs: smash.studsCollected,
    pos: controls.position.toArray().map((v) => +v.toFixed(2)),
  }),
};
