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

  // --- photoscanned stone fire pit (ring of rocks) ---
  const pit = clonePart(models, 'stone_fire_pit');
  if (pit) {
    const box = new THREE.Box3().setFromObject(pit);
    const w = box.getSize(new THREE.Vector3()).x || 1;
    const s = 1.9 / w; // ~1.9 m outer diameter
    pit.scale.setScalar(s);
    pit.rotation.y = rng() * Math.PI * 2;
    // bed the rim into the soil (scan floor sits below terrain — the ash
    // disc below covers the interior)
    pit.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) - box.min.y * s - 0.1, CAMP.y);
    group.add(pit);
  }

  // --- ash bed inside the ring (irregular edge, sits just above the soil) ---
  {
    const ashGeo = new THREE.CircleGeometry(0.55, 22);
    ashGeo.rotateX(-Math.PI / 2);
    const ap = ashGeo.attributes.position;
    for (let i = 0; i < ap.count; i++) {
      const x = ap.getX(i), z = ap.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.1) {
        const j = 1 + (rng() - 0.5) * 0.22; // ragged edge
        ap.setX(i, x * j);
        ap.setZ(i, z * j);
      }
    }
    ashGeo.computeVertexNormals();
    const ash = new THREE.Mesh(
      ashGeo,
      new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 1.0 })
    );
    ash.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) + 0.03, CAMP.y);
    ash.receiveShadow = true;
    group.add(ash);
  }

  // helper: spawn a log cut from the chunky dead_tree_trunk_02 scan.
  // raw scan: ~4.05m long (x), ~1.05m thick — scale to firewood-size pieces.
  const logParts = listParts(models, 'dead_tree_trunk_02');
  const makeLog = (len, tint = null) => {
    if (!logParts.length) return null;
    const part = logParts[0];
    const mat = tint
      ? Object.assign(part.material.clone(), { color: new THREE.Color(tint), roughness: 1.0 })
      : part.material;
    const mesh = new THREE.Mesh(part.geometry, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
    const s = len / Math.max(box.getSize(new THREE.Vector3()).x, 0.01);
    mesh.scale.setScalar(s);
    mesh.userData.box = box;
    mesh.userData.s = s;
    return mesh;
  };
  const restLog = (mesh, x, z, lift = 0) => {
    const { box, s } = mesh.userData;
    mesh.position.set(x, groundAt(x, z) - box.min.y * s - 0.03 + lift, z);
    group.add(mesh);
  };

  // --- half-burnt logs lying in the ash ---
  const char1 = makeLog(0.85, 0x3d342c);
  if (char1) {
    char1.rotation.set(0.06, 0.5, 0);
    restLog(char1, CAMP.x - 0.05, CAMP.y + 0.08);
  }
  const char2 = makeLog(0.7, 0x463b30);
  if (char2) {
    char2.rotation.set(-0.05, 2.1, 0.1);
    restLog(char2, CAMP.x + 0.14, CAMP.y - 0.12, 0.07);
  }

  // --- firewood: a loose heap of chunky logs beside the pit + bark scraps ---
  {
    const px = CAMP.x + 1.75;
    const pz = CAMP.y + 1.3;
    const heap = [
      { dx: 0.0, dz: 0.0, yaw: 0.4, roll: 0.0, len: 0.8, lift: 0 },
      { dx: 0.1, dz: 0.32, yaw: 0.62, roll: 0.12, len: 0.74, lift: 0 },
      { dx: -0.12, dz: -0.3, yaw: 0.25, roll: -0.08, len: 0.7, lift: 0 },
      { dx: 0.02, dz: 0.16, yaw: 1.35, roll: 0.16, len: 0.72, lift: 0.14 },
      { dx: -0.05, dz: -0.1, yaw: -0.5, roll: -0.14, len: 0.66, lift: 0.2 },
      // stragglers dropped on the way to the pit
      { dx: -1.0, dz: -0.7, yaw: 1.9, roll: 0, len: 0.62, lift: 0 },
      { dx: -1.7, dz: -1.15, yaw: 0.9, roll: 0, len: 0.55, lift: 0 },
    ];
    for (const H of heap) {
      const log = makeLog(H.len);
      if (!log) break;
      log.rotation.set((rng() - 0.5) * 0.08, H.yaw, H.roll);
      restLog(log, px + H.dx, pz + H.dz, H.lift);
    }
    // bark scraps scattered around the heap (chopping leftovers)
    const barkParts = listParts(models, 'bark_debris_01');
    if (barkParts.length) {
      for (let i = 0; i < 5; i++) {
        const part = barkParts[i % barkParts.length];
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = mesh.receiveShadow = true;
        const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
        const s = (0.35 + rng() * 0.2) / Math.max(box.getSize(new THREE.Vector3()).x, 0.01);
        mesh.scale.setScalar(s);
        mesh.rotation.set(0, rng() * Math.PI * 2, 0);
        const a = rng() * Math.PI * 2;
        const rr = 0.7 + rng() * 0.9;
        const x = px + Math.cos(a) * rr;
        const z = pz + Math.sin(a) * rr;
        mesh.position.set(x, groundAt(x, z) - box.min.y * s - 0.02, z);
        group.add(mesh);
      }
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
