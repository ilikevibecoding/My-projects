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

// Place obj so its world-bounds bottom-center lands exactly on (x, y, z) —
// robust against glb scenes whose mesh is offset from the scene root.
function placeOn(obj, x, y, z) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x += x - c.x;
  obj.position.z += z - c.z;
  obj.position.y += y - box.min.y;
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
    pit.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) - box.min.y * s - 0.13, CAMP.y);
    // damp the cool sky reflection on the shadow side of the stones —
    // they read blue-grey/deflated from the south camera otherwise
    pit.traverse((n) => {
      if (n.isMesh && n.material) {
        n.material.roughness = Math.max(n.material.roughness ?? 1, 0.9);
        n.material.envMapIntensity = 1.15;
        // warm the grey scan albedo — under the blue sky fill the shadow
        // sides tone-mapped to cold blue-grey ("deflated rubber" look).
        // (0xe6d4ba over-cooked the sunlit tops into orange sandstone)
        n.material.color = new THREE.Color(0xdbcdb9);
      }
    });
    group.add(pit);
  }

  // --- ash bed inside the ring: a low LUMPY dome, not a flat disc ---
  // (the smooth +0.07 CircleGeometry read as a lens of milky liquid — real
  // ash is a ragged heap, so displace a flattened dome with noise)
  {
    const ashGeo = new THREE.SphereGeometry(0.46, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const ap = ashGeo.attributes.position;
    const ashCol = new Float32Array(ap.count * 3);
    for (let i = 0; i < ap.count; i++) {
      const x = ap.getX(i), y = ap.getY(i), z = ap.getZ(i);
      const rr = Math.hypot(x, z);
      const edge = 1 + (rng() - 0.5) * 0.2; // ragged rim
      ap.setX(i, x * edge);
      ap.setZ(i, z * edge);
      // squash to a 9cm mound and add clumpy relief
      ap.setY(i, y * 0.2 + (rng() - 0.5) * 0.055 * (1 - rr / 0.55));
      // mottled grey↔charcoal vertex tint — a flat-color dome read as wet plaster
      const v = 0.55 + rng() * 0.75;
      ashCol[i * 3] = v;
      ashCol[i * 3 + 1] = v;
      ashCol[i * 3 + 2] = v * (0.92 + rng() * 0.1);
    }
    ashGeo.setAttribute('color', new THREE.BufferAttribute(ashCol, 3));
    ashGeo.computeVertexNormals();
    const ash = new THREE.Mesh(
      ashGeo,
      new THREE.MeshStandardMaterial({
        color: 0x4a4640, // matte grey wood-ash
        roughness: 1.0,
        envMapIntensity: 0.2,
        vertexColors: true,
      })
    );
    // base just above the scan's own (dark muddy) interior floor
    ash.position.set(CAMP.x, groundAt(CAMP.x, CAMP.y) + 0.045, CAMP.y);
    ash.receiveShadow = true;
    ash.castShadow = true;
    group.add(ash);

    // charcoal chunks half-buried in the ash (burnt-down remains)
    const coalGeo = new THREE.IcosahedronGeometry(1, 0);
    const coalMat = new THREE.MeshStandardMaterial({
      color: 0x1f1c19,
      roughness: 0.78, // charcoal has a faint facet shine
      envMapIntensity: 0.5,
    });
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.3;
      const s = 0.025 + rng() * 0.045;
      const coal = new THREE.Mesh(coalGeo, coalMat);
      coal.scale.set(s * (0.7 + rng() * 0.8), s * 0.6, s * (0.7 + rng() * 0.8));
      coal.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      coal.position.set(
        CAMP.x + Math.cos(a) * rr,
        groundAt(CAMP.x, CAMP.y) + 0.1 - rr * 0.12,
        CAMP.y + Math.sin(a) * rr
      );
      coal.castShadow = coal.receiveShadow = true;
      group.add(coal);
    }
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

  // --- half-burnt logs lying low in the ash ---
  const char1 = makeLog(0.7, 0x554a3e);
  if (char1) {
    char1.rotation.set(0.04, 0.5, 0);
    restLog(char1, CAMP.x - 0.05, CAMP.y + 0.08);
  }
  const char2 = makeLog(0.58, 0x5c4f42);
  if (char2) {
    char2.rotation.set(-0.04, 2.1, 0.08);
    restLog(char2, CAMP.x + 0.14, CAMP.y - 0.12, 0.04);
  }

  // --- firewood: a loose heap of chunky logs beside the pit + bark scraps ---
  {
    // east of the pit so the SW campsite camera sees pit AND pile side by side
    const px = CAMP.x + 2.15;
    const pz = CAMP.y + 0.35;
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
    // bark scraps scattered around the heap (chopping leftovers) — tinted
    // down, the raw pale scan read like bleached bones on the litter
    const barkParts = listParts(models, 'bark_debris_01');
    if (barkParts.length) {
      const barkMat = barkParts[0].material.clone();
      barkMat.color = new THREE.Color(0xa08c74);
      barkMat.roughness = 1.0;
      for (let i = 0; i < 4; i++) {
        const part = barkParts[i % barkParts.length];
        const mesh = new THREE.Mesh(part.geometry, barkMat);
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
      hatchet.rotation.set(0.04, 1.2, Math.PI / 2 - 0.12); // lying on its side on the stump
      group.add(hatchet);
      placeOn(hatchet, x + 0.05, sBox.max.y + 0.01, z - 0.05);
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
      const cc = cBox.getCenter(new THREE.Vector3());
      lantern.rotation.y = -0.4;
      group.add(lantern);
      placeOn(lantern, cc.x, cBox.max.y + 0.002, cc.z); // centered on the crate lid
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
