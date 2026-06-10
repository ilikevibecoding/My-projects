// =============================================================
// Procedural assets: canvas textures, materials, model builders
// =============================================================
'use strict';

const Assets = (() => {
  const matCache = new Map();

  // ---------- seeded RNG --------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- canvas texture helpers --------------------------
  function makeCanvas(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    return [cv, cv.getContext('2d')];
  }

  function canvasTexture(cv, repeat = 1, srgb = true) {
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    if (srgb) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  // fractal value-noise painter
  function paintNoise(ctx, size, base, layers) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(0xBEEF);
    for (const { count, rMin, rMax, colors, alpha } of layers) {
      for (let i = 0; i < count; i++) {
        const x = rng() * size, y = rng() * size;
        const r = rMin + rng() * (rMax - rMin);
        const c = colors[(rng() * colors.length) | 0];
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // grayscale height-noise → normal map
  function noiseToNormal(srcCtx, size, strength = 2.2) {
    const src = srcCtx.getImageData(0, 0, size, size);
    const [cv, ctx] = makeCanvas(size);
    const out = ctx.createImageData(size, size);
    const lum = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      lum[i] = (src.data[i * 4] + src.data[i * 4 + 1] + src.data[i * 4 + 2]) / 765;
    }
    const at = (x, y) => lum[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * size + x) * 4;
        out.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
        out.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
        out.data[i + 2] = inv * 255;
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return cv;
  }

  // ---------- shared textures ---------------------------------
  const textures = {};

  function buildTextures() {
    // -- sand --
    {
      const size = 512;
      const [cv, ctx] = makeCanvas(size);
      paintNoise(ctx, size, '#c8a067', [
        { count: 700, rMin: 6, rMax: 40, colors: ['#d2aa70', '#bc935c', '#cca469', '#d6b276'], alpha: 0.09 },
        { count: 320, rMin: 1, rMax: 4, colors: ['#b08550', '#dcba80'], alpha: 0.14 },
      ]);
      // wind ripple streaks (dominant detail)
      const rng = mulberry32(7);
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 300; i++) {
        ctx.strokeStyle = rng() > 0.5 ? '#dcb87e' : '#ab814c';
        ctx.lineWidth = 0.8 + rng() * 1.8;
        ctx.beginPath();
        const y = rng() * size;
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 24) {
          ctx.lineTo(x, y + Math.sin(x * 0.025 + i * 1.7) * 7);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      textures.sand = canvasTexture(cv, 90);
      textures.sandNormal = canvasTexture(noiseToNormal(ctx, size, 1.7), 90, false);
    }
    // -- rock --
    {
      const size = 256;
      const [cv, ctx] = makeCanvas(size);
      paintNoise(ctx, size, '#a89272', [
        { count: 360, rMin: 4, rMax: 34, colors: ['#b8a280', '#94805f', '#c4ac88', '#86735a'], alpha: 0.25 },
        { count: 260, rMin: 1, rMax: 6, colors: ['#7a684f', '#d2bc9a55'], alpha: 0.3 },
      ]);
      textures.rock = canvasTexture(cv, 3);
      textures.rockNormal = canvasTexture(noiseToNormal(ctx, size, 3.2), 3, false);
    }
    // -- hull metal (panel lines) --
    {
      const size = 256;
      const [cv, ctx] = makeCanvas(size);
      paintNoise(ctx, size, '#9aa0a8', [
        { count: 220, rMin: 4, rMax: 30, colors: ['#a8aeb6', '#8a9099', '#b4bac2'], alpha: 0.2 },
      ]);
      const rng = mulberry32(42);
      ctx.strokeStyle = 'rgba(40,44,50,0.55)';
      for (let i = 0; i < 26; i++) {
        ctx.lineWidth = 1 + rng() * 1.4;
        const v = rng() > 0.5;
        const p = rng() * size;
        ctx.beginPath();
        if (v) { ctx.moveTo(p, 0); ctx.lineTo(p, size); }
        else { ctx.moveTo(0, p); ctx.lineTo(size, p); }
        ctx.stroke();
      }
      // rivets + scuffs
      ctx.fillStyle = 'rgba(55,60,66,0.6)';
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.arc(rng() * size, rng() * size, 1.3, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = '#5a4632';
        const x = rng() * size, y = rng() * size;
        ctx.fillRect(x, y, 4 + rng() * 30, 1 + rng() * 3);
      }
      ctx.globalAlpha = 1;
      textures.hull = canvasTexture(cv, 1);
      textures.hullNormal = canvasTexture(noiseToNormal(ctx, size, 1.6), 1, false);
    }
    // -- dark hull (dominion / structures) --
    {
      const size = 256;
      const [cv, ctx] = makeCanvas(size);
      paintNoise(ctx, size, '#5a626c', [
        { count: 200, rMin: 4, rMax: 28, colors: ['#555c66', '#3c424a', '#606870'], alpha: 0.22 },
      ]);
      const rng = mulberry32(99);
      ctx.strokeStyle = 'rgba(20,22,26,0.6)';
      for (let i = 0; i < 22; i++) {
        ctx.lineWidth = 1 + rng() * 1.2;
        const v = rng() > 0.5; const p = rng() * size;
        ctx.beginPath();
        if (v) { ctx.moveTo(p, 0); ctx.lineTo(p, size); }
        else { ctx.moveTo(0, p); ctx.lineTo(size, p); }
        ctx.stroke();
      }
      textures.darkHull = canvasTexture(cv, 1);
    }
    // -- bolt sprite (round glow) --
    {
      const size = 64;
      const [cv, ctx] = makeCanvas(size);
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.glow = canvasTexture(cv, 1);
      textures.glow.wrapS = textures.glow.wrapT = THREE.ClampToEdgeWrapping;
    }
    // -- smoke puff --
    {
      const size = 128;
      const [cv, ctx] = makeCanvas(size);
      const rng = mulberry32(3);
      for (let i = 0; i < 26; i++) {
        const x = 32 + rng() * 64, y = 32 + rng() * 64, r = 14 + rng() * 26;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(230,230,230,0.32)');
        g.addColorStop(1, 'rgba(230,230,230,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      textures.smoke = canvasTexture(cv, 1);
      textures.smoke.wrapS = textures.smoke.wrapT = THREE.ClampToEdgeWrapping;
    }
    // -- scorch decal --
    {
      const size = 128;
      const [cv, ctx] = makeCanvas(size);
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(8,6,4,0.92)');
      g.addColorStop(0.55, 'rgba(16,12,8,0.6)');
      g.addColorStop(1, 'rgba(20,14,8,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.scorch = canvasTexture(cv, 1);
      textures.scorch.wrapS = textures.scorch.wrapT = THREE.ClampToEdgeWrapping;
    }
    // -- dry shrub (alpha sprite-style) --
    {
      const size = 128;
      const [cv, ctx] = makeCanvas(size);
      ctx.clearRect(0, 0, size, size);
      const rng = mulberry32(11);
      for (let i = 0; i < 46; i++) {
        ctx.strokeStyle = ['#7a6440', '#8d7448', '#665436', '#94805a'][(rng() * 4) | 0];
        ctx.lineWidth = 1 + rng() * 1.8;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        const a = -Math.PI / 2 + (rng() - 0.5) * 1.9;
        const lenS = 28 + rng() * 36;
        ctx.moveTo(64 + (rng() - 0.5) * 16, 126);
        const mx = 64 + Math.cos(a) * lenS * 0.5 + (rng() - 0.5) * 12;
        const my = 126 + Math.sin(a) * lenS * 0.6;
        ctx.quadraticCurveTo(mx, my, 64 + Math.cos(a) * lenS, 126 + Math.sin(a) * lenS);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      textures.shrub = canvasTexture(cv, 1);
      textures.shrub.wrapS = textures.shrub.wrapT = THREE.ClampToEdgeWrapping;
    }
    // -- lens flare elements --
    {
      const size = 128;
      const [cv, ctx] = makeCanvas(size);
      let g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,244,220,0.85)');
      g.addColorStop(0.16, 'rgba(255,230,180,0.32)');
      g.addColorStop(0.42, 'rgba(255,210,150,0.07)');
      g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      textures.flareMain = canvasTexture(cv, 1);
      const [cv2, ctx2] = makeCanvas(64);
      g = ctx2.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(180,220,255,0.0)');
      g.addColorStop(0.7, 'rgba(190,225,255,0.22)');
      g.addColorStop(0.82, 'rgba(190,225,255,0.05)');
      g.addColorStop(1, 'rgba(190,225,255,0)');
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, 64, 64);
      textures.flareRing = canvasTexture(cv2, 1);
    }
  }

  // ---------- materials ----------------------------------------
  function mat(key, params) {
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial(params);
    if (Graphics.envMap) { m.envMap = Graphics.envMap; m.envMapIntensity = 0.75; }
    matCache.set(key, m);
    return m;
  }

  function armorMat(faction) {
    const F = CONFIG.factions[faction];
    return mat('armor_' + faction, {
      color: F.armor, roughness: 0.5, metalness: 0.22,
    });
  }
  function accentMat(faction) {
    const F = CONFIG.factions[faction];
    return mat('accent_' + faction, { color: F.accent, roughness: 0.62, metalness: 0.18 });
  }
  function visorMat(faction) {
    return mat('visor_' + faction, {
      color: 0x14181e, roughness: 0.12, metalness: 0.85,
    });
  }
  function pauldronMat(cls) {
    const C = CONFIG.classes[cls];
    return mat('pauldron_' + cls, { color: C.pauldron, roughness: 0.45, metalness: 0.25 });
  }
  function gunMat() {
    return mat('gun', { color: 0x2a2e34, roughness: 0.38, metalness: 0.72 });
  }
  function emissiveMat(key, color, intensity = 2.2) {
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: new THREE.Color(color), emissiveIntensity: intensity,
      roughness: 0.4, metalness: 0,
    });
    matCache.set(key, m);
    return m;
  }

  // ---------- model: trooper -----------------------------------
  // Rounded, armoured trooper. Returns { group, parts:{...} }
  function buildTrooper(faction, cls) {
    const g = new THREE.Group();
    const armor = armorMat(faction);
    const accent = accentMat(faction);
    const under = underSuitMat(faction);
    const visor = visorMat(faction);
    const pauldron = pauldronMat(cls);
    const dark = gunMat();

    // ---- torso ----
    const torso = new THREE.Group();
    // rounded chest plate (flattened sphere)
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), armor);
    chest.scale.set(1.0, 1.18, 0.72);
    chest.position.y = 1.2;
    // under-suit abdomen
    const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.26, 10), under);
    abdomen.position.y = 0.92;
    // belt + pouches
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 10), dark);
    belt.position.y = 0.8;
    const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.06), accent);
    pouchL.position.set(-0.12, 0.78, 0.17);
    const pouchR = pouchL.clone(); pouchR.position.x = 0.12;
    // backpack with antenna
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.13), dark);
    pack.position.set(0, 1.2, -0.22);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), dark);
    antenna.position.set(-0.11, 1.45, -0.24);
    const packLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.02),
      emissiveMat('packlight_' + faction, CONFIG.factions[faction].color, 1.6));
    packLight.position.set(0.08, 1.3, -0.295);
    torso.add(chest, abdomen, belt, pouchL, pouchR, pack, antenna, packLight);

    // shoulder bells + class pauldron
    const bellL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 7), armor);
    bellL.position.set(-0.3, 1.42, 0);
    const bellR = bellL.clone(); bellR.position.x = 0.3;
    const pd = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 9, 7, 0, Math.PI * 2, 0, Math.PI / 2), pauldron);
    pd.position.set(0.3, 1.43, 0);
    torso.add(bellL, bellR, pd);

    // ---- head ----
    const head = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), under);
    neck.position.y = -0.12;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 11), armor);
    helmet.scale.set(1, 1.08, 1.02);
    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.12, 0.12, 10), armor);
    jaw.position.y = -0.08;
    // T-visor
    const visorH = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.045, 0.06), visor);
    visorH.position.set(0, 0.02, 0.135);
    const visorV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), visor);
    visorV.position.set(0, -0.05, 0.13);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.24), accent);
    crest.position.set(0, 0.14, 0);
    head.add(neck, helmet, jaw, visorH, visorV, crest);
    head.position.y = 1.66;

    // ---- limbs: cylinders + armour plates, pivot at joint ----
    function limb(r, len, isLeg) {
      const grp = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, len * 0.48, 8), armor);
      upper.position.y = -len * 0.26;
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 8, 6), under);
      joint.position.y = -len * 0.52;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.78, len * 0.46, 8), armor);
      lower.position.y = -len * 0.76;
      grp.add(upper, joint, lower);
      if (isLeg) {
        const boot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 1.1, r * 3.1), accent);
        boot.position.set(0, -len * 1.0, r * 0.5);
        grp.add(boot);
      } else {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 7, 5), dark);
        hand.position.y = -len * 1.0;
        grp.add(hand);
      }
      return grp;
    }
    const lArm = limb(0.072, 0.56, false); lArm.position.set(-0.31, 1.4, 0);
    const rArm = limb(0.072, 0.56, false); rArm.position.set(0.31, 1.4, 0);
    const lLeg = limb(0.092, 0.8, true); lLeg.position.set(-0.13, 0.8, 0);
    const rLeg = limb(0.092, 0.8, true); rLeg.position.set(0.13, 0.8, 0);
    // thigh plates
    const thighL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), armor);
    thighL.scale.set(1, 1.4, 1);
    thighL.position.y = -0.16;
    lLeg.add(thighL);
    const thighR = thighL.clone();
    rLeg.add(thighR);

    // gun in right hand
    const gun = buildBlaster(cls);
    gun.position.set(0.02, -0.5, 0.18);
    gun.rotation.x = Math.PI / 2;
    rArm.add(gun);

    g.add(torso, head, lArm, rArm, lLeg, rLeg);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return { group: g, parts: { head, torso, lArm, rArm, lLeg, rLeg, gun } };
  }

  function underSuitMat(faction) {
    const key = 'under_' + faction;
    if (matCache.has(key)) return matCache.get(key);
    const F = CONFIG.factions[faction];
    const c = new THREE.Color(F.armor).multiplyScalar(0.32);
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
    matCache.set(key, m);
    return m;
  }

  function buildBlaster(cls) {
    const g = new THREE.Group();
    const dark = gunMat();
    const W = CONFIG.classes[cls] ? CONFIG.weapons[CONFIG.classes[cls].weapon] : CONFIG.weapons.rifle;
    const len = cls === 'sniper' ? 1.0 : cls === 'rocket' || cls === 'heavy' ? 0.85 : 0.7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, len), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, len * 0.6, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -len * 0.55);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), dark);
    grip.position.set(0, -0.12, len * 0.18);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.1, 6),
      emissiveMat('guntip', 0xff7733, 1.2));
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.03, -len * 0.86);
    // stock + top sight for silhouette
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.22), dark);
    stock.position.set(0, -0.03, len * 0.52);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.16), dark);
    sight.position.set(0, 0.1, -len * 0.1);
    g.add(body, barrel, grip, tip, stock, sight);
    g.userData.muzzleOffset = new THREE.Vector3(0, 0.03, -len * 0.9);
    return g;
  }

  // first-person viewmodel weapon
  function buildViewModel(cls) {
    const g = buildBlaster(cls);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return g;
  }

  // ---------- model: props -------------------------------------
  function buildVaporator() {
    const g = new THREE.Group();
    const metal = mat('vap_metal', { color: 0xc6cad0, roughness: 0.45, metalness: 0.5, map: textures.hull });
    const dark = gunMat();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 7.2, 8), metal);
    core.position.y = 3.6;
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 8), dark);
      ring.position.y = 2.2 + i * 1.9;
      g.add(ring);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), metal);
    top.position.y = 7.3;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5),
      emissiveMat('vap_lamp', 0xff4444, 2.4));
    lamp.position.y = 7.9;
    g.add(core, top, lamp);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.collider = { radius: 0.8 };
    return g;
  }

  function buildRock(seed, scale = 1) {
    const rng = mulberry32(seed);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 0.72 + rng() * 0.55;
      pos.setXYZ(i, v.x * n, v.y * n * 0.74, v.z * n);
    }
    geo.computeVertexNormals();
    const m = mat('rock', {
      color: 0xc8b294, roughness: 0.95, metalness: 0.02,
      map: textures.rock, normalMap: textures.rockNormal,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.setScalar(scale);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.collider = { radius: scale * 0.9 };
    return mesh;
  }

  function buildBarricade() {
    const g = new THREE.Group();
    const m = mat('barricade', { color: 0xaab2bc, roughness: 0.5, metalness: 0.4, map: textures.hull });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 0.3), m);
    wall.position.y = 0.58;
    wall.rotation.x = -0.12;
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.9), m);
    footL.position.set(-1, 0.06, 0);
    const footR = footL.clone(); footR.position.x = 1;
    g.add(wall, footL, footR);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.collider = { radius: 1.3 };
    return g;
  }

  function buildBunker() {
    const g = new THREE.Group();
    const m = mat('bunker', { color: 0xd6c2a0, roughness: 0.8, metalness: 0.06, map: textures.rock });
    const dark = mat('bunker_dark', { color: 0x6a727c, roughness: 0.6, metalness: 0.35, map: textures.darkHull });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
    dome.scale.y = 0.62;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.4), dark);
    door.position.set(0, 1.0, 4.0);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8), dark);
    vent.position.set(1.6, 2.6, -1);
    g.add(dome, door, vent);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.collider = { radius: 4.3 };
    return g;
  }

  function buildWallSegment(len = 12) {
    const g = new THREE.Group();
    const m = mat('wall', { color: 0xd8c4a0, roughness: 0.82, metalness: 0.04, map: textures.rock });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 4.4, 1.2), m);
    wall.position.y = 2.2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.7), m);
    cap.position.y = 4.55;
    g.add(wall, cap);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.collider = { box: { hx: len / 2, hz: 0.9 } };
    return g;
  }

  function buildCrashedShip() {
    const g = new THREE.Group();
    const m = mat('crash', { color: 0xb2b8c0, roughness: 0.5, metalness: 0.45, map: textures.hull });
    const dark = gunMat();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 14, 10), m);
    hull.rotation.z = Math.PI / 2 - 0.22;
    hull.position.y = 1.7;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 2.6), m);
    fin.position.set(-5, 3, 0); fin.rotation.z = -0.3;
    const ribs = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 6, 12), dark);
    ribs.rotation.y = Math.PI / 2;
    ribs.position.set(2, 1.9, 0);
    g.add(hull, fin, ribs);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.collider = { radius: 6.5 };
    return g;
  }

  // ---------- model: command post -------------------------------
  function buildCommandPost() {
    const g = new THREE.Group();
    const metal = mat('cp_metal', { color: 0xc2c8d0, roughness: 0.42, metalness: 0.5, map: textures.hull });
    const dark = gunMat();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 0.5, 10), metal);
    base.position.y = 0.25;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 8), dark);
    pole.position.y = 3;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.4, 8), metal);
    crown.position.y = 5.8;
    g.add(base, pole, crown);

    // holographic flag — additive doublesided plane, colour swapped by owner
    const holoMat = new THREE.MeshBasicMaterial({
      color: 0xbbbbbb, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 12, 8), holoMat);
    holo.position.y = 4.4;
    g.add(holo);

    // glow ring on ground
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xbbbbbb, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    const light = new THREE.PointLight(0xffffff, 0.0, 18, 2);
    light.position.y = 4.4;
    g.add(light);

    base.castShadow = pole.castShadow = crown.castShadow = true;
    base.receiveShadow = true;
    g.userData = { holo, holoMat, ringMat, ring, light, collider: { radius: 1.6 } };
    return g;
  }

  // ---------- model: speeder bike --------------------------------
  function buildSpeeder(faction) {
    const g = new THREE.Group();
    const F = CONFIG.factions[faction];
    const body = mat('speeder_body_' + faction, {
      color: faction === 'coalition' ? 0xc89058 : 0x8a929c,
      roughness: 0.45, metalness: 0.4, map: textures.hull,
    });
    const dark = gunMat();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 2.6), body);
    hull.position.y = 0.95;
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 6), body);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.95, -1.9);
    const nose2 = nose.clone(); nose2.position.x = 0.22;
    nose.position.x = -0.22;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.8), dark);
    seat.position.set(0, 1.18, 0.45);
    const steer = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.1), dark);
    steer.position.set(0, 1.3, -0.7);
    const skidF = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
    skidF.position.set(0, 0.55, -0.9);
    const skidB = skidF.clone(); skidB.position.z = 0.9;
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8),
      emissiveMat('speeder_engine_' + faction, F.color, 2.6));
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, 0.95, 1.45);
    g.add(hull, nose, nose2, seat, steer, skidF, skidB, engine);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.userData.muzzles = [new THREE.Vector3(-0.22, 0.95, -2.6), new THREE.Vector3(0.22, 0.95, -2.6)];
    return g;
  }

  // ---------- model: turret ---------------------------------------
  function buildTurret() {
    const g = new THREE.Group();
    const metal = mat('turret_metal', { color: 0xb4bcc6, roughness: 0.46, metalness: 0.45, map: textures.hull });
    const dark = gunMat();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.5, 10), metal);
    base.position.y = 0.25;
    const pivot = new THREE.Group();          // yaw
    pivot.position.y = 0.85;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), metal);
    const gunGroup = new THREE.Group();        // pitch
    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8), dark);
    barrelL.rotation.x = Math.PI / 2;
    barrelL.position.set(-0.2, 0.1, -1.3);
    const barrelR = barrelL.clone(); barrelR.position.x = 0.2;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.12), metal);
    shield.position.set(0, 0.25, -0.4);
    gunGroup.add(barrelL, barrelR, shield);
    pivot.add(pod, gunGroup);
    g.add(base, pivot);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData = {
      pivot, gunGroup, collider: { radius: 1.2 },
      muzzles: [new THREE.Vector3(-0.2, 0.1, -2.55), new THREE.Vector3(0.2, 0.1, -2.55)],
    };
    return g;
  }

  // ---------- model: starfighter ----------------------------------
  function buildStarfighter(faction) {
    const g = new THREE.Group();
    const F = CONFIG.factions[faction];
    const body = mat('fighter_body_' + faction, {
      color: faction === 'coalition' ? 0xe2d2ac : 0xb4bac4,
      roughness: 0.42, metalness: 0.42, map: textures.hull,
    });
    const dark = gunMat();
    // fuselage
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 6.4, 10), body);
    fus.rotation.x = Math.PI / 2;
    fus.position.y = 1.1;
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), visorMat(faction));
    cockpit.scale.set(0.8, 0.7, 1.4);
    cockpit.position.set(0, 1.55, -0.6);
    // wings (X-ish for coalition, flat panels for dominion)
    const wingGeo = new THREE.BoxGeometry(4.6, 0.1, 1.5);
    const wTop = new THREE.Mesh(wingGeo, body);
    const wBot = new THREE.Mesh(wingGeo, body);
    if (faction === 'coalition') {
      wTop.position.set(0, 1.45, 1.2); wTop.rotation.z = 0.16;
      wBot.position.set(0, 0.75, 1.2); wBot.rotation.z = -0.16;
    } else {
      wTop.position.set(0, 1.1, 0.6); wTop.rotation.z = Math.PI / 2; wTop.scale.set(0.8, 1, 1.4); wTop.position.x = -1.4;
      wBot.position.set(1.4, 1.1, 0.6); wBot.rotation.z = Math.PI / 2; wBot.scale.set(0.8, 1, 1.4);
    }
    // engines
    const engL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 8),
      emissiveMat('fighter_engine_' + faction, F.color, 3.2));
    engL.rotation.x = Math.PI / 2;
    engL.position.set(-0.6, 1.1, 3.1);
    const engR = engL.clone(); engR.position.x = 0.6;
    // cannons
    const canL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), dark);
    canL.rotation.x = Math.PI / 2;
    canL.position.set(-2.1, 1.1, -0.8);
    const canR = canL.clone(); canR.position.x = 2.1;
    g.add(fus, cockpit, wTop, wBot, engL, engR, canL, canR);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.userData.muzzles = [new THREE.Vector3(-2.1, 1.1, -1.8), new THREE.Vector3(2.1, 1.1, -1.8)];
    return g;
  }

  // ---------- model: capital ship (space layer) --------------------
  function buildCapitalShip() {
    const g = new THREE.Group();
    const m = mat('cap_hull', { color: 0xaab0ba, roughness: 0.5, metalness: 0.5, map: textures.hull });
    const dark = mat('cap_dark', { color: 0x6c747e, roughness: 0.55, metalness: 0.45, map: textures.darkHull });
    // wedge hull
    const hullGeo = new THREE.CylinderGeometry(3, 26, 110, 4, 1);
    const hull = new THREE.Mesh(hullGeo, m);
    hull.rotation.x = Math.PI / 2;
    hull.scale.y = 1;
    hull.scale.z = 0.28;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), dark);
    bridge.position.set(0, 9, 38);
    const towerL = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), m);
    towerL.position.set(-7, 14, 38);
    const towerR = towerL.clone(); towerR.position.x = 7;
    const engGlow = emissiveMat('cap_engine', 0x66aaff, 3.0);
    for (let i = -1; i <= 1; i++) {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 3, 10), engGlow);
      e.rotation.x = Math.PI / 2;
      e.position.set(i * 7, 0, 56);
      g.add(e);
    }
    g.add(hull, bridge, towerL, towerR);
    // shield generators (destructible targets) — glowing spheres
    const gens = [];
    const genPositions = [
      new THREE.Vector3(-7, 16.6, 38), new THREE.Vector3(7, 16.6, 38),
      new THREE.Vector3(-12, 4, -10), new THREE.Vector3(12, 4, -10),
    ];
    for (const p of genPositions) {
      const gen = new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 10),
        new THREE.MeshStandardMaterial({
          color: 0x111111, emissive: 0x33ddff, emissiveIntensity: 2.6, roughness: 0.3,
        }));
      gen.position.copy(p);
      gen.userData.isGenerator = true;
      g.add(gen);
      gens.push(gen);
    }
    g.userData.generators = gens;
    return g;
  }

  // ---------- instanced ground scatter geometries ----------------
  function stoneGeometry() {
    const geo = new THREE.IcosahedronGeometry(0.22, 0);
    const rng = mulberry32(77);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 0.7 + rng() * 0.6;
      pos.setXYZ(i, v.x * n, v.y * n * 0.55, v.z * n);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function shrubGeometry() {
    // two crossed planes merged into one non-indexed geometry (1 draw call when instanced)
    const a = new THREE.PlaneGeometry(1.1, 1.1).toNonIndexed();
    const b = new THREE.PlaneGeometry(1.1, 1.1).toNonIndexed();
    b.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const aa = a.attributes[name], bb = b.attributes[name];
      const arr = new Float32Array(aa.array.length + bb.array.length);
      arr.set(aa.array, 0);
      arr.set(bb.array, aa.array.length);
      merged.setAttribute(name, new THREE.BufferAttribute(arr, aa.itemSize));
    }
    merged.translate(0, 0.5, 0);
    return merged;
  }

  function stoneMaterial() {
    return mat('scatter_stone', {
      color: 0xb8a285, roughness: 0.95, metalness: 0.02, map: textures.rock,
    });
  }

  function shrubMaterial() {
    const key = 'scatter_shrub';
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      map: textures.shrub, transparent: true, alphaTest: 0.4,
      side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
    });
    matCache.set(key, m);
    return m;
  }

  return {
    buildTextures, textures, mulberry32,
    buildTrooper, buildBlaster, buildViewModel,
    buildVaporator, buildRock, buildBarricade, buildBunker, buildWallSegment, buildCrashedShip,
    buildCommandPost, buildSpeeder, buildTurret, buildStarfighter, buildCapitalShip,
    stoneGeometry, shrubGeometry, stoneMaterial, shrubMaterial,
    mat, emissiveMat,
  };
})();
