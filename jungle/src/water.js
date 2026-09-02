// Water: TSL surface material (screen-space refraction, planar reflection,
// depth-based absorption, animated shoreline/plunge-pool/river foam, detail
// normals, sun glints, underwater Snell's-window view), an interactive GPU
// ripple simulation (ping-pong wave equation in fragment passes), a
// terrain-fitted layered waterfall, shoreline boulders, lily pads and reeds.
//
// Rules honoured throughout: textures are only ever sampled in the fragment
// stage (vertex displacement is analytic), smoothstep edges always increase,
// every repeated object is a single InstancedMesh, all placement is seeded.

import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  texture,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  positionLocal,
  positionGeometry,
  positionWorld,
  normalWorld,
  time,
  sin,
  cos,
  normalize,
  reflect,
  refract,
  dot,
  max,
  min,
  pow,
  smoothstep,
  mix,
  clamp,
  abs,
  exp,
  uv,
  Fn,
  cameraPosition,
  reflector,
  attribute,
  instanceIndex,
  hash,
  screenUV,
  viewportSharedTexture,
  length,
  step,
  floor,
  fract,
  normalMap,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, createFbm2D, smoothstep as smoothstepJs, clamp as clampJs } from './noise.js';
import { riverCenterX } from './terrain.js';
import { GROUND_COVER_LAYER } from './vegetation.js';

const TAU = Math.PI * 2;

// Analytic waves — mirrored in JS so floating props can ride them on the CPU.
const WAVES = [
  { dirX: 0.8, dirZ: 0.6, freq: 0.5, amp: 0.05, speed: 0.9 },
  { dirX: -0.62, dirZ: 0.78, freq: 1.13, amp: 0.027, speed: 1.4 },
  { dirX: 0.16, dirZ: -0.99, freq: 2.31, amp: 0.013, speed: 1.9 },
];

export function waveHeightAt(x, z, t) {
  let h = 0;
  for (const w of WAVES) {
    h += w.amp * Math.sin((x * w.dirX + z * w.dirZ) * w.freq + t * w.speed);
  }
  return h;
}

// TSL twin of waveHeightAt (vertex-stage safe: pure math, no texture reads).
function waveHeightNode(xz) {
  let h = float(0);
  for (const w of WAVES) {
    h = h.add(sin(xz.x.mul(w.dirX).add(xz.y.mul(w.dirZ)).mul(w.freq).add(time.mul(w.speed))).mul(w.amp));
  }
  return h;
}

// pow() with a negative base is undefined in GLSL — square explicitly.
const sq = (x) => x.mul(x);

const RIPPLE_DOMAIN = 56; // meters covered by the simulation around the player

// ---------------------------------------------------------------------------
// procedural textures (seeded, generated here — see rule 15)
// ---------------------------------------------------------------------------

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function finishTexture(tex, { srgb = false, repeat = true } = {}) {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Tileable multi-channel noise: R = foam fbm (contrasty), G = fine streaky
// noise, B = second fbm at another seed. Tileability via 4-corner blending.
function createWaterNoiseTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const fbmA = createFbm2D(WORLD.seed + 1201, { octaves: 5, gain: 0.55 });
  const fbmB = createFbm2D(WORLD.seed + 1202, { octaves: 4, gain: 0.5 });
  const fbmC = createFbm2D(WORLD.seed + 1203, { octaves: 5, gain: 0.62 });

  const tileable = (fbm, x, y, scale) => {
    const s = size;
    const f = (px, py) => fbm(px * scale, py * scale);
    const wx = x / s;
    const wy = y / s;
    return (
      f(x, y) * (1 - wx) * (1 - wy) +
      f(x - s, y) * wx * (1 - wy) +
      f(x, y - s) * (1 - wx) * wy +
      f(x - s, y - s) * wx * wy
    );
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = tileable(fbmA, x, y, 0.021);
      const b = tileable(fbmB, x, y, 0.07);
      const c = tileable(fbmC, x, y, 0.034);
      const idx = (y * size + x) * 4;
      image.data[idx] = Math.round(clampJs(a * 0.62 + 0.5, 0, 1) * 255);
      image.data[idx + 1] = Math.round(clampJs(b * 0.7 + 0.5, 0, 1) * 255);
      image.data[idx + 2] = Math.round(clampJs(c * 0.62 + 0.5, 0, 1) * 255);
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return finishTexture(new THREE.CanvasTexture(canvas));
}

// Tileable fine-ripple normal map (RG = slope), built from many small sine
// waves with integer frequencies so it wraps seamlessly.
function createRippleNormalTexture(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = mulberry32(WORLD.seed + 1301);
  const waves = [];
  for (let i = 0; i < 18; i += 1) {
    const angle = random() * TAU;
    const freq = 4 + Math.floor(random() * 14);
    const fx = Math.round(Math.cos(angle) * freq);
    const fy = Math.round(Math.sin(angle) * freq);
    waves.push({ fx, fy, phase: random() * TAU, amp: (0.4 + random() * 0.6) / Math.max(1, Math.hypot(fx, fy) * 0.35) });
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const arg = ((x * w.fx + y * w.fy) / size) * TAU + w.phase;
        const c = Math.cos(arg) * w.amp;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      const idx = (y * size + x) * 4;
      image.data[idx] = Math.round(clampJs(dx * 0.045 + 0.5, 0, 1) * 255);
      image.data[idx + 1] = Math.round(clampJs(dy * 0.045 + 0.5, 0, 1) * 255);
      image.data[idx + 2] = 255;
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return finishTexture(new THREE.CanvasTexture(canvas));
}

// Reed / cattail clump card: thin stalks, a few brown seed heads, leaf blades.
function createReedTexture() {
  const canvas = makeCanvas(128, 512);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(WORLD.seed + 1401);
  ctx.clearRect(0, 0, 128, 512);

  const stalk = (x0, lean, topY, w0, w1, c0, c1) => {
    const g = ctx.createLinearGradient(0, 512, 0, topY);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - w0 / 2, 512);
    ctx.quadraticCurveTo(x0 + lean * 0.35 - w1 / 2, (512 + topY) * 0.5, x0 + lean - w1 / 2, topY);
    ctx.lineTo(x0 + lean + w1 / 2, topY);
    ctx.quadraticCurveTo(x0 + lean * 0.35 + w1 / 2, (512 + topY) * 0.5, x0 + w0 / 2, 512);
    ctx.closePath();
    ctx.fill();
  };

  // leaf blades (wide, short, strongly leaning)
  for (let i = 0; i < 5; i += 1) {
    const x0 = 30 + random() * 68;
    const lean = (random() - 0.5) * 90;
    stalk(x0, lean, 250 + random() * 120, 9 + random() * 5, 1.5, '#2f5e22', '#7fb04a');
  }
  // stalks
  for (let i = 0; i < 10; i += 1) {
    const x0 = 22 + random() * 84;
    const lean = (random() - 0.5) * 34;
    const topY = 20 + random() * 150;
    stalk(x0, lean, topY, 4 + random() * 2.5, 1.8, '#3b6a2a', '#a9c65a');
    if (random() < 0.45 && topY < 120) {
      // cattail seed head
      const hx = x0 + lean;
      const hy = topY + 18;
      const hh = 44 + random() * 26;
      const g = ctx.createLinearGradient(hx - 6, 0, hx + 6, 0);
      g.addColorStop(0, '#4a2d15');
      g.addColorStop(0.45, '#7a4b25');
      g.addColorStop(1, '#3c2411');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(hx - 5.5, hy, 11, hh, 5.5);
      ctx.fill();
      ctx.strokeStyle = '#b9c96a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + (random() - 0.5) * 6, hy - 22 - random() * 14);
      ctx.stroke();
    }
  }
  return finishTexture(new THREE.CanvasTexture(canvas), { srgb: true, repeat: false });
}

// ---------------------------------------------------------------------------
// ripple simulation
// ---------------------------------------------------------------------------

function createRippleSim(renderer, size) {
  const options = {
    type: THREE.HalfFloatType,
    format: THREE.RGFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  };
  let rtA = new THREE.RenderTarget(size, size, options);
  let rtB = new THREE.RenderTarget(size, size, options);

  // Uninitialized render targets contain garbage which the wave equation then
  // treats as real water state — write flat zeros into both first.
  {
    const zeroMaterial = new THREE.NodeMaterial();
    zeroMaterial.fragmentNode = vec4(0, 0, 0, 1);
    const zeroQuad = new THREE.QuadMesh(zeroMaterial);
    const prevRT = renderer.getRenderTarget();
    for (const rt of [rtA, rtB]) {
      renderer.setRenderTarget(rt);
      zeroQuad.render(renderer);
    }
    renderer.setRenderTarget(prevRT);
  }

  const texel = 1 / size;
  const prevTexture = texture(rtA.texture);
  const uCenter = uniform(new THREE.Vector2(0, 0));
  const uPrevCenter = uniform(new THREE.Vector2(0, 0));
  // xy = world xz of the impulse, z = strength, w = radius
  const impulses = [
    uniform(new THREE.Vector4(0, 0, 0, 1)),
    uniform(new THREE.Vector4(0, 0, 0, 1)),
    uniform(new THREE.Vector4(0, 0, 0, 1)),
    uniform(new THREE.Vector4(0, 0, 0, 1)),
    uniform(new THREE.Vector4(0, 0, 0, 1)),
    uniform(new THREE.Vector4(0, 0, 0, 1)),
  ];

  const material = new THREE.NodeMaterial();
  material.fragmentNode = Fn(() => {
    // re-project into the previous frame's domain (the domain follows the player)
    const shift = uCenter.sub(uPrevCenter).div(RIPPLE_DOMAIN);
    const u = uv().add(shift);

    const center = prevTexture.sample(u);
    const hL = prevTexture.sample(u.add(vec2(-texel, 0))).r;
    const hR = prevTexture.sample(u.add(vec2(texel, 0))).r;
    const hD = prevTexture.sample(u.add(vec2(0, -texel))).r;
    const hU = prevTexture.sample(u.add(vec2(0, texel))).r;

    const laplacian = hL.add(hR).add(hD).add(hU).mul(0.25).sub(center.r);
    let velocity = center.g.add(laplacian.mul(1.35)).mul(0.976);

    // impulses (player steps, swimming, waterfall churn) — Laplacian-of-Gaussian
    // shape so each splash is zero-mean and can't pump net volume into the sim
    const worldPos = uv().sub(0.5).mul(RIPPLE_DOMAIN).add(uCenter);
    for (const imp of impulses) {
      const d2 = worldPos.sub(imp.xy).lengthSq().div(imp.w.mul(imp.w));
      const splash = exp(d2.negate()).mul(float(1).sub(d2.mul(2))).mul(imp.z);
      velocity = velocity.add(splash);
    }

    let height = center.r.add(velocity).mul(0.993);

    // fade at the domain border so waves never bounce off the edge
    const border = smoothstep(0.0, 0.08, uv().x)
      .mul(smoothstep(0.92, 1.0, uv().x).oneMinus())
      .mul(smoothstep(0.0, 0.08, uv().y))
      .mul(smoothstep(0.92, 1.0, uv().y).oneMinus());
    // hard stability clamp — the sim can never blow up past these bounds
    height = clamp(height.mul(border), -0.6, 0.6);
    velocity = clamp(velocity.mul(border), -0.5, 0.5);

    return vec4(height, velocity, 0, 1);
  })();

  const quad = new THREE.QuadMesh(material);
  const pending = [];
  const center = new THREE.Vector2(0, 0);
  const prevCenter = new THREE.Vector2(0, 0);
  const snap = RIPPLE_DOMAIN / size;

  function addImpulse(x, z, strength, radius = 0.55) {
    if (pending.length < 16) {
      pending.push({ x, z, strength, radius });
    }
  }

  function update(playerPos) {
    prevCenter.copy(center);
    center.set(Math.round(playerPos.x / snap) * snap, Math.round(playerPos.z / snap) * snap);
    uCenter.value.copy(center);
    uPrevCenter.value.copy(prevCenter);

    for (let i = 0; i < impulses.length; i += 1) {
      const imp = pending[i];
      if (imp) {
        impulses[i].value.set(imp.x, imp.z, imp.strength, imp.radius);
      } else {
        impulses[i].value.set(0, 0, 0, 1);
      }
    }
    pending.length = 0;

    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(rtB);
    quad.render(renderer);
    renderer.setRenderTarget(prevRT);

    // swap: rtA always holds the latest state
    const tmp = rtA;
    rtA = rtB;
    rtB = tmp;
    prevTexture.value = rtA.texture;
  }

  return {
    update,
    addImpulse,
    textureNode: prevTexture,
    centerUniform: uCenter,
    size,
  };
}

// ---------------------------------------------------------------------------
// terrain bake: R = terrain height (m), G = river mask, B = river flow dir x,
// A = lagoon mask. Half-float so the shoreline foam has no height banding.
// ---------------------------------------------------------------------------

function bakeTerrainData(terrain) {
  const size = 512;
  const data = new Uint16Array(size * size * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const lagoon = WORLD.lagoonCenter;
  for (let iz = 0; iz < size; iz += 1) {
    const z = ((iz + 0.5) / size - 0.5) * WORLD.size;
    for (let ix = 0; ix < size; ix += 1) {
      const x = ((ix + 0.5) / size - 0.5) * WORLD.size;
      const h = terrain.sampleHeight(x, z);
      let river = 0;
      let flowX = 0;
      if (z > lagoon.z) {
        const rx = riverCenterX(z);
        const dx = Math.abs(x - rx);
        river = smoothstepJs(WORLD.riverHalfWidth + 5, WORLD.riverHalfWidth - 4, dx) * smoothstepJs(-8, 24, z);
        flowX = (riverCenterX(z + 1) - riverCenterX(z - 1)) * 0.5;
      }
      const dist = Math.hypot(x - lagoon.x, z - lagoon.z);
      const lagoonMask = smoothstepJs(WORLD.lagoonRadius + 4, WORLD.lagoonRadius - 6, dist);
      const idx = (iz * size + ix) * 4;
      data[idx] = toHalf(h);
      data[idx + 1] = toHalf(river);
      data[idx + 2] = toHalf(flowX);
      data[idx + 3] = toHalf(lagoonMask);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// waterfall: profile fitted to the terrain at startup so the sheet always
// pours off whatever crest the cliff actually has, hugs a slope where the rock
// slopes, and free-falls where it is vertical.
// ---------------------------------------------------------------------------

function makeFallProfile(terrain, cx, halfWidth, { zPool, maxCrest = 19.5, scanLength = 34 }) {
  const stepZ = 0.25;
  const xs = [-0.9, -0.45, 0, 0.45, 0.9].map((k) => cx + k * halfWidth);
  const maxAt = (z) => Math.max(...xs.map((x) => terrain.sampleHeight(x, z)));
  // monotone envelope of the rock face, scanning north from the pool
  const env = [];
  let run = -Infinity;
  for (let z = zPool; z >= zPool - scanLength; z -= stepZ) {
    run = Math.max(run, maxAt(z));
    env.push({ z, h: run });
  }
  const reach = env[env.length - 1].h;
  const crestY = clampJs(reach - 0.9, 5, maxCrest);
  const zAt = (y) => {
    for (let i = 0; i < env.length; i += 1) {
      if (env[i].h >= y) {
        if (i === 0) return env[0].z;
        const a = env[i - 1];
        const b = env[i];
        const t = (y - a.h) / Math.max(1e-6, b.h - a.h);
        return a.z + (b.z - a.z) * t;
      }
    }
    return env[env.length - 1].z;
  };
  const zWater = zAt(WORLD.waterLevel);
  const zCrest = zAt(crestY);
  const yBottom = WORLD.waterLevel - 0.7;
  const lipLength = 3.4;

  // v: 0 = pool, 1 = crest, 1..1.25 = lip curling back over the plateau
  const at = (v) => {
    if (v <= 1) {
      const y = yBottom + v * (crestY - yBottom);
      const zRock = zAt(Math.max(y, WORLD.waterLevel));
      const clearance = 0.55 + 0.9 * (1 - v);
      const bulge = Math.pow(Math.max(0, 1 - v / 0.42), 2) * 1.7;
      return { y, z: zRock + clearance + bulge };
    }
    const t = Math.min(1, (v - 1) / 0.25);
    const z = zCrest + 0.55 - lipLength * t;
    const y = Math.max(crestY + 0.38 * (1 - (1 - t) * (1 - t)), maxAt(z) + 0.22);
    return { y, z };
  };

  return { at, crestY, zCrest, zWater, impact: { x: cx, z: at(0).z + 0.5 }, maxAt };
}

// One strip of the fall. Layers are concatenated back-to-front into a single
// geometry so the whole waterfall (all sheets + haze + side fall) is one draw.
function buildFallStrip({ profile, cx, halfWidth, rows, cols, vMax, zOffset, widthScale, widthProfile, params, style }) {
  const positions = [];
  const uvs = [];
  const aParams = [];
  const aStyle = [];
  const index = [];
  for (let r = 0; r <= rows; r += 1) {
    const v = (r / rows) * vMax;
    const { y, z } = profile(v);
    const wp = widthProfile ? widthProfile(v) : 1;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      positions.push(cx + (u - 0.5) * 2 * halfWidth * wp * widthScale, y, z + zOffset);
      uvs.push(u, v);
      aParams.push(...params);
      aStyle.push(...style);
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aParams', new THREE.Float32BufferAttribute(aParams, 4));
  geo.setAttribute('aStyle', new THREE.Float32BufferAttribute(aStyle, 4));
  geo.setIndex(index);
  // Real normals matter even for an unlit sheet: the post pipeline's scene
  // pass writes view normals to an MRT attachment for GTAO, and a transparent
  // quad stamps its normal over its whole footprint. Without this attribute the
  // fallback normal ends up facing away from the camera and the AO pass turns
  // everything behind the sheet black.
  geo.computeVertexNormals();
  return geo;
}

// aParams = (scroll speed, streak scale y, streak scale x, alpha multiplier)
// aStyle  = (brightness, wobble amplitude, phase, kind: 0 main sheet, 1 haze, 2 side sheet)
function buildFallMaterial(noiseTex, sunDir) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const params = attribute('aParams', 'vec4');
  const style = attribute('aStyle', 'vec4');
  const u = uv().x;
  const v = uv().y;

  // ---- vertex: analytic horizontal wobble growing toward the plunge ----
  const fallFrac = clamp(v, 0, 1).oneMinus();
  const wob1 = sin(v.mul(6.5).add(time.mul(2.3)).add(style.z)).mul(style.y).mul(pow(fallFrac, 1.4));
  const wob2 = sin(v.mul(11.0).sub(time.mul(3.4)).add(style.z.mul(1.9))).mul(style.y.mul(0.45)).mul(fallFrac);
  const wobZ = sin(v.mul(4.7).add(time.mul(1.7)).add(style.z.mul(0.7))).mul(style.y.mul(0.6)).mul(fallFrac);
  material.positionNode = positionLocal.add(vec3(wob1.add(wob2), 0, wobZ));

  // kind selectors (0/1 floats, no branching)
  const isHaze = smoothstep(0.5, 0.6, style.w).mul(smoothstep(1.4, 1.5, style.w).oneMinus());
  const isSide = smoothstep(1.5, 1.6, style.w);

  // ---- fragment: falling streaks (accelerating coordinate stretches the
  // texture toward the bottom, so the water visibly speeds up as it falls) ----
  const speed = params.x;
  const scaleY = params.y;
  const scaleX = params.z;
  const s = pow(v.add(0.3), 1.5);
  const sy = s.mul(scaleY).add(time.mul(speed));
  const nA = texture(noiseTex, vec2(u.mul(scaleX).add(style.z.mul(0.13)), sy)).g;
  const nB = texture(noiseTex, vec2(u.mul(scaleX).mul(2.3).add(0.37), s.mul(scaleY).mul(1.7).add(time.mul(speed).mul(1.45)))).b;
  const nC = texture(noiseTex, vec2(u.mul(scaleX).mul(0.5).add(0.11), s.mul(scaleY).mul(0.35).add(time.mul(speed).mul(0.5)))).r;
  const streak = smoothstep(0.52, 0.82, nA.mul(0.55).add(nB.mul(0.45)));
  const core = smoothstep(0.26, 0.66, nC.mul(0.6).add(nA.mul(0.4)));
  const pulse = sin(sy.mul(7.5).add(nB.mul(2.5))).mul(0.5).add(0.5).mul(0.12);

  const uRagged = u.add(nA.sub(0.5).mul(0.14));
  const edge = smoothstep(0.0, 0.14, uRagged).mul(smoothstep(0.86, 1.0, uRagged).oneMinus());
  const topFade = smoothstep(1.1, 1.26, v).oneMinus();
  // the base whitens as the sheet aerates, but stays streaky — a solid white
  // block at the bottom reads as paper, not water
  const bottomWhite = smoothstep(0.0, 0.24, v).oneMinus().mul(0.38).mul(nB.mul(0.5).add(0.6));
  const lipFoam = exp(sq(v.sub(1.0).div(0.05)).negate()).mul(0.6);
  // just under the lip the sheet detaches from the rock and thins to glass
  const lipShadow = exp(sq(v.sub(0.9).div(0.045)).negate());

  // gaps torn into the main sheet by the crest rocks; the streams re-merge lower down
  const gap = (gu, gw) => exp(sq(u.sub(gu).div(gw)).negate()).mul(smoothstep(0.5, 0.92, v));
  const gapMask = mix(float(1).sub(gap(0.31, 0.05).add(gap(0.69, 0.045)).min(1)), float(1), isSide);

  // braids: the sheet is denser in some columns than others, so it reads as
  // ropes of water with thin glassy gaps instead of uniform static
  const braids = mix(float(0.6), float(1.05), core);
  const sheetAlpha = core
    .mul(0.5)
    .add(streak.mul(0.6))
    .add(pulse)
    .add(bottomWhite.mul(0.6))
    .add(lipFoam.mul(0.5))
    .mul(braids)
    .mul(lipShadow.mul(0.3).oneMinus())
    .mul(params.w)
    .mul(edge)
    .mul(topFade)
    .mul(gapMask);

  // base haze: soft, slowly rising mist that hides the sheet/pool seam
  const hz = texture(noiseTex, vec2(u.mul(2.2).add(style.z), v.mul(1.1).sub(time.mul(0.25)))).r;
  const hazeAlpha = smoothstep(0.35, 0.8, hz)
    .mul(0.45)
    .mul(smoothstep(0.0, 0.15, v))
    .mul(smoothstep(0.35, 1.0, v).oneMinus())
    .mul(smoothstep(0.0, 0.2, u))
    .mul(smoothstep(0.8, 1.0, u).oneMinus())
    .mul(params.w);

  material.opacityNode = clamp(mix(sheetAlpha, hazeAlpha, isHaze), 0, 1);

  const whiteness = clamp(streak.mul(0.85).add(bottomWhite).add(lipFoam), 0, 1);
  // translucent body is a cool grey-teal so the bright streaks have contrast
  const sheetColor = mix(vec3(0.5, 0.7, 0.8), vec3(1.02, 1.03, 1.03), whiteness).mul(style.x);
  // side light from the sun, the cliff's shadow over the base, glassy dip under the lip
  const shade = float(0.92)
    .add(sunDir.x.mul(u.sub(0.5)).mul(0.5))
    .mul(mix(float(0.8), float(1.0), smoothstep(0.0, 0.45, v)))
    .mul(lipShadow.mul(0.18).oneMinus());
  material.colorNode = mix(sheetColor.mul(shade), vec3(0.9, 0.96, 1.0), isHaze);
  return material;
}

// ---------------------------------------------------------------------------
// rocks: three seeded silhouettes (two blocky slabs, one rounded cobble), each
// its own InstancedMesh so no instance pays vertex work for shapes it doesn't
// show. Silhouettes come from planar "cleavage" cuts of an icosphere followed
// by fbm displacement — flat weathered faces with sharp-ish edges, not blobs.
// ---------------------------------------------------------------------------

function makeRockGeometry(seed, { detail, scale, roughness, cuts, cutDepth }) {
  let geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  const random = mulberry32(seed);
  const fbmA = createFbm2D(seed, { octaves: 4, gain: 0.55 });
  const fbmB = createFbm2D(seed + 11, { octaves: 3, gain: 0.5 });
  const planes = [];
  for (let i = 0; i < cuts; i += 1) {
    const n = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    planes.push({ n, d: 1 - cutDepth * (0.35 + random() * 0.65) });
  }
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // planar cuts: slice off caps of the sphere → flat cleavage faces
    for (const { n, d } of planes) {
      const over = p.dot(n) - d;
      if (over > 0) p.addScaledVector(n, -over);
    }
    // position-driven displacement keeps shared vertices watertight; the third
    // octave is fine grit so the cleavage planes don't read as polished facets
    const n = fbmA(p.x * 1.6 + 7.1, p.y * 1.6 + p.z * 0.9) * 0.55 + fbmB(p.y * 3.1 + 3.3, p.z * 3.1 + p.x * 0.7) * 0.3
      + fbmB(p.z * 7.3 + 1.7, p.x * 7.1 - p.y * 2.9) * 0.15;
    const r = 1 + n * roughness;
    pos.setXYZ(i, p.x * r * scale[0], p.y * r * scale[1], p.z * r * scale[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // spherical uvs: the triplanar material only needs them for the tangent
  // frame of its normal map, so the atan seam is harmless
  const uvArr = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uvArr[i * 2] = Math.atan2(pos.getZ(i), pos.getX(i)) / TAU + 0.5;
    uvArr[i * 2 + 1] = pos.getY(i) * 0.5 + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
  return geo;
}

// variant 0/1: boulders (blocky, slab-ish); variant 2: rounded cobble (pebbles,
// wake rocks and crest rocks — anything that must read as a smooth stone)
function buildRockGeometries() {
  return [
    // water-worn: mostly rounded, two or three shallow cleavage planes each
    makeRockGeometry(WORLD.seed + 31, { detail: 6, scale: [1.0, 0.8, 0.9], roughness: 0.2, cuts: 3, cutDepth: 0.2 }),
    makeRockGeometry(WORLD.seed + 32, { detail: 6, scale: [1.3, 0.66, 0.85], roughness: 0.22, cuts: 3, cutDepth: 0.24 }),
    makeRockGeometry(WORLD.seed + 33, { detail: 4, scale: [0.95, 0.9, 1.05], roughness: 0.24, cuts: 2, cutDepth: 0.12 }),
  ];
}

function buildRockMaterial(rockTex, noiseTex, rockNormalTex = null) {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });

  // triplanar rock albedo (world space, so instance scale never stretches it)
  const wp = positionWorld;
  const n = normalWorld;
  const w = pow(abs(n), vec3(4));
  const wn = w.div(w.x.add(w.y).add(w.z).max(1e-4));
  const s = 0.2;
  const tx = texture(rockTex, wp.zy.mul(s)).rgb;
  const ty = texture(rockTex, wp.xz.mul(s)).rgb;
  const tz = texture(rockTex, wp.xy.mul(s)).rgb;
  let albedo = tx.mul(wn.x).add(ty.mul(wn.y)).add(tz.mul(wn.z));
  // finer octave so the joints hold up when the player wades right up to one
  const sf = 0.7;
  const fine = texture(rockTex, wp.zy.mul(sf).add(0.43)).rgb.mul(wn.x)
    .add(texture(rockTex, wp.xz.mul(sf).add(0.43)).rgb.mul(wn.y))
    .add(texture(rockTex, wp.xy.mul(sf).add(0.43)).rgb.mul(wn.z));
  albedo = albedo.mul(fine.mul(1.1).add(0.79));
  // cooler, slightly desaturated water-worn stone; per-instance tone spread
  const lum = dot(albedo, vec3(0.3, 0.59, 0.11));
  albedo = mix(albedo, vec3(lum), 0.3).mul(vec3(0.88, 0.9, 0.93));
  albedo = albedo.mul(mix(float(0.78), float(1.2), hash(instanceIndex.add(5))));
  // crevice darkening from a coarser triplanar noise sample (fragment stage)
  const crev = texture(noiseTex, wp.xz.mul(0.9).add(wp.y.mul(0.37))).b.mul(wn.y)
    .add(texture(noiseTex, wp.zy.mul(0.9).add(0.31)).b.mul(wn.x))
    .add(texture(noiseTex, wp.xy.mul(0.9).add(0.62)).b.mul(wn.z));
  albedo = albedo.mul(mix(float(0.78), float(1.08), smoothstep(0.3, 0.7, crev)));
  if (rockNormalTex) {
    const nx = texture(rockNormalTex, wp.zy.mul(s)).rgb.mul(wn.x)
      .add(texture(rockNormalTex, wp.xz.mul(s)).rgb.mul(wn.y))
      .add(texture(rockNormalTex, wp.xy.mul(s)).rgb.mul(wn.z));
    material.normalNode = normalMap(nx, vec2(0.8));
  }

  // moss on the sunward tops of dry rocks
  const mossNoise = texture(noiseTex, wp.xz.mul(0.35).add(hash(instanceIndex.add(9)))).r;
  const moss = smoothstep(0.35, 0.9, n.y).mul(smoothstep(0.45, 0.72, mossNoise)).mul(smoothstep(-0.2, 0.6, wp.y));
  albedo = mix(albedo, vec3(0.2, 0.36, 0.12).mul(albedo.add(0.45)), moss.mul(0.8));

  // wet band at the waterline; the submerged body stays dark (wet stone) with
  // a faint algae-green cast so it never glows through the surface
  const wet = smoothstep(0.05, 0.6, wp.y).oneMinus();
  const submerged = smoothstep(-1.2, -0.05, wp.y).oneMinus();
  const darken = mix(float(0.62), float(0.52), submerged);
  albedo = albedo.mul(mix(float(1), darken, wet)).mul(mix(vec3(1), vec3(0.82, 0.95, 0.74), submerged));

  material.colorNode = albedo;
  // faint bounce so the shadow side of a shore boulder keeps its texture
  // instead of crushing to a black silhouette against the bright water
  material.emissiveNode = albedo.mul(0.06);
  material.roughnessNode = mix(float(0.95), float(0.5), wet);
  return material;
}

// ---------------------------------------------------------------------------
// lily pads: notched dome disc + optional flower, one instanced draw.
// aPart = 0 pad, 1 flower (flower collapses on instances with index % 4 != 0)
// ---------------------------------------------------------------------------

function buildLilyGeometry() {
  const positions = [];
  const uvs = [];
  const colors = [];
  const parts = [];
  const index = [];
  const push = (x, y, z, u, v, c, part) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(...c);
    parts.push(part);
    return positions.length / 3 - 1;
  };
  const green = [0.16, 0.42, 0.13];
  const greenLight = [0.24, 0.52, 0.18];

  // pad: fan with a notch, two rings for a slight dome and up-turned rim
  const segs = 26;
  const notch = 0.5;
  const center = push(0, 0.05, 0, 0.5, 0, greenLight, 0);
  const ringA = [];
  const ringB = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = notch / 2 + (i / segs) * (TAU - notch);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ringA.push(push(ca * 0.55, 0.036, sa * 0.55, a / TAU, 0.55, greenLight, 0));
    ringB.push(push(ca, 0.018, sa, a / TAU, 1.0, green, 0));
  }
  for (let i = 0; i < segs; i += 1) {
    index.push(center, ringA[i], ringA[i + 1]);
    index.push(ringA[i], ringB[i], ringB[i + 1], ringA[i], ringB[i + 1], ringA[i + 1]);
  }

  // flower: two whorls of petals + centre
  const petal = (count, len, tilt, yBase, c0, c1, offset) => {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * TAU + offset;
      const dir = [Math.cos(a), Math.sin(a)];
      const perp = [-dir[1], dir[0]];
      const wHalf = len * 0.2;
      const r0 = 0.03;
      const r1 = r0 + len * Math.cos(tilt) * 0.55;
      const r2 = r0 + len * Math.cos(tilt);
      const h1 = yBase + len * Math.sin(tilt) * 0.55;
      const h2 = yBase + len * Math.sin(tilt);
      const b = push(dir[0] * r0, yBase, dir[1] * r0, 0.5, 0, c0, 1);
      const l = push(dir[0] * r1 + perp[0] * wHalf, h1, dir[1] * r1 + perp[1] * wHalf, 0.5, 0.5, c0, 1);
      const rr = push(dir[0] * r1 - perp[0] * wHalf, h1, dir[1] * r1 - perp[1] * wHalf, 0.5, 0.5, c0, 1);
      const tip = push(dir[0] * r2, h2, dir[1] * r2, 0.5, 1, c1, 1);
      index.push(b, l, tip, b, tip, rr);
    }
  };
  petal(8, 0.46, 0.95, 0.05, [1.0, 0.86, 0.92], [0.98, 0.42, 0.66], 0);
  petal(6, 0.34, 1.25, 0.06, [1.0, 0.93, 0.96], [1.0, 0.6, 0.78], 0.4);
  const cc = push(0, 0.16, 0, 0.5, 0.5, [1.0, 0.85, 0.3], 1);
  const ring = [];
  for (let i = 0; i <= 6; i += 1) {
    const a = (i / 6) * TAU;
    ring.push(push(Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.08, 0.5, 0.5, [0.95, 0.72, 0.2], 1));
  }
  for (let i = 0; i < 6; i += 1) index.push(cc, ring[i], ring[i + 1]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
  return geo;
}

function buildLilyMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const part = attribute('aPart', 'float');
  const col = attribute('aColor', 'vec3');
  const hasFlower = step(instanceIndex.toFloat().mod(4.0), 0.5);
  const keep = float(1).sub(part.mul(float(1).sub(hasFlower)));
  // pads ride the analytic waves (positionLocal is already instance-transformed here)
  material.positionNode = positionLocal.add(vec3(0, waveHeightNode(positionLocal.xz), 0)).mul(keep);

  const u = uv().x;
  const r = uv().y;
  const veins = smoothstep(0.9, 0.985, abs(sin(u.mul(Math.PI * 9)))).mul(smoothstep(0.15, 0.5, r));
  const shade = mix(float(0.86), float(1.14), hash(instanceIndex.add(17)));
  let pad = col.mul(float(1).sub(veins.mul(0.25))).mul(shade);
  pad = mix(pad, vec3(0.42, 0.26, 0.1), smoothstep(0.9, 1.0, r).mul(0.4));
  material.colorNode = mix(pad, col, part);
  return material;
}

// ---------------------------------------------------------------------------
// reeds: fanned tall cards + flipped-winding copy (two-sided without DoubleSide)
// ---------------------------------------------------------------------------

function buildReedGeometry() {
  const random = mulberry32(WORLD.seed + 1501);
  const parts = [];
  const height = 2.6;
  for (let i = 0; i < 5; i += 1) {
    const card = new THREE.PlaneGeometry(0.5, height, 1, 4);
    card.translate(0, height / 2, 0);
    const pos = card.attributes.position;
    const lean = (random() - 0.5) * 0.3;
    for (let k = 0; k < pos.count; k += 1) {
      const t = pos.getY(k) / height;
      pos.setZ(k, pos.getZ(k) + t * t * lean);
    }
    card.rotateY((i / 5) * TAU + (random() - 0.5) * 0.5);
    card.translate((random() - 0.5) * 0.16, 0, (random() - 0.5) * 0.16);
    card.computeVertexNormals();
    parts.push(card);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  // soften normals toward up so the clump takes light like the ground
  const normal = merged.attributes.normal;
  for (let i = 0; i < normal.count; i += 1) {
    const nx = normal.getX(i) * 0.4;
    const ny = Math.abs(normal.getY(i)) * 0.4 + 0.6;
    const nz = normal.getZ(i) * 0.4;
    const len = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(i, nx / len, ny / len, nz / len);
  }
  const flipped = merged.clone();
  const idx = flipped.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const tmp = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = tmp;
  }
  const twoSided = mergeGeometries([merged, flipped]);
  merged.dispose();
  flipped.dispose();
  twoSided.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
  return twoSided;
}

function buildReedMaterial(reedTex) {
  const material = new THREE.MeshStandardNodeMaterial({
    map: reedTex,
    roughness: 0.85,
    metalness: 0,
    alphaTest: 0.45,
    side: THREE.FrontSide,
  });
  const phase = hash(instanceIndex).mul(TAU);
  const t = time.mul(1.3).add(phase);
  const gust = sin(t).add(sin(t.mul(1.71).add(1.3)).mul(0.5)).add(sin(t.mul(3.13).add(2.2)).mul(0.27));
  // positionGeometry is the raw (pre-instance) attribute → true height along the stalk
  const heightFactor = pow(clamp(positionGeometry.y.div(2.6), 0, 1), 1.6);
  const sway = gust.mul(0.11).mul(heightFactor);
  const dir = hash(instanceIndex.add(77)).mul(TAU);
  material.positionNode = positionLocal.add(vec3(sway.mul(cos(dir)), 0, sway.mul(sin(dir))));
  const tint = mix(float(0.8), float(1.15), hash(instanceIndex.add(123)));
  const mapColor = texture(reedTex);
  material.colorNode = mapColor.rgb.mul(tint);
  material.opacityNode = mapColor.a;
  return material;
}

// ---------------------------------------------------------------------------
// the water system
// ---------------------------------------------------------------------------

export function createWater(ctx) {
  const { scene, renderer, terrain, textures, player } = ctx;
  const random = mulberry32(WORLD.seed + 777);
  const lagoon = WORLD.lagoonCenter;

  const noiseTex = createWaterNoiseTexture();
  const normalTex = createRippleNormalTexture();
  const reedTex = createReedTexture();
  const ownTextures = [noiseTex, normalTex, reedTex];

  const ripple = createRippleSim(renderer, 256);
  const bakeTex = bakeTerrainData(terrain);
  const sunDir = uniform(ctx.sky.sunDirection.clone());

  // ---------------- waterfall profiles (fitted to the live terrain) ----------------
  const mainHalfWidth = 5.2;
  const mainFall = makeFallProfile(terrain, WORLD.waterfallX, mainHalfWidth, { zPool: lagoon.z - WORLD.lagoonRadius + 8 });
  const sideCx = WORLD.waterfallX + 10.5;
  const sideHalfWidth = 1.7;
  const sideFall = makeFallProfile(terrain, sideCx, sideHalfWidth, {
    zPool: lagoon.z - WORLD.lagoonRadius + 8,
    maxCrest: Math.max(5.5, mainFall.crestY * 0.55),
    scanLength: 30,
  });

  // impact points drive the plunge-pool foam and the ripple churn
  const uImpactMain = uniform(new THREE.Vector4(mainFall.impact.x, mainFall.impact.z, mainHalfWidth * 1.25, 1.0));
  const uImpactSide = uniform(new THREE.Vector4(sideFall.impact.x, sideFall.impact.z, sideHalfWidth * 1.6, 0.75));
  const impacts = [uImpactMain, uImpactSide];

  // Boil of the plunge pools: two radial swells per fall, decaying away from the
  // impact. Pure math from uniforms, so it is safe in the vertex stage (true
  // silhouette heave) and its analytic slope feeds the fragment normal.
  // Wavelengths stay ≥ 4.6 m — the 1.56 m surface quads can't carry finer.
  function plungeHeave(xz) {
    let h = float(0);
    let slope = vec2(0, 0);
    for (const imp of impacts) {
      const d = xz.sub(imp.xy);
      const r = length(d).max(0.001);
      const R = imp.z;
      const env = smoothstep(R.mul(0.2), R.mul(1.7), r).oneMinus().mul(imp.w);
      const p1 = r.mul(1.05).sub(time.mul(2.2));
      const p2 = r.mul(1.35).sub(time.mul(3.1)).add(d.x.mul(0.35));
      h = h.add(env.mul(sin(p1).mul(0.085).add(sin(p2).mul(0.05))));
      const dhdr = cos(p1).mul(0.085 * 1.05).add(cos(p2).mul(0.05 * 1.35));
      slope = slope.add(d.div(r).mul(dhdr).mul(env));
    }
    return { h, slope };
  }

  // IQ's smooth bilinear: push the interpolation weight through a smoothstep so
  // the 0.78 m bake texels give a C1 depth field — bilinear alone leaves a faint
  // quilt of kinks in every depth-driven term (foam edge, absorption).
  const BAKE_SIZE = bakeTex.image.width;
  function bakeSample(xz) {
    const t = xz.div(WORLD.size).add(0.5).mul(BAKE_SIZE).sub(0.5);
    const i = floor(t);
    const f = fract(t);
    const s = f.mul(f).mul(f.mul(-2).add(3));
    return texture(bakeTex, i.add(s).add(0.5).div(BAKE_SIZE));
  }

  // ---------------- shared surface node graph ----------------
  const worldXZ = positionWorld.xz;
  const rippleUV = (xz) => xz.sub(ripple.centerUniform).div(RIPPLE_DOMAIN).add(0.5);
  const rippleMaskFor = (ruv) =>
    smoothstep(0.0, 0.06, ruv.x)
      .mul(smoothstep(0.94, 1.0, ruv.x).oneMinus())
      .mul(smoothstep(0.0, 0.06, ruv.y))
      .mul(smoothstep(0.94, 1.0, ruv.y).oneMinus());

  // ripple slope (DC-offset-immune — the sim can carry a small bias)
  const rippleGradient = () => {
    const ruv = rippleUV(worldXZ);
    const mask = rippleMaskFor(ruv);
    const e = 0.45;
    const rC = ripple.textureNode.sample(ruv).r;
    const rX = ripple.textureNode.sample(rippleUV(worldXZ.add(vec2(e, 0)))).r;
    const rZ = ripple.textureNode.sample(rippleUV(worldXZ.add(vec2(0, e)))).r;
    return vec2(rX.sub(rC), rZ.sub(rC)).div(e).mul(mask);
  };

  function buildSurfaceMaterial({ reflectionNode, refraction }) {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    material.positionNode = positionLocal.add(vec3(0, waveHeightNode(positionLocal.xz).add(plungeHeave(positionLocal.xz).h), 0));

    const P = positionWorld;
    const xz = P.xz;
    const toCam = cameraPosition.sub(P);
    const dist = length(toCam);
    const viewDir = toCam.div(dist.max(0.001));
    // 1 when the camera is below the surface
    const under = step(cameraPosition.y, float(WORLD.waterLevel - 0.03));

    // ---- terrain bake: column depth, river mask + flow ----
    const bake = bakeSample(xz);
    const colDepth = float(WORLD.waterLevel).sub(bake.r);
    const river = bake.g;
    const flowDir = vec2(bake.b, 1).mul(river);
    const flowOffset = flowDir.mul(time.mul(0.65)); // world meters the river pattern has travelled

    // ---- foam noise (shared by several terms) ----
    const foamTexA = texture(noiseTex, xz.sub(flowOffset.mul(1.2)).mul(0.19).add(time.mul(vec2(0.012, -0.009)))).r;
    const foamTexB = texture(noiseTex, xz.sub(flowOffset.mul(0.9)).mul(0.41).add(time.mul(vec2(-0.02, 0.015)))).r;
    const foamPattern = smoothstep(0.47, 0.78, foamTexA.mul(0.55).add(foamTexB.mul(0.45)));
    const streakTex = texture(noiseTex, xz.sub(flowOffset.mul(1.5)).mul(vec2(0.5, 0.11))).g;
    // fine bubble speckle: foam is a mass of bubbles with grey-teal gaps, never flat white
    const bubbleTex = texture(noiseTex, xz.mul(0.8).add(time.mul(vec2(0.05, -0.03)))).g;

    // ---- plunge pools: boil heave (shared with the vertex stage), churn that
    // stays patterned right at the impact, rings and foam drifting outward ----
    const heave = plungeHeave(xz);
    let ringSlope = heave.slope;
    let fallFoam = float(0);
    for (const imp of impacts) {
      const d = xz.sub(imp.xy);
      const r = length(d).max(0.001);
      const R = imp.z;
      const radial = d.div(r);
      const falloff = smoothstep(R.mul(0.35), R.mul(1.35), r).oneMinus();
      const ringPhase = r.mul(2.2).sub(time.mul(2.4)).add(foamTexB.mul(2.0));
      const rings = smoothstep(0.62, 0.95, sin(ringPhase).mul(0.5).add(0.5));
      // foam rafts carried away from the impact along the radial direction
      const drift = texture(noiseTex, xz.mul(0.55).sub(radial.mul(time.mul(0.6)))).r;
      const churn = smoothstep(0.3, 0.78, foamTexA.mul(0.35).add(drift.mul(0.4)).add(foamTexB.mul(0.25)).add(falloff.mul(0.2)));
      fallFoam = fallFoam.add(falloff.mul(churn.mul(0.8).add(rings.mul(0.4))).mul(imp.w));
      ringSlope = ringSlope.add(radial.mul(cos(ringPhase)).mul(falloff).mul(0.12).mul(imp.w));
    }

    // ---- normals: analytic waves + ripple sim + fine scrolling detail ----
    let dhdx = float(0);
    let dhdz = float(0);
    for (const w of WAVES) {
      const phase = xz.x.mul(w.dirX).add(xz.y.mul(w.dirZ)).mul(w.freq).add(time.mul(w.speed));
      const slope = cos(phase).mul(w.amp * w.freq);
      dhdx = dhdx.add(slope.mul(w.dirX));
      dhdz = dhdz.add(slope.mul(w.dirZ));
    }
    const grad = rippleGradient().mul(2.8);
    const detailFade = smoothstep(20, 150, dist).oneMinus();
    const dUV1 = xz.sub(flowOffset).mul(0.55).add(time.mul(vec2(0.026, 0.019)));
    const dUV2 = xz.sub(flowOffset.mul(0.75)).mul(vec2(0.31, 0.27)).add(time.mul(vec2(-0.017, 0.023)));
    const d1 = texture(normalTex, dUV1).rg.mul(2).sub(1);
    const d2 = texture(normalTex, dUV2).rg.mul(2).sub(1);
    const detail = d1.mul(0.6).add(d2.mul(0.45)).mul(0.11).mul(detailFade).mul(river.mul(0.7).add(1));
    const baseSlope = vec2(dhdx.add(grad.x).add(ringSlope.x), dhdz.add(grad.y).add(ringSlope.y));
    const fullSlope = baseSlope.add(detail);
    const nFull = normalize(vec3(fullSlope.x.negate(), 1, fullSlope.y.negate()));

    // ---- fresnel (Schlick, water F0) ----
    const cosT = clamp(abs(dot(viewDir, nFull)), 0, 1);
    const fresnel = float(0.02).add(pow(float(1).sub(cosT), 5).mul(0.98)).min(0.9);

    // ---- reflection ----
    let refl;
    if (reflectionNode) {
      refl = reflectionNode.rgb;
    } else {
      // cheap sky-gradient reflection for Low/Medium
      const reflectDir = reflect(viewDir.negate(), nFull);
      const upness = clamp(reflectDir.y, 0, 1);
      refl = mix(vec3(0.7, 0.8, 0.78), vec3(0.32, 0.55, 0.85), pow(upness, 0.6));
    }
    refl = refl.mul(vec3(0.78, 0.86, 0.9));
    // soft knee: keep tree reflections crisp (they sit below the knee), but
    // compress the HDR sky glare hard — otherwise the whole far lagoon reads
    // as a sheet of white after tone mapping
    const over = max(refl.sub(0.75), 0);
    refl = min(refl, vec3(0.75)).add(over.div(over.add(1.3)).mul(0.4));

    // ---- transmission: refracted scene, absorbed along BOTH legs of the light
    // path (sun → bed → eye). The bed is lit as if in air by a hot sun, so
    // attenuating only the view leg leaves shallows milky and sunlit boulders
    // glowing through the surface like glass. ----
    const deepColor = vec3(0.012, 0.16, 0.17);
    const shallowColor = vec3(0.18, 0.56, 0.5);
    const viewPath = colDepth.max(0).div(abs(viewDir.y).max(0.1)).min(50);
    const sunPath = colDepth.max(0).div(sunDir.y.max(0.25)).min(50);
    const pathLen = viewPath.add(sunPath);
    const absorb = exp(pathLen.mul(vec3(-0.34, -0.085, -0.11)));
    const inscatter = exp(viewPath.mul(-0.2)).oneMinus();
    // caustics dancing on the shallow bed: the web-like minimum of two
    // counter-scrolling noise fields, fading with depth and distance
    const c1 = texture(noiseTex, xz.mul(0.12).add(time.mul(vec2(0.021, 0.016)))).g;
    const c2 = texture(noiseTex, xz.mul(0.1).add(0.37).sub(time.mul(vec2(0.014, 0.024)))).g;
    const causticWeb = smoothstep(0.52, 0.86, min(c1, c2).mul(1.2));
    const causticFade = smoothstep(0.08, 0.5, colDepth)
      .mul(smoothstep(1.2, 4.0, colDepth).oneMinus())
      .mul(smoothstep(15, 60, dist).oneMinus());
    let transmitted;
    let sceneColor = null;
    if (refraction) {
      // smooth wobble: the wave/ripple slope plus only a whisper of the fine detail
      const refrSlope = baseSlope.add(detail.mul(0.25));
      const shallow = smoothstep(0.0, 0.9, colDepth);
      const offsAbove = refrSlope.mul(0.045).mul(clamp(float(7).div(dist), 0.1, 1)).mul(shallow.mul(0.85).add(0.15));
      const offsBelow = refrSlope.mul(0.09);
      sceneColor = viewportSharedTexture(screenUV.add(mix(offsAbove, offsBelow, under))).rgb;
      // The bed was rendered as dry ground in full sun (HDR ≈ 2–4 on the sand).
      // Darken it as wet ground, apply the 1/n² (≈0.56) radiance compression of
      // light leaving the water, and soft-knee what is still glaring — otherwise
      // every shallow reads as a sheet of white after tone mapping.
      let bed = sceneColor.mul(vec3(0.36, 0.4, 0.4));
      const overBed = max(bed.sub(0.45), 0);
      bed = min(bed, vec3(0.45)).add(overBed.div(overBed.add(0.9)).mul(0.45));
      // (the terrain paints its own caustics on the bed — this only adds the
      // part that should move with the surface, so keep it light)
      bed = bed.mul(causticWeb.mul(0.35).mul(causticFade).add(1));
      transmitted = bed.mul(absorb).add(deepColor.mul(inscatter));
    } else {
      const depthFactor = clamp(colDepth.div(3.2), 0, 1);
      transmitted = mix(shallowColor, deepColor, depthFactor);
    }

    // ---- sun glints: sharp sparkle + soft sheen, both broken by the detail normal ----
    const R = reflect(viewDir.negate(), nFull);
    const sunDot = max(dot(R, sunDir), 0);
    const glint = pow(sunDot, 400).mul(2.4).add(pow(sunDot, 56).mul(0.09));

    // ---- foam ----
    const lap = sin(time.mul(1.1).add(xz.x.mul(0.33)).add(xz.y.mul(0.21)))
      .mul(0.5)
      .add(sin(time.mul(0.63).add(foamTexA.mul(6.28))).mul(0.5));
    const edgeDepth = colDepth.add(lap.mul(0.07)).add(foamTexB.sub(0.5).mul(0.22));
    const shoreLine = smoothstep(0.0, 0.14, edgeDepth).oneMinus();
    const shoreBand = smoothstep(0.1, 0.55, edgeDepth).oneMinus().mul(foamPattern);
    const shoreFoam = clamp(shoreLine.mul(0.85).add(shoreBand.mul(0.5)), 0, 1);
    // ripple crests whiten a little (steep slopes only — a swimmer's wake, not
    // a white disc around every splash)
    const crestFoam = smoothstep(0.32, 0.8, length(grad)).mul(0.22);
    // lazy-river foam lines: thin, broken, sparse (the channel is slow water —
    // the white water belongs behind the wake rocks, not everywhere)
    const riverStreak = river
      .mul(smoothstep(0.64, 0.9, streakTex))
      .mul(smoothstep(0.35, 0.65, foamTexB))
      .mul(0.16)
      .mul(smoothstep(0.3, 1.2, colDepth));
    let wakeFoam = float(0);
    for (const wake of wakeUniforms) {
      const d = xz.sub(wake.xy);
      const flowN = normalize(vec2(bake.b, 1));
      const along = dot(d, flowN);
      const across = dot(d, vec2(flowN.y.negate(), flowN.x));
      const r = wake.z;
      const width = r.mul(0.65).add(along.max(0).mul(0.22));
      const tail = exp(sq(across.div(width)).negate())
        .mul(smoothstep(r.mul(-0.6), r.mul(0.3), along))
        .mul(smoothstep(r.mul(0.6), r.mul(5.0), along).oneMinus());
      const bow = exp(sq(length(d).sub(r.mul(1.15)).div(r.mul(0.35))).negate()).mul(smoothstep(r.mul(-1.2), r.mul(0.2), along).oneMinus()).mul(0.6);
      wakeFoam = wakeFoam.add(tail.add(bow).mul(wake.w).mul(foamTexB.mul(0.7).add(0.55)));
    }
    const foam = clamp(shoreFoam.add(crestFoam).add(fallFoam).add(riverStreak).add(wakeFoam), 0, 1);
    // bubble mass: white rafts with grey-teal gaps (dense foam closes the gaps)
    const bubbles = smoothstep(0.3, 0.72, bubbleTex.mul(0.7).add(foamTexB.mul(0.3)).add(foam.mul(0.25)));
    const foamColor = mix(vec3(0.6, 0.72, 0.74), vec3(0.96, 0.99, 0.98), bubbles);

    // ---- above-water shading ----
    let above = mix(transmitted, refl, fresnel).add(glint.mul(foam.oneMinus()));
    above = mix(above, foamColor, foam);

    // ---- below-water shading: Snell's window, TIR mirror, sun shimmer ----
    const nDown = nFull.negate();
    const cosI = clamp(dot(viewDir, nDown), 0, 1);
    const T = refract(viewDir.negate(), nDown, 1.33);
    const sinT2 = float(1.7689).mul(float(1).sub(cosI.mul(cosI)));
    const tirF = smoothstep(0.82, 1.0, sinT2);
    const grazing = float(1).sub(cosI);
    const mirror = deepColor
      .mul(0.7)
      .add(vec3(0.35, 0.55, 0.62).mul(sq(grazing)).mul(0.8))
      .add(vec3(0.5, 0.7, 0.75).mul(pow(grazing, 8)));
    // the sun through Snell's window: a hard disc plus a wide glow, both torn
    // up by the detail normal so the surface shimmers like caustics
    const sunT = max(dot(T, sunDir), 0);
    // hard disc + wide glow + a web of bright filaments around the sun (the
    // wave crests focusing sunlight, as seen from underneath)
    const sunShimmer = pow(sunT, 80)
      .mul(1.8)
      .add(pow(sunT, 10).mul(0.35))
      .add(pow(sunT, 24).mul(causticWeb).mul(1.1))
      .mul(tirF.oneMinus());
    const skyThrough = sceneColor ? sceneColor.mul(vec3(0.95, 1.05, 1.1)) : vec3(0.55, 0.75, 0.9);
    // wave crests seen from below catch light along the TIR boundary
    const rim = smoothstep(0.55, 0.85, sinT2).mul(smoothstep(0.85, 1.0, sinT2).oneMinus()).mul(0.25);
    // sunlit wave crests seen from underneath: a drifting bright web on the underside
    const underWeb = vec3(0.7, 0.85, 0.9).mul(causticWeb.mul(0.16)).mul(tirF.oneMinus());
    const below = mix(skyThrough, mirror, tirF).add(sunShimmer).add(vec3(0.6, 0.8, 0.85).mul(rim)).add(underWeb).add(foamColor.mul(foam.mul(0.35)));

    material.colorNode = mix(above, below, under);
    if (refraction) {
      material.opacityNode = float(1);
    } else {
      const depthFactor = clamp(colDepth.div(3.2), 0, 1);
      material.opacityNode = clamp(float(0.5).add(depthFactor.mul(0.3)).add(fresnel.mul(1.1)).add(foam.mul(0.4)), 0, 0.97);
    }

    // visualization hooks for headless debugging
    material.userData.debugNodes = {
      foam: vec3(foam),
      fallFoam: vec3(fallFoam),
      shoreFoam: vec3(shoreFoam),
      crestFoam: vec3(crestFoam),
      wakeFoam: vec3(wakeFoam),
      riverStreak: vec3(riverStreak),
      ripple: vec3(ripple.textureNode.sample(rippleUV(worldXZ)).r.mul(4).add(0.5)),
      heave: vec3(heave.h.mul(4).add(0.5)),
      caustic: vec3(causticWeb.mul(causticFade)),
      normal: nFull.mul(0.5).add(0.5),
      depth: vec3(clamp(colDepth.div(5), 0, 1)),
      river: vec3(river),
      glint: vec3(glint),
      scene: sceneColor || vec3(0),
      transmitted,
      refl,
      fresnel: vec3(fresnel),
      under: vec3(under),
      above,
    };
    return material;
  }

  // ---------------- wake rocks (river boulders that break the surface) ----------------
  const wakeUniforms = [];
  for (let i = 0; i < 6; i += 1) {
    wakeUniforms.push(uniform(new THREE.Vector4(0, 0, 1, 0)));
  }

  // ---------------- water surface ----------------
  // 1.56 m quads: enough for the analytic waves and the plunge-pool heave
  const surfaceGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 256, 256);
  surfaceGeo.rotateX(-Math.PI / 2);

  // planar reflection target (only rendered on High/Ultra)
  const reflection = reflector({ resolutionScale: 0.5 });
  reflection.target.rotateX(-Math.PI / 2);
  reflection.target.position.set(0, WORLD.waterLevel, 0);
  scene.add(reflection.target);
  if (ctx.camera) {
    // the mirror clones the main camera (and so its layer mask); tens of
    // thousands of ground-cover cards are unreadable in a rippled half-res
    // reflection, so leave them out of that pass
    reflection.reflector.getVirtualCamera(ctx.camera).layers.disable(GROUND_COVER_LAYER);
  }
  {
    // distort the mirror with the wave + detail slope
    let dhdx = float(0);
    let dhdz = float(0);
    for (const w of WAVES) {
      const phase = worldXZ.x.mul(w.dirX).add(worldXZ.y.mul(w.dirZ)).mul(w.freq).add(time.mul(w.speed));
      const slope = cos(phase).mul(w.amp * w.freq);
      dhdx = dhdx.add(slope.mul(w.dirX));
      dhdz = dhdz.add(slope.mul(w.dirZ));
    }
    const d1 = texture(normalTex, worldXZ.mul(0.55).add(time.mul(vec2(0.026, 0.019)))).rg.mul(2).sub(1);
    const grad = rippleGradient().mul(2.8);
    const slope = vec2(dhdx.add(grad.x).add(d1.x.mul(0.06)), dhdz.add(grad.y).add(d1.y.mul(0.06)));
    reflection.uvNode = reflection.uvNode.add(slope.mul(0.09));
  }

  const materialWithReflection = buildSurfaceMaterial({ reflectionNode: reflection, refraction: true });
  const materialCheap = buildSurfaceMaterial({ reflectionNode: null, refraction: true });

  const surface = new THREE.Mesh(surfaceGeo, materialWithReflection);
  surface.position.y = WORLD.waterLevel;
  surface.renderOrder = 2;
  surface.name = 'water-surface';
  surface.frustumCulled = false;
  scene.add(surface);

  // ---------------- waterfall mesh (one draw: back sheet, front sheet, spray, haze, side fall) ----------------
  const fallStrips = [];
  const mainWidthProfile = (v) => (v <= 1 ? 0.78 + 0.22 * (1 - v) : 0.78);
  const mainCommon = { profile: mainFall.at, cx: WORLD.waterfallX, halfWidth: mainHalfWidth, rows: 40, cols: 14, vMax: 1.25, widthProfile: mainWidthProfile };
  fallStrips.push(
    buildFallStrip({ ...mainCommon, zOffset: 0.0, widthScale: 1.0, params: [0.42, 1.3, 3.0, 0.9], style: [0.86, 0.1, 0.0, 0] }),
    buildFallStrip({ ...mainCommon, zOffset: 0.42, widthScale: 0.94, params: [0.62, 1.9, 4.2, 0.72], style: [1.0, 0.22, 2.1, 0] }),
    buildFallStrip({ ...mainCommon, zOffset: 0.85, widthScale: 1.06, params: [0.95, 2.6, 6.5, 0.4], style: [1.15, 0.36, 4.0, 0] })
  );
  const sideWidthProfile = (v) => (v <= 1 ? 0.7 + 0.3 * (1 - v) : 0.7);
  const sideCommon = { profile: sideFall.at, cx: sideCx, halfWidth: sideHalfWidth, rows: 24, cols: 6, vMax: 1.25, widthProfile: sideWidthProfile };
  fallStrips.push(
    buildFallStrip({ ...sideCommon, zOffset: 0.0, widthScale: 1.0, params: [0.5, 1.6, 2.6, 0.7], style: [0.9, 0.08, 1.3, 2] }),
    buildFallStrip({ ...sideCommon, zOffset: 0.35, widthScale: 0.9, params: [0.8, 2.4, 3.8, 0.5], style: [1.1, 0.18, 3.3, 2] })
  );
  // base haze planes hide the sheet/pool seam (kind 1: soft rising noise)
  const hazeProfile = (impact) => (v) => ({ y: WORLD.waterLevel - 0.4 + v * 3.6, z: impact.z + 0.8 - v * 0.9 });
  fallStrips.push(
    buildFallStrip({ profile: hazeProfile(mainFall.impact), cx: WORLD.waterfallX, halfWidth: mainHalfWidth, rows: 6, cols: 8, vMax: 1, zOffset: 0, widthScale: 1.55, params: [0.3, 1, 1, 0.9], style: [1, 0.05, 0.7, 1] }),
    buildFallStrip({ profile: hazeProfile(sideFall.impact), cx: sideCx, halfWidth: sideHalfWidth, rows: 5, cols: 6, vMax: 1, zOffset: 0, widthScale: 1.7, params: [0.3, 1, 1, 0.65], style: [1, 0.05, 2.9, 1] })
  );
  const fallGeo = mergeGeometries(fallStrips);
  fallStrips.forEach((g) => g.dispose());
  const waterfall = new THREE.Mesh(fallGeo, buildFallMaterial(noiseTex, sunDir));
  waterfall.name = 'waterfall';
  waterfall.renderOrder = 3; // after the water so the sheet is not refracted by it
  waterfall.frustumCulled = false;
  scene.add(waterfall);

  // ---------------- rocks ----------------
  const rockGeos = buildRockGeometries();
  const rockMat = buildRockMaterial(textures.rock, noiseTex, textures.rockNormal ?? null);
  const rockSpots = [];
  const rockRandom = mulberry32(WORLD.seed + 778);

  function distToFalls(x, z) {
    return Math.hypot(x - WORLD.waterfallX, z - mainFall.zWater);
  }

  // shoreline boulders (waterline-aware: sampled height decides, not the radius)
  function scatterRing({ count, hMin, hMax, rMin, rMax, size, accept }) {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 60) {
      tries += 1;
      const a = rockRandom() * TAU;
      const r = rMin + rockRandom() * (rMax - rMin);
      const x = lagoon.x + Math.cos(a) * r;
      const z = lagoon.z + Math.sin(a) * r;
      const h = terrain.sampleHeight(x, z);
      if (h < hMin || h > hMax) continue;
      if (accept && !accept(x, z, h)) continue;
      rockSpots.push({ x, z, h, s: size() });
      placed += 1;
    }
  }
  scatterRing({
    count: 64,
    hMin: -1.0,
    hMax: 1.3,
    rMin: 38,
    rMax: 60,
    size: () => 0.25 + Math.pow(rockRandom(), 2.2) * 2.6,
    accept: (x, z) => distToFalls(x, z) > 9,
  });
  // pebbles and small boulders lying on the bed, visible through shallow water
  scatterRing({
    count: 56,
    hMin: -2.4,
    hMax: -0.55,
    rMin: 36,
    rMax: 52,
    size: () => 0.2 + rockRandom() * 0.5,
    accept: (x, z) => distToFalls(x, z) > 10,
  });
  // river boulders (the mouth itself is already crowded with landmark boulders)
  for (let i = 0; i < 40; i += 1) {
    const z = 22 + rockRandom() * 134;
    const x = riverCenterX(z) + (rockRandom() - 0.5) * 2 * (WORLD.riverHalfWidth + 2);
    const h = terrain.sampleHeight(x, z);
    if (h > 0.8) continue;
    rockSpots.push({ x, z, h, s: 0.3 + Math.pow(rockRandom(), 1.5) * 1.1 });
  }
  // wake rocks: rounded boulders (variant 2) whose tops just break the surface,
  // with streaks of white water behind them. The channel is a flat 2.3–2.7 m
  // trough with steep banks, so they sit toward the sides where the bed rises
  // (1.6–2.4 m boulders) rather than mid-stream where they would be huge.
  for (let i = 0; i < wakeUniforms.length; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 24 && !placed; attempt += 1) {
      const z = 30 + i * 18 + rockRandom() * 10;
      const side = rockRandom() < 0.5 ? -1 : 1;
      const x = riverCenterX(z) + side * (3 + rockRandom() * 6.5);
      const h = terrain.sampleHeight(x, z);
      if (h < -2.6 || h > -0.3) continue; // in the water, not on the bank
      const top = 0.3 + rockRandom() * 0.45;
      const s = clampJs((top - h) / (0.18 + 0.95), 0.8, 2.4);
      rockSpots.push({ x, z, h, s, variant: 2 });
      wakeUniforms[i].value.set(x, z, s * 0.95, 1.0);
      placed = true;
    }
    if (!placed) wakeUniforms[i].value.set(0, 0, 1, 0);
  }
  // waterfall: crest rocks splitting the sheet (matching the shader gaps), flanks, pool edge
  {
    const cw = mainHalfWidth * mainWidthProfile(1);
    for (const gu of [0.31, 0.69]) {
      const x = WORLD.waterfallX + (gu - 0.5) * 2 * cw;
      const z = mainFall.zCrest + 0.1;
      rockSpots.push({ x, z, h: Math.max(terrain.sampleHeight(x, z), mainFall.crestY - 0.6), s: 1.35 + rockRandom() * 0.4, tall: true, variant: 2 });
    }
    for (const sgn of [-1, 1]) {
      const x = WORLD.waterfallX + sgn * (cw + 1.4);
      const z = mainFall.zCrest - 0.4;
      rockSpots.push({ x, z, h: Math.max(terrain.sampleHeight(x, z), mainFall.crestY - 0.4), s: 1.9 + rockRandom() * 0.6 });
      // pool edge
      const px = WORLD.waterfallX + sgn * (mainHalfWidth + 1.6 + rockRandom() * 1.5);
      const pz = mainFall.zWater - 0.4;
      rockSpots.push({ x: px, z: pz, h: terrain.sampleHeight(px, pz), s: 1.2 + rockRandom() * 0.8 });
      // slope flanks
      for (let k = 0; k < 4; k += 1) {
        const fx = WORLD.waterfallX + sgn * (mainHalfWidth + 2.5 + rockRandom() * 6);
        const fz = mainFall.zWater - 1 - rockRandom() * Math.max(2, mainFall.zWater - mainFall.zCrest);
        rockSpots.push({ x: fx, z: fz, h: terrain.sampleHeight(fx, fz), s: 0.6 + rockRandom() * 1.4 });
      }
    }
    // side fall crest + edges
    const sx = sideCx;
    rockSpots.push({ x: sx - sideHalfWidth - 0.6, z: sideFall.zCrest - 0.3, h: Math.max(terrain.sampleHeight(sx - sideHalfWidth - 0.6, sideFall.zCrest - 0.3), sideFall.crestY - 0.4), s: 1.1 });
    rockSpots.push({ x: sx + sideHalfWidth + 0.5, z: sideFall.zCrest - 0.2, h: Math.max(terrain.sampleHeight(sx + sideHalfWidth + 0.5, sideFall.zCrest - 0.2), sideFall.crestY - 0.4), s: 1.3 });
  }

  // silhouette per spot: explicit request, else pebbles/small stones get the
  // cheap rounded cobble and the boulders alternate between the two slabs
  const dummy = new THREE.Object3D();
  const rocks = new THREE.Group();
  rocks.name = 'boulders';
  {
    const buckets = [[], [], []];
    let slabToggle = 0;
    for (const spot of rockSpots) {
      let v = spot.variant;
      if (v === undefined) {
        if (spot.s < 0.75) v = 2;
        else {
          v = slabToggle;
          slabToggle = 1 - slabToggle;
        }
      }
      buckets[v].push(spot);
    }
    buckets.forEach((spots, v) => {
      const mesh = new THREE.InstancedMesh(rockGeos[v], rockMat, Math.max(1, spots.length));
      if (spots.length === 0) {
        // keep a valid (invisible) instance rather than a zero-count draw
        dummy.position.set(0, -50, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        mesh.setMatrixAt(0, dummy.matrix);
      }
      spots.forEach((spot, i) => {
        const s = spot.s;
        dummy.position.set(spot.x, spot.h + s * 0.18, spot.z);
        dummy.rotation.set((rockRandom() - 0.5) * 0.5, rockRandom() * TAU, (rockRandom() - 0.5) * 0.5);
        dummy.scale.set(s * (0.85 + rockRandom() * 0.3), s * (spot.tall ? 1.25 : 1), s * (0.85 + rockRandom() * 0.3));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `boulders-${v}`;
      rocks.add(mesh);
    });
  }
  scene.add(rocks);

  // ---------------- lily pads ----------------
  const lilySpots = [];
  {
    const lilyRandom = mulberry32(WORLD.seed + 779);
    let clusters = 0;
    let tries = 0;
    while (clusters < 16 && tries < 600) {
      tries += 1;
      const a = lilyRandom() * TAU;
      const r = 42 + lilyRandom() * 11;
      const cx = lagoon.x + Math.cos(a) * r;
      const cz = lagoon.z + Math.sin(a) * r;
      const h = terrain.sampleHeight(cx, cz);
      if (h < -1.4 || h > -0.35) continue;
      if (distToFalls(cx, cz) < 24) continue; // too turbulent near the falls
      if (cz > lagoon.z + 30 && Math.abs(cx - riverCenterX(cz)) < 16) continue; // river mouth current
      clusters += 1;
      const n = 6 + Math.floor(lilyRandom() * 9);
      for (let k = 0; k < n; k += 1) {
        const px = cx + (lilyRandom() - 0.5) * 4.4;
        const pz = cz + (lilyRandom() - 0.5) * 4.4;
        const ph = terrain.sampleHeight(px, pz);
        if (ph < -1.9 || ph > -0.18) continue;
        lilySpots.push({ x: px, z: pz, s: 0.25 + lilyRandom() * 0.32, yaw: lilyRandom() * TAU });
      }
    }
  }
  const lilies = new THREE.InstancedMesh(buildLilyGeometry(), buildLilyMaterial(), Math.max(1, lilySpots.length));
  lilySpots.forEach((p, i) => {
    dummy.position.set(p.x, WORLD.waterLevel + 0.015, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    lilies.setMatrixAt(i, dummy.matrix);
  });
  lilies.instanceMatrix.needsUpdate = true;
  lilies.frustumCulled = false;
  lilies.receiveShadow = true;
  lilies.name = 'lily-pads';
  scene.add(lilies);

  // ---------------- reeds ----------------
  const reedSpots = [];
  {
    const reedRandom = mulberry32(WORLD.seed + 780);
    const insideRock = (px, pz) => {
      for (const r of rockSpots) {
        if (r.s < 0.45) continue;
        const rr = r.s * 1.15;
        const dx = px - r.x;
        const dz = pz - r.z;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    };
    const clump = (x, z) => {
      const n = 2 + Math.floor(reedRandom() * 4);
      for (let k = 0; k < n; k += 1) {
        const px = x + (reedRandom() - 0.5) * 1.6;
        const pz = z + (reedRandom() - 0.5) * 1.6;
        const h = terrain.sampleHeight(px, pz);
        if (h < -0.55 || h > 0.5) continue;
        if (insideRock(px, pz)) continue;
        reedSpots.push({ x: px, z: pz, h, s: 0.7 + reedRandom() * 0.7, yaw: reedRandom() * TAU });
      }
    };
    let tries = 0;
    let spots = 0;
    while (spots < 44 && tries < 1500) {
      tries += 1;
      const a = reedRandom() * TAU;
      const r = 43 + reedRandom() * 13;
      const x = lagoon.x + Math.cos(a) * r;
      const z = lagoon.z + Math.sin(a) * r;
      const h = terrain.sampleHeight(x, z);
      if (h < -0.45 || h > 0.4) continue;
      if (distToFalls(x, z) < 12) continue;
      spots += 1;
      clump(x, z);
    }
    for (let i = 0; i < 26; i += 1) {
      const z = 12 + reedRandom() * 150;
      const side = reedRandom() < 0.5 ? -1 : 1;
      let placed = false;
      for (let off = WORLD.riverHalfWidth - 1; off < WORLD.riverHalfWidth + 9 && !placed; off += 0.6) {
        const x = riverCenterX(z) + side * off;
        const h = terrain.sampleHeight(x, z);
        if (h > -0.45 && h < 0.4) {
          clump(x, z);
          placed = true;
        }
      }
    }
  }
  const reeds = new THREE.InstancedMesh(buildReedGeometry(), buildReedMaterial(reedTex), Math.max(1, reedSpots.length));
  reedSpots.forEach((p, i) => {
    dummy.position.set(p.x, p.h - 0.15, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(p.s, p.s * (0.85 + (p.yaw % 1) * 0.4), p.s);
    dummy.updateMatrix();
    reeds.setMatrixAt(i, dummy.matrix);
  });
  reeds.instanceMatrix.needsUpdate = true;
  reeds.frustumCulled = false;
  reeds.castShadow = true;
  reeds.receiveShadow = true;
  reeds.name = 'reeds';
  scene.add(reeds);

  // ---------------- floating leaves ----------------
  const leafGeo = new THREE.PlaneGeometry(0.5, 0.34);
  leafGeo.rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardNodeMaterial({
    map: textures.bananaLeaf,
    roughness: 0.7,
    side: THREE.DoubleSide,
    alphaTest: 0.4,
  });
  const floaters = [];
  const leafCount = 42;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  for (let i = 0; i < leafCount; i += 1) {
    const angle = random() * TAU;
    const radius = random() * (WORLD.lagoonRadius - 6);
    floaters.push({
      x: lagoon.x + Math.cos(angle) * radius,
      z: lagoon.z + Math.sin(angle) * radius,
      yaw: random() * TAU,
      driftAngle: random() * TAU,
      driftSpeed: 0.06 + random() * 0.12,
      spin: (random() - 0.5) * 0.25,
      scale: 0.7 + random() * 0.9,
    });
  }
  leaves.frustumCulled = false;
  leaves.name = 'floating-leaves';
  scene.add(leaves);

  // ---------------- player interaction ----------------
  let wasInWater = false;
  let stirTimer = 0;
  const churnRandom = mulberry32(WORLD.seed + 781);

  player.onStep(() => {
    if (player.isWading || player.isSwimming) {
      ripple.addImpulse(player.position.x, player.position.z, Math.min(0.1, 0.035 + player.speed2D * 0.012), 0.5);
    }
  });

  function update(dt, t) {
    // waterfall churn — continuous random impulses along the impact lines
    ripple.addImpulse(
      mainFall.impact.x + (churnRandom() - 0.5) * mainHalfWidth * 1.6,
      mainFall.impact.z + (churnRandom() - 0.5) * 1.8,
      0.05 + churnRandom() * 0.07,
      1.3
    );
    if (churnRandom() < 0.5) {
      ripple.addImpulse(
        sideFall.impact.x + (churnRandom() - 0.5) * sideHalfWidth * 1.6,
        sideFall.impact.z + (churnRandom() - 0.5) * 1.2,
        0.03 + churnRandom() * 0.04,
        0.9
      );
    }

    // swimming stirs the water
    if (player.isSwimming && player.speed2D > 0.5) {
      stirTimer -= dt;
      if (stirTimer <= 0) {
        stirTimer = 0.22;
        ripple.addImpulse(player.position.x, player.position.z, 0.032, 0.55);
      }
    }

    // entering the water with speed → splash
    const inWater = player.isWading || player.isSwimming;
    if (inWater && !wasInWater) {
      const punch = Math.min(0.16, 0.06 + Math.abs(player.velocity.y) * 0.03 + player.speed2D * 0.012);
      ripple.addImpulse(player.position.x, player.position.z, punch, 0.8);
    }
    wasInWater = inWater;

    ripple.update(player.position);

    // floating leaves bob on the analytic waves
    for (let i = 0; i < floaters.length; i += 1) {
      const f = floaters[i];
      f.x += Math.cos(f.driftAngle) * f.driftSpeed * dt;
      f.z += Math.sin(f.driftAngle) * f.driftSpeed * dt;
      f.yaw += f.spin * dt;
      const dx = f.x - lagoon.x;
      const dz = f.z - lagoon.z;
      if (Math.hypot(dx, dz) > WORLD.lagoonRadius - 4) {
        f.driftAngle += Math.PI * (0.75 + churnRandom() * 0.5);
      }
      const h = waveHeightAt(f.x, f.z, t);
      dummy.position.set(f.x, WORLD.waterLevel + h + 0.02, f.z);
      const tiltX = (waveHeightAt(f.x + 0.4, f.z, t) - h) * 1.6;
      const tiltZ = (waveHeightAt(f.x, f.z + 0.4, t) - h) * 1.6;
      dummy.rotation.set(tiltX, f.yaw, tiltZ);
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  function applyQuality(preset) {
    const useReflection = preset.planarReflection;
    surface.material = useReflection ? materialWithReflection : materialCheap;
    reflection.target.visible = useReflection;
    reflection.resolutionScale = preset.reflectionSize >= 1024 ? 0.75 : 0.5;
    const density = Math.max(0.35, preset.vegetationDensity);
    lilies.count = Math.max(1, Math.round(lilySpots.length * density));
    reeds.count = Math.max(1, Math.round(reedSpots.length * density));
    for (const tex of ownTextures) {
      tex.anisotropy = preset.anisotropy;
    }
  }

  return {
    surface,
    ripple,
    update,
    applyQuality,
    // exposed for the particles agent / debugging
    waterfall,
    falls: { main: mainFall, side: sideFall },
    rocks,
    rockSpots,
    wakes: wakeUniforms,
    lilies,
    reeds,
  };
}
