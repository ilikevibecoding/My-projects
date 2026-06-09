// =============================================================
// Vehicles: speeder bikes, emplaced turrets (+ starfighters)
// =============================================================
'use strict';

const Vehicles = (() => {
  let scene;
  const all = [];

  const _fwd = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();

  // ------------------------------------------------------------
  class Speeder {
    constructor(team, x, z) {
      this.kind = 'speeder';
      this.name = 'Speeder Bike';
      this.team = team;
      this.spawnPoint = { x, z };
      this.position = new THREE.Vector3(x, World.getGroundHeight(x, z) + CONFIG.speeder.hoverHeight, z);
      this.yaw = Math.random() * Math.PI * 2;
      this.speedV = 0;
      this.health = CONFIG.speeder.health;
      this.maxHealth = CONFIG.speeder.health;
      this.alive = true;
      this.occupant = null;
      this.respawnTimer = 0;
      this.fireCooldown = 0;
      this.muzzleFlip = 0;
      this.lean = 0;
      this.model = Assets.buildSpeeder(team);
      this.model.position.copy(this.position);
      scene.add(this.model);
    }

    get radius() { return 1.6; }

    onEnter(soldier) { this.occupant = soldier; }
    onExit() {
      const pos = this.position.clone();
      pos.x += Math.cos(this.yaw) * 2;
      pos.z -= Math.sin(this.yaw) * 2;
      this.occupant = null;
      this.speedV = 0;
      return pos;
    }
    canExit() { return this.speedV < 12; }

    drive(input, dt, camera) {
      const C = CONFIG.speeder;
      const max = input.boost ? C.boostSpeed : C.maxSpeed;
      this.speedV += input.forward * C.accel * dt;
      this.speedV = Math.max(-8, Math.min(max, this.speedV));
      if (!input.forward) this.speedV *= (1 - dt * 0.7);
      const turn = input.turn * C.turnRate * dt * (0.5 + 0.5 * Math.min(1, Math.abs(this.speedV) / 14));
      this.yaw += turn - input.mouseDX * 0.0011;
      this.lean += ((input.turn * -0.4 - input.mouseDX * 0.004) - this.lean) * Math.min(1, dt * 5);

      _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
      const nx = this.position.x + _fwd.x * this.speedV * dt;
      const nz = this.position.z + _fwd.z * this.speedV * dt;
      const res = World.resolveCollision(nx, nz, 1.1, this.position.y);
      // crash damping when blocked
      if (Math.hypot(res.x - nx, res.z - nz) > 0.05) {
        if (this.speedV > 26) Game.damageEntity(this, 25, null, null);
        this.speedV *= 0.4;
      }
      this.position.x = res.x;
      this.position.z = res.z;
      const gy = World.getGroundHeight(res.x, res.z) + C.hoverHeight;
      this.position.y += (gy - this.position.y) * Math.min(1, dt * 7);

      // fire
      this.fireCooldown -= dt;
      if (input.fire && this.fireCooldown <= 0) {
        this.fireCooldown = 1 / CONFIG.weapons.speederGun.rof;
        this.muzzleFlip ^= 1;
        const mz = this.model.userData.muzzles[this.muzzleFlip];
        _muzzle.copy(mz).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI).add(this.position);
        _muzzle.y = this.position.y + 0.4;
        _v1.copy(_fwd);
        Weapons.fire(this.occupant || this, _muzzle, _v1, 'speederGun',
          CONFIG.factions[this.team].boltColor);
      }

      // camera chase
      const shk = Effects.getShake();
      camera.position.set(
        this.position.x - _fwd.x * 6.5 + (Math.random() - 0.5) * shk * 0.4,
        this.position.y + 2.6 + (Math.random() - 0.5) * shk * 0.4,
        this.position.z - _fwd.z * 6.5);
      const cgy = World.getGroundHeight(camera.position.x, camera.position.z) + 0.5;
      if (camera.position.y < cgy) camera.position.y = cgy;
      camera.lookAt(this.position.x + _fwd.x * 8, this.position.y + 0.8, this.position.z + _fwd.z * 8);
      // FOV punch with speed
      const targetFov = 75 + Math.abs(this.speedV) * 0.32;
      if (Math.abs(camera.fov - targetFov) > 0.3) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
        camera.updateProjectionMatrix();
      }
    }

    update(dt) {
      if (!this.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
        return;
      }
      // idle hover bob when empty
      if (!this.occupant) {
        const gy = World.getGroundHeight(this.position.x, this.position.z) + CONFIG.speeder.hoverHeight;
        this.position.y = gy + Math.sin(Game.time * 1.7 + this.position.x) * 0.06;
        this.speedV = 0;
      }
      this.model.position.copy(this.position);
      this.model.rotation.set(0, this.yaw + Math.PI, this.lean);
      this.lean *= (1 - dt * 2);
    }

    explode(attacker) {
      this.alive = false;
      this.model.visible = false;
      this.respawnTimer = 22;
      Effects.explosion(this.position.clone(), 6);
      SynthAudio.sfx('explosion', this.position);
      Game.applySplash(this.position, 6, 80, attacker);
      if (this.occupant && this.occupant.alive) {
        Game.damageEntity(this.occupant, 120, attacker, null);
      }
    }

    respawn() {
      this.health = this.maxHealth;
      this.alive = true;
      this.model.visible = true;
      this.position.set(this.spawnPoint.x,
        World.getGroundHeight(this.spawnPoint.x, this.spawnPoint.z) + CONFIG.speeder.hoverHeight,
        this.spawnPoint.z);
      this.speedV = 0;
      this.occupant = null;
    }
  }

  // ------------------------------------------------------------
  class Turret {
    constructor(x, z, team) {
      this.kind = 'turret';
      this.name = 'E-Web Turret';
      this.team = team;             // re-evaluated from nearest post
      this.position = new THREE.Vector3(x, World.getGroundHeight(x, z), z);
      this.health = CONFIG.turret.health;
      this.maxHealth = CONFIG.turret.health;
      this.alive = true;
      this.occupant = null;
      this.respawnTimer = 0;
      this.fireCooldown = 0;
      this.muzzleFlip = 0;
      this.aimYaw = 0;
      this.aimPitch = 0;
      this.aiScanTimer = Math.random();
      this.aiTarget = null;
      this.model = Assets.buildTurret();
      this.model.position.copy(this.position);
      scene.add(this.model);
      // nearest post controls allegiance
      let bd = 1e9;
      for (const p of CONFIG.posts) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; this.postId = p.id; }
      }
    }

    get radius() { return 1.5; }

    onEnter(soldier) { this.occupant = soldier; this.team = soldier.team; }
    onExit() {
      const pos = this.position.clone();
      pos.x += Math.sin(this.aimYaw + Math.PI / 2) * 2;
      pos.z += Math.cos(this.aimYaw + Math.PI / 2) * 2;
      this.occupant = null;
      return pos;
    }
    canExit() { return true; }

    aimDir(out) {
      out.set(
        -Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
        Math.sin(this.aimPitch),
        -Math.cos(this.aimYaw) * Math.cos(this.aimPitch));
      return out;
    }

    fireOnce(owner) {
      this.fireCooldown = 1 / CONFIG.weapons.turretGun.rof;
      this.muzzleFlip ^= 1;
      this.aimDir(_v1);
      _muzzle.copy(this.position);
      _muzzle.y += 0.95;
      _muzzle.addScaledVector(_v1, 2.6);
      Weapons.fire(owner || this, _muzzle, _v1, 'turretGun',
        this.team ? CONFIG.factions[this.team].boltColor : 0xffaa33);
    }

    drive(input, dt, camera) {
      this.aimYaw -= input.mouseDX * 0.0022;
      this.aimPitch = Math.max(-0.18, Math.min(0.55, this.aimPitch - input.mouseDY * 0.0022));
      this.fireCooldown -= dt;
      if (input.fire && this.fireCooldown <= 0) this.fireOnce(this.occupant);
      // camera: over-shoulder of the gun
      this.aimDir(_v1);
      camera.position.set(
        this.position.x - _v1.x * 3.4,
        this.position.y + 2.3,
        this.position.z - _v1.z * 3.4);
      camera.lookAt(
        this.position.x + _v1.x * 20,
        this.position.y + 1.4 + _v1.y * 20,
        this.position.z + _v1.z * 20);
    }

    update(dt) {
      if (!this.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.health = this.maxHealth;
          this.alive = true;
          this.model.visible = true;
        }
        return;
      }
      // allegiance follows controlling post
      if (!this.occupant) {
        const st = Capture.getState(this.postId);
        this.team = st && st.owner ? st.owner : null;
        // AI scan & engage
        if (this.team) {
          this.aiScanTimer -= dt;
          if (this.aiScanTimer <= 0) {
            this.aiScanTimer = 0.5;
            this.aiTarget = null;
            let bd = 70;
            _v1.copy(this.position); _v1.y += 1.6;
            for (const s of Soldiers.all) {
              if (!s.alive || s.team === this.team) continue;
              const d = this.position.distanceTo(s.position);
              if (d < bd) {
                _v2.set(s.position.x, s.eyeY - 0.3, s.position.z);
                if (World.hasLineOfSight(_v1, _v2)) { this.aiTarget = s; bd = d; }
              }
            }
          }
          const t = this.aiTarget;
          if (t && t.alive) {
            const dx = t.position.x - this.position.x;
            const dz = t.position.z - this.position.z;
            const dy = (t.position.y + 1.1) - (this.position.y + 0.95);
            const wantYaw = Math.atan2(-dx, -dz);
            this.aimYaw = Soldiers.lerpAngle(this.aimYaw, wantYaw, Math.min(1, dt * 2.2));
            this.aimPitch += (Math.atan2(dy, Math.hypot(dx, dz)) - this.aimPitch) * Math.min(1, dt * 2.2);
            this.fireCooldown -= dt;
            let yawErr = Math.abs(this.aimYaw - wantYaw) % (Math.PI * 2);
            if (yawErr > Math.PI) yawErr = Math.PI * 2 - yawErr;
            if (this.fireCooldown <= 0 && yawErr < 0.1) {
              this.fireCooldown = 1 / CONFIG.weapons.turretGun.rof * 2.2;
              this.fireOnce(null);
            }
          }
        }
      }
      // model pose
      const u = this.model.userData;
      u.pivot.rotation.y = this.aimYaw + Math.PI;
      u.gunGroup.rotation.x = -this.aimPitch;
    }

    explode(attacker) {
      this.alive = false;
      this.model.visible = false;
      this.respawnTimer = 30;
      Effects.explosion(this.position.clone(), 4.5);
      SynthAudio.sfx('explosion', this.position);
      if (this.occupant && this.occupant.alive) {
        Game.damageEntity(this.occupant, 100, attacker, null);
        this.occupant = null;
      }
    }
  }

  // ------------------------------------------------------------
  class Starfighter {
    constructor(team, x, z) {
      this.kind = 'fighter';
      this.name = team === 'coalition' ? 'V-Wing Fighter' : 'Interceptor';
      this.team = team;
      this.spawnPoint = { x, z };
      this.position = new THREE.Vector3(x, World.getGroundHeight(x, z) + 1.2, z);
      this.quat = new THREE.Quaternion();
      this.speedV = 0;
      this.health = CONFIG.fighter.health;
      this.maxHealth = CONFIG.fighter.health;
      this.alive = true;
      this.occupant = null;
      this.respawnTimer = 0;
      this.fireCooldown = 0;
      this.muzzleFlip = 0;
      this.flying = false;
      this.model = Assets.buildStarfighter(team);
      this.model.position.copy(this.position);
      const e = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
      this.quat.setFromEuler(e);
      scene.add(this.model);
    }

    get radius() { return 3.2; }

    onEnter(soldier) {
      this.occupant = soldier;
      this.flying = false;
      this.speedV = 0;
    }
    onExit() {
      const pos = this.position.clone();
      pos.x += 3.5;
      this.occupant = null;
      this.flying = false;
      this.speedV = 0;
      // settle to ground
      const gy = World.getGroundHeight(this.position.x, this.position.z) + 1.2;
      this.position.y = Math.max(gy, Math.min(this.position.y, gy + 2));
      const flat = new THREE.Euler().setFromQuaternion(this.quat, 'YXZ');
      this.quat.setFromEuler(new THREE.Euler(0, flat.y, 0));
      return pos;
    }
    canExit() {
      const gy = World.getGroundHeight(this.position.x, this.position.z);
      return this.position.y - gy < 4 && this.speedV < 12;
    }

    drive(input, dt, camera) {
      const C = CONFIG.fighter;
      // throttle
      const target = input.forward > 0 ? (input.boost ? C.boostSpeed : C.maxSpeed)
        : input.forward < 0 ? C.minSpeed : this.speedV;
      this.speedV += (target - this.speedV) * Math.min(1, dt * (input.forward >= 0 ? 0.9 : 1.6));
      if (!this.flying && this.speedV > 14) this.flying = true;
      if (!this.flying) {
        // taxi hop: rise gently with W
        this.speedV = Math.max(0, this.speedV);
      }
      // orientation: mouse pitch + roll, A/D yaw
      const pitchIn = -input.mouseDY * 0.0021;
      const rollIn = -input.mouseDX * 0.0024;
      const yawIn = input.turn * C.yawRate * dt;
      const dq = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(pitchIn, yawIn, rollIn, 'YXZ'));
      this.quat.multiply(dq);
      // velocity along forward
      _fwd.set(0, 0, -1).applyQuaternion(this.quat);
      // gentle lift while slow near ground
      const gy = World.getGroundHeight(this.position.x, this.position.z);
      this.position.addScaledVector(_fwd, this.speedV * dt);
      if (this.flying && input.up) this.position.y += 16 * dt;
      if (this.flying && input.down) this.position.y -= 16 * dt;
      // terrain crash
      if (this.position.y < gy + 1.0) {
        this.position.y = gy + 1.0;
        if (this.speedV > 40) { Game.damageEntity(this, 90, null, null); }
        this.speedV *= 0.6;
        // level out
        const flat = new THREE.Euler().setFromQuaternion(this.quat, 'YXZ');
        flat.x *= 0.8; flat.z *= 0.8;
        this.quat.setFromEuler(flat);
      }
      // ceiling
      const maxY = CONFIG.space.orbitAltitude + 160;
      if (this.position.y > maxY) this.position.y = maxY;
      // bounds: soft wrap back
      const lim = 900;
      this.position.x = Math.max(-lim, Math.min(lim, this.position.x));
      this.position.z = Math.max(-lim, Math.min(lim, this.position.z));

      // fire
      this.fireCooldown -= dt;
      if (input.fire && this.fireCooldown <= 0) {
        this.fireCooldown = 1 / CONFIG.weapons.fighterGun.rof;
        this.muzzleFlip ^= 1;
        const mz = this.model.userData.muzzles[this.muzzleFlip];
        _muzzle.copy(mz).applyQuaternion(this.quat).add(this.position);
        _v1.copy(_fwd);
        Weapons.fire(this.occupant || this, _muzzle, _v1, 'fighterGun',
          CONFIG.factions[this.team].boltColor);
      }

      // chase camera
      _v2.set(0, 2.6, 9.5).applyQuaternion(this.quat);
      camera.position.copy(this.position).add(_v2);
      const cgy = World.getGroundHeight(camera.position.x, camera.position.z) + 0.6;
      if (camera.position.y < cgy) camera.position.y = cgy;
      _v2.copy(this.position).addScaledVector(_fwd, 18);
      camera.up.set(0, 1, 0).applyQuaternion(this.quat);
      camera.lookAt(_v2);
      const targetFov = 75 + this.speedV * 0.2;
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }

    update(dt) {
      if (!this.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
        return;
      }
      this.model.position.copy(this.position);
      this.model.quaternion.copy(this.quat);
    }

    explode(attacker) {
      this.alive = false;
      this.model.visible = false;
      this.respawnTimer = 28;
      Effects.explosion(this.position.clone(), 8);
      SynthAudio.sfx('explosion', this.position);
      if (this.occupant && this.occupant.alive) {
        Game.damageEntity(this.occupant, 200, attacker, null);
      }
    }

    respawn() {
      this.health = this.maxHealth;
      this.alive = true;
      this.model.visible = true;
      this.position.set(this.spawnPoint.x,
        World.getGroundHeight(this.spawnPoint.x, this.spawnPoint.z) + 1.2, this.spawnPoint.z);
      this.quat.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
      this.speedV = 0;
      this.occupant = null;
      this.flying = false;
    }
  }

  // ------------------------------------------------------------
  function init(sc) { scene = sc; }

  function spawnAll() {
    for (const v of all) scene.remove(v.model);
    all.length = 0;
    const A = CONFIG.posts.find(p => p.id === 'A');
    const E = CONFIG.posts.find(p => p.id === 'E');
    // speeders at both bases
    all.push(new Speeder('coalition', A.x + 10, A.z + 10));
    all.push(new Speeder('coalition', A.x + 14, A.z + 6));
    all.push(new Speeder('dominion', E.x - 10, E.z + 10));
    all.push(new Speeder('dominion', E.x - 14, E.z + 6));
    // starfighters
    all.push(new Starfighter('coalition', A.x - 4, A.z + 24));
    all.push(new Starfighter('dominion', E.x + 4, E.z + 24));
    // turrets at compound + contested posts
    const C = CONFIG.posts.find(p => p.id === 'C');
    const B = CONFIG.posts.find(p => p.id === 'B');
    const D = CONFIG.posts.find(p => p.id === 'D');
    all.push(new Turret(C.x - 16, C.z - 14, null));
    all.push(new Turret(C.x + 16, C.z + 14, null));
    all.push(new Turret(B.x + 8, B.z - 10, null));
    all.push(new Turret(D.x - 8, D.z - 10, null));
  }

  function update(dt) {
    for (const v of all) v.update(dt);
  }

  function nearestEnterable(pos, range, team) {
    let best = null, bd = range;
    for (const v of all) {
      if (!v.alive || v.occupant) continue;
      if (v.kind !== 'turret' && v.team !== team) continue;
      const d = pos.distanceTo(v.position);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  return { init, spawnAll, update, nearestEnterable, all };
})();
