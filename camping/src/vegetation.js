// Instanced grass (wind-swayed cards), two tree species, scattered rocks.
import * as THREE from 'three';
import { mulberry32, SimplexNoise, clamp, smoothstep } from './noise.js';
import { placementInfo, POND, getTerrainNormal, getTerrainHeight } from './terrain.js';
import { makeBarkTexture, makeBirchBarkTexture, makeRockTexture } from './textures.js';
import { createConiferForest } from './conifer.js';
import needleAtlasMeta from './assets/conifer_needles.json';
import needleAtlasUrl from './assets/conifer_needles.png?url';
import { imageToRGBA, makeFoliageTexture, edgeDarkeningRatio } from './foliagetex.js';

export const LAYER_NO_REFLECT = 2; // grass excluded from water reflection

const placeNoise = new SimplexNoise(777);

// ---------------------------------------------------------------------------
// Foliage atlas: photographic needle sprigs, keyed and edge-dilated offline by
// tools/atlas.mjs so mip levels never grow dark halos.
// ---------------------------------------------------------------------------
export const NEEDLE_ATLAS = needleAtlasMeta;
let _needleTexture = null;
let _sharedRenderer = null;

export function getNeedleTexture() { return _needleTexture; }
export function getSharedRenderer() { return _sharedRenderer; }

/** Must be awaited before createTrees(): the impostor is rendered at build time. */
export function loadFoliageAssets(renderer, { alphaTest = 0.42 } = {}) {
  _sharedRenderer = renderer;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { data, width, height } = imageToRGBA(img);
      const tex = makeFoliageTexture({
        data, width, height, alphaTest,
        colorSpace: THREE.SRGBColorSpace,
        // anisotropy matters a lot for foliage seen at a grazing angle
        anisotropy: Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1),
      });
      tex.flipY = false;
      _needleTexture = tex;
      _needleDiag = { edgeDarkening: edgeDarkeningRatio(data, width, height) };
      resolve(tex);
    };
    img.onerror = reject;
    img.src = needleAtlasUrl;
  });
}

let _needleDiag = null;
export function getFoliageTextureDiagnostics() { return _needleDiag; }

const CONIFER_FORESTS = [];
export function getConiferForests() { return CONIFER_FORESTS; }

// ---------------------------------------------------------------------------
// Foliage cost registry — lets the harness report how many foliage cards are
// actually inside the frustum (the number that drives overdraw on a software
// rasterizer). Purely instrumentation; no effect on rendering.
// ---------------------------------------------------------------------------
const FOLIAGE_REGISTRY = [];
export function registerFoliage(mesh, info) {
  FOLIAGE_REGISTRY.push({ mesh, ...info });
}

if (typeof window !== 'undefined') {
  const _frustum = new THREE.Frustum();
  const _mvp = new THREE.Matrix4();
  const _mat = new THREE.Matrix4();
  const _sphere = new THREE.Sphere();
  const _pos = new THREE.Vector3();
  window.__foliageStats = (camera) => {
    camera.updateMatrixWorld();
    _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_mvp);
    const byKind = {};
    let totalCards = 0;
    let visibleCards = 0;
    let visibleInstances = 0;
    for (const entry of FOLIAGE_REGISTRY) {
      const { mesh, kind, cardsPerInstance, radius } = entry;
      if (!mesh || !mesh.visible) continue;
      let vis = 0;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _mat);
        _pos.set(_mat.elements[12], _mat.elements[13], _mat.elements[14]);
        const scale = Math.max(_mat.elements[0], _mat.elements[5], _mat.elements[10]);
        _sphere.set(_pos, radius * scale);
        _sphere.center.y += radius * scale * 0.5;
        if (_frustum.intersectsSphere(_sphere)) vis++;
      }
      const cards = cardsPerInstance || 0;
      byKind[kind] = byKind[kind] || { instances: 0, visibleInstances: 0, cardsPerInstance: cards, visibleCards: 0 };
      byKind[kind].instances += mesh.count;
      byKind[kind].visibleInstances += vis;
      byKind[kind].visibleCards += vis * cards;
      totalCards += mesh.count * cards;
      visibleCards += vis * cards;
      visibleInstances += vis;
    }
    return { byKind, totalCards, visibleCards, visibleInstances };
  };
}

// ---------------------------------------------------------------------------
// Grass
// ---------------------------------------------------------------------------
function makeGrassCardTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rand = mulberry32(5150);
  for (let i = 0; i < 22; i++) {
    const bx = size * (0.06 + 0.88 * rand());
    const topX = bx + (rand() - 0.5) * size * 0.34;
    const w = size * (0.012 + rand() * 0.016);
    const hgt = size * (0.45 + rand() * 0.5);
    const g = ctx.createLinearGradient(0, size, 0, size - hgt);
    const tone = 135 + rand() * 80;
    g.addColorStop(0, `rgba(${tone * 0.52},${tone * 0.66},${tone * 0.30},1)`);
    g.addColorStop(1, `rgba(${tone * 0.95},${tone * 1.04},${tone * 0.52},1)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - w, size);
    ctx.quadraticCurveTo(bx - w * 0.4, size - hgt * 0.6, topX, size - hgt);
    ctx.quadraticCurveTo(bx + w * 0.4, size - hgt * 0.6, bx + w, size);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createGrass() {
  const COUNT = 90000;
  // crossed pair of cards (short meadow tufts, not walls)
  const card = new THREE.PlaneGeometry(0.62, 0.5, 1, 2);
  card.translate(0, 0.25, 0);
  const card2 = card.clone().rotateY(Math.PI / 2);
  const merged = mergeGeoms([card, card2]);
  // force all normals UP: tufts shade like the ground (no black backfaces)
  {
    const n = merged.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    n.needsUpdate = true;
  }

  const tex = makeGrassCardTexture();
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uCamPos = { value: new THREE.Vector3() };
    material.userData.shader = shader;
    // grass always shades as if facing up — kills dark backfaces entirely
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
nonPerturbedNormal = normal;
`,
    );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uCamPos;
`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float phase = ipos.x * 1.7 + ipos.z * 2.3;
  float hFrac = clamp(transformed.y / 0.5, 0.0, 1.0);
  float sway = sin(uTime * 1.6 + phase) * 0.5 + sin(uTime * 2.7 + phase * 1.3) * 0.3;
  float gust = sin(uTime * 0.5 + ipos.x * 0.05 + ipos.z * 0.07);
  gust = max(gust, 0.0) * 0.7;
  float amp = 0.08 + gust * 0.11;
  transformed.x += sway * amp * hFrac * hFrac;
  transformed.z += sway * amp * 0.6 * hFrac * hFrac;
  // distance density fade: shrink far blades to nothing
  float dCam = distance(ipos, uCamPos);
  float fade = 1.0 - smoothstep(55.0, 90.0, dCam);
  transformed.xyz *= fade;
}
`);
  };

  const mesh = new THREE.InstancedMesh(merged, material, COUNT);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.layers.set(LAYER_NO_REFLECT);
  mesh.name = 'grass';

  const rand = mulberry32(31415);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const r = Math.sqrt(rand()) * 92;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // keep the camp area and the pond shore clear
    if (Math.hypot(x, z) < 6.5) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) continue;
    const info = placementInfo(x, z);
    if (info.water || info.grassW < 0.35) continue;
    // clumpy density via noise
    const clump = placeNoise.noise2D(x * 0.05, z * 0.05) * 0.5 + 0.5;
    if (rand() > info.grassW * (0.62 + clump * 0.45)) continue;

    const s = 0.55 + rand() * 0.55 + clump * 0.25;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    m.compose(
      new THREE.Vector3(x, info.height - 0.02, z),
      q,
      new THREE.Vector3(0.85 + rand() * 0.5, s, 0.85 + rand() * 0.5),
    );
    mesh.setMatrixAt(placed, m);
    // per-instance tint: green ↔ olive/yellow meadow variation (kept bright)
    const t = clamp(clump * 0.8 + rand() * 0.35 - 0.15, 0, 1);
    col.setRGB(0.78 + t * 0.38, 0.98 + t * 0.14, 0.6 - t * 0.05);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}

function mergeGeoms(geoms) {
  // minimal merge for identical-attribute geometries (position/normal/uv)
  let posCount = 0;
  let idxCount = 0;
  for (const g of geoms) {
    posCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(posCount * 3);
  const norm = new Float32Array(posCount * 3);
  const uv = new Float32Array(posCount * 2);
  const idx = new Uint32Array(idxCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    norm.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------
function jitterGeometry(geo, noise, freq, amp, seedOff = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise.noise3D(x * freq + seedOff, y * freq, z * freq);
    const len = Math.hypot(x, z) || 1;
    p.setX(i, x + (x / len) * n * amp);
    p.setZ(i, z + (z / len) * n * amp);
    p.setY(i, y + noise.noise3D(y * freq, x * freq + 9 + seedOff, z * freq) * amp * 0.5);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makePineGeometries() {
  const jn = new SimplexNoise(8888);
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, 3.0, 7, 2);
  trunk.translate(0, 1.5, 0);

  const skirts = [];
  const tiers = [
    { r: 1.9, h: 2.6, y: 1.7 },
    { r: 1.5, h: 2.3, y: 3.4 },
    { r: 1.1, h: 2.0, y: 5.0 },
    { r: 0.7, h: 1.7, y: 6.4 },
  ];
  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 9, 2, true); // open-ended: no grey under-caps
    cone.translate(0, t.y + t.h * 0.4, 0);
    jitterGeometry(cone, jn, 0.9, 0.16, t.y);
    skirts.push(cone);
  }
  const foliage = mergeBasic(skirts);
  return { trunk, foliage, height: 7.6 };
}

function makeBroadleafGeometries() {
  const jn = new SimplexNoise(4444);
  const trunk = new THREE.CylinderGeometry(0.10, 0.20, 2.8, 7, 3);
  // slight lean + bend
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) + 1.4;
    tp.setX(i, tp.getX(i) + Math.sin(y * 0.5) * 0.18);
  }
  trunk.translate(0, 1.4, 0);
  trunk.computeVertexNormals();

  const blobs = [];
  const blobSpecs = [
    { r: 1.5, x: 0.1, y: 3.6, z: 0 },
    { r: 1.15, x: -0.9, y: 3.0, z: 0.5 },
    { r: 1.05, x: 0.9, y: 3.1, z: -0.5 },
    { r: 0.95, x: 0.2, y: 4.6, z: 0.3 },
  ];
  let k = 0;
  for (const b of blobSpecs) {
    const s = new THREE.IcosahedronGeometry(b.r, 1);
    s.translate(b.x, b.y, b.z);
    jitterGeometry(s, jn, 0.8, 0.3, k * 13.7);
    blobs.push(s);
    k++;
  }
  const foliage = mergeBasic(blobs);
  return { trunk, foliage, height: 5.6 };
}

function mergeBasic(geoms) {
  let posCount = 0, idxCount = 0;
  for (const g of geoms) {
    posCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(posCount * 3);
  const norm = new Float32Array(posCount * 3);
  const idx = new Uint32Array(idxCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    norm.set(g.attributes.normal.array, vo * 3);
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function windSwayMaterial(material, strength = 0.1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float phase = ipos.x * 0.8 + ipos.z * 1.1;
  float hf = clamp(transformed.y / 6.0, 0.0, 1.0);
  transformed.x += sin(uTime * 0.9 + phase) * ${strength.toFixed(3)} * hf * hf;
  transformed.z += cos(uTime * 0.7 + phase * 1.4) * ${(strength * 0.7).toFixed(3)} * hf * hf;
}
`);
  };
  return material;
}

function scatterTrees({ count, rand, minR, maxR, clusterCount, clusterRadius, avoid }) {
  // clustered, organic placement — never a grid
  const clusters = [];
  for (let i = 0; i < clusterCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = minR + (maxR - minR) * Math.pow(rand(), 0.7);
    clusters.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const c = clusters[Math.floor(rand() * clusters.length)];
    const a = rand() * Math.PI * 2;
    const rr = Math.pow(rand(), 0.6) * clusterRadius;
    const x = c[0] + Math.cos(a) * rr;
    const z = c[1] + Math.sin(a) * rr;
    const r = Math.hypot(x, z);
    if (r < minR * 0.8 || r > maxR * 1.15) continue;
    const dPond = Math.hypot(x - POND.x, z - POND.z);
    if (dPond < POND.r + 4) continue;
    // sun corridor: golden-hour light reaches the camp from the ESE
    const az = Math.atan2(z, x);
    if (r < 45 && az > 0.12 && az < 1.05) continue;
    if (avoid && avoid(x, z)) continue;
    const info = placementInfo(x, z);
    if (info.water || info.slopeY < 0.62) continue;
    // density modulated by noise so the edge looks grown
    const dens = placeNoise.noise2D(x * 0.02 + 40, z * 0.02) * 0.5 + 0.5;
    if (rand() > 0.35 + dens * 0.65) continue;
    out.push({ x, z, h: info.height });
  }
  return out;
}

export function createTrees() {
  const group = new THREE.Group();
  group.name = 'trees';
  const rand = mulberry32(777111);

  const barkTex = makeBarkTexture(256, 0.34); // brighter than camp logs: trunks live in canopy shade
  const birchTex = makeBirchBarkTexture();

  // Trunks live under their own canopies: zero direct sun, and the hemisphere
  // term lands deep in the ACES toe (probed at ~4/255). Boost INDIRECT light
  // only — direct sun response stays physical, day/night ratios preserved.
  function trunkAmbientBoost(material, boost) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAmbientBoost = { value: boost };
      material.userData.uAmbientBoost = shader.uniforms.uAmbientBoost;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAmbientBoost;')
        .replace('#include <lights_fragment_end>',
          '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= uAmbientBoost;');
    };
    return material;
  }

  // --- pines ---
  const pine = makePineGeometries();
  const pineTrunkMat = trunkAmbientBoost(
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, color: 0xc4a37c }), 6.0);
  const pineFoliageMat = windSwayMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, flatShading: true, side: THREE.DoubleSide,
  }), 0.07);

  const pinePts = [
    // dense treeline ring bounding the world
    ...scatterTrees({ count: 300, rand, minR: 85, maxR: 142, clusterCount: 30, clusterRadius: 17 }),
    // forest edge lobe to the south-west (forest shot)
    ...scatterTrees({ count: 110, rand, minR: 34, maxR: 80, clusterCount: 7, clusterRadius: 14, avoid: (x, z) => !(x < 8 && z < 4) }),
    // sparse lone pines in the meadow
    ...scatterTrees({ count: 10, rand, minR: 25, maxR: 70, clusterCount: 10, clusterRadius: 22 }),
  ];

  // Remastered conifers: real branch structure with alpha-tested needle
  // sprigs, three levels of detail, impostors for the distant treeline.
  // Placement is unchanged — only what stands at each point is different.
  const coniferPts = pinePts.map((p) => {
    const s = 0.8 + rand() * 1.1;
    return {
      x: p.x,
      y: getTerrainHeight(p.x, p.z) - 0.25 * s,
      z: p.z,
      scale: s,
      rotY: rand() * Math.PI * 2,
    };
  });
  const conifers = createConiferForest({
    positions: coniferPts,
    tiles: NEEDLE_ATLAS.tiles,
    needleTexture: getNeedleTexture(),
    barkMaterial: pineTrunkMat,
    renderer: getSharedRenderer(),
  });
  group.add(conifers.group);
  CONIFER_FORESTS.push(conifers);

  // --- broadleaf (aspen-like) ---
  const leaf = makeBroadleafGeometries();
  const leafTrunkMat = new THREE.MeshStandardMaterial({ map: birchTex, roughness: 0.85, color: 0xf2ead8 });
  const leafFoliageMat = windSwayMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, flatShading: true,
  }), 0.12);

  const leafPts = [
    ...scatterTrees({ count: 70, rand, minR: 28, maxR: 95, clusterCount: 8, clusterRadius: 10 }),
    ...scatterTrees({ count: 18, rand, minR: 14, maxR: 42, clusterCount: 5, clusterRadius: 8 }),
  ];
  // a stand of trees on the far side of the pond — they appear in the reflection
  {
    let n = 0, guard = 0;
    while (n < 9 && guard++ < 300) {
      const a = (rand() - 0.5) * Math.PI * 1.1; // arc facing the camp
      const d = POND.r + 4 + rand() * 7;
      const x = POND.x + Math.cos(a) * d;
      const z = POND.z - Math.sin(a) * d * 0.9;
      const info = placementInfo(x, z);
      if (info.water || info.slopeY < 0.62) continue;
      leafPts.push({ x, z, h: info.height });
      n++;
    }
  }
  const leafTrunks = new THREE.InstancedMesh(leaf.trunk, leafTrunkMat, leafPts.length);
  const leafFol = new THREE.InstancedMesh(leaf.foliage, leafFoliageMat, leafPts.length);
  fillTreeInstances(leafPts, rand, leafTrunks, leafFol, {
    sMin: 0.7, sMax: 1.5, sink: 0.2,
    tintA: new THREE.Color(0x7ba04a), tintB: new THREE.Color(0xa8b04e), tintC: new THREE.Color(0x5e8c42),
  });

  leafTrunks.name = 'leafTrunks';
  leafFol.name = 'leafFoliage';
  for (const mh of [leafTrunks, leafFol]) {
    mh.castShadow = true;
    mh.receiveShadow = true;
    group.add(mh);
  }
  registerFoliage(leafFol, { kind: 'broadleaf', cardsPerInstance: 0, radius: 2.0 });
  return group;
}

function fillTreeInstances(pts, rand, trunkMesh, folMesh, opt) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const s = opt.sMin + rand() * (opt.sMax - opt.sMin);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    // slight random lean
    const lean = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(), (rand() - 0.5) * 0.09);
    q.multiply(lean);
    m.compose(new THREE.Vector3(p.x, p.h - opt.sink, p.z), q, new THREE.Vector3(s, s * (0.9 + rand() * 0.25), s));
    trunkMesh.setMatrixAt(i, m);
    folMesh.setMatrixAt(i, m);
    const t = rand();
    if (t < 0.5) col.copy(opt.tintA).lerp(opt.tintB, t * 2);
    else col.copy(opt.tintA).lerp(opt.tintC, (t - 0.5) * 2);
    col.multiplyScalar(0.85 + rand() * 0.35);
    folMesh.setColorAt(i, col);
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  folMesh.instanceMatrix.needsUpdate = true;
  if (folMesh.instanceColor) folMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Rocks (triplanar-ish noise texture, FBM-displaced icosahedra, sunk in)
// ---------------------------------------------------------------------------
export function createRocks() {
  const rockTex = makeRockTexture(256);
  const jn = new SimplexNoise(2025);
  const geo = new THREE.IcosahedronGeometry(1, 2);
  jitterGeometry(geo, jn, 1.4, 0.32, 0);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02, color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: rockTex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos2;\nvarying vec3 vWNorm2;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
#ifdef USE_INSTANCING
vWPos2 = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
vWNorm2 = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
#else
vWPos2 = (modelMatrix * vec4(position, 1.0)).xyz;
vWNorm2 = normalize(mat3(modelMatrix) * normal);
#endif
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos2;\nvarying vec3 vWNorm2;\nuniform sampler2D rockMap;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vWNorm2);
  an = an / (an.x + an.y + an.z);
  float rs = 0.55;
  vec3 rc = texture2D(rockMap, vWPos2.zy * rs).rgb * an.x
          + texture2D(rockMap, vWPos2.xz * rs).rgb * an.y
          + texture2D(rockMap, vWPos2.xy * rs).rgb * an.z;
  diffuseColor.rgb *= rc * 1.55;
}
`);
  };

  const COUNT = 64;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const rand = mulberry32(606060);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let guard = 0;
  const norm = new THREE.Vector3();
  while (placed < COUNT && guard++ < 4000) {
    const a = rand() * Math.PI * 2;
    const r = 12 + Math.pow(rand(), 0.6) * 110;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const info = placementInfo(x, z);
    if (info.water) continue;
    // prefer slopes and shoreline
    const dPond = Math.hypot(x - POND.x, z - POND.z);
    const shoreBonus = smoothstep(POND.r + 6, POND.r + 1, dPond) * 0.7;
    const want = info.rockW * 0.9 + shoreBonus + 0.08;
    if (rand() > want) continue;
    const s = 0.35 + Math.pow(rand(), 1.6) * 2.4;
    e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    q.setFromEuler(e);
    getTerrainNormal(x, z, norm);
    m.compose(
      new THREE.Vector3(x, info.height - s * (0.25 + rand() * 0.2), z),
      q,
      new THREE.Vector3(s * (0.8 + rand() * 0.5), s * (0.6 + rand() * 0.5), s * (0.8 + rand() * 0.5)),
    );
    mesh.setMatrixAt(placed, m);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rocks';
  return mesh;
}

// per-frame updates (wind time)
export function updateVegetation(meshes, time, camPos, camera = null) {
  for (const mh of meshes) {
    const sh = mh.material?.userData?.shader;
    if (sh) {
      if (sh.uniforms.uTime) sh.uniforms.uTime.value = time;
      if (sh.uniforms.uCamPos) sh.uniforms.uCamPos.value.copy(camPos);
    }
  }
  // conifers manage their own wind uniforms and level-of-detail assignment
  for (const forest of CONIFER_FORESTS) forest.update(time, camera);
}
