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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the world is mostly static — refresh the shadow map on a reduced cadence
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// Identify the GPU — if the browser is software-rendering WebGL (hardware
// acceleration off / blocklisted GPU), no amount of optimization will make
// high settings smooth, so we start at the floor and tell the player why.
let gpuName = 'unknown';
try {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
} catch {
  /* ignore */
}
const softwareGL = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(
  gpuName
);
console.info(`[brick-wars] GPU: "${gpuName}" — softwareRendering=${softwareGL}`);

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
let bloomEnabled = false;
if (!NO_BLOOM) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // threshold sits above the sunlit-sand luminance of the HDR buffer, so only
  // truly emissive surfaces bloom: the sword blade, spirits, and specular glints
  // (internal blur targets run at half resolution — visually identical, much cheaper)
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2)),
    0.55,
    0.4,
    2.0
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  bloomEnabled = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});

// ---------------------------------------------------------------------------
// Adaptive quality — the game watches its own frame time and moves between
// tiers so it stays smooth on weak GPUs. Each tier also carries an absolute
// pixel budget: a 4K laptop should never rasterize 8 megapixels of bricks.
// Override with ?quality=high|med|low.
// ---------------------------------------------------------------------------
const QUALITY_TIERS = [
  { name: 'high', pixelRatio: 1.25, maxPixels: 2.1e6, bloom: true, shadows: true, shadowEvery: 2 },
  { name: 'med', pixelRatio: 1.0, maxPixels: 1.45e6, bloom: true, shadows: true, shadowEvery: 3 },
  { name: 'low', pixelRatio: 0.8, maxPixels: 0.95e6, bloom: false, shadows: true, shadowEvery: 4 },
  // the floor: no shadows, no post, ~half-SD render scale — for software
  // rasterizers and very old iGPUs
  { name: 'potato', pixelRatio: 0.65, maxPixels: 0.55e6, bloom: false, shadows: false, shadowEvery: 0 },
];
const requestedTier = QUALITY_TIERS.findIndex((t) => t.name === params.get('quality'));
const qualityLocked = requestedTier >= 0;
// start at "med"; fast machines get promoted to "high" within a few seconds.
// software rendering goes straight to the floor.
let qualityIndex = qualityLocked ? requestedTier : softwareGL ? 3 : 1;
let frameEma = 1 / 60;
let qualityCooldown = 3; // ignore the noisy first seconds after load
let everSteppedDown = false;
let shadowsOn = true;

function applyQuality() {
  const t = QUALITY_TIERS[qualityIndex];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const budgetRatio = Math.sqrt(t.maxPixels / (w * h));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, t.pixelRatio, budgetRatio));
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  bloomEnabled = !NO_BLOOM && t.bloom;
  if (t.shadows !== shadowsOn) {
    shadowsOn = t.shadows;
    renderer.shadowMap.enabled = shadowsOn;
    // toggling shadows requires shader recompilation
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) m.needsUpdate = true;
    });
  }
  renderer.shadowMap.needsUpdate = shadowsOn;
}
applyQuality();

if (softwareGL && !qualityLocked) {
  const banner = document.getElementById('perf-banner');
  banner.hidden = false;
  setTimeout(() => {
    banner.hidden = true;
  }, 16000);
}

function updateQuality(rawDt) {
  if (qualityLocked) return;
  frameEma += (Math.min(rawDt, 0.25) - frameEma) * 0.05;
  qualityCooldown -= rawDt;
  if (qualityCooldown > 0) return;
  if (frameEma > 0.04 && qualityIndex < QUALITY_TIERS.length - 1) {
    // struggling: drop a tier
    qualityIndex++;
    everSteppedDown = true;
    applyQuality();
    qualityCooldown = 4;
    frameEma = 0.025;
  } else if (frameEma < 0.015 && qualityIndex > 0 && !everSteppedDown) {
    // clearly fast and never struggled: promote (med -> high)
    qualityIndex--;
    applyQuality();
    qualityCooldown = 5;
    frameEma = 0.02;
  }
}

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
hero.group.rotation.y = Math.PI; // face the diorama at spawn
scene.add(hero.group);

// soft blob shadow under the hero — shown only when real shadows are off
// (potato tier / software rendering) so the figure still feels grounded
const blobShadow = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(40,30,15,0.5)');
  grad.addColorStop(1, 'rgba(40,30,15,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();

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
    blobShadow.visible = !shadowsOn;
    if (blobShadow.visible) {
      blobShadow.position.set(
        controls.position.x,
        world.groundHeight(controls.position.x, controls.position.z) + 0.06,
        controls.position.z
      );
    }
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

let frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  acc += Math.min(0.1, rawDt);
  last = now;
  while (acc >= FIXED) {
    simulate(FIXED);
    acc -= FIXED;
  }
  frameCount++;
  const shadowEvery = QUALITY_TIERS[qualityIndex].shadowEvery;
  if (shadowEvery > 0 && frameCount % shadowEvery === 0) {
    renderer.shadowMap.needsUpdate = true;
  }
  if (composer && bloomEnabled) composer.render();
  else renderer.render(scene, camera);
  updateQuality(rawDt);
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
  /** advance the simulation deterministically (test environments render slowly) */
  step: (seconds) => {
    const n = Math.max(1, Math.round(seconds / FIXED));
    for (let i = 0; i < n; i++) simulate(FIXED);
  },
  info: () => ({
    state,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    spirits: `${spirits.collected}/${spirits.total}`,
    studs: smash.studsCollected,
    pos: controls.position.toArray().map((v) => +v.toFixed(2)),
    quality: QUALITY_TIERS[qualityIndex].name,
    frameEmaMs: +(frameEma * 1000).toFixed(1),
    gpu: gpuName,
    softwareGL,
  }),
  setQuality: (name) => {
    const i = QUALITY_TIERS.findIndex((t) => t.name === name);
    if (i >= 0) {
      qualityIndex = i;
      applyQuality();
    }
  },
};
