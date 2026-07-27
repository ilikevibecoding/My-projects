// spirits.js — collectible glowing ghost-minifig spirits, their shimmer
// particles, the collection burst and the follower wisp trail.

import * as THREE from 'three';
import { createMinifig } from './minifig.js';

const COLLECT_RADIUS = 2.1;

export class SpiritManager {
  constructor(scene, world, { onCollect } = {}) {
    this.scene = scene;
    this.world = world;
    this.onCollect = onCollect ?? (() => {});
    this.spirits = [];
    this.followers = [];
    this.bursts = [];
    this.collected = 0;

    const spots = world.spiritSpots;
    for (let i = 0; i < spots.length; i++) this._spawn(spots[i], i);
    this.total = this.spirits.length;
  }

  _spawn(spot, index) {
    const fig = createMinifig({ ghost: true });
    fig.group.scale.setScalar(0.92);
    const baseY = spot.y ?? this.world.groundHeight(spot.x, spot.z);
    fig.group.position.set(spot.x, baseY, spot.z);

    // halo sprite
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture(),
        color: 0x6fe5ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.setScalar(5.2);
    halo.position.y = 2.6;
    fig.group.add(halo);

    // shimmer particles orbiting the spirit
    const pCount = 26;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pCount * 3), 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xaef4ff,
        size: 0.22,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    fig.group.add(particles);

    this.scene.add(fig.group);
    this.spirits.push({
      fig,
      halo,
      particles,
      baseY,
      spot,
      index,
      t: Math.random() * 20,
      collected: false,
    });
  }

  update(dt, playerPos, time) {
    // idle spirits
    for (const s of this.spirits) {
      if (s.collected) continue;
      s.t += dt;
      const g = s.fig.group;
      g.position.y = s.baseY + 0.55 + Math.sin(s.t * 1.7) * 0.3;
      g.rotation.y += dt * 0.45;
      s.fig.animate(dt, { speed: 0, grounded: false });
      s.halo.material.opacity = 0.38 + Math.sin(s.t * 2.3) * 0.14;

      const pos = s.particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const a = s.t * 0.8 + (i / pos.count) * Math.PI * 2;
        const r = 1.5 + Math.sin(s.t * 1.3 + i * 1.7) * 0.4;
        pos.setXYZ(
          i,
          Math.cos(a + i) * r,
          1.4 + Math.sin(s.t * 2.1 + i * 2.3) * 1.5,
          Math.sin(a + i) * r
        );
      }
      pos.needsUpdate = true;

      // collection check
      const dx = g.position.x - playerPos.x;
      const dz = g.position.z - playerPos.z;
      const dy = g.position.y - playerPos.y;
      if (dx * dx + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS && dy > -2 && dy < 5.4) {
        this.collect(s);
      }
    }

    // follower wisps trail behind the player
    for (let i = 0; i < this.followers.length; i++) {
      const f = this.followers[i];
      const angle = time * 0.9 + (i / this.followers.length) * Math.PI * 2;
      const r = 2.3 + (i % 3) * 0.55;
      _t.set(
        playerPos.x + Math.cos(angle) * r,
        playerPos.y + 3.4 + Math.sin(time * 1.6 + i * 1.3) * 0.7,
        playerPos.z + Math.sin(angle) * r
      );
      const k = 1 - Math.exp(-dt * (3.2 + i * 0.25));
      f.mesh.position.lerp(_t, k);
      f.mesh.material.opacity = 0.5 + Math.sin(time * 2.2 + i) * 0.18;
    }

    // bursts
    for (let bi = this.bursts.length - 1; bi >= 0; bi--) {
      const b = this.bursts[bi];
      b.life += dt;
      const k = b.life / 0.9;
      if (k >= 1) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.bursts.splice(bi, 1);
        continue;
      }
      const pos = b.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
          i,
          pos.getX(i) + b.vels[i * 3] * dt,
          pos.getY(i) + (b.vels[i * 3 + 1] - 9 * b.life) * dt,
          pos.getZ(i) + b.vels[i * 3 + 2] * dt
        );
      }
      pos.needsUpdate = true;
      b.points.material.opacity = 1 - k;
    }
  }

  collect(s) {
    if (s.collected) return;
    s.collected = true;
    this.collected++;

    const at = s.fig.group.position.clone();
    this.scene.remove(s.fig.group);
    this._burst(at);

    // follower wisp
    const wisp = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x9af0ff).multiplyScalar(1.9),
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    wisp.position.copy(at);
    this.scene.add(wisp);
    this.followers.push({ mesh: wisp });

    this.onCollect(this.collected, this.total, s);
  }

  /** debug/test helper */
  collectIndex(i) {
    const s = this.spirits[i];
    if (s) this.collect(s);
  }

  _burst(at) {
    const n = 60;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    const vels = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = at.x;
      arr[i * 3 + 1] = at.y + 2.2;
      arr[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.35) * Math.PI;
      const sp = 4 + Math.random() * 7;
      vels[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      vels[i * 3 + 1] = Math.sin(b) * sp + 3;
      vels[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbef6ff,
        size: 0.32,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(points);
    this.bursts.push({ points, vels, life: 0 });
  }
}

const _t = new THREE.Vector3();

let _haloTex = null;
function haloTexture() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(160,235,255,0.45)');
  grad.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  _haloTex = new THREE.CanvasTexture(c);
  return _haloTex;
}
