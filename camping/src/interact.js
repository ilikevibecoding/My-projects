// Center-screen raycast interactions: light fire, add wood, sit, sleep.
import * as THREE from 'three';

const RANGE = 3.6;

export class Interactions {
  constructor({ camera, camp, player, timeOfDay, hud }) {
    this.camera = camera;
    this.camp = camp;
    this.player = player;
    this.tod = timeOfDay;
    this.hud = hud;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = RANGE;
    this.hovered = null;
    this.seated = false;
    this.busy = false;
    this._standPose = null;
    this._pulse = 0;

    this.targets = [
      { key: 'firepit', object: camp.interactables.firepit, prompt: () => (camp.fire.lit ? 'Extinguish fire' : 'Light fire') },
      { key: 'woodpile', object: camp.interactables.woodpile, prompt: () => 'Add wood' },
      { key: 'seatlog', object: camp.interactables.seatlog, prompt: () => (this.seated ? 'Stand' : 'Sit') },
      { key: 'tent', object: camp.interactables.tent, prompt: () => 'Sleep' },
    ];
    // collect emissive-capable materials per target for highlight pulse
    for (const t of this.targets) {
      t.materials = [];
      t.object.traverse((o) => {
        if (o.isMesh && o.material && 'emissive' in o.material) {
          if (!t.materials.includes(o.material)) t.materials.push(o.material);
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') this.trigger();
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement && e.button === 0) this.trigger();
    });
  }

  update(dt, time) {
    this._pulse = (Math.sin(time * 5) * 0.5 + 0.5) * 0.22;

    // raycast from screen center
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    let best = null;
    if (this.seated) {
      // while seated only the seat log is interactable (to stand)
      const seat = this.targets[2];
      const hits = this.raycaster.intersectObject(seat.object, true);
      best = hits.length ? seat : seat; // always allow standing
    } else if (!this.busy) {
      let bestDist = Infinity;
      for (const t of this.targets) {
        const hits = this.raycaster.intersectObject(t.object, true);
        if (hits.length && hits[0].distance < bestDist) {
          bestDist = hits[0].distance;
          best = t;
        }
      }
    }

    if (this.hovered !== best) {
      if (this.hovered) this.setEmissive(this.hovered, 0);
      this.hovered = best;
    }
    if (this.hovered) {
      this.setEmissive(this.hovered, this._pulse);
      this.hud.setPrompt(`[E] ${this.hovered.prompt()}`);
    } else {
      this.hud.setPrompt('');
    }
  }

  setEmissive(target, amount) {
    for (const m of target.materials) {
      m.emissive ??= new THREE.Color();
      m.emissive.setRGB(amount, amount * 0.85, amount * 0.45);
    }
  }

  trigger() {
    if (this.busy) return;
    if (this.seated) { this.standUp(); return; }
    if (!this.hovered) return;
    switch (this.hovered.key) {
      case 'firepit': {
        const on = !this.camp.fire.lit;
        this.camp.fire.setLit(on);
        this.hud.setStatus(on ? 'The fire crackles to life.' : 'You smother the flames.');
        break;
      }
      case 'woodpile': {
        if (!this.camp.fire.lit) {
          this.hud.setStatus('No point — the fire is not lit.');
          break;
        }
        this.camp.tossLog();
        setTimeout(() => this.camp.fire.addWood(), 600);
        this.hud.setStatus('You toss a log onto the fire.');
        break;
      }
      case 'seatlog': this.sitDown(); break;
      case 'tent': this.sleep(); break;
    }
  }

  sitDown() {
    this.busy = true;
    const p = this.player;
    this._standPose = { pos: p.position.clone(), yaw: p.yaw, pitch: p.pitch };
    const seatPos = this.camp.positions.seat.clone();
    const firePos = this.camp.positions.fire;
    seatPos.y += 0.62; // seated eye height above log top
    const yaw = Math.atan2(-(firePos.x - seatPos.x), -(firePos.z - seatPos.z));
    this.hud.fade(0.4, () => {
      p.enabled = false;
      p.setPose(seatPos, yaw, -0.12);
      this.seated = true;
      this.busy = false;
      this.hud.setStatus('You sit by the fire. (E to stand)');
    });
  }

  standUp() {
    this.busy = true;
    this.hud.fade(0.4, () => {
      const sp = this._standPose;
      this.player.setPose(sp.pos, sp.yaw, sp.pitch);
      this.player.enabled = true;
      this.seated = false;
      this.busy = false;
      this.hud.setStatus('You stand up.');
    });
  }

  sleep() {
    this.busy = true;
    this.hud.fade(1.1, () => {
      const next = this.tod.next();
      const label = { day: 'a bright morning', golden: 'golden evening light', night: 'a deep, starry night' }[next];
      this.hud.setStatus(`You wake to ${label}.`);
      this.busy = false;
    });
  }
}
