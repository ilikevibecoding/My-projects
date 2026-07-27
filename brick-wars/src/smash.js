// smash.js — smashable brick crates that burst into tumbling bricks and
// spill golden studs which magnet to the player.

import * as THREE from 'three';
import {
  PALETTE,
  BRICK,
  brickGeometry,
  lootStudGeometry,
  mergeColoredBricks,
  goldMetal,
  hash01,
} from './bricks.js';

const SWING_RANGE = 4.4;
const SWING_ARC = Math.PI * 0.85;
const MAGNET_RANGE = 5.5;
const COLLECT_RANGE = 1.3;

export class SmashManager {
  constructor(scene, world, { onStud, onSmash } = {}) {
    this.scene = scene;
    this.world = world;
    this.onStud = onStud ?? (() => {});
    this.onSmash = onSmash ?? (() => {});
    this.crates = [];
    this.debris = [];
    this.studs = [];
    this.smashed = 0;
    this.studsCollected = 0;

    for (const spot of world.crateSpots) this._spawnCrate(spot);
  }

  _spawnCrate(spot) {
    const y0 = this.world.groundHeight(spot.x, spot.z);
    const colorMain = hash01(spot.x * 3 + spot.z) > 0.5 ? PALETTE.brown : PALETTE.darkSand;
    const colorTrim = hash01(spot.x - spot.z * 2) > 0.5 ? PALETTE.orange : PALETTE.darkBrown;
    const items = [];
    const g2x4 = brickGeometry(2, 4, 3);
    const g2x2 = brickGeometry(2, 2, 3);
    // 4x4 crate, 3 courses, alternating bond
    for (let course = 0; course < 3; course++) {
      const y = course * BRICK;
      const color = course === 1 ? colorTrim : colorMain;
      if (course % 2 === 0) {
        items.push({ geo: g2x4, x: -1, y, z: 0, rotY: 0, color });
        items.push({ geo: g2x4, x: 1, y, z: 0, rotY: 0, color });
      } else {
        items.push({ geo: g2x4, x: 0, y, z: -1, rotY: Math.PI / 2, color });
        items.push({ geo: g2x4, x: 0, y, z: 1, rotY: Math.PI / 2, color });
      }
    }
    items.push({ geo: g2x2, x: 0, y: 3 * BRICK, z: 0, rotY: 0, color: colorTrim });

    const mesh = mergeColoredBricks(items);
    mesh.position.set(spot.x, y0, spot.z);
    this.scene.add(mesh);

    const crate = {
      mesh,
      x: spot.x,
      z: spot.z,
      y: y0,
      r: 2.6,
      alive: true,
      collider: { x: spot.x, z: spot.z, r: 2.2, topY: y0 + 3 * BRICK + 0.21 },
      colors: [colorMain, colorTrim],
    };
    this.world.colliders.push(crate.collider);
    this.crates.push(crate);
  }

  /** Called when the player swings. Returns true if something broke. */
  trySmash(playerPos, headingAngle) {
    let hit = false;
    for (const crate of this.crates) {
      if (!crate.alive) continue;
      const dx = crate.x - playerPos.x;
      const dz = crate.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SWING_RANGE + crate.r * 0.4) continue;
      const angTo = Math.atan2(dx, dz);
      let dAng = angTo - headingAngle;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      if (Math.abs(dAng) > SWING_ARC / 2 && dist > 2.4) continue;
      this._smash(crate);
      hit = true;
    }
    return hit;
  }

  _smash(crate) {
    crate.alive = false;
    this.smashed++;
    this.scene.remove(crate.mesh);
    crate.mesh.geometry.dispose();
    const ci = this.world.colliders.indexOf(crate.collider);
    if (ci >= 0) this.world.colliders.splice(ci, 1);

    // tumbling debris bricks
    const debrisGeos = [brickGeometry(2, 4, 3), brickGeometry(2, 2, 3), brickGeometry(1, 2, 3)];
    const n = 10 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const geo = debrisGeos[i % debrisGeos.length];
      const mat = new THREE.MeshPhysicalMaterial({
        color: crate.colors[i % 2],
        roughness: 0.34,
        clearcoat: 0.55,
        clearcoatRoughness: 0.28,
        envMapIntensity: 0.7,
        transparent: true,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.set(
        crate.x + (Math.random() - 0.5) * 2,
        crate.y + 0.8 + Math.random() * 2.6,
        crate.z + (Math.random() - 0.5) * 2
      );
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.scene.add(m);
      this.debris.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 6, Math.sin(a) * sp),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9
        ),
        life: 0,
        groundY: crate.y,
      });
    }

    // loot studs
    const studGeo = lootStudGeometry();
    const studMat = goldMetal();
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(studGeo, studMat);
      m.castShadow = true;
      m.position.set(crate.x, crate.y + 1.6, crate.z);
      const a = (i / count) * Math.PI * 2 + Math.random();
      const sp = 2.5 + Math.random() * 3.5;
      this.scene.add(m);
      this.studs.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(a) * sp, 7 + Math.random() * 3, Math.sin(a) * sp),
        state: 'pop', // pop -> idle -> magnet
        t: 0,
        groundY: this.world.groundHeight(crate.x, crate.z),
      });
    }

    this.onSmash(this.smashed, crate);
  }

  update(dt, playerPos) {
    // debris physics
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      d.vel.y -= 30 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;
      const gy = d.groundY + 0.35;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy;
        d.vel.y = Math.abs(d.vel.y) * 0.42;
        d.vel.x *= 0.72;
        d.vel.z *= 0.72;
        d.rotVel.multiplyScalar(0.6);
      }
      if (d.life > 2.6) {
        d.mesh.material.opacity = Math.max(0, 1 - (d.life - 2.6) / 0.7);
        if (d.life > 3.3) {
          this.scene.remove(d.mesh);
          d.mesh.material.dispose();
          this.debris.splice(i, 1);
        }
      }
    }

    // studs
    for (let i = this.studs.length - 1; i >= 0; i--) {
      const s = this.studs[i];
      s.t += dt;
      const p = s.mesh.position;
      if (s.state === 'pop') {
        s.vel.y -= 26 * dt;
        p.addScaledVector(s.vel, dt);
        if (p.y < s.groundY + 0.15 && s.vel.y < 0) {
          if (Math.abs(s.vel.y) > 2.5) {
            s.vel.y = Math.abs(s.vel.y) * 0.5;
            s.vel.x *= 0.6;
            s.vel.z *= 0.6;
          } else {
            s.state = 'idle';
            p.y = s.groundY + 0.15;
          }
        }
      } else {
        s.mesh.rotation.y += dt * 3;
        const dx = playerPos.x - p.x;
        const dy = playerPos.y + 2 - p.y;
        const dz = playerPos.z - p.z;
        const dist = Math.hypot(dx, dy, dz);
        if (s.state === 'idle') {
          p.y = s.groundY + 0.15 + Math.abs(Math.sin(s.t * 3)) * 0.25;
          if (dist < MAGNET_RANGE) s.state = 'magnet';
        } else if (s.state === 'magnet') {
          const pull = 26 * dt;
          p.x += (dx / dist) * pull;
          p.y += (dy / dist) * pull;
          p.z += (dz / dist) * pull;
        }
        if (dist < COLLECT_RANGE) {
          this.scene.remove(s.mesh);
          this.studs.splice(i, 1);
          this.studsCollected++;
          this.onStud(this.studsCollected);
        }
      }
    }
  }
}
