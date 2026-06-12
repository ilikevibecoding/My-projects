import * as THREE from 'three';
import { makeRng, makeFbm2D } from './noise.js';
import atlasMeta from '../../public/assets/textures/grass/grass_atlas.json';

/**
 * Instanced billboard grass — the main ground-cover system.
 *
 * - Crossed-quad cards (16 tris) sampling the baked clump atlas (8 variants)
 * - ~45k instances, noise-masked density (meadow patches, thinner under trees)
 * - Per-instance: position, yaw, non-uniform scale, atlas cell, hue variation
 * - Vertex wind: blade-tip sway, phase from world position
 * - Lit through MeshStandardMaterial (gets sun, IBL, shadows, fog for free);
 *   normals forced up for soft meadow shading.
 */

const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;
// favor the leafy clumps; the dark-seed-head cells (2,4,5) stay rare accents
const CELL_WEIGHTS = [0.26, 0.24, 0.015, 0.24, 0.015, 0.015, 0.105, 0.11];

const GRASS_RADIUS = 95; // run the meadow into the treeline — no bald band
const COUNT = 130000;

function pickCell(rng) {
  let r = rng();
  for (let i = 0; i < CELL_WEIGHTS.length; i++) {
    r -= CELL_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

function buildCardGeometry() {
  // two crossed planes, each 1×1, origin at bottom-center, 2×2 segments so
  // wind can bend the middle; total 16 tris
  const planes = [];
  for (const rotY of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(1, 1, 2, 2);
    g.translate(0, 0.5, 0);
    g.rotateY(rotY);
    planes.push(g);
  }
  // manual merge (avoids needing BufferGeometryUtils)
  const geo = new THREE.BufferGeometry();
  const posArr = [];
  const uvArr = [];
  const idxArr = [];
  let offset = 0;
  for (const g of planes) {
    const p = g.attributes.position.array;
    const u = g.attributes.uv.array;
    posArr.push(...p);
    uvArr.push(...u);
    const idx = g.index.array;
    for (const i of idx) idxArr.push(i + offset);
    offset += g.attributes.position.count;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      Array.from({ length: posArr.length / 3 }, () => [0, 1, 0]).flat(),
      3
    )
  );
  geo.setIndex(idxArr);
  return geo;
}

const TIME_UNIFORM = { value: 0 };
export function setGrassTime(t) {
  TIME_UNIFORM.value = t;
}

export function buildGrass(scene, getHeight, campCenter) {
  const rng = makeRng(90210);
  const densityNoise = makeFbm2D(555, 3);
  const tex = new THREE.TextureLoader().load('./assets/textures/grass/grass_atlas.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const geo = buildCardGeometry();

  // Low alphaTest + alpha-to-coverage: plain alphaTest at 0.3+ eats distant
  // grass entirely (alpha mips average toward 0 on sub-pixel cards).
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.12,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME_UNIFORM;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         attribute float aCell;
         varying vec2 vCellUv;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // wind: bend by height along the blade (uv.y == 0 at tip after flip? use position.y)
           vec4 ipos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float phase = ipos.x * 0.8 + ipos.z * 0.63;
           float t = uTime;
           float gust = sin(t * 1.25 + phase) * 0.5 + sin(t * 2.3 + phase * 1.7) * 0.3 + sin(t * 0.55 + phase * 0.4) * 0.45;
           float bend = transformed.y * transformed.y; // tip moves most
           transformed.x += gust * bend * 0.14;
           transformed.z += (sin(t * 1.6 + phase * 1.3) * 0.5) * bend * 0.10;
         }
         vCellUv = uv;`
      );

    // atlas cell lookup
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
       {
         float cellX = mod(aCell, ${ATLAS_COLS}.0);
         float cellY = floor(aCell / ${ATLAS_COLS}.0);
         #ifdef USE_MAP
           vMapUv = (uv + vec2(cellX, ${ATLAS_ROWS}.0 - 1.0 - cellY)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
         #endif
       }`
    );

    // grass cards must read as an up-facing meadow surface on BOTH faces —
    // undo the double-sided normal flip (back faces were lit from below = black)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       normal = normalize( vNormal );
       nonPerturbedNormal = normal;`
    );

    // Up-facing normals + horizontal sightlines = grazing dotNV on every
    // distant card → Fresnel pushes env specular toward 1.0 and the whole
    // mid-field sheens pale sky (iter-16 dbg). Dry grass is matte — kill it.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
       reflectedLight.indirectSpecular *= 0.15;`
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'grass';

  const cellAttr = new Float32Array(COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  let placedCount = 0;
  let guard = 0;
  while (placedCount < COUNT && guard < COUNT * 8) {
    guard++;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * GRASS_RADIUS;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    // density mask: meadow patches; thinner in deep treeline; clear at the camp pad
    const dCamp = Math.hypot(x - campCenter.x, z - campCenter.y);
    if (dCamp < 2.0) continue; // fire ring + sitting area stay walkable
    const n = densityNoise(x * 0.03, z * 0.03); // [-1,1]
    let keep = 0.8 + n * 0.2;
    if (r > 55) keep *= THREE.MathUtils.mapLinear(r, 55, GRASS_RADIUS, 1.0, 0.42);
    if (dCamp < 6) keep *= THREE.MathUtils.mapLinear(dCamp, 2.0, 6, 0.45, 1.0);
    if (rng() > keep) continue;

    const i = placedCount++;
    const cell = pickCell(rng);
    cellAttr[i] = cell;

    // card size = real-world size of the baked clump, with natural variation;
    // far cards grow up to ~35% so sparse coverage still closes at distance
    const frame = atlasMeta.cells[cell]?.frameM ?? 0.35;
    const farBoost = 1 + 0.35 * THREE.MathUtils.smoothstep(r, 55, GRASS_RADIUS);
    const s = frame * (0.85 + rng() * 0.55) * 1.6 * farBoost; // lush of life-size, overlapping
    const sw = s * (0.9 + rng() * 0.25);
    const sh = s * (0.8 + rng() * 0.4);
    const y = getHeight(x, z);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, y - 0.015, z), q, new THREE.Vector3(sw, sh, sw));
    mesh.setMatrixAt(i, m);

    // hue variation as a multiplier centered near 1.0: dry gold ↔ lush green
    // (cap < ~1.05 — over-bright multipliers made tall wisps read ghostly).
    // Far cards still darken toward the far-terrain olive, but gently — the
    // pale band was mostly grazing-angle env sheen (now killed in-shader),
    // and the old 0.5 dim on top of that fix would crush the field to mud.
    const farDim = 1 - 0.35 * THREE.MathUtils.smoothstep(r, 36, GRASS_RADIUS);
    const v = (0.68 + rng() * 0.36) * farDim; // overall value
    const warm = rng(); // 0 = green, 1 = golden
    color.setRGB(
      v * (0.78 + warm * 0.34),
      v * (0.9 + (1 - warm) * 0.16),
      v * (0.52 + (1 - warm) * 0.22)
    );
    mesh.setColorAt(i, color);
  }
  mesh.count = placedCount;

  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellAttr, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  scene.add(mesh);
  return { mesh, count: placedCount };
}
