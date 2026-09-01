// Terrain: procedural heightfield + TSL splat material + collision sampling.

import * as THREE from 'three/webgpu';
import {
  texture,
  positionWorld,
  normalWorld,
  float,
  vec2,
  smoothstep,
  mix,
  clamp,
  time,
} from 'three/tsl';
import { WORLD } from './config.js';
import { createFbm2D, smoothstep as smoothstepJs, clamp as clampJs, lerp } from './noise.js';

// River center line: winding path heading south (+z) out of the lagoon.
export function riverCenterX(z) {
  return Math.sin(z * 0.024) * 16 + Math.sin(z * 0.061 + 1.7) * 7;
}

export function createHeightSampler() {
  const hills = createFbm2D(WORLD.seed, { octaves: 4 });
  const detail = createFbm2D(WORLD.seed + 7, { octaves: 2 });
  const half = WORLD.size / 2;
  const lagoon = WORLD.lagoonCenter;

  function sampleHeight(x, z) {
    // --- base rolling jungle floor, sits a few meters above the water ---
    let h = 2.6 + hills(x * 0.012, z * 0.012) * 4.6 + detail(x * 0.045, z * 0.045) * 1.1;

    // --- raised rim so the map edge reads as deep jungle, not a cliff edge ---
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    h += smoothstepJs(0.66, 1.0, edge) * 17;

    // --- north cliff massif behind the lagoon (the waterfall wall) ---
    const dxL = x - lagoon.x;
    const dzL = z - lagoon.z;
    const distL = Math.sqrt(dxL * dxL + dzL * dzL) + 1e-6;
    const northness = smoothstepJs(0.1, 0.78, -dzL / distL);
    const cliffRamp = smoothstepJs(WORLD.lagoonRadius - 4, WORLD.lagoonRadius + 30, distL);
    const cliffFar = 1 - smoothstepJs(140, 190, distL); // merge back into hills far away
    // Notch above the waterfall spout so the silhouette dips where water pours.
    const notch = 1 - smoothstepJs(26, 6, Math.abs(x - WORLD.waterfallX)) * 0.32;
    h += cliffRamp * cliffFar * northness * WORLD.cliffHeight * notch;
    // Rocky shoulders flanking the falls
    h += cliffRamp * cliffFar * northness * detail(x * 0.05, z * 0.05) * 3.2;

    // --- lagoon bowl ---
    const shore = smoothstepJs(WORLD.lagoonRadius + 9, WORLD.lagoonRadius - 13, distL);
    const bowlDepth = -4.6 - 1.6 * smoothstepJs(WORLD.lagoonRadius * 0.7, 0, distL);
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

    // --- flatten sandy shores right around the waterline ---
    const nearWaterline = 1 - smoothstepJs(0.2, 2.4, Math.abs(h - 0.5));
    h = lerp(h, 0.42, nearWaterline * 0.5);

    return h;
  }

  return sampleHeight;
}

export function createTerrain(ctx) {
  const { textures } = ctx;
  const sampleHeight = createHeightSampler();
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

  const worldXZ = positionWorld.xz;
  const grassTex = texture(textures.grass, worldXZ.mul(0.12));
  const sandTex = texture(textures.sand, worldXZ.mul(0.15));
  const rockTex = texture(textures.rock, worldXZ.mul(0.05));
  const mossTex = texture(textures.moss, worldXZ.mul(0.08));
  const mottle = texture(textures.noise, worldXZ.mul(0.012)).r;
  const mottleFine = texture(textures.noise, worldXZ.mul(0.05)).r;

  const height = positionWorld.y;
  const slope = clamp(float(1).sub(normalWorld.y), 0, 1);

  // sand near the waterline (and under water)
  const sandMask = smoothstep(1.8, 0.55, height);
  // rock on steep slopes and high cliffs
  const rockMask = smoothstep(0.18, 0.42, slope).max(smoothstep(10.5, 16.5, height));
  // mossy mottling across the jungle floor (sand/rock layered on top win near water/cliffs)
  const mossMask = smoothstep(0.45, 0.72, mottle).mul(0.85);

  let albedo = grassTex;
  albedo = mix(albedo, mossTex, mossMask);
  albedo = mix(albedo, sandTex, sandMask);
  albedo = mix(albedo, rockTex, rockMask);
  // large-scale tonal variation so the floor never tiles visibly
  albedo = albedo.mul(mix(float(0.82), float(1.12), mottle));
  albedo = albedo.mul(mix(float(0.92), float(1.06), mottleFine));

  // animated caustic light webs on everything below the waterline
  const underwaterMask = smoothstep(0.25, -0.6, height);
  const causticsA = texture(textures.caustics, worldXZ.mul(0.14).add(vec2(time.mul(0.021), time.mul(0.013)))).r;
  const causticsB = texture(textures.caustics, worldXZ.mul(0.09).sub(vec2(time.mul(0.017), time.mul(-0.011)))).r;
  const caustics = causticsA.mul(causticsB).mul(3.4).add(causticsA.mul(0.35));
  albedo = albedo.add(caustics.mul(underwaterMask).mul(0.55));
  // wet sand darkening right above the waterline
  const wetBand = smoothstep(0.85, 0.25, height).mul(float(1).sub(underwaterMask)).mul(0.24);
  albedo = albedo.mul(float(1).sub(wetBand));

  material.colorNode = albedo;
  material.roughnessNode = mix(float(0.96), float(0.78), sandMask);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';

  // ---------- collision helpers ----------
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
    sampleHeight,
    sampleNormal,
    update() {},
  };
}
