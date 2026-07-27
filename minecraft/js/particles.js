import * as THREE from 'three';

const MAX_PARTICLES = 768;

export class Particles {
  constructor(scene) {
    this.list = [];
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setDrawRange(0, 0);
    this.geometry = geometry;

    const material = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, rgb, count = 16) {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= MAX_PARTICLES) break;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      this.list.push({
        x: x + (Math.random() - 0.5) * 0.7,
        y: y + (Math.random() - 0.5) * 0.7,
        z: z + (Math.random() - 0.5) * 0.7,
        vx: Math.cos(a) * r,
        vy: 1.6 + Math.random() * 2.6,
        vz: Math.sin(a) * r,
        life: 0.35 + Math.random() * 0.4,
        r: (rgb[0] / 255) * (0.75 + Math.random() * 0.35),
        g: (rgb[1] / 255) * (0.75 + Math.random() * 0.35),
        b: (rgb[2] / 255) * (0.75 + Math.random() * 0.35),
      });
    }
  }

  update(dt) {
    const list = this.list;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const pt = list[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      pt.vy -= 16 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
    }
    for (const pt of list) {
      this.positions[n * 3] = pt.x;
      this.positions[n * 3 + 1] = pt.y;
      this.positions[n * 3 + 2] = pt.z;
      this.colors[n * 3] = pt.r;
      this.colors[n * 3 + 1] = pt.g;
      this.colors[n * 3 + 2] = pt.b;
      n++;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  }
}
