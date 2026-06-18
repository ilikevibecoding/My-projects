// Falling snow particle field that follows the player.
import * as THREE from 'three';

const COUNT = 1800;
const RANGE = 40; // cube half-extent around player
const FALL_SPEED = 6.0;

export class Snow {
  constructor(scene) {
    this.positions = new Float32Array(COUNT * 3);
    this.velocities = new Float32Array(COUNT); // per-particle fall speed
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 2 * RANGE;
      this.positions[i * 3 + 1] = Math.random() * 2 * RANGE;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * RANGE;
      this.velocities[i] = FALL_SPEED * (0.6 + Math.random() * 0.8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  update(dt, center) {
    const p = this.positions;
    for (let i = 0; i < COUNT; i++) {
      const yi = i * 3 + 1;
      p[yi] -= this.velocities[i] * dt;
      // gentle horizontal drift
      p[i * 3] += Math.sin((center.y + p[yi]) * 0.1) * dt * 0.5;
      // recycle relative to player center
      if (p[yi] < center.y - RANGE) {
        p[yi] = center.y + RANGE;
        p[i * 3] = center.x + (Math.random() - 0.5) * 2 * RANGE;
        p[i * 3 + 2] = center.z + (Math.random() - 0.5) * 2 * RANGE;
      }
      // keep particles within horizontal range of player
      if (Math.abs(p[i * 3] - center.x) > RANGE) {
        p[i * 3] = center.x + (Math.random() - 0.5) * 2 * RANGE;
      }
      if (Math.abs(p[i * 3 + 2] - center.z) > RANGE) {
        p[i * 3 + 2] = center.z + (Math.random() - 0.5) * 2 * RANGE;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
