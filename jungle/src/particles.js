// Life & air: waterfall mist and spray, drifting pollen, falling leaves,
// butterflies, dragonflies and distant birds.

import * as THREE from 'three/webgpu';
import {
  positionLocal,
  vec3,
  sin,
  time,
  hash,
  instanceIndex,
  float,
  texture,
  mix,
  abs,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32 } from './noise.js';
import { waveHeightAt } from './water.js';

const TAU = Math.PI * 2;

export function createParticles(ctx) {
  const { scene, terrain, textures } = ctx;
  const random = mulberry32(WORLD.seed + 4242);
  const dummy = new THREE.Object3D();
  const updaters = [];
  const quality = { particleDensity: 1 };

  // ---------------- waterfall mist ----------------
  const mistCount = 16;
  const mistMat = new THREE.SpriteNodeMaterial({
    map: textures.softSprite,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    opacity: 0.32,
  });
  mistMat.colorNode = vec3(0.92, 0.98, 1.0);
  const mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mistMat, mistCount);
  mist.frustumCulled = false;
  const mistStates = Array.from({ length: mistCount }, (_, i) => ({
    x: WORLD.waterfallX + (random() - 0.5) * 9,
    z: -81 + (random() - 0.5) * 5,
    phase: random() * TAU,
    speed: 0.25 + random() * 0.4,
    scale: 4 + random() * 6,
  }));
  scene.add(mist);
  updaters.push((dt, t) => {
    mistStates.forEach((m, i) => {
      const cycle = (t * m.speed + m.phase) % 1.6;
      const grow = cycle / 1.6;
      dummy.position.set(m.x, 0.6 + grow * 5.2, m.z + grow * 1.6);
      dummy.scale.setScalar(m.scale * (0.55 + grow * 0.9));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mist.setMatrixAt(i, dummy.matrix);
    });
    mist.instanceMatrix.needsUpdate = true;
  });

  // ---------------- waterfall spray ----------------
  const sprayCount = 70;
  const sprayMat = new THREE.SpriteNodeMaterial({
    map: textures.softSprite,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
  sprayMat.colorNode = vec3(0.97, 1.0, 1.0);
  const spray = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sprayMat, sprayCount);
  spray.frustumCulled = false;
  const sprayStates = Array.from({ length: sprayCount }, () => ({
    t: random() * 1.0,
    x: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    scale: 0.14 + random() * 0.3,
  }));
  function respawnSpray(s) {
    s.t = 0;
    s.x = WORLD.waterfallX + (random() - 0.5) * 7.5;
    s.z = -81.5 + (random() - 0.5) * 2.5;
    s.vx = (random() - 0.5) * 3.4;
    s.vy = 2.4 + random() * 4.2;
    s.vz = (random() - 0.5) * 3.4 + 1.2;
  }
  sprayStates.forEach(respawnSpray);
  scene.add(spray);
  updaters.push((dt) => {
    sprayStates.forEach((s, i) => {
      s.t += dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      const py = 0.5 + s.vy * s.t - 4.9 * s.t * s.t;
      if (py < 0 || s.t > 1.8) {
        respawnSpray(s);
      }
      dummy.position.set(s.x, Math.max(0.1, py), s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      spray.setMatrixAt(i, dummy.matrix);
    });
    spray.instanceMatrix.needsUpdate = true;
  });

  // ---------------- pollen motes (GPU-animated, zero CPU cost) ----------------
  const pollenCount = 260;
  const pollenMat = new THREE.SpriteNodeMaterial({
    map: textures.softSprite,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  pollenMat.colorNode = vec3(1.0, 0.95, 0.6);
  pollenMat.opacityNode = float(0.28).mul(
    sin(time.mul(0.8).add(hash(instanceIndex).mul(TAU))).mul(0.5).add(0.5)
  );
  // gentle GPU drift around each mote's anchor
  const driftPhase = hash(instanceIndex.add(9)).mul(TAU);
  pollenMat.positionNode = positionLocal.add(
    vec3(
      sin(time.mul(0.31).add(driftPhase)).mul(1.4),
      sin(time.mul(0.23).add(driftPhase.mul(1.7))).mul(0.9),
      sin(time.mul(0.27).add(driftPhase.mul(2.3))).mul(1.4)
    )
  );
  const pollen = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.09), pollenMat, pollenCount);
  pollen.frustumCulled = false;
  for (let i = 0; i < pollenCount; i += 1) {
    // concentrate around the lagoon clearing where the light shafts live
    const angle = random() * TAU;
    const radius = Math.pow(random(), 0.6) * 90;
    const x = WORLD.lagoonCenter.x + Math.cos(angle) * radius;
    const z = WORLD.lagoonCenter.z + 30 + Math.sin(angle) * radius;
    const ground = Math.max(terrain.sampleHeight(x, z), WORLD.waterLevel);
    dummy.position.set(x, ground + 0.6 + random() * 5, z);
    dummy.scale.setScalar(0.6 + random() * 1.4);
    dummy.updateMatrix();
    pollen.setMatrixAt(i, dummy.matrix);
  }
  scene.add(pollen);

  // ---------------- falling leaves ----------------
  const leafCount = 36;
  const leafMat = new THREE.MeshBasicNodeMaterial({
    map: textures.canopy,
    transparent: false,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  const fallingLeaf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.32), leafMat, leafCount);
  fallingLeaf.frustumCulled = false;
  const leafStates = Array.from({ length: leafCount }, () => ({
    x: 0, y: 0, z: 0, spin: random() * TAU, fall: 0, sway: random() * TAU,
  }));
  function respawnLeaf(s) {
    const angle = random() * TAU;
    const radius = Math.pow(random(), 0.7) * 120;
    s.x = Math.cos(angle) * radius;
    s.z = -20 + Math.sin(angle) * radius;
    s.y = 9 + random() * 8;
    s.fall = 0.5 + random() * 0.5;
    s.spin = random() * TAU;
    s.sway = random() * TAU;
  }
  leafStates.forEach(respawnLeaf);
  scene.add(fallingLeaf);
  updaters.push((dt, t) => {
    leafStates.forEach((s, i) => {
      s.y -= s.fall * dt;
      s.x += Math.sin(t * 1.3 + s.sway) * 0.5 * dt;
      s.z += Math.cos(t * 1.1 + s.sway) * 0.4 * dt;
      const ground = terrain.sampleHeight(s.x, s.z);
      if (s.y < Math.max(ground, WORLD.waterLevel) + 0.15) {
        respawnLeaf(s);
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(
        Math.sin(t * 2.1 + s.spin) * 0.9,
        s.spin + t * 0.8,
        Math.cos(t * 1.7 + s.spin) * 0.7
      );
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      fallingLeaf.setMatrixAt(i, dummy.matrix);
    });
    fallingLeaf.instanceMatrix.needsUpdate = true;
  });

  // ---------------- butterflies ----------------
  function makeFlappers({ count, textureMap, size, heightRange, speed, area, aboveWater = false }) {
    const geo = new THREE.PlaneGeometry(size, size * 0.72, 2, 1);
    geo.rotateX(-Math.PI / 2); // lie flat, wings along x
    const mat = new THREE.MeshBasicNodeMaterial({
      map: textureMap,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
    // wing flap: lift vertices by |x| * sin(fast time + per-instance phase)
    const flapPhase = hash(instanceIndex).mul(TAU);
    const flap = sin(time.mul(speed.flap).add(flapPhase));
    mat.positionNode = positionLocal.add(
      vec3(0, abs(positionLocal.x).mul(flap).mul(1.3), 0)
    );
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const states = Array.from({ length: count }, () => {
      const angle = random() * TAU;
      const radius = Math.pow(random(), 0.6) * area;
      return {
        x: WORLD.lagoonCenter.x + Math.cos(angle) * radius,
        z: WORLD.lagoonCenter.z + 26 + Math.sin(angle) * radius,
        heading: random() * TAU,
        turnPhase: random() * TAU,
        bobPhase: random() * TAU,
        h: heightRange[0] + random() * (heightRange[1] - heightRange[0]),
      };
    });
    scene.add(mesh);
    updaters.push((dt, t) => {
      states.forEach((s, i) => {
        s.heading += Math.sin(t * 0.7 + s.turnPhase) * 1.4 * dt;
        s.x += Math.cos(s.heading) * speed.fly * dt;
        s.z += Math.sin(s.heading) * speed.fly * dt;
        // stay in the play area
        const dx = s.x - WORLD.lagoonCenter.x;
        const dz = s.z - (WORLD.lagoonCenter.z + 26);
        if (Math.hypot(dx, dz) > area) {
          s.heading = Math.atan2(-dz, -dx) + (random() - 0.5);
        }
        let baseY;
        if (aboveWater) {
          baseY = WORLD.waterLevel + waveHeightAt(s.x, s.z, t);
        } else {
          baseY = Math.max(terrain.sampleHeight(s.x, s.z), WORLD.waterLevel);
        }
        const y = baseY + s.h + Math.sin(t * 1.9 + s.bobPhase) * 0.35;
        dummy.position.set(s.x, y, s.z);
        dummy.rotation.set(0, -s.heading + Math.PI / 2, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    return mesh;
  }

  makeFlappers({
    count: 10,
    textureMap: textures.butterfly,
    size: 0.34,
    heightRange: [0.8, 2.6],
    speed: { fly: 1.6, flap: 14 },
    area: 120,
  });
  makeFlappers({
    count: 8,
    textureMap: textures.butterflyB,
    size: 0.3,
    heightRange: [0.7, 2.2],
    speed: { fly: 1.9, flap: 16 },
    area: 130,
  });
  // dragonflies skimming the lagoon
  makeFlappers({
    count: 7,
    textureMap: textures.butterflyB,
    size: 0.22,
    heightRange: [0.25, 0.7],
    speed: { fly: 5.2, flap: 26 },
    area: 40,
    aboveWater: true,
  });

  // ---------------- distant birds ----------------
  const birdCount = 7;
  const birdGeo = new THREE.PlaneGeometry(1.4, 0.5, 2, 1);
  birdGeo.rotateX(-Math.PI / 2);
  const birdMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  birdMat.colorNode = vec3(0.08, 0.1, 0.1);
  const birdFlap = sin(time.mul(7).add(hash(instanceIndex).mul(TAU)));
  birdMat.positionNode = positionLocal.add(vec3(0, abs(positionLocal.x).mul(birdFlap).mul(0.8), 0));
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, birdCount);
  birds.frustumCulled = false;
  const birdStates = Array.from({ length: birdCount }, () => ({
    angle: random() * TAU,
    radius: 60 + random() * 110,
    height: 46 + random() * 30,
    speed: (0.05 + random() * 0.05) * (random() > 0.5 ? 1 : -1),
  }));
  scene.add(birds);
  updaters.push((dt) => {
    birdStates.forEach((s, i) => {
      s.angle += s.speed * dt;
      const x = Math.cos(s.angle) * s.radius;
      const z = -30 + Math.sin(s.angle) * s.radius;
      dummy.position.set(x, s.height, z);
      dummy.rotation.set(0, -s.angle + (s.speed > 0 ? 0 : Math.PI), 0);
      dummy.updateMatrix();
      birds.setMatrixAt(i, dummy.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;
  });

  const allMeshes = [mist, spray, pollen, fallingLeaf, birds];

  function update(dt, t) {
    for (const updater of updaters) {
      updater(dt, t);
    }
  }

  function applyQuality(preset) {
    quality.particleDensity = preset.particleDensity;
    mist.count = Math.max(2, Math.round(mistCount * preset.particleDensity));
    spray.count = Math.max(8, Math.round(sprayCount * preset.particleDensity));
    pollen.count = Math.max(20, Math.round(pollenCount * preset.particleDensity));
  }

  return { update, applyQuality, meshes: allMeshes };
}
