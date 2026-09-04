// Terrain: authored procedural heightfield (lagoon, falls cliff, east ridge +
// overlook, west ravine, NE terraces, SE clearing, ruins knoll, trail network),
// a baked "control map" (trail / canopy density / cavity), and a TSL splat
// material with triplanar cliff rock, normal maps, leaf litter and dirt paths.
// Also the single source of truth for collision + ecological placement rules.

import * as THREE from 'three/webgpu';
import {
  texture,
  positionWorld,
  normalWorld,
  normalMap,
  float,
  vec2,
  vec3,
  vec4,
  smoothstep,
  mix,
  clamp,
  time,
  sin,
  abs,
  pow,
  max,
  cameraPosition,
  normalize,
} from 'three/tsl';
import { WORLD } from './config.js';
import { createFbm2D, smoothstep as smoothstepJs, clamp as clampJs, lerp } from './noise.js';
// water.js imports riverCenterX from here; the cycle is safe because both
// sides only touch the other's exports inside functions, never at load time
import { swashNode } from './water.js';

// The terrain grid is drawn as TERRAIN_TILES × TERRAIN_TILES frustum-culled
// tiles sharing one vertex buffer (see createTerrain). 6×6 (~67 m tiles):
// the main + reflection passes submit ~220 k of the 590 k triangles the single
// mesh cost, at ~26 draws; 8×8 saves only ~20 k more for 18 further draws.
const TERRAIN_TILES = 6;

// River center line: winding path heading south (+z) out of the lagoon.
export function riverCenterX(z) {
  return Math.sin(z * 0.024) * 16 + Math.sin(z * 0.061 + 1.7) * 7;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz || 1e-6;
  const t = clampJs((wx * vx + wz * vz) / len2, 0, 1);
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

// Distance (m) to the nearest authored trail center line.
export function trailDistance(x, z) {
  let best = Infinity;
  for (const trail of WORLD.trails) {
    for (let i = 0; i < trail.length - 1; i += 1) {
      const d = distToSegment(x, z, trail[i][0], trail[i][1], trail[i + 1][0], trail[i + 1][1]);
      if (d < best) {
        best = d;
      }
    }
  }
  return best;
}

export function trailMask(x, z) {
  return 1 - smoothstepJs(WORLD.trailHalfWidth, WORLD.trailHalfWidth + 2.6, trailDistance(x, z));
}

// Angular warp so authored features are never perfect circles: the radius
// breathes ±12 % with a few low harmonics of the bearing (periodic in angle,
// so there is no seam), phased by the feature's position.
function angularWarp(x, z, cx, cz, amount = 0.12) {
  const a = Math.atan2(z - cz, x - cx);
  const ph = cx * 0.037 + cz * 0.051;
  return 1 + amount * (0.55 * Math.sin(2 * a + ph) + 0.35 * Math.sin(3 * a - 1.3 + ph * 0.7) + 0.25 * Math.sin(5 * a + 2.1 - ph));
}

function radialMask(x, z, cx, cz, inner, outer) {
  const d = Math.hypot(x - cx, z - cz) / angularWarp(x, z, cx, cz);
  return 1 - smoothstepJs(inner, outer, d);
}

// 1 near the lagoon / river (where sand, wet ground and shoreline plants belong).
export function waterProximity(x, z) {
  const lagoon = WORLD.lagoonCenter;
  const dL = Math.hypot(x - lagoon.x, z - lagoon.z);
  let p = 1 - smoothstepJs(WORLD.lagoonRadius + 5, WORLD.lagoonRadius + 15, dL);
  if (z > lagoon.z) {
    const dr = Math.abs(x - riverCenterX(z));
    const fade = smoothstepJs(lagoon.z + 4, lagoon.z + 30, z);
    p = Math.max(p, (1 - smoothstepJs(WORLD.riverHalfWidth + 7, WORLD.riverHalfWidth + 17, dr)) * fade);
  }
  return p;
}

// Soft 0..1 weights describing which authored zone a point belongs to.
export function zonesAt(x, z) {
  const { ridge, overlook, ravine, terraces, clearing, ruins } = WORLD;
  const ridgeCenter = ridge.x + Math.sin(z * 0.02) * 10;
  const dxr = x - ridgeCenter;
  const ridgeW = dxr < 0 ? ridge.halfWidthWest : ridge.halfWidthEast;
  const ridgeZ = smoothstepJs(ridge.zFrom, ridge.zFrom + 40, z) * (1 - smoothstepJs(ridge.zTo - 40, ridge.zTo, z));
  const ridgeProfile = (1 - smoothstepJs(0, ridgeW, Math.abs(dxr))) * ridgeZ;

  const ravineCenter = ravine.x + Math.sin(z * 0.03) * ravine.wiggle;
  const ravineZ = smoothstepJs(ravine.zFrom, ravine.zFrom + 30, z) * (1 - smoothstepJs(ravine.zTo - 30, ravine.zTo, z));
  const ravineProfile = (1 - smoothstepJs(ravine.halfWidth * 0.25, ravine.halfWidth, Math.abs(x - ravineCenter))) * ravineZ;

  const half = WORLD.size / 2;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half;

  return {
    ridge: ridgeProfile,
    overlook: radialMask(x, z, overlook.x, overlook.z, overlook.radius * 0.6, overlook.radius * 1.3),
    ravine: ravineProfile,
    terrace: radialMask(x, z, terraces.x, terraces.z, terraces.radius * 0.5, terraces.radius),
    clearing: radialMask(x, z, clearing.x, clearing.z, clearing.radius * 0.55, clearing.radius),
    ruins: radialMask(x, z, ruins.x, ruins.z, ruins.radius * 0.5, ruins.radius * 1.5),
    rim: smoothstepJs(0.66, 1.0, edge),
  };
}

export function createHeightSampler() {
  const hills = createFbm2D(WORLD.seed, { octaves: 4 });
  const detail = createFbm2D(WORLD.seed + 7, { octaves: 2 });
  const valleys = createFbm2D(WORLD.seed + 21, { octaves: 3 });
  const crags = createFbm2D(WORLD.seed + 33, { octaves: 3 });
  const rimNoise = createFbm2D(WORLD.seed + 44, { octaves: 2 });
  const half = WORLD.size / 2;
  const lagoon = WORLD.lagoonCenter;
  const { ridge, overlook, ravine, terraces, clearing, ruins } = WORLD;

  function baseHeight(x, z) {
    // --- rolling jungle floor a few meters above the water, plus broad valleys ---
    const detailTerm = detail(x * 0.045, z * 0.045) * 1.1;
    let h = 2.6 + hills(x * 0.012, z * 0.012) * 4.6 + valleys(x * 0.0055, z * 0.0055) * 3.4 + detailTerm;

    // --- irregular raised rim so the map edge reads as deep hills, never a cliff edge ---
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    const rimShift = rimNoise(x * 0.018, z * 0.018) * 0.1;
    h += smoothstepJs(0.62 + rimShift, 1.0, edge) * (WORLD.rimHeight + rimNoise(x * 0.03 + 5, z * 0.03) * 7);

    // --- north cliff massif behind the lagoon (the waterfall wall) ---
    const dxL = x - lagoon.x;
    const dzL = z - lagoon.z;
    const distL = Math.sqrt(dxL * dxL + dzL * dzL) + 1e-6;
    const northness = smoothstepJs(0.1, 0.78, -dzL / distL);
    const cliffRamp = smoothstepJs(WORLD.lagoonRadius - 4, WORLD.lagoonRadius + 30, distL);
    const cliffFar = 1 - smoothstepJs(140, 190, distL);
    const notch = 1 - smoothstepJs(26, 6, Math.abs(x - WORLD.waterfallX)) * 0.32;
    const cliff = cliffRamp * cliffFar * northness;
    h += cliff * WORLD.cliffHeight * notch;
    h += cliff * crags(x * 0.05, z * 0.05) * 3.6;
    // ledges and buttresses on the wall itself: strongest mid-ramp where the
    // face is steepest (4t(1-t) of the ramp), so the plateau and the shore stay smooth
    const tRamp = clampJs((distL - (WORLD.lagoonRadius - 4)) / 34, 0, 1);
    const faceN = 4 * tRamp * (1 - tRamp) * cliffFar * northness;
    h += faceN * (crags(x * 0.22 + 2.3, z * 0.22) * 1.7 + crags(x * 0.42, z * 0.42 + 6.1) * 0.55);

    // --- east ridge: steep craggy west face toward the lagoon, gentle east back ---
    const ridgeCenter = ridge.x + Math.sin(z * 0.02) * 10;
    const dxr = x - ridgeCenter;
    const ridgeW = dxr < 0 ? ridge.halfWidthWest : ridge.halfWidthEast;
    const ridgeZ = smoothstepJs(ridge.zFrom, ridge.zFrom + 40, z) * (1 - smoothstepJs(ridge.zTo - 40, ridge.zTo, z));
    const ridgeProfile = Math.pow(1 - smoothstepJs(0, ridgeW, Math.abs(dxr)), 1.35) * ridgeZ;
    h += ridgeProfile * ridge.height * (1 + crags(x * 0.03, z * 0.03) * 0.22);
    // rocky crags on the west face, plus tighter ledges where the face is steepest
    const westFace = (dxr < 0 ? 1 : 0.3) * ridgeZ;
    h += smoothstepJs(0.25, 0.7, ridgeProfile) * westFace * crags(x * 0.09, z * 0.09) * 2.2;
    const faceR = smoothstepJs(0.12, 0.4, ridgeProfile) * (1 - smoothstepJs(0.6, 0.92, ridgeProfile)) * westFace;
    h += faceR * crags(x * 0.24 + 4.7, z * 0.24 - 2.2) * 1.3;

    // --- west ravine: a shaded gully with steep sides ---
    const ravineCenter = ravine.x + Math.sin(z * 0.03) * ravine.wiggle;
    const ravineZ = smoothstepJs(ravine.zFrom, ravine.zFrom + 30, z) * (1 - smoothstepJs(ravine.zTo - 30, ravine.zTo, z));
    const gully = (1 - smoothstepJs(ravine.halfWidth * 0.25, ravine.halfWidth, Math.abs(x - ravineCenter))) * ravineZ;
    h -= gully * ravine.depth;
    // broken rock on the gully walls (mid-slope only; the floor stays walkable)
    const faceV = 4 * gully * (1 - gully) * ravineZ;
    h += faceV * crags(x * 0.3 + 8.5, z * 0.3 + 3.3) * 0.8;
    // raised lips either side of the gully
    const lip = smoothstepJs(ravine.halfWidth * 0.6, ravine.halfWidth * 1.1, Math.abs(x - ravineCenter))
      * (1 - smoothstepJs(ravine.halfWidth * 1.3, ravine.halfWidth * 2.4, Math.abs(x - ravineCenter))) * ravineZ;
    h += lip * 1.6;

    // --- NE terraces: quantize the cliff shoulder into stepped rock shelves ---
    const terraceMask = radialMask(x, z, terraces.x, terraces.z, terraces.radius * 0.45, terraces.radius);
    if (terraceMask > 0.001) {
      // warp the contour so shelf edges wander instead of following the smooth
      // base height, and give each riser a short talus ramp rather than a
      // vertical wall the mesh can't resolve
      const warp = crags(x * 0.07 + 3.1, z * 0.07 - 1.7) * 1.3;
      const q = (h + 0.7 + warp) / terraces.step;
      const k = Math.floor(q);
      const f = q - k;
      const riser = smoothstepJs(0.7, 1.0, f);
      // a proper scree apron at each riser's foot, and broken rock on the face
      // itself so the shelves don't read as machined concrete steps
      const talus = (1 - smoothstepJs(0.0, 0.34, f)) * 0.55;
      const faceBreak = 4 * riser * (1 - riser) * crags(x * 0.35 + 1.7, z * 0.35 - 4.2) * 0.5;
      const stepped = (k + riser) * terraces.step - 0.7 + talus + faceBreak + crags(x * 0.12, z * 0.12) * 0.35;
      h = lerp(h, stepped, terraceMask * 0.85);
    }

    // --- SE clearing: a gently domed sunlit meadow ---
    const clearingMask = radialMask(x, z, clearing.x, clearing.z, clearing.radius * 0.45, clearing.radius);
    h = lerp(h, clearing.height + detailTerm * 0.35, clearingMask);

    // --- ruins knoll with a flat plinth on top ---
    const knoll = radialMask(x, z, ruins.x, ruins.z, ruins.radius * 0.5, ruins.radius * 1.7);
    h = lerp(h, ruins.height + detailTerm * 0.1, knoll);

    // --- lagoon bowl (waterline sits near the outer radius so it reads full) ---
    // the bowl radius breathes with bearing so the shoreline is a bay with
    // points and coves rather than a compass circle
    const distLw = distL / angularWarp(x, z, lagoon.x, lagoon.z, 0.085);
    const shore = smoothstepJs(WORLD.lagoonRadius + 7, WORLD.lagoonRadius - 5, distLw);
    const bowlDepth = -4.8 - 1.6 * smoothstepJs(WORLD.lagoonRadius * 0.7, 0, distLw);
    h = lerp(h, bowlDepth, shore);

    // --- river channel heading south out of the lagoon ---
    if (z > lagoon.z) {
      const riverX = riverCenterX(z);
      const dx = Math.abs(x - riverX);
      const channel = smoothstepJs(WORLD.riverHalfWidth + 13, WORLD.riverHalfWidth - 2, dx);
      const fadeIn = smoothstepJs(lagoon.z + 8, lagoon.z + 34, z);
      const bedY = -2.5 + Math.sin(z * 0.05) * 0.25;
      h = lerp(h, bedY, channel * fadeIn);
    }

    // --- trails: smooth out the small bumps so paths read as walked ground ---
    const tMask = trailMask(x, z);
    if (tMask > 0.001) {
      h -= detailTerm * 0.75 * tMask;
    }

    // --- flatten sandy shores right around the waterline ---
    const nearWaterline = (1 - smoothstepJs(0.15, 1.6, Math.abs(h - 0.45))) * waterProximity(x, z);
    h = lerp(h, 0.4, nearWaterline * 0.3);

    return h;
  }

  // Flatten the overlook top onto a plateau at the crest height.
  const crestHeight = baseHeight(overlook.x, overlook.z);

  function sampleHeight(x, z) {
    let h = baseHeight(x, z);
    const top = radialMask(x, z, overlook.x, overlook.z, overlook.radius * 0.55, overlook.radius);
    if (top > 0.001) {
      h = lerp(h, crestHeight + 0.2, top);
    }
    // ravine floors must stay dry (never dip to the water plane)
    const zone = zonesAt(x, z);
    if (zone.ravine > 0.01) {
      h = Math.max(h, lerp(h, 0.9, zone.ravine));
    }
    return h;
  }

  return sampleHeight;
}

// Ecological "canopy density" 0..1 — where big trees stand. Shared by the
// ground shader (leaf litter, shade) and the vegetation scatterer.
export function createCanopyDensitySampler(sampleHeight) {
  const forest = createFbm2D(WORLD.seed + 99, { octaves: 3 });
  const forestFine = createFbm2D(WORLD.seed + 123, { octaves: 2 });
  return function canopyDensity(x, z) {
    const h = sampleHeight(x, z);
    if (h < 0.7) {
      return 0;
    }
    let d = 0.55 + forest(x * 0.011, z * 0.011) * 0.45 + forestFine(x * 0.04, z * 0.04) * 0.15;
    const zone = zonesAt(x, z);
    d *= 1 - zone.clearing * 0.92;
    d *= 1 - zone.overlook * 0.9;
    d *= 1 - zone.terrace * 0.55;
    d *= 1 - zone.ruins * 0.55;
    d *= 1 - trailMask(x, z) * 0.75;
    // a sun-gap over the trailhead: the first frame should be dappled light on
    // the path, not the black floor of a closed canopy
    d *= 1 - radialMask(x, z, WORLD.spawn.x, WORLD.spawn.z, 7, 17) * 0.8;
    d = d * (1 - zone.ravine * 0.3) + zone.ravine * 0.55;
    // slope: no forest on cliff faces
    const e = 1.6;
    const slope = Math.abs(sampleHeight(x + e, z) - h) + Math.abs(sampleHeight(x, z + e) - h);
    d *= 1 - smoothstepJs(1.3, 2.8, slope);
    // thin out right at the shore
    d *= smoothstepJs(0.7, 2.2, h);
    return clampJs(d, 0, 1);
  };
}

// Bake trail / canopy / cavity into an RGBA control texture for the shader.
function bakeControlMap(sampleHeight, canopyDensity) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const cavityRadius = 5.5;
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      const x = (ix / (size - 1) - 0.5) * WORLD.size;
      const z = (iz / (size - 1) - 0.5) * WORLD.size;
      const h = sampleHeight(x, z);
      let avg = 0;
      for (let k = 0; k < 4; k += 1) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        avg += sampleHeight(x + Math.cos(a) * cavityRadius, z + Math.sin(a) * cavityRadius);
      }
      avg /= 4;
      const cavity = clampJs((avg - h) / 3.2, 0, 1);
      const o = (iz * size + ix) * 4;
      // R is a soft trail *profile* (1 on the centre line → 0 at the verge),
      // not the binary mask, so the shader can tell the trodden core from the
      // edges; trailMask() itself stays the placement rule for plants
      data[o] = Math.round((1 - smoothstepJs(0, WORLD.trailHalfWidth + 2.6, trailDistance(x, z))) * 255);
      data[o + 1] = Math.round(canopyDensity(x, z) * 255);
      data[o + 2] = Math.round(cavity * 255);
      data[o + 3] = Math.round(waterProximity(x, z) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrain(ctx) {
  const { textures } = ctx;
  const sampleHeight = createHeightSampler();
  const canopyDensity = createCanopyDensitySampler(sampleHeight);
  const controlTex = bakeControlMap(sampleHeight, canopyDensity);
  const size = WORLD.size;
  const segments = WORLD.terrainSegments;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, sampleHeight(x, z));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  // ---------- TSL splat material ----------
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.94,
    metalness: 0,
  });

  // Second baked control map for the path profile (the 256² trail mask
  // saturates across the whole walked width, so it cannot place a centre line
  // or ruts): R = lateral distance to the trail centre line / 6 m, G = local
  // hollow (how far the point sits below its 2.2 m ring — damp floors and
  // puddles), B = fine slope. Height samples are expensive, so the hollow is
  // computed on a 128² grid and bilinearly upsampled into the 1024² map.
  function bakeTrailDetailMap() {
    const res = 1024;
    const hollowRes = 128;
    const ring = 2.2;
    const hollow = new Float32Array(hollowRes * hollowRes);
    const slopeF = new Float32Array(hollowRes * hollowRes);
    for (let iz = 0; iz < hollowRes; iz += 1) {
      for (let ix = 0; ix < hollowRes; ix += 1) {
        const x = (ix / (hollowRes - 1) - 0.5) * WORLD.size;
        const z = (iz / (hollowRes - 1) - 0.5) * WORLD.size;
        // only trail neighbourhoods need the hollow channel
        if (trailDistance(x, z) > 9) continue;
        const h = sampleHeight(x, z);
        let avg = 0;
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          avg += sampleHeight(x + Math.cos(a) * ring, z + Math.sin(a) * ring);
        }
        avg /= 6;
        hollow[iz * hollowRes + ix] = clampJs((avg - h) / 0.45, 0, 1);
        const sx = sampleHeight(x + 1, z) - sampleHeight(x - 1, z);
        const sz = sampleHeight(x, z + 1) - sampleHeight(x, z - 1);
        slopeF[iz * hollowRes + ix] = clampJs(Math.hypot(sx, sz) * 0.5 / 0.6, 0, 1);
      }
    }
    const fetch = (grid, u, v) => {
      const fx = clampJs(u * (hollowRes - 1), 0, hollowRes - 1.001);
      const fz = clampJs(v * (hollowRes - 1), 0, hollowRes - 1.001);
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      const a = grid[z0 * hollowRes + x0];
      const b = grid[z0 * hollowRes + x0 + 1];
      const c = grid[(z0 + 1) * hollowRes + x0];
      const d = grid[(z0 + 1) * hollowRes + x0 + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    };
    const data = new Uint8Array(res * res * 4);
    for (let iz = 0; iz < res; iz += 1) {
      const v = iz / (res - 1);
      const z = (v - 0.5) * WORLD.size;
      for (let ix = 0; ix < res; ix += 1) {
        const u = ix / (res - 1);
        const x = (u - 0.5) * WORLD.size;
        const o = (iz * res + ix) * 4;
        data[o] = Math.round(clampJs(trailDistance(x, z) / 6, 0, 1) * 255);
        data[o + 1] = Math.round(fetch(hollow, u, v) * 255);
        data[o + 2] = Math.round(fetch(slopeF, u, v) * 255);
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }
  const detailTex = bakeTrailDetailMap();

  const worldXZ = positionWorld.xz;
  const control = texture(controlTex, worldXZ.div(size).add(0.5));
  // profile 0.53 ≈ the trail half-width, so this reproduces the old hard mask
  // (the trodden centre / verge split comes from the lateral-distance bake below)
  const trail = smoothstep(0.0, 0.53, control.r);
  const canopy = control.g;
  const cavity = control.b;
  const shoreProximity = control.a;
  const detail = texture(detailTex, worldXZ.div(size).add(0.5));
  const lateral = detail.r;
  const hollow = detail.g;

  // camera proximity: fine octaves and parallax only pay off within ~25 m
  const toCamera = cameraPosition.sub(positionWorld);
  const camDist = toCamera.length();
  const near = smoothstep(14.0, 28.0, camDist).oneMinus();
  const viewDir = normalize(toCamera);

  const mottle = texture(textures.noise, worldXZ.mul(0.012)).r;
  const mottleFine = texture(textures.noise, worldXZ.mul(0.05)).r;
  const mottleMid = texture(textures.noise, worldXZ.mul(0.027).add(0.5)).r;
  const mottleDamp = texture(textures.noise, worldXZ.mul(0.07).add(0.23)).r;
  const mottleClose = texture(textures.noise, worldXZ.mul(0.19).add(0.61)).r;

  // grass: base tile + far tile, a cool/warm two-tone drift so the floor is not one green
  const grassUv = worldXZ.mul(0.12);
  let grassTex = texture(textures.grass, grassUv);
  const grassFar = texture(textures.grass, worldXZ.mul(0.021).add(0.37));
  grassTex = mix(grassTex, grassFar, 0.3);
  grassTex = grassTex.mul(mix(vec3(0.88, 1.0, 0.86), vec3(1.08, 1.0, 0.8), mottleMid));
  const sandTex = texture(textures.sand, worldXZ.mul(0.15));
  const mossTex = texture(textures.moss, worldXZ.mul(0.08));

  // dirt: main octave (3.7 m tile) with a one-step parallax offset from its own
  // height map, a fine octave (1.2 m) faded in near the camera, and a slow
  // height-map octave (14 m) modulating tone so long straight paths never tile
  const dirtScale = 0.27;
  const dirtUvA0 = worldXZ.mul(dirtScale);
  // anti-tiling: a second, rotated + offset lookup of the same tile is swapped
  // in over slow noise regions so the mud patches never repeat along a path
  const dirtUvR0 = vec2(worldXZ.y.negate(), worldXZ.x).mul(dirtScale * 1.13).add(vec2(0.37, 0.71));
  const bomb = smoothstep(0.42, 0.58, mottleMid);
  // the dirt tile carries its height in alpha (WebGPU caps a shader at 16
  // sampled textures; this material must stay at 12 to leave room for the
  // shadow cascades), so every dirt sample yields colour and relief together
  const dirtHA0 = mix(texture(textures.dirt, dirtUvA0).a, texture(textures.dirt, dirtUvR0).a, bomb);
  const parallax = viewDir.xz.div(max(viewDir.y, 0.3)).mul(dirtHA0.sub(0.5)).mul(near.mul(0.0075));
  const dirtUvA = dirtUvA0.add(parallax);
  const dirtUvR = dirtUvR0.add(vec2(parallax.y.negate(), parallax.x));
  const dirtUvB = worldXZ.mul(0.83).add(0.31);
  const dirtSA = texture(textures.dirt, dirtUvA);
  const dirtSR = texture(textures.dirt, dirtUvR);
  const dirtSB = texture(textures.dirt, dirtUvB);
  const dirtA = mix(dirtSA.rgb, dirtSR.rgb, bomb);
  const dirtB = dirtSB.rgb;
  const dirtHA = mix(dirtSA.a, dirtSR.a, bomb);
  const dirtHB = dirtSB.a;
  const dirtHMacro = texture(textures.dirt, worldXZ.mul(0.071).add(0.5)).a;
  const fineMix = near.mul(0.3);
  let dirtTex = mix(dirtA, dirtB, fineMix);
  const dirtH = mix(dirtHA, dirtHB, near.mul(0.45));
  // shadowed cavities: the low parts of the relief sit in their own shade
  const dirtCavity = smoothstep(0.14, 0.5, dirtH).oneMinus();
  dirtTex = dirtTex.mul(dirtCavity.mul(0.32).oneMinus());
  dirtTex = dirtTex.mul(smoothstep(0.55, 0.85, dirtH).mul(0.14).add(1.0));
  dirtTex = dirtTex.mul(mix(float(0.86), float(1.14), dirtHMacro));

  // leaf litter: 4.5 m tile, plus a 9 m tile whose leaves are big enough to
  // read individually — composited by height (leaf on top, not a crossfade)
  const litterUvA = worldXZ.mul(0.22);
  const litterUvB = worldXZ.mul(0.11).add(0.43);
  const litterSA = texture(textures.litter, litterUvA);
  const litterSB = texture(textures.litter, litterUvB);
  const litterA = litterSA.rgb;
  const litterB = litterSB.rgb;
  const litterHA = litterSA.a; // height in alpha, as with the dirt tile
  const litterHB = litterSB.a;
  const bigLeaf = smoothstep(0.4, 0.5, litterHB).mul(near);
  let litterTex = mix(litterA, litterB, bigLeaf);
  // darker humus in the gaps between leaves
  const litterH = max(litterHA, litterHB.mul(bigLeaf));
  litterTex = litterTex.mul(mix(float(0.62), float(1.0), smoothstep(0.22, 0.48, litterH)));

  // triplanar rock so cliff faces don't stretch
  const triW = pow(abs(normalWorld), vec3(4.0));
  const triSum = triW.x.add(triW.y).add(triW.z);
  const wX = triW.x.div(triSum);
  const wY = triW.y.div(triSum);
  const wZ = triW.z.div(triSum);
  const rockScale = 0.06;
  const rockTexXZ = texture(textures.rock, positionWorld.xz.mul(rockScale));
  const rockTexXY = texture(textures.rock, positionWorld.xy.mul(rockScale));
  const rockTexZY = texture(textures.rock, positionWorld.zy.mul(rockScale));
  let rockTex = rockTexXZ.mul(wY).add(rockTexXY.mul(wZ)).add(rockTexZY.mul(wX));
  // second, finer triplanar octave so the joints stay crisp up close
  const rockDetailScale = 0.31;
  const rockDetail = texture(textures.rock, positionWorld.xz.mul(rockDetailScale).add(0.37)).mul(wY)
    .add(texture(textures.rock, positionWorld.xy.mul(rockDetailScale).add(0.37)).mul(wZ))
    .add(texture(textures.rock, positionWorld.zy.mul(rockDetailScale).add(0.37)).mul(wX));
  // (linear-space mean of the tile is ~0.19, so this is a unity-gain modulation)
  rockTex = rockTex.mul(rockDetail.mul(1.1).add(0.79));
  // gentle sedimentary ledges (7 m period), a slow macro tone drift across the
  // face, and darker wet streaks running down it
  const strata = sin(positionWorld.y.mul(0.9).add(mottleMid.mul(3.0))).mul(0.5).add(0.5);
  rockTex = rockTex.mul(mix(float(0.83), float(0.99), strata));
  const ledges = texture(textures.noise, vec2(positionWorld.x.add(positionWorld.z).mul(0.02), positionWorld.y.mul(0.09))).r;
  rockTex = rockTex.mul(mix(float(0.84), float(1.12), ledges));
  const streaks = texture(textures.noise, vec2(positionWorld.x.add(positionWorld.z).mul(0.05), positionWorld.y.mul(0.006))).r;
  rockTex = rockTex.mul(mix(float(0.82), float(1.0), smoothstep(0.35, 0.7, streaks)));
  // the cool sky fill turns shaded rock slate-blue; a warm cast keeps it stone
  rockTex = rockTex.mul(vec4(1.07, 1.0, 0.9, 1.0));

  const height = positionWorld.y;
  const slope = clamp(float(1).sub(normalWorld.y), 0, 1);

  // masks
  // the beach's upper edge wanders with the slow mottle (±0.6 m) and stays
  // narrow on steep banks, so the sand is not a constant-width ring
  const sandTop = float(1.9).add(mottle.sub(0.5).mul(1.3)).sub(slope.mul(2.5));
  const sandMask = smoothstep(0.55, sandTop.max(0.75), height).oneMinus().mul(shoreProximity);
  const rockMask = smoothstep(0.16, 0.4, slope).max(smoothstep(11.5, 17.5, height).mul(smoothstep(0.05, 0.2, slope)));
  const mossMask = smoothstep(0.45, 0.72, mottle).mul(0.85);
  // leaf litter piles up under the canopy — denser than before, patchy, and
  // thickest where the canopy is closed
  const litterMask = smoothstep(0.22, 0.7, canopy).mul(smoothstep(0.22, 0.6, mottleMid.mul(0.5).add(0.5)))
    .mul(smoothstep(0.25, 0.55, mottleClose.mul(0.5).add(canopy.mul(0.5))))
    .mul(float(1).sub(sandMask))
    .mul(float(1).sub(rockMask));
  const trailBlend = trail.mul(smoothstep(0.2, 0.55, mottleFine.mul(0.6).add(0.4))).mul(float(1).sub(sandMask)).mul(float(1).sub(rockMask.mul(0.7)));
  // moss creeps over rock that isn't too steep and sits low in the valley
  const mossOnRock = smoothstep(0.55, 0.75, mottle)
    .mul(smoothstep(0.42, 0.7, slope).oneMinus())
    .mul(smoothstep(2.0, 9.0, height).oneMinus());
  // up on the terraces and the ridge the shelves are dry: lichen crusts and
  // thin moss in the hollows instead of the valley's wet carpet
  const lichenOnRock = smoothstep(0.52, 0.68, mottleFine)
    .mul(smoothstep(0.3, 0.6, slope).oneMinus())
    .mul(smoothstep(8.0, 12.0, height))
    .mul(smoothstep(0.35, 0.65, mottleMid));
  // rain runs down the steep faces and leaves dark mineral streaks
  const faceStreaks = smoothstep(0.45, 0.8, slope)
    .mul(smoothstep(0.42, 0.62, texture(textures.noise, vec2(positionWorld.x.add(positionWorld.z.mul(0.7)).mul(0.11), positionWorld.y.mul(0.012))).r));

  // path profile from the lateral coordinate: a compacted, lighter, smoother
  // centre; darker crumbly edges; two faint worn lines where feet fall
  const wander = mottleFine.sub(0.5).mul(0.11).add(mottleClose.sub(0.5).mul(0.05));
  const lateralW = lateral.add(wander);
  const centre = smoothstep(0.1, 0.3, lateralW).oneMinus().mul(trailBlend);
  const edge = smoothstep(0.16, 0.42, lateralW).mul(trailBlend);
  const rutPos = float(0.125).add(mottleDamp.sub(0.5).mul(0.06));
  const rut = smoothstep(0.0, 0.03, abs(lateral.add(mottleClose.sub(0.5).mul(0.03)).sub(rutPos))).oneMinus()
    .mul(smoothstep(0.35, 0.7, mottleMid)).mul(trailBlend).mul(0.6);

  // albedo
  let albedo = grassTex;
  albedo = mix(albedo, mossTex, mossMask);
  albedo = mix(albedo, litterTex, litterMask);
  // worn spots: bare earth showing through the grass beside the path
  const worn = smoothstep(0.02, 0.45, trail).mul(smoothstep(0.56, 0.7, mottleFine)).mul(float(1).sub(trailBlend)).mul(float(1).sub(sandMask)).mul(0.8);
  albedo = mix(albedo, dirtTex.mul(0.9), worn);
  // the path itself, shaped by the profile
  let pathTex = dirtTex.mul(centre.mul(0.26).add(1.0)).mul(edge.mul(0.22).oneMinus()).mul(rut.mul(0.18).oneMinus());
  // the compacted centre is smoother: lift most of the cavity shade there and
  // pull the fine grit toward the flatter slow tone
  pathTex = pathTex.mul(dirtCavity.mul(centre).mul(0.28).add(1.0));
  pathTex = mix(pathTex, dirtA.mul(mix(float(0.9), float(1.14), dirtHMacro)).mul(1.12), centre.mul(0.3));
  albedo = mix(albedo, pathTex, trailBlend);
  // a walked path is not one even colour: leaves blow onto it under the canopy
  // (thickest along the edges, individual big leaves near the camera), and
  // hollows stay damp and dark after rain
  const trailLitterBase = trailBlend.mul(smoothstep(0.3, 0.8, canopy)).mul(edge.mul(0.8).add(0.35));
  const trailLitter = trailLitterBase.mul(smoothstep(0.5, 0.72, mottleFine)).mul(0.75);
  albedo = mix(albedo, litterTex, trailLitter);
  const looseLeaves = trailLitterBase.mul(smoothstep(0.42, 0.52, litterHB)).mul(smoothstep(0.35, 0.6, mottleClose)).mul(near).mul(0.9);
  albedo = mix(albedo, litterB, looseLeaves);
  const trailDamp = trailBlend.mul(
    smoothstep(0.45, 0.62, mottleDamp).oneMinus().mul(smoothstep(0.3, 0.6, mottleMid)).max(smoothstep(0.2, 0.7, hollow).mul(0.9))
  );
  albedo = albedo.mul(trailDamp.mul(0.28).oneMinus());
  albedo = mix(albedo, sandTex, sandMask);
  let rockAlbedo = mix(rockTex, mossTex.mul(0.9), mossOnRock.mul(0.6));
  rockAlbedo = mix(rockAlbedo, mossTex.mul(vec3(0.95, 0.9, 0.7)), lichenOnRock.mul(0.45));
  rockAlbedo = rockAlbedo.mul(faceStreaks.mul(0.28).oneMinus());
  albedo = mix(albedo, rockAlbedo, rockMask);
  // large-scale tonal variation so the floor never tiles visibly
  albedo = albedo.mul(mix(float(0.8), float(1.12), mottle));
  albedo = albedo.mul(mix(float(0.92), float(1.06), mottleFine));
  // canopy shade + cavity (baked terrain ambient occlusion)
  albedo = albedo.mul(float(1).sub(canopy.mul(0.2)));
  albedo = albedo.mul(float(1).sub(cavity.mul(0.38)));

  // animated caustic light webs on everything below the waterline
  const underwaterMask = smoothstep(-0.6, 0.25, height).oneMinus().mul(shoreProximity);
  // (the caustics web is packed into the noise tile's alpha channel)
  const causticsA = texture(textures.noise, worldXZ.mul(0.14).add(vec2(time.mul(0.021), time.mul(0.013)))).a;
  const causticsB = texture(textures.noise, worldXZ.mul(0.09).sub(vec2(time.mul(0.017), time.mul(-0.011)))).a;
  const caustics = causticsA.mul(causticsB).mul(3.4).add(causticsA.mul(0.35));
  albedo = albedo.add(caustics.mul(underwaterMask).mul(0.55));
  // wet sand darkening right above the waterline, breathing with the swash:
  // the band climbs the beach on the run-up and darkens slightly, then recedes
  // (same swell phase and clock as the water's swash foam)
  const swash = swashNode(worldXZ); // 0 retreated … 1 run-up
  const wetTop = float(0.79).add(swash.mul(0.18));
  const wetBand = smoothstep(float(0.25), wetTop, height).oneMinus().mul(float(1).sub(underwaterMask)).mul(shoreProximity).mul(mix(float(0.22), float(0.3), swash));
  albedo = albedo.mul(float(1).sub(wetBand));

  material.colorNode = albedo.rgb;

  // normal maps blended with the same masks. Dirt combines its two octaves in
  // tangent space (sum the xy tilts) rather than crossfading the encoded maps.
  // Grass and sand borrow the dirt relief map at their own scale (with the
  // strength pulled down below) rather than spending two more texture units on
  // maps that are mostly hidden under the blade grass and the wet-sand band.
  const nGrass = texture(textures.dirtNormal, grassUv.mul(0.6).add(0.2)).rgb;
  const nSand = texture(textures.dirtNormal, worldXZ.mul(0.15)).rgb;
  const nDirtA0 = texture(textures.dirtNormal, dirtUvA).rgb.mul(2.0).sub(1.0);
  // the rotated lookup's tilt has to be rotated back into the world uv frame
  const nDirtR0 = texture(textures.dirtNormal, dirtUvR).rgb.mul(2.0).sub(1.0);
  const nDirtR = vec3(nDirtR0.y, nDirtR0.x.negate(), nDirtR0.z);
  const nDirtA = mix(nDirtA0, nDirtR, bomb);
  const nDirtB = texture(textures.dirtNormal, dirtUvB).rgb.mul(2.0).sub(1.0);
  const nDirt = normalize(vec3(nDirtA.xy.add(nDirtB.xy.mul(near.mul(0.6))), nDirtA.z)).mul(0.5).add(0.5);
  const nLitterA = texture(textures.litterNormal, litterUvA).rgb;
  const nLitterB = texture(textures.litterNormal, litterUvB).rgb;
  const nLitter = mix(nLitterA, nLitterB, bigLeaf);
  const nRockCoarse = texture(textures.rockNormal, positionWorld.xz.mul(rockScale)).rgb.mul(wY)
    .add(texture(textures.rockNormal, positionWorld.xy.mul(rockScale)).rgb.mul(wZ))
    .add(texture(textures.rockNormal, positionWorld.zy.mul(rockScale)).rgb.mul(wX));
  // the 17 m tile alone leaves a riser looking like troweled plaster at arm's
  // length, so the fine octave's joints are folded in ("whiteout" blend:
  // add the slopes, multiply the heights)
  const nRockFine = texture(textures.rockNormal, positionWorld.xz.mul(rockDetailScale).add(0.37)).rgb.mul(wY)
    .add(texture(textures.rockNormal, positionWorld.xy.mul(rockDetailScale).add(0.37)).rgb.mul(wZ))
    .add(texture(textures.rockNormal, positionWorld.zy.mul(rockDetailScale).add(0.37)).rgb.mul(wX));
  const nC = nRockCoarse.mul(2).sub(1);
  const nF = nRockFine.mul(2).sub(1);
  const nRock = normalize(vec3(nC.xy.add(nF.xy.mul(0.7)), nC.z.mul(nF.z))).mul(0.5).add(0.5);
  let nBlend = nGrass;
  nBlend = mix(nBlend, nLitter, litterMask);
  nBlend = mix(nBlend, nDirt, trailBlend.max(worn));
  nBlend = mix(nBlend, nLitter, trailLitter.max(looseLeaves));
  nBlend = mix(nBlend, nSand, sandMask);
  nBlend = mix(nBlend, nRock, rockMask);
  // relief strength: grass/sand 0.45 (the borrowed dirt relief is far stronger
  // than the old dedicated maps), dirt 1.4 → 1.8 (edges rougher, the compacted
  // centre and the ruts smoother), litter 1.5, rock 1.5 (the plate bevels need
  // it to read as jointed stone)
  const normalStrength = float(0.45)
    .add(trailBlend.mul(float(1.05).add(edge.mul(0.3)).sub(centre.mul(0.1)).sub(rut.mul(0.25))))
    .add(litterMask.max(trailLitter).mul(1.05))
    .add(rockMask.mul(1.05));
  material.normalNode = normalMap(nBlend, vec2(normalStrength));

  // roughness: damp hollows and the puddle floors go glossy, the compacted
  // centre and ruts are a touch smoother than the crumbly edges, the deep
  // cavities of the relief hold moisture
  material.roughnessNode = mix(float(0.95), float(0.8), sandMask)
    .sub(wetBand.mul(1.3))
    .sub(underwaterMask.mul(0.3))
    .sub(trailDamp.mul(0.42))
    .sub(rut.mul(0.1))
    .sub(centre.mul(0.05))
    .add(edge.mul(0.03))
    .sub(dirtCavity.mul(trailBlend).mul(0.12))
    .add(rockMask.mul(0.02));

  // ---------- tiling ----------
  // The grid is one 295 k-triangle mesh that spans the whole map, so three.js
  // never frustum-culls it: every pass (main, planar reflection) shades all of
  // it. Split only the INDEX into an N×N grid of tiles that share the very same
  // vertex attributes (position / normal / uv, in grid order) and the same
  // material, each tile carrying a tight bounding sphere for culling. The
  // triangles are copied from the PlaneGeometry index verbatim (same vertex
  // ids, same winding), so the rasterised result is identical.
  const TILES = TERRAIN_TILES;
  const gridX1 = segments + 1;
  const srcIndex = geometry.index.array;
  // sort key: the renderer orders opaque objects by the projected centre of
  // geometry.boundingSphere. Every tile keeps the full grid's sphere there so
  // the tiles sit exactly where the single mesh sat in the render order (with
  // depth-tied pixels — trunks and boulders meeting the ground — resolved the
  // same way); culling uses the per-object sphere instead (Frustum reads
  // object.boundingSphere first when the property exists).
  geometry.computeBoundingSphere();
  const sortSphere = geometry.boundingSphere;
  const posArr = positions.array;
  const tiles = [];
  const tileBox = new THREE.Box3();
  const tileV = new THREE.Vector3();
  for (let tz = 0; tz < TILES; tz += 1) {
    const iy0 = Math.floor((tz * segments) / TILES);
    const iy1 = Math.floor(((tz + 1) * segments) / TILES);
    for (let tx = 0; tx < TILES; tx += 1) {
      const ix0 = Math.floor((tx * segments) / TILES);
      const ix1 = Math.floor(((tx + 1) * segments) / TILES);
      const quads = (ix1 - ix0) * (iy1 - iy0);
      const tileIndex = new Uint32Array(quads * 6);
      let o = 0;
      for (let iy = iy0; iy < iy1; iy += 1) {
        const rowStart = (iy * segments + ix0) * 6;
        tileIndex.set(srcIndex.subarray(rowStart, rowStart + (ix1 - ix0) * 6), o);
        o += (ix1 - ix0) * 6;
      }
      tileBox.makeEmpty();
      for (let iy = iy0; iy <= iy1; iy += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const v = (iy * gridX1 + ix) * 3;
          tileV.set(posArr[v], posArr[v + 1], posArr[v + 2]);
          tileBox.expandByPoint(tileV);
        }
      }
      const tileGeo = new THREE.BufferGeometry();
      for (const name of Object.keys(geometry.attributes)) {
        tileGeo.setAttribute(name, geometry.attributes[name]);
      }
      tileGeo.setIndex(new THREE.BufferAttribute(tileIndex, 1));
      tileGeo.boundingBox = tileBox.clone();
      tileGeo.boundingSphere = sortSphere.clone();
      const tile = new THREE.Mesh(tileGeo, material);
      tile.boundingSphere = tileBox.getBoundingSphere(new THREE.Sphere());
      tile.receiveShadow = true;
      tile.castShadow = false;
      tile.frustumCulled = true;
      tiles.push(tile);
    }
  }
  // the first tile is the object other modules know as "the terrain mesh":
  // its geometry exposes the whole shared grid (grass.js reads exact heights
  // from it) and hiding it hides every tile
  const mesh = tiles[0];
  mesh.name = 'terrain';
  for (let i = 1; i < tiles.length; i += 1) {
    tiles[i].name = `terrain-tile-${i}`;
    mesh.add(tiles[i]);
  }

  // ---------- collision / placement helpers ----------
  const normalA = new THREE.Vector3();

  function sampleNormal(x, z, out = normalA) {
    const e = 0.65;
    const hL = sampleHeight(x - e, z);
    const hR = sampleHeight(x + e, z);
    const hD = sampleHeight(x, z - e);
    const hU = sampleHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  return {
    mesh,
    tiles,
    sampleHeight,
    sampleNormal,
    canopyDensity,
    trailDistance,
    trailMask,
    zonesAt,
    waterProximity,
    riverCenterX,
    controlTexture: controlTex,
    update() {},
  };
}
