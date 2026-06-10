// =============================================================
// World: terrain heightfield + splat shader, sky, props,
// colliders, waypoint graph, ambient particles
// =============================================================
'use strict';

const World = (() => {
  const TERRAIN_SIZE = 980;          // visual terrain (bigger than play area)
  const GRID = 240;                  // heightfield resolution
  const PLAY_HALF = CONFIG.world.size / 2;

  let scene;
  const heights = new Float32Array((GRID + 1) * (GRID + 1));
  const colliders = { circles: [], boxes: [] };
  const waypoints = [];              // { x, z, edges: [indices] }
  let skyDome, starField, moons = [];
  let dustPoints, dustVel;

  // ---------- deterministic 2D value noise ---------------------
  function hash2(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263 + CONFIG.world.seed * 144665) | 0;
    h = (h ^ (h >> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >> 16)) >>> 0;
    return h / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = smooth(x - ix), fz = smooth(z - iz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  function fbm(x, z) {
    let v = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      v += vnoise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.48; freq *= 2.13;
    }
    return v / norm;
  }

  function rawHeight(x, z) {
    // long dunes + medium detail
    let h = fbm(x * 0.0055 + 31, z * 0.0055 + 7) * CONFIG.world.heightScale;
    h += fbm(x * 0.021 + 99, z * 0.021 + 55) * 2.2;
    // gentle rise far from centre (bowl) keeps battle in a valley
    const d = Math.sqrt(x * x + z * z);
    h += Math.max(0, d - 260) * 0.16;
    return h;
  }

  // flatten spots: [{x, z, r, h}]
  const flatSpots = [];

  function computeHeights() {
    // posts get flattened pads
    for (const p of CONFIG.posts) {
      flatSpots.push({ x: p.x, z: p.z, r: p.radius + 12, h: rawHeight(p.x, p.z) });
    }
    // central compound plaza
    flatSpots.push({ x: 0, z: -15, r: 42, h: rawHeight(0, -15) });

    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const x = (i / GRID - 0.5) * TERRAIN_SIZE;
        const z = (j / GRID - 0.5) * TERRAIN_SIZE;
        let h = rawHeight(x, z);
        for (const f of flatSpots) {
          const d = Math.hypot(x - f.x, z - f.z);
          if (d < f.r) {
            const t = smooth(Math.min(1, Math.max(0, (d - f.r * 0.55) / (f.r * 0.45))));
            h = f.h * (1 - t) + h * t;
          }
        }
        heights[j * (GRID + 1) + i] = h;
      }
    }
  }

  function getGroundHeight(x, z) {
    const fx = (x / TERRAIN_SIZE + 0.5) * GRID;
    const fz = (z / TERRAIN_SIZE + 0.5) * GRID;
    const i = Math.max(0, Math.min(GRID - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(GRID - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const W = GRID + 1;
    const a = heights[j * W + i], b = heights[j * W + i + 1];
    const c = heights[(j + 1) * W + i], d = heights[(j + 1) * W + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // ---------- terrain mesh with splat shader --------------------
  function buildTerrain() {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const W = GRID + 1;

    // path darkening between linked posts
    const links = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['A', 'C'], ['C', 'E']];
    const segs = links.map(([a, b]) => {
      const pa = CONFIG.posts.find(p => p.id === a);
      const pb = CONFIG.posts.find(p => p.id === b);
      return [pa.x, pa.z, pb.x, pb.z];
    });
    function pathFactor(x, z) {
      let best = 1e9;
      for (const [ax, az, bx, bz] of segs) {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        let t = ((x - ax) * dx + (z - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = ax + dx * t, pz = az + dz * t;
        best = Math.min(best, Math.hypot(x - px, z - pz));
      }
      return 1 - smooth(Math.min(1, Math.max(0, (best - 2.5) / 5)));
    }

    const aPath = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const i = k % W, j = (k / W) | 0;
      pos.setY(k, heights[j * W + i]);
      const x = pos.getX(k), z = pos.getZ(k);
      aPath[k] = pathFactor(x, z);
    }
    geo.setAttribute('aPath', new THREE.BufferAttribute(aPath, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: Assets.textures.sand,
      normalMap: Assets.textures.sandNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.94,
      metalness: 0.0,
      color: 0xffffff,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.rockMap = { value: Assets.textures.rock };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aPath;
          varying float vSlope;
          varying float vPath;
          varying vec3 vWPos;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSlope = 1.0 - normal.y;
          vPath = aPath;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D rockMap;
          varying float vSlope;
          varying float vPath;
          varying vec3 vWPos;`)
        .replace('#include <map_fragment>', `
          vec4 sandCol = texture2D(map, vUv);
          vec4 rockCol = texture2D(rockMap, vUv * 6.0);
          float rockF = smoothstep(0.14, 0.34, vSlope);
          rockF += smoothstep(16.0, 30.0, vWPos.y) * 0.5;
          rockF = clamp(rockF, 0.0, 1.0);
          vec4 sampledDiffuseColor = mix(sandCol, rockCol, rockF);
          // compacted darker path
          sampledDiffuseColor.rgb *= mix(1.0, 0.8, vPath);
          diffuseColor *= sampledDiffuseColor;`);
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
  }

  // ---------- sky ------------------------------------------------
  function buildSky() {
    const geo = new THREE.SphereGeometry(1600, 32, 18);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSpace: { value: 0 },           // 0 = ground sky, 1 = space
        uSunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.35).normalize() },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uSpace;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        // hash for stars
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          // day sky gradient
          vec3 zenith = vec3(0.30, 0.46, 0.78);
          vec3 mid = vec3(0.66, 0.62, 0.62);
          vec3 horizon = vec3(0.96, 0.72, 0.46);
          vec3 ground = vec3(0.55, 0.42, 0.28);
          vec3 day = h > 0.32 ? mix(mid, zenith, smoothstep(0.32, 0.9, h))
                   : h > 0.0  ? mix(horizon, mid, smoothstep(0.0, 0.32, h))
                   : mix(horizon, ground, smoothstep(0.0, -0.2, h));
          // sun glow
          float sunD = max(0.0, dot(vDir, uSunDir));
          day += vec3(1.0, 0.78, 0.45) * pow(sunD, 220.0) * 1.6;
          day += vec3(1.0, 0.62, 0.30) * pow(sunD, 14.0) * 0.32;
          // space sky
          vec3 space = mix(vec3(0.012, 0.014, 0.03), vec3(0.0, 0.0, 0.004), smoothstep(-0.4, 0.8, h));
          vec3 sd = floor(vDir * 290.0);
          float star = step(0.9965, hash(sd));
          float tw = 0.6 + 0.4 * hash(sd + 31.0);
          space += vec3(star * tw);
          // faint nebula band
          float band = exp(-abs(vDir.y + 0.18) * 4.5);
          space += vec3(0.10, 0.05, 0.13) * band;
          vec3 col = mix(day, space, uSpace);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    skyDome = new THREE.Mesh(geo, mat);
    skyDome.name = 'sky';
    scene.add(skyDome);

    // twin moons
    const moonMat1 = new THREE.SpriteMaterial({
      map: Assets.textures.glow, color: 0xd8c8b8, transparent: true, opacity: 0.7,
      fog: false, depthWrite: false,
    });
    const moon1 = new THREE.Sprite(moonMat1);
    moon1.position.set(900, 380, -1100);
    moon1.scale.setScalar(130);
    const moon2 = new THREE.Sprite(moonMat1.clone());
    moon2.material.opacity = 0.45;
    moon2.position.set(1150, 300, -900);
    moon2.scale.setScalar(70);
    scene.add(moon1, moon2);
    moons = [moon1, moon2];

    // sun lens flare
    const flare = new THREE.Lensflare();
    flare.addElement(new THREE.LensflareElement(Assets.textures.flareMain, 420, 0));
    flare.addElement(new THREE.LensflareElement(Assets.textures.flareRing, 90, 0.32));
    flare.addElement(new THREE.LensflareElement(Assets.textures.flareRing, 140, 0.55));
    flare.addElement(new THREE.LensflareElement(Assets.textures.flareRing, 60, 0.8));
    const flareLight = new THREE.PointLight(0xffffff, 0.0, 1);
    flareLight.position.set(-820, 920, 530);
    flareLight.add(flare);
    scene.add(flareLight);
  }

  function setSpaceBlend(t) {
    if (skyDome) skyDome.material.uniforms.uSpace.value = t;
    if (scene.fog) {
      scene.fog.near = CONFIG.world.fogNear + t * 2000;
      scene.fog.far = CONFIG.world.fogFar + t * 4000;
    }
    for (const m of moons) m.material.opacity = (m === moons[0] ? 0.7 : 0.45) * (1 - t);
    if (Graphics.hemi) Graphics.hemi.intensity = 0.55 * (1 - t * 0.75);
    if (Graphics.sun) Graphics.sun.intensity = 1.9 - t * 0.8;
  }

  // ---------- props & colliders -----------------------------------
  function addProp(obj, x, z, rotY = 0) {
    const y = getGroundHeight(x, z);
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    scene.add(obj);
    const col = obj.userData.collider;
    if (col) {
      if (col.radius) colliders.circles.push({ x, z, r: col.radius, topY: y + (col.height || 5) });
      else if (col.box) colliders.boxes.push({ x, z, hx: col.box.hx, hz: col.box.hz, rot: rotY, topY: y + 4.6 });
    }
    return obj;
  }

  function buildProps() {
    const rng = Assets.mulberry32(CONFIG.world.seed);

    // --- central compound: walls forming a broken square around post C
    const C = CONFIG.posts.find(p => p.id === 'C');
    const wallDefs = [
      { dx: -20, dz: 0, rot: Math.PI / 2, len: 22 },
      { dx: 20, dz: 0, rot: Math.PI / 2, len: 22 },
      { dx: -9, dz: -19, rot: 0, len: 16 },
      { dx: 11, dz: 19, rot: 0, len: 16 },
    ];
    for (const w of wallDefs) {
      addProp(Assets.buildWallSegment(w.len), C.x + w.dx, C.z + w.dz, w.rot);
    }
    addProp(Assets.buildBunker(), C.x - 30, C.z + 26, 0.6);

    // --- vaporator farm at post B
    const B = CONFIG.posts.find(p => p.id === 'B');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const r = 14 + (i % 2) * 9;
      addProp(Assets.buildVaporator(), B.x + Math.cos(a) * r, B.z + Math.sin(a) * r);
    }

    // --- crash site at post D
    const D = CONFIG.posts.find(p => p.id === 'D');
    addProp(Assets.buildCrashedShip(), D.x + 12, D.z - 6, 2.4);
    for (let i = 0; i < 4; i++) {
      addProp(Assets.buildRock(900 + i, 1.2 + rng() * 1.4),
        D.x - 14 + rng() * 30, D.z + 10 + rng() * 14);
    }

    // --- home bases: bunkers + walls
    const A = CONFIG.posts.find(p => p.id === 'A');
    const E = CONFIG.posts.find(p => p.id === 'E');
    addProp(Assets.buildBunker(), A.x - 12, A.z - 14, 0.4);
    addProp(Assets.buildWallSegment(14), A.x + 16, A.z + 4, Math.PI / 2.2);
    addProp(Assets.buildBunker(), E.x + 12, E.z - 14, -0.5);
    addProp(Assets.buildWallSegment(14), E.x - 16, E.z + 4, -Math.PI / 2.2);

    // --- barricades near every post (cover)
    for (const p of CONFIG.posts) {
      const n = p.home ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const r = p.radius * 0.75 + rng() * 5;
        addProp(Assets.buildBarricade(), p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, rng() * Math.PI);
      }
    }

    // --- scattered rocks across play area
    for (let i = 0; i < 60; i++) {
      const x = (rng() - 0.5) * CONFIG.world.size * 1.35;
      const z = (rng() - 0.5) * CONFIG.world.size * 1.35;
      let tooClose = false;
      for (const p of CONFIG.posts) {
        if (Math.hypot(x - p.x, z - p.z) < p.radius + 8) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const s = 0.7 + rng() * 2.6;
      addProp(Assets.buildRock(i * 7 + 3, s), x, z, rng() * Math.PI * 2);
    }

    // distant mesa rocks for horizon interest (no colliders)
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = 330 + rng() * 120;
      const rock = Assets.buildRock(5000 + i, 14 + rng() * 22);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      rock.position.set(x, getGroundHeight(x, z), z);
      rock.userData.collider = null;
      scene.add(rock);
    }
  }

  // ---------- collision -------------------------------------------
  // resolve a circle (x,z,r) against props; returns corrected {x,z}
  function resolveCollision(x, z, r, y = 0) {
    for (const c of colliders.circles) {
      if (y > c.topY) continue;
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-5) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    for (const b of colliders.boxes) {
      if (y > b.topY) continue;
      // transform into box space
      const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
      let lx = (x - b.x) * cos - (z - b.z) * sin;
      let lz = (x - b.x) * sin + (z - b.z) * cos;
      const cx = Math.max(-b.hx, Math.min(b.hx, lx));
      const cz = Math.max(-b.hz, Math.min(b.hz, lz));
      const dx = lx - cx, dz = lz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        let px, pz;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * r; pz = cz + (dz / d) * r;
        } else {
          // inside the box: push out along smallest axis
          const ox = b.hx - Math.abs(lx), oz = b.hz - Math.abs(lz);
          if (ox < oz) px = (lx > 0 ? b.hx + r : -b.hx - r), pz = lz;
          else pz = (lz > 0 ? b.hz + r : -b.hz - r), px = lx;
        }
        const c2 = Math.cos(b.rot), s2 = Math.sin(b.rot);
        x = b.x + px * c2 - pz * s2;
        z = b.z + px * s2 + pz * c2;
      }
    }
    // play-area bounds
    const lim = PLAY_HALF + 25;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x, z };
  }

  // 2D segment vs prop test (for LOS / bullets). Returns t in [0,1] or -1
  function segmentHitProp(ax, az, bx, bz, ay = 1.5, by = 1.5) {
    let bestT = -1;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) return -1;
    for (const c of colliders.circles) {
      // quadratic: |a + t*d - c| = r
      const fx = ax - c.x, fz = az - c.z;
      const A = len2, Bq = 2 * (fx * dx + fz * dz), Cq = fx * fx + fz * fz - c.r * c.r;
      const disc = Bq * Bq - 4 * A * Cq;
      if (disc < 0) continue;
      const t = (-Bq - Math.sqrt(disc)) / (2 * A);
      if (t > 0.001 && t < 1) {
        const yAt = ay + (by - ay) * t;
        if (yAt < c.topY && (bestT < 0 || t < bestT)) bestT = t;
      }
    }
    for (const b of colliders.boxes) {
      // sampled test (cheap, robust for short segments)
      const steps = Math.ceil(Math.sqrt(len2) / 1.2);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = ax + dx * t, z = az + dz * t;
        const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
        const lx = (x - b.x) * cos - (z - b.z) * sin;
        const lz = (x - b.x) * sin + (z - b.z) * cos;
        if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz) {
          const yAt = ay + (by - ay) * t;
          if (yAt < b.topY) { if (bestT < 0 || t < bestT) bestT = t; break; }
        }
      }
    }
    return bestT;
  }

  // terrain blocking for a 3D segment (samples ground height)
  function segmentHitTerrain(a, b) {
    const steps = Math.ceil(a.distanceTo(b) / 2.5);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      if (y < getGroundHeight(x, z)) return t;
    }
    return -1;
  }

  function hasLineOfSight(a, b) {
    if (segmentHitProp(a.x, a.z, b.x, b.z, a.y, b.y) >= 0) return false;
    if (segmentHitTerrain(a, b) >= 0) return false;
    return true;
  }

  // ---------- waypoint graph ---------------------------------------
  function buildWaypoints() {
    const STEP = 26;
    const half = PLAY_HALF + 10;
    const idxAt = new Map();
    for (let z = -half; z <= half; z += STEP) {
      for (let x = -half; x <= half; x += STEP) {
        // skip nodes inside colliders
        let blocked = false;
        for (const c of colliders.circles) {
          if (Math.hypot(x - c.x, z - c.z) < c.r + 1.2) { blocked = true; break; }
        }
        if (blocked) continue;
        idxAt.set(`${x},${z}`, waypoints.length);
        waypoints.push({ x, z, edges: [] });
      }
    }
    // also add exact post positions as nodes
    for (const p of CONFIG.posts) {
      idxAt.set(`P${p.id}`, waypoints.length);
      waypoints.push({ x: p.x, z: p.z, edges: [], post: p.id });
    }
    // connect neighbours with LOS
    for (let i = 0; i < waypoints.length; i++) {
      for (let j = i + 1; j < waypoints.length; j++) {
        const a = waypoints[i], b = waypoints[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > STEP * 1.6) continue;
        if (segmentHitProp(a.x, a.z, b.x, b.z, 1.2, 1.2) >= 0) continue;
        a.edges.push(j);
        b.edges.push(i);
      }
    }
  }

  function nearestWaypoint(x, z) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < waypoints.length; i++) {
      const d = Math.hypot(waypoints[i].x - x, waypoints[i].z - z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // A* over the waypoint graph; returns array of {x, z}
  function findPath(sx, sz, tx, tz) {
    const start = nearestWaypoint(sx, sz);
    const goal = nearestWaypoint(tx, tz);
    if (start < 0 || goal < 0) return [{ x: tx, z: tz }];
    if (start === goal) return [{ x: tx, z: tz }];
    const open = [start];
    const came = new Map();
    const gScore = new Map([[start, 0]]);
    const fScore = new Map([[start, 0]]);
    const closed = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if ((fScore.get(open[i]) ?? 1e9) < (fScore.get(open[bi]) ?? 1e9)) bi = i;
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) {
        const path = [];
        let n = goal;
        while (n !== undefined && n !== start) {
          path.unshift({ x: waypoints[n].x, z: waypoints[n].z });
          n = came.get(n);
        }
        path.push({ x: tx, z: tz });
        return path;
      }
      closed.add(cur);
      const wc = waypoints[cur];
      for (const nb of wc.edges) {
        if (closed.has(nb)) continue;
        const wn = waypoints[nb];
        const tentative = (gScore.get(cur) ?? 1e9) + Math.hypot(wn.x - wc.x, wn.z - wc.z);
        if (tentative < (gScore.get(nb) ?? 1e9)) {
          came.set(nb, cur);
          gScore.set(nb, tentative);
          fScore.set(nb, tentative + Math.hypot(wn.x - tx, wn.z - tz));
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return [{ x: tx, z: tz }];
  }

  // ---------- ambient dust ------------------------------------------
  function buildDust() {
    const N = 360;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(N * 3);
    dustVel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      posArr[i * 3] = (Math.random() - 0.5) * 90;
      posArr[i * 3 + 1] = Math.random() * 14;
      posArr[i * 3 + 2] = (Math.random() - 0.5) * 90;
      dustVel[i * 3] = 1.6 + Math.random() * 2.2;       // wind +x
      dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      map: Assets.textures.glow, color: 0xd8b888, size: 0.16,
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.NormalBlending, sizeAttenuation: true,
    });
    dustPoints = new THREE.Points(geo, mat);
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);
  }

  const _dustCenter = new THREE.Vector3();
  function updateDust(dt, center) {
    if (!dustPoints) return;
    _dustCenter.copy(center);
    const pos = dustPoints.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += dustVel[i] * dt;
      arr[i + 1] += dustVel[i + 1] * dt;
      arr[i + 2] += dustVel[i + 2] * dt;
      // wrap around camera
      if (arr[i] - _dustCenter.x > 45) arr[i] -= 90;
      if (arr[i] - _dustCenter.x < -45) arr[i] += 90;
      if (arr[i + 2] - _dustCenter.z > 45) arr[i + 2] -= 90;
      if (arr[i + 2] - _dustCenter.z < -45) arr[i + 2] += 90;
      const gy = getGroundHeight(arr[i], arr[i + 2]);
      if (arr[i + 1] < gy + 0.2) arr[i + 1] = gy + 0.2 + Math.random() * 10;
      if (arr[i + 1] > gy + 16) arr[i + 1] = gy + 0.3;
    }
    pos.needsUpdate = true;
  }

  // ---------- build all ----------------------------------------------
  function build(sc) {
    scene = sc;
    scene.fog = new THREE.Fog(CONFIG.world.fogColor, CONFIG.world.fogNear, CONFIG.world.fogFar);
    computeHeights();
    buildTerrain();
    buildSky();
    buildProps();
    buildWaypoints();
    buildDust();
  }

  return {
    build, getGroundHeight, resolveCollision, segmentHitProp, segmentHitTerrain,
    hasLineOfSight, findPath, nearestWaypoint, updateDust, setSpaceBlend,
    colliders, waypoints,
    get PLAY_HALF() { return PLAY_HALF; },
  };
})();
