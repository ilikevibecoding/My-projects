// main.js — bootstrap, phase state machine, fixed-step game loop, input,
// and window.debugAPI (deterministic views, teleports, telemetry runs).

import * as THREE from 'three';
import {
  CONST, PLANET_CENTER, createSimState, step, ignite, fireStage, canStage,
  altitudeOf, localUp, airDensity, telemetrySample, activeStage,
} from './physics.js';
import {
  DEFAULT_STACK, TWO_STAGE_STACK, stackFromIds, buildRocketGroup, setEngineGlow,
} from './rocket.js';
import { createWorld } from './planet.js';
import { createAtmosphere } from './atmosphere.js';
import { ExhaustSystem, createPlume, updatePlume, mulberry32 } from './effects.js';
import { CameraRig } from './camera.js';
import { createHUD } from './hud.js';
import { createPost } from './post.js';
import { createBuilder } from './builder.js';
import { createAudioEngine } from './audio.js';

// ---------------------------------------------------------------------------
// Renderer / scene scaffolding
// ---------------------------------------------------------------------------
const appEl = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r184
renderer.info.autoReset = false; // we reset once per frame to count ALL passes
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0e18'); // sky dome covers everything anyway

const SUN_DIR = new THREE.Vector3(0.52, 0.58, 0.42).normalize();
const sun = new THREE.DirectionalLight('#fff1d8', 3.4);
sun.position.copy(SUN_DIR).multiplyScalar(420);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 60; sun.shadow.camera.far = 1100;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.8;
scene.add(sun, sun.target);

const hemi = new THREE.HemisphereLight('#bcd9ff', '#5f8350', 0.65);
scene.add(hemi);
const amb = new THREE.AmbientLight('#3c4356', 0.25);
scene.add(amb);

// procedural sky environment map: gives the stainless-steel rocket (and all
// metals) something real to reflect — without it PBR metal reads as soot
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun;
      void main(){
        vec3 d = normalize(vDir);
        vec3 sky = mix(vec3(0.62,0.70,0.80), vec3(0.30,0.50,0.92), smoothstep(-0.05,0.55,d.y));
        vec3 ground = vec3(0.30,0.42,0.24);
        vec3 col = mix(ground, sky, smoothstep(-0.10,0.04,d.y));
        col += vec3(1.25,1.05,0.78) * pow(max(dot(d, uSun), 0.0), 48.0) * 2.4; // sun hotspot
        col += vec3(0.9,0.8,0.62) * pow(max(dot(d, uSun), 0.0), 6.0) * 0.35;  // warm halo
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), envMat));
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
}

const rig = new CameraRig(window.innerWidth, window.innerHeight);
const world = createWorld(scene);
const atmo = createAtmosphere(scene, SUN_DIR);
const exhaust = new ExhaustSystem(scene, 1337);
const post = createPost(renderer, scene, rig.camera, window.innerWidth, window.innerHeight);
const hud = createHUD();
const audio = createAudioEngine();
rig.attachControls(renderer.domElement);

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = {
  mode: 'builder',            // builder | flight
  sim: null,
  rocket: null,               // result of buildRocketGroup
  plumes: [],                 // { group, stageIndex }
  debrisVisuals: new Map(),   // stageIndex -> THREE.Group
  input: { tiltX: 0, tiltZ: 0, throttle: 1 },
  flightRng: mulberry32(4242),
  eventCursor: 0,
  simTime: 0,
  accumulator: 0,
  countdown: null,            // seconds left in the 3-2-1 (null = no countdown)
  countdownShown: 0,          // last number flashed
  placeAnchor: null,          // builder seam (gap) index: insert exactly there.
                              // 0 = very bottom, stack.length = on top, null = auto
  debugPaused: false,
  frameMs: [],
  lastDrawCalls: 0,
  // fixed-step render interpolation: the sim advances in 1/120s chunks, but
  // frames land between steps. Rendering the raw step state makes the rocket
  // judder against the smoothed camera (2.5 m per step at 300 m/s!), so we
  // blend prev -> current step state by the accumulator fraction.
  prevPos: new THREE.Vector3(),
  prevAxis: new THREE.Vector3(0, 1, 0),
  renderPos: new THREE.Vector3(),
  renderAxis: new THREE.Vector3(0, 1, 0),
};

// adopt a fresh sim state: sync interpolation buffers + drop stale time debt
function adoptSim(sim) {
  game.sim = sim;
  game.accumulator = 0;
  if (sim) {
    game.prevPos.copy(sim.pos);
    game.prevAxis.copy(sim.axis);
    game.renderPos.copy(sim.pos);
    game.renderAxis.copy(sim.axis);
  }
}

const BASE_OFFSET = world.rocketBaseY; // rocket base rides this high above alt=0

const _up = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function rocketBasePos(out = new THREE.Vector3()) {
  const p = game.sim ? game.renderPos : _v1.set(0, 0, 0);
  localUp(p, _v2);
  return out.copy(p).addScaledVector(_v2, BASE_OFFSET);
}

function rocketCenterPos(out = new THREE.Vector3()) {
  rocketBasePos(out);
  if (game.rocket && game.sim) out.addScaledVector(game.renderAxis, game.rocket.height / 2);
  else if (game.rocket) out.add(_v1.set(0, game.rocket.height / 2, 0));
  return out;
}

// ---------------------------------------------------------------------------
// Rocket assembly / placement
// ---------------------------------------------------------------------------
function clearRocketVisuals() {
  if (game.rocket) scene.remove(game.rocket.group);
  for (const g of game.debrisVisuals.values()) scene.remove(g);
  game.debrisVisuals.clear();
  game.plumes = [];
  game.rocket = null;
}

function buildAndPlaceRocket(stackIds) {
  clearRocketVisuals();
  const rocket = buildRocketGroup(stackFromIds(stackIds));
  rocket.group.position.set(0, BASE_OFFSET, 0);
  scene.add(rocket.group);
  game.rocket = rocket;
  for (const nz of rocket.nozzles) {
    const plume = createPlume(nz.exitRadius);
    plume.position.set(nz.local.x, nz.local.y + 0.03, nz.local.z);
    rocket.stageGroups[nz.stageIndex].add(plume);
    game.plumes.push({ group: plume, stageIndex: nz.stageIndex, nozzle: nz });
  }
}

const builder = createBuilder({
  onStackChange: (ids) => {
    if (game.mode === 'builder') { buildAndPlaceRocket(ids); refreshAnchorMarker(); }
  },
  onLaunch: () => startFlight(),
  getInsertAnchor: () => game.placeAnchor,
  onInserted: (at) => {
    // keep building upward from the spot the player picked: the seam moves
    // to just above the part that was placed
    if (game.placeAnchor !== null) { game.placeAnchor = at + 1; refreshAnchorMarker(); }
  },
});

// ---- builder placement anchor (right-click a stacked part to pick the spot)
const anchorMarker = new THREE.Mesh(
  new THREE.TorusGeometry(0.95, 0.055, 10, 36),
  new THREE.MeshBasicMaterial({ color: '#19e3c2', transparent: true, opacity: 0.9 }),
);
anchorMarker.rotation.x = Math.PI / 2;
anchorMarker.renderOrder = 20;

const builderHintEl = document.getElementById('builder-hint');
const BUILDER_HINT_DEFAULT = builderHintEl ? builderHintEl.textContent : '';

function refreshAnchorMarker() {
  anchorMarker.removeFromParent();
  if (game.placeAnchor === null || game.mode !== 'builder' || !game.rocket) {
    if (builderHintEl) builderHintEl.textContent = BUILDER_HINT_DEFAULT;
    return;
  }
  const entries = game.rocket.partEntries;
  const len = builder.stackIds.length;
  const gap = THREE.MathUtils.clamp(game.placeAnchor, 0, len);
  game.placeAnchor = gap;
  // marker sits at the seam: bottom of the part currently at `gap`,
  // or on top of the whole stack
  let y;
  if (gap >= len) y = game.rocket.height + 0.06;
  else y = (entries.find((e) => e.stackIndex === gap)?.yBottom ?? 0) + 0.03;
  anchorMarker.position.set(0, Math.max(0.05, y), 0);
  game.rocket.group.add(anchorMarker);
  if (builderHintEl) {
    const below = gap > 0 ? entries.find((e) => e.stackIndex === gap - 1)?.part.name : null;
    const above = gap < len ? entries.find((e) => e.stackIndex === gap)?.part.name : null;
    let where;
    if (!below) where = 'adding at the very bottom (booster goes here)';
    else if (!above) where = 'adding on top of the stack';
    else where = `adding between ${below.toLowerCase()} and ${above.toLowerCase()}`;
    builderHintEl.textContent = `${where} · right-click empty space to clear`;
  }
}

function setPlaceAnchor(idx) {
  game.placeAnchor = idx;
  refreshAnchorMarker();
}

function enterBuilder() {
  game.mode = 'builder';
  adoptSim(null);
  game.eventCursor = 0;
  game.countdown = null;
  exhaust.reset();
  buildAndPlaceRocket(builder.stackIds);
  refreshAnchorMarker();
  hud.showBuilder();
  rig.mode = 'orbit';
  rig.resetManual();
  rig.snapOrbit(game.simTime, game.rocket ? game.rocket.height : 8);
}

function startFlight(stackIds = builder.stackIds) {
  game.mode = 'flight';
  game.eventCursor = 0;
  game.countdown = null;
  game.placeAnchor = null;
  game.flightRng = mulberry32(4242);
  exhaust.reset();
  buildAndPlaceRocket(stackIds);
  adoptSim(createSimState(stackFromIds(stackIds)));
  game.input.tiltX = 0; game.input.tiltZ = 0;
  hud.showFlight(); // also resets the key hint to the default
  rig.mode = 'chase';
  rig.resetManual();
  const c = rocketCenterPos(new THREE.Vector3());
  localUp(c, _v2);
  const camPos = c.clone().addScaledVector(new THREE.Vector3(0.62, 0, 0.78), 22).addScaledVector(_v2, 4);
  rig.snapTo(camPos, c);
}

function doIgnite() {
  if (!game.sim || game.sim.ignited) return;
  ignite(game.sim);
}

function doStage() {
  if (!game.sim || !canStage(game.sim)) return;
  const idx = game.sim.stages.findIndex((s) => s.attached);
  const debris = fireStage(game.sim, game.flightRng);
  if (!debris) return;
  const sg = game.rocket.stageGroups[idx];
  scene.attach(sg);                 // keep world transform
  game.debrisVisuals.set(idx, sg);
  // kill the detached stage's plume
  for (const pl of game.plumes) {
    if (pl.stageIndex === idx) {
      updatePlume(pl.group, { time: game.simTime, throttle: 0, rho: 1, rho0: CONST.rho0 });
    }
  }
  setEngineGlow(sg, 0);
  hud.flash('STAGE SEPARATION');
  // the fresh stage is cold — tell the pilot how to light it
  if (!game.sim.ignited) hud.setHint('stage separated — space to ignite the next rocket');
  audio.stage();
}

// ---------------------------------------------------------------------------
// Event stream -> HUD/visual reactions
// ---------------------------------------------------------------------------
function processEvents() {
  const sim = game.sim;
  if (!sim) return;
  while (game.eventCursor < sim.events.length) {
    const ev = sim.events[game.eventCursor++];
    switch (ev.type) {
      case 'ignition': {
        hud.flash('IGNITION');
        audio.ignition();
        if (altitudeOf(sim.pos) < 8) {
          exhaust.igniteDust(rocketBasePos(_v1), world.padTopY + 0.1);
        } else if (!sim.spaceReached) {
          hud.resetHint(); // upper stage lit: back to the standard hints
        }
        break;
      }
      case 'liftoff': hud.flash('LIFTOFF'); audio.liftoff(); break;
      case 'flameout': {
        hud.flash('MAIN ENGINE CUTOFF');
        audio.flameout();
        if (canStage(sim)) hud.setHint('booster empty — space to decouple');
        break;
      }
      case 'space': {
        hud.banner('space');
        hud.setHint('space reached — flip with arrows + fly the map, or revert');
        audio.spaceReached();
        // celebration fireworks around the rocket
        const c = rocketCenterPos(new THREE.Vector3());
        localUp(game.renderPos, _v2);
        exhaust.fireworks(c, _v2.clone());
        break;
      }
      case 'crash': {
        exhaust.crashPoof(rocketCenterPos(_v1));
        if (game.rocket) game.rocket.group.visible = false;
        hud.banner('crash');
        audio.crash();
        break;
      }
      case 'landed': hud.flash('TOUCHDOWN'); audio.debrisThud(); break;
      case 'debrisDown': {
        const g = game.debrisVisuals.get(parseInt(ev.id.replace('stage', ''), 10));
        if (g) {
          exhaust.crashPoof(g.position.clone());
          scene.remove(g);
          audio.debrisThud();
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-frame world stepping (also used, unrendered, by debug warm-up)
// ---------------------------------------------------------------------------
function buildExhaustCtx() {
  const sim = game.sim;
  if (!sim || !game.rocket || sim.phase === 'crashed') return null;
  const alt = altitudeOf(sim.pos);
  const base = rocketBasePos(new THREE.Vector3());
  const nozzles = [];
  const stageIdx = sim.stages.findIndex((s) => s.attached);
  _q1.setFromUnitVectors(Y_AXIS, game.renderAxis); // same frame as the visuals
  for (const pl of game.plumes) {
    if (pl.stageIndex !== stageIdx) continue;
    nozzles.push({
      pos: base.clone().add(pl.nozzle.local.clone().applyQuaternion(_q1)),
      dir: game.renderAxis.clone().multiplyScalar(-1),
      exitRadius: pl.nozzle.exitRadius,
    });
  }
  return {
    nozzles,
    throttle: sim.throttle,
    rho: airDensity(alt),
    rho0: CONST.rho0,
    rocketVel: sim.vel,
    groundAlt: alt,
    padY: world.padTopY + 0.1,
  };
}

function updateRocketTransforms() {
  if (!game.rocket) return;
  if (game.sim) {
    rocketBasePos(game.rocket.group.position);
    game.rocket.group.quaternion.setFromUnitVectors(Y_AXIS, game.renderAxis);
  }
  // debris
  if (game.sim) {
    for (const d of game.sim.debris) {
      const g = game.debrisVisuals.get(d.stageIndex);
      if (!g || !d.alive) continue;
      localUp(d.pos, _v2);
      g.position.copy(d.pos).addScaledVector(_v2, BASE_OFFSET);
      _q1.setFromUnitVectors(Y_AXIS, d.axis);
      _q2.setFromAxisAngle(d.spinAxis, d.spin);
      g.quaternion.copy(_q2).multiply(_q1);
    }
  }
}

function stepWorld(dt) {
  game.simTime += dt;
  const sim = game.sim;
  // 3-2-1 launch countdown (Space again skips straight to ignition)
  if (game.countdown !== null && game.mode === 'flight' && sim && !sim.ignited) {
    game.countdown -= dt;
    const n = Math.ceil(game.countdown);
    if (n !== game.countdownShown && n > 0) {
      game.countdownShown = n;
      hud.flash(String(n));
      audio.countBeep(n);
    }
    if (game.countdown <= 0) {
      game.countdown = null;
      audio.countBeep(0);
      doIgnite();
    }
  } else if (game.countdown !== null) {
    game.countdown = null; // mode changed / already ignited
  }
  if (game.mode === 'flight' && sim && sim.phase !== 'crashed') {
    game.accumulator = Math.min(game.accumulator + dt, 0.3);
    while (game.accumulator >= CONST.DT) {
      game.prevPos.copy(sim.pos);
      game.prevAxis.copy(sim.axis);
      step(sim, game.input, CONST.DT);
      game.accumulator -= CONST.DT;
    }
    // interpolated state for everything visual (rocket, camera target, fx)
    const alpha = THREE.MathUtils.clamp(game.accumulator / CONST.DT, 0, 1);
    game.renderPos.copy(game.prevPos).lerp(sim.pos, alpha);
    game.renderAxis.copy(game.prevAxis).lerp(sim.axis, alpha).normalize();
  } else if (sim) {
    game.renderPos.copy(sim.pos);
    game.renderAxis.copy(sim.axis);
  }
  processEvents();
  updateRocketTransforms();
  const ctx = buildExhaustCtx();
  exhaust.advance(dt, ctx);
  world.update(game.simTime);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function updateVisualsAndRender(dt) {
  renderer.info.reset();
  const sim = game.sim;
  // camera
  if (rig.mode === 'fixed') {
    rig.updateFixed(dt);
  } else if (game.mode === 'builder') {
    rig.updateOrbit(dt, game.simTime, game.rocket ? game.rocket.height : 8);
  } else if (sim) {
    const center = rocketCenterPos(new THREE.Vector3());
    localUp(game.renderPos, _v2);
    rig.updateChase(dt, { pos: center, vel: sim.vel, up: _v2.clone() });
  }
  rig.camera.updateMatrixWorld();

  const camAlt = Math.max(0, altitudeOf(rig.camera.position));
  atmo.update(rig.camera, camAlt, game.simTime);
  hemi.intensity = THREE.MathUtils.lerp(0.65, 0.16, THREE.MathUtils.smoothstep(camAlt, 1500, CONST.SPACE_ALT));
  amb.intensity = THREE.MathUtils.lerp(0.25, 0.14, THREE.MathUtils.smoothstep(camAlt, 1500, CONST.SPACE_ALT));
  renderer.shadowMap.autoUpdate = camAlt < 2500;

  // plumes + engine glow
  if (sim && game.rocket) {
    const alt = altitudeOf(sim.pos);
    const rho = airDensity(alt);
    const stageIdx = sim.stages.findIndex((s) => s.attached);
    for (const pl of game.plumes) {
      const active = pl.stageIndex === stageIdx && sim.phase !== 'crashed';
      updatePlume(pl.group, {
        time: game.simTime,
        throttle: active ? sim.throttle : 0,
        rho, rho0: CONST.rho0,
      });
    }
    // glow only the engines of the active (thrusting) stage
    game.rocket.stageGroups.forEach((sg, i) => {
      setEngineGlow(sg, i === stageIdx && sim.throttle > 0 ? 2.4 : 0);
    });
    // HUD readouts
    const st = activeStage(sim);
    const fuelFrac = st && st.fuelMax > 0 ? st.fuel / st.fuelMax : 0;
    hud.setReadouts(alt, sim.vel.length(), fuelFrac);
    // engine roar + wind rush follow throttle / air density / speed
    audio.setFlightLoop({
      throttle: sim.phase !== 'crashed' && sim.ignited ? sim.throttle : 0,
      atmo: Math.min(1, rho / CONST.rho0),
      speed: sim.vel.length(),
    });
  } else {
    audio.setFlightLoop({ throttle: 0, atmo: 1, speed: 0 });
  }

  exhaust.sync(rig.camera);
  post.render(dt);
  game.lastDrawCalls = renderer.info.render.calls;
  game.lastTriangles = renderer.info.render.triangles;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!game.debugPaused) {
    stepWorld(dt);
    updateVisualsAndRender(dt);
  } else {
    updateVisualsAndRender(0);
  }
  game.frameMs.push(performance.now() - now);
  if (game.frameMs.length > 90) game.frameMs.shift();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
// browsers only allow audio after a user gesture; unlock on the first one
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
window.addEventListener('keydown', () => audio.unlock(), { capture: true });

const soundBtn = document.getElementById('sound-btn');
function refreshSoundBtn() {
  soundBtn.textContent = audio.muted ? '🔇' : '🔊';
  soundBtn.classList.toggle('muted', audio.muted);
}
soundBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMuted(); refreshSoundBtn(); });
refreshSoundBtn();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (game.mode === 'flight' && game.sim) {
        if (!game.sim.ignited) {
          if (game.sim.onGround && game.countdown === null) {
            // pad launch: 3-2-1 countdown; pressing Space again skips it
            game.countdown = 3.0;
            game.countdownShown = 3;
            hud.flash('3');
            audio.countBeep(3);
          } else {
            // skip the countdown, or relight the next stage mid-flight
            game.countdown = null;
            doIgnite();
          }
        } else {
          doStage();
        }
      }
      break;
    case 'ArrowLeft': game.input.tiltZ = 1; e.preventDefault(); break;
    case 'ArrowRight': game.input.tiltZ = -1; e.preventDefault(); break;
    case 'ArrowUp': game.input.tiltX = -1; e.preventDefault(); break;
    case 'ArrowDown': game.input.tiltX = 1; e.preventDefault(); break;
    case 'KeyM': audio.toggleMuted(); refreshSoundBtn(); break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft': case 'ArrowRight': game.input.tiltZ = 0; break;
    case 'ArrowUp': case 'ArrowDown': game.input.tiltX = 0; break;
  }
});

// builder mouse picking:
//   left-click a stacked part  -> remove it
//   right-CLICK a stacked part -> set the insertion anchor ("add above this")
//   right-click empty space    -> clear the anchor
// (right-DRAG stays camera orbit — we only treat tiny-movement releases as clicks)
const raycaster = new THREE.Raycaster();

// skipFins: fin blades fan out and visually wrap the bottom engine, so for
// seam PICKING we prefer the body/engine behind them (players aiming "at the
// bottom" mean the engine, not the fin). Removal clicks keep fins targetable.
function pickPartEntry(e, { skipFins = false } = {}) {
  if (game.mode !== 'builder' || !game.rocket) return null;
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, rig.camera);
  const hits = raycaster.intersectObject(game.rocket.group, true);
  let finsPick = null;
  for (const hit of hits) {
    let o = hit.object;
    while (o && !o.userData.partEntry) o = o.parent;
    if (o && o.userData.partEntry) {
      // resolve to the FULL entry (with yBottom/yTop) — the mesh userData
      // only carries a slim {part, stackIndex} reference
      const slim = o.userData.partEntry;
      const entry = game.rocket.partEntries.find((p) => p.stackIndex === slim.stackIndex) ?? slim;
      // height of the hit in rocket-local space (group sits upright in builder)
      const localY = hit.point.y - game.rocket.group.position.y;
      const pick = { entry, localY };
      if (skipFins && entry.part.type === 'fins') {
        finsPick = finsPick ?? pick;     // fall back to it if nothing better
        continue;
      }
      return pick;
    }
  }
  return finsPick;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const pick = pickPartEntry(e);
  if (!pick) return;
  const removedIdx = pick.entry.stackIndex;
  // keep the anchor seam at the same physical spot after the removal
  if (game.placeAnchor !== null && removedIdx < game.placeAnchor) game.placeAnchor -= 1;
  builder.removeAt(removedIdx);
  audio.uiRemove();
});

// right-click pick: only fires when the pointer barely moved (else it's orbit)
let rcStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 2) rcStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 2 || !rcStart) return;
  const moved = Math.hypot(e.clientX - rcStart.x, e.clientY - rcStart.y);
  const held = performance.now() - rcStart.t;
  rcStart = null;
  if (moved > 6 || held > 600) return;            // was an orbit drag
  if (game.mode !== 'builder') return;
  const pick = pickPartEntry(e, { skipFins: true });
  if (pick) {
    // click the LOWER half of a part -> seam below it (booster goes there!);
    // upper half -> seam above it. Judged in SCREEN space so it matches what
    // the player sees regardless of the camera's viewing angle.
    const { entry } = pick;
    const sb = projectStackY(entry.yBottom);
    const st = projectStackY(entry.yTop);
    const midScreen = (sb + st) / 2;   // clientY grows downward
    setPlaceAnchor(e.clientY > midScreen ? entry.stackIndex : entry.stackIndex + 1);
    audio.uiClick();
  } else {
    setPlaceAnchor(null);
  }
});

// screen-pixel Y of a height on the rocket's center axis (builder mode)
function projectStackY(localY) {
  game.rocket.group.updateMatrixWorld(true);
  rig.camera.updateMatrixWorld(true);
  const p = new THREE.Vector3(0, localY, 0)
    .applyMatrix4(game.rocket.group.matrixWorld)
    .project(rig.camera);
  return ((1 - p.y) / 2) * window.innerHeight;
}

// UI blips (palette add-clicks, launch, revert) — DOM-level so builder.js
// stays audio-agnostic
document.getElementById('palette').addEventListener('click', (e) => {
  if (e.target.closest('.part-card')) audio.uiClick();
});
document.getElementById('launch-btn').addEventListener('click', () => audio.launchWhoosh());
document.getElementById('revert-btn').addEventListener('click', () => audio.uiClick());

hud.onRevert(() => enterBuilder());

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// debugAPI — deterministic views + telemetry for the screenshot/eval loop
// ---------------------------------------------------------------------------
function guessAscentSpeed(alt) {
  return Math.min(250, 30 + alt * 0.042);
}

// Step the live game world WITHOUT rendering until the rocket hits targetAlt.
function warmFlight({ stackIds = DEFAULT_STACK, startAlt = 0, startSpeed = 0, targetAlt = null, throttleOn = true, maxSim = 45, extraSeconds = 0 }) {
  hud.setSuppressFlash(true);
  game.mode = 'flight';
  game.eventCursor = 0;
  game.flightRng = mulberry32(4242);
  exhaust.reset();
  buildAndPlaceRocket(stackIds);
  adoptSim(createSimState(stackFromIds(stackIds)));
  if (startAlt > 0) {
    game.sim.pos.set(0, startAlt, 0);
    game.sim.vel.set(0, startSpeed, 0);
    game.sim.onGround = false;
    game.sim.phase = 'flying';
    if (startAlt >= CONST.SPACE_ALT) { game.sim.spaceReached = true; game.sim.phase = 'space'; }
    adoptSim(game.sim); // re-sync interpolation buffers to the teleport
  }
  hud.showFlight();
  if (throttleOn) doIgnite();
  const frame = 1 / 60;
  let t = 0;
  while (t < maxSim) {
    stepWorld(frame);
    t += frame;
    if (targetAlt !== null && altitudeOf(game.sim.pos) >= targetAlt) break;
    if (game.sim.phase === 'crashed') break;
  }
  for (let i = 0; i < Math.round(extraSeconds * 60); i++) stepWorld(frame);
  hud.setSuppressFlash(false);
  return altitudeOf(game.sim.pos);
}

function debugViewContext() {
  const center = rocketCenterPos(new THREE.Vector3());
  const base = rocketBasePos(new THREE.Vector3());
  const up = localUp(game.sim ? game.sim.pos : new THREE.Vector3(), new THREE.Vector3());
  return { rocketCenter: center, rocketBase: base, up, height: game.rocket ? game.rocket.height : 8 };
}

const debugAPI = {
  setView(name) {
    game.debugPaused = false;
    switch (name) {
      case 'builder': {
        enterBuilder();
        game.simTime = 9.2; // deterministic orbit angle
        rig.mode = 'orbit';
        rig.updateOrbit(10, game.simTime, game.rocket.height); // converge instantly-ish
        for (let i = 0; i < 60; i++) rig.updateOrbit(1 / 10, game.simTime, game.rocket.height);
        break;
      }
      case 'pad': {
        game.mode = 'flight';
        game.eventCursor = 0;
        exhaust.reset();
        buildAndPlaceRocket(DEFAULT_STACK);
        adoptSim(createSimState(stackFromIds(DEFAULT_STACK)));
        hud.showFlight();
        rig.applyDebugView('pad', debugViewContext());
        break;
      }
      case 'liftoff': {
        warmFlight({ startAlt: 0, targetAlt: 16, maxSim: 30 });
        rig.applyDebugView('liftoff', debugViewContext());
        break;
      }
      case 'midair': {
        warmFlight({ startAlt: 640, startSpeed: guessAscentSpeed(640), targetAlt: 960, maxSim: 25 });
        rig.applyDebugView('midair', debugViewContext());
        break;
      }
      case 'high_altitude': {
        warmFlight({ startAlt: 3450, startSpeed: guessAscentSpeed(3450), targetAlt: 3850, maxSim: 25 });
        rig.applyDebugView('high_altitude', debugViewContext());
        break;
      }
      case 'space': {
        // start below the line so the SPACE REACHED banner fires during warm-up
        warmFlight({ startAlt: 4700, startSpeed: 225, targetAlt: 5450, maxSim: 25 });
        rig.applyDebugView('space', debugViewContext());
        break;
      }
      case 'staging': {
        warmFlight({ stackIds: TWO_STAGE_STACK, startAlt: 2250, startSpeed: 145, targetAlt: 2420, maxSim: 25 });
        hud.setSuppressFlash(true);
        doStage();
        doIgnite(); // scripted view: relight immediately so the shot shows both
        for (let i = 0; i < 60; i++) stepWorld(1 / 60);
        hud.setSuppressFlash(false);
        rig.applyDebugView('staging', debugViewContext());
        break;
      }
      default:
        return `unknown view: ${name}`;
    }
    updateVisualsAndRender(0);
    game.debugPaused = true;
    return name;
  },

  setState({ phase = 'flight', altitude = 0, throttle = 1 } = {}) {
    game.debugPaused = false;
    if (phase === 'builder') { enterBuilder(); game.debugPaused = true; return; }
    if (phase === 'pad' || altitude <= 0) {
      this.setView('pad');
      if (throttle > 0) { doIgnite(); for (let i = 0; i < 30; i++) stepWorld(1 / 60); }
      game.debugPaused = true;
      return;
    }
    warmFlight({
      startAlt: Math.max(0, altitude - 160),
      startSpeed: guessAscentSpeed(altitude),
      targetAlt: altitude,
      throttleOn: throttle > 0,
      maxSim: 30,
      extraSeconds: throttle > 0 ? 0 : 1.2,
    });
    rig.mode = 'chase';
    const center = rocketCenterPos(new THREE.Vector3());
    localUp(game.sim.pos, _v2);
    rig.snapTo(center.clone().addScaledVector(new THREE.Vector3(0.62, 0, 0.78), 20).addScaledVector(_v2, 3), center);
    updateVisualsAndRender(0);
    game.debugPaused = true;
  },

  // re-apply a named debug view's camera for the CURRENT rocket position
  // (used to keep framing comparable after tick())
  reframe(name) {
    rig.applyDebugView(name, debugViewContext());
    updateVisualsAndRender(0);
  },

  // advance exact sim seconds (deterministic), then render
  tick(seconds = 1) {
    const wasPaused = game.debugPaused;
    game.debugPaused = false;
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) stepWorld(1 / 60);
    updateVisualsAndRender(1 / 60);
    game.debugPaused = wasPaused || true;
  },

  // pure-physics scripted flights, no rendering — fast + honest
  runTelemetry(scenario = 'main') {
    const configs = {
      main: { stack: DEFAULT_STACK, fuelFraction: 1, maxT: 130 },
      lowtwr: { stack: ['engineSmall', 'tankLarge', 'pod'], fuelFraction: 1, maxT: 45 },
      coast: { stack: ['engineSmall', 'fins', 'tankSmall', 'pod'], fuelFraction: 0.10, maxT: 240 },
      staged: { stack: TWO_STAGE_STACK, fuelFraction: 1, maxT: 130, stageAtAlt: 2200 },
    };
    const cfg = configs[scenario];
    if (!cfg) return { error: `unknown scenario ${scenario}` };
    const st = createSimState(stackFromIds(cfg.stack), { fuelFraction: cfg.fuelFraction });
    const rng = mulberry32(777);
    ignite(st);
    const samples = [telemetrySample(st)];
    let nextSample = 1;
    let staged = false;
    while (st.t < cfg.maxT) {
      step(st, { throttle: 1 }, CONST.DT);
      if (cfg.stageAtAlt && !staged && altitudeOf(st.pos) >= cfg.stageAtAlt && canStage(st)) {
        fireStage(st, rng);
        ignite(st); // scripted pilot relights the upper stage right away
        staged = true;
      }
      if (st.t >= nextSample) {
        samples.push(telemetrySample(st));
        nextSample += 1;
      }
      if (st.phase === 'crashed') break;
      if (scenario !== 'coast' && st.spaceReached) break;
    }
    samples.push(telemetrySample(st));
    return { scenario, samples, events: st.events.map((e) => ({ ...e, t: +e.t.toFixed(2) })) };
  },

  loadDefaultRocket() { builder.setStack(DEFAULT_STACK); },
  launch() { startFlight(); },
  stage() { doStage(); },
  pause(v = true) { game.debugPaused = v; },

  renderState() {
    // interpolation sanity: renderPos must sit between prev and current step
    const alpha = THREE.MathUtils.clamp(game.accumulator / CONST.DT, 0, 1);
    const expect = game.prevPos.clone().lerp(game.sim ? game.sim.pos : game.prevPos, alpha);
    // where the rocket center lands on screen (NDC; 0,0 = dead-center)
    const ndc = rocketCenterPos(new THREE.Vector3()).project(rig.camera);
    return {
      alpha: +alpha.toFixed(4),
      lerpError: +game.renderPos.distanceTo(expect).toFixed(6),
      stepGap: game.sim ? +game.prevPos.distanceTo(game.sim.pos).toFixed(3) : 0,
      fov: +rig.camera.fov.toFixed(2),
      screenX: +ndc.x.toFixed(3),
      screenY: +ndc.y.toFixed(3),
    };
  },

  cameraInfo() {
    return {
      pos: rig.camera.position.toArray().map((v) => +v.toFixed(2)),
      userYaw: +rig.userYaw.toFixed(4),
      userPitch: +rig.userPitch.toFixed(4),
      userZoom: +rig.userZoom.toFixed(4),
      mode: rig.mode,
    };
  },

  audioStats() { return audio.stats(); },

  frameStats() {
    const ms = game.frameMs;
    const avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
    return {
      drawCalls: game.lastDrawCalls,
      triangles: game.lastTriangles,
      frameMsAvg: +avg.toFixed(2),
      particles: exhaust.counts(),
      renderer: 'note: headless CI uses SwiftShader; ms not representative of real GPUs',
    };
  },

  getState() {
    if (!game.sim) return { mode: game.mode };
    const sim = game.sim;
    localUp(sim.pos, _v2);
    const downrange = Math.acos(THREE.MathUtils.clamp(_v2.y, -1, 1)) * CONST.R;
    return {
      mode: game.mode,
      ...telemetrySample(sim),
      ignited: sim.ignited,
      countdown: game.countdown === null ? null : +game.countdown.toFixed(2),
      axisUpDot: +sim.axis.dot(_v2).toFixed(3),  // 1 = nose up, -1 = flipped
      tiltX: +sim.tiltX.toFixed(3),
      tiltZ: +sim.tiltZ.toFixed(3),
      downrange: +downrange.toFixed(1),          // great-circle metres from pad
    };
  },

  builderInfo() {
    return { stackIds: builder.stackIds, anchor: game.placeAnchor };
  },

  // screen pixel coords of a point `frac` of the way up a stacked part —
  // lets tests right-click exactly where a player would
  partScreenPoint(stackIndex, frac = 0.5) {
    if (!game.rocket) return null;
    const e = game.rocket.partEntries.find((p) => p.stackIndex === stackIndex);
    if (!e) return null;
    game.rocket.group.updateMatrixWorld(true);
    rig.camera.updateMatrixWorld(true);
    const p = new THREE.Vector3(0, e.yBottom + (e.yTop - e.yBottom) * frac, 0)
      .applyMatrix4(game.rocket.group.matrixWorld)
      .project(rig.camera);
    return {
      x: Math.round(((p.x + 1) / 2) * window.innerWidth),
      y: Math.round(((1 - p.y) / 2) * window.innerHeight),
    };
  },

  rocketInfo() {
    if (!game.rocket) return null;
    return {
      height: +game.rocket.height.toFixed(2),
      nozzles: game.rocket.nozzles.length,
      stages: game.rocket.stageGroups.map((sg, i) => ({
        stage: i,
        children: sg.children.length,
        hasInterstage: !!sg.getObjectByName('interstage'),
        detached: game.debrisVisuals.has(i),
      })),
    };
  },
};
window.debugAPI = debugAPI;

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------
enterBuilder();

// Pre-warm every particle/plume pipeline with one hidden frame so the first
// ignition doesn't trigger driver-side pipeline builds (a hitch — or worse —
// on some real GPUs when space is first pressed).
(function prewarmPipelines() {
  const p = new THREE.Vector3(0, BASE_OFFSET + 2, 0);
  const spec = { pos: p, life: 1, opacity0: 0.012, size0: 0.5, size1: 0.5 };
  exhaust.flames.spawn(spec);
  exhaust.smoke.spawn(spec);
  exhaust.dust.spawn(spec);
  exhaust.poofs.spawn(spec);
  exhaust.stars.spawn(spec);
  for (const pl of game.plumes) {
    updatePlume(pl.group, { time: 0, throttle: 0.04, rho: CONST.rho0, rho0: CONST.rho0 });
  }
  updateVisualsAndRender(0);
  for (const pl of game.plumes) {
    updatePlume(pl.group, { time: 0, throttle: 0, rho: CONST.rho0, rho0: CONST.rho0 });
  }
  exhaust.reset();
})();

loop();
