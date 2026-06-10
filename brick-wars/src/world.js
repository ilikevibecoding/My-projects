// world.js — Brickooine Flats: a desert diorama where every dune, hut and
// tower is assembled brick-by-brick on a studded baseplate.

import * as THREE from 'three';
import {
  PLATE,
  BRICK,
  PALETTE,
  BrickField,
  brickGeometry,
  tileGeometry,
  slopeGeometry,
  roundBrickGeometry,
  coneGeometry,
  studGeometry,
  plastic,
  hash01,
} from './bricks.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

export const WORLD_HALF = 36; // playable half-extent in modules
const GRID = WORLD_HALF * 2; // 72 x 72 heightfield cells

// ---------------------------------------------------------------------------
// Value noise (deterministic, seedless beyond hash01)
// ---------------------------------------------------------------------------

function noise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const s = (a, b) => hash01(a * 157.31 + b * 113.97);
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = s(xi, zi);
  const b = s(xi + 1, zi);
  const c = s(xi, zi + 1);
  const d = s(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z) {
  return noise2(x, z) * 0.65 + noise2(x * 2.13 + 50, z * 2.13 + 50) * 0.35;
}

const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------------------
// World builder
// ---------------------------------------------------------------------------

const MESA = { x: -22, z: -20, r: 4.2, plates: 18 };

export function buildWorld(scene) {
  const world = {
    bounds: WORLD_HALF - 2,
    colliders: [], // { x, z, r } solid cylinders
    groundBoxes: [], // { minX, maxX, minZ, maxZ, y } walkable tops (stairs etc.)
    crateSpots: [],
    spiritSpots: [],
    mesa: { x: MESA.x, z: MESA.z, topY: MESA.plates * PLATE, r: MESA.r },
    buildSite: null,
    sun: null,
  };

  // ---- Heightfield (terraced plates) --------------------------------------
  const heights = new Int16Array(GRID * GRID); // plate counts per cell

  const plateCountAt = (cx, cz) => {
    // cx, cz are cell centers in world coords (… -0.5, 0.5, 1.5 …)
    const d = Math.hypot(cx, cz);
    const edge = smoothstep(14, WORLD_HALF - 4, d); // flat center, dunes at rim
    let h = fbm(cx * 0.075, cz * 0.075) * 11 * edge;
    // carve the south entrance flat so spawn area reads clean
    h *= 1 - 0.85 * smoothstep(6, 0, Math.abs(cx)) * smoothstep(20, 6, Math.abs(cz));
    let plates = Math.max(0, Math.round(h));
    // mesa override — a tall flat-topped butte for the build set piece
    const md = Math.hypot(cx - MESA.x, cz - MESA.z);
    const mesaP = md < MESA.r ? MESA.plates : Math.round(MESA.plates * smoothstep(MESA.r + 2.6, MESA.r, md));
    plates = Math.max(plates, mesaP);
    return Math.min(plates, 20);
  };

  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      const cx = ix - WORLD_HALF + 0.5;
      const cz = iz - WORLD_HALF + 0.5;
      heights[iz * GRID + ix] = plateCountAt(cx, cz);
    }
  }

  const cellPlates = (x, z) => {
    const ix = Math.floor(x + WORLD_HALF);
    const iz = Math.floor(z + WORLD_HALF);
    if (ix < 0 || iz < 0 || ix >= GRID || iz >= GRID) return 26; // rim wall
    return heights[iz * GRID + ix];
  };

  world.terrainHeight = (x, z) => cellPlates(x, z) * PLATE;

  world.groundHeight = (x, z) => {
    let y = world.terrainHeight(x, z);
    for (const b of world.groundBoxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) y = Math.max(y, b.y);
    }
    return y;
  };

  // ---- Sky, fog, lights ----------------------------------------------------
  scene.fog = new THREE.Fog(0xf0c490, 95, 320);
  scene.add(buildSky());

  const hemi = new THREE.HemisphereLight(0xbdd6ff, 0xc9a36a, 0.32);
  scene.add(hemi);

  // azimuth chosen so shadows fall toward the default camera (player looks -Z)
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.0);
  sun.position.set(42, 66, -38);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  world.sun = sun;

  const sun2 = new THREE.DirectionalLight(0xffb37a, 0.45);
  sun2.position.set(-60, 34, 40);
  scene.add(sun2);

  // ---- The table under the diorama ----------------------------------------
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(320, 320, 1, 48),
    new THREE.MeshStandardMaterial({ color: 0xb08d5c, roughness: 0.9, metalness: 0 })
  );
  table.position.y = -1.3;
  table.receiveShadow = true;
  scene.add(table);

  // ---- Baseplate -----------------------------------------------------------
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(GRID + 0.4, 0.8, GRID + 0.4),
    plastic(PALETTE.sand, { roughness: 0.42, clearcoat: 0.35 })
  );
  basePlate.position.y = -0.4;
  basePlate.receiveShadow = true;
  scene.add(basePlate);

  // ---- Terraced dunes (stacked 1x1 plates) + stud carpet -------------------
  const plateField = new BrickField(brickGeometry(1, 1, 1, false));
  const studField = new BrickField(studGeometry());

  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      const n = heights[iz * GRID + ix];
      const cx = ix - WORLD_HALF + 0.5;
      const cz = iz - WORLD_HALF + 0.5;
      const sandPick = hash01(ix * 3.7 + iz * 9.1);
      const baseColor =
        sandPick > 0.93 ? PALETTE.warmTan : sandPick > 0.86 ? PALETTE.darkSand : PALETTE.sand;
      if (n === 0) {
        // studded baseplate cell
        studField.add(cx, 0, cz, PALETTE.sand, 0, 0.02);
        continue;
      }
      // expose only the layers that are visible (sides of terraces):
      // we still stack all of them when the column is short, but for tall
      // columns only the top few + neighbor-visible range matter.
      const nL = ix > 0 ? heights[iz * GRID + ix - 1] : 0;
      const nR = ix < GRID - 1 ? heights[iz * GRID + ix + 1] : 0;
      const nD = iz > 0 ? heights[(iz - 1) * GRID + ix] : 0;
      const nU = iz < GRID - 1 ? heights[(iz + 1) * GRID + ix] : 0;
      const lowestNeighbor = Math.min(nL, nR, nD, nU, n);
      const from = Math.max(0, lowestNeighbor - 1);
      for (let layer = from; layer < n; layer++) {
        plateField.add(cx, layer * PLATE, cz, baseColor, 0, 0.045);
      }
      studField.add(cx, n * PLATE, cz, baseColor, 0, 0.03);
    }
  }

  scene.add(plateField.build({ castShadow: true, receiveShadow: true }));
  const studs = studField.build({ castShadow: false, receiveShadow: true });
  scene.add(studs);

  // ---- Shared fields for builds -------------------------------------------
  const f2x4 = new BrickField(brickGeometry(2, 4, 3));
  const f1x4 = new BrickField(brickGeometry(1, 4, 3));
  const f1x2 = new BrickField(brickGeometry(1, 2, 3));
  const f1x1 = new BrickField(brickGeometry(1, 1, 3));
  const f2x2 = new BrickField(brickGeometry(2, 2, 3));
  const fSlope = new BrickField(slopeGeometry(2));
  const fTile = new BrickField(tileGeometry(2, 2, 1));
  const fPlate24 = new BrickField(brickGeometry(2, 4, 1));
  const fRound = new BrickField(roundBrickGeometry(3));

  // ---- Rect hut -------------------------------------------------------------
  const hutA = { x: 13, z: -9, w: 8, d: 7, courses: 5 };
  buildRectHut(hutA, { f1x4, f1x2, f1x1, fSlope, fPlate24 });
  world.colliders.push({ x: hutA.x, z: hutA.z, r: 5.4 });
  world.spiritSpots.push({ x: hutA.x + 6.5, z: hutA.z + 4.5, label: 'beside the hut' });

  // ---- Round hut ------------------------------------------------------------
  const hutB = { x: -14, z: 8, r: 4, courses: 4 };
  buildRoundHut(hutB, { f1x2, fRound });
  world.colliders.push({ x: hutB.x, z: hutB.z, r: hutB.r + 1 });
  world.spiritSpots.push({ x: hutB.x + 0.5, z: hutB.z + 6.5, label: 'by the dome hut' });

  // ---- Vaporator-style towers ----------------------------------------------
  const towers = [
    { x: 4, z: -16 },
    { x: -5, z: 14 },
  ];
  for (const t of towers) {
    buildTower(t, { f2x2, fRound }, world);
    world.colliders.push({ x: t.x, z: t.z, r: 1.6 });
  }
  world.spiritSpots.push({ x: towers[0].x + 2.5, z: towers[0].z - 2.5, label: 'under the tower' });

  // ---- Tile plaza + path ----------------------------------------------------
  for (let px = -3; px <= 3; px += 2) {
    for (let pz = -3; pz <= 3; pz += 2) {
      fTile.add(px, 0, pz, (px + pz) % 4 === 0 ? PALETTE.lightGray : PALETTE.gray, 0, 0.03);
    }
  }
  const pathTo = (tx, tz) => {
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(THREE.MathUtils.lerp(0, tx, t) / 2) * 2;
      const z = Math.round(THREE.MathUtils.lerp(0, tz, t) / 2) * 2;
      if (world.terrainHeight(x, z) === 0 && Math.hypot(x, z) > 4) {
        fTile.add(x, 0, z, hash01(x * 5 + z) > 0.5 ? PALETTE.lightGray : PALETTE.gray, 0, 0.03);
      }
    }
  };
  pathTo(hutA.x - 2, hutA.z);
  pathTo(hutB.x, hutB.z - 2);
  pathTo(MESA.x + 10, MESA.z + 9);

  // ---- Cactus patches & rocks ----------------------------------------------
  const cactusField = new BrickField(cactusGeometry());
  const cactusSpots = [
    [22, 6], [24.5, 9], [20, 11], [-9, -14], [-12, -11.5], [8, 18], [10.5, 20.5], [26, -6],
  ];
  for (const [x, z] of cactusSpots) {
    const y = world.terrainHeight(x, z);
    if (y > 4) continue;
    cactusField.add(x + 0.5, y, z + 0.5, hash01(x + z) > 0.5 ? PALETTE.green : PALETTE.darkGreen, hash01(x * z) * Math.PI, 0.05);
    world.colliders.push({ x: x + 0.5, z: z + 0.5, r: 0.9 });
  }
  scene.add(cactusField.build());
  world.spiritSpots.push({ x: 22.5, z: 8.8, label: 'among the cacti' });

  const rockField = new BrickField(rockGeometry());
  const rockSpots = [
    [-20, 16, 1.3], [27, -14, 1.6], [-26, -4, 1.2], [16, 22, 1.4], [-2, -24, 1.5],
  ];
  for (const [x, z, s] of rockSpots) {
    const y = world.terrainHeight(x, z);
    if (y > 5) continue;
    rockField.add(x, y, z, PALETTE.gray, hash01(x - z) * Math.PI, 0.06, s);
    world.colliders.push({ x, z, r: 1.7 * s });
  }
  scene.add(rockField.build());
  world.spiritSpots.push({ x: 27, z: -16.8, label: 'behind the rocks' });

  // ---- Dune ridge spot -------------------------------------------------------
  world.spiritSpots.push(findRidgeSpot(world, 24, 24, 'on the dune ridge'));
  // #7: mesa top — requires the staircase set piece
  world.spiritSpots.push({
    x: MESA.x,
    z: MESA.z,
    y: world.mesa.topY,
    label: 'atop the mesa',
    mesa: true,
  });

  // ---- Crates ---------------------------------------------------------------
  world.crateSpots = [
    { x: 5, z: 5 }, { x: -6, z: -7 }, { x: 17, z: -3 }, { x: -16, z: 2 },
    { x: 9, z: 12 }, { x: -10, z: 16 }, { x: 20, z: -10 }, { x: -2, z: 20 },
    { x: 12, z: -14 }, { x: -19, z: -8 },
  ].filter((c) => {
    // crates must sit on locally flat ground so they don't float or sink
    const h0 = world.terrainHeight(c.x, c.z);
    if (h0 > 1.3) return false;
    for (const [dx, dz] of [[-2, -2], [-2, 2], [2, -2], [2, 2], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
      if (world.terrainHeight(c.x + dx, c.z + dz) !== h0) return false;
    }
    return true;
  });

  // ---- Build site (rattling pile at the mesa foot) --------------------------
  world.buildSite = {
    x: MESA.x + MESA.r + 4.2,
    z: MESA.z + 1,
    mesa: MESA,
  };

  // bake the static brick fields
  scene.add(f2x4.build());
  scene.add(f1x4.build());
  scene.add(f1x2.build());
  scene.add(f1x1.build());
  scene.add(f2x2.build());
  scene.add(fSlope.build());
  scene.add(fTile.build({ castShadow: false }));
  scene.add(fPlate24.build());
  scene.add(fRound.build());

  return world;
}

// ---------------------------------------------------------------------------
// Sky dome with twin suns
// ---------------------------------------------------------------------------

function buildSky() {
  const group = new THREE.Group();
  const skyGeo = new THREE.SphereGeometry(420, 32, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x4f8fd8) },
      midColor: { value: new THREE.Color(0xa8c8ee) },
      botColor: { value: new THREE.Color(0xf6d3a0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 botColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 c = h < 0.18
          ? mix(botColor, midColor, smoothstep(-0.1, 0.18, h))
          : mix(midColor, topColor, smoothstep(0.18, 0.85, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  const sunDisc = (color, size, dir) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(size, 40),
      new THREE.MeshBasicMaterial({ color, fog: false })
    );
    m.position.copy(dir).normalize().multiplyScalar(400);
    m.lookAt(0, 0, 0);
    return m;
  };
  group.add(sunDisc(0xfff7e0, 26, new THREE.Vector3(46, 52, 28)));
  group.add(sunDisc(0xffc98a, 17, new THREE.Vector3(70, 38, 50)));
  return group;
}

// ---------------------------------------------------------------------------
// Builds
// ---------------------------------------------------------------------------

/** Fill a straight wall run of `len` studs with 4/2/1-long bricks. */
function fillRun(len, offset) {
  const sizes = [];
  let remaining = len;
  if (offset && remaining >= 2) {
    sizes.push(2);
    remaining -= 2;
  }
  while (remaining > 0) {
    if (remaining >= 4) {
      sizes.push(4);
      remaining -= 4;
    } else if (remaining >= 2) {
      sizes.push(2);
      remaining -= 2;
    } else {
      sizes.push(1);
      remaining -= 1;
    }
  }
  return sizes;
}

function buildRectHut(hut, fields) {
  const { f1x4, f1x2, f1x1, fSlope, fPlate24 } = fields;
  const { x: cx, z: cz, w, d, courses } = hut;
  const wallColor = (c) => (hash01(c * 31.7) > 0.82 ? PALETTE.warmTan : PALETTE.sand);

  for (let course = 0; course < courses; course++) {
    const y = course * BRICK;
    const off = course % 2 === 1;
    // north & south walls (run along X)
    for (const side of [-1, 1]) {
      const z = cz + (side * (d - 1)) / 2;
      let xCursor = cx - w / 2;
      for (const len of fillRun(w, off)) {
        const bx = xCursor + len / 2;
        const isDoor =
          side === 1 && course < 3 && Math.abs(bx - cx) < 1.6; // doorway gap, south wall
        if (!isDoor) {
          const field = len === 4 ? f1x4 : len === 2 ? f1x2 : f1x1;
          field.add(bx, y, z, wallColor(course * 7 + bx), Math.PI / 2, 0.04);
        }
        xCursor += len;
      }
    }
    // east & west walls (run along Z, inset by 1 to not overlap corners)
    for (const side of [-1, 1]) {
      const x = cx + (side * (w - 1)) / 2;
      let zCursor = cz - (d - 2) / 2;
      for (const len of fillRun(d - 2, !off)) {
        const bz = zCursor + len / 2 - 0.5;
        const isWindow = side === -1 && course === 2 && Math.abs(bz - cz) < 1.2;
        if (!isWindow) {
          const field = len === 4 ? f1x4 : len === 2 ? f1x2 : f1x1;
          field.add(x, y, bz + 0.5, wallColor(course * 13 + bz), 0, 0.04);
        }
        zCursor += len;
      }
    }
  }

  // roof: plate layer + outward slopes
  const roofY = courses * BRICK;
  for (let px = -w / 2 + 1; px <= w / 2 - 1; px += 2) {
    for (let pz = -d / 2 + 2; pz <= d / 2 - 2; pz += 2) {
      fPlate24.add(cx + px, roofY, cz + pz, PALETTE.darkSand, 0, 0.03);
    }
  }
  for (let px = -w / 2 + 0.5; px <= w / 2 - 0.5; px += 1) {
    fSlope.add(cx + px, roofY, cz - d / 2 + 1, PALETTE.orange, Math.PI, 0.04);
    fSlope.add(cx + px, roofY, cz + d / 2 - 1, PALETTE.orange, 0, 0.04);
  }
}

function buildRoundHut(hut, fields) {
  const { f1x2, fRound } = fields;
  const { x: cx, z: cz, r, courses } = hut;
  const segs = 14;
  for (let course = 0; course < courses; course++) {
    const y = course * BRICK;
    for (let i = 0; i < segs; i++) {
      const a = ((i + (course % 2) * 0.5) / segs) * Math.PI * 2;
      // door gap facing +Z
      if (course < 3 && Math.abs(a - Math.PI / 2) < 0.42) continue;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      f1x2.add(x, y, z, course === courses - 1 ? PALETTE.white : PALETTE.warmTan, -a, 0.045);
    }
  }
  // dome cap: shrinking rings of round bricks + cone tip
  const capY = courses * BRICK;
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (1 - ring * 0.3);
    const n = Math.max(5, Math.round(segs * (rr / r)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring;
      fRound.add(cx + Math.cos(a) * rr, capY + ring * BRICK * 0.62, cz + Math.sin(a) * rr, PALETTE.white, 0, 0.04);
    }
  }
}

function buildTower(t, fields, world) {
  const { f2x2, fRound } = fields;
  const y0 = world.terrainHeight(t.x, t.z);
  const levels = 9;
  for (let i = 0; i < levels; i++) {
    const color = i % 3 === 2 ? PALETTE.darkGray : PALETTE.lightGray;
    f2x2.add(t.x, y0 + i * BRICK, t.z, color, (i % 2) * Math.PI * 0.5, 0.05);
  }
  for (let i = 0; i < 3; i++) {
    fRound.add(t.x, y0 + levels * BRICK + i * BRICK, t.z, i === 2 ? PALETTE.white : PALETTE.darkGray, 0, 0.04);
  }
}

// ---------------------------------------------------------------------------
// Instanced décor geometries
// ---------------------------------------------------------------------------

function cactusGeometry() {
  const parts = [];
  const trunk = roundBrickGeometry(3, 0.5);
  for (let i = 0; i < 4; i++) {
    const seg = trunk.clone();
    seg.translate(0, i * BRICK, 0);
    parts.push(seg);
  }
  // left arm
  const armL = brickGeometry(1, 1, 3).clone();
  armL.translate(-1, 1.6 * BRICK, 0);
  const armLUp = roundBrickGeometry(3, 0.4).clone();
  armLUp.translate(-1, 2.6 * BRICK, 0);
  // right arm
  const armR = brickGeometry(1, 1, 3).clone();
  armR.translate(1, 2.2 * BRICK, 0);
  parts.push(armL, armLUp, armR);
  return mergeGeometries(parts, false);
}

function rockGeometry() {
  const parts = [];
  const placements = [
    [0, 0, 0, 2, 2, 3], [1.6, 0, 0.8, 1, 1, 2], [-1.4, 0, -0.6, 1, 2, 2],
    [0.4, 1.2, -0.2, 2, 1, 2], [-0.6, 1.2, 0.7, 1, 1, 1], [0.1, 2, 0.4, 1, 1, 1],
  ];
  for (const [x, y, z, sx, sz, plates] of placements) {
    const g = brickGeometry(sx, sz, plates * 1.5, false).clone();
    g.translate(x, y, z);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function findRidgeSpot(world, nearX, nearZ, label) {
  let best = { x: nearX, z: nearZ, h: -1 };
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      const x = nearX + dx;
      const z = nearZ + dz;
      if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
      const h = world.terrainHeight(x, z);
      if (h > best.h && h < 5.4) best = { x, z, h };
    }
  }
  return { x: best.x + 0.5, z: best.z + 0.5, label };
}
