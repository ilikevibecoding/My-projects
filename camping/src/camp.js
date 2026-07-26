// The camp: stone fire ring, wood pile, seat log, tent. All terrain-snapped.
import * as THREE from 'three';
import { mulberry32, SimplexNoise } from './noise.js';
import { getTerrainHeight } from './terrain.js';
import { makeBarkTexture, makeWoodRingsTexture, makeTentCanvasTexture, makeRockTexture } from './textures.js';
import { Fire } from './fire.js';

const jnoise = new SimplexNoise(550);

function jitterGeo(geo, freq, amp, off = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = jnoise.noise3D(x * freq + off, y * freq, z * freq);
    p.setXYZ(i, x + n * amp, y + n * amp * 0.7, z + jnoise.noise3D(z * freq + off + 7, x * freq, y * freq) * amp);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function logMesh(barkTex, ringsTex, len, radius) {
  const group = new THREE.Group();
  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, 9, 1, true),
    new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95, color: 0x9a7e60 }),
  );
  const capMat = new THREE.MeshStandardMaterial({ map: ringsTex, roughness: 0.9, color: 0xb89d7d });
  const capGeo = new THREE.CircleGeometry(radius, 9);
  const cap1 = new THREE.Mesh(capGeo, capMat);
  cap1.position.y = len / 2;
  cap1.rotation.x = -Math.PI / 2;
  const cap2 = new THREE.Mesh(capGeo, capMat);
  cap2.position.y = -len / 2;
  cap2.rotation.x = Math.PI / 2;
  group.add(side, cap1, cap2);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

export function createCamp(scene) {
  const rand = mulberry32(2024);
  const barkTex = makeBarkTexture();
  const ringsTex = makeWoodRingsTexture();
  const rockTex = makeRockTexture(256);
  const tentTex = makeTentCanvasTexture();

  const group = new THREE.Group();
  group.name = 'camp';

  // ---------------- fire pit ----------------
  const fireX = 0, fireZ = 0;
  const fireY = getTerrainHeight(fireX, fireZ);
  const firePos = new THREE.Vector3(fireX, fireY, fireZ);

  const stoneMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.85, color: 0xbab4a8 });
  const ringGroup = new THREE.Group();
  ringGroup.name = 'firepit';
  const N_STONES = 11;
  for (let i = 0; i < N_STONES; i++) {
    const a = (i / N_STONES) * Math.PI * 2 + rand() * 0.25;
    const r = 0.85 + rand() * 0.12;
    const s = 0.16 + rand() * 0.1;
    const geo = jitterGeo(new THREE.IcosahedronGeometry(1, 1), 1.3, 0.25, i * 3.3);
    const stone = new THREE.Mesh(geo, stoneMat);
    stone.scale.set(s * (1 + rand() * 0.4), s * (0.7 + rand() * 0.3), s * (1 + rand() * 0.4));
    const sx = fireX + Math.cos(a) * r;
    const sz = fireZ + Math.sin(a) * r;
    stone.position.set(sx, getTerrainHeight(sx, sz) + s * 0.35, sz);
    stone.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    stone.castShadow = stone.receiveShadow = true;
    ringGroup.add(stone);
  }
  // charred logs in the pit
  const charMat = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.98 });
  for (let i = 0; i < 4; i++) {
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.85, 7), charMat);
    const a = rand() * Math.PI * 2;
    lg.position.set(fireX + (rand() - 0.5) * 0.25, fireY + 0.16 + i * 0.05, fireZ + (rand() - 0.5) * 0.25);
    lg.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.5, a, 0);
    lg.castShadow = lg.receiveShadow = true;
    ringGroup.add(lg);
  }
  // dirt/ash patch under the pit
  const ashGeo = new THREE.CircleGeometry(0.78, 20);
  ashGeo.rotateX(-Math.PI / 2);
  const ash = new THREE.Mesh(ashGeo, new THREE.MeshStandardMaterial({ color: 0x47403a, roughness: 1 }));
  ash.position.set(fireX, fireY + 0.045, fireZ);
  ash.receiveShadow = true;
  ringGroup.add(ash);
  group.add(ringGroup);

  const fire = new Fire(firePos);
  group.add(fire.group);

  // dynamic "added wood" logs get parented here
  const addedWood = new THREE.Group();
  group.add(addedWood);

  // ---------------- wood pile ----------------
  const pileX = -2.6, pileZ = 2.9;
  const pileY = getTerrainHeight(pileX, pileZ);
  const pile = new THREE.Group();
  pile.name = 'woodpile';
  const lay = [
    [0, 0.12, 0, 0.05], [0.26, 0.12, 0.1, 0.4], [-0.27, 0.12, -0.06, -0.3],
    [0.12, 0.34, 0.03, 0.2], [-0.13, 0.34, 0.02, -0.15],
    [0, 0.55, 0, 0.0],
  ];
  for (const [ox, oy, oz, ry] of lay) {
    const lg = logMesh(barkTex, ringsTex, 1.1 + rand() * 0.3, 0.105 + rand() * 0.02);
    lg.position.set(pileX + ox, pileY + oy, pileZ + oz);
    lg.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.06, 0, ry + 0.5);
    pile.add(lg);
  }
  group.add(pile);

  // ---------------- seat log ----------------
  const seatX = 2.4, seatZ = -1.9;
  const seatY = getTerrainHeight(seatX, seatZ);
  const seat = logMesh(barkTex, ringsTex, 2.1, 0.24);
  seat.name = 'seatlog';
  seat.position.set(seatX, seatY + 0.2, seatZ);
  seat.rotation.set(Math.PI / 2, 0, Math.PI / 4 + 0.35);
  group.add(seat);

  // ---------------- tent ----------------
  const tentX = -4.6, tentZ = -3.2;
  const tentY = getTerrainHeight(tentX, tentZ);
  const tent = new THREE.Group();
  tent.name = 'tent';

  const W = 3.0, H = 1.95, D = 3.2; // width, height, depth
  // A-frame canvas: two sloped quads with slight sag
  const tentMat = new THREE.MeshStandardMaterial({
    map: tentTex, roughness: 0.82, color: 0xffffff, side: THREE.DoubleSide,
  });
  function slopedPanel(sign) {
    const g = new THREE.PlaneGeometry(D, Math.hypot(W / 2, H), 12, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) / D) + 0.5;       // along depth
      const v = (p.getY(i) / Math.hypot(W / 2, H)) + 0.5; // 0 ground, 1 ridge
      const x = sign * (1 - v) * (W / 2);
      const y = v * H;
      const z = (u - 0.5) * D;
      // canvas sag between ridge and ground
      const sag = Math.sin(v * Math.PI) * 0.09 * (1 + jnoise.noise2D(u * 3, v * 3 + sign) * 0.5);
      p.setXYZ(i, x + sign * sag * 0.4, y - sag * 0.35, z);
    }
    g.computeVertexNormals();
    return new THREE.Mesh(g, tentMat);
  }
  tent.add(slopedPanel(1), slopedPanel(-1));

  // back wall triangle
  const backShape = new THREE.Shape();
  backShape.moveTo(-W / 2, 0);
  backShape.lineTo(W / 2, 0);
  backShape.lineTo(0, H);
  backShape.closePath();
  const back = new THREE.Mesh(new THREE.ShapeGeometry(backShape), tentMat);
  back.position.z = -D / 2;
  tent.add(back);

  // front: dark interior with flaps partially open
  const interior = new THREE.Mesh(
    new THREE.ShapeGeometry(backShape),
    new THREE.MeshBasicMaterial({ color: 0x070503, side: THREE.DoubleSide }),
  );
  interior.position.z = 0; // deep inside: reads as a dark entrance
  tent.add(interior);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-W / 2, 0);
  flapShape.lineTo(-W / 2 + 0.55, 0);
  flapShape.lineTo(0, H);
  flapShape.closePath();
  const flapL = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), tentMat);
  flapL.position.z = D / 2;
  const flapR = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), tentMat);
  flapR.scale.x = -1;
  flapR.position.z = D / 2;
  tent.add(flapL, flapR);

  // ridge pole + pegs
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b5840, roughness: 0.9 });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, D + 0.3, 6), poleMat);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = H;
  tent.add(ridge);
  for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, H, 6), poleMat);
    pole.position.set(0, H / 2, sz * (D / 2));
    tent.add(pole);
  }

  tent.position.set(tentX, tentY, tentZ);
  tent.rotation.y = Math.PI / 3.1; // face the fire
  tent.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(tent);

  scene.add(group);

  // ---------------- "add wood" animation ----------------
  const flyingLogs = [];
  /**
   * Throw a log onto the fire. `onLand` runs when the log actually arrives,
   * driven by the simulation clock — so the fire flares exactly as the log
   * hits, at any frame rate. (This used to be a wall-clock setTimeout, which
   * drifted out of sync with the animation and could not be stepped
   * deterministically.)
   */
  function tossLog(onLand = null) {
    const lg = logMesh(barkTex, ringsTex, 0.7, 0.07);
    const from = new THREE.Vector3(pileX, pileY + 0.7, pileZ);
    addedWood.add(lg);
    lg.position.copy(from);
    flyingLogs.push({
      mesh: lg, t: 0, onLand,
      from,
      to: new THREE.Vector3(fireX + (rand() - 0.5) * 0.3, fireY + 0.28, fireZ + (rand() - 0.5) * 0.3),
      spin: new THREE.Vector3(rand() * 6, rand() * 2, rand() * 6),
    });
  }

  function update(dt, time) {
    fire.update(dt, time);
    for (let i = flyingLogs.length - 1; i >= 0; i--) {
      const f = flyingLogs[i];
      f.t = Math.min(1, f.t + dt * 1.6);
      const t = f.t;
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.1;
      f.mesh.rotation.set(f.spin.x * t + Math.PI / 2, f.spin.y * t, f.spin.z * t);
      if (t >= 1) {
        f.mesh.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.6, rand() * Math.PI, 0);
        flyingLogs.splice(i, 1);
        if (addedWood.children.length > 5) addedWood.remove(addedWood.children[0]);
        f.onLand?.();
      }
    }
  }

  function clearAddedWood() {
    flyingLogs.length = 0;
    while (addedWood.children.length) addedWood.remove(addedWood.children[0]);
  }

  return {
    group, fire, update, tossLog, clearAddedWood,
    interactables: {
      firepit: ringGroup,
      woodpile: pile,
      seatlog: seat,
      tent,
    },
    positions: {
      fire: firePos,
      seat: new THREE.Vector3(seatX, seatY + 0.55, seatZ),
      tent: new THREE.Vector3(tentX, tentY, tentZ),
      pile: new THREE.Vector3(pileX, pileY, pileZ),
    },
  };
}
