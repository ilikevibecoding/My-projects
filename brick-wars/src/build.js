// build.js — the classic "rattling pile" set piece: hold E near the pile of
// loose bricks and they fly into place, snapping together into a staircase
// that climbs the mesa where the final spirit waits.

import * as THREE from 'three';
import { PALETTE, BRICK, brickGeometry, plastic, hash01 } from './bricks.js';

const HOLD_TIME = 2.9; // seconds of holding E
const PROMPT_RANGE = 7.5;

const STEP_COUNT = 6;
const STEP_DX = 1.6; // advance toward the mesa per step
const STEP_W = 2; // bricks are 2x4, long side across the walkway

export class BuildSite {
  constructor(scene, world, { onSnap, onComplete } = {}) {
    this.scene = scene;
    this.world = world;
    this.onSnap = onSnap ?? (() => {});
    this.onComplete = onComplete ?? (() => {});

    this.state = 'idle'; // idle -> building -> done
    this.progress = 0;
    this.time = 0;

    const mesa = world.mesa;
    // staircase climbs toward the mesa from +X
    this.endX = mesa.x + mesa.r - 0.4;
    this.z = mesa.z + 0.5;
    this.pile = { x: this.endX + STEP_COUNT * STEP_DX + 4.5, z: this.z + 2.5 };

    this.bricks = [];
    this._spawnPile();
  }

  _spawnPile() {
    const geo = brickGeometry(2, 4, 3);
    let n = 0;
    for (let step = 0; step < STEP_COUNT; step++) {
      const topY = (step + 1) * BRICK;
      const x = this.endX + (STEP_COUNT - 1 - step) * STEP_DX;
      for (let layer = 0; layer < step + 1; layer++) {
        // visual shortcut: only mold the top two layers of tall steps
        if (step > 1 && layer < step - 1) continue;
        const color =
          hash01(step * 17 + layer * 7) > 0.6 ? PALETTE.warmTan : PALETTE.sand;
        const mesh = new THREE.Mesh(
          geo,
          plastic(color, { roughness: 0.32 })
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // start: scattered around the pile, lying askew
        const a = hash01(n * 3.1) * Math.PI * 2;
        const r = 1 + hash01(n * 7.7) * 3.2;
        const px = this.pile.x + Math.cos(a) * r;
        const pz = this.pile.z + Math.sin(a) * r;
        const py = this.world.groundHeight(px, pz);
        mesh.position.set(px, py + 0.1, pz);
        mesh.rotation.set(0, hash01(n * 13.3) * Math.PI * 2, 0);

        this.scene.add(mesh);
        this.bricks.push({
          mesh,
          from: mesh.position.clone(),
          fromRot: mesh.rotation.y,
          to: new THREE.Vector3(x, topY - BRICK, this.z),
          order: n,
          placed: false,
          jitterSeed: hash01(n * 29.7) * 10,
        });
        n++;
      }
    }
    this.totalBricks = n;
  }

  /** True if the player is close enough to interact. */
  inRange(playerPos) {
    if (this.state === 'done') return false;
    return (
      Math.hypot(playerPos.x - this.pile.x, playerPos.z - this.pile.z) < PROMPT_RANGE
    );
  }

  update(dt, playerPos, holdingE) {
    this.time += dt;

    if (this.state === 'done') return;

    if (this.state !== 'done' && this.inRange(playerPos) && holdingE) {
      this.state = 'building';
      this.progress = Math.min(1, this.progress + dt / HOLD_TIME);
    } else if (this.state === 'building' && this.progress < 1) {
      // pause (slight decay) when the player lets go
      this.progress = Math.max(0, this.progress - dt * 0.05);
    }

    for (const b of this.bricks) {
      if (b.placed) continue;
      const start = (b.order / this.totalBricks) * 0.75;
      const k = THREE.MathUtils.clamp((this.progress - start) / 0.25, 0, 1);
      if (k <= 0) {
        // rattle in anticipation
        const j = Math.sin(this.time * 21 + b.jitterSeed) * 0.05 * (this.state === 'building' ? 1.6 : 1);
        b.mesh.position.x = b.from.x + j;
        b.mesh.position.z = b.from.z + Math.cos(this.time * 19 + b.jitterSeed * 2) * 0.05;
        continue;
      }
      if (k >= 1) {
        b.mesh.position.copy(b.to);
        b.mesh.rotation.set(0, 0, 0);
        b.placed = true;
        this.onSnap(b);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      b.mesh.position.lerpVectors(b.from, b.to, e);
      b.mesh.position.y += Math.sin(e * Math.PI) * (3 + b.order * 0.05); // arc
      b.mesh.rotation.y = b.fromRot * (1 - e);
      b.mesh.rotation.x = Math.sin(e * Math.PI * 2 + b.jitterSeed) * 0.4 * (1 - e);
    }

    if (this.progress >= 1 && this.state === 'building') {
      this.state = 'done';
      // make the steps walkable
      for (let step = 0; step < STEP_COUNT; step++) {
        const x = this.endX + (STEP_COUNT - 1 - step) * STEP_DX;
        this.world.groundBoxes.push({
          minX: x - STEP_W / 2 - 0.4,
          maxX: x + STEP_W / 2 + 0.4,
          minZ: this.z - 2,
          maxZ: this.z + 2,
          y: (step + 1) * BRICK + 0.21,
        });
      }
      this.onComplete();
    }
  }
}
