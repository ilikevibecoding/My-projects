// Exterior space: parallax starfield, planets with atmosphere rim, nebulae, sun.
import * as THREE from 'three';
import { makeStarSprite, makeNebulaSprite, makePlanetMap, makeRockyMap } from './textures.js';

// Sun sits behind-starboard-high so bodies ahead/port show lit faces to the ship.
const SUN_DIR = new THREE.Vector3(0.55, 0.28, 0.79).normalize();
export { SUN_DIR };

function planetMaterial(map, rimColor, rimStrength = 1.4) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      sunDir: { value: SUN_DIR.clone() },
      rimColor: { value: new THREE.Color(rimColor) },
      rimStrength: { value: rimStrength },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec3 sunDir;
      uniform vec3 rimColor;
      uniform float rimStrength;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vPosW);
        vec3 tex = texture2D(map, vUv).rgb;
        float d = clamp(dot(n, sunDir) * 1.15 + 0.18, 0.0, 1.0);
        d = pow(d, 0.8);
        vec3 col = tex * (d * 1.35 + 0.05);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
        col += rimColor * fres * rimStrength * (d * 0.85 + 0.15);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

function atmosphereMaterial(color, intensity = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      atmColor: { value: new THREE.Color(color) },
      sunDir: { value: SUN_DIR.clone() },
      intensity: { value: intensity },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 atmColor;
      uniform vec3 sunDir;
      uniform float intensity;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vPosW);
        float fres = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
        float a = pow(fres, 3.4);
        float lit = clamp(dot(n, sunDir) * 1.2 + 0.25, 0.05, 1.0);
        vec3 col = atmColor * a * intensity * lit;
        gl_FragColor = vec4(col, a * lit);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

export function buildSpace(scene, rand) {
  const root = new THREE.Group();
  const starSprite = makeStarSprite();

  // -------- parallax starfield: 3 drifting layers, wrap on Z
  const layers = [];
  const layerDefs = [
    { count: 1300, box: 700, size: 3.4, speed: 30, opacity: 1.0 },
    { count: 700, box: 900, size: 2.4, speed: 15, opacity: 0.85 },
    { count: 280, box: 1200, size: 1.7, speed: 7, opacity: 0.7 },
  ];
  for (const def of layerDefs) {
    const pos = new Float32Array(def.count * 3);
    const col = new Float32Array(def.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < def.count; i++) {
      pos[i * 3] = (rand() - 0.5) * def.box * 2;
      pos[i * 3 + 1] = (rand() - 0.5) * def.box * 2;
      pos[i * 3 + 2] = (rand() - 0.5) * def.box * 2;
      const t = rand();
      if (t < 0.12) c.setHSL(0.07, 0.7, 0.75);       // warm orange star
      else if (t < 0.3) c.setHSL(0.55, 0.5, 0.8);    // blue-white
      else c.setHSL(0.12, 0.08, 0.62 + rand() * 0.3); // white
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: def.size, map: starSprite, vertexColors: true,
      transparent: true, opacity: def.opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    root.add(pts);
    layers.push({ pts, def });
  }

  // -------- speed streaks close to the hull (sell motion)
  const streakCount = 90;
  const streakPos = new Float32Array(streakCount * 2 * 3);
  for (let i = 0; i < streakCount; i++) {
    const x = (rand() - 0.5) * 120;
    const y = (rand() - 0.5) * 80;
    const z = (rand() - 0.5) * 300;
    const len = 4 + rand() * 9;
    streakPos[i * 6] = x; streakPos[i * 6 + 1] = y; streakPos[i * 6 + 2] = z;
    streakPos[i * 6 + 3] = x; streakPos[i * 6 + 4] = y; streakPos[i * 6 + 5] = z + len;
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: 0xbfd8e8, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
  });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.frustumCulled = false;
  root.add(streaks);

  // -------- gas giant abeam port, slides past the left porthole
  const gasMap = makePlanetMap(rand, { hueA: 14, hueB: 38 });
  const gas = new THREE.Mesh(
    new THREE.SphereGeometry(260, 48, 32),
    planetMaterial(gasMap, 0xffb46a, 2.4)
  );
  const gasAtm = new THREE.Mesh(
    new THREE.SphereGeometry(260 * 1.045, 48, 32),
    atmosphereMaterial(0xff9a50, 2.2)
  );
  const gasGroup = new THREE.Group();
  gasGroup.add(gas, gasAtm);
  root.add(gasGroup);

  // -------- rocky moon ahead, visible through the cockpit viewport
  const rockMap = makeRockyMap(rand);
  const rock = new THREE.Mesh(
    new THREE.SphereGeometry(150, 40, 28),
    planetMaterial(rockMap, 0x8fd8e8, 1.5)
  );
  const rockAtm = new THREE.Mesh(
    new THREE.SphereGeometry(150 * 1.05, 40, 28),
    atmosphereMaterial(0x6fc8e8, 1.5)
  );
  const rockGroup = new THREE.Group();
  rockGroup.add(rock, rockAtm);
  root.add(rockGroup);

  // -------- ringed crescent planet far starboard (rim-lit silhouette)
  const ringedMat = planetMaterial(makePlanetMap(rand, { hueA: 200, hueB: 230, size: 512 }), 0x9fd8f0, 2.6);
  const ringed = new THREE.Mesh(new THREE.SphereGeometry(170, 40, 28), ringedMat);
  const ringedAtm = new THREE.Mesh(
    new THREE.SphereGeometry(170 * 1.05, 40, 28),
    atmosphereMaterial(0x7fc8e8, 2.0)
  );
  // ring disc
  const ringGeo = new THREE.RingGeometry(220, 360, 64);
  {
    // radial UV for ring shading
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - 220) / 140, 0.5);
    }
  }
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x8fb8c8, transparent: true, opacity: 0.30,
    side: THREE.DoubleSide, fog: false, depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2.25;
  ringMesh.rotation.y = 0.35;
  const ringedGroup = new THREE.Group();
  ringedGroup.add(ringed, ringedAtm, ringMesh);
  root.add(ringedGroup);

  // -------- nebula billboards
  const nebDefs = [
    { col: [[14, 75, 55], [28, 80, 62]], pos: [900, 250, -1600], scale: 1500 },
    { col: [[180, 55, 45], [200, 60, 55]], pos: [-1400, -150, -900], scale: 1300 },
    { col: [[185, 60, 50], [16, 70, 55]], pos: [1500, 80, 600], scale: 1500 },
    { col: [[210, 45, 40], [180, 50, 45]], pos: [-600, 380, 1500], scale: 1100 },
  ];
  const nebulas = [];
  for (const nd of nebDefs) {
    const sm = new THREE.SpriteMaterial({
      map: makeNebulaSprite(rand, nd.col[0], nd.col[1]),
      transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const sp = new THREE.Sprite(sm);
    sp.position.set(...nd.pos);
    sp.scale.setScalar(nd.scale);
    root.add(sp);
    nebulas.push(sp);
  }

  // -------- distant sun glow
  {
    const sunMat = new THREE.SpriteMaterial({
      map: makeStarSprite(), color: 0xfff2d8, transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const sun = new THREE.Sprite(sunMat);
    sun.position.copy(SUN_DIR).multiplyScalar(2400);
    sun.scale.setScalar(260);
    root.add(sun);
  }

  scene.add(root);

  // animation state
  let t0 = 0;
  function update(dt, t) {
    t0 = t;
    // star drift (ship flying toward -Z, stars stream toward +Z)
    for (const { pts, def } of layers) {
      const arr = pts.geometry.attributes.position.array;
      const lim = def.box;
      for (let i = 2; i < arr.length; i += 3) {
        arr[i] += def.speed * dt;
        if (arr[i] > lim) arr[i] -= lim * 2;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }
    {
      const arr = streaks.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 2] += 150 * dt;
        arr[i + 5] += 150 * dt;
        if (arr[i + 2] > 180) { arr[i + 2] -= 360; arr[i + 5] -= 360; }
      }
      streaks.geometry.attributes.position.needsUpdate = true;
    }

    // gas giant: slow orbit, abeam port at t=0, sliding aft past the left
    // porthole over ~80 s
    {
      const ang = Math.PI + t * (Math.PI * 2 / 340);
      const R = 980;
      gasGroup.position.set(Math.cos(ang) * R, -120, Math.sin(ang) * R + 40);
      gas.rotation.y = t * 0.01;
    }
    // rocky moon ahead, drifting starboard slowly across the viewport
    {
      const ang = Math.PI * 1.46 + t * (Math.PI * 2 / 480);
      const R = 1000;
      rockGroup.position.set(Math.cos(ang) * R, 55, Math.sin(ang) * R - 120);
      rock.rotation.y = t * 0.02;
    }
    // ringed crescent: far starboard, slow aft drift
    ringedGroup.position.set(1550, 90, -380 + t * 1.4);
  }

  return { root, update };
}
