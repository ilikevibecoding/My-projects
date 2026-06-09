// =============================================================
// Soldiers: shared entity for player & bots + BotBrain AI
// =============================================================
'use strict';

const Soldiers = (() => {
  let scene;
  const all = [];

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  class Soldier {
    constructor(team, cls, x, z, isPlayer = false) {
      this.team = team;
      this.cls = cls;
      this.isPlayer = isPlayer;
      this.kind = 'soldier';
      const C = CONFIG.classes[cls];
      this.maxHealth = C.health;
      this.health = C.health;
      this.speed = C.speed;
      this.weaponKey = C.weapon;
      this.grenades = C.grenades;
      this.alive = true;
      this.deathTimer = 0;
      this.position = new THREE.Vector3(x, World.getGroundHeight(x, z), z);
      this.yaw = Math.random() * Math.PI * 2;
      this.pitch = 0;
      this.velY = 0;
      this.grounded = true;
      this.walkPhase = 0;
      this.moving = false;
      this.lastDamageTime = -99;
      this.lastAttacker = null;
      // weapon state
      const W = CONFIG.weapons[this.weaponKey];
      this.ammo = W.clip;
      this.reloadTimer = 0;
      this.fireCooldown = 0;
      this.repairCooldown = 0;
      // visual
      const built = Assets.buildTrooper(team, cls);
      this.model = built.group;
      this.parts = built.parts;
      this.model.position.copy(this.position);
      scene.add(this.model);
      // bot brain
      this.brain = isPlayer ? null : {
        state: 'seek', thinkTimer: Math.random() * 0.3, path: null, pathIdx: 0,
        targetPost: null, enemy: null, strafeDir: 1, strafeTimer: 0,
        repathTimer: 0, burstTimer: 0, burstLeft: 0,
      };
      // name for killfeed
      this.name = isPlayer ? 'You' : botName(team);
      this.kills = 0; this.deaths = 0; this.captures = 0;
    }

    get eyeY() { return this.position.y + CONFIG.player.eyeHeight; }

    facingDir(out) {
      out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      return out;
    }

    // ---- movement (bots; the player drives its own) -----------
    moveToward(tx, tz, dt, speedMult = 1) {
      const dx = tx - this.position.x, dz = tz - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) { this.moving = false; return d; }
      const sp = this.speed * speedMult;
      const step = Math.min(d, sp * dt);
      let nx = this.position.x + (dx / d) * step;
      let nz = this.position.z + (dz / d) * step;
      const res = World.resolveCollision(nx, nz, CONFIG.player.radius, this.position.y + 1);
      this.position.x = res.x;
      this.position.z = res.z;
      this.position.y = World.getGroundHeight(res.x, res.z);
      const targetYaw = Math.atan2(dx, dz);
      this.yaw = lerpAngle(this.yaw, targetYaw, Math.min(1, dt * 9));
      this.moving = true;
      this.walkPhase += sp * dt * 1.65;
      return d;
    }

    strafe(dir, dt) {
      // sidestep perpendicular to facing
      const sx = Math.cos(this.yaw) * dir, sz = -Math.sin(this.yaw) * dir;
      const sp = this.speed * 0.55;
      const res = World.resolveCollision(
        this.position.x + sx * sp * dt, this.position.z + sz * sp * dt,
        CONFIG.player.radius, this.position.y + 1);
      this.position.x = res.x;
      this.position.z = res.z;
      this.position.y = World.getGroundHeight(res.x, res.z);
      this.moving = true;
      this.walkPhase += sp * dt * 1.65;
    }

    // ---- weapon ------------------------------------------------
    tryFireAt(targetPos, dt) {
      const W = CONFIG.weapons[this.weaponKey];
      if (this.reloadTimer > 0 || this.fireCooldown > 0) return;
      if (this.ammo <= 0) { this.startReload(); return; }
      // aim with error
      _aim.copy(targetPos);
      const err = CONFIG.bot.aimError * (1 + this.position.distanceTo(targetPos) / 60);
      _aim.x += (Math.random() - 0.5) * err * 40;
      _aim.y += (Math.random() - 0.5) * err * 26;
      _aim.z += (Math.random() - 0.5) * err * 40;
      _v1.set(this.position.x, this.eyeY - 0.18, this.position.z);
      _v2.copy(_aim).sub(_v1).normalize();
      const color = CONFIG.factions[this.team].boltColor;
      // muzzle slightly forward
      _v1.addScaledVector(_v2, 0.7);
      Weapons.fire(this, _v1, _v2, this.weaponKey, color);
      this.ammo--;
      this.fireCooldown = 1 / W.rof;
      // aim pose
      this.pitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      if (this.ammo <= 0) this.startReload();
    }

    startReload() {
      const W = CONFIG.weapons[this.weaponKey];
      if (this.reloadTimer > 0 || this.ammo === W.clip) return;
      this.reloadTimer = W.reload;
      if (this.isPlayer) SynthAudio.sfx('reload', this.position);
    }

    repairPulse() {
      if (this.repairCooldown > 0 || this.cls !== 'engineer') return false;
      this.repairCooldown = 8;
      Effects.repairPulse(new THREE.Vector3(this.position.x, this.position.y + 1, this.position.z));
      SynthAudio.sfx('repair', this.position);
      for (const s of all) {
        if (!s.alive || s.team !== this.team) continue;
        if (s.position.distanceTo(this.position) < 7) {
          s.health = Math.min(s.maxHealth, s.health + 40);
        }
      }
      return true;
    }

    die(attacker) {
      if (!this.alive) return;
      this.alive = false;
      this.deaths++;
      this.deathTimer = 0;
      Effects.deathBurst(
        new THREE.Vector3(this.position.x, this.position.y + 1.1, this.position.z),
        CONFIG.factions[this.team].color);
      if (attacker && attacker.kills != null && attacker.team !== this.team) attacker.kills++;
    }

    despawn() {
      scene.remove(this.model);
      const i = all.indexOf(this);
      if (i >= 0) all.splice(i, 1);
    }

    // ---- visuals ------------------------------------------------
    updateModel(dt) {
      const m = this.model;
      if (!this.alive) {
        // fall over
        this.deathTimer += dt;
        const t = Math.min(1, this.deathTimer * 2.6);
        m.rotation.x = -t * Math.PI / 2 * 0.96;
        m.position.copy(this.position);
        m.position.y += 0.12 * t;
        return;
      }
      m.rotation.x = 0;
      m.position.copy(this.position);
      m.rotation.y = this.yaw;
      // walk cycle
      const sw = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
      this.parts.lLeg.rotation.x = sw;
      this.parts.rLeg.rotation.x = -sw;
      this.parts.lArm.rotation.x = -sw * 0.7;
      // right arm: aim pose while in combat
      const combat = this.brain ? this.brain.enemy : this.isPlayer;
      const targetArm = combat ? (-Math.PI / 2 - this.pitch) : (sw * 0.7);
      this.parts.rArm.rotation.x += (targetArm - this.parts.rArm.rotation.x) * Math.min(1, dt * 10);
      // tiny idle bob
      this.parts.torso.position.y = Math.sin(this.walkPhase * 2) * 0.02;
      this.moving = false;
    }
  }

  // ---------------- bot AI --------------------------------------
  function think(s, dt) {
    const b = s.brain;
    b.thinkTimer -= dt;
    if (b.thinkTimer > 0) return;
    b.thinkTimer = CONFIG.bot.thinkInterval * (0.8 + Math.random() * 0.4);

    // 1) find enemy
    let best = null, bd = CONFIG.bot.viewRange;
    _v1.set(s.position.x, s.eyeY, s.position.z);
    for (const e of all) {
      if (e.team === s.team || !e.alive) continue;
      const d = s.position.distanceTo(e.position);
      if (d >= bd) continue;
      _v2.set(e.position.x, e.eyeY - 0.3, e.position.z);
      if (World.hasLineOfSight(_v1, _v2)) { best = e; bd = d; }
    }
    // also consider the player's vehicle
    const pv = Game.playerVehicle;
    if (pv && pv.team !== s.team && pv.alive) {
      const d = s.position.distanceTo(pv.position);
      if (d < bd) {
        _v2.copy(pv.position); _v2.y += 1;
        if (World.hasLineOfSight(_v1, _v2)) { best = pv; bd = d; }
      }
    }
    b.enemy = best;

    // 2) pick objective post
    b.repathTimer -= CONFIG.bot.thinkInterval;
    if (!b.targetPost || b.repathTimer <= 0 || postOwned(b.targetPost, s.team)) {
      b.targetPost = pickObjective(s);
      b.repathTimer = 7 + Math.random() * 6;
      if (b.targetPost) {
        b.path = World.findPath(s.position.x, s.position.z, b.targetPost.x, b.targetPost.z);
        b.pathIdx = 0;
      }
    }
  }

  function postOwned(post, team) {
    const st = Capture.getState(post.id);
    return st && st.owner === team && st.progress >= 1;
  }

  function pickObjective(s) {
    const posts = CONFIG.posts;
    let best = null, bestScore = -1e9;
    for (const p of posts) {
      const st = Capture.getState(p.id);
      if (!st) continue;
      const d = Math.hypot(p.x - s.position.x, p.z - s.position.z);
      let score = -d * 0.02;
      if (st.owner !== s.team) score += 10;            // capture it
      if (st.owner === s.team && st.contested) score += 14; // defend it
      if (st.owner === null) score += 4;               // neutral easy grab
      score += Math.random() * 6;                      // spread the bots out
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  function updateBot(s, dt) {
    const b = s.brain;
    think(s, dt);

    if (b.enemy && b.enemy.alive) {
      const e = b.enemy;
      const d = s.position.distanceTo(e.position);
      // face the enemy
      const dx = e.position.x - s.position.x, dz = e.position.z - s.position.z;
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      // strafe dance
      b.strafeTimer -= dt;
      if (b.strafeTimer <= 0) {
        b.strafeTimer = CONFIG.bot.strafePeriod * (0.6 + Math.random() * 0.8);
        b.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
      if (d < CONFIG.bot.fireRange) {
        s.strafe(b.strafeDir, dt);
        if (d > 6) {
          _v2.set(e.position.x, (e.eyeY || e.position.y + 1.2) - 0.25, e.position.z);
          s.tryFireAt(_v2, dt);
        }
        // engineers heal when hurt allies near
        if (s.cls === 'engineer' && s.health < s.maxHealth * 0.8) s.repairPulse();
        // occasional grenade
        if (s.grenades > 0 && d < 26 && d > 9 && Math.random() < dt * 0.06) {
          s.grenades--;
          _v2.set(dx, 0, dz).normalize();
          _v2.y = 0.45; _v2.normalize();
          _v1.set(s.position.x, s.eyeY, s.position.z);
          Weapons.throwGrenade(s, _v1, _v2);
        }
      } else {
        // close the distance
        s.moveToward(e.position.x, e.position.z, dt);
      }
    } else if (b.path && b.pathIdx < b.path.length) {
      const wp = b.path[b.pathIdx];
      const d = s.moveToward(wp.x, wp.z, dt);
      if (d < 2.2) b.pathIdx++;
    } else if (b.targetPost) {
      // loiter inside the capture radius
      const p = b.targetPost;
      const d = Math.hypot(s.position.x - p.x, s.position.z - p.z);
      if (d > p.radius * 0.6) s.moveToward(p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6, dt);
    }
  }

  // ---------------- module API -----------------------------------
  function init(sc) { scene = sc; }

  function create(team, cls, x, z, isPlayer = false) {
    const s = new Soldier(team, cls, x, z, isPlayer);
    all.push(s);
    return s;
  }

  function update(dt, camPos) {
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      // timers
      if (s.fireCooldown > 0) s.fireCooldown -= dt;
      if (s.repairCooldown > 0) s.repairCooldown -= dt;
      if (s.reloadTimer > 0) {
        s.reloadTimer -= dt;
        if (s.reloadTimer <= 0) s.ammo = CONFIG.weapons[s.weaponKey].clip;
      }
      // health regen
      if (s.alive && s.health < s.maxHealth &&
          Game.time - s.lastDamageTime > CONFIG.player.regenDelay) {
        s.health = Math.min(s.maxHealth, s.health + CONFIG.player.regenRate * dt);
      }
      if (!s.alive) {
        s.updateModel(dt);
        if (s.deathTimer > 3.2) {
          if (s.isPlayer) { s.model.visible = false; }
          else {
            s.despawn();
            Game.onBotDespawned(s);
          }
        }
        continue;
      }
      if (!s.isPlayer) {
        // LOD: distant bots think/render less often
        const far = camPos && s.position.distanceTo(camPos) > CONFIG.bot.farUpdateDist;
        if (!far || (i + Game.frame) % 2 === 0) {
          updateBot(s, far ? dt * 2 : dt);
        }
      }
      s.updateModel(dt);
    }
  }

  // ---------------- helpers ---------------------------------------
  const names1 = ['TK', 'DX', 'RC', 'VX', 'KL', 'JN', 'ZR', 'QM', 'BN', 'HV'];
  function botName(team) {
    const tag = team === 'dominion' ? names1[(Math.random() * names1.length) | 0] : ['Dash', 'Rook', 'Wedge', 'Sable', 'Juno', 'Kit', 'Nova', 'Flint', 'Mira', 'Crix'][(Math.random() * 10) | 0];
    return team === 'dominion' ? `${tag}-${100 + ((Math.random() * 899) | 0)}` : `${tag} ${['Antos', 'Vann', 'Reyes', 'Sol', 'Drake', 'Calder'][(Math.random() * 6) | 0]}`;
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  return { init, create, update, all, lerpAngle };
})();
