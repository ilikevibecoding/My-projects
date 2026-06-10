// Player stations + camera movement + flashlight + door/closet holding.
import * as THREE from 'three';
import { ROOM } from './world.js';

const STATIONS = {
  center: {
    pos: new THREE.Vector3(0, 1.55, 1.05),
    look: new THREE.Vector3(0, 1.3, -3),
  },
  doorL: {
    pos: new THREE.Vector3(-(ROOM.W / 2 - 0.95), 1.5, ROOM.DOOR_Z + 0.05),
    look: new THREE.Vector3(-12, 1.1, ROOM.DOOR_Z),
  },
  doorR: {
    pos: new THREE.Vector3((ROOM.W / 2 - 0.95), 1.5, ROOM.DOOR_Z + 0.05),
    look: new THREE.Vector3(12, 1.1, ROOM.DOOR_Z),
  },
  closet: {
    pos: new THREE.Vector3(0, 1.5, -1.55),
    look: new THREE.Vector3(0, 1.25, -3.6),
  },
  bed: {
    pos: new THREE.Vector3(0, 1.55, 0.95),
    look: new THREE.Vector3(0.6, 0.8, 2.4),
  },
};

// which stations you can reach from where
const MOVES = {
  center: { left: 'doorL', right: 'doorR', up: 'closet', down: 'bed' },
  doorL: { right: 'center', down: 'center' },
  doorR: { left: 'center', down: 'center' },
  closet: { down: 'center' },
  bed: { down: 'center', up: 'center' },
};

export class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    this.station = 'center';
    this.moving = false;
    this.moveT = 0;
    this.moveDur = 0.45;
    this.fromPos = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();
    this.toQuat = new THREE.Quaternion();

    this.flashOn = false;
    this.flashWant = false;
    this.holding = false;
    this.enabled = false;
    this.time = 0;

    this.onArrive = null;
    this.onMoveStart = null;

    // flashlight
    this.flash = new THREE.SpotLight(0xfff2d8, 0, 18, 0.46, 0.55, 1.3);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(512, 512);
    camera.add(this.flash);
    this.flash.position.set(0.12, -0.18, 0.05);
    this.flashTarget = new THREE.Object3D();
    camera.add(this.flashTarget);
    this.flashTarget.position.set(0, -0.06, -4);
    this.flash.target = this.flashTarget;

    this._setStation('center', true);
  }

  _setStation(name, snap = false) {
    const s = STATIONS[name];
    this.station = name;
    if (snap) {
      this.camera.position.copy(s.pos);
      this.camera.lookAt(s.look);
      this.baseQuat = this.camera.quaternion.clone();
    }
  }

  canMove(dir) {
    if (this.moving || !this.enabled) return null;
    return MOVES[this.station]?.[dir] ?? null;
  }

  go(dir) {
    const target = this.canMove(dir);
    if (!target) return false;
    this.goTo(target);
    return true;
  }

  goTo(name) {
    if (this.moving || name === this.station) return;
    const s = STATIONS[name];
    this.fromPos.copy(this.camera.position);
    this.toPos.copy(s.pos);
    this.fromQuat.copy(this.camera.quaternion);
    const tmp = new THREE.Object3D();
    tmp.position.copy(s.pos);
    tmp.lookAt(s.look);
    this.toQuat.copy(tmp.quaternion);
    this.moving = true;
    this.moveT = 0;
    // turning to the bed is a quick spin; door dashes are a touch longer
    this.moveDur = (name === 'bed' || this.station === 'bed') ? 0.38 : 0.46;
    this.holding = false;
    const from = this.station;
    this.station = name;
    if (this.onMoveStart) this.onMoveStart(from, name);
  }

  setFlash(on) {
    this.flashWant = on && this.enabled;
  }

  setHolding(on) {
    this.holding = on && this.enabled && !this.moving &&
      (this.station === 'doorL' || this.station === 'doorR' || this.station === 'closet');
  }

  update(dt) {
    this.time += dt;

    // movement tween
    if (this.moving) {
      this.moveT += dt / this.moveDur;
      const k = Math.min(this.moveT, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
      this.camera.position.lerpVectors(this.fromPos, this.toPos, e);
      this.camera.quaternion.slerpQuaternions(this.fromQuat, this.toQuat, e);
      // run-bob
      const bob = Math.sin(k * Math.PI * 3) * 0.035 * Math.sin(k * Math.PI);
      this.camera.position.y += bob;
      if (k >= 1) {
        this.moving = false;
        this.baseQuat = this.camera.quaternion.clone();
        if (this.onArrive) this.onArrive(this.station);
      }
    } else {
      // idle sway + breathing
      const s = STATIONS[this.station];
      const swayX = Math.sin(this.time * 0.55) * 0.012 + Math.sin(this.time * 1.31) * 0.006;
      const swayY = Math.sin(this.time * 0.83) * 0.01;
      this.camera.position.copy(s.pos);
      this.camera.position.x += swayX;
      this.camera.position.y += swayY + Math.sin(this.time * 1.7) * 0.004;
      if (this.baseQuat) {
        const q = this.baseQuat.clone();
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(this.time * 0.7) * 0.004, Math.sin(this.time * 0.5) * 0.006, Math.sin(this.time * 0.62) * 0.003));
        q.multiply(tilt);
        this.camera.quaternion.copy(q);
      }
    }

    // flashlight (instant click on/off + hand wobble)
    if (this.flashWant !== this.flashOn) {
      this.flashOn = this.flashWant;
      this.flash.intensity = this.flashOn ? 38 : 0;
      if (this.audio.ctx) this.audio.flashClick();
    }
    if (this.flashOn) {
      this.flash.intensity = 36 + Math.sin(this.time * 31) * 1.6 + Math.sin(this.time * 7.3) * 1.2;
      this.flashTarget.position.x = Math.sin(this.time * 1.9) * 0.05;
      this.flashTarget.position.y = -0.06 + Math.sin(this.time * 2.6) * 0.04;
    }

    // door / closet panels ease toward held state
    const speed = dt * 5.5;
    const doors = [
      [this.world.doorL, this.station === 'doorL'],
      [this.world.doorR, this.station === 'doorR'],
    ];
    for (const [door, here] of doors) {
      const want = (here && this.holding) ? 1 : 0;
      const cur = door.getClose();
      if (Math.abs(cur - want) > 0.001) {
        const next = THREE.MathUtils.clamp(cur + Math.sign(want - cur) * speed, 0, 1);
        door.setClose(next);
        if (want === 1 && cur < 0.96 && next >= 0.96 && this.audio.ctx) this.audio.doorSlam();
      }
    }
    // closet doors: hold pulls them shut (game sets ambient ajar level)
    if (this.station === 'closet' && this.holding) {
      const cur = this.world.closet.getAjar();
      this.world.closet.setAjar(Math.max(0, cur - speed * 0.6));
    }
  }
}

export { STATIONS, MOVES };
