// Water: TSL surface material (reflections, depth tint, foam, sun glints),
// an interactive GPU ripple simulation (ping-pong wave equation — runs as
// fragment passes so it behaves identically on WebGPU and WebGL2 backends),
// the waterfall, and shoreline boulders.

import * as THREE from 'three/webgpu';
import {
  texture,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  positionLocal,
  positionWorld,
  time,
  sin,
  cos,
  normalize,
  reflect,
  dot,
  max,
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
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32 } from './noise.js';

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

const RIPPLE_DOMAIN = 56; // meters covered by the simulation around the player

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
    let velocity = center.g.add(laplacian.mul(1.85)).mul(0.984);

    // impulses (player steps, swimming, waterfall churn)
    const worldPos = uv().sub(0.5).mul(RIPPLE_DOMAIN).add(uCenter);
    for (const imp of impulses) {
      const d = worldPos.sub(imp.xy).length();
      const splash = exp(d.mul(d).div(imp.w.mul(imp.w)).negate()).mul(imp.z);
      velocity = velocity.add(splash);
    }

    let height = center.r.add(velocity).mul(0.9965);

    // fade at the domain border so waves never bounce off the edge
    const border = smoothstep(0.0, 0.08, uv().x)
      .mul(smoothstep(1.0, 0.92, uv().x))
      .mul(smoothstep(0.0, 0.08, uv().y))
      .mul(smoothstep(1.0, 0.92, uv().y));
    height = height.mul(border);
    velocity = velocity.mul(border);

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
    center.set(
      Math.round(playerPos.x / snap) * snap,
      Math.round(playerPos.z / snap) * snap
    );
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
  };
}

// Bake terrain height into a texture so the water shader knows the depth of
// the column under every fragment (identical on both backends — no scene
// depth readback needed).
function bakeHeightTexture(terrain) {
  const size = 256;
  const data = new Uint8Array(size * size);
  const min = -9;
  const max = 25;
  for (let iz = 0; iz < size; iz += 1) {
    for (let ix = 0; ix < size; ix += 1) {
      const x = (ix / (size - 1) - 0.5) * WORLD.size;
      const z = (iz / (size - 1) - 0.5) * WORLD.size;
      const h = terrain.sampleHeight(x, z);
      data[iz * size + ix] = Math.round(THREE.MathUtils.clamp((h - min) / (max - min), 0, 1) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, min, max };
}

export function createWater(ctx) {
  const { scene, renderer, terrain, textures, player } = ctx;
  const random = mulberry32(WORLD.seed + 777);

  const ripple = createRippleSim(renderer, 256);
  const heightBake = bakeHeightTexture(terrain);

  // ---------------- water surface ----------------
  const surfaceGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 192, 192);
  surfaceGeo.rotateX(-Math.PI / 2);

  const worldXZ = positionWorld.xz;

  const rippleUV = (xz) => xz.sub(ripple.centerUniform).div(RIPPLE_DOMAIN).add(0.5);
  const rippleMaskFor = (ruv) =>
    smoothstep(0.0, 0.06, ruv.x)
      .mul(smoothstep(1.0, 0.94, ruv.x))
      .mul(smoothstep(0.0, 0.06, ruv.y))
      .mul(smoothstep(1.0, 0.94, ruv.y));

  const waveHeightNode = (xz) => {
    let h = float(0);
    for (const w of WAVES) {
      h = h.add(
        sin(xz.x.mul(w.dirX).add(xz.y.mul(w.dirZ)).mul(w.freq).add(time.mul(w.speed))).mul(w.amp)
      );
    }
    return h;
  };

  // analytic wave normal + ripple gradient
  const waterNormalNode = () => {
    let dhdx = float(0);
    let dhdz = float(0);
    for (const w of WAVES) {
      const phase = worldXZ.x.mul(w.dirX).add(worldXZ.y.mul(w.dirZ)).mul(w.freq).add(time.mul(w.speed));
      const slope = cos(phase).mul(w.amp * w.freq);
      dhdx = dhdx.add(slope.mul(w.dirX));
      dhdz = dhdz.add(slope.mul(w.dirZ));
    }
    const ruv = rippleUV(worldXZ);
    const mask = rippleMaskFor(ruv);
    const e = 0.45;
    const rC = ripple.textureNode.sample(ruv).r;
    const rX = ripple.textureNode.sample(rippleUV(worldXZ.add(vec2(e, 0)))).r;
    const rZ = ripple.textureNode.sample(rippleUV(worldXZ.add(vec2(0, e)))).r;
    const gradX = rX.sub(rC).div(e).mul(mask).mul(1.6);
    const gradZ = rZ.sub(rC).div(e).mul(mask).mul(1.6);
    return normalize(vec3(dhdx.add(gradX).negate(), 1, dhdz.add(gradZ).negate()));
  };

  // water-column depth from the baked terrain height
  const bakedUV = worldXZ.div(WORLD.size).add(0.5);
  const terrainHeightNode = texture(heightBake.tex, bakedUV).r
    .mul(heightBake.max - heightBake.min)
    .add(heightBake.min);
  const columnDepth = float(WORLD.waterLevel).sub(terrainHeightNode);
  const depthFactor = clamp(columnDepth.div(3.2), 0, 1);

  // vertex displacement: analytic waves + simulated ripples
  const surfaceRippleUV = rippleUV(positionLocal.xz);
  const surfaceRipple = ripple.textureNode.sample(surfaceRippleUV).r
    .mul(rippleMaskFor(surfaceRippleUV));

  function buildSurfaceMaterial(reflectionNode) {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    material.positionNode = positionLocal.add(
      vec3(0, waveHeightNode(positionLocal.xz).add(surfaceRipple.mul(1.1)), 0)
    );

    const normal = waterNormalNode();
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(clamp(float(1).sub(max(dot(viewDir, normal), 0)), 0, 1), 5)
      .mul(0.58)
      .add(0.04);

    const shallowColor = vec3(0.21, 0.74, 0.66);
    const deepColor = vec3(0.015, 0.23, 0.28);
    const baseColor = mix(shallowColor, deepColor, depthFactor);

    let reflectionColor;
    if (reflectionNode) {
      // tint the mirror toward water so the foggy horizon can't white it out
      reflectionColor = reflectionNode.rgb.mul(vec3(0.62, 0.82, 0.84));
    } else {
      // cheap sky-gradient reflection for Low/Medium
      const reflectDir = reflect(viewDir.negate(), normal);
      const upness = clamp(reflectDir.y, 0, 1);
      reflectionColor = mix(vec3(0.78, 0.86, 0.82), vec3(0.34, 0.58, 0.86), pow(upness, 0.6));
    }

    const sunDir = uniform(ctx.sky.sunDirection.clone());
    const glint = pow(max(dot(reflect(viewDir.negate(), normal), sunDir), 0), 240).mul(2.4);

    // foam: shoreline band + ripple crests + waterfall churn pool
    const foamTexA = texture(textures.noise, worldXZ.mul(0.22).add(vec2(time.mul(0.025), time.mul(-0.018)))).r;
    const foamTexB = texture(textures.noise, worldXZ.mul(0.13).add(vec2(time.mul(-0.02), time.mul(0.024)))).r;
    const foamPattern = smoothstep(0.42, 0.72, foamTexA.mul(0.6).add(foamTexB.mul(0.4)));

    const shoreFoam = smoothstep(0.55, 0.06, columnDepth).mul(foamPattern.mul(0.7).add(0.3));
    const crestFoam = smoothstep(0.07, 0.16, abs(surfaceRipple)).mul(0.7);
    const fallDist = worldXZ.sub(vec2(WORLD.waterfallX, -80)).length();
    const fallFoam = smoothstep(9, 3.5, fallDist).mul(foamPattern.mul(0.5).add(0.5)).mul(0.85);
    const foam = clamp(shoreFoam.add(crestFoam).add(fallFoam), 0, 1);

    const waterShade = mix(baseColor, reflectionColor, fresnel.mul(reflectionNode ? 0.9 : 0.75));
    const foamColor = vec3(0.97, 1.0, 0.99);
    material.colorNode = mix(waterShade, foamColor, foam).add(glint);
    material.opacityNode = clamp(
      float(0.58).add(depthFactor.mul(0.36)).add(foam.mul(0.4)),
      0,
      0.97
    );
    return material;
  }

  // planar reflection target (only rendered on High/Ultra)
  const reflection = reflector({ resolutionScale: 0.5 });
  reflection.target.rotateX(-Math.PI / 2);
  reflection.target.position.set(0, WORLD.waterLevel, 0);
  scene.add(reflection.target);
  reflection.uvNode = reflection.uvNode.add(waterNormalNode().xz.mul(0.05));

  const materialWithReflection = buildSurfaceMaterial(reflection);
  const materialCheap = buildSurfaceMaterial(null);

  const surface = new THREE.Mesh(surfaceGeo, materialWithReflection);
  surface.position.y = WORLD.waterLevel;
  surface.renderOrder = 2;
  surface.name = 'water-surface';
  surface.frustumCulled = false;
  scene.add(surface);

  // ---------------- waterfall ----------------
  const fallTop = 19.5;
  const fallBottom = -0.6;
  const fallHeight = fallTop - fallBottom;
  const fallGeo = new THREE.PlaneGeometry(7.5, fallHeight, 10, 26);
  {
    const pos = fallGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) + fallHeight / 2; // 0..height from bottom
      const t = Math.min(1, Math.max(0, y / fallHeight));
      // sheet hugs the cliff at the top, pours forward at the bottom
      const bulge = Math.pow(1 - t, 1.8) * 4.2;
      const xNarrow = 1 - (1 - t) * 0.18;
      pos.setX(i, pos.getX(i) * xNarrow);
      pos.setZ(i, pos.getZ(i) + bulge);
    }
    pos.needsUpdate = true;
    fallGeo.computeVertexNormals();
  }

  function buildFallMaterial({ scaleX, scaleY, speed, brightLow, brightHigh, opacity }) {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const streakUV = uv();
    const streaksA = texture(textures.noise, vec2(streakUV.x.mul(scaleX), streakUV.y.mul(scaleY).sub(time.mul(speed)))).r;
    const streaksB = texture(textures.noise, vec2(streakUV.x.mul(scaleX * 2.1).add(0.31), streakUV.y.mul(scaleY * 2).sub(time.mul(speed * 1.7)))).r;
    const streaks = streaksA.mul(0.6).add(streaksB.mul(0.55));
    const edge = smoothstep(0, 0.16, streakUV.x).mul(smoothstep(1, 0.84, streakUV.x));
    const headFade = smoothstep(1.0, 0.93, streakUV.y);
    const bottomBoost = smoothstep(0.35, 0.0, streakUV.y).mul(0.3);
    material.colorNode = mix(brightLow, brightHigh, streaks).add(bottomBoost);
    material.opacityNode = clamp(streaks.mul(opacity).add(0.12).add(bottomBoost), 0, 1)
      .mul(edge)
      .mul(headFade);
    return material;
  }

  const waterfall = new THREE.Mesh(
    fallGeo,
    buildFallMaterial({
      scaleX: 3.2,
      scaleY: 1.4,
      speed: 0.55,
      brightLow: vec3(0.52, 0.7, 0.78),
      brightHigh: vec3(0.94, 1.0, 1.04),
      opacity: 0.75,
    })
  );
  waterfall.position.set(WORLD.waterfallX, fallBottom + fallHeight / 2, -85.4);
  waterfall.name = 'waterfall';
  scene.add(waterfall);

  const fallBack = new THREE.Mesh(
    fallGeo.clone(),
    buildFallMaterial({
      scaleX: 2.2,
      scaleY: 1.1,
      speed: 0.34,
      brightLow: vec3(0.5, 0.68, 0.76),
      brightHigh: vec3(0.9, 0.97, 1.0),
      opacity: 0.5,
    })
  );
  fallBack.position.set(WORLD.waterfallX + 0.4, fallBottom + fallHeight / 2 + 0.4, -86.1);
  fallBack.scale.set(1.18, 1.01, 1);
  fallBack.name = 'waterfall-back';
  scene.add(fallBack);

  // ---------------- boulders ----------------
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const pos = rockGeo.attributes.position;
    const rockRandom = mulberry32(31);
    for (let i = 0; i < pos.count; i += 1) {
      const s = 0.75 + rockRandom() * 0.5;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.78, pos.getZ(i) * s);
    }
    pos.needsUpdate = true;
    rockGeo.computeVertexNormals();
  }
  const rockMat = new THREE.MeshStandardNodeMaterial({ map: textures.rock, roughness: 0.96 });
  const rockSpots = [
    // waterfall plunge pool + cliff crest
    { x: -4.6, z: -82.5, s: 2.2 }, { x: 4.8, z: -83.1, s: 1.8 },
    { x: -7.2, z: -79.8, s: 1.5 }, { x: 6.9, z: -79.2, s: 1.3 },
    { x: 0.4, z: -88.5, s: 2.6, y: 18.5 }, { x: -5.2, z: -87.6, s: 2.2, y: 17.4 },
    { x: 5.7, z: -87.9, s: 2.0, y: 17.8 },
  ];
  for (let i = 0; i < 46; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = WORLD.lagoonRadius + (random() - 0.35) * 14;
    rockSpots.push({
      x: WORLD.lagoonCenter.x + Math.cos(angle) * radius,
      z: WORLD.lagoonCenter.z + Math.sin(angle) * radius,
      s: 0.4 + random() * 1.3,
    });
  }
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
  const dummy = new THREE.Object3D();
  rockSpots.forEach((spot, i) => {
    const ground = spot.y ?? terrain.sampleHeight(spot.x, spot.z);
    dummy.position.set(spot.x, ground + spot.s * 0.18, spot.z);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI * 0.3);
    dummy.scale.setScalar(spot.s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = 'boulders';
  scene.add(rocks);

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
    const angle = random() * Math.PI * 2;
    const radius = random() * (WORLD.lagoonRadius - 6);
    floaters.push({
      x: WORLD.lagoonCenter.x + Math.cos(angle) * radius,
      z: WORLD.lagoonCenter.z + Math.sin(angle) * radius,
      yaw: random() * Math.PI * 2,
      driftAngle: random() * Math.PI * 2,
      driftSpeed: 0.06 + random() * 0.12,
      spin: (random() - 0.5) * 0.25,
      scale: 0.7 + random() * 0.9,
    });
  }
  leaves.name = 'floating-leaves';
  scene.add(leaves);

  // ---------------- player interaction ----------------
  let wasInWater = false;
  let stirTimer = 0;

  player.onStep(() => {
    if (player.isWading || player.isSwimming) {
      ripple.addImpulse(
        player.position.x,
        player.position.z,
        Math.min(0.16, 0.05 + player.speed2D * 0.018),
        0.5
      );
    }
  });

  const fallChurnX = [-2.6, 0, 2.7];

  function update(dt, t) {
    // waterfall churn — continuous random impulses along the impact line
    const churn = fallChurnX[Math.floor(Math.random() * fallChurnX.length)];
    ripple.addImpulse(
      WORLD.waterfallX + churn + (Math.random() - 0.5) * 1.6,
      -80.6 + (Math.random() - 0.5) * 1.8,
      0.05 + Math.random() * 0.07,
      1.3
    );

    // swimming stirs the water
    if (player.isSwimming && player.speed2D > 0.5) {
      stirTimer -= dt;
      if (stirTimer <= 0) {
        stirTimer = 0.16;
        ripple.addImpulse(player.position.x, player.position.z, 0.07, 0.7);
      }
    }

    // entering the water with speed → splash
    const inWater = player.isWading || player.isSwimming;
    if (inWater && !wasInWater) {
      const punch = Math.min(0.5, 0.12 + Math.abs(player.velocity.y) * 0.06 + player.speed2D * 0.02);
      ripple.addImpulse(player.position.x, player.position.z, punch, 1.0);
    }
    wasInWater = inWater;

    ripple.update(player.position);

    // floating leaves bob on the analytic waves
    for (let i = 0; i < floaters.length; i += 1) {
      const f = floaters[i];
      f.x += Math.cos(f.driftAngle) * f.driftSpeed * dt;
      f.z += Math.sin(f.driftAngle) * f.driftSpeed * dt;
      f.yaw += f.spin * dt;
      const dx = f.x - WORLD.lagoonCenter.x;
      const dz = f.z - WORLD.lagoonCenter.z;
      if (Math.hypot(dx, dz) > WORLD.lagoonRadius - 4) {
        f.driftAngle += Math.PI * (0.75 + Math.random() * 0.5);
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
  }

  return {
    surface,
    ripple,
    update,
    applyQuality,
  };
}
