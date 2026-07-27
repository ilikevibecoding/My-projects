import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mulberry32 } from './textures.js';
import { buildShip } from './ship.js';
import { buildSpace, SUN_DIR } from './space.js';
import { Player } from './player.js';
import { Interactions } from './interact.js';
import { createPost } from './post.js';

const SEED = 1337;
const DEBUG = location.hash.includes('debug');

const app = document.getElementById('app');
const startEl = document.getElementById('start');

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010204);
scene.fog = new THREE.FogExp2(0x0a0d12, 0.035);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 5000);

// PMREM environment so metals reflect something real
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.16;
  pmrem.dispose();
}

// build world
const rand = mulberry32(SEED);
const ship = buildShip(scene, rand);
const space = buildSpace(scene, mulberry32(SEED + 7));

// cool space key light through the cockpit viewport
{
  const NOSUN = location.hash.includes('nosun');
  const sun = new THREE.DirectionalLight(0xbcd8ff, NOSUN ? 0 : 2.0);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.target.position.set(0, 1, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  if (!NOSUN) ship.lights.push({ light: sun, day: 2.0, night: 2.0 });
  // faint ambient so blacks never fully crush
  const amb = new THREE.AmbientLight(0x47505e, 0.5);
  scene.add(amb);
  ship.lights.push({ light: amb, day: 0.5, night: 0.34 });
}

const player = new Player(camera, renderer.domElement, ship.colliders);
const interact = new Interactions(scene, camera, ship);
const post = createPost(renderer, scene, camera);

// ------------------------------------------------------------------ start UI
if (DEBUG) {
  startEl.classList.add('hidden');
} else {
  startEl.addEventListener('click', () => player.lock());
  player.onLockChange = (locked) => {
    startEl.classList.toggle('hidden', locked);
  };
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.resize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ debug API
const VIEWS = {
  cockpit: { pos: [0.0, 1.7, -9.0], look: [0, 1.15, -12.6] },
  corridor: { pos: [0.0, 1.7, 7.4], look: [0, 1.35, -8] },
  quarters: { pos: [2.05, 1.7, 2.0], look: [4.6, 0.7, 5.7] },
  window: { pos: [-0.15, 1.62, 0.70], look: [-3.0, 1.55, 0.75] },
};

let frames = 0;
let fpsAccum = 0, fpsCount = 0, fpsValue = 0;

renderer.info.autoReset = false;

let paused = false;

window.debugAPI = {
  ready: false,
  frames: () => frames,
  pause() { paused = true; },
  resume() { paused = false; },
  // Render one frame synchronously and return JPEG data URL (headless capture).
  capture(quality = 0.92) {
    post.composer.render();
    return renderer.domElement.toDataURL('image/jpeg', quality);
  },
  setView(name) {
    const v = VIEWS[name];
    if (!v) return false;
    player.frozen = true;
    camera.position.set(...v.pos);
    camera.lookAt(new THREE.Vector3(...v.look));
    // sync player state so it doesn't snap back
    player.position.set(v.pos[0], 0, v.pos[2]);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    player.yaw = e.y;
    player.pitch = e.x;
    player.bobAmount = 0;
    return true;
  },
  free() { player.frozen = false; },
  customView(x, y, z, lx, ly, lz) {
    player.frozen = true;
    camera.position.set(x, y, z);
    camera.lookAt(new THREE.Vector3(lx, ly, lz));
    player.position.set(x, 0, z);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    player.yaw = e.y;
    player.pitch = e.x;
    player.eyeOverride = y;
    player.bobAmount = 0;
  },
  stats() {
    return {
      fps: fpsValue,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
  hoverTarget() {
    return interact.hovered ? interact.hovered.userData.interactable.id : null;
  },
  setClock(hours) { interact.shipHours = hours; },
  cycleState() {
    return { hours: interact.shipHours, restCycle: interact.restCycle, cycleT: interact.cycleT };
  },
  pick() {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = rc.intersectObjects(ship.group.children, false);
    return hits.slice(0, 6).map((h) => {
      const m = h.object.material;
      return {
        dist: +h.distance.toFixed(3),
        point: h.point.toArray().map((v) => +v.toFixed(2)),
        color: m.color ? m.color.getHexString() : null,
        emissive: m.emissive ? m.emissive.getHexString() : null,
        rough: m.roughness, metal: m.metalness,
        hasMap: !!m.map, transparent: m.transparent,
        type: m.type,
      };
    });
  },
  press(code) {
    document.dispatchEvent(new KeyboardEvent('keydown', { code }));
  },
  teleport(x, z, yaw, pitch) {
    player.frozen = false;
    player.setPose({ x, z }, yaw, pitch);
  },
  playerPos() {
    return [player.position.x, player.position.z, player.yaw];
  },
  setKey(code, down) {
    if (down) player.keys.add(code); else player.keys.delete(code);
  },
  forceLock(v) { player.locked = v; },
  inspect() {
    const out = [];
    for (const ch of ship.group.children) {
      if (!ch.isMesh) continue;
      const m = ch.material;
      const g = ch.geometry;
      const rec = {
        color: m.color ? m.color.getHexString() : null,
        verts: g.attributes.position.count,
        hasNormal: !!g.attributes.normal,
        hasUV: !!g.attributes.uv,
        attrs: Object.keys(g.attributes),
        indexed: !!g.index,
      };
      // sanity: for first triangle near a probe point, compare geometric vs stored normal
      if (m.color && m.color.getHexString() === '1d1e20') {
        const pos = g.attributes.position, nor = g.attributes.normal;
        const probes = [];
        for (let i = 0; i < pos.count; i += 3) {
          const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
          if (Math.abs(ax + 0.62) < 0.4 && Math.abs(az + 10.35) < 0.3 && ay > 0.5 && ay < 1.3) {
            const A = new THREE.Vector3(ax, ay, az);
            const B = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
            const C = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
            const geom = C.clone().sub(B).cross(A.clone().sub(B)).normalize();
            const stored = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
            probes.push({
              tri: i / 3,
              at: A.toArray().map((v) => +v.toFixed(2)),
              storedN: stored.toArray().map((v) => +v.toFixed(2)),
              storedLen: +stored.length().toFixed(3),
              geomN: geom.toArray().map((v) => +v.toFixed(2)),
              agree: +geom.dot(stored.clone().normalize()).toFixed(2),
            });
            if (probes.length >= 6) break;
          }
        }
        rec.probes = probes;
      }
      out.push(rec);
    }
    return out;
  },
};

// ------------------------------------------------------------------ main loop
let lastT = performance.now();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const realDt = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(realDt, 0.05);
  if (paused) return;
  elapsed += dt;
  renderer.info.reset();

  player.update(dt);
  space.update(dt, elapsed);
  interact.update(dt, elapsed);
  post.update(elapsed);

  post.composer.render();

  fpsAccum += realDt; fpsCount++;
  if (fpsAccum >= 0.5) {
    fpsValue = Math.round((fpsCount / fpsAccum) * 10) / 10;
    fpsAccum = 0; fpsCount = 0;
  }
  frames++;
  if (frames === 12) window.debugAPI.ready = true;
}
tick();
