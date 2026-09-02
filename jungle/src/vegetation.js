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
  instanceIndex,
  mix,
  texture,
  smoothstep,
  uniform,
  normalMap,
  dot,
  cross,
  uv,
  instancedBufferAttribute,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, createFbm2D, smoothstep as sstep, clamp as clampJs, lerp } from './noise.js';
import { createFoliageTextures } from './foliage-textures.js';

const TAU = Math.PI * 2;
const WIND_HEADING = 0.7; // radians — dominant wind direction on the xz plane
// Small ground cover lives on its own render layer (enabled on the main camera)
// so secondary passes — the water's planar reflection — can leave it out.
export const GROUND_COVER_LAYER = 1;

// Sun direction shared by every leaf material (back-lit translucency).
const sunDirUniform = uniform(new THREE.Vector3(0.3, 0.9, 0.3));

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

// Sway offset. NOTE: in this three.js build a material's positionNode runs on
// the *pre-instance* local position (the instance matrix is applied after it),
// so everything here is in the plant's own space. The phase therefore comes
// from the instance's world base (the `inst` stream) when a layer has one, so
// a gust front still travels across the map; layers without a stream fall
// back to a per-instance hash plus the local position (per-branch variation).
function windDisplacement({
  strength = 0.16,
  speed = 1.1,
  heightRef = 3,
  heightPow = 1.4,
  pivotTop = false,
  uniformSway = false,
  flutter = 0,
  phaseScale = 0.13,
}, worldBase = null) {
  const wp = worldBase || positionLocal;
  const phase = wp.x.mul(phaseScale).add(wp.z.mul(phaseScale * 0.77)).add(hash(instanceIndex).mul(0.7));
  const t = time.mul(speed).add(phase);
  const gust = sin(t).add(sin(t.mul(1.71).add(1.3)).mul(0.5)).add(sin(t.mul(3.13).add(2.2)).mul(0.27));
  const env = gustEnvelope(wp.x, wp.z);

  let heightFactor;
  if (uniformSway) {
    heightFactor = float(1);
  } else {
    const raw = pivotTop ? positionGeometry.y.negate().div(heightRef) : positionGeometry.y.div(heightRef);
    heightFactor = raw.clamp(0, 1).pow(heightPow);
  }

  const sway = gust.mul(strength).mul(heightFactor).mul(env);
  const dir = float(WIND_HEADING).add(hash(instanceIndex.add(77)).sub(0.5).mul(1.1));
  let offset = vec3(sway.mul(cos(dir)), 0, sway.mul(sin(dir)));
  if (flutter > 0) {
    const f = sin(time.mul(5.3).add(phase.mul(2.3)).add(positionGeometry.y.mul(3.1)))
      .mul(flutter)
      .mul(heightFactor)
      .mul(env.mul(0.7).add(0.3));
    offset = offset.add(vec3(f.mul(cos(dir.add(1.5))), f.mul(0.35), f.mul(sin(dir.add(1.5)))));
  }
  return offset;
}

// Vertex stage: wind + optional far-distance collapse toward the instance base
// (so faded-out cards stop producing fragments at all). The collapse scales
// the local geometry toward its own origin — the plant's pivot — because the
// instance matrix is applied after this node; mixing toward the world base
// here would land half-faded plants at M·base, i.e. floating in the sky.
function applyVertex(material, { wind = null, fade = null, inst = null } = {}) {
  let pos = positionLocal;
  const base = inst ? inst.node.xyz : null;
  if (wind) {
    pos = pos.add(windDisplacement(wind, base));
  }
  if (fade && inst) {
    const dist = base.sub(cameraPosition).length();
    const keep = smoothstep(fade[0], fade[1], dist).oneMinus();
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
  const rA = hash(instanceIndex.add(123));
  const rB = hash(instanceIndex.add(321));
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
  alphaTest = 0.42,
  ao = null, // [yLow, yHigh, darkness]: occlusion gradient over the pre-instance local height
} = {}) {
  const material = new THREE.MeshStandardNodeMaterial({
    map,
    side: THREE.FrontSide, // geometry carries a flipped-winding copy instead
    roughness,
    metalness: 0,
    alphaTest,
  });
  const { value, hueAngle, tint: tintNode } = perInstanceTint(hueSpread, valueSpread, tint);
  const mapColor = texture(map);
  let color = hueRotate(mapColor.rgb, hueAngle).mul(value).mul(tintNode);
  if (ao) {
    // cheap self-occlusion: the base of a clump / the underside of a crown sits
    // in its own shade, tips and the top catch the light
    const occlusion = mix(float(1 - ao[2]), float(1), smoothstep(ao[0], ao[1], positionGeometry.y));
    color = color.mul(occlusion);
  }
  material.colorNode = color;

  let alpha = mapColor.a;
  if (fade) {
    const dist = positionWorld.sub(cameraPosition).length();
    alpha = alpha.mul(smoothstep(fade[0], fade[1], dist).oneMinus());
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
    const transmitted = backlight.add(underside).mul(translucency).mul(facingSun.mul(0.7).oneMinus()).min(0.32);
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
  const value = mix(float(1 - valueSpread), float(1 + valueSpread), hash(instanceIndex.add(11)));
  const hueAngle = hash(instanceIndex.add(29)).sub(0.5).mul(2 * hueSpread);
  // per-instance V offset: neighbouring trunks no longer share ring phase
  const bark = texture(map, uv().add(vec2(0, hash(instanceIndex.add(5)))));
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
  material.normalNode = normalMap(texture(normalTex, uv().add(vec2(0, hash(instanceIndex.add(5))))).rgb, vec2(normalScale));
  material.roughnessNode = mix(float(roughness), float(0.98), mossMask);
  return material;
}

// Per-instance vec4 stream (base x, y, z, scale) for fade collapse.
function instanceStream(count) {
  const array = new Float32Array(count * 4);
  const attribute = new THREE.InstancedBufferAttribute(array, 4);
  attribute.setUsage(THREE.StaticDrawUsage);
  return { array, attribute, node: instancedBufferAttribute(attribute, 'vec4') };
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
function prepareFoliage(geometry, upFactor = 0.7, spherical = 0, centerFrac = 0.35) {
  const normal = geometry.attributes.normal;
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cy = bb.min.y + (bb.max.y - bb.min.y) * centerFrac; // centre sits low: the underside is the shaded part
  const cz = (bb.min.z + bb.max.z) * 0.5;
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
    const cap = new THREE.PlaneGeometry(width, width);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, height * 0.22, 0);
    parts.push(cap);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Crown "puff" geometries — several silhouettes so a forest never reads as
// rows of the same broccoli.
function crownCluster(type, w, h) {
  const parts = [];
  const cap = (size, y, tiltX = 0, tiltZ = 0) => {
    const p = new THREE.PlaneGeometry(size, size);
    p.rotateX(-Math.PI / 2 + tiltX);
    p.rotateZ(tiltZ);
    p.translate(0, y, 0);
    return p;
  };
  // Octagonal fan whose rim sags below the centre: the big top layer of a
  // crown reads as a shallow dome from the side (curved silhouette, drooping
  // fringe) instead of a razor-edged plate. 8 tris instead of 2, so only the
  // widest cap of each crown type uses it.
  const dome = (size, y, sag, tiltX = 0, tiltZ = 0) => {
    const r = size * 0.5;
    const positions = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const indices = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + Math.PI / 8;
      positions.push(Math.cos(a) * r, -sag, Math.sin(a) * r);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      indices.push(0, 1 + ((i + 1) % 8), 1 + i);
    }
    const p = new THREE.BufferGeometry();
    p.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    p.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    p.setIndex(indices);
    p.computeVertexNormals();
    p.rotateX(tiltX);
    p.rotateZ(tiltZ);
    p.translate(0, y, 0);
    return p;
  };
  const vertical = (pw, ph, yaw, y = 0) => {
    const p = new THREE.PlaneGeometry(pw, ph);
    p.rotateY(yaw);
    p.translate(0, y, 0);
    return p;
  };
  switch (type) {
    case 'umbrella':
      // flat-topped species: one domed top layer, a tilted second layer that
      // crosses it (edges never run parallel), and three side cards for body
      parts.push(dome(w * 1.3, h * 0.36, h * 0.24, 0.1, 0.05), cap(w * 0.9, h * 0.04, -0.2, 0.3));
      parts.push(vertical(w * 0.9, h * 0.82, 0.2, -h * 0.08), vertical(w * 0.9, h * 0.82, 0.2 + Math.PI / 3, -h * 0.08), vertical(w * 0.9, h * 0.82, 0.2 + (2 * Math.PI) / 3, -h * 0.08));
      break;
    case 'layered':
      parts.push(dome(w * 1.15, -h * 0.2, h * 0.16, 0.1, -0.06), cap(w * 0.85, h * 0.06, -0.14, 0.18), cap(w * 0.55, h * 0.32, 0.1, -0.15));
      parts.push(vertical(w * 0.8, h * 0.95, 0.3), vertical(w * 0.8, h * 0.95, 0.3 + Math.PI / 2));
      break;
    case 'sparse':
      parts.push(vertical(w, h, 0), vertical(w, h, Math.PI / 2), cap(w * 0.8, h * 0.15, 0.25));
      break;
    case 'wide':
      parts.push(dome(w * 1.4, h * 0.32, h * 0.22, 0.06, 0.04), cap(w * 1.0, -h * 0.05, -0.16, 0.22));
      parts.push(vertical(w, h * 0.75, 0, -h * 0.05), vertical(w, h * 0.75, Math.PI / 3, -h * 0.05), vertical(w, h * 0.75, (2 * Math.PI) / 3, -h * 0.05));
      break;
    case 'round':
    default:
      parts.push(vertical(w, h, 0), vertical(w, h, Math.PI / 3), vertical(w, h, (2 * Math.PI) / 3), cap(w * 0.95, h * 0.22));
      break;
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
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
  branches = [],
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

  const parts = [trunk];
  const branchTips = [];
  const branchBases = [];
  const branchDirs = [];
  for (const br of branches) {
    const { t, yaw, tilt, length, radius } = br;
    const [cx, y0, cz] = centerAt(t);
    const rTrunk = radiusAt(t);
    const dir = [Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt), Math.sin(tilt) * Math.cos(yaw)];
    const start = [cx + dir[0] * rTrunk * 0.5, y0, cz + dir[2] * rTrunk * 0.5];
    const geo = new THREE.CylinderGeometry(radius * 0.35, radius, length, 5, 1, true);
    geo.translate(0, length / 2, 0);
    geo.rotateX(tilt);
    geo.rotateY(yaw);
    geo.translate(start[0], start[1], start[2]);
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i += 1) {
      uvAttr.setXY(i, uvAttr.getX(i), uvAttr.getY(i) * (length / uvV));
    }
    parts.push(geo);
    branchBases.push(start);
    branchDirs.push(dir);
    branchTips.push([start[0] + dir[0] * length, start[1] + dir[1] * length, start[2] + dir[2] * length]);
  }
  const geometry = parts.length > 1 ? mergeGeometries(parts) : trunk;
  if (parts.length > 1) {
    parts.forEach((p) => p.dispose());
  }
  return { geometry, branchTips, branchBases, branchDirs, top: centers[rings], radiusAt, centerAt, height };
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
      if (align > 0) {
        field.normal(p.x, p.z, tmpNormal);
        tmpQuat.setFromUnitVectors(upVec, tmpNormal);
        tmpQuat2.identity().slerp(tmpQuat, align);
        dummy.quaternion.setFromAxisAngle(upVec, rng() * TAU).premultiply(tmpQuat2);
      } else {
        dummy.rotation.set(
          randomTilt ? (rng() - 0.5) * randomTilt : 0,
          rng() * TAU,
          randomTilt ? (rng() - 0.5) * randomTilt : 0
        );
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (inst) {
        const o = i * 4;
        inst.array[o] = p.x;
        inst.array[o + 1] = p.y - sink;
        inst.array[o + 2] = p.z;
        inst.array[o + 3] = s;
      }
    });
    if (placements.length === 0) {
      setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    }
    return register(mesh, { castShadow, densityKey });
  }

  // tree-local → world (instance = T · Ry(yaw) · S)
  function treeToWorld(tree, lx, ly, lz) {
    const c = Math.cos(tree.yaw);
    const s = Math.sin(tree.yaw);
    return [
      tree.x + (lx * c + lz * s) * tree.sx,
      tree.y + ly * tree.s,
      tree.z + (-lx * s + lz * c) * tree.sz,
    ];
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
    branches: [
      { t: 0.6, yaw: 0.2, tilt: 1.1, length: 6.8, radius: 0.34 },
      { t: 0.68, yaw: 1.55, tilt: 1.05, length: 6.2, radius: 0.32 },
      { t: 0.76, yaw: 2.9, tilt: 1.0, length: 5.8, radius: 0.3 },
      { t: 0.84, yaw: 4.2, tilt: 0.95, length: 5.2, radius: 0.27 },
      { t: 0.9, yaw: 5.4, tilt: 0.85, length: 4.6, radius: 0.24 },
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
  applyVertex(emergentBarkMat, { wind: { strength: 0.06, speed: 0.32, heightRef: 24, heightPow: 2.2 } });
  const emergentTrunks = new THREE.InstancedMesh(emergentTrunk.geometry, emergentBarkMat, Math.max(1, emergentPlacements.length));
  emergentTrunks.name = 'emergent-trunks';
  const emergentClusters = [];
  {
    const rng = mulberry32(WORLD.seed + 102);
    emergentPlacements.forEach((p, i) => {
      const s = 1.05 + rng() * 0.3; // 25–32 m
      const tree = { x: p.x, y: p.y - 0.4, z: p.z, yaw: rng() * TAU, s, sx: s * (0.92 + rng() * 0.16), sz: s * (0.92 + rng() * 0.16), kind: 'emergent', index: i, trunk: emergentTrunk };
      setMatrix(emergentTrunks, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      bigTrees.push(tree);
      // crown: 5 branch tips, top, 4 fillers — 10 clusters per tree (constant for quality scaling)
      const local = [];
      emergentTrunk.branchTips.forEach((tip, b) => {
        const dir = emergentTrunk.branchDirs[b];
        local.push({ x: tip[0] + dir[0] * 1.2, y: tip[1] + dir[1] * 0.4 + 0.3, z: tip[2] + dir[2] * 1.2, cs: 1.0 });
      });
      local.push({ x: emergentTrunk.top[0], y: emergentTrunk.top[1] + 1.4, z: emergentTrunk.top[2], cs: 1.05 });
      for (let f = 0; f < 4; f += 1) {
        const a = rng() * TAU;
        const rad = 3 + rng() * 2.5;
        local.push({ x: Math.cos(a) * rad, y: emergentTrunk.top[1] - 2.5 - rng() * 2, z: Math.sin(a) * rad, cs: 0.85 + rng() * 0.2 });
      }
      local.forEach((c) => {
        const [wx, wy, wz] = treeToWorld(tree, c.x + (rng() - 0.5) * 0.8, c.y + (rng() - 0.5) * 0.8, c.z + (rng() - 0.5) * 0.8);
        emergentClusters.push({ x: wx, y: wy, z: wz, s: c.cs * s * (0.9 + rng() * 0.25), owner: i, tilt: (rng() - 0.5) * 0.3 });
      });
    });
    if (emergentPlacements.length === 0) setMatrix(emergentTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
  }
  const emergentTrunkLayer = register(emergentTrunks, { castShadow: true });

  function buildCrownLayer(name, clusters, geometry, material, ownerLayer, { castShadow = true } = {}) {
    const rng = mulberry32(WORLD.seed + 7 + name.length * 13);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, clusters.length));
    mesh.name = name;
    clusters.forEach((c, i) => {
      setMatrix(mesh, i, c.x, c.y, c.z, c.tilt ?? (rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3, c.s, c.s * (0.85 + rng() * 0.3), c.s);
    });
    if (clusters.length === 0) setMatrix(mesh, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
    return register(mesh, { castShadow, gate: gateFromOwners(clusters, ownerLayer.maxCount) });
  }

  const emergentCrownGeo = prepareFoliage(crownCluster('wide', 10.5, 6.2), 0.7, 0.6, 0.28);
  const emergentCrownMat = foliageMaterial(ft.canopyEmergent, { tint: [0.9, 1.0, 0.88], translucency: 0.4, roughness: 0.68, ao: [-2.6, 1.6, 0.3] });
  applyVertex(emergentCrownMat, { wind: { strength: 0.45, speed: 0.4, uniformSway: true, flutter: 0.05 } });
  buildCrownLayer('emergent-crowns', emergentClusters, emergentCrownGeo, emergentCrownMat, emergentTrunkLayer);

  // ---------- medium canopy trees (12–18 m), 3 crown species ----------
  const mediumTrunk = buildTrunk({
    height: 12,
    radiusBase: 0.5,
    radiusTop: 0.22,
    radial: 8,
    rings: 5,
    flareStart: 0.15,
    flarePow: 2.0,
    flareAmount: 0.7,
    lobes: 3,
    lobeAmp: 0.5,
    lobeSharp: 2.0,
    wobble: 0.28,
    seed: 43,
    branches: [
      { t: 0.64, yaw: 0.4, tilt: 0.8, length: 3.4, radius: 0.17 },
      { t: 0.76, yaw: 2.5, tilt: 0.75, length: 3.1, radius: 0.15 },
      { t: 0.87, yaw: 4.6, tilt: 0.7, length: 2.7, radius: 0.13 },
    ],
  });
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
  const mediumBarkMat = barkMaterial(ft.canopyBark, ft.canopyBarkNormal, barkNoise, textures.moss, {
    mossHeight: 3.2,
    mossStrength: 0.8,
    normalScale: 0.85,
  });
  applyVertex(mediumBarkMat, { wind: { strength: 0.07, speed: 0.4, heightRef: 12, heightPow: 2.0 } });
  const mediumTrunks = new THREE.InstancedMesh(mediumTrunk.geometry, mediumBarkMat, Math.max(1, mediumPlacements.length));
  mediumTrunks.name = 'canopy-trunks';
  const mediumClusters = [[], [], []];
  {
    const rng = mulberry32(WORLD.seed + 112);
    mediumPlacements.forEach((p, i) => {
      const rim = p.s.zone.rim;
      const s = (1.0 + rng() * 0.5) * (1 + rim * 0.22); // 12–18 m, taller on the rim
      const tree = { x: p.x, y: p.y - 0.3, z: p.z, yaw: rng() * TAU, s, sx: s * (0.9 + rng() * 0.2), sz: s * (0.9 + rng() * 0.2), kind: 'medium', index: i, trunk: mediumTrunk };
      setMatrix(mediumTrunks, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      bigTrees.push(tree);
      const variant = i % 3;
      const wide = variant === 1 ? 1.25 : 1.0; // umbrella species spreads wider
      const local = [];
      mediumTrunk.branchTips.forEach((tip, b) => {
        const dir = mediumTrunk.branchDirs[b];
        local.push({ x: (tip[0] + dir[0] * 0.5) * wide, y: tip[1] + dir[1] * 0.3 + 0.2, z: (tip[2] + dir[2] * 0.5) * wide, cs: 1.0 });
      });
      local.push({ x: mediumTrunk.top[0], y: mediumTrunk.top[1] + (variant === 1 ? 0.3 : 0.9), z: mediumTrunk.top[2], cs: variant === 1 ? 1.15 : 1.05 });
      // three fillers spread around the crown so neighbouring crowns knit together
      const a0 = rng() * TAU;
      for (let f = 0; f < 3; f += 1) {
        const a = a0 + (f / 3) * TAU + (rng() - 0.5) * 0.8;
        const rad = (2.4 + rng() * 1.3) * wide;
        local.push({ x: Math.cos(a) * rad, y: mediumTrunk.top[1] - 1.0 - rng() * 1.4, z: Math.sin(a) * rad, cs: 0.85 + rng() * 0.2 });
      }
      local.forEach((c) => {
        const [wx, wy, wz] = treeToWorld(tree, c.x + (rng() - 0.5) * 0.7, c.y + (rng() - 0.5) * 0.6, c.z + (rng() - 0.5) * 0.7);
        mediumClusters[variant].push({ x: wx, y: wy, z: wz, s: c.cs * s * (0.9 + rng() * 0.25), owner: i, tilt: (rng() - 0.5) * (variant === 1 ? 0.24 : 0.35) });
      });
    });
    if (mediumPlacements.length === 0) setMatrix(mediumTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
  }
  const mediumTrunkLayer = register(mediumTrunks, { castShadow: true });

  // cap-heavy species get a softer, lower-centred shading proxy so their wide
  // top layers don't split into a lit half and a black half
  const mediumCrownSpecs = [
    { name: 'canopy-round', type: 'round', map: ft.canopyA, w: 8.0, h: 5.8, tint: [1, 1, 1], spherical: 0.75, center: 0.35 },
    { name: 'canopy-umbrella', type: 'umbrella', map: ft.canopyB, w: 7.6, h: 5.2, tint: [0.94, 1.0, 0.96], spherical: 0.55, center: 0.22 },
    { name: 'canopy-layered', type: 'layered', map: ft.canopyC, w: 7.4, h: 6.0, tint: [1.0, 1.0, 0.9], spherical: 0.65, center: 0.3 },
  ];
  mediumCrownSpecs.forEach((spec, v) => {
    const geo = prepareFoliage(crownCluster(spec.type, spec.w, spec.h), 0.7, spec.spherical, spec.center);
    const mat = foliageMaterial(spec.map, { tint: spec.tint, translucency: 0.45, roughness: 0.7, hueSpread: 0.14, ao: [-spec.h * 0.45, spec.h * 0.25, 0.3] });
    applyVertex(mat, { wind: { strength: 0.38 + v * 0.03, speed: 0.48 - v * 0.03, uniformSway: true, flutter: 0.06 } });
    buildCrownLayer(spec.name, mediumClusters[v], geo, mat, mediumTrunkLayer);
  });

  // ---------- understory trees (5–8 m, sparse crowns) ----------
  const understoryTrunk = buildTrunk({
    height: 6,
    radiusBase: 0.16,
    radiusTop: 0.07,
    radial: 6,
    rings: 3,
    flareStart: 0.12,
    flareAmount: 0.4,
    wobble: 0.18,
    seed: 45,
    branches: [
      { t: 0.7, yaw: 0.9, tilt: 0.85, length: 1.9, radius: 0.07 },
      { t: 0.84, yaw: 3.6, tilt: 0.8, length: 1.6, radius: 0.06 },
    ],
  });
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
  const understoryBarkMat = barkMaterial(ft.understoryBark, ft.understoryBarkNormal, barkNoise, textures.moss, {
    mossHeight: 1.6,
    mossStrength: 0.6,
    gradientHeight: 4,
    baseTint: [0.84, 0.88, 0.74],
  });
  applyVertex(understoryBarkMat, { wind: { strength: 0.08, speed: 0.6, heightRef: 6, heightPow: 1.8 } });
  const understoryTrunks = new THREE.InstancedMesh(understoryTrunk.geometry, understoryBarkMat, Math.max(1, understoryPlacements.length));
  understoryTrunks.name = 'understory-trunks';
  const understoryClusters = [];
  {
    const rng = mulberry32(WORLD.seed + 122);
    understoryPlacements.forEach((p, i) => {
      const s = 0.85 + rng() * 0.5; // 5–8 m
      const tree = { x: p.x, y: p.y - 0.15, z: p.z, yaw: rng() * TAU, s, sx: s * (0.9 + rng() * 0.2), sz: s * (0.9 + rng() * 0.2) };
      setMatrix(understoryTrunks, i, tree.x, tree.y, tree.z, 0, tree.yaw, 0, tree.sx, tree.s, tree.sz);
      const local = understoryTrunk.branchTips.map((tip, b) => {
        const dir = understoryTrunk.branchDirs[b];
        return { x: tip[0] + dir[0] * 0.4, y: tip[1] + 0.2, z: tip[2] + dir[2] * 0.4, cs: 0.9 };
      });
      local.push({ x: understoryTrunk.top[0], y: understoryTrunk.top[1] + 0.6, z: understoryTrunk.top[2], cs: 1.0 });
      local.forEach((c) => {
        const [wx, wy, wz] = treeToWorld(tree, c.x, c.y, c.z);
        understoryClusters.push({ x: wx, y: wy, z: wz, s: c.cs * s * (0.9 + rng() * 0.3), owner: i, tilt: (rng() - 0.5) * 0.4 });
      });
    });
    if (understoryPlacements.length === 0) setMatrix(understoryTrunks, 0, 0, -50, 0, 0, 0, 0, 0.001, 0.001, 0.001);
  }
  const understoryTrunkLayer = register(understoryTrunks, { castShadow: true });
  const understoryCrownGeo = prepareFoliage(crownCluster('sparse', 3.6, 2.9), 0.68, 0.7);
  const understoryCrownMat = foliageMaterial(ft.canopyUnderstory, { tint: [0.96, 1.0, 0.9], translucency: 0.45, roughness: 0.66, hueSpread: 0.13, ao: [-1.4, 1.0, 0.28] });
  applyVertex(understoryCrownMat, { wind: { strength: 0.22, speed: 0.7, uniformSway: true, flutter: 0.06 } });
  buildCrownLayer('understory-crowns', understoryClusters, understoryCrownGeo, understoryCrownMat, understoryTrunkLayer);

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
  applyVertex(palmBarkMat, { wind: { strength: 0.16, speed: 0.6, heightRef: 11, heightPow: 2.2 } });
  // coconut crown: a few young fronds still rising, most arching over and the
  // oldest hanging — a rounded mop rather than a flat star from the vistas
  const frondGeo = prepareFoliage(
    mergeGeometries([
      radialCards(() => bentCard(1.4, 4.4, 0.62, 5, 0.4), 5, { startTilt: 0.5, tiltJitter: 0.3, yawJitter: 0.7, seed: 7, lift: 0.15 }),
      radialCards(() => bentCard(1.5, 4.8, 0.55, 5, 0.35), 8, { startTilt: 1.05, tiltJitter: 0.35, yawJitter: 0.5, seed: 8 }),
      radialCards(() => bentCard(1.3, 4.0, 0.3, 4, 0.3), 4, { startTilt: 1.55, tiltJitter: 0.3, yawJitter: 0.8, seed: 9, lift: -0.2 }),
    ]),
    0.6,
    0.55
  );
  // matte-ish and a shade darker: a glossy pale frond against the sky went white
  const frondMat = foliageMaterial(textures.palmFrond, { translucency: 0.4, roughness: 0.74, tint: [0.7, 0.83, 0.6], hueSpread: 0.08 });
  applyVertex(frondMat, { wind: { strength: 0.4, speed: 0.8, heightRef: 4.6, heightPow: 1.2, flutter: 0.05 } });
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
      // trunk tip (2.4, 11, 0) rotated by yaw
      setMatrix(palmHeads, i, p.x + Math.cos(yaw) * 2.35 * s, p.y - 0.25 + 10.9 * s, p.z - Math.sin(yaw) * 2.35 * s, 0, rng() * TAU, 0, s * 1.05, s * 1.05, s * 1.05);
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
  const bambooLeafMat = foliageMaterial(ft.bambooLeaf, { translucency: 0.4, roughness: 0.6, tint: [0.86, 0.96, 0.76], hueSpread: 0.12 });
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
  const treeFernCrownGeo = prepareFoliage(radialCards(() => bentCard(1.1, 2.6, 0.78, 4, 0.2), 8, { startTilt: 1.0, tiltJitter: 0.4, yawJitter: 0.5, seed: 31 }), 0.62, 0.5);
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
  const treeFernCrownMat = foliageMaterial(ft.treeFernFrond, { translucency: 0.6, roughness: 0.7, tint: [0.95, 1.0, 0.9] });
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
  const bushGeo = prepareFoliage(crossedCards(2.2, 1.7, 3, true), 0.72, 0.7);
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
  // olive tint so blades sit in the ground's grass albedo instead of glowing lime above it
  const grassMat = foliageMaterial(textures.grassBlade, { translucency: 0.35, roughness: 0.8, fade: [70, 95], hueSpread: 0.1, valueSpread: 0.18, tint: [0.66, 0.74, 0.54], ao: [0, 0.65, 0.5] });
  const grassInst = instanceStream(34000);
  applyVertex(grassMat, { wind: { strength: 0.14, speed: 1.7, heightRef: 0.8, flutter: 0.05 }, fade: [70, 95], inst: grassInst });
  buildSimple({
    name: 'grass',
    geometry: grassGeo,
    material: grassMat,
    seed: 262,
    placements: scatter({
      count: 34000,
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
    scale: (p, rng) => 0.65 + rng() * 1.05,
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
  const mushroomGeoBase = crossedCards(0.34, 0.28, 2);
  mushroomGeoBase.translate(0, 0.13, 0);
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
    t.gate = gateOf(t.index, mediumTrunkLayer.maxCount);
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
      if (touched) mesh.instanceMatrix.needsUpdate = true;
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
    },
  };
}
