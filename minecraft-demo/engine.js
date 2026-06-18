import * as THREE from "three";

// ---------------------------------------------------------------------------
// Hyper-realistic Minecraft demo engine
// Blocky voxel geometry + PBR materials (procedural albedo / normal / roughness)
// ---------------------------------------------------------------------------

const TS = 128; // procedural texture resolution per face

// Block ids
const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;
const COBBLE = 4;
const SAND = 5;
const WATER = 6;
const LOG = 7;
const PLANKS = 8;
const LEAVES = 9;
const SNOW = 10;
const GRAVEL = 11;
const COAL = 12;
const DIAMOND = 13;
const BEDROCK = 14;

// Per-block face -> texture name. Faces: px,nx,py,ny,pz,nz
const BLOCKS = {
  [GRASS]: { name: "Grass", tex: { top: "grass_top", bottom: "dirt", side: "grass_side" } },
  [DIRT]: { name: "Dirt", tex: { all: "dirt" } },
  [STONE]: { name: "Stone", tex: { all: "stone" } },
  [COBBLE]: { name: "Cobblestone", tex: { all: "cobblestone" } },
  [SAND]: { name: "Sand", tex: { all: "sand" } },
  [WATER]: { name: "Water", tex: { all: "water" } },
  [LOG]: { name: "Oak Log", tex: { top: "oak_log_top", bottom: "oak_log_top", side: "oak_log_side" } },
  [PLANKS]: { name: "Oak Planks", tex: { all: "oak_planks" } },
  [LEAVES]: { name: "Leaves", tex: { all: "leaves" } },
  [SNOW]: { name: "Snow", tex: { all: "snow" } },
  [GRAVEL]: { name: "Gravel", tex: { all: "gravel" } },
  [COAL]: { name: "Coal Ore", tex: { all: "coal_ore" } },
  [DIAMOND]: { name: "Diamond Ore", tex: { all: "diamond_ore" } },
  [BEDROCK]: { name: "Bedrock", tex: { all: "bedrock" } },
};

// Per-texture surface response (roughness, metalness, normal strength).
const SURFACE = {
  grass_top: { rough: 0.92, metal: 0.0, normal: 0.6 },
  grass_side: { rough: 0.92, metal: 0.0, normal: 0.7 },
  dirt: { rough: 0.96, metal: 0.0, normal: 0.9 },
  stone: { rough: 0.85, metal: 0.0, normal: 0.8 },
  cobblestone: { rough: 0.88, metal: 0.0, normal: 1.5 },
  bedrock: { rough: 0.8, metal: 0.0, normal: 1.4 },
  gravel: { rough: 0.95, metal: 0.0, normal: 1.3 },
  sand: { rough: 0.98, metal: 0.0, normal: 0.5 },
  snow: { rough: 0.6, metal: 0.0, normal: 0.4 },
  oak_log_side: { rough: 0.8, metal: 0.0, normal: 1.0 },
  oak_log_top: { rough: 0.8, metal: 0.0, normal: 0.7 },
  oak_planks: { rough: 0.78, metal: 0.0, normal: 0.8 },
  leaves: { rough: 0.85, metal: 0.0, normal: 0.6 },
  water: { rough: 0.08, metal: 0.0, normal: 0.5 },
  coal_ore: { rough: 0.7, metal: 0.05, normal: 0.9 },
  diamond_ore: { rough: 0.35, metal: 0.2, normal: 1.0 },
};

// 6 cube faces. Vertices are block-local corners in {0,1}. Winding is corrected
// at init so that front faces point outward regardless of the listed order.
const FACES = [
  { dir: [1, 0, 0], verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], verts: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// Fix winding so triangle (0,1,2) normal aligns with face dir.
for (const f of FACES) {
  const [a, b, c] = f.verts;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const gn = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const dot = gn[0] * f.dir[0] + gn[1] * f.dir[1] + gn[2] * f.dir[2];
  if (dot < 0) f.verts = [f.verts[0], f.verts[3], f.verts[2], f.verts[1]];
}

function texNameFor(id, faceIndex) {
  const t = BLOCKS[id].tex;
  if (t.all) return t.all;
  if (faceIndex === 2) return t.top;
  if (faceIndex === 3) return t.bottom;
  return t.side;
}

const isOpaque = (id) => id !== AIR && id !== WATER && id !== LEAVES;

// ---------------------------------------------------------------------------
// Material construction: procedural albedo + derived normal & roughness maps
// ---------------------------------------------------------------------------

function drawAlbedo(name) {
  const c = document.createElement("canvas");
  c.width = c.height = TS;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const fn = window.MC_TEXTURES[name];
  if (!fn) {
    ctx.fillStyle = "#b000b0";
    ctx.fillRect(0, 0, TS, TS);
  } else {
    fn(ctx, TS);
  }
  return c;
}

// Sobel height-from-luminance -> tangent-space normal map (seamless wrap).
function buildNormalMap(albedoCtx, strength) {
  const S = TS;
  const src = albedoCtx.getImageData(0, 0, S, S).data;
  const lum = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    lum[i] = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255;
  }
  const out = new Uint8ClampedArray(S * S * 4);
  const at = (x, y) => lum[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * S + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  const c = document.createElement("canvas");
  c.width = c.height = S;
  c.getContext("2d").putImageData(new ImageData(out, S, S), 0, 0);
  return c;
}

// Roughness map: darker recesses read slightly rougher than lit ridges.
function buildRoughnessMap(albedoCtx, base) {
  const S = TS;
  const src = albedoCtx.getImageData(0, 0, S, S).data;
  const out = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const lum = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255;
    let rough = base + (0.5 - lum) * 0.25;
    rough = Math.max(0.04, Math.min(1, rough));
    const v = rough * 255;
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  const c = document.createElement("canvas");
  c.width = c.height = S;
  c.getContext("2d").putImageData(new ImageData(out, S, S), 0, 0);
  return c;
}

function makeTexture(canvas, srgb, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const materialCache = {};

function getMaterial(renderer, name) {
  if (materialCache[name]) return materialCache[name];
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const albedoCanvas = drawAlbedo(name);
  const actx = albedoCanvas.getContext("2d", { willReadFrequently: true });
  const surf = SURFACE[name] || { rough: 0.9, metal: 0, normal: 0.8 };

  const map = makeTexture(albedoCanvas, true, aniso);
  const normalMap = makeTexture(buildNormalMap(actx, 2.0), false, aniso);
  const roughnessMap = makeTexture(buildRoughnessMap(actx, surf.rough), false, aniso);

  const isLeaves = name === "leaves";
  const isWater = name === "water";

  const params = {
    map,
    normalMap,
    roughnessMap,
    metalness: surf.metal,
    roughness: surf.rough,
    normalScale: new THREE.Vector2(surf.normal, surf.normal),
    vertexColors: true,
  };

  if (isLeaves) {
    params.transparent = false;
    params.alphaTest = 0.5;
    params.side = THREE.DoubleSide;
  } else if (isWater) {
    params.transparent = true;
    params.opacity = 0.72;
    params.depthWrite = false;
    params.side = THREE.DoubleSide;
    params.envMapIntensity = 1.0;
  } else {
    params.side = THREE.FrontSide;
  }

  const mat = new THREE.MeshStandardMaterial(params);
  if (isWater) mat.userData.normalMap = normalMap; // animated later
  materialCache[name] = mat;
  return mat;
}

// ---------------------------------------------------------------------------
// Voxel world: storage + procedural generation + meshing
// ---------------------------------------------------------------------------

const WX = 80, WZ = 80, WY = 56;
const SEA = 20;
const CHUNK = 16;
const AO_LEVELS = [0.42, 0.6, 0.79, 1.0];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class World {
  constructor(seed = 1337) {
    this.data = new Uint8Array(WX * WZ * WY);
    this.seed = seed;
    this.generate();
  }

  idx(x, y, z) { return x + z * WX + y * WX * WZ; }

  get(x, y, z) {
    if (x < 0 || x >= WX || z < 0 || z >= WZ || y < 0 || y >= WY) return AIR;
    return this.data[this.idx(x, y, z)];
  }

  set(x, y, z, id) {
    if (x < 0 || x >= WX || z < 0 || z >= WZ || y < 0 || y >= WY) return;
    this.data[this.idx(x, y, z)] = id;
  }

  // ---- value noise (seeded, smooth) ----
  hash(ix, iz) {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(this.seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  vnoise(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = x - x0, fz = z - z0;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = this.hash(x0, z0), b = this.hash(x0 + 1, z0);
    const c = this.hash(x0, z0 + 1), d = this.hash(x0 + 1, z0 + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  fbm(x, z) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * this.vnoise(x * f, z * f); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }

  heightAt(x, z) {
    const base = this.fbm(x * 0.045 + 10.5, z * 0.045 + 4.2);
    const hills = this.fbm(x * 0.015 + 50.5, z * 0.015 + 30.2);
    const h = 14 + base * 16 + Math.pow(hills, 1.6) * 26;
    return Math.max(2, Math.min(WY - 8, Math.floor(h)));
  }

  // A clear, open grass/sand/snow column near the centre (never inside a tree).
  findSpawn() {
    const cx0 = WX >> 1, cz0 = WZ >> 1;
    for (let r = 0; r < 24; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx0 + dx, z = cz0 + dz;
          if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
          const top = this.get(x, this.heightAt(x, z), z);
          const h = this.heightAt(x, z);
          if ((top === GRASS || top === SAND || top === SNOW) &&
              this.get(x, h + 1, z) === AIR && this.get(x, h + 2, z) === AIR) {
            return new THREE.Vector3(x + 0.5, h + 1, z + 0.5);
          }
        }
      }
    }
    return new THREE.Vector3(cx0 + 0.5, this.heightAt(cx0, cz0) + 2, cz0 + 0.5);
  }

  generate() {
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    const snowLine = 38;

    for (let x = 0; x < WX; x++) {
      for (let z = 0; z < WZ; z++) {
        const h = this.heightAt(x, z);
        for (let y = 0; y <= h; y++) {
          let id = STONE;
          if (y === 0) id = BEDROCK;
          else if (y > h - 4) id = DIRT;
          this.set(x, y, z, id);
        }
        // surface block
        const top = h;
        if (top >= snowLine) {
          this.set(x, top, z, SNOW);
        } else if (h <= SEA + 1) {
          this.set(x, top, z, h < SEA - 1 ? GRAVEL : SAND);
          for (let y = top - 1; y > top - 3 && y > 0; y--) this.set(x, y, z, SAND);
        } else {
          this.set(x, top, z, GRASS);
        }
        // water fill
        if (h < SEA) {
          for (let y = h + 1; y <= SEA; y++) this.set(x, y, z, WATER);
        }
      }
    }

    // ore pockets in stone
    for (let i = 0; i < WX * WZ * 0.9; i++) {
      const x = (rng() * WX) | 0, z = (rng() * WZ) | 0;
      const surf = this.heightAt(x, z);
      const y = 2 + ((rng() * Math.max(2, surf - 4)) | 0);
      if (this.get(x, y, z) !== STONE) continue;
      const isDiamond = y < 12 && rng() < 0.18;
      const ore = isDiamond ? DIAMOND : COAL;
      const blob = isDiamond ? 3 : 5;
      for (let k = 0; k < blob; k++) {
        const ox = (rng() * 3 - 1) | 0, oy = (rng() * 3 - 1) | 0, oz = (rng() * 3 - 1) | 0;
        if (this.get(x + ox, y + oy, z + oz) === STONE) this.set(x + ox, y + oy, z + oz, ore);
      }
    }

    // trees on grass
    for (let x = 3; x < WX - 3; x++) {
      for (let z = 3; z < WZ - 3; z++) {
        const h = this.heightAt(x, z);
        if (this.get(x, h, z) !== GRASS) continue;
        if (rng() > 0.018) continue;
        const trunk = 4 + ((rng() * 3) | 0);
        const topY = h + trunk;
        for (let y = h + 1; y <= topY; y++) this.set(x, y, z, LOG);
        for (let dy = -2; dy <= 1; dy++) {
          const cy = topY + dy;
          const rad = dy >= 0 ? 1 : 2;
          for (let dx = -rad; dx <= rad; dx++) {
            for (let dz = -rad; dz <= rad; dz++) {
              if (dx === 0 && dz === 0 && dy < 0) continue;
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && rng() < 0.55) continue;
              if (this.get(x + dx, cy, z + dz) === AIR) this.set(x + dx, cy, z + dz, LEAVES);
            }
          }
        }
        this.set(x, topY + 1, z, LEAVES);
      }
    }
  }

  // ---- meshing ----
  faceVisible(id, nid) {
    if (isOpaque(id)) return !isOpaque(nid);
    if (id === LEAVES) return nid === AIR || nid === LEAVES;
    if (id === WATER) return nid === AIR;
    return false;
  }

  vertexAO(s1, s2, c) {
    if (s1 && s2) return 0;
    return 3 - (s1 + s2 + c);
  }

  buildChunk(renderer, cx, cz) {
    const group = new THREE.Group();
    const buckets = new Map();
    const bucket = (name) => {
      let b = buckets.get(name);
      if (!b) { b = { pos: [], norm: [], uv: [], col: [], idx: [], n: 0 }; buckets.set(name, b); }
      return b;
    };

    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let x = x0; x < x0 + CHUNK && x < WX; x++) {
      for (let z = z0; z < z0 + CHUNK && z < WZ; z++) {
        for (let y = 0; y < WY; y++) {
          const id = this.get(x, y, z);
          if (id === AIR) continue;
          for (let fi = 0; fi < 6; fi++) {
            const f = FACES[fi];
            const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
            const nid = this.get(nx, ny, nz);
            if (!this.faceVisible(id, nid)) continue;

            const name = texNameFor(id, fi);
            const b = bucket(name);
            const base = b.n;

            for (let vi = 0; vi < 4; vi++) {
              const vert = f.verts[vi];
              b.pos.push(x + vert[0], y + vert[1], z + vert[2]);
              b.norm.push(f.dir[0], f.dir[1], f.dir[2]);

              // uv: vertical world axis -> V for side faces (keeps grass upright)
              let u, vv;
              if (f.dir[0] !== 0) { u = vert[2]; vv = vert[1]; }
              else if (f.dir[1] !== 0) { u = vert[0]; vv = vert[2]; }
              else { u = vert[0]; vv = vert[1]; }
              b.uv.push(u, vv);

              // ambient occlusion from the 3 neighbors around this corner
              let ao = 3;
              if (isOpaque(id) || id === LEAVES) {
                let oa, ob;
                if (f.dir[0] !== 0) { oa = [0, vert[1] ? 1 : -1, 0]; ob = [0, 0, vert[2] ? 1 : -1]; }
                else if (f.dir[1] !== 0) { oa = [vert[0] ? 1 : -1, 0, 0]; ob = [0, 0, vert[2] ? 1 : -1]; }
                else { oa = [vert[0] ? 1 : -1, 0, 0]; ob = [0, vert[1] ? 1 : -1, 0]; }
                const s1 = isOpaque(this.get(nx + oa[0], ny + oa[1], nz + oa[2])) ? 1 : 0;
                const s2 = isOpaque(this.get(nx + ob[0], ny + ob[1], nz + ob[2])) ? 1 : 0;
                const cc = isOpaque(this.get(nx + oa[0] + ob[0], ny + oa[1] + ob[1], nz + oa[2] + ob[2])) ? 1 : 0;
                ao = this.vertexAO(s1, s2, cc);
              }
              const bgt = AO_LEVELS[ao];
              b.col.push(bgt, bgt, bgt);
            }

            // anisotropy fix: flip quad diagonal toward darker corners
            const c0 = b.col[(base) * 3], c1 = b.col[(base + 1) * 3];
            const c2 = b.col[(base + 2) * 3], c3 = b.col[(base + 3) * 3];
            if (c0 + c2 > c1 + c3) {
              b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            } else {
              b.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            }
            b.n += 4;
          }
        }
      }
    }

    for (const [name, b] of buckets) {
      if (b.n === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.norm, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      const mat = getMaterial(renderer, name);
      const mesh = new THREE.Mesh(geo, mat);
      if (name === "water") {
        mesh.castShadow = false; mesh.receiveShadow = true; mesh.renderOrder = 2;
      } else {
        mesh.castShadow = true; mesh.receiveShadow = true;
      }
      group.add(mesh);
    }
    group.userData.cx = cx;
    group.userData.cz = cz;
    return group;
  }
}

// ---------------------------------------------------------------------------
// Scene, sky, lighting
// ---------------------------------------------------------------------------

const HORIZON = new THREE.Color(0xbfd8ec);
const SKYTOP = new THREE.Color(0x3a7bd5);

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(700, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: SKYTOP },
      bottom: { value: HORIZON },
      offset: { value: 0.12 },
      exponent: { value: 0.8 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent;
      void main() {
        float h = max(0.0, vDir.y + offset);
        float t = pow(h, exponent);
        gl_FragColor = vec4(mix(bottom, top, clamp(t, 0.0, 1.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function buildSun(scene) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,250,235,1)");
  g.addColorStop(0.25, "rgba(255,243,205,0.95)");
  g.addColorStop(0.55, "rgba(255,230,170,0.35)");
  g.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  spr.scale.set(80, 80, 1);
  scene.add(spr);
  return spr;
}

function buildClouds(scene) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const hash = (x, y) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ 0x9e37;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const vn = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const g = (a, b) => hash(((a % p) + p) % p, ((b % p) + p) % p);
    return g(xi, yi) * (1 - u) * (1 - v) + g(xi + 1, yi) * u * (1 - v) + g(xi, yi + 1) * (1 - u) * v + g(xi + 1, yi + 1) * u * v;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let n = 0, amp = 0.5, f = 4, norm = 0;
      for (let o = 0; o < 4; o++) { n += amp * vn((x / S) * f, (y / S) * f, f); norm += amp; amp *= 0.5; f *= 2; }
      n /= norm;
      const a = Math.max(0, n - 0.5) / 0.5;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.pow(a, 1.5) * 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(WX / 2, WY + 34, WZ / 2);
  mesh.renderOrder = -1;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HOTBAR = [GRASS, DIRT, STONE, COBBLE, SAND, PLANKS, LOG, LEAVES, SNOW];

function init() {
  const app = document.getElementById("app");
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 45, 230);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1200);
  camera.rotation.order = "YXZ";

  // lighting
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a4034, 0.75);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff3da, 2.4);
  const sunDir = new THREE.Vector3(0.55, 0.78, 0.32).normalize();
  sun.position.copy(sunDir.clone().multiplyScalar(140)).add(new THREE.Vector3(WX / 2, 0, WZ / 2));
  sun.target.position.set(WX / 2, SEA, WZ / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 360;
  const sc = 90;
  sun.shadow.camera.left = -sc;
  sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc;
  sun.shadow.camera.bottom = -sc;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);
  scene.add(sun.target);

  buildSky(scene);
  const sunSprite = buildSun(scene);
  const clouds = buildClouds(scene);

  // world
  const world = new World((Math.random() * 1e9) | 0);
  const chunks = new Map();
  const chunkKey = (cx, cz) => cx + "," + cz;
  const NCX = Math.ceil(WX / CHUNK), NCZ = Math.ceil(WZ / CHUNK);
  for (let cx = 0; cx < NCX; cx++) {
    for (let cz = 0; cz < NCZ; cz++) {
      const g = world.buildChunk(renderer, cx, cz);
      chunks.set(chunkKey(cx, cz), g);
      scene.add(g);
    }
  }

  function rebuildChunk(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= NCX || cz >= NCZ) return;
    const key = chunkKey(cx, cz);
    const old = chunks.get(key);
    if (old) {
      scene.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const g = world.buildChunk(renderer, cx, cz);
    chunks.set(key, g);
    scene.add(g);
  }

  function editBlock(x, y, z, id) {
    world.set(x, y, z, id);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    rebuildChunk(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) rebuildChunk(cx - 1, cz);
    if (lx === CHUNK - 1) rebuildChunk(cx + 1, cz);
    if (lz === 0) rebuildChunk(cx, cz - 1);
    if (lz === CHUNK - 1) rebuildChunk(cx, cz + 1);
  }

  // block-selection highlight
  const hl = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
  );
  hl.visible = false;
  scene.add(hl);

  // ---- player ----
  const spawn = world.findSpawn();
  const player = {
    pos: spawn.clone(),
    vel: new THREE.Vector3(),
    onGround: false,
    fly: false,
  };
  const HW = 0.3, PH = 1.8, EYE = 1.62;
  let yaw = 0, pitch = 0;

  const solidCollide = (id) => id !== AIR && id !== WATER;
  function collides(px, py, pz) {
    const x0 = Math.floor(px - HW), x1 = Math.floor(px + HW);
    const y0 = Math.floor(py), y1 = Math.floor(py + PH);
    const z0 = Math.floor(pz - HW), z1 = Math.floor(pz + HW);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (solidCollide(world.get(x, y, z))) return true;
    return false;
  }

  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyF") player.fly = !player.fly;
    if (e.code.startsWith("Digit")) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  // pointer lock
  const blocker = document.getElementById("blocker");
  const canvas = renderer.domElement;
  canvas.addEventListener("click", () => canvas.requestPointerLock());
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    blocker.classList.toggle("hidden", locked);
  });
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  });

  // raycast (voxel DDA)
  function raycast() {
    const o = camera.position;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tDX = sx !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDY = sy !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDZ = sz !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMX = sx !== 0 ? ((sx > 0 ? x + 1 - o.x : o.x - x) * tDX) : Infinity;
    let tMY = sy !== 0 ? ((sy > 0 ? y + 1 - o.y : o.y - y) * tDY) : Infinity;
    let tMZ = sz !== 0 ? ((sz > 0 ? z + 1 - o.z : o.z - z) * tDZ) : Infinity;
    let px = x, py = y, pz = z;
    const maxDist = 6;
    for (let i = 0; i < 64; i++) {
      const id = world.get(x, y, z);
      if (id !== AIR && id !== WATER) return { x, y, z, px, py, pz };
      px = x; py = y; pz = z;
      if (tMX < tMY && tMX < tMZ) { if (tMX > maxDist) break; x += sx; tMX += tDX; }
      else if (tMY < tMZ) { if (tMY > maxDist) break; y += sy; tMY += tDY; }
      else { if (tMZ > maxDist) break; z += sz; tMZ += tDZ; }
    }
    return null;
  }

  let selected = 0;
  function selectSlot(i) {
    selected = i;
    document.querySelectorAll(".slot").forEach((el, idx) => el.classList.toggle("active", idx === i));
  }

  canvas.addEventListener("mousedown", (e) => {
    if (document.pointerLockElement !== canvas) return;
    const hit = raycast();
    if (!hit) return;
    if (e.button === 0) {
      if (world.get(hit.x, hit.y, hit.z) === BEDROCK) return;
      editBlock(hit.x, hit.y, hit.z, AIR);
    } else if (e.button === 2) {
      const { px, py, pz } = hit;
      if (world.get(px, py, pz) !== AIR) return;
      // don't place inside the player
      const minx = player.pos.x - HW, maxx = player.pos.x + HW;
      const miny = player.pos.y, maxy = player.pos.y + PH;
      const minz = player.pos.z - HW, maxz = player.pos.z + HW;
      if (px + 1 > minx && px < maxx && py + 1 > miny && py < maxy && pz + 1 > minz && pz < maxz) return;
      editBlock(px, py, pz, HOTBAR[selected]);
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("wheel", (e) => {
    if (document.pointerLockElement !== canvas) return;
    selectSlot((selected + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
  });

  // hotbar UI
  const hotbarEl = document.getElementById("hotbar");
  HOTBAR.forEach((id, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    const tname = BLOCKS[id].tex.top || BLOCKS[id].tex.all || BLOCKS[id].tex.side;
    const icon = drawAlbedo(tname);
    icon.className = "slot-icon";
    slot.appendChild(icon);
    const num = document.createElement("span");
    num.className = "slot-num";
    num.textContent = i + 1;
    slot.appendChild(num);
    slot.title = BLOCKS[id].name;
    slot.addEventListener("click", () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
  selectSlot(0);

  // HUD
  const hud = document.getElementById("hud");
  let frames = 0, fpsTime = 0, fps = 0;

  function updatePlayer(dt) {
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const wish = new THREE.Vector3();
    if (keys["KeyW"]) wish.add(fwd);
    if (keys["KeyS"]) wish.sub(fwd);
    if (keys["KeyD"]) wish.add(right);
    if (keys["KeyA"]) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprint = keys["ShiftLeft"] || keys["ShiftRight"];

    if (player.fly) {
      const speed = sprint ? 22 : 11;
      player.vel.x = wish.x * speed;
      player.vel.z = wish.z * speed;
      let vy = 0;
      if (keys["Space"]) vy += 1;
      if (keys["KeyC"] || keys["ControlLeft"]) vy -= 1;
      player.vel.y = vy * speed;
    } else {
      const speed = sprint ? 8.2 : 5.0;
      player.vel.x = wish.x * speed;
      player.vel.z = wish.z * speed;
      player.vel.y -= 28 * dt;
      if (keys["Space"] && player.onGround) { player.vel.y = 8.6; player.onGround = false; }
    }

    const step = Math.min(dt, 0.05);
    const p = player.pos;
    p.x += player.vel.x * step;
    if (collides(p.x, p.y, p.z)) { p.x -= player.vel.x * step; player.vel.x = 0; }
    p.z += player.vel.z * step;
    if (collides(p.x, p.y, p.z)) { p.z -= player.vel.z * step; player.vel.z = 0; }

    player.onGround = false;
    p.y += player.vel.y * step;
    if (collides(p.x, p.y, p.z)) {
      if (player.vel.y <= 0) player.onGround = true;
      p.y -= player.vel.y * step;
      player.vel.y = 0;
    }

    if (p.y < -20) { p.copy(world.findSpawn()); player.vel.set(0, 0, 0); }

    camera.position.set(p.x, p.y + EYE, p.z);
    sunSprite.position.copy(camera.position).add(sunDir.clone().multiplyScalar(500));
    sun.position.copy(sunDir.clone().multiplyScalar(140)).add(new THREE.Vector3(p.x, 0, p.z));
    sun.target.position.set(p.x, p.y, p.z);
  }

  const clock = new THREE.Clock();
  const waterMat = () => materialCache["water"];

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    updatePlayer(dt);

    // selection highlight
    const hit = document.pointerLockElement === canvas ? raycast() : null;
    if (hit) { hl.visible = true; hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); }
    else hl.visible = false;

    // animate clouds + water
    const t = clock.elapsedTime;
    clouds.material.map.offset.x = (t * 0.004) % 1;
    clouds.material.map.offset.y = (t * 0.0022) % 1;
    const wm = waterMat();
    if (wm && wm.normalMap) {
      wm.normalMap.offset.set((t * 0.03) % 1, (t * 0.02) % 1);
    }

    frames++; fpsTime += dt;
    if (fpsTime >= 0.5) { fps = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
    hud.textContent =
      `FPS ${fps}  |  XYZ ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}` +
      `  |  ${player.fly ? "FLY" : "WALK"}  |  Block: ${BLOCKS[HOTBAR[selected]].name}`;

    renderer.render(scene, camera);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
