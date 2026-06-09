// =============================================================
// Weapons: pooled glowing bolts, rockets, grenades, hit tests
// =============================================================
'use strict';

const Weapons = (() => {
  let scene;
  const BOLT_POOL = 140;
  const bolts = [];
  const grenades = [];
  const coreMats = new Map(), glowMats = new Map();

  function boltMats(color) {
    if (!coreMats.has(color)) {
      coreMats.set(color, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      glowMats.set(color, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
    }
    return { core: coreMats.get(color), glow: glowMats.get(color) };
  }

  function init(sc) {
    scene = sc;
    const coreGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    coreGeo.rotateX(Math.PI / 2);   // align to z
    for (let i = 0; i < BOLT_POOL; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, null);
      const glow = new THREE.Mesh(coreGeo, null);
      g.add(core, glow);
      g.visible = false;
      g.userData = {
        active: false, vel: new THREE.Vector3(), owner: null, weapon: null,
        traveled: 0, color: 0xffffff, core, glow,
      };
      scene.add(g);
      bolts.push(g);
    }
    // grenade pool
    const gGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const gMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.4, metalness: 0.7 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(gGeo, gMat);
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), lightMat.clone());
      blink.position.y = 0.1;
      m.add(blink);
      m.visible = false;
      m.userData = { active: false, vel: new THREE.Vector3(), fuse: 0, owner: null, blink };
      scene.add(m);
      grenades.push(m);
    }
  }

  // ---------- firing ------------------------------------------
  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  let boltIdx = 0;
  function spawnBolt(owner, origin, dir, weaponKey, color) {
    const W = CONFIG.weapons[weaponKey];
    const b = bolts[boltIdx];
    boltIdx = (boltIdx + 1) % BOLT_POOL;
    const u = b.userData;
    u.active = true;
    u.owner = owner;
    u.weapon = W;
    u.traveled = 0;
    u.vel.copy(dir).multiplyScalar(W.speed);
    u.color = color;
    const mats = boltMats(color);
    u.core.material = mats.core;
    u.glow.material = mats.glow;
    u.core.scale.set(W.boltRadius * 0.45, W.boltRadius * 0.45, W.boltLen);
    u.glow.scale.set(W.boltRadius * 1.6, W.boltRadius * 1.6, W.boltLen * 1.15);
    b.position.copy(origin);
    b.lookAt(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z);
    b.visible = true;
  }

  // owner: { team, position (for kill credit), isPlayer? }
  function fire(owner, origin, dir, weaponKey, color) {
    const W = CONFIG.weapons[weaponKey];
    const pellets = W.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      _dir.copy(dir);
      // spread: random offset in disc perpendicular to dir
      _right.crossVectors(_dir, _up).normalize();
      if (_right.lengthSq() < 0.01) _right.set(1, 0, 0);
      const upv = new THREE.Vector3().crossVectors(_right, _dir).normalize();
      const a = Math.random() * Math.PI * 2;
      const r = (Math.random() + Math.random()) * 0.5 * W.spread;
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize();
      spawnBolt(owner, origin, _dir, weaponKey, color);
    }
    Effects.muzzleFlash(origin, color);
    SynthAudio.sfx(W.sfx, origin);
  }

  function throwGrenade(owner, origin, dir) {
    const g = grenades.find(x => !x.userData.active);
    if (!g) return;
    const u = g.userData;
    u.active = true;
    u.owner = owner;
    u.fuse = CONFIG.grenade.fuse;
    u.vel.copy(dir).multiplyScalar(CONFIG.grenade.throwSpeed).addScaledVector(_up, 3.5);
    g.position.copy(origin);
    g.visible = true;
    SynthAudio.sfx('grenadeThrow', origin);
  }

  // ---------- update ------------------------------------------
  const _step = new THREE.Vector3();
  const _pos = new THREE.Vector3();

  function update(dt) {
    // bolts
    for (const b of bolts) {
      const u = b.userData;
      if (!u.active) continue;
      const W = u.weapon;
      const stepLen = u.vel.length() * dt;
      const sub = Math.min(10, Math.max(1, Math.ceil(stepLen / 0.6)));
      let hit = false;
      for (let s = 0; s < sub && !hit; s++) {
        _step.copy(u.vel).multiplyScalar(dt / sub);
        _pos.copy(b.position).add(_step);
        // terrain
        const gy = World.getGroundHeight(_pos.x, _pos.z);
        if (_pos.y <= gy) {
          _pos.y = gy + 0.05;
          impact(b, _pos, true);
          hit = true; break;
        }
        // props
        if (_pos.y < 8) {
          const t = World.segmentHitProp(b.position.x, b.position.z, _pos.x, _pos.z, b.position.y, _pos.y);
          if (t >= 0) {
            _pos.lerpVectors(b.position, _pos, Math.max(0.01, t));
            impact(b, _pos, true);
            hit = true; break;
          }
        }
        // entities
        const ent = Game.hitTestEntities(b.position, _pos, u.owner);
        if (ent) {
          impact(b, _pos, false);
          Game.damageEntity(ent, W.damage, u.owner, W);
          hit = true; break;
        }
        b.position.copy(_pos);
      }
      if (!hit) {
        u.traveled += stepLen;
        if (u.traveled > W.range) { deactivate(b); }
      }
    }

    // grenades
    for (const g of grenades) {
      const u = g.userData;
      if (!u.active) continue;
      u.fuse -= dt;
      u.vel.y -= CONFIG.player.gravity * 0.82 * dt;
      g.position.addScaledVector(u.vel, dt);
      const gy = World.getGroundHeight(g.position.x, g.position.z) + 0.11;
      if (g.position.y < gy) {
        g.position.y = gy;
        u.vel.y = Math.abs(u.vel.y) * 0.42;
        u.vel.x *= 0.7; u.vel.z *= 0.7;
        if (u.vel.y < 0.6) u.vel.y = 0;
      }
      u.blink.material.color.setHex(((performance.now() / 120) | 0) % 2 ? 0xff3322 : 0x551108);
      if (u.fuse <= 0) {
        u.active = false;
        g.visible = false;
        Effects.explosion(g.position.clone(), 5);
        SynthAudio.sfx('explosion', g.position);
        Game.applySplash(g.position, CONFIG.grenade.radius, CONFIG.grenade.damage, u.owner);
      }
    }
  }

  function impact(b, pos, isWorld) {
    const u = b.userData;
    if (u.weapon.explosive) {
      Effects.explosion(pos.clone(), 4.5);
      SynthAudio.sfx('explosion', pos);
      Game.applySplash(pos, u.weapon.splashRadius, u.weapon.splash, u.owner);
    } else {
      Effects.boltImpact(pos, u.color);
    }
    deactivate(b);
  }

  function deactivate(b) {
    b.userData.active = false;
    b.visible = false;
  }

  function clearAll() {
    for (const b of bolts) deactivate(b);
    for (const g of grenades) { g.userData.active = false; g.visible = false; }
  }

  return { init, fire, throwGrenade, update, clearAll };
})();
