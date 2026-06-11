import * as THREE from 'three';
import { makeRng } from './noise.js';
import { prepareModel } from './vegetation.js';

/**
 * The campsite: stone fire ring with charred interior, split-firewood pile,
 * scattered branches, a fallen-log seat, chopping stump with hatchet,
 * crate + lantern, and a few mossy boulders for composition.
 *
 * Everything is terrain-conformed and seeded/deterministic.
 */

function clonePart(models, id) {
  const src = models[id];
  if (!src) {
    console.warn(`[campsite] model "${id}" missing — prop skipped`);
    return null;
  }
  const obj = src.scene.clone(true);
  prepareModel(obj);
  return obj;
}

// extract individual top-level meshes (for sets like sand_rocks_small_01 / bark_debris)
function listParts(models, id) {
  const src = models[id];
  if (!src) return [];
  src.scene.updateMatrixWorld(true);
  const parts = [];
  src.scene.traverse((n) => {
    if (n.isMesh) parts.push(n);
  });
  return parts;
}

export function buildCampsite(scene, models, getHeight) {
  const rng = makeRng(777);
  const group = new THREE.Group();
  group.name = 'campsite';
  const colliders = [];

  const CAMP = new THREE.Vector2(1.5, 1.0); // fire ring center
  const groundAt = (x, z) => getHeight(x, z);

  // --- photoscanned stone fire pit (ring of rocks + ash interior) ---
  const pit = clonePart(models, 'stone_fire_pit');
  if (pit) {
    const box = new THREE.Box3().setFromObject(pit);
    const w = box.getSize(new THREE.Vector3()).x || 1;
    const s = 1.9 / w; // ~1.9 m outer diameter
    pit.scale.setScalar(s);
    pit.rotation.y = rng() * Math.PI * 2;
    // sink the rim slightly so every stone beds into the soil
    pit.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) - box.min.y * s - 0.16, CAMP.y);
    group.add(pit);
  }

  // --- half-burnt logs lying in the pit ---
  const charParts = listParts(models, 'bark_debris_01');
  if (charParts.length) {
    const charMat = (m) => {
      const c = m.clone();
      c.color = new THREE.Color(0x4a4038); // charred tint over the albedo
      c.roughness = 1.0;
      return c;
    };
    const logs = [
      { i: 1, a: 0.4, len: 0.55, dx: -0.1, dz: 0.05, tilt: 0.18 },
      { i: 2, a: 1.9, len: 0.5, dx: 0.12, dz: -0.08, tilt: -0.12 },
    ];
    for (const L of logs) {
      const part = charParts[L.i % charParts.length];
      const mesh = new THREE.Mesh(part.geometry, charMat(part.material));
      mesh.castShadow = mesh.receiveShadow = true;
      const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
      const len = Math.max(box.getSize(new THREE.Vector3()).x, 0.01);
      const s = L.len / len;
      mesh.scale.setScalar(s);
      mesh.rotation.set(L.tilt, L.a, 0);
      const x = CAMP.x + L.dx;
      const z = CAMP.y + L.dz;
      mesh.position.set(x, groundAt(CAMP.x, CAMP.y) - box.min.y * s - 0.02, z);
      group.add(mesh);
    }
  }

  // --- firewood: split wood gathered beside the pit, ready to burn ---
  // bark_debris pieces read as split logs w/ exposed inner wood; lay them in a
  // loose heap (two leaning on a base row) rather than an unnaturally neat stack
  const woodParts = listParts(models, 'bark_debris_01');
  if (woodParts.length) {
    const px = CAMP.x + 1.7;
    const pz = CAMP.y + 1.25;
    const heap = [
      // base row, mostly parallel, bark up
      { i: 1, dx: 0.0, dz: 0.0, yaw: 0.35, roll: 0.0, len: 0.62, lift: 0 },
      { i: 2, dx: 0.18, dz: 0.16, yaw: 0.5, roll: 0.15, len: 0.58, lift: 0 },
      { i: 1, dx: -0.15, dz: 0.22, yaw: 0.18, roll: -0.1, len: 0.55, lift: 0 },
      { i: 2, dx: 0.05, dz: -0.2, yaw: 0.65, roll: 0.0, len: 0.6, lift: 0 },
      // two pieces thrown on top at an angle
      { i: 1, dx: 0.02, dz: 0.08, yaw: 1.25, roll: 0.22, len: 0.58, lift: 0.09 },
      { i: 2, dx: -0.08, dz: -0.04, yaw: -0.4, roll: -0.18, len: 0.52, lift: 0.13 },
      // stragglers dropped on the way to the pit
      { i: 1, dx: -0.85, dz: -0.55, yaw: 1.9, roll: 0.0, len: 0.5, lift: 0 },
      { i: 2, dx: -1.5, dz: -0.95, yaw: 0.9, roll: 0.0, len: 0.45, lift: 0 },
    ];
    for (const H of heap) {
      const part = woodParts[H.i % woodParts.length];
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = mesh.receiveShadow = true;
      const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
      const len = Math.max(box.getSize(new THREE.Vector3()).x, 0.01);
      const s = H.len / len;
      mesh.scale.setScalar(s);
      mesh.rotation.set((rng() - 0.5) * 0.06, H.yaw, H.roll);
      const x = px + H.dx;
      const z = pz + H.dz;
      mesh.position.set(x, groundAt(x, z) - box.min.y * s - 0.015 + H.lift, z);
      group.add(mesh);
    }
  }

  // --- a few branches scattered around camp (dry kindling) ---
  const branches = clonePart(models, 'dry_branches_medium_01');
  if (branches) {
    branches.scale.setScalar(0.9);
    branches.rotation.y = 2.1;
    branches.position.set(CAMP.x - 2.4, groundAt(CAMP.x - 2.4, CAMP.y + 2.1) - 0.02, CAMP.y + 2.1);
    group.add(branches);
  }

  // --- fallen-log seat by the fire ---
  const seat = clonePart(models, 'dead_tree_trunk');
  if (seat) {
    const x = CAMP.x - 0.4;
    const z = CAMP.y + 2.3;
    seat.rotation.y = -0.35;
    seat.position.set(x, groundAt(x, z) + 0.02, z);
    group.add(seat);
    colliders.push({ x, z, radius: 0.45 });
  }

  // --- second weathered trunk angled at the clearing edge ---
  const trunk2 = clonePart(models, 'dead_tree_trunk_02');
  if (trunk2) {
    const x = CAMP.x + 6.5;
    const z = CAMP.y - 4.5;
    trunk2.rotation.y = 1.9;
    trunk2.position.set(x, groundAt(x, z) + 0.02, z);
    group.add(trunk2);
    colliders.push({ x, z, radius: 0.4 });
  }

  // --- chopping stump + hatchet ---
  const stump = clonePart(models, 'tree_stump_01');
  if (stump) {
    const x = CAMP.x + 2.9;
    const z = CAMP.y - 1.6;
    stump.position.set(x, groundAt(x, z) - 0.03, z);
    stump.rotation.y = rng() * Math.PI;
    group.add(stump);
    colliders.push({ x, z, radius: 0.4 });

    const hatchet = clonePart(models, 'hatchet');
    if (hatchet) {
      const sBox = new THREE.Box3().setFromObject(stump);
      hatchet.position.set(x + 0.05, sBox.max.y + 0.015, z - 0.05);
      hatchet.rotation.set(0.04, 1.2, Math.PI / 2 - 0.12); // lying on its side on the stump
      group.add(hatchet);
    }
  }

  // --- crate with lantern (NW of the pit so the SW camera keeps the pit hero) ---
  const crate = clonePart(models, 'wooden_crate_01');
  if (crate) {
    const x = CAMP.x - 2.9;
    const z = CAMP.y + 1.6;
    crate.rotation.y = 0.5;
    crate.position.set(x, groundAt(x, z) - 0.01, z);
    group.add(crate);
    colliders.push({ x, z, radius: 0.42 });

    const lantern = clonePart(models, 'wooden_lantern_01');
    if (lantern) {
      const cBox = new THREE.Box3().setFromObject(crate);
      lantern.position.set(x - 0.05, cBox.max.y + 0.005, z + 0.08);
      lantern.rotation.y = -0.4;
      group.add(lantern);
    }
  }

  // --- composition boulders ---
  const boulderSpecs = [
    { id: 'boulder_01', x: -6, z: 8.5, s: 0.85, sink: 0.25 },
    { id: 'rock_moss_set_01', x: 8.5, z: 6.5, s: 1.0, sink: 0.12 },
    { id: 'namaqualand_boulder_02', x: -4.5, z: -7.5, s: 0.8, sink: 0.2 },
    { id: 'rock_07', x: 5.0, z: 9.5, s: 1.1, sink: 0.1 },
  ];
  for (const b of boulderSpecs) {
    const rock = clonePart(models, b.id);
    if (!rock) continue;
    rock.scale.setScalar(b.s);
    rock.rotation.y = rng() * Math.PI * 2;
    rock.position.set(b.x, groundAt(b.x, b.z) - b.sink, b.z);
    group.add(rock);
    colliders.push({ x: b.x, z: b.z, radius: 0.9 * b.s });
  }

  // --- extra deadwood out in the meadow (life-size, half-hidden by grass) ---
  const debris2 = clonePart(models, 'bark_debris_01');
  if (debris2) {
    debris2.rotation.y = 4.2;
    debris2.scale.setScalar(0.8);
    debris2.position.set(-12, groundAt(-12, 16) - 0.04, 16);
    group.add(debris2);
  }

  scene.add(group);
  return { group, colliders, campCenter: CAMP };
}
