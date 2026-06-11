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
  if (!src) return null;
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

  // --- charred fire-pit interior: dark ash disc ---
  const ashGeo = new THREE.CircleGeometry(0.62, 28);
  ashGeo.rotateX(-Math.PI / 2);
  const ash = new THREE.Mesh(
    ashGeo,
    new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.96 })
  );
  ash.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) + 0.015, CAMP.y);
  ash.receiveShadow = true;
  group.add(ash);

  // --- stone ring from the small-rocks scan set ---
  const rockParts = listParts(models, 'sand_rocks_small_01');
  if (rockParts.length) {
    const nRing = 11;
    for (let i = 0; i < nRing; i++) {
      const part = rockParts[i % rockParts.length];
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = mesh.receiveShadow = true;
      const a = (i / nRing) * Math.PI * 2 + rng() * 0.2;
      const r = 0.72 + rng() * 0.08;
      const x = CAMP.x + Math.cos(a) * r;
      const z = CAMP.y + Math.sin(a) * r;
      // bake the part's own transform, then scale to fist-size rocks
      const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const s = (0.28 + rng() * 0.1) / size;
      mesh.scale.setScalar(s);
      mesh.rotation.set(rng() * 0.4 - 0.2, rng() * Math.PI * 2, rng() * 0.4 - 0.2);
      const sunk = box.min.y * s;
      mesh.position.set(x, groundAt(x, z) - sunk - 0.035, z);
      group.add(mesh);
    }
  }

  // --- firewood: split-log pile beside the ring ---
  // bark_debris sticks read as split wood; stack a low pyramid
  const woodParts = listParts(models, 'bark_debris_01');
  if (woodParts.length) {
    const px = CAMP.x + 1.7;
    const pz = CAMP.y + 0.9;
    const baseY = groundAt(px, pz);
    let n = 0;
    for (let layer = 0; layer < 3 && n < 9; layer++) {
      const count = 4 - layer;
      for (let i = 0; i < count; i++, n++) {
        const part = woodParts[n % woodParts.length];
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = mesh.receiveShadow = true;
        const box = new THREE.Box3().setFromObject(new THREE.Mesh(part.geometry));
        const len = box.getSize(new THREE.Vector3()).x || 1;
        const s = (0.55 + rng() * 0.12) / len;
        mesh.scale.setScalar(s);
        mesh.rotation.set(0, 0.45 + rng() * 0.25 - 0.12, 0);
        mesh.position.set(
          px + (i - count / 2) * 0.16 + rng() * 0.03,
          baseY + 0.055 + layer * 0.105,
          pz + layer * 0.02 + rng() * 0.03
        );
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

  // --- crate with lantern ---
  const crate = clonePart(models, 'wooden_crate_01');
  if (crate) {
    const x = CAMP.x - 2.6;
    const z = CAMP.y - 1.9;
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

  // --- root cluster + extra deadwood out in the meadow ---
  const debris2 = clonePart(models, 'bark_debris_01');
  if (debris2) {
    debris2.rotation.y = 4.2;
    debris2.scale.setScalar(1.4);
    debris2.position.set(-12, groundAt(-12, 16) - 0.02, 16);
    group.add(debris2);
  }

  scene.add(group);
  return { group, colliders, campCenter: CAMP };
}
