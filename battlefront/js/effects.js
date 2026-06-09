// =============================================================
// Effects: pooled particles, muzzle flashes, explosions, decals
// =============================================================
'use strict';

const Effects = (() => {
  let scene;
  const sprites = [];          // pooled particle sprites
  const lights = [];           // pooled point lights
  const scorches = [];         // pooled ground decals
  let particleScale = 1;
  let shakeAmount = 0;

  const POOL = 380;
  const LIGHT_POOL = 8;
  const SCORCH_POOL = 24;

  function init(sc) {
    scene = sc;
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: Assets.textures.glow, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.userData = { life: 0, maxLife: 1, vel: new THREE.Vector3(), grav: 0, size0: 1, size1: 1, fade: 1 };
      scene.add(s);
      sprites.push(s);
    }
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 26, 2);
      l.visible = false;
      l.userData = { life: 0, maxLife: 1, intensity0: 1 };
      scene.add(l);
      lights.push(l);
    }
    const scorchGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < SCORCH_POOL; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: Assets.textures.scorch, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(scorchGeo, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.userData = { life: 0 };
      scene.add(mesh);
      scorches.push(mesh);
    }
  }

  function setParticleScale(v) { particleScale = v; }

  let spriteIdx = 0;
  function spawn(pos, opts) {
    const s = sprites[spriteIdx];
    spriteIdx = (spriteIdx + 1) % POOL;
    s.visible = true;
    s.position.copy(pos);
    const u = s.userData;
    u.life = 0;
    u.maxLife = opts.life || 0.5;
    u.vel.copy(opts.vel || _zero);
    u.grav = opts.grav || 0;
    u.size0 = opts.size0 != null ? opts.size0 : 1;
    u.size1 = opts.size1 != null ? opts.size1 : u.size0;
    s.material.map = opts.map || Assets.textures.glow;
    s.material.color.set(opts.color != null ? opts.color : 0xffffff);
    s.material.opacity = opts.opacity != null ? opts.opacity : 1;
    u.fade = opts.opacity != null ? opts.opacity : 1;
    s.material.blending = opts.smoke ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.scale.setScalar(u.size0);
    return s;
  }
  const _zero = new THREE.Vector3();

  let lightIdx = 0;
  function flashLight(pos, color, intensity, dist, life) {
    const l = lights[lightIdx];
    lightIdx = (lightIdx + 1) % LIGHT_POOL;
    l.visible = true;
    l.position.copy(pos);
    l.color.set(color);
    l.intensity = intensity;
    l.distance = dist;
    l.userData.life = 0;
    l.userData.maxLife = life;
    l.userData.intensity0 = intensity;
  }

  let scorchIdx = 0;
  function addScorch(x, z, size) {
    const m = scorches[scorchIdx];
    scorchIdx = (scorchIdx + 1) % SCORCH_POOL;
    m.visible = true;
    m.position.set(x, World.getGroundHeight(x, z) + 0.04, z);
    m.scale.setScalar(size);
    m.rotation.z = Math.random() * Math.PI * 2;
    m.material.opacity = 0.85;
    m.userData.life = 0;
  }

  // ---------- effect recipes -----------------------------------
  const _v = new THREE.Vector3();

  function muzzleFlash(pos, color) {
    spawn(pos, { life: 0.06, size0: 0.5, size1: 1.1, color: 0xffffff, opacity: 0.95 });
    spawn(pos, { life: 0.08, size0: 0.9, size1: 0.3, color, opacity: 0.8 });
    flashLight(pos, color, 2.2, 9, 0.07);
  }

  function boltImpact(pos, color) {
    const n = Math.round(5 * particleScale);
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 7, Math.random() * 5.5, (Math.random() - 0.5) * 7);
      spawn(pos, {
        life: 0.22 + Math.random() * 0.2, vel: _v.clone(), grav: 11,
        size0: 0.14, size1: 0.03, color, opacity: 0.95,
      });
    }
    spawn(pos, { life: 0.12, size0: 0.35, size1: 0.9, color, opacity: 0.7 });
    flashLight(pos, color, 1.4, 6, 0.09);
  }

  function explosion(pos, radius = 6) {
    // white core flash
    spawn(pos, { life: 0.13, size0: radius * 0.5, size1: radius * 1.4, color: 0xfff4d8, opacity: 1 });
    // fireballs
    const nf = Math.round(8 * particleScale);
    for (let i = 0; i < nf; i++) {
      _v.set((Math.random() - 0.5) * radius * 1.6, Math.random() * radius * 1.2, (Math.random() - 0.5) * radius * 1.6);
      spawn(pos, {
        life: 0.4 + Math.random() * 0.3, vel: _v.clone(), grav: -2,
        size0: radius * (0.35 + Math.random() * 0.3), size1: radius * 0.1,
        color: i % 2 ? 0xff8a2a : 0xff5a16, opacity: 0.9,
      });
    }
    // sparks
    const ns = Math.round(14 * particleScale);
    for (let i = 0; i < ns; i++) {
      _v.set((Math.random() - 0.5) * 26, Math.random() * 19, (Math.random() - 0.5) * 26);
      spawn(pos, {
        life: 0.5 + Math.random() * 0.5, vel: _v.clone(), grav: 22,
        size0: 0.22, size1: 0.04, color: 0xffc266, opacity: 1,
      });
    }
    // smoke
    const nm = Math.round(7 * particleScale);
    for (let i = 0; i < nm; i++) {
      _v.set((Math.random() - 0.5) * 5, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 5);
      spawn(pos, {
        life: 1.4 + Math.random() * 1.0, vel: _v.clone(), grav: -0.6,
        size0: radius * 0.45, size1: radius * 1.5,
        color: 0x665d52, opacity: 0.5, smoke: true, map: Assets.textures.smoke,
      });
    }
    flashLight(pos, 0xffa040, 5.5, radius * 7, 0.32);
    addScorch(pos.x, pos.z, radius * 1.5);
    shakeFrom(pos, radius);
  }

  function deathBurst(pos, color) {
    const n = Math.round(8 * particleScale);
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5);
      spawn(pos, {
        life: 0.4 + Math.random() * 0.3, vel: _v.clone(), grav: 7,
        size0: 0.2, size1: 0.04, color, opacity: 0.9,
      });
    }
  }

  function repairPulse(pos) {
    spawn(pos, { life: 0.5, size0: 0.5, size1: 4.2, color: 0x46e8a0, opacity: 0.55 });
    flashLight(pos, 0x46e8a0, 1.6, 9, 0.3);
  }

  function captureBeam(pos, color) {
    _v.set(0, 6 + Math.random() * 3, 0);
    spawn(pos, {
      life: 0.9, vel: _v.clone(), grav: 0,
      size0: 0.3, size1: 0.06, color, opacity: 0.8,
    });
  }

  // camera shake, decays in update; read via getShake()
  let shakeRef = null;
  function shakeFrom(pos, radius) {
    if (!shakeRef) return;
    const d = shakeRef.position.distanceTo(pos);
    const str = Math.max(0, 1 - d / (radius * 9));
    if (str > 0) {
      shakeAmount = Math.min(0.6, shakeAmount + str * 0.45);
      Graphics.flash(str * 0.5);
    }
  }
  function setShakeReference(cam) { shakeRef = cam; }
  function addShake(v) { shakeAmount = Math.min(0.7, shakeAmount + v); }
  function getShake() { return shakeAmount; }

  function update(dt) {
    shakeAmount = Math.max(0, shakeAmount - dt * 1.7);
    for (const s of sprites) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life += dt;
      if (u.life >= u.maxLife) { s.visible = false; s.material.opacity = 0; continue; }
      const t = u.life / u.maxLife;
      u.vel.y -= u.grav * dt;
      s.position.addScaledVector(u.vel, dt);
      s.scale.setScalar(u.size0 + (u.size1 - u.size0) * t);
      s.material.opacity = u.fade * (1 - t * t);
    }
    for (const l of lights) {
      if (!l.visible) continue;
      l.userData.life += dt;
      const t = l.userData.life / l.userData.maxLife;
      if (t >= 1) { l.visible = false; l.intensity = 0; continue; }
      l.intensity = l.userData.intensity0 * (1 - t) * (0.8 + Math.random() * 0.4);
    }
    for (const m of scorches) {
      if (!m.visible) continue;
      m.userData.life += dt;
      if (m.userData.life > 24) {
        m.material.opacity -= dt * 0.3;
        if (m.material.opacity <= 0) m.visible = false;
      }
    }
  }

  return {
    init, update, muzzleFlash, boltImpact, explosion, deathBurst, repairPulse,
    captureBeam, setShakeReference, addShake, getShake, setParticleScale, flashLight, spawn,
  };
})();
