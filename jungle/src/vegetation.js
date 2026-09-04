// Vegetation: a layered, ecologically placed jungle — emergent / canopy /
// understory trees, two palms, a bamboo corridor, shrubs, broadleaf plants,
// ferns, flowers, two grasses, ground cover and lianas. Every species is one
// InstancedMesh (one draw call) swaying in hierarchical, gusty TSL wind.
//
// Placement uses the terrain's ecological API (canopyDensity, zonesAt,
// trailDistance, waterProximity, slope) with deterministic seeds, Poisson-style
// spacing for trees and clump noise so nothing reads as a uniform grid.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  time,
  positionLocal,
  positionGeometry,
  positionWorld,
  normalWorld,
  cameraPosition,
  vec2,
  vec3,
  sin,
  cos,
  float,
  hash,
  mix,
  texture,
  smoothstep,
  uniform,
  normalMap,
  dot,
  cross,
  uv,
  attribute,
  instancedArray,
  instanceIndex,
  normalGeometry,
  normalViewGeometry,
  positionViewDirection,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, createFbm2D, smoothstep as sstep, clamp as clampJs, lerp } from './noise.js';
import { createFoliageTextures, leafAtlasCell } from './foliage-textures.js';
import { GRASS_DISC_FADE } from './grass.js';
import { INSTANCE_ID_ATTRIBUTE } from './instance-culler.js';

const TAU = Math.PI * 2;
// Stable per-instance id (the original instance index). The instance culler
// compacts each layer's buffers to the visible set every time the view moves,
// so instanceIndex no longer identifies a plant; every per-plant random
// (tint, bark phase, wind jitter) hashes this attribute instead, which the
// culler carries along with the matrices. Same integers, same hashes. The
// attribute reaches the fragment stage as an interpolated float (instanceIndex
// travelled as a flat uint), so it is rounded back to the exact integer before
// hash() truncates it.
const instanceId = attribute(INSTANCE_ID_ATTRIBUTE, 'float').add(0.5).floor();
const WIND_HEADING = 0.7; // radians — dominant wind direction on the xz plane
// Small ground cover lives on its own render layer (enabled on the main camera)
// so secondary passes — the water's planar reflection — can leave it out.
export const GROUND_COVER_LAYER = 1;

// Sun direction shared by every leaf material (back-lit translucency).
const sunDirUniform = uniform(new THREE.Vector3(0.3, 0.9, 0.3));
// Player-eye position for the crown LOD. Deliberately NOT `cameraPosition`:
// that node is the shadow camera during the shadow pass (150 m away), so the
// crowns would cast the shadow of a different LOD than the one being drawn.
const viewPosUniform = uniform(new THREE.Vector3());

// =====================================================================
// TSL: wind, tint, translucency, fade
// =====================================================================

// Slow gust front travelling across the map plus a faster ripple; every
// species multiplies its sway by this so the whole jungle breathes together.
function gustEnvelope(wx, wz) {
  const front = sin(time.mul(0.27).sub(wx.mul(0.019)).sub(wz.mul(0.012)));
  const ripple = sin(time.mul(0.83).add(wx.mul(0.041)).add(wz.mul(0.023)).add(1.7));
  return smoothstep(-1.0, 1.2, front.add(ripple.mul(0.45))).mul(0.85).add(0.15);
}

// Sway offset in GEOMETRY space. In r184 the material's positionNode runs
// before the instance matrix is applied, so positionLocal here is the raw
// authored vertex, not a world position. Layers that carry an instance
// stream pass `anchor` (world base / crown centre) so the gust front and the
// phase come from where the plant stands — a trunk and its crown share one
// anchor and move together — and `yaw` so the world wind heading can be
// rotated back into the instance's frame; amplitude grows with the authored
// height (positionGeometry) — trunks barely move at the base, tips swing,
// leaf cards flutter on top.
function windDisplacement({
  strength = 0.16,
  speed = 1.1,
  heightRef = 3,
  heightPow = 1.4,
  pivotTop = false,
  uniformSway = false,
  flutter = 0,
  cardFlutter = 0,
  phaseScale = 0.13,
  anchor = null,
  yaw = null,
  heightFloor = 0, // sway the whole geometry by at least this share (a head riding a swaying trunk tip)
} = {}) {
  const wp = anchor ?? positionLocal;
  // per-plant jitter: from the anchor when there is one (a trunk layer and its
  // crown layers have different instance indices but the same anchor, so
  // they must not key off instanceIndex), else from the instance index
  const jitter = anchor
    ? sin(wp.x.mul(12.9898).add(wp.z.mul(78.233))).mul(43758.5453).fract()
    : hash(instanceId);
  const jitterB = anchor
    ? sin(wp.x.mul(39.346).add(wp.z.mul(11.135))).mul(24634.6345).fract()
    : hash(instanceId.add(77));
  const phase = wp.x.mul(phaseScale).add(wp.z.mul(phaseScale * 0.77)).add(jitter.mul(0.7));
  const t = time.mul(speed).add(phase);
  const gust = sin(t).add(sin(t.mul(1.71).add(1.3)).mul(0.5)).add(sin(t.mul(3.13).add(2.2)).mul(0.27));
  const env = gustEnvelope(wp.x, wp.z);

  let heightFactor;
  if (uniformSway) {
    heightFactor = float(1);
  } else {
    const raw = pivotTop ? positionGeometry.y.negate().div(heightRef) : positionGeometry.y.div(heightRef);
    heightFactor = raw.clamp(0, 1).pow(heightPow);
    if (heightFloor > 0) {
      heightFactor = heightFactor.mul(1 - heightFloor).add(heightFloor);
    }
  }

  const sway = gust.mul(strength).mul(heightFactor).mul(env);
  // world heading of this plant's sway; rotated into the instance frame below
  let dir = float(WIND_HEADING).add(jitterB.sub(0.5).mul(1.1));
  if (yaw) {
    // instance = T · Ry(yaw) · S maps a geometry heading θ to world heading
    // θ − yaw, so the geometry heading for a world heading is θ + yaw
    dir = dir.add(yaw);
  }
  let offset = vec3(sway.mul(cos(dir)), 0, sway.mul(sin(dir)));
  if (flutter > 0) {
    const f = sin(time.mul(5.3).add(phase.mul(2.3)).add(positionGeometry.y.mul(3.1)))
      .mul(flutter)
      .mul(heightFactor)
      .mul(env.mul(0.7).add(0.3));
    offset = offset.add(vec3(f.mul(cos(dir.add(1.5))), f.mul(0.35), f.mul(sin(dir.add(1.5)))));
  }
  if (cardFlutter > 0) {
    // shell-crown cards: every leaf tuft bobs on its own phase (baked per
    // card in `cardData.y`) along its facing direction, on top of the whole
    // crown's sway — the "thousand small motions" that a solid mass of leaves
    // shows in a breeze. The core proxy cards (cardData.x = 1) stay still.
    const card = attribute('cardData', 'vec2');
    const cp = card.y.mul(TAU);
    const f = sin(time.mul(3.7).add(cp).add(phase.mul(1.6)))
      .add(sin(time.mul(6.1).add(cp.mul(2.3)).add(1.1)).mul(0.45))
      .mul(cardFlutter)
      .mul(env.mul(0.75).add(0.25))
      .mul(card.x.oneMinus());
    offset = offset.add(normalGeometry.mul(f)).add(vec3(0, f.mul(0.4), 0));
  }
  return offset;
}

// Vertex stage: wind + optional far-distance collapse toward the instance
// origin (so faded-out cards stop producing fragments at all). Everything here
// happens in geometry space — the instance matrix is applied afterwards — so
// "collapse toward the base / crown centre" is a plain scale about the
// authored origin, and the world position needed for distances comes from the
// layer's instance stream (`inst`: x, y, z, yaw).
//
// `lod` (shell crowns): the geometry origin is the crown centre. Past
// `lod.near` the shell cards shrink toward it — fully degenerate by `lod.far`,
// so a far crown costs no fragments for its 60–150 cards — while the handful
// of big core proxy cards (cardData.x = 1) grow from `lod.coreScale` (tucked
// inside the shell, where they fill the interior) to full size and take over
// the silhouette. Within `lod.close` of the player the core collapses
// entirely: a big flat card is exactly what must never be in the player's
// face, and up close the shell is dense enough on its own. Both LODs are
// always in the one draw call.
function applyVertex(material, { wind = null, fade = null, fadeIn = null, inst = null, lod = null } = {}) {
  // the instance culler reads these to skip instances the shader would collapse
  // anyway, and to carry the anchor stream along when it compacts a layer
  if (inst) material.userData.stream = inst;
  if (fade) material.userData.fadeEnd = fade[1];
  if (fadeIn) material.userData.fadeInStart = fadeIn[0];
  let pos = positionLocal;
  if (wind) {
    pos = pos.add(windDisplacement(inst ? { ...wind, anchor: inst.node.xyz, yaw: inst.node.w } : wind));
  }
  if (lod && inst) {
    const dist = inst.node.xyz.sub(viewPosUniform).length();
    const far = smoothstep(lod.near, lod.far, dist);
    const close = lod.close ?? [10, 24];
    const nearFade = smoothstep(close[0], close[1], dist);
    const isCore = attribute('cardData', 'vec2').x;
    const kShell = far.oneMinus();
    const kCore = mix(float(lod.coreScale).mul(nearFade), float(1), far);
    pos = pos.mul(mix(kShell, kCore, isCore));
  }
  if (fade && inst) {
    const dist = inst.node.xyz.sub(cameraPosition).length();
    let keep = smoothstep(fade[0], fade[1], dist).oneMinus();
    if (fadeIn) {
      // far-only filler layers grow in where the streamed near-field grass
      // disc (grass.js) dissolves, so the two systems hand over seamlessly
      keep = keep.mul(smoothstep(fadeIn[0], fadeIn[1], dist));
    }
    pos = pos.mul(keep);
  }
  material.positionNode = pos;
}

// Rotate a colour around the grey axis (Rodrigues) — a cheap true hue shift.
function hueRotate(color, angle) {
  const k = vec3(0.57735, 0.57735, 0.57735);
  const c = cos(angle);
  const s = sin(angle);
  return color.mul(c).add(cross(k, color).mul(s)).add(k.mul(dot(k, color)).mul(float(1).sub(c)));
}

function perInstanceTint(hueSpread, valueSpread, tint) {
  const rA = hash(instanceId.add(123));
  const rB = hash(instanceId.add(321));
  const value = mix(float(1 - valueSpread), float(1 + valueSpread), rA);
  const hueAngle = rB.sub(0.5).mul(2 * hueSpread);
  return { value, hueAngle, tint: vec3(tint[0], tint[1], tint[2]) };
}

// Alpha-tested leaf card material: per-instance hue/value variation, back-lit
// translucency toward the sun, optional distance fade.
function foliageMaterial(map, {
  roughness = 0.72,
  tint = [1, 1, 1],
  hueSpread = 0.105, // ±6°
  valueSpread = 0.12,
  translucency = 0.45,
  fade = null,
  fadeIn = null, // [start, end]: alpha grows in past this distance (far-only filler layers)
  alphaTest = 0.42,
  ao = null, // [yLow, yHigh, darkness]: occlusion gradient over the pre-instance local height
  vertexTint = false, // multiply by the geometry's `color` attribute (dead fronds, crown shafts)
  doubleSided = false, // render both faces with the authored normal instead of a flipped geometry copy
  cardVariation = 0, // ± value spread per shell card (from cardData.y) so neighbouring tufts differ
} = {}) {
  const material = new THREE.MeshStandardNodeMaterial({
    map,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, // FrontSide: geometry carries a flipped-winding copy instead
    roughness,
    metalness: 0,
    alphaTest,
  });
  if (doubleSided) {
    // NodeMaterial applies the back-face normal flip only to the default
    // normal path; an explicit normalNode is used as authored, so both faces
    // of a card light with the same shading-proxy normal — what the
    // flipped-copy trick achieves, at half the triangles.
    material.normalNode = normalViewGeometry;
  }
  const { value, hueAngle, tint: tintNode } = perInstanceTint(hueSpread, valueSpread, tint);
  const mapColor = texture(map);
  let color = hueRotate(mapColor.rgb, hueAngle).mul(value).mul(tintNode);
  if (vertexTint) {
    color = color.mul(attribute('color', 'vec3'));
  }
  if (cardVariation > 0) {
    // tuft-to-tuft value variation: some clusters sit in the shade of their
    // neighbours, some catch the light — decorrelated from the flutter phase
    const card = attribute('cardData', 'vec2');
    const r = card.y.mul(7.13).fract();
    color = color.mul(mix(float(1 - cardVariation), float(1 + cardVariation), r));
  }
  if (ao) {
    // cheap self-occlusion: the base of a clump / the underside of a crown sits
    // in its own shade, tips and the top catch the light
    const occlusion = mix(float(1 - ao[2]), float(1), smoothstep(ao[0], ao[1], positionGeometry.y));
    color = color.mul(occlusion);
  }
  let backShade = null;
  if (doubleSided) {
    // A card seen from behind its shading normal is the far side of the
    // crown or the top of the crown seen from underneath — the leaves whose
    // lit side faces away. Darken those so the interior reads as shade.
    const facing = normalViewGeometry.dot(positionViewDirection);
    backShade = smoothstep(-0.35, 0.2, facing);
    color = color.mul(mix(float(0.66), float(1), backShade));
  }
  material.colorNode = color;

  let alpha = mapColor.a;
  if (fade) material.userData.fadeEnd = fade[1];
  if (fadeIn) material.userData.fadeInStart = fadeIn[0];
  if (fade || fadeIn) {
    const dist = positionWorld.sub(cameraPosition).length();
    if (fade) alpha = alpha.mul(smoothstep(fade[0], fade[1], dist).oneMinus());
    if (fadeIn) alpha = alpha.mul(smoothstep(fadeIn[0], fadeIn[1], dist));
  }
  material.opacityNode = alpha;

  if (translucency > 0) {
    // light coming through the leaf: camera looking toward the sun through it,
    // plus a softer term when we see the underside of a sunlit leaf
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const backlight = viewDir.dot(sunDirUniform).negate().clamp(0, 1).pow(4);
    const underside = viewDir.y.negate().clamp(0, 1).mul(0.2);
    // energy-ish conservation: a card whose shading normal already faces the
    // sun is being lit by reflection, so it transmits little; only the side
    // turned away from the sun glows. Capped so translucency + direct + bloom
    // can never stack a broadleaf into a white cut-out.
    const facingSun = normalWorld.dot(sunDirUniform).clamp(0, 1);
    let transmitted = backlight.add(underside).mul(translucency).mul(facingSun.mul(0.7).oneMinus());
    if (backShade) {
      // the shaded back of a leaf is where the sun shines *through* it
      transmitted = transmitted.mul(mix(float(1.6), float(1), backShade));
    }
    transmitted = transmitted.min(0.32);
    // transmitted light is yellow-green, but kept below the lit albedo so leaves
    // stay leaf-green instead of turning lime whenever the sun is behind them
    material.emissiveNode = color.mul(vec3(0.7, 0.85, 0.35)).mul(transmitted);
  }
  return material;
}

// Bark: normal-mapped, mossy + darker at the base, lighter higher up.
function barkMaterial(map, normalTex, noiseTex, mossTex, {
  roughness = 0.88,
  mossHeight = 3.0,
  mossStrength = 0.8,
  lighten = 0.18,
  valueSpread = 0.12,
  normalScale = 0.8,
  baseTint = [0.82, 0.88, 0.72],
  gradientHeight = 7,
  hueSpread = 0.06,
} = {}) {
  const material = new THREE.MeshStandardNodeMaterial({ map, roughness, metalness: 0 });
  const value = mix(float(1 - valueSpread), float(1 + valueSpread), hash(instanceId.add(11)));
  const hueAngle = hash(instanceId.add(29)).sub(0.5).mul(2 * hueSpread);
  // per-instance V offset: neighbouring trunks no longer share ring phase
  const bark = texture(map, uv().add(vec2(0, hash(instanceId.add(5)))));
  const y = positionGeometry.y; // pre-instance height above the trunk base (m at scale 1)
  const heightMix = smoothstep(0.0, gradientHeight, y);
  let color = hueRotate(bark.rgb, hueAngle).mul(mix(vec3(baseTint[0], baseTint[1], baseTint[2]), vec3(1 + lighten, 1 + lighten, 1 + lighten), heightMix));
  const mossNoise = texture(noiseTex, positionWorld.xz.mul(0.45).add(positionWorld.y.mul(0.13))).r;
  const mossMask = smoothstep(0.0, mossHeight, y).oneMinus().mul(smoothstep(0.4, 0.68, mossNoise)).mul(mossStrength);
  const moss = texture(mossTex, uv().mul(vec2(2, 4))).rgb;
  color = mix(color, moss.mul(0.95), mossMask);
  color = color.mul(value);
  material.colorNode = color;
  // faint sky bounce so the shaded side of a trunk keeps its colour under the
  // canopy instead of dropping to black
  material.emissiveNode = color.mul(vec3(0.05, 0.06, 0.07));
  material.normalNode = normalMap(texture(normalTex, uv().add(vec2(0, hash(instanceId.add(5))))).rgb, vec2(normalScale));
  material.roughnessNode = mix(float(roughness), float(0.98), mossMask);
  return material;
}

// Per-instance vec4 stream (world anchor x, y, z, yaw) read by the vertex
// stage for distance LOD / fade and for world-anchored wind.
// Read through a storage buffer rather than a vertex attribute: on WebGPU a
// layer with more than 1000 instances already spends four of the eight vertex
// buffer slots on the instance matrix columns, and position + normal + uv +
// the culler's id attribute take the other four. A storage read costs a bind
// group entry instead (the WebGL 2 backend emulates it the same way it does
// the small layers' instance matrices).
function instanceStream(count) {
  const array = new Float32Array(count * 4);
  const storage = instancedArray(array, 'vec4');
  const attribute = storage.value;
  attribute.setUsage(THREE.DynamicDrawUsage);
  return { array, attribute, node: storage.element(instanceIndex) };
}

// =====================================================================
// geometry helpers
// =====================================================================

// Foliage cards: soften normals toward a shading proxy, then bake a
// flipped-winding copy so both sides render as front faces with the authored
// normals — no dark backfaces, no DoubleSide. The proxy is straight-up
// (leaves take light like the ground does) blended with the outward direction
// from the clump's centre by `spherical`, so a crown / bush shades like a
// rounded volume — lit on the sun side, darker on the far side — instead of
// every card receiving the same flat light.
function prepareFoliage(geometry, upFactor = 0.7, spherical = 0, centerFrac = 0.35, center = null, flip = true) {
  const normal = geometry.attributes.normal;
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const cx = center ? center[0] : (bb.min.x + bb.max.x) * 0.5;
  const cy = center ? center[1] : bb.min.y + (bb.max.y - bb.min.y) * centerFrac; // centre sits low: the underside is the shaded part
  const cz = center ? center[2] : (bb.min.z + bb.max.z) * 0.5;
  for (let i = 0; i < normal.count; i += 1) {
    let tx = 0;
    let ty = 1;
    let tz = 0;
    if (spherical > 0) {
      const rx = pos.getX(i) - cx;
      const ry = pos.getY(i) - cy;
      const rz = pos.getZ(i) - cz;
      const rl = Math.hypot(rx, ry, rz) || 1;
      tx = (rx / rl) * spherical;
      ty = (ry / rl) * spherical + (1 - spherical);
      tz = (rz / rl) * spherical;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
    }
    const nx = normal.getX(i) * (1 - upFactor) + tx * upFactor;
    const ny = Math.abs(normal.getY(i)) * (1 - upFactor) + ty * upFactor;
    const nz = normal.getZ(i) * (1 - upFactor) + tz * upFactor;
    const len = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(i, nx / len, ny / len, nz / len);
  }
  normal.needsUpdate = true;
  if (!flip) {
    return geometry; // paired with foliageMaterial({ doubleSided: true })
  }

  const flipped = geometry.clone();
  if (flipped.index) {
    const idx = flipped.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
    flipped.index.needsUpdate = true;
  }
  const merged = mergeGeometries([geometry, flipped]);
  geometry.dispose();
  flipped.dispose();
  return merged;
}

// Card bent along its height (pivot at y=0, +y up), optionally tapering.
function bentCard(width, height, bend = 0.35, lengthSegments = 4, taper = 0) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, lengthSegments);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    pos.setZ(i, pos.getZ(i) + Math.sin(t * Math.PI * 0.5) * bend * height);
    if (taper) {
      pos.setX(i, pos.getX(i) * (1 - t * taper));
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// N cards fanned radially around the pivot.
function radialCards(cardBuilder, count, { startTilt = 0.5, tiltJitter = 0.25, yawJitter = 0.4, seed = 1, lift = 0 } = {}) {
  const random = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const card = cardBuilder(i);
    const yaw = (i / count) * TAU + (random() - 0.5) * yawJitter;
    card.rotateX(startTilt + (random() - 0.5) * tiltJitter);
    card.rotateY(yaw);
    if (lift) {
      card.translate(0, lift, 0);
    }
    parts.push(card);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Crossed vertical quads centered on the pivot (optionally with a flat cap).
function crossedCards(width, height, cards = 2, horizontalCap = false) {
  const parts = [];
  for (let i = 0; i < cards; i += 1) {
    const plane = new THREE.PlaneGeometry(width, height);
    plane.rotateY((i / cards) * Math.PI);
    parts.push(plane);
  }
  if (horizontalCap) {
    // two smaller caps tilted against each other: one flat cap seen edge-on at
    // eye level collapsed into a hard line drawn across the whole shrub
    for (const [tiltX, tiltZ, dy] of [[0.42, 0.18, 0.18], [-0.38, -0.24, 0.26]]) {
      const cap = new THREE.PlaneGeometry(width * 0.78, width * 0.78);
      cap.rotateX(-Math.PI / 2 + tiltX);
      cap.rotateZ(tiltZ);
      cap.translate(0, height * dy, 0);
      parts.push(cap);
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Shrub: cards fanned around the axis but each pushed off-centre, tilted and
// scaled a little differently, plus two counter-tilted caps. Crossed cards
// meeting on one axis show a dark seam from every angle; this never lines up.
function shrubCluster(width, height, cards = 5, seed = 71) {
  const random = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < cards; i += 1) {
    const s = 0.72 + random() * 0.36;
    const plane = new THREE.PlaneGeometry(width * s, height * (0.85 + random() * 0.3));
    plane.rotateX((random() - 0.5) * 0.5);
    plane.rotateZ((random() - 0.5) * 0.4);
    plane.rotateY((i / cards) * Math.PI + (random() - 0.5) * 0.5);
    plane.translate((random() - 0.5) * width * 0.34, (random() - 0.5) * height * 0.2, (random() - 0.5) * width * 0.34);
    parts.push(plane);
  }
  for (const [tiltX, tiltZ, dy] of [[0.42, 0.18, 0.18], [-0.38, -0.24, 0.26]]) {
    const cap = new THREE.PlaneGeometry(width * 0.78, width * 0.78);
    cap.rotateX(-Math.PI / 2 + tiltX);
    cap.rotateZ(tiltZ);
    cap.translate(0, height * dy, 0);
    parts.push(cap);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Add the per-card vertex stream the crown shaders read: cardData = (isCore,
// phase) and, for tinted foliage, a flat colour.
function addCardData(geometry, isCore, phase) {
  const n = geometry.attributes.position.count;
  const data = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    data[i * 2] = isCore;
    data[i * 2 + 1] = phase;
  }
  geometry.setAttribute('cardData', new THREE.Float32BufferAttribute(data, 2));
  return geometry;
}
function addFlatColor(geometry, r, g, b) {
  const n = geometry.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(data, 3));
  return geometry;
}

// Remap a card's 0..1 uvs into one cell of the 2 × 2 leaf-cluster atlas,
// optionally mirrored in u so the same tuft never repeats side by side.
function atlasUv(geometry, cell, mirror) {
  const [u0, v0] = leafAtlasCell(cell);
  const uvAttr = geometry.attributes.uv;
  for (let i = 0; i < uvAttr.count; i += 1) {
    const u = mirror ? 1 - uvAttr.getX(i) : uvAttr.getX(i);
    uvAttr.setXY(i, u0 + u * 0.5, v0 + uvAttr.getY(i) * 0.5);
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpV3a = new THREE.Vector3();
const tmpV3b = new THREE.Vector3();
const tmpQa = new THREE.Quaternion();
const tmpQb = new THREE.Quaternion();

// Volumetric shell crown. The crown is a set of lumpy ellipsoid "blobs" —
// one per major limb tip plus a main dome — and every blob is dressed with
// small leaf-cluster cards sitting on (and a little inside) its surface,
// each card facing outward from its blob with a random roll. Seen from any
// side the player looks *at* tuft faces, never along card edges; walking past
// gives parallax between the near and far shell; from below the sparse, dark
// underside shows sky through gaps between tufts. Shading normals are blended
// toward the crown centre's outward direction so the mass still lights as one
// rounded volume. A few large core proxy cards (cardData.x = 1) sit inside at
// `coreScale` — they fill the interior when near and take over at distance
// (see applyVertex `lod`). Returns geometry with cardData + uvs into the atlas.
function shellCrown({
  blobs, // [{ x, y, z, rx, ry, rz, count, lobes = 4, lobeAmp = 0.22, size = 1 }]
  center = [0, 0, 0], // shading + LOD centre in crown space (becomes the origin)
  cardSize = [1.4, 2.4],
  seed = 1,
  undersideThin = 0.35, // probability of dropping a card that faces straight down
  bottomFlatten = 0.72, // ry multiplier below the blob's equator
  shadeBias = 0.7, // how strongly inner / underside cards pick the shaded atlas cell
  innerFrac = 0.22, // share of cards pulled deep inside the blob (shaded filler)
  tiltJitter = 0.65, // large: on the silhouette some cards must still face the viewer instead of all sitting edge-on
  aspectJitter = 0.3,
  core = null, // { w, h, y, cap: bool }: big proxy cards centred on `center`
  upFactor = 0.72,
  spherical = 0.8,
}) {
  const rnd = mulberry32(seed);
  const parts = [];
  const [ccx, ccy, ccz] = center;
  const randomDir = (out) => {
    const zc = rnd() * 2 - 1;
    const a = rnd() * TAU;
    const r = Math.sqrt(Math.max(0, 1 - zc * zc));
    return out.set(Math.cos(a) * r, zc, Math.sin(a) * r);
  };
  for (const blob of blobs) {
    const { x: bx, y: by, z: bz, rx, ry, rz, count } = blob;
    const lobeCount = blob.lobes ?? 4;
    const lobeAmp = blob.lobeAmp ?? 0.22;
    const sizeScale = blob.size ?? 1;
    const lobeDirs = [];
    for (let l = 0; l < lobeCount; l += 1) {
      const d = randomDir(new THREE.Vector3());
      d.y = Math.abs(d.y) * 0.6 + 0.1; // lobes bulge up and sideways, not down
      lobeDirs.push(d.normalize());
    }
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 6) {
      guard += 1;
      const dir = randomDir(tmpV3a);
      // sparser underside: light comes from above, the lower crown is open
      if (dir.y < 0 && rnd() < undersideThin * Math.pow(-dir.y, 0.7)) continue;
      let lobe = 0;
      for (const ld of lobeDirs) {
        lobe = Math.max(lobe, Math.pow(Math.max(0, dir.dot(ld)), 3));
      }
      // most cards on the shell (lobed); a share sits deep inside so the
      // crown has a dark interior behind the gaps instead of sky
      const inner = rnd() < innerFrac;
      const rf = (inner ? 0.45 + 0.3 * rnd() : 0.82 + 0.18 * Math.pow(rnd(), 0.6)) * (1 + lobeAmp * lobe);
      const yScale = dir.y < 0 ? ry * bottomFlatten : ry;
      const px = bx + dir.x * rx * rf;
      const py = by + dir.y * yScale * rf;
      const pz = bz + dir.z * rz * rf;

      // card faces outward from its blob, jittered, then rolled
      const n = tmpV3b.set(dir.x / rx, dir.y / yScale, dir.z / rz).normalize();
      n.x += (rnd() - 0.5) * tiltJitter;
      n.y += (rnd() - 0.5) * tiltJitter;
      n.z += (rnd() - 0.5) * tiltJitter;
      n.normalize();
      const s = (cardSize[0] + rnd() * (cardSize[1] - cardSize[0])) * sizeScale;
      const aspect = 1 + (rnd() - 0.5) * aspectJitter;
      const card = new THREE.PlaneGeometry(s * aspect, s / aspect);
      tmpQa.setFromUnitVectors(Z_AXIS, n);
      tmpQb.setFromAxisAngle(Z_AXIS, rnd() * TAU);
      tmpQa.multiply(tmpQb);
      card.applyQuaternion(tmpQa);
      card.translate(px - ccx, py - ccy, pz - ccz);

      // atlas cell: cards low in the crown or tucked inside are in shade
      const relY = (py - ccy) / Math.max(0.5, ry);
      let shade = 0;
      if (inner) shade += 1.1;
      else if (rf < 0.88) shade += 0.4;
      if (relY < -0.25) shade += 0.7;
      else if (relY < 0.15) shade += 0.25;
      const cell = rnd() < shade * shadeBias ? 2 : [0, 1, 3][Math.floor(rnd() * 3)];
      atlasUv(card, cell, rnd() < 0.5);
      addCardData(card, 0, rnd());
      parts.push(card);
      placed += 1;
    }
  }
  if (core) {
    // three crossed vertical cards; no horizontal cap by default — seen from
    // under the tree a cap is exactly the "flat pancake" a card crown must
    // never show, and the first-person player never looks straight down
    const { w, h, y = 0, cap = false } = core;
    const coreParts = [];
    for (let i = 0; i < 3; i += 1) {
      const p = new THREE.PlaneGeometry(w, h);
      p.rotateY((i / 3) * Math.PI + 0.2);
      coreParts.push(p);
    }
    if (cap) {
      const p = new THREE.PlaneGeometry(w * 0.9, w * 0.9);
      p.rotateX(-Math.PI / 2 + 0.08);
      p.translate(0, h * 0.18, 0);
      coreParts.push(p);
    }
    coreParts.forEach((p, i) => {
      p.translate(0, y, 0);
      atlasUv(p, [0, 1, 3, 1][i], i % 2 === 1);
      addCardData(p, 1, rnd());
      // authored at full size; the vertex stage shrinks them to `coreScale`
      // when the crown is near — so they must be centred on the LOD origin
      parts.push(p);
    });
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  // no flipped copy: crown materials are doubleSided with the authored normal
  return prepareFoliage(merged, upFactor, spherical, 0.4, [0, 0, 0], false);
}

// Tapered branch tube that sweeps upward as it goes (low-poly: `sides` × `segs`).
// Returns the geometry plus the tip position / direction for crown blobs and
// secondary twigs. Rings use parallel-transported frames so the tube never twists.
function branchTube({ start, dir, length, radius, tipRadius = 0.3, sides = 6, segs = 2, curl = 0.35, uvV = 2.4, uvU = null }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const dirV = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const p = new THREE.Vector3(start[0], start[1], start[2]);
  const tangent = dirV.clone();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  // initial normal: anything perpendicular to the tangent
  normal.set(0, 1, 0);
  if (Math.abs(tangent.y) > 0.9) normal.set(1, 0, 0);
  normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
  const uRepeat = uvU ?? Math.max(1, Math.round((TAU * radius) / 0.7));
  const step = length / segs;
  let arc = 0;
  const axis = [];
  for (let k = 0; k <= segs; k += 1) {
    const t = k / segs;
    if (k > 0) {
      // bend toward up as the branch runs out
      tangent.set(dirV.x, dirV.y + curl * t, dirV.z).normalize();
      p.addScaledVector(tangent, step);
      arc += step;
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    }
    binormal.crossVectors(tangent, normal);
    const r = radius * lerp(1, tipRadius, t);
    axis.push([p.x, p.y, p.z, tangent.x, tangent.y, tangent.z, r]);
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(p.x + (normal.x * ca + binormal.x * sa) * r, p.y + (normal.y * ca + binormal.y * sa) * r, p.z + (normal.z * ca + binormal.z * sa) * r);
      uvs.push((i / sides) * uRepeat, arc / uvV);
    }
  }
  for (let k = 0; k < segs; k += 1) {
    for (let i = 0; i < sides; i += 1) {
      const a = k * (sides + 1) + i;
      const b = a + 1;
      const c = a + sides + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal;
  for (let k = 0; k <= segs; k += 1) {
    const a = k * (sides + 1);
    const b = a + sides;
    const nx = (nrm.getX(a) + nrm.getX(b)) * 0.5;
    const ny = (nrm.getY(a) + nrm.getY(b)) * 0.5;
    const nz = (nrm.getZ(a) + nrm.getZ(b)) * 0.5;
    nrm.setXYZ(a, nx, ny, nz);
    nrm.setXYZ(b, nx, ny, nz);
  }
  const last = axis[axis.length - 1];
  return { geometry, tip: [last[0], last[1], last[2]], tipDir: [last[3], last[4], last[5]], axis };
}

// Authored trunk: tapered lathe with base flare, optional buttress lobes,
// lateral wobble and merged branches. Returns branch tips in trunk space.
function buildTrunk({
  height,
  radiusBase,
  radiusTop,
  radial = 8,
  rings = 6,
  flareStart = 0.16,
  flarePow = 2.0,
  flareAmount = 0.6,
  lobes = 0,
  lobeAmp = 0,
  lobeSharp = 2.5,
  wobble = 0,
  taperPow = 1.0,
  branches = [], // { t, yaw, tilt, length, radius, curl?, twigs? }
  branchSides = 6,
  branchSegs = 2,
  twigSides = 5,
  seed = 1,
  uvV = 2.4,
}) {
  const rnd = mulberry32(seed);
  const phi = rnd() * TAU;
  const wobPhase1 = rnd() * TAU;
  const wobPhase2 = rnd() * TAU;
  const positions = [];
  const uvs = [];
  const indices = [];
  const uRepeat = Math.max(1, Math.round((TAU * radiusBase) / 1.2));
  const centers = [];

  function centerAt(t) {
    const y = t * height;
    const rise = sstep(0, 0.25, t);
    return [
      wobble ? Math.sin(y * 0.7 + wobPhase1) * wobble * rise : 0,
      y,
      wobble ? Math.cos(y * 0.55 + wobPhase2) * wobble * rise : 0,
    ];
  }
  function radiusAt(t) {
    return lerp(radiusBase, radiusTop, Math.pow(t, taperPow));
  }

  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    const [cx, y, cz] = centerAt(t);
    centers.push([cx, y, cz]);
    const flare = Math.pow(Math.max(0, 1 - t / flareStart), flarePow);
    const rBase = radiusAt(t);
    for (let i = 0; i <= radial; i += 1) {
      const a = (i / radial) * TAU;
      let rr = rBase * (1 + flare * flareAmount);
      if (lobes > 0) {
        rr += rBase * flare * lobeAmp * Math.pow(Math.max(0, Math.cos(lobes * a + phi)), lobeSharp);
      }
      positions.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
      uvs.push((i / radial) * uRepeat, y / uvV);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = r * (radial + 1) + i;
      const b = a + 1;
      const c = a + radial + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  trunk.setIndex(indices);
  trunk.computeVertexNormals();
  // stitch the uv seam normals
  const nrm = trunk.attributes.normal;
  for (let r = 0; r <= rings; r += 1) {
    const a = r * (radial + 1);
    const b = a + radial;
    const nx = (nrm.getX(a) + nrm.getX(b)) * 0.5;
    const ny = (nrm.getY(a) + nrm.getY(b)) * 0.5;
    const nz = (nrm.getZ(a) + nrm.getZ(b)) * 0.5;
    nrm.setXYZ(a, nx, ny, nz);
    nrm.setXYZ(b, nx, ny, nz);
  }
  nrm.needsUpdate = true;

  // Primary limbs: tapered tubes that leave the upper trunk and sweep upward
  // into the crown, each with a couple of secondary twigs so the branch
  // structure keeps going where the leaf shell begins.
  const parts = [trunk];
  const branchTips = [];
  const branchBases = [];
  const branchDirs = [];
  const branchTipDirs = [];
  for (const br of branches) {
    const { t, yaw, tilt, length, radius, curl = 0.45, twigs = 2 } = br;
    const [cx, y0, cz] = centerAt(t);
    const rTrunk = radiusAt(t);
    const dir = [Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt), Math.sin(tilt) * Math.cos(yaw)];
    const start = [cx + dir[0] * rTrunk * 0.45, y0, cz + dir[2] * rTrunk * 0.45];
    const tube = branchTube({ start, dir, length, radius, tipRadius: 0.32, sides: branchSides, segs: branchSegs, curl, uvV });
    parts.push(tube.geometry);
    branchBases.push(start);
    branchDirs.push(dir);
    branchTips.push(tube.tip);
    branchTipDirs.push(tube.tipDir);
    for (let k = 0; k < twigs; k += 1) {
      // twig leaves the limb at 55–85 % of its run, swung ±50–80° to the side
      const along = 0.55 + (k / Math.max(1, twigs - 1)) * 0.3 + (rnd() - 0.5) * 0.08;
      const seg = Math.min(tube.axis.length - 2, Math.floor(along * branchSegs));
      const f = along * branchSegs - seg;
      const a0 = tube.axis[seg];
      const a1 = tube.axis[seg + 1];
      const origin = [lerp(a0[0], a1[0], f), lerp(a0[1], a1[1], f), lerp(a0[2], a1[2], f)];
      const side = k % 2 === 0 ? 1 : -1;
      const swing = side * (0.9 + rnd() * 0.5);
      const dx = a1[3];
      const dz = a1[5];
      const tdir = [dx * Math.cos(swing) - dz * Math.sin(swing), a1[4] * 0.6 + 0.35, dx * Math.sin(swing) + dz * Math.cos(swing)];
      const tr = lerp(a0[6], a1[6], f);
      const twig = branchTube({ start: origin, dir: tdir, length: length * (0.34 + rnd() * 0.16), radius: tr * 0.55, tipRadius: 0.3, sides: twigSides, segs: 1, curl: 0.5, uvV, uvU: 1 });
      parts.push(twig.geometry);
    }
  }
  const geometry = parts.length > 1 ? mergeGeometries(parts) : trunk;
  if (parts.length > 1) {
    parts.forEach((p) => p.dispose());
  }
  return { geometry, branchTips, branchBases, branchDirs, branchTipDirs, top: centers[rings], radiusAt, centerAt, height };
}

// Leaning cylinder (palms, bamboo): bends toward +x, ring ridges optional.
function curvedCylinder({ radiusTop, radiusBottom, height, radial = 7, rings = 8, lean = 0, ridge = 0, ridgeFreq = 5, uvV = 2.4, wiggle = 0 }) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial, rings, true);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    const f = 1 + ridge * (0.5 + 0.5 * Math.sin(y * ridgeFreq));
    const cx = t * t * lean + (wiggle ? Math.sin(t * 9.1) * wiggle * t : 0);
    pos.setX(i, pos.getX(i) * f + cx);
    pos.setZ(i, pos.getZ(i) * f);
  }
  pos.needsUpdate = true;
  const uvAttr = geometry.attributes.uv;
  const uRepeat = Math.max(1, Math.round((TAU * radiusBottom) / 1.0));
  for (let i = 0; i < uvAttr.count; i += 1) {
    uvAttr.setXY(i, uvAttr.getX(i) * uRepeat, uvAttr.getY(i) * (height / uvV));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Bamboo culm: thin, slightly leaning, one texture repeat per internode with a
// geometric bulge at every node ring.
function bambooCulmGeometry(height = 10, internodes = 6) {
  const rings = internodes * 2;
  const radial = 5;
  const geometry = new THREE.CylinderGeometry(0.05, 0.075, height, radial, rings, true);
  geometry.translate(0, height / 2, 0);
  const pos = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = y / height;
    const ringIndex = Math.round(t * rings);
    const node = ringIndex % 2 === 0 ? 1.14 : 1.0;
    const cx = t * t * 0.9;
    pos.setX(i, pos.getX(i) * node + cx);
    pos.setZ(i, pos.getZ(i) * node);
    uvAttr.setXY(i, uvAttr.getX(i), t * internodes);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Point on the culm axis for the leaf clusters (same lean law as the geometry).
function bambooAxis(t) {
  return [t * t * 0.9, t * 10, 0];
}

// Hanging vine strip, pivot at the top (y: 0 → -7), gently S-curved; the
// texture tiles 2.4× along it so stretched (long) instances stay leafy.
function vineGeometry() {
  const geometry = new THREE.PlaneGeometry(0.6, 7, 1, 10);
  geometry.translate(0, -3.5, 0);
  const pos = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    const t = -pos.getY(i) / 7;
    pos.setX(i, pos.getX(i) + Math.sin(t * Math.PI * 1.3) * 0.5 * t);
    pos.setZ(i, Math.sin(t * Math.PI * 0.8) * 0.35);
    uvAttr.setXY(i, uvAttr.getX(i), t * 2.4);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Looping liana: two crossed ribbons following a sagging U (±2 m, 2.6 m sag).
function lianaLoopGeometry() {
  const segs = 14;
  const parts = [];
  for (let ribbon = 0; ribbon < 2; ribbon += 1) {
    const geometry = new THREE.PlaneGeometry(0.28, 1, 1, segs);
    const pos = geometry.attributes.position;
    const uvAttr = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      const t = pos.getY(i) + 0.5; // 0..1 along the ribbon
      const side = pos.getX(i); // ±0.14 across
      const x = -2 + 4 * t;
      const y = -2.6 * (1 - Math.pow(2 * t - 1, 2)) - 0.1 * Math.sin(t * 9);
      if (ribbon === 0) {
        pos.setXYZ(i, x, y + side, 0);
      } else {
        pos.setXYZ(i, x, y, side);
      }
      uvAttr.setXY(i, uvAttr.getX(i), t * 2.2);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// =====================================================================
// placement helpers
// =====================================================================

class SpatialHash {
  constructor(cell = 4) {
    this.cell = cell;
    this.map = new Map();
    this.maxRadius = 0;
  }

  key(ix, iz) {
    return (ix + 1024) * 4096 + (iz + 1024);
  }

  insert(x, z, r = 0) {
    const ix = Math.floor(x / this.cell);
    const iz = Math.floor(z / this.cell);
    const k = this.key(ix, iz);
    let bucket = this.map.get(k);
    if (!bucket) {
      bucket = [];
      this.map.set(k, bucket);
    }
    bucket.push(x, z, r);
    if (r > this.maxRadius) {
      this.maxRadius = r;
    }
  }

  // true if any stored point is closer than minDist + its own radius
  tooClose(x, z, minDist) {
    const reach = minDist + this.maxRadius;
    const span = Math.ceil(reach / this.cell);
    const ix = Math.floor(x / this.cell);
    const iz = Math.floor(z / this.cell);
    for (let dz = -span; dz <= span; dz += 1) {
      for (let dx = -span; dx <= span; dx += 1) {
        const bucket = this.map.get(this.key(ix + dx, iz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 3) {
          const ddx = bucket[i] - x;
          const ddz = bucket[i + 1] - z;
          const limit = minDist + bucket[i + 2];
          if (ddx * ddx + ddz * ddz < limit * limit) {
            return true;
          }
        }
      }
    }
    return false;
  }
}

// Cached ecological fields on a 2 m grid (rules only — final heights are exact).
function createField(terrain) {
  const half = WORLD.size / 2;
  const step = 2;
  const n = Math.round(WORLD.size / step) + 1;
  const heights = new Float32Array(n * n);
  const canopy = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz += 1) {
    const z = -half + iz * step;
    for (let ix = 0; ix < n; ix += 1) {
      const x = -half + ix * step;
      const o = iz * n + ix;
      heights[o] = terrain.sampleHeight(x, z);
      canopy[o] = terrain.canopyDensity(x, z);
    }
  }
  function sampleGrid(arr, x, z) {
    const gx = clampJs((x + half) / step, 0, n - 1.001);
    const gz = clampJs((z + half) / step, 0, n - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const a = arr[iz * n + ix];
    const b = arr[iz * n + ix + 1];
    const c = arr[(iz + 1) * n + ix];
    const d = arr[(iz + 1) * n + ix + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }
  return {
    height: (x, z) => sampleGrid(heights, x, z),
    canopy: (x, z) => sampleGrid(canopy, x, z),
    normalY(x, z) {
      const e = 1.5;
      const hL = sampleGrid(heights, x - e, z);
      const hR = sampleGrid(heights, x + e, z);
      const hD = sampleGrid(heights, x, z - e);
      const hU = sampleGrid(heights, x, z + e);
      const dx = hL - hR;
      const dz = hD - hU;
      return (2 * e) / Math.sqrt(dx * dx + dz * dz + 4 * e * e);
    },
    normal(x, z, out) {
      const e = 1.5;
      const hL = sampleGrid(heights, x - e, z);
      const hR = sampleGrid(heights, x + e, z);
      const hD = sampleGrid(heights, x, z - e);
      const hU = sampleGrid(heights, x, z + e);
      out.set(hL - hR, 2 * e, hD - hU).normalize();
      return out;
    },
  };
}

// =====================================================================
// the vegetation system
// =====================================================================

export function createVegetation(ctx) {
  const { scene, terrain, textures } = ctx;
  const t0 = performance.now();
  const ft = createFoliageTextures();
  if (ctx.sky?.sunDirection) {
    sunDirUniform.value.copy(ctx.sky.sunDirection);
  }
  if (ctx.camera) {
    viewPosUniform.value.copy(ctx.camera.position);
  }

  const half = WORLD.size / 2 - 6;
  const giant = WORLD.giantTree;
  ctx.camera?.layers.enable(GROUND_COVER_LAYER);
  const field = createField(terrain);
  const clumpA = createFbm2D(WORLD.seed + 771, { octaves: 2 });
  const clumpB = createFbm2D(WORLD.seed + 772, { octaves: 2 });
  const clumpC = createFbm2D(WORLD.seed + 773, { octaves: 3 });

  const dummy = new THREE.Object3D();
  const tmpNormal = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpQuat2 = new THREE.Quaternion();
  const upVec = new THREE.Vector3(0, 1, 0);
  const meshes = [];
  const layers = [];

  // shared spacing registries
  const treeHash = new SpatialHash(6); // big + understory trees (x, z, trunk radius)
  const plantHash = new SpatialHash(3); // shrubs / broadleaf so they don't overlap silly

  // ---------- sampling ----------
  // distance to the clearing → terraces trail (the bamboo corridor)
  const corridorTrail = WORLD.trails[3];
  function corridorDistance(x, z) {
    let best = Infinity;
    for (let i = 0; i < corridorTrail.length - 1; i += 1) {
      const [ax, az] = corridorTrail[i];
      const [bx, bz] = corridorTrail[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const t = clampJs(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
      if (d < best) best = d;
    }
    return best;
  }
  // ---------- landmark keep-out ----------
  // Authored set pieces (fallen logs, the river bridge, ruin stairs, root
  // arches, the sentinel snag) and the waterfall's spray column must not have
  // trunks growing through them. Distances are to the shape's surface, so a
  // rule can ask for a trunk-radius clearance.
  const keepDiscs = [];
  const keepCapsules = [];
  const keepFns = [];
  {
    const lm = ctx.landmarks;
    const w = lm?.walkables;
    if (w) {
      for (const d of w.discs) keepDiscs.push({ x: d.x, z: d.z, r: d.r });
      for (const c of w.capsules) keepCapsules.push({ ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, r: c.r });
      for (const e of w.ellipsoids) keepDiscs.push({ x: e.x, z: e.z, r: Math.max(e.sx, e.sz) });
      for (const st of w.stairs) {
        const end = st.start + st.depth * st.count;
        keepCapsules.push({
          ax: st.x + st.dx * st.start,
          az: st.z + st.dz * st.start,
          bx: st.x + st.dx * end,
          bz: st.z + st.dz * end,
          r: st.halfWidth + 0.6,
        });
      }
      for (const fn of w.custom) keepFns.push(fn);
    }
    const p = lm?.places;
    if (p) {
      if (p.snag) keepDiscs.push({ x: p.snag.x, z: p.snag.z, r: 8 });
      for (const a of p.arches ?? []) keepDiscs.push({ x: a.x, z: a.z, r: 5 });
      if (p.bridge) {
        keepDiscs.push({ x: p.bridge.westX, z: p.bridge.z, r: 4 });
        keepDiscs.push({ x: p.bridge.eastX, z: p.bridge.z, r: 4 });
      }
    }
    // waterfall sheets + plunge pool
    keepCapsules.push({
      ax: WORLD.waterfallX,
      az: WORLD.waterfallZ - 6,
      bx: WORLD.waterfallX,
      bz: WORLD.waterfallZ + 26,
      r: 9,
    });
  }
  function keepOutDistance(x, z) {
    let best = Infinity;
    for (const d of keepDiscs) {
      const dd = Math.hypot(x - d.x, z - d.z) - d.r;
      if (dd < best) best = dd;
    }
    for (const c of keepCapsules) {
      const vx = c.bx - c.ax;
      const vz = c.bz - c.az;
      const t = clampJs(((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz || 1e-6), 0, 1);
      const dd = Math.hypot(x - (c.ax + vx * t), z - (c.az + vz * t)) - c.r;
      if (dd < best) best = dd;
    }
    if (best > 0) {
      for (const fn of keepFns) {
        if (Number.isFinite(fn(x, z))) return 0;
      }
    }
    return best;
  }

  function sampleAt(x, z) {
    const zone = terrain.zonesAt(x, z);
    const h = field.height(x, z);
    const ny = field.normalY(x, z);
    const water = terrain.waterProximity(x, z);
    return {
      h,
      ny,
      canopy: field.canopy(x, z),
      zone,
      trail: terrain.trailDistance(x, z),
      corridor: corridorDistance(x, z),
      water,
      giant: Math.hypot(x - giant.x, z - giant.z),
      spawn: Math.hypot(x - WORLD.spawn.x, z - WORLD.spawn.z),
      // steep wet rock above the lagoon (the waterfall amphitheatre) and the
      // ravine walls: too steep for trees, so clinging cover has to dress them
      cliff: (1 - sstep(0.62, 0.9, ny)) * Math.max(water > 0.2 && h > 2 ? 1 : 0, zone.ravine, zone.terrace * 0.6),
      // lazy: only woody layers pay for the landmark distance test
      get keepOut() {
        const v = keepOutDistance(x, z);
        Object.defineProperty(this, 'keepOut', { value: v });
        return v;
      },
    };
  }
  // patchiness helpers (0..1)
  const clump = (x, z, freq, lo = -0.25, hi = 0.45, which = clumpA) => sstep(lo, hi, which(x * freq, z * freq));

  // ---------- candidate generators ----------
  const uniformCandidate = (rng) => ({ x: (rng() * 2 - 1) * half, z: (rng() * 2 - 1) * half });
  // Shoreline band around the lagoon and along the river (waterside species
  // would otherwise waste most of their rejection budget on dry land).
  const lagoon = WORLD.lagoonCenter;
  function shoreCandidate(rng) {
    if (rng() < 0.55) {
      const a = rng() * TAU;
      const r = WORLD.lagoonRadius - 4 + rng() * 24;
      return { x: lagoon.x + Math.cos(a) * r, z: lagoon.z + Math.sin(a) * r };
    }
    const z = lagoon.z + 6 + rng() * (half - lagoon.z - 6);
    const side = rng() < 0.5 ? -1 : 1;
    return { x: terrain.riverCenterX(z) + side * (WORLD.riverHalfWidth - 3 + rng() * 20), z };
  }
  function clusterCandidate(centers, radius) {
    return (rng) => {
      const c = centers[Math.floor(rng() * centers.length)];
      const a = rng() * TAU;
      const r = Math.sqrt(rng()) * (c.r ?? radius);
      return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, center: c };
    };
  }

  // Generic rejection scatter. `rule(s, x, z)` returns a weight 0..1 (or false).
  function scatter({ count, seed, candidate = uniformCandidate, rule, spacing = null, maxTries = null }) {
    const rng = mulberry32(WORLD.seed + seed);
    const out = [];
    const limit = maxTries ?? count * 45;
    let tries = 0;
    while (out.length < count && tries < limit) {
      tries += 1;
      const c = candidate(rng);
      if (!c) continue;
      const { x, z } = c;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const s = sampleAt(x, z);
      const w = rule(s, x, z, c);
      if (!(w > 0)) continue;
      if (w < 1 && rng() > w) continue;
      if (spacing) {
        if (spacing.hash.tooClose(x, z, spacing.dist)) continue;
        if (spacing.also && spacing.also.hash.tooClose(x, z, spacing.also.dist)) continue;
      }
      const y = terrain.sampleHeight(x, z);
      const p = { x, y, z, s, r: rng(), r2: rng(), center: c.center };
      if (spacing) {
        spacing.hash.insert(x, z, spacing.radius ?? 0);
      }
      out.push(p);
    }
    return out;
  }

  // ---------- registry ----------
  // gate: ascending Float32Array of density thresholds — instance i of an
  // attachment layer is active while the preset density >= gate[i], which is
  // exactly when its owner tree (index k of a layer with maxCount m, active
  // while k < round(m * density)) is still drawn. Lets crowns / vines / orchids
  // follow their trees through applyQuality, even across several owner layers.
  function register(mesh, { castShadow = false, densityKey = 'vegetation', gate = null } = {}) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances span the map; skip whole-mesh culling
    if (densityKey === 'grass') {
      mesh.layers.set(GROUND_COVER_LAYER);
    }
    scene.add(mesh);
    meshes.push(mesh);
    const layer = { mesh, maxCount: mesh.count, densityKey, gate };
    layers.push(layer);
    // hand the layer to the instance culler: it compacts the buffers to the
    // visible set per view and keeps the density prefix rule below
    const ud = mesh.material.userData;
    ctx.culler?.register(mesh, {
      maxCount: mesh.count,
      gate,
      densityKey,
      stream: ud.stream ?? null,
      fadeEnd: ud.fadeEnd ?? null,
      fadeInStart: ud.fadeInStart ?? null,
      inReflection: densityKey !== 'grass',
      castShadow,
    });
    return layer;
  }
  // Float64 so a gate that lands exactly on a preset density compares the same
  // way as the owner's Math.round(max * density) cut-off.
  const gateOf = (ownerIndex, ownerMax) => (ownerIndex + 0.5) / Math.max(1, ownerMax);
  const gateFromOwners = (items, ownerMax) => Float64Array.from(items, (it) => gateOf(it.owner, ownerMax));
  const gateSequential = (count, ownerMax) => Float64Array.from({ length: Math.max(1, count) }, (_, i) => gateOf(i, ownerMax));

  function setMatrix(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  // Upright plant layer with random yaw, scale jitter, optional ground alignment.
  function buildSimple({
    name,
    geometry,
    material,
    placements,
    seed,
    scale = () => 1,
    yJitter = 0.25,
    sink = 0.05,
    castShadow = false,
    randomTilt = 0,
    align = 0,
    densityKey = 'vegetation',
    inst = null,
  }) {
    const rng = mulberry32(WORLD.seed + seed);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    mesh.name = name;
    placements.forEach((p, i) => {
      const s = scale(p, rng);
      const sy = s * (1 + (rng() - 0.5) * yJitter);
      dummy.position.set(p.x, p.y - sink, p.z);
      dummy.scale.set(s, sy, s);
      let yaw;
      if (align > 0) {
        field.normal(p.x, p.z, tmpNormal);
        tmpQuat.setFromUnitVectors(upVec, tmpNormal);
        tmpQuat2.identity().slerp(tmpQuat, align);
        yaw = rng() * TAU;
        dummy.quaternion.setFromAxisAngle(upVec, yaw).premultiply(tmpQuat2);
      } else {
        const tiltX = randomTilt ? (rng() - 0.5) * randomTilt : 0;
        yaw = rng() * TAU;
        dummy.rotation.set(tiltX, yaw, randomTilt ? (rng() - 0.5) * randomTilt : 0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (inst) {
        const o = i * 4;
        inst.array[o] = p.x;
        inst.array[o + 1] = p.y - sink;
        inst.array[o + 2] = p.z;
        inst.array[o + 3] = yaw;
      }
    });
    if (placements.length === 0) {
      setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
    return register(mesh, { castShadow, densityKey });
  }

  // tree-local → world (instance = T · Ry(yaw) · S: scale first, then yaw)
  function treeToWorld(tree, lx, ly, lz) {
    const c = Math.cos(tree.yaw);
    const s = Math.sin(tree.yaw);
    const x = lx * tree.sx;
    const z = lz * tree.sz;
    return [tree.x + x * c + z * s, tree.y + ly * tree.s, tree.z - x * s + z * c];
  }

  // Common tree rejection rules (walkable trails, landmarks, water, cliffs).
  function treeRule(s, x, z, { slopeMin = 0.819, trailClear = 4, giantClear = 12, minHeight = 1.1 } = {}) {
    if (s.h < minHeight) return 0;
    if (s.zone.clearing > 0.5) return 0;
    if (s.zone.ruins > 0.6) return 0;
    if (s.zone.overlook > 0.5) return 0;
    if (s.trail < trailClear) return 0;
    if (s.giant < giantClear) return 0;
    if (s.spawn < 9) return 0;
    if (s.water > 0.6 && s.h < 1.8) return 0; // sandy shore
    if (s.keepOut < 2.5) return 0;
    const slopeLimit = s.zone.rim > 0.4 ? 0.7 : slopeMin;
    if (s.ny < slopeLimit) return 0;
    return 1;
  }

  // =====================================================================
  // TREES
  // =====================================================================
  const bigTrees = []; // for lianas / epiphytes / orchids
  const barkNoise = textures.noise;

  // One crown per tree, sharing the tree's exact instance transform so the
  // crown blobs sit on the limb tips of the trunk geometry they were authored
  // around. `crownOrigin` is the crown-space centre in trunk space.
  function buildCrownLayer(name, crowns, geometry, material, ownerLayer, inst, { castShadow = true } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, crowns.length));
    mesh.name = name;
    crowns.forEach((c, i) => {
      setMatrix(mesh, i, c.x, c.y, c.z, 0, c.yaw, 0, c.sx, c.sy, c.sz);
      // anchor = the tree's base, bit-identical to the trunk layer's stream,
      // so trunk and crown evaluate the same wind phase
      writeAnchor(inst, i, c.ax, c.ay, c.az, c.yaw);
    });
    if (crowns.length === 0) setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    return register(mesh, { castShadow, gate: gateFromOwners(crowns, ownerLayer.maxCount) });
  }
  // world placement of a tree's crown instance (crown origin transformed like the trunk)
  function crownInstance(tree, origin, owner) {
    const [x, y, z] = treeToWorld(tree, origin[0], origin[1], origin[2]);
    return { x, y, z, yaw: tree.yaw, sx: tree.sx, sy: tree.s, sz: tree.sz, owner, ax: tree.x, ay: tree.y, az: tree.z };
  }
  function writeAnchor(inst, i, x, y, z, yaw) {
    const o = i * 4;
    inst.array[o] = x;
    inst.array[o + 1] = y;
    inst.array[o + 2] = z;
    inst.array[o + 3] = yaw;
  }
  // Crown blobs around a trunk's limb tips: one tuft-ball a little past every
  // tip (the limb visibly carries into it) plus the main dome over the top.
  function limbBlobs(trunk, { tipR, tipCount, tipLift = 0.3, push = 0.6, size = 1, lobes = 3 }) {
    return trunk.branchTips.map((tip, b) => {
      const d = trunk.branchTipDirs[b];
      return { x: tip[0] + d[0] * push, y: tip[1] + d[1] * push + tipLift, z: tip[2] + d[2] * push, rx: tipR[0], ry: tipR[1], rz: tipR[2], count: tipCount, size, lobes, lobeAmp: 0.25 };
    });
  }
  const CROWN_LOD = { near: 120, far: 155, coreScale: 0.72 };

  // ---------- emergent giants (25–32 m, buttressed) ----------
  const emergentTrunk = buildTrunk({
    height: 24,
    radiusBase: 1.0,
    radiusTop: 0.5,
    radial: 16,
    rings: 10,
    flareStart: 0.2,
    flarePow: 1.8,
    flareAmount: 0.5,
    lobes: 5,
    lobeAmp: 1.7,
    lobeSharp: 2.2,
    wobble: 0.35,
    taperPow: 0.9,
    seed: 41,
    branchSides: 6,
    branchSegs: 3,
    branches: [
      { t: 0.64, yaw: 0.2, tilt: 1.12, length: 6.8, radius: 0.36, curl: 0.55 },
      { t: 0.71, yaw: 1.55, tilt: 1.06, length: 6.4, radius: 0.33, curl: 0.5 },
      { t: 0.78, yaw: 2.9, tilt: 1.0, length: 6.0, radius: 0.31, curl: 0.5 },
      { t: 0.85, yaw: 4.2, tilt: 0.92, length: 5.4, radius: 0.28, curl: 0.45 },
      { t: 0.91, yaw: 5.4, tilt: 0.82, length: 4.8, radius: 0.25, curl: 0.4 },
      { t: 0.96, yaw: 3.6, tilt: 0.55, length: 3.4, radius: 0.22, curl: 0.3, twigs: 1 },
    ],
  });
  const emergentPlacements = scatter({
    count: 96,
    seed: 101,
    rule: (s, x, z) => {
      if (!treeRule(s, x, z, { giantClear: 16 })) return 0;
      if (s.canopy < 0.7) return 0;
      if (s.zone.ravine > 0.45) return 0;
      return 0.5 + s.zone.rim * 0.8 + clump(x, z, 0.02, -0.2, 0.4, clumpB) * 0.5;
    },
    spacing: { hash: treeHash, dist: 13, radius: 1.6 },
    maxTries: 60000,
  });
  const emergentBarkMat = barkMaterial(ft.emergentBark, ft.emergentBarkNormal, barkNoise, textures.moss, {
    mossHeight: 5.5,
    mossStrength: 0.75,
    baseTint: [0.72, 0.8, 0.62],
    gradientHeight: 12,
    normalScale: 0.9,
  });
  // trunk streams carry the same world anchor as the crown so both sway in phase
  const emergentTrunkInst = instanceStream(Math.max(1, emergentPlacements.length));
  applyVertex(emergentBarkMat, { wind: { strength: 0.1, speed: 0.32, heightRef: 24, heightPow: 2.2 }, inst: emergentTrunkInst });
  const emergentTrunks = new THREE.InstancedMesh(emergentTrunk.geometry, emergentBarkMat, Math.max(1, emergentPlacements.length));
  emergentTrunks.name = 'emergent-trunks';
  // crown origin: a little above the trunk top, where the limbs converge
  const emergentCrownOrigin = [emergentTrunk.top[0], emergentTrunk.top[1] + 0.8, emergentTrunk.top[2]];
  const emergentCrowns = [];
  {
    const rng = mulberry32(WORLD.seed + 102);
    emergentPlacements.forEach((p, i) => {
      const s = 1.05 + rng() * 0.3; // 25–32 m
      const tree = { x: p.x, y: p.y - 0.4, z: p.z, yaw: rng() * TAU, s, sx: s * (0.92 + rng() * 0.16), sz: s * (0.92 + rng() * 0.16), kind: 'emergent', index: i, trunk: emergentTrunk };
      setMatrix(emergentTrunks, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      writeAnchor(emergentTrunkInst, i, tree.x, tree.y, tree.z, tree.yaw);
      bigTrees.push(tree);
      emergentCrowns.push(crownInstance(tree, emergentCrownOrigin, i));
    });
    if (emergentPlacements.length === 0) setMatrix(emergentTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
  }
  const emergentTrunkLayer = register(emergentTrunks, { castShadow: true });

  // broad, flat-topped emergent crown: a tuft-ball on each of the six limb
  // tips, a wide shallow dome over the top, two fillers under the dome
  const emergentCrownGeo = shellCrown({
    seed: 4101,
    center: emergentCrownOrigin,
    blobs: [
      ...limbBlobs(emergentTrunk, { tipR: [3.2, 2.2, 3.2], tipCount: 24, push: 0.8, size: 1.0, lobes: 3 }),
      { x: emergentTrunk.top[0], y: emergentTrunk.top[1] + 2.0, z: emergentTrunk.top[2], rx: 6.0, ry: 2.8, rz: 6.0, count: 96, lobes: 5, lobeAmp: 0.2, size: 1.12 },
      // fillers knit the limb tufts to the dome so the crown reads as one mass
      { x: emergentTrunk.top[0] + 3.2, y: emergentTrunk.top[1] - 1.8, z: emergentTrunk.top[2] - 2.6, rx: 3.0, ry: 1.9, rz: 3.0, count: 12, lobes: 2, size: 0.95 },
      { x: emergentTrunk.top[0] - 3.4, y: emergentTrunk.top[1] - 1.4, z: emergentTrunk.top[2] + 2.4, rx: 3.0, ry: 1.9, rz: 3.0, count: 12, lobes: 2, size: 0.95 },
      { x: emergentTrunk.top[0] - 1.0, y: emergentTrunk.top[1] - 2.6, z: emergentTrunk.top[2] - 3.6, rx: 2.8, ry: 1.8, rz: 2.8, count: 10, lobes: 2, size: 0.95 },
    ],
    cardSize: [2.2, 4.0],
    undersideThin: 0.3,
    innerFrac: 0.2,
    core: { w: 16.0, h: 9.0, y: 1.0 },
    upFactor: 0.72,
    spherical: 0.7,
  });
  const emergentCrownInst = instanceStream(Math.max(1, emergentCrowns.length));
  const emergentCrownMat = foliageMaterial(ft.canopyEmergent, { tint: [0.92, 1.0, 0.88], translucency: 0.4, roughness: 0.68, hueSpread: 0.12, valueSpread: 0.14, ao: [-4.5, 2.5, 0.22], doubleSided: true, cardVariation: 0.16 });
  // crown sway = the trunk's top sway (same anchor, strength, speed) so the
  // limbs stay inside their tufts; the flutter is the crown's own motion
  applyVertex(emergentCrownMat, { wind: { strength: 0.1, speed: 0.32, uniformSway: true, cardFlutter: 0.14 }, lod: CROWN_LOD, inst: emergentCrownInst });
  buildCrownLayer('emergent-crowns', emergentCrowns, emergentCrownGeo, emergentCrownMat, emergentTrunkLayer, emergentCrownInst);

  // ---------- medium canopy trees (12–18 m), 2 trunk variants × 3 crown species ----------
  const mediumTrunkBase = {
    height: 12,
    radiusBase: 0.5,
    radiusTop: 0.2,
    radial: 9,
    rings: 5,
    flareStart: 0.15,
    flarePow: 2.0,
    flareAmount: 0.7,
    lobes: 3,
    lobeAmp: 0.5,
    lobeSharp: 2.0,
    wobble: 0.28,
    branchSides: 5,
    branchSegs: 2,
    twigSides: 4,
  };
  const mediumTrunks = [
    buildTrunk({
      ...mediumTrunkBase,
      seed: 43,
      branches: [
        { t: 0.6, yaw: 0.4, tilt: 0.9, length: 3.6, radius: 0.18, curl: 0.5 },
        { t: 0.7, yaw: 2.3, tilt: 0.82, length: 3.3, radius: 0.16, curl: 0.5 },
        { t: 0.8, yaw: 4.1, tilt: 0.78, length: 3.0, radius: 0.15, curl: 0.45, twigs: 1 },
        { t: 0.9, yaw: 5.5, tilt: 0.6, length: 2.5, radius: 0.13, curl: 0.35, twigs: 1 },
      ],
    }),
    buildTrunk({
      ...mediumTrunkBase,
      seed: 44,
      wobble: 0.34,
      branches: [
        { t: 0.55, yaw: 1.2, tilt: 1.0, length: 3.8, radius: 0.19, curl: 0.55 },
        { t: 0.68, yaw: 3.4, tilt: 0.85, length: 3.4, radius: 0.16, curl: 0.5 },
        { t: 0.78, yaw: 5.2, tilt: 0.75, length: 3.0, radius: 0.15, curl: 0.45, twigs: 1 },
        { t: 0.88, yaw: 0.2, tilt: 0.7, length: 2.7, radius: 0.14, curl: 0.4, twigs: 1 },
        { t: 0.95, yaw: 2.6, tilt: 0.45, length: 2.0, radius: 0.11, curl: 0.3, twigs: 1 },
      ],
    }),
  ];
  const mediumPlacements = scatter({
    count: 1500,
    seed: 111,
    rule: (s, x, z) => {
      if (!treeRule(s, x, z)) return 0;
      if (s.canopy < 0.12) return 0;
      const rim = s.zone.rim;
      let w = Math.pow(s.canopy, 1.1) * (0.6 + 0.4 * clump(x, z, 0.035, -0.35, 0.4));
      w *= 1 + rim * 2.5; // dense skyline toward the map edge
      w *= 1 - s.zone.ravine * 0.35;
      if (s.corridor < 10) w *= 0.15; // leave the bamboo corridor to the bamboo
      return Math.min(1, w);
    },
    spacing: { hash: treeHash, dist: 4.6, radius: 0.7 },
    maxTries: 120000,
  });
  // one bark material per trunk variant: each carries its own anchor stream
  const mediumBarkMat = (inst) => {
    const mat = barkMaterial(ft.canopyBark, ft.canopyBarkNormal, barkNoise, textures.moss, {
      mossHeight: 3.2,
      mossStrength: 0.8,
      normalScale: 0.85,
    });
    applyVertex(mat, { wind: { strength: 0.13, speed: 0.4, heightRef: 12, heightPow: 2.0 }, inst });
    return mat;
  };
  // species chosen by a slow noise so the forest has patches of one kind with
  // stragglers of the others — neighbours differ, but not like a checkerboard
  const speciesAt = (x, z, r) => {
    if (r < 0.28) return Math.floor(r / 0.28 * 3) % 3;
    const v = clumpC(x * 0.018 + 31.7, z * 0.018 - 12.3);
    return v < -0.09 ? 0 : v < 0.09 ? 1 : 2;
  };
  const mediumByVariant = [[], []]; // placements split across the two trunk variants
  mediumPlacements.forEach((p, i) => mediumByVariant[i % 2].push(p));
  const mediumTrunkLayers = [];
  const mediumCrowns = [[[], [], []], [[], [], []]]; // [variant][species] → crown instances
  const mediumCrownOrigins = mediumTrunks.map((t) => [t.top[0], t.top[1] + 0.6, t.top[2]]);
  mediumByVariant.forEach((placements, variant) => {
    const trunk = mediumTrunks[variant];
    const trunkInst = instanceStream(Math.max(1, placements.length));
    const mesh = new THREE.InstancedMesh(trunk.geometry, mediumBarkMat(trunkInst), Math.max(1, placements.length));
    mesh.name = `canopy-trunks-${variant === 0 ? 'a' : 'b'}`;
    const rng = mulberry32(WORLD.seed + 112 + variant);
    placements.forEach((p, i) => {
      const rim = p.s.zone.rim;
      const s = (1.0 + rng() * 0.5) * (1 + rim * 0.22); // 12–18 m, taller on the rim
      const tree = { x: p.x, y: p.y - 0.3, z: p.z, yaw: rng() * TAU, s, sx: s * (0.9 + rng() * 0.2), sz: s * (0.9 + rng() * 0.2), kind: 'medium', index: i, variant, trunk };
      setMatrix(mesh, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      writeAnchor(trunkInst, i, tree.x, tree.y, tree.z, tree.yaw);
      bigTrees.push(tree);
      const species = speciesAt(p.x, p.z, rng());
      mediumCrowns[variant][species].push(crownInstance(tree, mediumCrownOrigins[variant], i));
    });
    if (placements.length === 0) setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    mediumTrunkLayers.push(register(mesh, { castShadow: true }));
  });

  // Three crown habits. All are limb-tip tuft balls + a main dome; the habit
  // is in the dome proportions: round, wide-and-flat (umbrella), or stacked
  // tiers (layered) with a smaller upper dome.
  const mediumCrownSpecs = [
    {
      name: 'canopy-round',
      map: ft.canopyA,
      tint: [1, 1, 1],
      cardSize: [1.5, 3.1],
      blobs: (trunk) => [
        ...limbBlobs(trunk, { tipR: [2.0, 1.6, 2.0], tipCount: 14, push: 0.5, lobes: 3 }),
        { x: trunk.top[0], y: trunk.top[1] + 1.3, z: trunk.top[2], rx: 3.8, ry: 3.0, rz: 3.8, count: 64, lobes: 4, lobeAmp: 0.24 },
      ],
      core: () => ({ w: 9.0, h: 6.4, y: 0.4 }),
      undersideThin: 0.28,
      spherical: 0.8,
    },
    {
      name: 'canopy-umbrella',
      map: ft.canopyB,
      tint: [0.94, 1.0, 0.96],
      cardSize: [1.7, 3.3],
      blobs: (trunk) => [
        ...limbBlobs(trunk, { tipR: [2.5, 1.2, 2.5], tipCount: 14, push: 0.9, tipLift: 0.5, lobes: 3 }),
        { x: trunk.top[0], y: trunk.top[1] + 0.7, z: trunk.top[2], rx: 5.0, ry: 1.8, rz: 5.0, count: 64, lobes: 5, lobeAmp: 0.18 },
      ],
      core: () => ({ w: 11.0, h: 3.6, y: 0.1 }),
      undersideThin: 0.4,
      bottomFlatten: 0.6,
      spherical: 0.6,
    },
    {
      name: 'canopy-layered',
      map: ft.canopyC,
      tint: [1.0, 1.0, 0.9],
      cardSize: [1.4, 2.9],
      blobs: (trunk) => [
        ...limbBlobs(trunk, { tipR: [1.9, 1.3, 1.9], tipCount: 12, push: 0.4, lobes: 3 }),
        { x: trunk.top[0], y: trunk.top[1] - 1.4, z: trunk.top[2], rx: 3.7, ry: 1.4, rz: 3.7, count: 38, lobes: 4, lobeAmp: 0.2 },
        { x: trunk.top[0] + 0.3, y: trunk.top[1] + 1.9, z: trunk.top[2] - 0.2, rx: 2.4, ry: 1.6, rz: 2.4, count: 30, lobes: 3, lobeAmp: 0.22 },
      ],
      core: () => ({ w: 8.4, h: 7.2, y: 0.2 }),
      undersideThin: 0.28,
      spherical: 0.7,
    },
  ];
  mediumCrownSpecs.forEach((spec, species) => {
    mediumTrunks.forEach((trunk, variant) => {
      const crowns = mediumCrowns[variant][species];
      const geo = shellCrown({
        seed: 4200 + species * 10 + variant,
        center: mediumCrownOrigins[variant],
        blobs: spec.blobs(trunk),
        cardSize: spec.cardSize,
        undersideThin: spec.undersideThin,
        bottomFlatten: spec.bottomFlatten ?? 0.72,
        core: spec.core(),
        spherical: spec.spherical,
      });
      const inst = instanceStream(Math.max(1, crowns.length));
      const mat = foliageMaterial(spec.map, { tint: spec.tint, translucency: 0.45, roughness: 0.7, hueSpread: 0.14, valueSpread: 0.18, ao: [-3.2, 1.6, 0.32], doubleSided: true, cardVariation: 0.18 });
      applyVertex(mat, { wind: { strength: 0.13, speed: 0.4, uniformSway: true, cardFlutter: 0.11 + species * 0.015 }, lod: CROWN_LOD, inst });
      buildCrownLayer(`${spec.name}-${variant === 0 ? 'a' : 'b'}`, crowns, geo, mat, mediumTrunkLayers[variant], inst);
    });
  });

  // ---------- understory trees (5–8 m, sparse crowns), 2 variants ----------
  const understoryTrunkBase = {
    height: 6,
    radiusBase: 0.16,
    radiusTop: 0.06,
    radial: 6,
    rings: 3,
    flareStart: 0.12,
    flareAmount: 0.4,
    wobble: 0.18,
    branchSides: 4,
    branchSegs: 2,
    twigSides: 4,
  };
  const understoryTrunks = [
    buildTrunk({
      ...understoryTrunkBase,
      seed: 45,
      branches: [
        { t: 0.62, yaw: 0.9, tilt: 0.95, length: 2.0, radius: 0.07, curl: 0.5, twigs: 1 },
        { t: 0.78, yaw: 3.0, tilt: 0.85, length: 1.8, radius: 0.06, curl: 0.45, twigs: 1 },
        { t: 0.9, yaw: 5.0, tilt: 0.7, length: 1.5, radius: 0.05, curl: 0.4, twigs: 1 },
      ],
    }),
    buildTrunk({
      ...understoryTrunkBase,
      seed: 46,
      wobble: 0.24,
      branches: [
        { t: 0.55, yaw: 2.2, tilt: 1.05, length: 2.2, radius: 0.075, curl: 0.55, twigs: 1 },
        { t: 0.72, yaw: 4.4, tilt: 0.9, length: 1.9, radius: 0.065, curl: 0.5, twigs: 1 },
        { t: 0.86, yaw: 0.3, tilt: 0.75, length: 1.6, radius: 0.055, curl: 0.4, twigs: 1 },
      ],
    }),
  ];
  const understoryPlacements = scatter({
    count: 1150,
    seed: 121,
    rule: (s, x, z) => {
      if (!treeRule(s, x, z, { slopeMin: 0.78, trailClear: 3.6 })) return 0;
      if (s.canopy < 0.08) return 0;
      // forest edges and glades get the most small trees
      const edge = 1 - Math.min(1, Math.abs(s.canopy - 0.45) * 2.2);
      const corridor = s.corridor < 9 ? 0.2 : 1;
      return Math.min(1, (0.25 + s.canopy * 0.5 + edge * 0.5) * (0.5 + 0.5 * clump(x, z, 0.05, -0.3, 0.35, clumpB)) * corridor);
    },
    spacing: { hash: treeHash, dist: 3, radius: 0.25 },
    maxTries: 70000,
  });
  const understoryBarkMat = (inst) => {
    const mat = barkMaterial(ft.understoryBark, ft.understoryBarkNormal, barkNoise, textures.moss, {
      mossHeight: 1.6,
      mossStrength: 0.6,
      gradientHeight: 4,
      baseTint: [0.84, 0.88, 0.74],
    });
    applyVertex(mat, { wind: { strength: 0.12, speed: 0.6, heightRef: 6, heightPow: 1.8 }, inst });
    return mat;
  };
  const understoryByVariant = [[], []];
  understoryPlacements.forEach((p, i) => understoryByVariant[i % 2].push(p));
  understoryByVariant.forEach((placements, variant) => {
    const trunk = understoryTrunks[variant];
    const trunkInst = instanceStream(Math.max(1, placements.length));
    const mesh = new THREE.InstancedMesh(trunk.geometry, understoryBarkMat(trunkInst), Math.max(1, placements.length));
    mesh.name = `understory-trunks-${variant === 0 ? 'a' : 'b'}`;
    const origin = [trunk.top[0], trunk.top[1] + 0.4, trunk.top[2]];
    const crowns = [];
    const rng = mulberry32(WORLD.seed + 122 + variant);
    placements.forEach((p, i) => {
      const s = 0.85 + rng() * 0.5; // 5–8 m
      const tree = { x: p.x, y: p.y - 0.15, z: p.z, yaw: rng() * TAU, s, sx: s * (0.9 + rng() * 0.2), sz: s * (0.9 + rng() * 0.2) };
      setMatrix(mesh, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      writeAnchor(trunkInst, i, tree.x, tree.y, tree.z, tree.yaw);
      crowns.push(crownInstance(tree, origin, i));
    });
    if (placements.length === 0) setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    const trunkLayer = register(mesh, { castShadow: true });
    // open, sparse crown: small tuft-balls on the three limbs and a loose top
    const geo = shellCrown({
      seed: 4300 + variant,
      center: origin,
      blobs: [
        ...limbBlobs(trunk, { tipR: [1.2, 0.95, 1.2], tipCount: 9, push: 0.35, tipLift: 0.15, lobes: 2 }),
        { x: trunk.top[0], y: trunk.top[1] + 0.9, z: trunk.top[2], rx: 1.9, ry: 1.45, rz: 1.9, count: 19, lobes: 3, lobeAmp: 0.25 },
      ],
      cardSize: [1.3, 1.9],
      undersideThin: 0.4,
      shadeBias: 0.6,
      innerFrac: 0.15,
      core: { w: 4.4, h: 3.4, y: 0.2 },
      spherical: 0.75,
    });
    const inst = instanceStream(Math.max(1, crowns.length));
    // one material per variant: each carries its own instance stream
    const mat = foliageMaterial(ft.canopyUnderstory, { tint: [0.96, 1.0, 0.9], translucency: 0.45, roughness: 0.66, hueSpread: 0.13, valueSpread: 0.15, ao: [-1.6, 0.9, 0.3], doubleSided: true, cardVariation: 0.16 });
    applyVertex(mat, { wind: { strength: 0.12, speed: 0.6, uniformSway: true, cardFlutter: 0.08 }, lod: { near: 90, far: 125, coreScale: 0.6 }, inst });
    buildCrownLayer(`understory-crowns-${variant === 0 ? 'a' : 'b'}`, crowns, geo, mat, trunkLayer, inst);
  });

  // =====================================================================
  // PALMS
  // =====================================================================
  const palmTrunkGeo = curvedCylinder({ radiusTop: 0.15, radiusBottom: 0.3, height: 11, radial: 7, rings: 14, lean: 2.4, ridge: 0.07, ridgeFreq: 4.2, uvV: 2.2 });
  const palmPlacements = scatter({
    count: 260,
    seed: 131,
    candidate: (rng) => (rng() < 0.7 ? shoreCandidate(rng) : uniformCandidate(rng)),
    rule: (s, x, z) => {
      if (s.h < 0.55 || s.h > 6.5) return 0;
      if (s.ny < 0.8 || s.trail < 3.5 || s.giant < 12 || s.spawn < 8) return 0;
      if (s.zone.ruins > 0.6 || s.zone.overlook > 0.5) return 0;
      if (s.canopy > 0.75 || s.keepOut < 2.0) return 0;
      const clearingEdge = s.zone.clearing > 0.12 && s.zone.clearing < 0.6 ? 0.7 : 0;
      const w = Math.max(s.water * 1.2 * (0.5 + 0.5 * clump(x, z, 0.05, -0.3, 0.3, clumpC)), clearingEdge);
      return w > 0.2 ? Math.min(1, w) : 0;
    },
    spacing: { hash: treeHash, dist: 3.2, radius: 0.3 },
    maxTries: 200000,
  });
  const palmBarkMat = barkMaterial(textures.palmBark, textures.palmBarkNormal, barkNoise, textures.moss, {
    mossHeight: 1.2,
    mossStrength: 0.4,
    gradientHeight: 6,
    baseTint: [0.8, 0.82, 0.7],
    normalScale: 0.7,
  });
  // trunk and head carry the same anchor (and each its own yaw) so the head
  // rides the swaying trunk tip instead of sliding off it
  const palmTrunkInst = instanceStream(Math.max(1, palmPlacements.length));
  const palmHeadInst = instanceStream(Math.max(1, palmPlacements.length));
  applyVertex(palmBarkMat, { wind: { strength: 0.16, speed: 0.6, heightRef: 11, heightPow: 2.2 }, inst: palmTrunkInst });
  // coconut crown: a few young fronds still rising, most arching over and the
  // oldest hanging — a rounded mop rather than a flat star from the vistas.
  // Under them a smooth green crown-shaft where the trunk ends, and two or
  // three dead brown fronds hanging down the trunk (vertex-tinted so they
  // share the frond map and draw call).
  const frondGeo = (() => {
    const live = mergeGeometries([
      radialCards(() => bentCard(1.4, 4.4, 0.62, 5, 0.4), 5, { startTilt: 0.5, tiltJitter: 0.3, yawJitter: 0.7, seed: 7, lift: 0.15 }),
      radialCards(() => bentCard(1.5, 4.8, 0.6, 5, 0.35), 8, { startTilt: 1.05, tiltJitter: 0.35, yawJitter: 0.5, seed: 8 }),
      radialCards(() => bentCard(1.3, 4.0, 0.5, 5, 0.3), 5, { startTilt: 1.7, tiltJitter: 0.3, yawJitter: 0.8, seed: 9, lift: -0.2 }),
    ]);
    addFlatColor(live, 1, 1, 1);
    // dead fronds: hang almost straight down, hugging the trunk, browned
    const dead = radialCards(() => bentCard(1.1, 3.4, 0.12, 3, 0.35), 3, { startTilt: 2.55, tiltJitter: 0.25, yawJitter: 1.4, seed: 10, lift: -0.35 });
    addFlatColor(dead, 0.66, 0.5, 0.3);
    // crown-shaft: a short tapered sleeve over the trunk tip, mapped to the
    // rachis strip of the frond texture so it reads as smooth green stem
    const shaft = new THREE.CylinderGeometry(0.2, 0.34, 1.5, 7, 1, true);
    shaft.translate(0, -0.55, 0);
    const shaftUv = shaft.attributes.uv;
    for (let i = 0; i < shaftUv.count; i += 1) {
      shaftUv.setXY(i, 0.492 + shaftUv.getX(i) * 0.016, 0.15 + shaftUv.getY(i) * 0.7);
    }
    addFlatColor(shaft, 0.85, 0.92, 0.7);
    const merged = mergeGeometries([live, dead, shaft]);
    live.dispose();
    dead.dispose();
    shaft.dispose();
    return prepareFoliage(merged, 0.6, 0.55);
  })();
  // tint pulled down and an occlusion ramp over frond height: the rising young
  // fronds are sunlit, the arching old ones sit under them in shade
  // matte (0.74): a glossy pale frond against the sky went white
  const frondMat = foliageMaterial(textures.palmFrond, { translucency: 0.32, roughness: 0.74, tint: [0.66, 0.8, 0.56], hueSpread: 0.08, valueSpread: 0.14, vertexTint: true, ao: [-1.5, 2.5, 0.3] });
  // heightFloor 0.4 × 0.4 = 0.16: the head's base moves exactly like the trunk tip
  applyVertex(frondMat, { wind: { strength: 0.4, speed: 0.6, heightRef: 4.6, heightPow: 1.2, flutter: 0.05, heightFloor: 0.4 }, inst: palmHeadInst });
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmBarkMat, Math.max(1, palmPlacements.length));
  const palmHeads = new THREE.InstancedMesh(frondGeo, frondMat, Math.max(1, palmPlacements.length));
  palmTrunks.name = 'palm-trunks';
  palmHeads.name = 'palm-heads';
  {
    const rng = mulberry32(WORLD.seed + 132);
    palmPlacements.forEach((p, i) => {
      const s = 0.7 + rng() * 0.5;
      const yaw = rng() * TAU;
      setMatrix(palmTrunks, i, p.x, p.y - 0.25, p.z, 0, yaw, 0, s, s, s);
      writeAnchor(palmTrunkInst, i, p.x, p.y - 0.25, p.z, yaw);
      // trunk tip (2.4, 11, 0) rotated by yaw
      const headYaw = rng() * TAU;
      setMatrix(palmHeads, i, p.x + Math.cos(yaw) * 2.35 * s, p.y - 0.25 + 10.9 * s, p.z - Math.sin(yaw) * 2.35 * s, 0, headYaw, 0, s * 1.05, s * 1.05, s * 1.05);
      writeAnchor(palmHeadInst, i, p.x, p.y - 0.25, p.z, headYaw);
    });
    if (palmPlacements.length === 0) {
      setMatrix(palmTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
      setMatrix(palmHeads, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
  }
  const palmTrunkLayer = register(palmTrunks, { castShadow: true });
  register(palmHeads, { castShadow: true, gate: gateSequential(palmPlacements.length, palmTrunkLayer.maxCount) });

  // ---------- short fan palms under the canopy ----------
  const fanTrunkGeo = curvedCylinder({ radiusTop: 0.1, radiusBottom: 0.17, height: 1.9, radial: 6, rings: 3, lean: 0.25, ridge: 0.1, ridgeFreq: 9, uvV: 1.6 });
  // rosette in two tiers: inner fans held up, outer fans drooping — reads as a
  // ball of fans from every angle instead of a flat disc
  // three tiers (rising / spreading / drooping) with wide tilt spread: the head
  // stays a rounded rosette from eye level instead of collapsing into a disc
  const fanCrownGeo = prepareFoliage(
    mergeGeometries([
      radialCards(() => bentCard(1.5, 1.5, 0.35, 3), 4, { startTilt: 0.45, tiltJitter: 0.5, yawJitter: 0.8, seed: 17, lift: 0.12 }),
      radialCards(() => bentCard(1.7, 1.7, 0.5, 3), 5, { startTilt: 1.0, tiltJitter: 0.5, yawJitter: 0.7, seed: 18 }),
      radialCards(() => bentCard(1.6, 1.6, 0.6, 3), 4, { startTilt: 1.5, tiltJitter: 0.35, yawJitter: 0.8, seed: 20, lift: -0.1 }),
    ]),
    0.62,
    0.55
  );
  const fanPlacements = scatter({
    count: 360,
    seed: 141,
    rule: (s, x, z) => {
      if (s.h < 0.9 || s.ny < 0.72 || s.trail < 3 || s.giant < 8 || s.spawn < 7) return 0;
      if (s.zone.clearing > 0.5 || s.zone.ruins > 0.7 || s.zone.overlook > 0.5) return 0;
      if (s.canopy < 0.3 || s.keepOut < 1.5) return 0;
      return Math.min(1, s.canopy * (0.35 + 0.65 * clump(x, z, 0.06, -0.2, 0.45, clumpC)));
    },
    spacing: { hash: plantHash, dist: 2.6, radius: 0.3, also: { hash: treeHash, dist: 1.4 } },
    maxTries: 60000,
  });
  const fanTrunkMat = barkMaterial(textures.palmBark, textures.palmBarkNormal, barkNoise, textures.moss, { mossHeight: 0.8, mossStrength: 0.5, gradientHeight: 2, normalScale: 0.6 });
  const fanCrownMat = foliageMaterial(ft.fanPalm, { translucency: 0.3, roughness: 0.62, tint: [0.82, 0.95, 0.8] });
  applyVertex(fanCrownMat, { wind: { strength: 0.12, speed: 1.0, heightRef: 1.5, heightPow: 1.2, flutter: 0.03 } });
  const fanTrunks = new THREE.InstancedMesh(fanTrunkGeo, fanTrunkMat, Math.max(1, fanPlacements.length));
  const fanCrowns = new THREE.InstancedMesh(fanCrownGeo, fanCrownMat, Math.max(1, fanPlacements.length));
  fanTrunks.name = 'fan-palm-trunks';
  fanCrowns.name = 'fan-palm-crowns';
  {
    const rng = mulberry32(WORLD.seed + 142);
    fanPlacements.forEach((p, i) => {
      // wide height spread (1–3.3 m) so the crowns never line up into a ceiling
      const s = 0.55 + Math.pow(rng(), 1.4) * 1.2;
      const yaw = rng() * TAU;
      const sw = 0.85 + rng() * 0.3;
      setMatrix(fanTrunks, i, p.x, p.y - 0.12, p.z, 0, yaw, 0, s, s, s);
      setMatrix(fanCrowns, i, p.x + Math.cos(yaw) * 0.25 * s, p.y - 0.12 + 1.85 * s, p.z - Math.sin(yaw) * 0.25 * s, (rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25, sw, sw * (0.9 + rng() * 0.2), sw);
    });
    if (fanPlacements.length === 0) {
      setMatrix(fanTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
      setMatrix(fanCrowns, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
  }
  const fanTrunkLayer = register(fanTrunks, { castShadow: true });
  register(fanCrowns, { castShadow: true, gate: gateSequential(fanPlacements.length, fanTrunkLayer.maxCount) });

  // =====================================================================
  // BAMBOO — dense corridor along the clearing → terraces trail + clumps
  // =====================================================================
  const bambooCulms = []; // { x, y, z, yaw, tiltX, tiltZ, sy, st }
  {
    const rng = mulberry32(WORLD.seed + 151);
    const trail = WORLD.trails[3];
    const bambooRule = (x, z) => {
      if (Math.abs(x) > half || Math.abs(z) > half) return false;
      const s = sampleAt(x, z);
      if (s.h < 0.8 || s.ny < 0.6) return false;
      if (s.zone.clearing > 0.45 || s.zone.ruins > 0.6 || s.zone.overlook > 0.5) return false;
      if (s.trail < 3.0 || s.giant < 10) return false;
      if (s.water > 0.7 && s.h < 1.4) return false;
      if (s.keepOut < 1.2) return false;
      return true;
    };
    const addClump = (cx, cz, n, radius) => {
      for (let k = 0; k < n; k += 1) {
        const a = rng() * TAU;
        const r = Math.sqrt(rng()) * radius;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (!bambooRule(x, z)) continue;
        if (treeHash.tooClose(x, z, 0.9)) continue;
        const splay = 0.02 + rng() * 0.07 * (r / radius);
        bambooCulms.push({
          x,
          y: terrain.sampleHeight(x, z),
          z,
          yaw: rng() * TAU,
          tiltX: Math.cos(a) * splay,
          tiltZ: -Math.sin(a) * splay,
          sy: 0.7 + rng() * 0.6, // 7–13 m
          st: 0.8 + rng() * 0.45,
        });
      }
    };
    // corridor: clumps every ~2 m along the trail, 3.2–8.5 m off the center
    // line; the inner clumps are the densest so the culms wall the path in
    let along = 6;
    for (let i = 0; i < trail.length - 1; i += 1) {
      const [ax, az] = trail[i];
      const [bx, bz] = trail[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      while (along < len) {
        const t = along / len;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        for (const side of [-1, 1]) {
          if (rng() < 0.14) continue;
          const d = 3.3 + Math.pow(rng(), 0.7) * 5.2;
          const n = d < 5 ? 7 + Math.floor(rng() * 6) : 4 + Math.floor(rng() * 5);
          addClump(px + nx * side * d, pz + nz * side * d, n, 1.25);
        }
        along += 1.7 + rng() * 1.0;
      }
      along -= len;
    }
    // a few groves elsewhere
    const groves = scatter({
      count: 9,
      seed: 152,
      rule: (s) => {
        if (s.h < 1.0 || s.ny < 0.8 || s.trail < 8 || s.giant < 20 || s.spawn < 25) return 0;
        if (s.zone.clearing > 0.2 || s.zone.ravine > 0.2 || s.zone.ruins > 0.3 || s.zone.overlook > 0.3 || s.zone.rim > 0.3) return 0;
        if (s.canopy < 0.15 || s.canopy > 0.75 || s.water > 0.5 || s.keepOut < 8) return 0;
        return 1;
      },
      spacing: { hash: plantHash, dist: 30 },
      maxTries: 20000,
    });
    groves.forEach((g) => addClump(g.x, g.z, 16 + Math.floor(rng() * 12), 2.6));
    bambooCulms.forEach((c) => treeHash.insert(c.x, c.z, 0.1));
  }
  const culmGeo = bambooCulmGeometry(10, 6);
  const culmMat = barkMaterial(ft.bambooCulm, ft.bambooNormal, barkNoise, textures.moss, {
    roughness: 0.55,
    mossHeight: 0.6,
    mossStrength: 0.35,
    lighten: 0.04,
    valueSpread: 0.14,
    normalScale: 0.5,
    baseTint: [0.85, 0.9, 0.75],
    gradientHeight: 3,
  });
  applyVertex(culmMat, { wind: { strength: 0.42, speed: 0.55, heightRef: 10, heightPow: 1.9 } });
  const culms = new THREE.InstancedMesh(culmGeo, culmMat, Math.max(1, bambooCulms.length));
  culms.name = 'bamboo-culms';
  const bambooLeafGeo = prepareFoliage(crossedCards(1.9, 1.4, 2), 0.62, 0.5);
  const bambooLeafMat = foliageMaterial(ft.bambooLeaf, { translucency: 0.4, roughness: 0.72, tint: [0.74, 0.86, 0.64], hueSpread: 0.12 });
  applyVertex(bambooLeafMat, { wind: { strength: 0.42, speed: 0.55, uniformSway: true, flutter: 0.08 } });
  const bambooLeaves = new THREE.InstancedMesh(bambooLeafGeo, bambooLeafMat, Math.max(1, bambooCulms.length * 3));
  bambooLeaves.name = 'bamboo-leaves';
  {
    const rng = mulberry32(WORLD.seed + 153);
    const leafT = [0.5, 0.72, 0.93];
    const culmMatrix = new THREE.Matrix4();
    bambooCulms.forEach((c, i) => {
      setMatrix(culms, i, c.x, c.y - 0.1, c.z, c.tiltX, c.yaw, c.tiltZ, c.st, c.sy, c.st);
      // setMatrix() left the culm transform in `dummy`; keep a copy, since the
      // leaf setMatrix() calls below reuse the same helper object
      culmMatrix.copy(dummy.matrix);
      leafT.forEach((t, k) => {
        const [ax, ay, az] = bambooAxis(t);
        tmpNormal.set(ax, ay, az).applyMatrix4(culmMatrix);
        const ls = (0.85 + rng() * 0.5) * (k === 2 ? 0.85 : 1);
        setMatrix(bambooLeaves, i * 3 + k, tmpNormal.x + (rng() - 0.5) * 0.4, tmpNormal.y, tmpNormal.z + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4, rng() * TAU, (rng() - 0.5) * 0.4, ls, ls, ls);
      });
    });
    if (bambooCulms.length === 0) {
      setMatrix(culms, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
      for (let k = 0; k < 3; k += 1) setMatrix(bambooLeaves, k, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
  }
  const culmLayer = register(culms, { castShadow: true });
  register(bambooLeaves, {
    castShadow: false,
    gate: Float64Array.from({ length: Math.max(1, bambooCulms.length * 3) }, (_, i) => gateOf(Math.floor(i / 3), culmLayer.maxCount)),
  });

  // =====================================================================
  // UNDERSTORY PLANTS
  // =====================================================================
  const plantRule = (s, { trailClear = 2.8, giantClear = 6, minHeight = 0.75, slopeMin = 0.64, allowClearing = false, allowRuins = false } = {}) => {
    if (s.h < minHeight || s.ny < slopeMin) return false;
    if (s.trail < trailClear) return false;
    if (s.giant < giantClear) return false;
    if (s.spawn < 5) return false;
    if (!allowClearing && s.zone.clearing > 0.6) return false;
    if (!allowRuins && s.zone.ruins > 0.75) return false;
    if (s.zone.overlook > 0.85) return false;
    if (s.keepOut < 0.6) return false;
    return true;
  };
  const treeClear = (x, z, d) => !treeHash.tooClose(x, z, d);

  // ---------- tree ferns (ravine) ----------
  const treeFernTrunkGeo = curvedCylinder({ radiusTop: 0.14, radiusBottom: 0.22, height: 2.6, radial: 6, rings: 3, lean: 0.2, ridge: 0.08, ridgeFreq: 7, uvV: 1.4 });
  // two tiers of arching fronds (young ones held up, old ones drooping) so
  // the crown is a rounded shuttlecock, not a flat star
  const treeFernCrownGeo = prepareFoliage(
    mergeGeometries([
      radialCards(() => bentCard(0.9, 2.2, 0.55, 5, 0.25), 5, { startTilt: 0.62, tiltJitter: 0.35, yawJitter: 0.8, seed: 31, lift: 0.1 }),
      radialCards(() => bentCard(1.1, 2.7, 0.85, 5, 0.2), 8, { startTilt: 1.12, tiltJitter: 0.4, yawJitter: 0.5, seed: 32 }),
    ]),
    0.62,
    0.5
  );
  const treeFernPlacements = scatter({
    count: 240,
    seed: 221,
    rule: (s, x, z) => {
      if (!plantRule(s, { slopeMin: 0.7, trailClear: 3.2, giantClear: 12 })) return 0;
      if (!treeClear(x, z, 1.5)) return 0;
      const w = s.zone.ravine * 1.3 + (s.canopy > 0.75 && s.water > 0.2 ? 0.5 : 0) + s.zone.terrace * 0.35 * (s.canopy > 0.3 ? 1 : 0);
      return w > 0.3 ? Math.min(1, w) : 0;
    },
    spacing: { hash: plantHash, dist: 2.4, radius: 0.5 },
    maxTries: 60000,
  });
  const treeFernTrunkMat = barkMaterial(ft.treeFernBark, ft.treeFernBarkNormal, barkNoise, textures.moss, { mossHeight: 1.5, mossStrength: 0.7, gradientHeight: 3, normalScale: 0.9 });
  // kept well below the canopy greens: a shade plant, not a lime lantern
  const treeFernCrownMat = foliageMaterial(ft.treeFernFrond, { translucency: 0.35, roughness: 0.74, tint: [0.68, 0.8, 0.6], valueSpread: 0.16, ao: [0, 1.4, 0.3] });
  applyVertex(treeFernCrownMat, { wind: { strength: 0.2, speed: 0.9, heightRef: 2.6, heightPow: 1.2, flutter: 0.04 } });
  const treeFernTrunks = new THREE.InstancedMesh(treeFernTrunkGeo, treeFernTrunkMat, Math.max(1, treeFernPlacements.length));
  const treeFernCrowns = new THREE.InstancedMesh(treeFernCrownGeo, treeFernCrownMat, Math.max(1, treeFernPlacements.length));
  treeFernTrunks.name = 'tree-fern-trunks';
  treeFernCrowns.name = 'tree-fern-crowns';
  {
    const rng = mulberry32(WORLD.seed + 222);
    treeFernPlacements.forEach((p, i) => {
      const s = 0.8 + rng() * 0.55;
      const yaw = rng() * TAU;
      setMatrix(treeFernTrunks, i, p.x, p.y - 0.15, p.z, 0, yaw, 0, s, s, s);
      setMatrix(treeFernCrowns, i, p.x + Math.cos(yaw) * 0.2 * s, p.y - 0.15 + 2.5 * s, p.z - Math.sin(yaw) * 0.2 * s, 0, rng() * TAU, 0, s, s, s);
      treeHash.insert(p.x, p.z, 0.2);
    });
    if (treeFernPlacements.length === 0) {
      setMatrix(treeFernTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
      setMatrix(treeFernCrowns, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
  }
  const treeFernLayer = register(treeFernTrunks, { castShadow: true });
  register(treeFernCrowns, { castShadow: true, gate: gateSequential(treeFernPlacements.length, treeFernLayer.maxCount) });

  // ---------- heliconia near water (clumps) ----------
  const heliconiaCenters = scatter({
    count: 130,
    seed: 231,
    candidate: shoreCandidate,
    rule: (s) => {
      if (!plantRule(s, { minHeight: 0.6, slopeMin: 0.75, trailClear: 3.2 })) return 0;
      if (s.water < 0.3 || s.h > 4 || s.canopy > 0.7) return 0;
      return 1;
    },
    spacing: { hash: plantHash, dist: 4 },
    maxTries: 40000,
  });
  const heliconiaGeoBase = crossedCards(1.3, 2.6, 2);
  heliconiaGeoBase.translate(0, 1.3, 0);
  const heliconiaGeo = prepareFoliage(heliconiaGeoBase, 0.7);
  const heliconiaMat = foliageMaterial(ft.heliconia, { translucency: 0.5, roughness: 0.6, fade: [90, 120], hueSpread: 0.06, ao: [0, 1.6, 0.35] });
  const heliconiaInst = instanceStream(520);
  applyVertex(heliconiaMat, { wind: { strength: 0.1, speed: 1.1, heightRef: 2.4, flutter: 0.03 }, fade: [90, 120], inst: heliconiaInst });
  buildSimple({
    name: 'heliconia',
    geometry: heliconiaGeo,
    material: heliconiaMat,
    seed: 233,
    placements: scatter({
      count: 520,
      seed: 232,
      candidate: clusterCandidate(heliconiaCenters, 2.6),
      rule: (s, x, z) => (plantRule(s, { minHeight: 0.6, slopeMin: 0.7, trailClear: 2.8 }) && treeClear(x, z, 0.6) ? 1 : 0),
      maxTries: 30000,
    }),
    scale: (p, rng) => 0.7 + rng() * 0.6,
    yJitter: 0.3,
    densityKey: 'grass',
    inst: heliconiaInst,
  });

  // ---------- taro / elephant ear ----------
  const taroGeo = prepareFoliage(radialCards(() => bentCard(1.45, 2.1, 0.45, 3, 0.1), 5, { startTilt: 0.6, tiltJitter: 0.5, yawJitter: 0.6, seed: 19 }), 0.62, 0.4);
  const taroMat = foliageMaterial(ft.taro, { translucency: 0.6, roughness: 0.45, fade: [110, 140], tint: [0.95, 1, 0.95], ao: [0, 1.3, 0.3] });
  const taroInst = instanceStream(640);
  applyVertex(taroMat, { wind: { strength: 0.12, speed: 0.9, heightRef: 2.0, flutter: 0.04 }, fade: [110, 140], inst: taroInst });
  buildSimple({
    name: 'taro',
    geometry: taroGeo,
    material: taroMat,
    seed: 182,
    placements: scatter({
      count: 640,
      seed: 181,
      rule: (s, x, z) => {
        if (!plantRule(s, { minHeight: 0.65, slopeMin: 0.66 })) return 0;
        if (!treeClear(x, z, 1.0)) return 0;
        const w = s.zone.ravine * 1.2 + s.water * 0.9 * (s.h < 3 ? 1 : 0.3);
        if (w < 0.25) return 0;
        return Math.min(1, w * (0.3 + 0.7 * clump(x, z, 0.07, -0.25, 0.45, clumpB)));
      },
      spacing: { hash: plantHash, dist: 1.3, radius: 0.4 },
      maxTries: 80000,
    }),
    scale: (p, rng) => 0.7 + rng() * 0.8,
    inst: taroInst,
  });

  // ---------- philodendron clusters ----------
  const philoGeo = prepareFoliage(radialCards(() => bentCard(0.95, 1.5, 0.5, 3, 0.1), 6, { startTilt: 0.7, tiltJitter: 0.5, seed: 23 }), 0.64, 0.45);
  const philoMat = foliageMaterial(ft.philodendron, { translucency: 0.5, roughness: 0.42, fade: [100, 130], tint: [0.95, 1.0, 0.98], ao: [0, 1.0, 0.3] });
  const philoInst = instanceStream(700);
  applyVertex(philoMat, { wind: { strength: 0.08, speed: 1.0, heightRef: 1.4, flutter: 0.03 }, fade: [100, 130], inst: philoInst });
  buildSimple({
    name: 'philodendron',
    geometry: philoGeo,
    material: philoMat,
    seed: 192,
    placements: scatter({
      count: 700,
      seed: 191,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.45 })) return 0;
        if (!treeClear(x, z, 0.8)) return 0;
        const bank = s.ny < 0.7 && s.canopy > 0.3 ? 0.45 : 0; // scrambles up shaded banks
        const w = s.zone.ravine * 1.4 + (s.canopy > 0.65 ? (s.canopy - 0.65) * 1.5 : 0) + bank + s.cliff * 0.7;
        if (w < 0.2) return 0;
        return Math.min(1, w * (0.3 + 0.7 * clump(x, z, 0.08, -0.2, 0.5, clumpA)));
      },
      spacing: { hash: plantHash, dist: 1.1, radius: 0.3 },
      maxTries: 80000,
    }),
    scale: (p, rng) => 0.7 + rng() * 0.7,
    align: 0.5,
    inst: philoInst,
  });

  // ---------- bushes / shrubs ----------
  const bushGeo = prepareFoliage(shrubCluster(2.2, 1.7, 5), 0.72, 0.7);
  bushGeo.translate(0, 0.72, 0);
  const bushMat = foliageMaterial(ft.bush, { translucency: 0.45, roughness: 0.7, fade: [105, 135], hueSpread: 0.12, ao: [0, 1.4, 0.4] });
  const bushInst = instanceStream(3800);
  applyVertex(bushMat, { wind: { strength: 0.12, speed: 0.9, heightRef: 1.8, heightPow: 1.3, flutter: 0.04 }, fade: [105, 135], inst: bushInst });
  buildSimple({
    name: 'bushes',
    geometry: bushGeo,
    material: bushMat,
    seed: 162,
    placements: scatter({
      count: 3800,
      seed: 161,
      rule: (s, x, z) => {
        // 0.68 ≈ 47°: past that a shrub's downhill side hangs off the face
        if (!plantRule(s, { slopeMin: 0.68 })) return 0;
        if ((s.canopy < 0.08 && s.water < 0.4 && s.cliff < 0.3) || s.zone.clearing > 0.5) return 0;
        if (!treeClear(x, z, 1.3)) return 0;
        const edge = 1 - Math.min(1, Math.abs(s.canopy - 0.4) * 2);
        const bank = s.ny < 0.75 ? 0.35 : 0; // hardy shrubs hold the steeper banks
        const shore = s.water > 0.4 && s.h < 3 ? 0.5 : 0; // thickets down to the waterline
        // 0.42 baseline: shade-tolerant shrubs keep the deep-canopy understory from reading empty
        return Math.min(1, (0.42 + edge * 0.6 + bank + shore + s.cliff * 0.9) * (0.35 + 0.65 * clump(x, z, 0.045, -0.3, 0.45, clumpB)) * (1 - s.zone.ravine * 0.5));
      },
      spacing: { hash: plantHash, dist: 1.5, radius: 0.4 },
      maxTries: 120000,
    }),
    scale: (p, rng) => 0.6 + rng() * 0.9,
    yJitter: 0.3,
    sink: 0.22,
    align: 0.5,
    inst: bushInst,
  });

  // ---------- banana ----------
  const bananaGeo = prepareFoliage(radialCards(() => bentCard(1.5, 3.0, 0.6, 4, 0.2), 6, { startTilt: 0.55, tiltJitter: 0.5, seed: 13 }), 0.62, 0.4);
  const bananaMat = foliageMaterial(textures.bananaLeaf, { translucency: 0.65, roughness: 0.5, fade: [120, 150], ao: [0, 1.8, 0.3] });
  const bananaInst = instanceStream(620);
  applyVertex(bananaMat, { wind: { strength: 0.16, speed: 1.0, heightRef: 2.6, flutter: 0.05 }, fade: [120, 150], inst: bananaInst });
  buildSimple({
    name: 'banana-plants',
    geometry: bananaGeo,
    material: bananaMat,
    seed: 172,
    placements: scatter({
      count: 620,
      seed: 171,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.68, trailClear: 3 })) return 0;
        if (s.zone.clearing > 0.4 || !treeClear(x, z, 1.2)) return 0;
        const w = 0.15 + s.water * 0.8 + s.zone.ravine * 0.6 + (s.canopy > 0.15 && s.canopy < 0.6 ? 0.35 : 0);
        return Math.min(1, w * (0.3 + 0.7 * clump(x, z, 0.06, -0.2, 0.5, clumpC)));
      },
      spacing: { hash: plantHash, dist: 1.6, radius: 0.5 },
      maxTries: 60000,
    }),
    scale: (p, rng) => 0.65 + rng() * 0.85,
    inst: bananaInst,
  });

  // ---------- ferns (two sizes) ----------
  const fernGeo = prepareFoliage(radialCards(() => bentCard(0.95, 1.6, 0.55, 3, 0.15), 6, { startTilt: 0.8, tiltJitter: 0.4, seed: 11 }), 0.64, 0.5);
  const fernMat = foliageMaterial(textures.fern, { translucency: 0.6, roughness: 0.72, fade: [105, 135], ao: [0, 0.9, 0.35] });
  const fernInst = instanceStream(2000);
  applyVertex(fernMat, { wind: { strength: 0.09, speed: 1.4, heightRef: 1.3, flutter: 0.03 }, fade: [105, 135], inst: fernInst });
  buildSimple({
    name: 'ferns',
    geometry: fernGeo,
    material: fernMat,
    seed: 202,
    placements: scatter({
      count: 2000,
      seed: 201,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.45 })) return 0; // ferns cling to banks up to ~63°
        if (!treeClear(x, z, 0.7)) return 0;
        const shade = s.canopy >= 0.22 ? s.canopy * (0.6 + s.zone.terrace * 0.9) : 0;
        const ravine = s.zone.ravine * 0.9; // the ravine floor has no canopy field but stays damp and shaded
        const bank = s.ny < 0.7 ? 0.5 : 0;
        const w = shade + ravine + bank + s.cliff * 1.2;
        if (w < 0.15) return 0;
        return Math.min(1, w * (0.35 + 0.65 * clump(x, z, 0.05, -0.3, 0.4, clumpC)));
      },
      spacing: { hash: plantHash, dist: 0.9, radius: 0.2 },
      maxTries: 90000,
    }),
    // crevice ferns on a steep face are small tufts; a full-size rosette
    // tilted off a wall reads as a plant glued onto it
    scale: (p, rng) => (0.85 + rng() * 0.9) * (0.55 + 0.45 * sstep(0.55, 0.85, p.s.ny)),
    align: 0.6,
    inst: fernInst,
  });
  const fernSmallGeo = prepareFoliage(radialCards(() => bentCard(0.6, 0.95, 0.6, 2, 0.15), 5, { startTilt: 0.9, tiltJitter: 0.4, seed: 29 }), 0.64, 0.5);
  const fernSmallMat = foliageMaterial(ft.fernB, { translucency: 0.6, roughness: 0.72, fade: [70, 95], hueSpread: 0.13, ao: [0, 0.6, 0.35] });
  const fernSmallInst = instanceStream(4000);
  applyVertex(fernSmallMat, { wind: { strength: 0.06, speed: 1.6, heightRef: 0.9, flutter: 0.03 }, fade: [70, 95], inst: fernSmallInst });
  buildSimple({
    name: 'ferns-small',
    geometry: fernSmallGeo,
    material: fernSmallMat,
    seed: 212,
    placements: scatter({
      count: 4000,
      seed: 211,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.42, giantClear: 4 })) return 0;
        if (!treeClear(x, z, 0.4)) return 0;
        if (s.canopy < 0.12 && s.zone.ravine < 0.3 && s.cliff < 0.3) return 0;
        const bank = s.ny < 0.7 ? 0.4 : 0;
        return Math.min(1, (0.2 + s.canopy + bank + s.zone.ravine * 0.6 + s.cliff * 1.0) * (0.4 + 0.6 * clump(x, z, 0.09, -0.3, 0.4, clumpA)));
      },
      maxTries: 90000,
    }),
    scale: (p, rng) => 0.7 + rng() * 0.8,
    align: 0.7,
    densityKey: 'grass',
    inst: fernSmallInst,
  });


  // =====================================================================
  // FLOWERS
  // =====================================================================
  // ---------- tropical flowers under the forest edge ----------
  const flowerGeoBase = crossedCards(0.85, 0.85, 2);
  flowerGeoBase.translate(0, 0.42, 0);
  const flowerGeo = prepareFoliage(flowerGeoBase, 0.7);
  const flowerSpots = scatter({
    count: 520,
    seed: 241,
    rule: (s, x, z) => {
      if (!plantRule(s, { minHeight: 0.65, slopeMin: 0.7, trailClear: 2.6, giantClear: 4 })) return 0;
      if (s.canopy > 0.7 || !treeClear(x, z, 0.5)) return 0;
      return Math.min(1, 0.3 + clump(x, z, 0.08, -0.1, 0.5, clumpB));
    },
    maxTries: 50000,
  });
  [textures.flower, textures.flowerB].forEach((map, v) => {
    const mat = foliageMaterial(map, { translucency: 0.35, roughness: 0.65, fade: [70, 95], hueSpread: 0.06 });
    const inst = instanceStream(flowerSpots.length);
    applyVertex(mat, { wind: { strength: 0.07, speed: 1.5 + v * 0.1, heightRef: 0.8, flutter: 0.02 }, fade: [70, 95], inst });
    buildSimple({
      name: `flowers-${v}`,
      geometry: flowerGeo,
      material: mat,
      seed: 242 + v,
      placements: flowerSpots.filter((_, i) => i % 2 === v),
      scale: (p, rng) => 0.6 + rng() * 0.5,
      densityKey: 'grass',
      inst,
    });
  });

  // ---------- meadow flowers (clearing + sunny glades, clumped) ----------
  const meadowCenters = scatter({
    count: 130,
    seed: 251,
    rule: (s) => {
      if (!plantRule(s, { slopeMin: 0.72, trailClear: 3, allowClearing: true })) return 0;
      if (s.zone.clearing > 0.25) return 1;
      if (s.canopy < 0.22 && s.water < 0.3 && s.zone.rim < 0.4 && s.zone.overlook < 0.6) return 0.6;
      return 0;
    },
    spacing: { hash: plantHash, dist: 3.5 },
    maxTries: 60000,
  });
  const meadowGeoBase = crossedCards(0.95, 0.75, 2);
  meadowGeoBase.translate(0, 0.36, 0);
  const meadowGeo = prepareFoliage(meadowGeoBase, 0.72);
  const meadowSpots = scatter({
    count: 1500,
    seed: 252,
    candidate: clusterCandidate(meadowCenters, 3.2),
    rule: (s, x, z) => (plantRule(s, { slopeMin: 0.7, trailClear: 2.5, allowClearing: true, giantClear: 3 }) && treeClear(x, z, 0.4) ? 1 : 0),
    maxTries: 40000,
  });
  [ft.meadowA, ft.meadowB].forEach((map, v) => {
    const mat = foliageMaterial(map, { translucency: 0.4, roughness: 0.7, fade: [60, 85], hueSpread: 0.05, valueSpread: 0.1 });
    const inst = instanceStream(meadowSpots.length);
    applyVertex(mat, { wind: { strength: 0.08, speed: 1.6, heightRef: 0.7, flutter: 0.03 }, fade: [60, 85], inst });
    buildSimple({
      name: `meadow-flowers-${v}`,
      geometry: meadowGeo,
      material: mat,
      seed: 253 + v,
      placements: meadowSpots.filter((_, i) => i % 2 === v),
      scale: (p, rng) => 0.7 + rng() * 0.6,
      densityKey: 'grass',
      inst,
    });
  });

  // =====================================================================
  // GRASSES / REEDS / GROUND COVER
  // =====================================================================
  const grassGeoBase = crossedCards(1.35, 0.9, 2);
  grassGeoBase.translate(0, 0.4, 0);
  const grassGeo = prepareFoliage(grassGeoBase, 0.78);
  // Far-only filler: the near field belongs to the streamed Bezier-blade tufts
  // in grass.js, so these crossed cards only grow in where that disc dissolves
  // (GRASS_DISC_FADE follows the preset) and carry the turf out to ~125 m.
  // Olive tint so blades sit in the ground's grass albedo instead of glowing
  // lime above it.
  const grassHandover = [GRASS_DISC_FADE.start, GRASS_DISC_FADE.end];
  const grassMat = foliageMaterial(textures.grassBlade, { translucency: 0.35, roughness: 0.8, fade: [95, 125], fadeIn: grassHandover, hueSpread: 0.1, valueSpread: 0.18, tint: [0.66, 0.74, 0.54], ao: [0, 0.65, 0.5] });
  const grassInst = instanceStream(16000);
  applyVertex(grassMat, { wind: { strength: 0.14, speed: 1.7, heightRef: 0.8, flutter: 0.05 }, fade: [95, 125], fadeIn: grassHandover, inst: grassInst });
  buildSimple({
    name: 'grass',
    geometry: grassGeo,
    material: grassMat,
    seed: 262,
    placements: scatter({
      count: 16000,
      seed: 261,
      rule: (s, x, z) => {
        if (s.h < 0.6 || s.ny < 0.72) return 0;
        if (s.trail < WORLD.trailHalfWidth + 0.3) return 0;
        if (s.zone.ruins > 0.85) return 0;
        let w = (1 - s.canopy * 0.7) * (0.45 + 0.55 * clump(x, z, 0.11, -0.4, 0.4, clumpA));
        // the terrain shader turns to bare rock over slope 0.16..0.4 — thin the
        // turf out over the same range so blades never sprout from a cliff face
        w *= 1 - sstep(0.16, 0.34, 1 - s.ny);
        w *= 1 + s.zone.clearing * 0.9;
        w *= 1 - s.zone.ravine * 0.5;
        w *= 1 - s.zone.rim * 0.45;
        if (s.water > 0.5 && s.h < 1.2) w *= 0.15; // sand
        return Math.min(1, w);
      },
      maxTries: 400000,
    }),
    scale: (p, rng) => 0.55 + rng() * 0.6,
    sink: 0.12,
    densityKey: 'grass',
    inst: grassInst,
  });

  const tallGrassGeoBase = crossedCards(1.4, 1.75, 3);
  tallGrassGeoBase.translate(0, 0.82, 0);
  const tallGrassGeo = prepareFoliage(tallGrassGeoBase, 0.75);
  const tallGrassMat = foliageMaterial(ft.tallGrass, { translucency: 0.5, roughness: 0.78, fade: [80, 110], hueSpread: 0.08, valueSpread: 0.16, tint: [0.76, 0.82, 0.66], ao: [0, 1.3, 0.45] });
  const tallGrassInst = instanceStream(4200);
  applyVertex(tallGrassMat, { wind: { strength: 0.24, speed: 1.3, heightRef: 1.6, heightPow: 1.3, flutter: 0.06 }, fade: [80, 110], inst: tallGrassInst });
  buildSimple({
    name: 'tall-grass',
    geometry: tallGrassGeo,
    material: tallGrassMat,
    seed: 272,
    placements: scatter({
      count: 4200,
      seed: 271,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.74, trailClear: 2.6, allowClearing: true, giantClear: 3 })) return 0;
        if (!treeClear(x, z, 0.5)) return 0;
        // meadow: patchy so the clearing has waist-high drifts and open lawn
        if (s.zone.clearing > 0.2) return Math.min(1, (0.2 + s.zone.clearing * 0.7) * (0.35 + 0.65 * clump(x, z, 0.05, -0.3, 0.35, clumpA)));
        // sunny glades outside the ravine / rim
        if (s.canopy < 0.28 && s.water < 0.35 && s.zone.rim < 0.5 && s.zone.ravine < 0.25) return 0.3 * clump(x, z, 0.06, 0.0, 0.5, clumpB);
        return 0;
      },
      maxTries: 200000,
    }),
    scale: (p, rng) => 0.6 + rng() * 0.7,
    sink: 0.1,
    densityKey: 'grass',
    inst: tallGrassInst,
  });

  const reedGeoBase = crossedCards(0.8, 1.9, 2);
  reedGeoBase.translate(0, 0.9, 0);
  const reedGeo = prepareFoliage(reedGeoBase, 0.75);
  const reedMat = foliageMaterial(ft.reed, { translucency: 0.5, roughness: 0.75, fade: [90, 120], hueSpread: 0.07, ao: [0, 1.3, 0.4] });
  const reedInst = instanceStream(1500);
  applyVertex(reedMat, { wind: { strength: 0.2, speed: 1.2, heightRef: 1.8, heightPow: 1.5, flutter: 0.04 }, fade: [90, 120], inst: reedInst });
  buildSimple({
    name: 'reeds',
    geometry: reedGeo,
    material: reedMat,
    seed: 282,
    placements: scatter({
      count: 1500,
      seed: 281,
      candidate: shoreCandidate,
      rule: (s, x, z) => {
        if (s.h < 0.25 || s.h > 1.4 || s.ny < 0.6 || s.trail < 2.4 || s.spawn < 5) return 0;
        if (s.water < 0.5) return 0;
        return Math.min(1, s.water * (0.4 + 0.6 * clump(x, z, 0.12, -0.3, 0.4, clumpC)));
      },
      maxTries: 200000,
    }),
    scale: (p, rng) => 0.7 + rng() * 0.6,
    sink: 0.15,
    densityKey: 'grass',
    inst: reedInst,
  });

  const seedlingGeoBase = crossedCards(0.7, 0.55, 2);
  seedlingGeoBase.translate(0, 0.26, 0);
  const seedlingGeo = prepareFoliage(seedlingGeoBase, 0.75, 0.3);
  const seedlingMat = foliageMaterial(ft.seedling, { translucency: 0.5, roughness: 0.7, fade: [45, 65], hueSpread: 0.12, ao: [0, 0.45, 0.4] });
  const seedlingInst = instanceStream(6400);
  applyVertex(seedlingMat, { wind: { strength: 0.04, speed: 1.5, heightRef: 0.5, flutter: 0.02 }, fade: [45, 65], inst: seedlingInst });
  buildSimple({
    name: 'seedlings',
    geometry: seedlingGeo,
    material: seedlingMat,
    seed: 292,
    placements: scatter({
      count: 6400,
      seed: 291,
      rule: (s, x, z) => {
        if (!plantRule(s, { slopeMin: 0.7, trailClear: 2.6, giantClear: 3 })) return 0;
        if (s.canopy < 0.3) return 0;
        return Math.min(1, s.canopy * (0.4 + 0.6 * clump(x, z, 0.1, -0.3, 0.4, clumpB)));
      },
      maxTries: 200000,
    }),
    scale: (p, rng) => 0.6 + rng() * 0.8,
    align: 0.6,
    sink: 0.04,
    densityKey: 'grass',
    inst: seedlingInst,
  });

  const mushroomCenters = scatter({
    count: 280,
    seed: 301,
    rule: (s) => (plantRule(s, { slopeMin: 0.7, trailClear: 2.6, giantClear: 3 }) && s.canopy > 0.55 ? 1 : 0),
    maxTries: 60000,
  });
  const mushroomGeoBase = crossedCards(0.24, 0.2, 2);
  mushroomGeoBase.translate(0, 0.09, 0);
  const mushroomGeo = prepareFoliage(mushroomGeoBase, 0.7);
  const mushroomMat = foliageMaterial(ft.mushroom, { translucency: 0.15, roughness: 0.6, fade: [30, 45], hueSpread: 0.05, valueSpread: 0.15 });
  const mushroomInst = instanceStream(1300);
  applyVertex(mushroomMat, { fade: [30, 45], inst: mushroomInst });
  buildSimple({
    name: 'mushrooms',
    geometry: mushroomGeo,
    material: mushroomMat,
    seed: 303,
    placements: scatter({
      count: 1300,
      seed: 302,
      candidate: clusterCandidate(mushroomCenters, 1.6),
      rule: (s) => (plantRule(s, { slopeMin: 0.65, trailClear: 2.5, giantClear: 3 }) ? 1 : 0),
      maxTries: 30000,
    }),
    scale: (p, rng) => 0.6 + rng() * 0.7,
    yJitter: 0.3,
    align: 0.8,
    sink: 0.02,
    densityKey: 'grass',
    inst: mushroomInst,
  });

  // =====================================================================
  // ATTACHMENTS: vines, lianas, epiphytes, orchids (follow their tree)
  // =====================================================================
  // Attachments from both tree layers share one mesh; each item carries the
  // density gate of its own tree so the list can be sorted and truncated.
  const emergents = bigTrees.filter((t) => t.kind === 'emergent');
  const mediums = bigTrees.filter((t) => t.kind === 'medium');
  emergents.forEach((t) => {
    t.gate = gateOf(t.index, emergentTrunkLayer.maxCount);
  });
  mediums.forEach((t) => {
    t.gate = gateOf(t.index, mediumTrunkLayers[t.variant].maxCount);
  });

  function attachmentLayer(name, items, geometry, material, { castShadow = false } = {}) {
    items.sort((a, b) => a.gate - b.gate);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    mesh.name = name;
    items.forEach((it, i) => {
      setMatrix(mesh, i, it.x, it.y, it.z, it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s);
    });
    if (items.length === 0) setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    return register(mesh, { castShadow, gate: Float64Array.from(items.length ? items : [{ gate: 0 }], (it) => it.gate) });
  }

  // vines hang from crown clusters; length limited so they never reach the ground
  const vineGeo = prepareFoliage(vineGeometry(), 0.55);
  const vineMat = foliageMaterial(ft.vine, { translucency: 0.5, roughness: 0.7, fade: [110, 140], hueSpread: 0.1 });
  applyVertex(vineMat, { wind: { strength: 0.45, speed: 0.55, heightRef: 7, pivotTop: true, heightPow: 1.6, flutter: 0.04 } });
  const vines = [];
  {
    const rng = mulberry32(WORLD.seed + 311);
    const hang = (tree, prob, maxPer) => {
      for (let k = 0; k < maxPer; k += 1) {
        if (rng() > prob) continue;
        const tips = tree.trunk.branchTips;
        const tip = tips[Math.floor(rng() * tips.length)];
        const [wx, wy, wz] = treeToWorld(tree, tip[0] * (0.6 + rng() * 0.5), tip[1] + 0.3, tip[2] * (0.6 + rng() * 0.5));
        const ground = terrain.sampleHeight(wx, wz);
        // a third of the vines drop nearly to the floor (classic liana curtain),
        // the rest dangle inside the crown
        const drop = rng() < 0.35 ? 0.88 + rng() * 0.08 : 0.35 + rng() * 0.35;
        const s = ((wy - ground) * drop) / 7;
        if (s < 0.35) continue;
        vines.push({ x: wx, y: wy, z: wz, ry: rng() * TAU, s, sx: 0.8 + rng() * 0.5, sy: s, sz: 0.8 + rng() * 0.5, gate: tree.gate });
      }
    };
    emergents.forEach((t) => hang(t, 0.9, 5));
    mediums.forEach((t) => hang(t, 0.4, 2));
  }
  attachmentLayer('vines', vines, vineGeo, vineMat);

  // looping lianas slung between branches
  const lianaGeo = prepareFoliage(lianaLoopGeometry(), 0.5);
  const lianaMat = foliageMaterial(ft.liana, { translucency: 0.1, roughness: 0.85, hueSpread: 0.03, valueSpread: 0.12, alphaTest: 0.4 });
  applyVertex(lianaMat, { wind: { strength: 0.12, speed: 0.5, uniformSway: true } });
  const lianas = [];
  {
    const rng = mulberry32(WORLD.seed + 321);
    emergents.forEach((t) => {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k += 1) {
        const tip = t.trunk.branchTips[Math.floor(rng() * t.trunk.branchTips.length)];
        const [wx, wy, wz] = treeToWorld(t, tip[0] * 0.55, tip[1] - 0.6, tip[2] * 0.55);
        const s = 1.0 + rng() * 0.9;
        lianas.push({ x: wx, y: wy, z: wz, ry: rng() * TAU, rz: (rng() - 0.5) * 0.4, s, sx: s, sy: s * (0.8 + rng() * 0.5), sz: s, gate: t.gate });
      }
    });
    mediums.forEach((t) => {
      if (rng() > 0.22) return;
      const tip = t.trunk.branchTips[Math.floor(rng() * t.trunk.branchTips.length)];
      const [wx, wy, wz] = treeToWorld(t, tip[0] * 0.5, tip[1] - 0.4, tip[2] * 0.5);
      const s = 0.7 + rng() * 0.6;
      lianas.push({ x: wx, y: wy, z: wz, ry: rng() * TAU, rz: (rng() - 0.5) * 0.4, s, sx: s, sy: s * (0.8 + rng() * 0.5), sz: s, gate: t.gate });
    });
  }
  attachmentLayer('lianas', lianas, lianaGeo, lianaMat);

  // epiphytes (bromeliads) sitting on branches
  const bromeliadGeoBase = crossedCards(0.95, 0.75, 3);
  bromeliadGeoBase.translate(0, 0.3, 0);
  const bromeliadGeo = prepareFoliage(bromeliadGeoBase, 0.7);
  const bromeliadMat = foliageMaterial(ft.bromeliad, { translucency: 0.5, roughness: 0.6, fade: [80, 110], hueSpread: 0.08 });
  applyVertex(bromeliadMat, { wind: { strength: 0.05, speed: 1.2, uniformSway: true, flutter: 0.02 } });
  const epiphytes = [];
  {
    const rng = mulberry32(WORLD.seed + 331);
    const perch = (tree, prob, along) => {
      tree.trunk.branchBases.forEach((base, b) => {
        if (rng() > prob) return;
        const tip = tree.trunk.branchTips[b];
        const f = along + rng() * 0.3;
        const lx = base[0] + (tip[0] - base[0]) * f;
        const ly = base[1] + (tip[1] - base[1]) * f + 0.12;
        const lz = base[2] + (tip[2] - base[2]) * f;
        const [wx, wy, wz] = treeToWorld(tree, lx, ly, lz);
        const s = (0.7 + rng() * 0.6) * (tree.kind === 'emergent' ? 1.4 : 1);
        epiphytes.push({ x: wx, y: wy, z: wz, ry: rng() * TAU, s, gate: tree.gate });
      });
    };
    emergents.forEach((t) => perch(t, 0.75, 0.25));
    mediums.forEach((t) => perch(t, 0.18, 0.3));
  }
  attachmentLayer('epiphytes', epiphytes, bromeliadGeo, bromeliadMat);

  // orchids on trunks (small cards facing outward, tilted off the bark)
  const orchidGeoBase = new THREE.PlaneGeometry(0.6, 0.6);
  orchidGeoBase.translate(0, 0.3, 0);
  const orchidGeo = prepareFoliage(orchidGeoBase, 0.55);
  const orchidMat = foliageMaterial(ft.orchid, { translucency: 0.35, roughness: 0.6, fade: [50, 70], hueSpread: 0.15 });
  applyVertex(orchidMat, { wind: { strength: 0.03, speed: 1.4, heightRef: 0.6, flutter: 0.015 } });
  const orchids = [];
  {
    const rng = mulberry32(WORLD.seed + 341);
    const grow = (tree, prob, maxPer) => {
      for (let k = 0; k < maxPer; k += 1) {
        if (rng() > prob) continue;
        const t = 0.1 + rng() * 0.3;
        const a = rng() * TAU;
        const [cx, cy, cz] = tree.trunk.centerAt(t);
        const r = tree.trunk.radiusAt(t) * (1 + Math.pow(Math.max(0, 1 - t / 0.2), 1.8) * 0.5) + 0.03;
        const [wx, wy, wz] = treeToWorld(tree, cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
        const [ox, , oz] = treeToWorld(tree, cx + Math.cos(a) * (r + 1), cy, cz + Math.sin(a) * (r + 1));
        const yaw = Math.atan2(ox - wx, oz - wz);
        const s = 0.7 + rng() * 0.6;
        orchids.push({ x: wx, y: wy, z: wz, rx: 0.5, ry: yaw, s, gate: tree.gate });
      }
    };
    emergents.forEach((t) => grow(t, 0.8, 5));
    mediums.forEach((t) => grow(t, 0.3, 2));
  }
  attachmentLayer('orchids', orchids, orchidGeo, orchidMat);

  // =====================================================================
  // quality scaling + stats
  // =====================================================================
  function upperBound(arr, value) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function applyQuality(preset) {
    for (const layer of layers) {
      const density = layer.densityKey === 'grass' ? preset.grassDensity : preset.vegetationDensity;
      const n = layer.gate ? upperBound(layer.gate, density + 1e-9) : Math.round(layer.maxCount * density);
      layer.mesh.count = Math.max(1, Math.min(layer.maxCount, n));
    }
    for (const mesh of meshes) {
      if (mesh.material.map) {
        mesh.material.map.anisotropy = preset.anisotropy;
      }
    }
  }

  function stats() {
    const rows = layers.map(({ mesh, maxCount }) => {
      const g = mesh.geometry;
      const triPer = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      return { name: mesh.name, count: mesh.count, max: maxCount, triPerInstance: triPer, triangles: Math.round(triPer * mesh.count), castShadow: mesh.castShadow };
    });
    return { layers: rows, triangles: rows.reduce((s, r) => s + r.triangles, 0), drawCalls: rows.length };
  }

  const built = stats();
  console.info(`[vegetation] ${built.drawCalls} layers, ${built.triangles.toLocaleString()} tris @ full density, built in ${(performance.now() - t0).toFixed(0)} ms`);

  // Post-hoc cull for props that only exist after the flora is planted (the
  // water module's shore boulders): any instance standing inside a disc is
  // collapsed to zero scale, so reeds and taro never sprout out of a rock.
  function cullNear(discs) {
    if (!discs?.length) return 0;
    const cell = 4;
    const grid = new Map();
    for (const d of discs) {
      const r = d.r ?? 1;
      for (let gx = Math.floor((d.x - r) / cell); gx <= Math.floor((d.x + r) / cell); gx += 1) {
        for (let gz = Math.floor((d.z - r) / cell); gz <= Math.floor((d.z + r) / cell); gz += 1) {
          const key = `${gx},${gz}`;
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          list.push(d);
        }
      }
    }
    let culled = 0;
    for (const { mesh } of layers) {
      ctx.culler?.beginEdit(mesh); // edits address the original instance order
      const arr = mesh.instanceMatrix.array;
      let touched = false;
      for (let i = 0; i < mesh.instanceMatrix.count; i += 1) {
        const o = i * 16;
        const x = arr[o + 12];
        const z = arr[o + 14];
        const list = grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
        if (!list) continue;
        for (const d of list) {
          const dx = x - d.x;
          const dz = z - d.z;
          if (dx * dx + dz * dz < (d.r ?? 1) * (d.r ?? 1)) {
            for (let k = 0; k < 12; k += 1) arr[o + k] = 0;
            culled += 1;
            touched = true;
            break;
          }
        }
      }
      if (touched) {
        mesh.instanceMatrix.needsUpdate = true;
        ctx.culler?.refresh(mesh);
      }
    }
    return culled;
  }

  return {
    meshes,
    layers,
    stats,
    applyQuality,
    cullNear,
    update() {
      if (ctx.sky?.sunDirection) {
        sunDirUniform.value.copy(ctx.sky.sunDirection);
      }
      if (ctx.camera) {
        viewPosUniform.value.copy(ctx.camera.position);
      }
    },
  };
}

// Crown toolkit for other modules that place trees (the landmark kapok):
// build a shell crown geometry, wrap a leaf atlas in the crown material, and
// give the material a per-instance anchor stream so its LOD / wind match the
// vegetation crowns. The atlas comes from createLeafClusterTexture({atlas: 2}).
export { shellCrown, foliageMaterial, applyVertex, instanceStream };
