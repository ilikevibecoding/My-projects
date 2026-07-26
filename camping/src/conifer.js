// ---------------------------------------------------------------------------
// Conifer construction.
//
// Replaces the stacked-cone pines with real structure:
//   * a tapered trunk that keeps growing between the whorls,
//   * whorls of actual branch geometry, so a tree you stand next to reads as a
//     three-dimensional object rather than intersecting flat cards,
//   * alpha-TESTED needle sprigs cut from a photographic atlas, which write
//     depth and cost far less than blended transparency,
//   * three levels of detail, the furthest being a two-quad impostor rendered
//     from the detailed tree itself so the treeline matches the near trees.
//
// Cards carry "volume normals": each needle quad is shaded using the direction
// from the tree's core outward rather than the quad's own facing, so the canopy
// lights like a mass of foliage instead of a stack of flat billboards.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFoliageTexture, edgeDarkeningRatio } from './foliagetex.js';

/** Deterministic RNG so every build of the world is identical. */
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One needle sprig quad.
 * @param uv    atlas rect { u0, v0, u1, v1 }
 * @param w,h   world size
 * @param volumeOrigin  point the volume normal points away from
 */
function sprigCard(uv, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 1, 1);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) {
    const u = a.getX(i), v = a.getY(i);
    a.setXY(i, uv.u0 + u * (uv.u1 - uv.u0), uv.v0 + v * (uv.v1 - uv.v0));
  }
  a.needsUpdate = true;
  return g;
}

/**
 * Build one conifer.
 *
 * @param opts.detail  0 = near (full), 1 = mid (reduced)
 * @param opts.tiles   atlas tile list from conifer_needles.json
 */
export function buildConifer({ seed = 1, detail = 0, tiles, height = 8.4 } = {}) {
  const rnd = rngFrom(seed);
  const H = height;
  const woodParts = [];
  const cardParts = [];

  const RADIAL = detail === 0 ? 6 : 4;
  const WHORLS = detail === 0 ? 16 : 11;
  const PER_WHORL = detail === 0 ? 7 : 6;
  const CARDS_PER_BRANCH = detail === 0 ? 8 : 4;

  // ---- trunk: tapered, with a gentle natural lean ----
  // ~36 cm across at the base of an 8.5 m tree, tapering to a finger at the tip
  const trunk = new THREE.CylinderGeometry(0.045, 0.18, H, RADIAL, 6, true);
  trunk.translate(0, H / 2, 0);
  {
    // bark reads as stretched planks unless the texture repeats up the trunk
    const uv = trunk.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.0, uv.getY(i) * 7.0);
    uv.needsUpdate = true;
  }
  {
    const p = trunk.attributes.position;
    const leanX = (rnd() - 0.5) * 0.10;
    const leanZ = (rnd() - 0.5) * 0.10;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = y / H;
      const bend = t * t; // straight at the base, drifting near the crown
      p.setX(i, p.getX(i) + leanX * bend * H * 0.5 + Math.sin(y * 1.7) * 0.012);
      p.setZ(i, p.getZ(i) + leanZ * bend * H * 0.5 + Math.cos(y * 1.9) * 0.012);
    }
    p.needsUpdate = true;
    trunk.computeVertexNormals();
  }
  woodParts.push(trunk);

  // ---- whorls of branches ----
  const yStart = H * 0.09;
  const yEnd = H * 0.965;
  const cardNormals = []; // parallel to cardParts: the volume normal per card

  for (let w = 0; w < WHORLS; w++) {
    const f = w / (WHORLS - 1);            // 0 at the bottom whorl, 1 at the top
    const y = yStart + (yEnd - yStart) * f;
    // classic conifer profile: long low branches shortening towards a spire
    const reach = (0.26 + 1.68 * Math.pow(1 - f, 0.78)) * (0.86 + rnd() * 0.28);
    const n = Math.max(3, Math.round(PER_WHORL * (1 - f * 0.35)));
    const phase = rnd() * Math.PI * 2;

    for (let b = 0; b < n; b++) {
      const ang = phase + (b / n) * Math.PI * 2 + (rnd() - 0.5) * 0.42;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const droop = (0.10 + 0.34 * (1 - f)) * reach;   // lower branches sag more
      const tipY = y - droop;

      // Branch stick: a thin tapered prism from the trunk outwards.
      // Only the structural inner part is real geometry — the sprig textures
      // already contain their own woody stems, so modelling the whole branch
      // would triple the triangle count for detail nobody can see. Three sides
      // and one segment is plenty for something this thin.
      const len = reach;
      const stickLen = len * 0.62;
      if (reach > 0.55) {
        const stick = new THREE.CylinderGeometry(0.010, 0.026 * (0.45 + (1 - f)), stickLen, 3, 1);
        stick.translate(0, stickLen / 2, 0);
        const dir = new THREE.Vector3(dx * len, tipY - y, dz * len).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        stick.applyQuaternion(q);
        stick.translate(dx * 0.16, y, dz * 0.16);
        woodParts.push(stick);
      }

      // needle sprigs along the branch, alternating to either side of the axis
      // so each branch reads as a flat spray rather than a single card
      for (let c = 0; c < CARDS_PER_BRANCH; c++) {
        const along = CARDS_PER_BRANCH === 1
          ? 0.62
          : 0.26 + (c / (CARDS_PER_BRANCH - 1 || 1)) * 0.72;
        const lateral = (c % 2 === 0 ? 1 : -1) * (0.10 + rnd() * 0.14) * len * (1 - along * 0.5);
        const px = dx * (0.16 + len * along) - dz * lateral;
        const pz = dz * (0.16 + len * along) + dx * lateral;
        const py = y + (tipY - y) * along + (rnd() - 0.5) * 0.06;

        const tile = tiles[(w + b + c) % tiles.length];
        // a real spruce spray is 15-35 cm across; anything larger reads as a
        // giant fern rather than a conifer
        const base = (detail === 0 ? 0.60 : 1.05) * (0.62 + 0.72 * (1 - f));
        const cw = base * (0.85 + rnd() * 0.4);
        const ch = cw / Math.max(0.35, tile.aspect);

        const card = sprigCard(tile.uv, cw, ch);
        // lay the spray flat along the branch, with a little roll and yaw
        const e = new THREE.Euler(
          -Math.PI / 2 + (rnd() - 0.5) * 0.75,
          ang + (rnd() - 0.5) * 0.5,
          (rnd() - 0.5) * 0.6,
          'YXZ',
        );
        card.applyQuaternion(new THREE.Quaternion().setFromEuler(e));
        card.translate(px, py, pz);
        cardParts.push(card);
        // volume normal: away from the trunk axis at this height, biased upward
        cardNormals.push(new THREE.Vector3(dx * 0.72, 0.62, dz * 0.72).normalize());
      }
    }
  }

  // ---- crown spire: a few upright sprigs so the top is not a bare stick ----
  const spireCount = detail === 0 ? 6 : 3;
  for (let i = 0; i < spireCount; i++) {
    const tile = tiles[i % tiles.length];
    const cw = 0.30 * (0.8 + rnd() * 0.4);
    const ch = cw / Math.max(0.35, tile.aspect) * 1.35;
    const card = sprigCard(tile.uv, cw, ch);
    const ang = (i / spireCount) * Math.PI * 2 + rnd();
    card.applyQuaternion(new THREE.Quaternion().setFromEuler(
      new THREE.Euler((rnd() - 0.5) * 0.5, ang, 0, 'YXZ')));
    card.translate(Math.cos(ang) * 0.10, H * (0.955 + rnd() * 0.03), Math.sin(ang) * 0.10);
    cardParts.push(card);
    cardNormals.push(new THREE.Vector3(Math.cos(ang) * 0.3, 1, Math.sin(ang) * 0.3).normalize());
  }

  // ---- merge ----
  const wood = mergeGeometries(woodParts, false);
  wood.computeVertexNormals();

  // apply volume normals + a sway weight before merging the cards
  for (let i = 0; i < cardParts.length; i++) {
    const g = cardParts[i];
    const nrm = cardNormals[i];
    const pos = g.attributes.position;
    const nAttr = new Float32Array(pos.count * 3);
    const sway = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      nAttr[v * 3] = nrm.x; nAttr[v * 3 + 1] = nrm.y; nAttr[v * 3 + 2] = nrm.z;
      // sway grows with height and with distance from the trunk axis
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      sway[v] = Math.min(1, (py / H) * 0.75 + Math.hypot(px, pz) * 0.22);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nAttr, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  }
  // the trunk needs the attribute too if it is ever merged with cards
  const cards = mergeGeometries(cardParts, false);

  return { wood, cards, height: H, cardCount: cardParts.length };
}

/**
 * Impostor geometry: crossed quads carrying a picture of the real tree.
 * Two quads means four visible faces from any angle, which reads far better
 * than a single billboard when the camera moves along a treeline.
 */
export function buildImpostorGeometry(height, width) {
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.PlaneGeometry(width, height, 1, 1);
    g.translate(0, height / 2, 0);
    g.rotateY(i * Math.PI / 2);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  // face the light softly: normals point up and outward so impostors do not
  // flicker between bright and black as the sun moves
  const pos = merged.attributes.position;
  const n = new Float32Array(pos.count * 3);
  const sway = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const l = Math.hypot(x, z) || 1;
    n[v * 3] = (x / l) * 0.45;
    n[v * 3 + 1] = 0.89;
    n[v * 3 + 2] = (z / l) * 0.45;
    sway[v] = Math.min(1, (y / height) * 0.8);
  }
  merged.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  merged.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  return merged;
}

/**
 * Render a detailed conifer into a texture, to be used by the impostor LOD.
 * Done once at startup: the treeline then matches the trees you walk among,
 * which pre-authored impostor art can never quite manage.
 */
export function renderImpostorTexture(renderer, woodMesh, cardMesh, height, size = { w: 256, h: 512 }) {
  const rt = new THREE.WebGLRenderTarget(size.w, size.h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    // Store the bake sRGB-ENCODED. A render target defaults to no colour-space
    // conversion, so an 8-bit target ends up holding linear values: a mid-green
    // canopy becomes ~(15,48,13) and the impostor reads as a black tree. This
    // also wastes most of the 8-bit range on highlights nobody can see.
    colorSpace: THREE.SRGBColorSpace,
  });
  const scene = new THREE.Scene();
  const halfW = 2.35;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, height * 1.02, -height * 0.02, 0.1, 100);
  cam.position.set(0, 0, 20);
  cam.lookAt(0, 0, 0);
  // The impostor is re-lit by the scene when it is drawn, so the bake must be
  // close to plain albedo. A little directional light is kept so the distant
  // tree still has some internal form, but the canopy-shade boosts the live
  // materials carry would blow the bake out (they turned the trunk bright
  // orange), so the bake uses its own clean materials.
  // Bake plain ALBEDO with unlit materials. The impostor is lit by the scene
  // when it is drawn, so any lighting baked in here is applied twice — and
  // relying on lit materials means depending on three.js's physical light
  // units, where AmbientLight(1) actually yields albedo/PI and quietly produces
  // a tree half as bright as it should be.
  const bakeWoodMat = new THREE.MeshBasicMaterial({
    map: woodMesh.material.map || null,
    color: woodMesh.material.color ? woodMesh.material.color.clone() : 0xffffff,
  });
  const bakeCardMat = new THREE.MeshBasicMaterial({
    map: cardMesh.material.map,
    alphaTest: cardMesh.material.alphaTest,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const wood = new THREE.Mesh(woodMesh.geometry, bakeWoodMat);
  const cards = new THREE.Mesh(cardMesh.geometry, bakeCardMat);
  scene.add(wood, cards);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  const prevToneMapping = renderer.toneMapping;
  // The impostor is lit and tone-mapped again when it is drawn in the scene, so
  // tone-mapping the bake as well applies ACES twice and crushes the canopy.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, cam);

  // Everything outside the tree's silhouette in this target is transparent
  // BLACK. Used directly, the first bilinear or mip sample that straddles the
  // edge mixes that black into the needles and the distant trees get hard black
  // outlines. So read the bake back and run it through the same dilation and
  // coverage-preserving mip chain as the needle atlas.
  const px = new Uint8Array(size.w * size.h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size.w, size.h, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  renderer.toneMapping = prevToneMapping;

  const darkeningBefore = edgeDarkeningRatio(px, size.w, size.h);
  // mean brightness of the covered texels: a black bake shows up here
  let lumSum = 0, lumN = 0;
  for (let i = 0; i < size.w * size.h; i++) {
    if (px[i * 4 + 3] < 250) continue;
    lumSum += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    lumN++;
  }
  const bakeMeanLuma = lumN ? +(lumSum / lumN).toFixed(1) : null;
  const texture = makeFoliageTexture({
    data: px,
    width: size.w,
    height: size.h,
    alphaTest: 0.35,
    // the target is sRGB-encoded (see above), so sample it as sRGB
    colorSpace: THREE.SRGBColorSpace,
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy?.() ?? 1),
  });
  texture.flipY = false;
  const darkeningAfter = edgeDarkeningRatio(texture.mipmaps[1].data, texture.mipmaps[1].width, texture.mipmaps[1].height);

  rt.dispose();
  bakeWoodMat.dispose();
  bakeCardMat.dispose();
  return {
    texture,
    width: halfW * 2,
    height,
    diagnostics: {
      edgeDarkeningBefore: darkeningBefore,
      edgeDarkeningAfterMip1: darkeningAfter,
      bakeMeanLuma,           // 0-255; a near-zero value means a black impostor
      bakeOpaqueTexels: lumN,
    },
  };
}

// ---------------------------------------------------------------------------
// Wind + LOD materials
// ---------------------------------------------------------------------------

/**
 * Adds wind sway driven by the per-vertex `aSway` weight, with a per-instance
 * phase taken from the instance's world position so no two trees move alike.
 */
export function foliageWindMaterial(material, amplitude = 0.16, {
  ambientBoost = 3.4, translucency = 0.42,
} = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: amplitude };
    shader.uniforms.uAmbientBoost = { value: ambientBoost };
    shader.uniforms.uTranslucency = { value: translucency };
    material.userData.shader = shader;

    // Foliage lighting.
    //
    // Needles inside a canopy receive almost no direct sun and the hemisphere
    // term lands deep in the ACES toe, so a physically-lit card renders black
    // and the whole forest turns into a silhouette. Two corrections:
    //   * lift indirect light for foliage only (direct response stays physical,
    //     so day/night and sun-angle behaviour are preserved),
    //   * add cheap translucency, because real needles are thin and glow when
    //     the sun is behind them — this is what separates a lit canopy from a
    //     flat green wall.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uAmbientBoost;
        uniform float uTranslucency;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= uAmbientBoost;
        #if NUM_DIR_LIGHTS > 0
          // light wrapping around the card: strongest when we look towards the sun
          float backLit = max(0.0, dot(normalize(vViewPosition), directionalLights[0].direction));
          reflectedLight.indirectDiffuse +=
            diffuseColor.rgb * directionalLights[0].color * uTranslucency * backLit;
        #endif`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSway;
        uniform float uTime;
        uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iOrigin = instanceMatrix[3].xyz;
        #else
          vec3 iOrigin = vec3(0.0);
        #endif
        float phase = iOrigin.x * 0.37 + iOrigin.z * 0.53;
        float gust = sin(uTime * 0.9 + phase) * 0.65 + sin(uTime * 2.3 + phase * 1.7) * 0.35;
        float amp = aSway * uWind;
        transformed.x += gust * amp;
        transformed.z += cos(uTime * 1.1 + phase * 0.8) * amp * 0.6;
        transformed.y -= abs(gust) * amp * 0.12;`);
  };
  material.customProgramCacheKey = () => `foliageWind${amplitude}_${ambientBoost}_${translucency}`;
  return material;
}

/**
 * A conifer forest with three levels of detail.
 *
 * Every tree exists once; each update assigns it to exactly one level based on
 * distance, so the total instance count is constant and only the split changes.
 * Reassignment is throttled and hysteretic — trees near a boundary do not
 * flip back and forth as the player edges across it.
 */
export function createConiferForest({
  positions, tiles, needleTexture, barkMaterial, renderer,
  near = 19, far = 52,
}) {
  const group = new THREE.Group();
  group.name = 'conifers';

  const needleMat = foliageWindMaterial(new THREE.MeshStandardMaterial({
    map: needleTexture,
    alphaTest: 0.42,      // cutout, not blending: writes depth, early-z friendly
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
  }), 0.15);

  // two silhouette variants keep a stand of trees from looking cloned
  const variants = [
    buildConifer({ seed: 20260612, detail: 0, tiles, height: 8.6 }),
    buildConifer({ seed: 98765, detail: 0, tiles, height: 7.4 }),
  ];
  const midVariants = [
    buildConifer({ seed: 20260612, detail: 1, tiles, height: 8.6 }),
    buildConifer({ seed: 98765, detail: 1, tiles, height: 7.4 }),
  ];

  const N = positions.length;
  const levels = [];
  for (let v = 0; v < variants.length; v++) {
    for (const [detailIdx, set] of [[0, variants[v]], [1, midVariants[v]]]) {
      const wood = new THREE.InstancedMesh(set.wood, barkMaterial, N);
      const cards = new THREE.InstancedMesh(set.cards, needleMat, N);
      wood.name = `conifer_wood_v${v}_l${detailIdx}`;
      cards.name = `conifer_cards_v${v}_l${detailIdx}`;
      wood.frustumCulled = false;
      cards.frustumCulled = false;
      wood.castShadow = true;
      wood.receiveShadow = true;
      cards.castShadow = true;
      cards.receiveShadow = true;
      wood.count = 0;
      cards.count = 0;
      group.add(wood, cards);
      levels.push({ variant: v, detail: detailIdx, wood, cards, cardCount: set.cardCount });
    }
  }

  // impostor level, textured from the detailed tree itself
  let impostorMesh = null;
  let impostorDiagnostics = null;
  if (renderer) {
    const src = variants[0];
    const tmpWood = new THREE.Mesh(src.wood, barkMaterial);
    const tmpCards = new THREE.Mesh(src.cards, new THREE.MeshStandardMaterial({
      map: needleTexture, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.88,
    }));
    const imp = renderImpostorTexture(renderer, tmpWood, tmpCards, src.height);
    impostorDiagnostics = imp.diagnostics;
    const impGeo = buildImpostorGeometry(imp.height, imp.width);
    const impMat = foliageWindMaterial(new THREE.MeshStandardMaterial({
      map: imp.texture,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }), 0.07);
    impostorMesh = new THREE.InstancedMesh(impGeo, impMat, N);
    impostorMesh.name = 'conifer_impostors';
    impostorMesh.frustumCulled = false;
    impostorMesh.castShadow = false;   // distant trees do not need to cast
    impostorMesh.receiveShadow = true;
    impostorMesh.count = 0;
    group.add(impostorMesh);
    tmpCards.material.dispose();
  }

  // per-tree transform, resolved once
  const trees = positions.map((p, i) => {
    const variant = i % variants.length;
    return {
      pos: new THREE.Vector3(p.x, p.y, p.z),
      scale: p.scale ?? 1,
      rotY: p.rotY ?? 0,
      variant,
      level: -1,
    };
  });

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const lastCam = new THREE.Vector3(1e9, 1e9, 1e9);
  let dirty = true;
  // -1 = distance based; 0/1/2 pin every tree to that level so each LOD can be
  // inspected on its own during the remaster
  let forced = -1;

  function assign(camera) {
    const counts = new Array(levels.length).fill(0);
    let impCount = 0;
    for (const t of trees) {
      const d = forced >= 0 ? [0, near - 10, far + 10][forced] : camera.position.distanceTo(t.pos);
      // hysteresis: a tree must cross a boundary by 4 m before it switches back
      const hyst = 4;
      let want;
      if (forced >= 0) want = forced;
      else if (t.level === -1) want = d < near ? 0 : d < far ? 1 : 2;
      else {
        want = t.level;
        if (d < near - hyst) want = 0;
        else if (d > near + hyst && d < far - hyst) want = 1;
        else if (d > far + hyst) want = 2;
      }
      t.level = want;

      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rotY);
      _s.setScalar(t.scale);
      _m.compose(t.pos, _q, _s);

      if (want === 2 && impostorMesh) {
        impostorMesh.setMatrixAt(impCount++, _m);
      } else {
        const li = levels.findIndex((l) => l.variant === t.variant && l.detail === Math.min(want, 1));
        const lvl = levels[li];
        lvl.wood.setMatrixAt(counts[li], _m);
        lvl.cards.setMatrixAt(counts[li], _m);
        counts[li]++;
      }
    }
    levels.forEach((l, i) => {
      l.wood.count = counts[i];
      l.cards.count = counts[i];
      l.wood.instanceMatrix.needsUpdate = true;
      l.cards.instanceMatrix.needsUpdate = true;
    });
    if (impostorMesh) {
      impostorMesh.count = impCount;
      impostorMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function update(time, camera) {
    // wind
    for (const l of levels) {
      const sh = l.cards.material.userData.shader;
      if (sh) sh.uniforms.uTime.value = time;
    }
    if (impostorMesh?.material.userData.shader) {
      impostorMesh.material.userData.shader.uniforms.uTime.value = time;
    }
    // LOD reassignment only when the camera has actually moved
    if (dirty || camera.position.distanceToSquared(lastCam) > 4) {
      assign(camera);
      lastCam.copy(camera.position);
      dirty = false;
    }
  }

  /** Pin all trees to one level (0/1/2), or -1 to restore distance-based LOD. */
  function forceLOD(level) {
    forced = level;
    for (const t of trees) t.level = -1;  // clear hysteresis
    dirty = true;
    return forced;
  }

  function stats() {
    let cards = 0;
    const perLevel = {};
    for (const l of levels) {
      cards += l.cards.count * l.cardCount;
      perLevel[`v${l.variant}_lod${l.detail}`] = l.wood.count;
    }
    perLevel.impostors = impostorMesh ? impostorMesh.count : 0;
    return { visibleCards: cards, perLevel, trees: trees.length, impostorDiagnostics };
  }

  return { group, update, stats, forceLOD, trees, levels, impostorMesh };
}
