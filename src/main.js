import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const app = document.querySelector("#app");
const isDesktopApp = navigator.userAgent.toLowerCase().includes("electron");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reportedMemory = navigator.deviceMemory ?? 8;

const qualityTiers = [
  {
    name: "Cinematic",
    pixelRatioCap: isDesktopApp ? 1.55 : 1.4,
    bloomStrength: 0.18,
    bloomRadius: 0.08,
    bloomThreshold: 0.94,
    shadowMapSize: 2048,
    starCount: 1100,
    toneBase: 0.95,
  },
  {
    name: "Balanced",
    pixelRatioCap: 1.1,
    bloomStrength: 0.1,
    bloomRadius: 0.05,
    bloomThreshold: 0.97,
    shadowMapSize: 1536,
    starCount: 760,
    toneBase: 0.93,
  },
  {
    name: "Performance",
    pixelRatioCap: 0.85,
    bloomStrength: 0.04,
    bloomRadius: 0.02,
    bloomThreshold: 1,
    shadowMapSize: 768,
    starCount: 520,
    toneBase: 0.9,
  },
];

const performanceState = {
  qualityTier: prefersReducedMotion ? 2 : reportedMemory <= 4 ? 1 : isDesktopApp ? 0 : 1,
  sampleTime: 0,
  sampleFrames: 0,
  downgradeCooldown: 0,
};

app.innerHTML = `
  <div class="game-shell">
    <div class="scene-root" id="scene-root"></div>
    <div class="vignette"></div>
    <div class="grain"></div>

    <div class="hud">
      <section class="panel brand-panel">
        <span class="brand-kicker">3D arcade simulator</span>
        <h1>Neon<br />Forecourt</h1>
        <p>
          Run the hottest dusk-shift gas station in town. Sprint between pumps,
          keep your tanks topped up, and chain smooth services into huge cash combos.
        </p>
      </section>

      <section class="panel score-panel">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Cash</span>
            <span class="stat-value accent-cash" id="cash-value">$0</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Stock</span>
            <span class="stat-value accent-stock" id="stock-value">0 L</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Shift</span>
            <span class="stat-value accent-shift" id="shift-value">0s</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Combo</span>
            <span class="stat-value accent-combo" id="combo-value">x1</span>
          </div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span>Station stock</span>
            <strong id="stock-meter-label">0%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill" id="stock-meter-fill"></div>
          </div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span>Shift timer</span>
            <strong id="shift-meter-label">0%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill" id="shift-meter-fill"></div>
          </div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span>Forecourt rep</span>
            <strong id="reputation-value">100%</strong>
          </div>
          <div class="meter-track">
            <div class="meter-fill" id="reputation-fill"></div>
          </div>
        </div>
      </section>

      <div class="center-stack">
        <div class="panel status-banner" id="status-banner"></div>
        <div class="panel prompt" id="prompt-banner"></div>
        <div class="panel ticker" id="ticker-banner"></div>
      </div>

      <section class="panel controls-panel">
        <h2>Controls</h2>
        <div class="controls-list">
          <div class="control-row">
            <span>Move attendant</span>
            <span class="keys">
              <span class="keycap">W</span>
              <span class="keycap">A</span>
              <span class="keycap">S</span>
              <span class="keycap">D</span>
            </span>
          </div>
          <div class="control-row">
            <span>Fuel a car</span>
            <span class="keys"><span class="keycap">Hold E</span></span>
          </div>
          <div class="control-row">
            <span>Quick tanker refill</span>
            <span class="keys"><span class="keycap">R</span></span>
          </div>
          <div class="control-row">
            <span>Sprint</span>
            <span class="keys"><span class="keycap">Shift</span></span>
          </div>
          <div class="control-row">
            <span>Spin camera</span>
            <span class="keys"><span class="keycap">Drag mouse</span></span>
          </div>
          <div class="control-row">
            <span>Zoom</span>
            <span class="keys"><span class="keycap">Wheel</span></span>
          </div>
        </div>
      </section>

      <section class="panel mission-panel">
        <h2>Shift goals</h2>
        <ul class="mission-list">
          <li class="mission-item">
            <span class="mission-badge" id="goal-served">0</span>
            <span>Serve at least 12 cars before the neon closes down.</span>
          </li>
          <li class="mission-item">
            <span class="mission-badge" id="goal-stock">0%</span>
            <span>Keep your underground tank above 20% to avoid dry pumps.</span>
          </li>
          <li class="mission-item">
            <span class="mission-badge" id="goal-combo">x1</span>
            <span>Chain fast services together to keep your combo alive.</span>
          </li>
        </ul>
      </section>
    </div>

    <div class="end-screen" id="end-screen">
      <div class="panel end-card">
        <h2 id="end-title">Shift complete</h2>
        <p id="end-copy"></p>
        <div class="end-stats">
          <div class="end-stat">
            <span class="value" id="end-cash">$0</span>
            <span class="label">Cash earned</span>
          </div>
          <div class="end-stat">
            <span class="value" id="end-served">0</span>
            <span class="label">Cars served</span>
          </div>
          <div class="end-stat">
            <span class="value" id="end-combo">x1</span>
            <span class="label">Peak combo</span>
          </div>
        </div>
        <button class="restart-button" id="restart-button">Run another shift</button>
      </div>
    </div>
  </div>
`;

const ui = {
  sceneRoot: document.querySelector("#scene-root"),
  cashValue: document.querySelector("#cash-value"),
  stockValue: document.querySelector("#stock-value"),
  shiftValue: document.querySelector("#shift-value"),
  comboValue: document.querySelector("#combo-value"),
  stockMeterLabel: document.querySelector("#stock-meter-label"),
  stockMeterFill: document.querySelector("#stock-meter-fill"),
  shiftMeterLabel: document.querySelector("#shift-meter-label"),
  shiftMeterFill: document.querySelector("#shift-meter-fill"),
  reputationValue: document.querySelector("#reputation-value"),
  reputationFill: document.querySelector("#reputation-fill"),
  statusBanner: document.querySelector("#status-banner"),
  promptBanner: document.querySelector("#prompt-banner"),
  tickerBanner: document.querySelector("#ticker-banner"),
  goalServed: document.querySelector("#goal-served"),
  goalStock: document.querySelector("#goal-stock"),
  goalCombo: document.querySelector("#goal-combo"),
  endScreen: document.querySelector("#end-screen"),
  endTitle: document.querySelector("#end-title"),
  endCopy: document.querySelector("#end-copy"),
  endCash: document.querySelector("#end-cash"),
  endServed: document.querySelector("#end-served"),
  endCombo: document.querySelector("#end-combo"),
  restartButton: document.querySelector("#restart-button"),
};

const config = {
  shiftDuration: 140,
  stockCapacity: 320,
  moveBoundsX: 20,
  moveBoundsZ: { min: -2, max: 18 },
  pumpLaneXs: [-12, 0, 12],
  pumpZ: 10,
  spawnZ: 56,
  exitZ: -68,
  fuelRate: 24,
  refillCost: 95,
  refillAmount: 140,
};

const state = {
  cash: 175,
  stock: 240,
  shiftTimeLeft: config.shiftDuration,
  combo: 1,
  peakCombo: 1,
  served: 0,
  missed: 0,
  reputation: 100,
  totalLiters: 0,
  shiftOver: false,
  spawnCooldown: 2.4,
  bannerText: "Clock in, drag the mouse to orbit, and keep the forecourt glowing.",
  bannerTimer: 5,
  tickerText: "Three lanes are live. Drag to spin, wheel to zoom, and hold E near a pump to fuel.",
  tickerTimer: 8,
  restockCooldown: 0,
  bestCash: Number(localStorage.getItem("neon-forecourt-best-cash") || 0),
};

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  fuel: false,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101a2a);
scene.fog = new THREE.Fog(0x162538, 95, 240);

const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.1,
  400,
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
ui.sceneRoot.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.18,
  0.08,
  0.94,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
const tmpVector = new THREE.Vector3();
const cameraTarget = new THREE.Vector3(0, 2.6, 0);
const carColors = [
  0x4de9ff,
  0xff6bb4,
  0xffd166,
  0x7cfc8b,
  0x8f8cff,
  0xff8a5b,
];

const cars = [];
const pumps = [];
const fuelParticles = [];
const pulseMaterials = [];
let activeFuelPump = null;
let skyDome;
let sunLight;
let ambientLight;
let player;
let restockBeacon;
let tickerClock = 0;
let cameraControls;

const materials = {
  asphalt: new THREE.MeshStandardMaterial({
    color: 0x1f2430,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true,
  }),
  concrete: new THREE.MeshStandardMaterial({
    color: 0x2a3140,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  }),
  canopy: new THREE.MeshStandardMaterial({
    color: 0x2b204c,
    roughness: 0.34,
    metalness: 0.26,
    flatShading: true,
  }),
  neonBlue: new THREE.MeshStandardMaterial({
    color: 0x61ecff,
    emissive: 0x2cd8ff,
    emissiveIntensity: 1.35,
    roughness: 0.25,
    metalness: 0.15,
  }),
  neonPink: new THREE.MeshStandardMaterial({
    color: 0xff7ad4,
    emissive: 0xff3fba,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    metalness: 0.15,
  }),
  neonAmber: new THREE.MeshStandardMaterial({
    color: 0xffdf8a,
    emissive: 0xffbb36,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.12,
  }),
  whiteGlow: new THREE.MeshStandardMaterial({
    color: 0xf3f7ff,
    emissive: 0xf3f7ff,
    emissiveIntensity: 0.95,
    roughness: 0.16,
    metalness: 0.08,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x242b38,
    roughness: 0.6,
    metalness: 0.42,
    flatShading: true,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8ecaff,
    emissive: 0x224c88,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.6,
    roughness: 0.05,
    metalness: 0.1,
  }),
};

function setBanner(text, ttl = 3.5) {
  state.bannerText = text;
  state.bannerTimer = ttl;
}

function setTicker(text, ttl = 4.5) {
  state.tickerText = text;
  state.tickerTimer = ttl;
}

function formatCash(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatSeconds(value) {
  return `${Math.max(0, Math.ceil(value))}s`;
}

function getQualityTier() {
  return qualityTiers[performanceState.qualityTier];
}

function getTargetPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, getQualityTier().pixelRatioCap);
}

function createCanvasLabel(text, options = {}) {
  const {
    width = 512,
    height = 256,
    fontSize = 104,
    accent = "#61ecff",
    accentTwo = "#ff63c8",
    background = "rgba(6, 10, 24, 0.85)",
    textColor = "#f7fbff",
    radius = 34,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = background;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(1, accentTwo);
  ctx.fillStyle = gradient;
  ctx.fillRect(24, 24, width - 48, 18);

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Inter, sans-serif`;
  ctx.fillText(text, width / 2, height / 2 + 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addLabel({
  text,
  width = 8,
  height = 3,
  position = new THREE.Vector3(),
  rotationY = 0,
  options = {},
}) {
  const texture = createCanvasLabel(text, options);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    }),
  );
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  scene.add(mesh);
  return mesh;
}

function createGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    materials.asphalt,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const forecourt = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    materials.concrete,
  );
  forecourt.rotation.x = -Math.PI / 2;
  forecourt.position.set(0, 0.01, 6);
  forecourt.receiveShadow = true;
  scene.add(forecourt);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 130),
    new THREE.MeshStandardMaterial({
      color: 0x171c27,
      roughness: 0.98,
      metalness: 0.02,
    }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.z = -2;
  road.receiveShadow = true;
  scene.add(road);

  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let z = -55; z < 60; z += 11) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 4.8),
      stripeMaterial,
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.02, z);
    scene.add(stripe);
  }

  for (const laneX of config.pumpLaneXs) {
    const laneGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 28),
      new THREE.MeshBasicMaterial({
        color: 0x2b4fff,
        transparent: true,
        opacity: 0.08,
      }),
    );
    laneGlow.rotation.x = -Math.PI / 2;
    laneGlow.position.set(laneX, 0.015, 8);
    scene.add(laneGlow);
  }

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x454f66,
    roughness: 0.84,
    flatShading: true,
  });

  const leftCurb = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 42), curbMaterial);
  leftCurb.position.set(-22, 0.3, 4);
  leftCurb.castShadow = true;
  leftCurb.receiveShadow = true;
  scene.add(leftCurb);

  const rightCurb = leftCurb.clone();
  rightCurb.position.x = 22;
  scene.add(rightCurb);
}

function createMountains() {
  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: 0x261c3d,
    roughness: 1,
    flatShading: true,
  });

  for (let i = 0; i < 22; i += 1) {
    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(4 + Math.random() * 7, 10 + Math.random() * 16, 5),
      mountainMaterial,
    );
    const radius = 62 + Math.random() * 16;
    const angle = (i / 22) * Math.PI * 2;
    peak.position.set(Math.cos(angle) * radius, 6, Math.sin(angle) * radius - 4);
    peak.rotation.y = angle + Math.PI * 0.5;
    peak.castShadow = true;
    peak.receiveShadow = true;
    scene.add(peak);
  }
}

function createPalmTree(x, z) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.6, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0x7b4f35,
      roughness: 0.92,
      flatShading: true,
    }),
  );
  trunk.position.y = 3;
  trunk.castShadow = true;
  group.add(trunk);

  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 5.2, 4),
      new THREE.MeshStandardMaterial({
        color: 0x1dcc95,
        roughness: 0.86,
        flatShading: true,
      }),
    );
    leaf.rotation.z = Math.PI / 2.25;
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    leaf.position.y = 6.2;
    leaf.position.x = Math.cos(leaf.rotation.y) * 1.2;
    leaf.position.z = Math.sin(leaf.rotation.y) * 1.2;
    leaf.castShadow = true;
    group.add(leaf);
  }

  group.position.set(x, 0, z);
  scene.add(group);
}

function createStation() {
  const store = new THREE.Group();
  store.position.set(0, 0, -8);

  const building = new THREE.Mesh(
    new THREE.BoxGeometry(34, 10, 12),
    new THREE.MeshStandardMaterial({
      color: 0x252846,
      roughness: 0.48,
      metalness: 0.1,
      flatShading: true,
    }),
  );
  building.position.y = 5;
  building.castShadow = true;
  building.receiveShadow = true;
  store.add(building);

  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(37, 1.3, 15),
    materials.canopy,
  );
  roofCap.position.set(0, 10.4, 0);
  roofCap.castShadow = true;
  roofCap.receiveShadow = true;
  store.add(roofCap);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 6.6, 0.45),
    materials.glass,
  );
  door.position.set(0, 3.8, 6.1);
  store.add(door);

  for (const x of [-10, -4.2, 4.2, 10]) {
    const windowPane = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 3.8, 0.35),
      materials.glass,
    );
    windowPane.position.set(x, 5, 6.1);
    store.add(windowPane);
  }

  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.4, 2.6),
    new THREE.MeshStandardMaterial({
      color: 0x5c62aa,
      roughness: 0.64,
      flatShading: true,
    }),
  );
  counter.position.set(0, 1, 2.5);
  counter.castShadow = true;
  counter.receiveShadow = true;
  store.add(counter);

  scene.add(store);

  const canopy = new THREE.Group();
  canopy.position.set(0, 0, 10);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(38, 1.1, 16),
    new THREE.MeshStandardMaterial({
      color: 0x1f2348,
      roughness: 0.3,
      metalness: 0.18,
      flatShading: true,
    }),
  );
  roof.position.y = 10.8;
  roof.castShadow = true;
  roof.receiveShadow = true;
  canopy.add(roof);

  const underPanel = new THREE.Mesh(
    new THREE.BoxGeometry(35.8, 0.45, 13.8),
    new THREE.MeshStandardMaterial({
      color: 0xe8f0ff,
      emissive: 0x8abaff,
      emissiveIntensity: 0.32,
      roughness: 0.26,
    }),
  );
  underPanel.position.y = 10.1;
  canopy.add(underPanel);

  for (const x of [-15, -5, 5, 15]) {
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 10, 1.2),
      materials.darkMetal,
    );
    column.position.set(x, 5, 0);
    column.castShadow = true;
    column.receiveShadow = true;
    canopy.add(column);
  }

  const edgeStrip = new THREE.Mesh(
    new THREE.BoxGeometry(38.4, 0.28, 0.44),
    materials.neonPink,
  );
  edgeStrip.position.set(0, 10.7, 8.1);
  canopy.add(edgeStrip);

  const backStrip = edgeStrip.clone();
  backStrip.position.z = -8.1;
  canopy.add(backStrip);

  scene.add(canopy);

  addLabel({
    text: "VIBE FUEL",
    width: 11,
    height: 2.8,
    position: new THREE.Vector3(0, 13.6, 18.15),
    options: {
      accent: "#5cf0ff",
      accentTwo: "#fd5dcb",
      fontSize: 96,
    },
  });

  addLabel({
    text: "ARCADE SERVICE",
    width: 12,
    height: 2.4,
    position: new THREE.Vector3(0, 10.8, -1.4),
    options: {
      accent: "#ffd166",
      accentTwo: "#fd5dcb",
      fontSize: 82,
    },
  });

  const priceBoard = new THREE.Group();
  priceBoard.position.set(-24, 0, 12);

  const boardPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.5, 9, 6),
    materials.darkMetal,
  );
  boardPole.position.y = 4.5;
  boardPole.castShadow = true;
  priceBoard.add(boardPole);

  const boardFace = new THREE.Mesh(
    new THREE.BoxGeometry(6, 5.4, 1.1),
    new THREE.MeshStandardMaterial({
      color: 0x171b31,
      emissive: 0x192441,
      emissiveIntensity: 0.35,
      roughness: 0.32,
      metalness: 0.1,
    }),
  );
  boardFace.position.y = 8.5;
  boardFace.castShadow = true;
  priceBoard.add(boardFace);

  const boardGlow = new THREE.PointLight(0x5cf0ff, 8, 18, 2);
  boardGlow.position.set(0, 9.3, 1.8);
  priceBoard.add(boardGlow);
  scene.add(priceBoard);

  addLabel({
    text: "$4.99",
    width: 5.1,
    height: 2.1,
    position: new THREE.Vector3(-24, 8.8, 12.7),
    rotationY: 0,
    options: {
      accent: "#5cf0ff",
      accentTwo: "#74ff9d",
      fontSize: 108,
    },
  });

  const restockStation = new THREE.Group();
  restockStation.position.set(24, 0, 5);

  const tankBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 8.4, 18),
    new THREE.MeshStandardMaterial({
      color: 0x4d5875,
      roughness: 0.42,
      metalness: 0.38,
      flatShading: true,
    }),
  );
  tankBase.rotation.z = Math.PI / 2;
  tankBase.position.y = 1.8;
  tankBase.castShadow = true;
  tankBase.receiveShadow = true;
  restockStation.add(tankBase);

  const tankCap = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.2, 2.2),
    materials.neonAmber,
  );
  tankCap.position.set(0, 4.5, 0);
  restockStation.add(tankCap);

  restockBeacon = new THREE.PointLight(0xffbb36, 4, 16, 2);
  restockBeacon.position.set(0, 5.4, 0);
  restockStation.add(restockBeacon);

  scene.add(restockStation);

  addLabel({
    text: "PRESS R",
    width: 5.4,
    height: 1.8,
    position: new THREE.Vector3(24, 7.2, 4),
    rotationY: -Math.PI / 2,
    options: {
      accent: "#ffd166",
      accentTwo: "#ff7a5b",
      fontSize: 88,
    },
  });
}

function createPump(index, x) {
  const group = new THREE.Group();
  group.position.set(x, 0, config.pumpZ);

  const island = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.35, 8.5),
    new THREE.MeshStandardMaterial({
      color: 0x535c73,
      roughness: 0.86,
      flatShading: true,
    }),
  );
  island.position.y = 0.18;
  island.castShadow = true;
  island.receiveShadow = true;
  group.add(island);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 4.2, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0xeff4ff,
      emissive: 0x0f2347,
      emissiveIntensity: 0.28,
      roughness: 0.22,
      metalness: 0.18,
      flatShading: true,
    }),
  );
  body.position.y = 2.3;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const accentPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.45, 1.85),
    index % 2 === 0 ? materials.neonBlue : materials.neonPink,
  );
  accentPanel.position.set(0, 4.4, 0);
  group.add(accentPanel);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.7, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0xd8f9ff,
      emissive: 0x54d9ff,
      emissiveIntensity: 0.95,
      roughness: 0.12,
    }),
  );
  screen.position.set(0, 2.95, 0.97);
  group.add(screen);

  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.07, 8, 20, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x121826,
      roughness: 0.92,
      metalness: 0.12,
    }),
  );
  hose.position.set(0.66, 2.2, 0);
  hose.rotation.z = Math.PI / 2;
  group.add(hose);

  const nozzle = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.9, 0.18),
    materials.neonAmber,
  );
  nozzle.position.set(1.2, 1.7, 0);
  group.add(nozzle);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.14, 10, 40),
    new THREE.MeshBasicMaterial({
      color: 0x56d8ff,
      transparent: true,
      opacity: 0.58,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  const laneLight = new THREE.PointLight(0x5cf0ff, 3.6, 9, 2);
  laneLight.position.set(0, 4.6, 0);
  group.add(laneLight);

  scene.add(group);

  addLabel({
    text: `P${index + 1}`,
    width: 2.4,
    height: 1.2,
    position: new THREE.Vector3(x, 5.8, config.pumpZ + 0.95),
    options: {
      width: 320,
      height: 160,
      fontSize: 96,
      accent: "#f6f7ff",
      accentTwo: "#61ecff",
    },
  });

  return {
    index,
    x,
    group,
    ring,
    laneLight,
    car: null,
    pulseOffset: Math.random() * Math.PI * 2,
    flash: 0,
  };
}

function createPlayer() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.7, 1.6, 5, 12),
    new THREE.MeshStandardMaterial({
      color: 0x8b7dff,
      emissive: 0x261d63,
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.06,
      flatShading: true,
    }),
  );
  body.castShadow = true;
  group.add(body);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.36, 0.46),
    materials.neonBlue,
  );
  visor.position.set(0, 1.35, 0.46);
  group.add(visor);

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.05, 0.38),
    materials.neonPink,
  );
  backpack.position.set(0, 0.45, -0.46);
  group.add(backpack);

  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 24),
    new THREE.MeshBasicMaterial({
      color: 0x68dfff,
      transparent: true,
      opacity: 0.22,
    }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = -1.08;
  group.add(shadowDisc);

  group.position.set(0, 1.08, 4);
  scene.add(group);

  return {
    group,
    body,
    shadowDisc,
    bob: 0,
    speed: 0,
  };
}

function createSky() {
  skyDome = new Sky();
  skyDome.scale.setScalar(450000);
  scene.add(skyDome);

  const uniforms = skyDome.material.uniforms;
  uniforms.turbidity.value = 4.2;
  uniforms.rayleigh.value = 1.1;
  uniforms.mieCoefficient.value = 0.008;
  uniforms.mieDirectionalG.value = 0.78;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(82);
  const theta = THREE.MathUtils.degToRad(198);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sun);

  ambientLight = new THREE.HemisphereLight(0xa8bcff, 0x101a2b, 1.35);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xffd7a8, 2.15);
  sunLight.position.set(-22, 30, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(getQualityTier().shadowMapSize, getQualityTier().shadowMapSize);
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 35;
  sunLight.shadow.camera.bottom = -35;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 120;
  scene.add(sunLight);

  const fillLight = new THREE.PointLight(0xff63c8, 5.5, 60, 2);
  fillLight.position.set(0, 12, -4);
  scene.add(fillLight);
}

function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = getQualityTier().starCount;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i += 1) {
    const radius = 100 + Math.random() * 70;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    positions[i * 3] = Math.cos(theta) * radius * Math.sin(phi);
    positions[i * 3 + 1] = 28 + Math.random() * 40;
    positions[i * 3 + 2] = Math.sin(theta) * radius * Math.sin(phi);
  }

  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const starField = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xc8e6ff,
      size: 0.7,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    }),
  );
  scene.add(starField);
}

function createCarMesh(color) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.13),
    emissiveIntensity: 0.38,
    roughness: 0.3,
    metalness: 0.12,
    flatShading: true,
  });

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, 1.1, 5.6),
    bodyMaterial,
  );
  chassis.position.y = 1.15;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.05, 2.3),
    new THREE.MeshStandardMaterial({
      color: 0xe2efff,
      emissive: 0x284678,
      emissiveIntensity: 0.22,
      roughness: 0.08,
      metalness: 0.2,
      flatShading: true,
    }),
  );
  cabin.position.set(0, 1.92, 0.45);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 0.62, 1.42),
    materials.glass,
  );
  windshield.position.set(0, 2.02, 0.55);
  group.add(windshield);

  const bumperFront = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.4, 0.32),
    materials.whiteGlow,
  );
  bumperFront.position.set(0, 0.84, -2.73);
  group.add(bumperFront);

  const bumperBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.3, 0.24),
    materials.darkMetal,
  );
  bumperBack.position.set(0, 0.84, 2.72);
  group.add(bumperBack);

  const underglow = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.26,
    }),
  );
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.08;
  group.add(underglow);

  const headlightGeometry = new THREE.BoxGeometry(0.42, 0.18, 0.15);
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfaf5d3,
    emissive: 0xf8eda8,
    emissiveIntensity: 1.15,
    roughness: 0.18,
  });
  for (const x of [-0.82, 0.82]) {
    const light = new THREE.Mesh(headlightGeometry, headlightMaterial);
    light.position.set(x, 1.1, -2.86);
    group.add(light);
  }

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff7db5,
    emissive: 0xff4980,
    emissiveIntensity: 1,
    roughness: 0.18,
  });
  for (const x of [-0.82, 0.82]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.18, 0.15),
      taillightMaterial,
    );
    light.position.set(x, 1.03, 2.84);
    group.add(light);
  }

  const wheels = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.55, 12);
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a0f18,
    roughness: 0.9,
    metalness: 0.15,
  });
  for (const x of [-1.3, 1.3]) {
    for (const z of [-1.95, 1.95]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.55, z);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  return { group, wheels, underglow };
}

function spawnCar() {
  const freePumps = pumps.filter((pump) => !pump.car);
  if (!freePumps.length || state.shiftOver) {
    return;
  }

  const pump = freePumps[Math.floor(Math.random() * freePumps.length)];
  const color = carColors[Math.floor(Math.random() * carColors.length)];
  const carVisual = createCarMesh(color);
  const car = {
    id: `${Date.now()}-${Math.random()}`,
    ...carVisual,
    pump,
    state: "approaching",
    beingFueled: false,
    releasedPump: false,
    pulse: Math.random() * Math.PI * 2,
    maxPatience: 28 + Math.random() * 20,
    patience: 28 + Math.random() * 20,
    fuelDemand: 22 + Math.random() * 28,
    fuelGiven: 0,
    speed: 12 + Math.random() * 2.8,
    drift: THREE.MathUtils.randFloatSpread(0.08),
    exitBoost: 15 + Math.random() * 3,
    displayName: ["Comet", "Turbo", "Nova", "Drift", "Glide", "Bolt"][
      Math.floor(Math.random() * 6)
    ],
  };

  car.maxPatience = car.patience;
  car.group.position.set(pump.x, 0, config.spawnZ + Math.random() * 8);
  car.group.rotation.y = Math.PI;
  scene.add(car.group);
  cars.push(car);
  pump.car = car;
}

function completeService(car) {
  const satisfaction = THREE.MathUtils.clamp(car.patience / car.maxPatience, 0.2, 1);
  const payout = car.fuelGiven * (2 + (state.combo - 1) * 0.08) * (0.72 + satisfaction * 0.58);

  state.cash += payout;
  state.served += 1;
  state.combo += 1;
  state.peakCombo = Math.max(state.peakCombo, state.combo);
  state.reputation = Math.min(100, state.reputation + 4 + satisfaction * 4);

  car.state = "departing";
  car.beingFueled = false;
  car.served = true;
  car.pump.flash = 0.6;

  setBanner(
    `${car.displayName} topped off. Smooth service keeps the combo growing.`,
    2.8,
  );
  setTicker(`${formatCash(payout)} earned from pump ${car.pump.index + 1}.`, 4.2);
}

function loseCar(car) {
  if (car.state === "departing") {
    return;
  }

  car.state = "departing";
  car.beingFueled = false;
  car.failed = true;
  state.combo = 1;
  state.missed += 1;
  state.reputation = Math.max(0, state.reputation - 11);
  car.pump.flash = 0.2;

  setBanner(`${car.displayName} lost patience and peeled out.`, 3.2);
  setTicker("Missed customers break your combo. Keep moving between lanes.", 4.6);
}

function removeCar(index) {
  const car = cars[index];
  if (car.pump.car === car) {
    car.pump.car = null;
  }
  scene.remove(car.group);
  cars.splice(index, 1);
}

function spawnFuelParticle(origin, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 8, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
    }),
  );
  mesh.position.copy(origin);
  scene.add(mesh);

  fuelParticles.push({
    mesh,
    velocity: new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(0.28),
      0.7 + Math.random() * 0.6,
      THREE.MathUtils.randFloatSpread(0.28),
    ),
    life: 0.45 + Math.random() * 0.35,
    maxLife: 0.45 + Math.random() * 0.35,
  });
}

function updateFuelParticles(delta) {
  for (let i = fuelParticles.length - 1; i >= 0; i -= 1) {
    const particle = fuelParticles[i];
    particle.life -= delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.mesh.scale.setScalar(THREE.MathUtils.mapLinear(particle.life, 0, particle.maxLife, 0.2, 1));
    particle.mesh.material.opacity = THREE.MathUtils.clamp(
      particle.life / particle.maxLife,
      0,
      1,
    );

    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      fuelParticles.splice(i, 1);
    }
  }
}

function updatePumps(delta, elapsed) {
  for (const pump of pumps) {
    const pulse = 0.6 + Math.sin(elapsed * 2.6 + pump.pulseOffset) * 0.18;
    const occupied = Boolean(pump.car);
    const fueling = pump.car?.beingFueled;
    const flash = pump.flash > 0 ? 1 : 0;

    pump.ring.material.opacity = occupied ? 0.4 + pulse * 0.25 + flash * 0.25 : 0.16 + pulse * 0.06;
    pump.ring.scale.setScalar(fueling ? 1.06 + pulse * 0.05 : 1 + pulse * 0.02);
    pump.ring.material.color.set(fueling ? 0xffd166 : occupied ? 0x61ecff : 0x435172);
    pump.laneLight.intensity = fueling ? 7 : occupied ? 4.2 : 1.8;

    pump.flash = Math.max(0, pump.flash - delta * 1.5);
  }
}

function updateCars(delta, elapsed) {
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const car = cars[i];

    for (const wheel of car.wheels) {
      wheel.rotation.x -= delta * car.speed * 2.2;
    }

    car.underglow.material.opacity = 0.22 + Math.sin(elapsed * 5 + car.pulse) * 0.05;

    if (car.state === "approaching") {
      car.group.position.z -= car.speed * delta;
      if (car.group.position.z <= config.pumpZ + 0.8) {
        car.group.position.z = config.pumpZ + 0.8;
        car.state = "waiting";
        setTicker(`Pump ${car.pump.index + 1} is ready for ${car.displayName}.`, 3.3);
      }
    } else if (car.state === "waiting") {
      const patienceDrain = car.beingFueled ? 0.24 : 1;
      car.patience -= delta * patienceDrain;

      if (car.beingFueled) {
        car.group.position.y = Math.sin(elapsed * 12 + car.pulse) * 0.03;
      } else {
        car.group.position.y = Math.sin(elapsed * 4 + car.pulse) * 0.015;
      }

      if (car.patience <= 0) {
        loseCar(car);
      }
    } else if (car.state === "departing") {
      car.group.position.z -= car.exitBoost * delta;
      car.group.position.x += car.drift * delta;
      car.group.position.y = 0;

      if (!car.releasedPump && car.group.position.z < config.pumpZ - 6) {
        if (car.pump.car === car) {
          car.pump.car = null;
        }
        car.releasedPump = true;
      }

      if (car.group.position.z <= config.exitZ) {
        removeCar(i);
      }
    }
  }
}

function getInteractablePump() {
  let nearestPump = null;
  let nearestDistance = Infinity;

  for (const pump of pumps) {
    const car = pump.car;
    if (!car || car.state !== "waiting") {
      continue;
    }

    tmpVector.set(pump.x, player.group.position.y, config.pumpZ + 1.2);
    const distance = tmpVector.distanceToSquared(player.group.position);
    if (distance < 32 && distance < nearestDistance) {
      nearestPump = pump;
      nearestDistance = distance;
    }
  }

  return nearestPump;
}

function updateInteraction(delta) {
  activeFuelPump = null;
  for (const car of cars) {
    car.beingFueled = false;
  }

  const targetPump = getInteractablePump();
  if (!targetPump || state.shiftOver) {
    ui.promptBanner.classList.remove("is-visible");
    ui.promptBanner.innerHTML = "";
    return;
  }

  const car = targetPump.car;
  const litersNeeded = Math.max(0, car.fuelDemand - car.fuelGiven);
  ui.promptBanner.classList.add("is-visible");
  ui.promptBanner.innerHTML = `
    <strong>Pump ${targetPump.index + 1}</strong> • ${car.displayName} needs
    <strong>${Math.ceil(litersNeeded)} L</strong> — hold <strong>E</strong> to fuel
  `;

  if (!input.fuel) {
    return;
  }

  if (state.stock <= 0) {
    setTicker("Tank is dry. Press R to call the rapid tanker refill.", 3.5);
    return;
  }

  activeFuelPump = targetPump;
  car.beingFueled = true;
  const delivered = Math.min(config.fuelRate * delta, litersNeeded, state.stock);

  if (delivered > 0) {
    state.stock -= delivered;
    state.totalLiters += delivered;
    car.fuelGiven += delivered;
    setBanner(
      `Fueling ${car.displayName} • ${Math.round(car.fuelGiven)}/${Math.round(car.fuelDemand)} L`,
      0.25,
    );

    const nozzleOrigin = new THREE.Vector3(targetPump.x + 1, 2.2, config.pumpZ + 0.2);
    for (let i = 0; i < 2; i += 1) {
      spawnFuelParticle(nozzleOrigin, 0xffd166);
    }
  }

  if (car.fuelGiven >= car.fuelDemand - 0.001) {
    completeService(car);
  }
}

function attemptRestock() {
  if (state.shiftOver) {
    return;
  }

  if (state.restockCooldown > 0) {
    setTicker("The tanker is still cycling. Give the depot a moment.", 2.8);
    return;
  }

  if (state.cash < config.refillCost) {
    setTicker("Need more cash before dispatching a fast tanker refill.", 3.8);
    return;
  }

  if (state.stock >= config.stockCapacity - 24) {
    setTicker("Stock is already high. Save the refill until the tank dips lower.", 3.5);
    return;
  }

  state.cash -= config.refillCost;
  state.stock = Math.min(config.stockCapacity, state.stock + config.refillAmount);
  state.restockCooldown = 8;
  restockBeacon.intensity = 14;
  setBanner("Express tanker inbound. Underground tank topped up instantly.", 3.5);
  setTicker(
    `${config.refillAmount} liters delivered for ${formatCash(config.refillCost)}.`,
    4.4,
  );
}

function defaultBanner() {
  if (state.shiftOver) {
    return "Shift wrapped. Count the cash and line up another neon night.";
  }

  if (state.stock < 64) {
    return "Fuel reserves are low. Press R before the forecourt runs dry.";
  }

  const openLanes = pumps.filter((pump) => !pump.car).length;
  return `${openLanes} open lane${openLanes === 1 ? "" : "s"} • ${
    cars.length
  } cars on site • keep the combo rolling.`;
}

function defaultTicker() {
  if (state.reputation > 82) {
    return "Buzz is strong tonight. Fast service is attracting more drivers.";
  }

  if (state.reputation < 45) {
    return "Forecourt rep is slipping. Quick, clean fills will bring people back.";
  }

  return "Alternate between pumps, stay near waiting cars, and restock before panic sets in.";
}

function updateHUD() {
  const stockPct = THREE.MathUtils.clamp((state.stock / config.stockCapacity) * 100, 0, 100);
  const shiftPct = THREE.MathUtils.clamp((state.shiftTimeLeft / config.shiftDuration) * 100, 0, 100);

  ui.cashValue.textContent = formatCash(state.cash);
  ui.stockValue.textContent = `${Math.round(state.stock)} L`;
  ui.shiftValue.textContent = formatSeconds(state.shiftTimeLeft);
  ui.comboValue.textContent = `x${state.combo}`;

  ui.stockMeterLabel.textContent = `${Math.round(stockPct)}%`;
  ui.stockMeterFill.style.width = `${stockPct}%`;
  ui.shiftMeterLabel.textContent = `${Math.round(shiftPct)}%`;
  ui.shiftMeterFill.style.width = `${shiftPct}%`;
  ui.reputationValue.textContent = `${Math.round(state.reputation)}%`;
  ui.reputationFill.style.width = `${state.reputation}%`;

  ui.goalServed.textContent = `${state.served}/12`;
  ui.goalStock.textContent = `${Math.round(stockPct)}%`;
  ui.goalCombo.textContent = `x${state.peakCombo}`;

  ui.statusBanner.innerHTML = state.bannerTimer > 0 ? state.bannerText : defaultBanner();
  ui.tickerBanner.innerHTML = `<strong>Broadcast:</strong> ${
    state.tickerTimer > 0 ? state.tickerText : defaultTicker()
  }`;
}

function finishShift() {
  if (state.shiftOver) {
    return;
  }

  state.shiftOver = true;
  state.bestCash = Math.max(state.bestCash, Math.round(state.cash));
  localStorage.setItem("neon-forecourt-best-cash", String(state.bestCash));

  ui.endScreen.classList.add("is-visible");
  ui.endCash.textContent = formatCash(state.cash);
  ui.endServed.textContent = String(state.served);
  ui.endCombo.textContent = `x${state.peakCombo}`;

  const clearedTarget = state.served >= 12;
  ui.endTitle.textContent = clearedTarget ? "Shift crushed" : "Shift complete";
  ui.endCopy.textContent = clearedTarget
    ? `You kept the forecourt alive with ${state.served} clean fills and a peak combo of x${state.peakCombo}. Best cash on record: ${formatCash(state.bestCash)}.`
    : `You banked ${formatCash(state.cash)} and served ${state.served} cars. Another run could push your best cash of ${formatCash(state.bestCash)} even higher.`;

  setBanner("Neon forecourt closing. Tap the button or press Enter for another shift.", 999);
  ui.promptBanner.classList.remove("is-visible");
}

function updatePlayer(delta, elapsed) {
  const moveX = Number(input.right) - Number(input.left);
  const moveZ = Number(input.backward) - Number(input.forward);

  const move = new THREE.Vector3(moveX, 0, moveZ);
  const moving = move.lengthSq() > 0;
  const baseSpeed = input.sprint ? 12 : 8.4;

  if (moving) {
    move.normalize().multiplyScalar(baseSpeed * delta);
    player.group.position.add(move);
    player.group.position.x = THREE.MathUtils.clamp(
      player.group.position.x,
      -config.moveBoundsX,
      config.moveBoundsX,
    );
    player.group.position.z = THREE.MathUtils.clamp(
      player.group.position.z,
      config.moveBoundsZ.min,
      config.moveBoundsZ.max,
    );
    player.group.rotation.y = Math.atan2(move.x, move.z);
  }

  player.speed = THREE.MathUtils.lerp(player.speed, moving ? baseSpeed : 0, 0.12);
  player.bob += delta * (moving ? 11 : 3.4);
  player.group.position.y = 1.08 + Math.sin(player.bob) * (moving ? 0.08 : 0.03);
  player.shadowDisc.material.opacity = 0.18 + Math.sin(elapsed * 5) * 0.03;
}

function updateCamera(delta) {
  cameraTarget.set(player.group.position.x, 2.6, player.group.position.z - 1.2);
  cameraControls.target.lerp(cameraTarget, 1 - Math.exp(-delta * 4.5));
  cameraControls.update();
}

function updateAtmosphere(elapsed) {
  renderer.toneMappingExposure = getQualityTier().toneBase + Math.sin(elapsed * 0.12) * 0.015;
  ambientLight.intensity = 1.32 + Math.sin(elapsed * 0.2) * 0.04;
  sunLight.intensity = 2.05 + Math.sin(elapsed * 0.16) * 0.05;

  if (restockBeacon) {
    restockBeacon.intensity = THREE.MathUtils.lerp(
      restockBeacon.intensity,
      state.restockCooldown > 0 ? 5.5 : 3.5,
      0.08,
    );
  }
}

function applyQualitySettings(notify = false) {
  const tier = getQualityTier();
  renderer.setPixelRatio(getTargetPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.enabled = tier.bloomStrength > 0.05;
  bloomPass.strength = tier.bloomStrength;
  bloomPass.radius = tier.bloomRadius;
  bloomPass.threshold = tier.bloomThreshold;

  if (sunLight) {
    sunLight.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
    sunLight.shadow.needsUpdate = true;
  }

  if (notify) {
    setTicker(`Adaptive quality switched to ${tier.name.toLowerCase()} mode for smoother play.`, 4.6);
  }
}

function updateAdaptiveQuality(delta) {
  if (state.shiftOver || document.hidden) {
    return;
  }

  performanceState.downgradeCooldown = Math.max(0, performanceState.downgradeCooldown - delta);
  performanceState.sampleTime += delta;
  performanceState.sampleFrames += 1;

  if (performanceState.sampleTime < 3 || performanceState.downgradeCooldown > 0) {
    return;
  }

  const averageFps = performanceState.sampleFrames / performanceState.sampleTime;
  performanceState.sampleTime = 0;
  performanceState.sampleFrames = 0;

  if (averageFps < 42 && performanceState.qualityTier < qualityTiers.length - 1) {
    performanceState.qualityTier += 1;
    performanceState.downgradeCooldown = 6;
    applyQualitySettings(true);
  }
}

function tick(delta, elapsed) {
  if (!state.shiftOver) {
    state.shiftTimeLeft -= delta;
    state.restockCooldown = Math.max(0, state.restockCooldown - delta);
    state.bannerTimer -= delta;
    state.tickerTimer -= delta;
    tickerClock += delta;

    updatePlayer(delta, elapsed);
    updateInteraction(delta);
    updateCars(delta, elapsed);
    updatePumps(delta, elapsed);
    updateFuelParticles(delta);

    if (state.shiftTimeLeft <= 0) {
      finishShift();
    } else {
      state.spawnCooldown -= delta;
      const spawnRate = THREE.MathUtils.mapLinear(state.reputation, 0, 100, 6.8, 3.4);
      if (state.spawnCooldown <= 0) {
        spawnCar();
        state.spawnCooldown = spawnRate + Math.random() * 1.8;
      }
    }
  } else {
    updateFuelParticles(delta);
    updateCars(delta, elapsed);
    updatePumps(delta, elapsed);
  }

  updateCamera(delta);
  updateAtmosphere(elapsed);
  updateAdaptiveQuality(delta);
  updateHUD();
}

function buildWorld() {
  createSky();
  createStars();
  createGround();
  createMountains();
  createStation();

  createPalmTree(-28, -6);
  createPalmTree(29, -10);
  createPalmTree(-30, 18);
  createPalmTree(26, 20);

  config.pumpLaneXs.forEach((laneX, index) => {
    pumps.push(createPump(index, laneX));
  });

  player = createPlayer();
  spawnCar();
  spawnCar();
}

function createCameraControls() {
  camera.position.set(0, 18, 30);
  cameraControls = new OrbitControls(camera, renderer.domElement);
  cameraControls.enableDamping = true;
  cameraControls.dampingFactor = 0.08;
  cameraControls.enablePan = false;
  cameraControls.minDistance = 15;
  cameraControls.maxDistance = 42;
  cameraControls.minPolarAngle = 0.72;
  cameraControls.maxPolarAngle = 1.34;
  cameraControls.target.set(0, 2.6, 0);
  cameraControls.update();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyQualitySettings();
}

function handleKey(event, down) {
  switch (event.code) {
    case "KeyW":
    case "ArrowUp":
      input.forward = down;
      break;
    case "KeyS":
    case "ArrowDown":
      input.backward = down;
      break;
    case "KeyA":
    case "ArrowLeft":
      input.left = down;
      break;
    case "KeyD":
    case "ArrowRight":
      input.right = down;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      input.sprint = down;
      break;
    case "KeyE":
      input.fuel = down;
      break;
    case "KeyR":
      if (down && !event.repeat) {
        attemptRestock();
      }
      break;
    case "Enter":
      if (down && state.shiftOver) {
        window.location.reload();
      }
      break;
    default:
      break;
  }
}

window.addEventListener("resize", onResize);
window.addEventListener("keydown", (event) => handleKey(event, true));
window.addEventListener("keyup", (event) => handleKey(event, false));

ui.restartButton.addEventListener("click", () => {
  window.location.reload();
});

buildWorld();
createCameraControls();
applyQualitySettings();
updateHUD();
onResize();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;
  tick(delta, elapsed);
  composer.render();
}

animate();
