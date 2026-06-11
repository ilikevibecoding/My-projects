// Raycast interactions: hover highlight, prompts, fades, status, rest cycle.
import * as THREE from 'three';

export class Interactions {
  constructor(scene, camera, ship) {
    this.camera = camera;
    this.ship = ship;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.0;
    this.center = new THREE.Vector2(0, 0);
    this.hovered = null;
    this.busy = false;
    this.restCycle = false;
    this.cycleT = 1; // 1 = day, 0 = night
    this.cycleTarget = 1;
    this.shipHours = 14 + 32 / 60;
    this.lastMeal = 'NOMINAL';

    this.promptEl = document.getElementById('prompt');
    this.statusEl = document.getElementById('status');
    this.messageEl = document.getElementById('message');
    this.fadeEl = document.getElementById('fade');
    this.reticleEl = document.getElementById('reticle');
    this.statusNote = '';
    this.statusNoteUntil = 0;
    this.time = 0;

    // hover volumes
    this.targets = [];
    for (const it of ship.interactables) {
      const geo = new THREE.BoxGeometry(it.size.x, it.size.y, it.size.z);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb46a, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(it.center);
      mesh.userData.interactable = it;
      scene.add(mesh);
      // glowing edge outline shown on hover
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xffb46a, transparent: true, opacity: 0 })
      );
      edges.position.copy(it.center);
      scene.add(edges);
      mesh.userData.edges = edges;
      this.targets.push(mesh);
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') this.tryInteract();
    });

    this.updateStatus();
  }

  fadeBlack(midFn, message, holdMs = 1300) {
    this.busy = true;
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      if (midFn) midFn();
      if (message) {
        this.messageEl.textContent = message;
        this.messageEl.classList.add('on');
      }
      setTimeout(() => {
        this.fadeEl.classList.remove('on');
        setTimeout(() => {
          this.messageEl.classList.remove('on');
          this.busy = false;
        }, 900);
      }, holdMs);
    }, 750);
  }

  note(text, seconds = 5) {
    this.statusNote = text;
    this.statusNoteUntil = this.time + seconds;
    this.updateStatus();
  }

  tryInteract() {
    if (this.busy || !this.hovered) return;
    const id = this.hovered.userData.interactable.id;
    if (id === 'bed') {
      const toNight = !this.restCycle;
      this.fadeBlack(() => {
        this.restCycle = toNight;
        this.cycleTarget = toNight ? 0 : 1;
        this.shipHours = (this.shipHours + 8) % 24;
        this.note(toNight ? 'REST CYCLE ENGAGED' : 'DAY CYCLE RESTORED', 6);
      }, '8 HOURS PASS');
    } else if (id === 'galley') {
      this.busy = true;
      this.note('YOU EAT. ENERGY RESTORED.', 6);
      this.messageEl.textContent = 'ENERGY RESTORED';
      this.messageEl.classList.add('on');
      setTimeout(() => {
        this.messageEl.classList.remove('on');
        this.busy = false;
      }, 1400);
    } else if (id === 'bathroom') {
      this.fadeBlack(() => {
        this.note('REFRESHED.', 6);
      }, 'REFRESHED', 900);
    }
  }

  updateStatus() {
    const h = Math.floor(this.shipHours);
    const m = Math.floor((this.shipHours - h) * 60);
    const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const cycle = this.restCycle ? 'REST CYCLE' : 'CRUISE';
    const note = this.statusNote && this.time < this.statusNoteUntil ? ` · <b>${this.statusNote}</b>` : '';
    this.statusEl.innerHTML = `MCV-7 DRIFTER · T+${clock} · ${cycle}${note}`;
  }

  update(dt, t) {
    this.time = t;
    this.shipHours = (this.shipHours + dt / 240) % 24; // 1 game-hour per 4 min

    // lighting cycle lerp
    this.cycleT += (this.cycleTarget - this.cycleT) * Math.min(1, dt * 1.8);
    const k = this.cycleT;
    for (const L of this.ship.lights) {
      L.light.intensity = L.night + (L.day - L.night) * k;
    }
    for (const Em of this.ship.emissives) {
      Em.mat.emissiveIntensity = Em.night + (Em.day - Em.night) * k;
    }

    // hover raycast
    this.raycaster.setFromCamera(this.center, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    const hit = hits.length > 0 ? hits[0].object : null;
    if (hit !== this.hovered) {
      if (this.hovered) {
        this.hovered.material.opacity = 0;
        this.hovered.userData.edges.material.opacity = 0;
      }
      this.hovered = hit;
      if (hit) {
        this.promptEl.textContent = hit.userData.interactable.prompt;
        this.promptEl.classList.add('on');
        this.reticleEl.classList.add('hot');
      } else {
        this.promptEl.classList.remove('on');
        this.reticleEl.classList.remove('hot');
      }
    }
    if (this.hovered) {
      const pulse = 0.045 + Math.sin(t * 5) * 0.02;
      this.hovered.material.opacity = pulse;
      this.hovered.userData.edges.material.opacity = 0.55 + Math.sin(t * 5) * 0.2;
    }

    if ((t * 2 | 0) !== ((t - dt) * 2 | 0)) this.updateStatus();
  }
}
