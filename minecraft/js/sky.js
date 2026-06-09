import * as THREE from 'three';
import { RENDER_DISTANCE, CHUNK_SIZE, DAY_LENGTH } from './constants.js';
import { mulberry32 } from './rng.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function makeDiscTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makeCloudTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(77);

  // Blocky clouds: coarse grid cells switched on by layered random fields.
  const cells = 32;
  const cell = size / cells;
  const field = [];
  for (let y = 0; y < cells; y++) {
    field.push([]);
    for (let x = 0; x < cells; x++) field[y].push(rng());
  }
  const sample = (x, y) => field[(y + cells) % cells][(x + cells) % cells];

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      let v = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          v += sample(x + dx, y + dy);
        }
      }
      v /= 25;
      if (v > 0.56) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const DAY_SKY = new THREE.Color(0x84b9e8);
const NIGHT_SKY = new THREE.Color(0x0b1026);
const DUSK_TINT = new THREE.Color(0xe98a4d);
const DAY_SUNLIGHT = new THREE.Color(0xfff2d8);
const MOONLIGHT = new THREE.Color(0x91a3cc);

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.3 * DAY_LENGTH; // start mid-morning

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0xbfd8f0, 0x6b5a44, 0.7);
    scene.add(this.hemiLight);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(this.ambient);

    const sunTex = makeDiscTexture(64, (ctx, s) => {
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
      ctx.fillStyle = '#ffe89a';
      ctx.fillRect(s * 0.28, s * 0.28, s * 0.44, s * 0.44);
    });
    const moonTex = makeDiscTexture(64, (ctx, s) => {
      ctx.fillStyle = '#d8dde6';
      ctx.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
      ctx.fillStyle = '#aab2c2';
      ctx.fillRect(s * 0.34, s * 0.4, s * 0.12, s * 0.12);
      ctx.fillStyle = '#b8c0cf';
      ctx.fillRect(s * 0.52, s * 0.3, s * 0.09, s * 0.09);
      ctx.fillRect(s * 0.46, s * 0.55, s * 0.1, s * 0.1);
    });

    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      new THREE.MeshBasicMaterial({
        map: sunTex,
        transparent: true,
        fog: false,
        depthWrite: false,
      })
    );
    scene.add(this.sun);

    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({
        map: moonTex,
        transparent: true,
        fog: false,
        depthWrite: false,
      })
    );
    scene.add(this.moon);

    // Stars.
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    const rng = mulberry32(4242);
    for (let i = 0; i < starCount; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = 460;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMaterial);
    scene.add(this.stars);

    // Cloud layer.
    this.cloudTexture = makeCloudTexture();
    this.cloudTexture.repeat.set(3, 3);
    this.cloudPlaneSize = 1600;
    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: this.cloudTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cloudPlaneSize, this.cloudPlaneSize),
      this.cloudMaterial
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 118;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);

    const fogFar = RENDER_DISTANCE * CHUNK_SIZE * 0.95;
    scene.fog = new THREE.Fog(DAY_SKY.clone(), fogFar * 0.55, fogFar);
    scene.background = DAY_SKY.clone();

    this.skyColor = new THREE.Color();
    this.daylight = 1;
  }

  update(dt, camPos) {
    this.time = (this.time + dt) % DAY_LENGTH;
    const t = this.time / DAY_LENGTH;

    const angle = (t - 0.25) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const daylight = smoothstep(-0.07, 0.22, elevation);
    this.daylight = daylight;

    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize();
    const moonDir = sunDir.clone().negate();

    // Sky / fog colors with a dawn-dusk tint near the horizon.
    const sky = this.skyColor;
    sky.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
    const duskAmount =
      Math.max(0, 1 - Math.abs(elevation) / 0.24) * smoothstep(-0.18, 0.0, elevation);
    sky.lerp(DUSK_TINT, duskAmount * 0.42);

    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);

    // Directional light follows sun by day, moon by night.
    const usingSun = elevation > -0.04;
    const lightDir = usingSun ? sunDir : moonDir;
    this.sunLight.position.copy(camPos).addScaledVector(lightDir, 220);
    this.sunLight.target.position.copy(camPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.color
      .copy(MOONLIGHT)
      .lerp(DAY_SUNLIGHT, daylight);
    this.sunLight.intensity = 0.22 + daylight * 1.05;

    this.hemiLight.intensity = 0.18 + daylight * 0.55;
    this.ambient.intensity = 0.16 + daylight * 0.14;

    // Celestial bodies.
    this.sun.position.copy(camPos).addScaledVector(sunDir, 430);
    this.sun.lookAt(camPos);
    this.moon.position.copy(camPos).addScaledVector(moonDir, 430);
    this.moon.lookAt(camPos);

    this.stars.position.copy(camPos);
    this.starMaterial.opacity = (1 - daylight) * 0.9;

    // Clouds: plane follows the camera, texture offset keeps them
    // world-anchored while drifting slowly.
    const unitsPerRepeat = this.cloudPlaneSize / this.cloudTexture.repeat.x;
    this.clouds.position.x = camPos.x;
    this.clouds.position.z = camPos.z;
    this.cloudTexture.offset.set(
      (camPos.x + performance.now() * 0.0012) / unitsPerRepeat,
      -camPos.z / unitsPerRepeat
    );
    const cloudShade = 0.35 + daylight * 0.65;
    this.cloudMaterial.color.setScalar(cloudShade);
  }

  // Returns time of day as "HH:MM" (t=0.25 is 06:00 sunrise).
  clockString() {
    const t = this.time / DAY_LENGTH;
    const totalMinutes = Math.floor(t * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return hh + ':' + mm;
  }
}
