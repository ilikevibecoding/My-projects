// IceCraft — entry point: scene, lights, loop, input wiring, debug API.
import * as THREE from 'three';
import { MAX_PIXEL_RATIO, RENDER_DISTANCE, CHUNK_SIZE, BLOCK, PLAYER_WIDTH, PLAYER_HEIGHT } from './config.js';
import { buildMaterials } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Snow } from './snow.js';
import { raycastVoxel } from './raycast.js';
import { getCastle } from './castle.js';

const HALF_W = PLAYER_WIDTH / 2;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color(0x8fc4f0);
const SKY_HORIZON = new THREE.Color(0xdff0fb);
const FOG_COLOR = new THREE.Color(0xcfe6f7);

const fogFar = RENDER_DISTANCE * CHUNK_SIZE - 6;
scene.fog = new THREE.Fog(FOG_COLOR.getHex(), 24, fogFar);
renderer.setClearColor(FOG_COLOR.getHex(), 1);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

// --- sky dome (vertical gradient) ---
const skyGeo = new THREE.SphereGeometry(500, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    topColor: { value: SKY_TOP },
    horizonColor: { value: SKY_HORIZON },
  },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vPos;
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    void main() {
      float h = normalize(vPos).y * 0.5 + 0.5;
      vec3 col = mix(horizonColor, topColor, smoothstep(0.45, 1.0, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.frustumCulled = false;
scene.add(sky);

// --- lights ---
const sun = new THREE.DirectionalLight(0xfff6e8, 1.15);
sun.position.set(60, 120, 40);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe0ff, 0xeef6ff, 0.65));
scene.add(new THREE.AmbientLight(0x90a8c0, 0.35));

// --- world / player ---
const materials = buildMaterials();
const world = new World(scene, materials);
const player = new Player(world, camera);
player.setSpawn(8, 8);
world.generateInitial(player.pos);
// re-snap spawn after generation in case surface differs
player.setSpawn(8, 8);

const snow = new Snow(scene);
const hud = new Hud();

// --- targeted block highlight ---
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
  new THREE.LineBasicMaterial({ color: 0x0a2a3a, transparent: true, opacity: 0.6 })
);
highlight.visible = false;
scene.add(highlight);

// --- input wiring ---
const input = new Input(canvas);
input.onLook = (dx, dy) => {
  player.yaw -= dx * input.sensitivity;
  player.pitch -= dy * input.sensitivity;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
};
input.onSelect = (i) => hud.setSelected(i);
input.onToggleFly = () => player.toggleFly();
input.onLockChange = (locked) => hud.setOverlay(!locked);
input.onBreak = () => doBreak();
input.onPlace = () => doPlace();

function cameraDir() {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
}

function currentTarget() {
  return raycastVoxel(world, camera.position, cameraDir());
}

function doBreak() {
  const t = currentTarget();
  if (!t) return;
  world.setBlock(t.hit.x, t.hit.y, t.hit.z, BLOCK.AIR);
}

function cellIntersectsPlayer(x, y, z) {
  const minX = player.pos.x - HALF_W;
  const maxX = player.pos.x + HALF_W;
  const minY = player.pos.y;
  const maxY = player.pos.y + PLAYER_HEIGHT;
  const minZ = player.pos.z - HALF_W;
  const maxZ = player.pos.z + HALF_W;
  return (
    x + 1 > minX && x < maxX &&
    y + 1 > minY && y < maxY &&
    z + 1 > minZ && z < maxZ
  );
}

function doPlace() {
  const t = currentTarget();
  if (!t) return;
  const p = t.prev;
  if (cellIntersectsPlayer(p.x, p.y, p.z)) return;
  if (world.isSolidAt(p.x, p.y, p.z)) return;
  world.setBlock(p.x, p.y, p.z, input.selectedBlock());
}

// --- resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- debug API for headless testing ---
const api = {
  ready: false,
  THREE,
  world,
  player,
  camera,
  input,
  teleport(x, y, z) {
    player.pos.set(x, y, z);
    player.vel.set(0, 0, 0);
  },
  setLook(yaw, pitch) {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  getBlock(x, y, z) {
    return world.getBlock(x, y, z);
  },
  target() {
    return currentTarget();
  },
  doBreak,
  doPlace,
  place(id) {
    const t = currentTarget();
    if (!t) return false;
    world.setBlock(t.prev.x, t.prev.y, t.prev.z, id);
    return true;
  },
  forceMeshAround() {
    // mesh everything currently dirty near the player synchronously
    let remaining = world.update(player.pos);
    let guard = 0;
    while (remaining > 0 && guard++ < 2000) remaining = world.update(player.pos);
  },
  rendererInfo() {
    return renderer.info.render;
  },
  // Find the nearest castle anchor by scanning cells outward from origin.
  findNearestCastle(maxCells = 6) {
    let best = null;
    for (let r = 0; r <= maxCells; r++) {
      for (let cz = -r; cz <= r; cz++) {
        for (let cx = -r; cx <= r; cx++) {
          if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
          const c = getCastle(cx, cz);
          if (c) {
            if (!best) best = c;
          }
        }
      }
      if (best) return best;
    }
    return best;
  },
  setOverlay(v) {
    hud.setOverlay(v);
  },
};
window.iceCraft = api;

// --- main loop ---
let last = performance.now();
let frames = 0;
let fpsTime = 0;
let fps = 0;

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;

  player.update(Math.min(dt, 0.1), input);
  world.update(player.pos);
  snow.update(Math.min(dt, 0.1), player.pos);

  // highlight targeted block
  const t = currentTarget();
  if (t) {
    highlight.visible = true;
    highlight.position.set(t.hit.x + 0.5, t.hit.y + 0.5, t.hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  // keep sky centered on camera
  sky.position.copy(camera.position);

  renderer.render(scene, camera);

  // fps + debug
  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  hud.setDebug(
    `FPS ${fps} | XYZ ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)} | ` +
      `chunks ${world.chunks.size} | ${player.flying ? 'FLY' : 'WALK'}`
  );

  api.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
