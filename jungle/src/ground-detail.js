// Ground micro-props on and beside the trails: pebbles and larger stones
// (half sunk, rock textured), twigs (single and crossed), flat leaf clumps,
// exposed roots arching across the path near trees, and still puddles in the
// trail hollows. Six draw calls: five InstancedMeshes plus one merged puddle
// mesh. Placement is deterministic through the terrain API; every instanced
// layer collapses to a point beyond ~60 m in the vertex stage (analytic — no
// vertex-stage texture reads).
//
// The instanced layers go through the instance culler, which rewrites their
// buffers per view with only the instances that can reach a pixel (inside a
// frustum and closer than the 60 m collapse). Per-instance randoms therefore
// key off the culler's stable id attribute rather than instanceIndex.

import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  positionLocal,
  positionGeometry,
  positionWorld,
  cameraPosition,
  normalWorld,
  texture,
  float,
  vec2,
  vec3,
  mix,
  smoothstep,
  hash,
  instanceIndex,
  instancedArray,
  attribute,
  sin,
  cos,
  uv,
  normalMap,
  time,
  normalize,
  dot,
  pow,
  clamp,
} from 'three/tsl';
import { WORLD } from './config.js';
import { mulberry32, clamp as clampJs, smoothstep as sstep } from './noise.js';
import { INSTANCE_ID_ATTRIBUTE, attachInstanceIds } from './instance-culler.js';

const TAU = Math.PI * 2;
const FADE = [46, 60];
const UP = new THREE.Vector3(0, 1, 0);
// three r184 applies the instance matrix AFTER material.positionNode, so the
// vertex stage runs in geometry space: the distance collapse scales the
// geometry toward its own origin (the instance pivot) and the stone lumpiness
// scales about that origin too. (An earlier version mixed the world-space
// base into geometry space, so a prop in the 46–60 m fade band rendered up to
// scale·|base| away from where it stood, as a shrinking card flying through
// the scene, and stones were stretched by amount·|base|.)
// Stable per-instance id (the original instance index; the culler compacts
// the buffers so instanceIndex no longer identifies an instance). The float
// attribute reaches the fragment stage interpolated, so it is rounded back to
// the exact integer before hash() truncates it — the same value instanceIndex
// used to carry.
const instanceId = attribute(INSTANCE_ID_ATTRIBUTE, 'float').add(0.5).floor();

// Per-instance vec4 stream (base x, y, z, spare) for the distance collapse.
// Read through a storage buffer rather than a vertex attribute: a layer with
// more than 1000 instances already spends four of WebGPU's eight vertex
// buffers on its matrix columns, and position + normal + uv + the culler's id
// take the other four.
function instanceStream(count) {
  const array = new Float32Array(count * 4);
  const storage = instancedArray(array, 'vec4');
  const attr = storage.value;
  attr.setUsage(THREE.DynamicDrawUsage);
  return { array, attribute: attr, node: storage.element(instanceIndex) };
}

// Vertex stage: optional per-instance deformation, then collapse toward the
// instance base beyond the fade distance so far props produce no fragments.
function applyVertex(material, inst, deform = null) {
  const base = inst.node.xyz;
  let pos = positionLocal;
  if (deform) pos = deform(pos);
  const dist = base.sub(cameraPosition).length();
  const keep = smoothstep(FADE[0], FADE[1], dist).oneMinus();
  // collapse toward the geometry origin: the instance matrix, applied after
  // this node, puts that point exactly where the prop stands
  material.positionNode = pos.mul(keep);
  // the instance culler reads these: past fadeEnd every vertex sits on one
  // point (zero-area triangles), and the stream must be compacted along
  material.userData.stream = inst;
  material.userData.fadeEnd = FADE[1];
  material.userData.stretch = deform?.stretch ?? 0;
}

// Smooth per-instance radial lumpiness for stones: a few low-frequency sines
// of the pre-instance position, scaled about the instance base.
function lumpyDeform(amount) {
  const deform = (pos) => {
    const ph = hash(instanceId.add(5)).mul(TAU);
    const pg = positionGeometry;
    const d = sin(pg.x.mul(5.3).add(ph)).mul(0.45)
      .add(sin(pg.z.mul(6.1).add(ph.mul(1.7)).add(pg.y.mul(2.0))).mul(0.35))
      .add(sin(pg.y.mul(4.7).add(ph.mul(0.6)).add(pg.x.mul(1.3))).mul(0.2));
    return pos.mul(d.mul(amount).add(1.0)); // radial about the instance pivot
  };
  deform.stretch = amount; // |d| <= 1: vertices move by at most amount·|pos|
  return deform;
}

// ---------- geometry ----------

function stoneGeometry(kind) {
  let geometry = kind === 'pebble' ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 1);
  // polyhedra come non-indexed with per-face uvs; drop those so shared corners
  // merge and the stone shades smoothly instead of faceted
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry);
  geometry.scale(1.15, 0.62, 0.92);
  geometry.computeVertexNormals();
  // planar uv from the top so the rock normal map has a tangent frame
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uvs[i * 2] = pos.getX(i) * 0.6;
    uvs[i * 2 + 1] = pos.getZ(i) * 0.6;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

// Tapered stick along +x, length 1, bent a little; radius is at the thick end.
function stickGeometry(radius, length, radialSegments, lengthSegments, bend) {
  const geometry = new THREE.CylinderGeometry(radius * 0.35, radius, length, radialSegments, lengthSegments, true);
  geometry.rotateZ(-Math.PI / 2); // axis along +x, thick end at -x
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const t = x / length + 0.5;
    pos.setZ(i, pos.getZ(i) + Math.sin(t * Math.PI) * bend * length);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function withVariant(geometry, variant) {
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count).fill(variant);
  geometry.setAttribute('variant', new THREE.BufferAttribute(arr, 1));
  return geometry;
}

function twigGeometry() {
  const main = withVariant(stickGeometry(0.022, 1, 5, 3, 0.05), 0);
  const cross = stickGeometry(0.016, 0.7, 5, 2, 0.04);
  cross.rotateY(0.9);
  cross.translate(0.12, 0.028, 0.05);
  withVariant(cross, 1);
  return mergeGeometries([main, cross]);
}

// Low arch along +x (length 1), ends dipping under the ground, slight S-wobble.
function rootGeometry() {
  const points = [];
  const segs = 10;
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const y = Math.sin(t * Math.PI) * 0.13 - 0.035;
    const z = Math.sin(t * Math.PI * 2) * 0.05;
    points.push(new THREE.Vector3(t - 0.5, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segs, 0.058, 6, false);
  // taper toward both buried ends
  const pos = geometry.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i);
    const t = clampJs(p.x + 0.5, 0, 1);
    const c = curve.getPoint(t);
    const taper = 0.55 + 0.45 * Math.sin(t * Math.PI);
    p.sub(c).multiplyScalar(taper).add(c);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Three overlapping leaf cards laid flat with slight tilts, each picking one
// half of the leaf atlas; normals pushed straight up and a flipped copy merged
// so the underside also renders as a lit front face.
function leafClumpGeometry(random) {
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    const size = 0.3 + random() * 0.14;
    const card = new THREE.PlaneGeometry(size, size);
    card.rotateX(-Math.PI / 2);
    const half = random() < 0.5 ? 0 : 1;
    const uvs = card.attributes.uv;
    for (let k = 0; k < uvs.count; k += 1) uvs.setX(k, uvs.getX(k) * 0.5 + half * 0.5);
    card.rotateX((random() - 0.5) * 0.3);
    card.rotateZ((random() - 0.5) * 0.3);
    card.rotateY(random() * TAU);
    card.translate((random() - 0.5) * 0.16, 0.012 + i * 0.011, (random() - 0.5) * 0.16);
    parts.push(card);
  }
  const merged = mergeGeometries(parts);
  const normal = merged.attributes.normal;
  for (let i = 0; i < normal.count; i += 1) {
    const ny = Math.abs(normal.getY(i));
    normal.setXYZ(i, normal.getX(i) * 0.3, ny * 0.3 + 0.7, normal.getZ(i) * 0.3);
  }
  normal.needsUpdate = true;
  const flipped = merged.clone();
  const idx = flipped.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const tmp = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = tmp;
  }
  return mergeGeometries([merged, flipped]);
}

// ---------- main ----------

export function createGroundDetail(ctx) {
  const { scene, terrain, textures } = ctx;
  const t0 = performance.now();
  const half = WORLD.size / 2 - 6;
  const landmarkHeight = ctx.landmarks?.heightAt ?? (() => -Infinity);
  const dummy = new THREE.Object3D();
  const normalTmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const quatYaw = new THREE.Quaternion();
  const layers = [];
  const meshes = [];

  // ---------- trail geometry helpers ----------
  const segments = [];
  let totalLength = 0;
  for (const trail of WORLD.trails) {
    for (let i = 0; i < trail.length - 1; i += 1) {
      const [ax, az] = trail[i];
      const [bx, bz] = trail[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      segments.push({ ax, az, bx, bz, len, dx: (bx - ax) / len, dz: (bz - az) / len, start: totalLength });
      totalLength += len;
    }
  }
  // point at arc length s along the whole network, offset laterally by d
  function trailSample(s, d) {
    let seg = segments[segments.length - 1];
    for (const candidate of segments) {
      if (s < candidate.start + candidate.len) {
        seg = candidate;
        break;
      }
    }
    const t = clampJs((s - seg.start) / seg.len, 0, 1);
    return {
      x: seg.ax + (seg.bx - seg.ax) * t - seg.dz * d,
      z: seg.az + (seg.bz - seg.az) * t + seg.dx * d,
      dx: seg.dx,
      dz: seg.dz,
    };
  }
  // nearest point on the network to (x, z) with the segment direction
  function nearestTrailPoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const seg of segments) {
      const t = clampJs(((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / seg.len, 0, 1);
      const px = seg.ax + seg.dx * seg.len * t;
      const pz = seg.az + seg.dz * seg.len * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) {
        bestD = d;
        best = { x: px, z: pz, dx: seg.dx, dz: seg.dz, d };
      }
    }
    return best;
  }

  function usable(x, z, minHeight = 0.7) {
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const h = terrain.sampleHeight(x, z);
    if (h < minHeight) return false;
    if (Number.isFinite(landmarkHeight(x, z))) return false;
    return true;
  }

  // Generic trail-side scatter: `lateral(rng)` gives the signed offset from the
  // centre line, `rule(s, x, z)` returns a 0..1 acceptance weight.
  function scatterTrail({ count, seed, lateral, rule = () => 1, minHeight = 0.7 }) {
    const rng = mulberry32(WORLD.seed + seed);
    const out = [];
    let tries = 0;
    while (out.length < count && tries < count * 30) {
      tries += 1;
      const s = rng() * totalLength;
      const d = lateral(rng);
      const p = trailSample(s, d);
      if (!usable(p.x, p.z, minHeight)) continue;
      const info = {
        d: terrain.trailDistance(p.x, p.z),
        canopy: terrain.canopyDensity(p.x, p.z),
        h: terrain.sampleHeight(p.x, p.z),
        ny: terrain.sampleNormal(p.x, p.z, normalTmp).y,
        dx: p.dx,
        dz: p.dz,
      };
      const w = rule(info, p.x, p.z);
      if (!(w > 0) || (w < 1 && rng() > w)) continue;
      out.push({ x: p.x, z: p.z, ...info, r: rng(), r2: rng(), r3: rng() });
    }
    return out;
  }

  function alignToSlope(x, z, yaw, blend = 1) {
    terrain.sampleNormal(x, z, normalTmp);
    if (blend < 1) normalTmp.lerp(UP, 1 - blend).normalize();
    quat.setFromUnitVectors(UP, normalTmp);
    quatYaw.setFromAxisAngle(UP, yaw);
    dummy.quaternion.copy(quat).multiply(quatYaw);
  }

  function register(mesh, name) {
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances span the map; the culler packs per view
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    meshes.push(mesh);
    const layer = { mesh, maxCount: mesh.count, culled: Boolean(ctx.culler) };
    layers.push(layer);
    // hand the layer to the instance culler: it compacts the buffers to the
    // instances inside the main / mirror frusta and closer than the collapse
    // distance, and applies the same density prefix rule as applyQuality
    const ud = mesh.material.userData;
    if (ctx.culler) {
      // per-instance reach in geometry units (times the instance scale): the
      // geometry's own radius, stretched by the lumpiness at most
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const geometryRadius = geometry.boundingSphere.radius + Math.abs(geometry.boundingSphere.center.y);
      const stretch = ud.stretch ?? 0;
      ctx.culler.register(mesh, {
        maxCount: mesh.count,
        densityKey: 'vegetation',
        stream: ud.stream ?? null,
        fadeEnd: ud.fadeEnd ?? null,
        inReflection: true, // default render layer: the water's mirror camera draws these
        castShadow: false,
        radius: geometryRadius * (1 + stretch),
      });
    } else {
      attachInstanceIds(mesh); // the materials still read the id attribute
    }
  }

  // ---------- materials ----------
  const rockTex = textures.rock;
  const rockNormal = textures.rockNormal;
  const bark = textures.bark;
  const barkNormal = textures.barkNormal;

  function stoneMaterial(inst, { lump, warmth = 0.5 }) {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
    applyVertex(material, inst, lumpyDeform(lump));
    const hA = hash(instanceId.add(31));
    const hB = hash(instanceId.add(57));
    const rockUv = positionGeometry.xz.mul(0.6).add(vec2(hA, hB));
    const rock = texture(rockTex, rockUv).rgb;
    // greys through warm browns, per stone; the buried half is dirt-stained
    const tint = mix(vec3(0.92, 0.93, 0.95), vec3(1.05, 0.9, 0.72), smoothstep(0.2, 0.8, hB).mul(warmth).add(0.15));
    const value = mix(float(0.75), float(1.25), hA);
    const stain = mix(vec3(0.55, 0.45, 0.36), vec3(1, 1, 1), smoothstep(-0.35, 0.45, positionGeometry.y));
    material.colorNode = rock.mul(tint).mul(value).mul(stain);
    material.normalNode = normalMap(texture(rockNormal, rockUv).rgb, vec2(0.7));
    material.roughnessNode = mix(float(0.7), float(0.92), hB);
    return material;
  }

  function barkMaterial(inst, { deform = null, tint = [0.62, 0.52, 0.42], uvScale = [1, 3], valueSpread = 0.2, roughness = 0.9, variantCollapse = false, moss = 0, bleach = 0 } = {}) {
    const material = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0 });
    if (variantCollapse) {
      // half the twigs are crossed pairs: the second stick collapses to the
      // base on the other half (degenerate triangles, no fragments)
      const pick = smoothstep(0.49, 0.51, hash(instanceId.add(91))); // 1 on half the instances
      const variant = attribute('variant', 'float'); // per-vertex: which stick a vertex belongs to
      const collapse = variant.mul(pick);
      applyVertex(material, inst, (pos) => {
        const p = deform ? deform(pos) : pos;
        // collapse the dropped stick onto the instance pivot (geometry origin)
        return mix(p, vec3(0.0), collapse);
      });
    } else {
      applyVertex(material, inst, deform);
    }
    const hA = hash(instanceId.add(13));
    const hB = hash(instanceId.add(29));
    const barkUv = uv().mul(vec2(uvScale[0], uvScale[1])).add(vec2(hA, hB.mul(0.5)));
    const col = texture(bark, barkUv).rgb;
    const value = mix(float(1 - valueSpread), float(1 + valueSpread), hA);
    let color = col.mul(vec3(tint[0], tint[1], tint[2])).mul(value);
    if (bleach > 0) {
      // a share of the dead wood has weathered to silver-grey
      const grey = col.dot(vec3(0.33, 0.34, 0.33));
      const bleached = smoothstep(1 - bleach, 1 - bleach + 0.08, hash(instanceId.add(73)));
      color = mix(color, vec3(grey, grey, grey).mul(vec3(1.25, 1.2, 1.1)), bleached);
    }
    if (moss > 0) {
      const mossTex = texture(textures.moss, barkUv.mul(0.7)).rgb;
      const mossMask = smoothstep(0.35, 0.75, hB).mul(moss).mul(smoothstep(-0.02, 0.06, positionGeometry.y));
      color = mix(color, mossTex.mul(0.9), mossMask);
    }
    material.colorNode = color;
    // a hint of sky bounce so the shaded side under the canopy is not black
    material.emissiveNode = color.mul(vec3(0.05, 0.06, 0.07));
    material.normalNode = normalMap(texture(barkNormal, barkUv).rgb, vec2(0.8));
    return material;
  }

  function leafMaterial(inst) {
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide });
    applyVertex(material, inst);
    const hA = hash(instanceId.add(17));
    const hB = hash(instanceId.add(41));
    const card = texture(textures.leafCard, uv());
    // warm/cool and value drift per clump so drifts of leaves read as many leaves
    const tint = mix(vec3(0.85, 0.8, 0.72), vec3(1.1, 1.0, 0.85), hA);
    const value = mix(float(0.7), float(1.15), hB);
    material.colorNode = card.rgb.mul(tint).mul(value);
    material.opacityNode = card.a;
    material.emissiveNode = card.rgb.mul(vec3(0.04, 0.05, 0.06));
    return material;
  }

  // ---------- pebbles (4–8 cm) ----------
  const pebbleMax = 1500;
  {
    const spots = scatterTrail({
      count: pebbleMax,
      seed: 9101,
      lateral: (rng) => {
        // most stones lie in the crumbly edge bands, a few on the compacted centre
        const side = rng() < 0.5 ? -1 : 1;
        const u = rng();
        return side * (u < 0.3 ? rng() * 1.6 : 1.4 + rng() * 2.6);
      },
      rule: (s) => (s.ny < 0.7 ? 0 : 0.45 + sstep(1.2, 2.6, s.d) * 0.55),
    });
    const geometry = stoneGeometry('pebble');
    const inst = instanceStream(spots.length);
    const mesh = new THREE.InstancedMesh(geometry, stoneMaterial(inst, { lump: 0.16, warmth: 0.6 }), spots.length);
    spots.forEach((p, i) => {
      const r = 0.02 + p.r * 0.02; // 4–8 cm across
      alignToSlope(p.x, p.z, p.r2 * TAU, 0.8);
      dummy.position.set(p.x, p.h - r * 0.35, p.z);
      dummy.scale.set(r * (0.8 + p.r3 * 0.5), r, r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      inst.array.set([p.x, p.h, p.z, r], i * 4);
    });
    register(mesh, 'ground-pebbles');
  }

  // ---------- larger stones (10–22 cm), sparse, at the edges ----------
  const stoneMax = 340;
  {
    const spots = scatterTrail({
      count: stoneMax,
      seed: 9102,
      lateral: (rng) => (rng() < 0.5 ? -1 : 1) * (1.6 + rng() * 3.2),
      rule: (s) => (s.ny < 0.72 ? 0 : 0.35 + sstep(1.6, 3.0, s.d) * 0.65),
    });
    const geometry = stoneGeometry('stone');
    const inst = instanceStream(spots.length);
    const mesh = new THREE.InstancedMesh(geometry, stoneMaterial(inst, { lump: 0.2, warmth: 0.45 }), spots.length);
    spots.forEach((p, i) => {
      const r = 0.05 + p.r * 0.06;
      alignToSlope(p.x, p.z, p.r2 * TAU, 0.7);
      dummy.position.set(p.x, p.h - r * 0.4, p.z);
      dummy.scale.set(r * (0.9 + p.r3 * 0.5), r, r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      inst.array.set([p.x, p.h, p.z, r], i * 4);
    });
    register(mesh, 'ground-stones');
  }

  // ---------- twigs (20–60 cm), single or crossed ----------
  const twigMax = 430;
  {
    const spots = scatterTrail({
      count: twigMax,
      seed: 9103,
      lateral: (rng) => {
        // walkers kick sticks aside: most lie in the verges
        const side = rng() < 0.5 ? -1 : 1;
        const u = rng();
        return side * (u < 0.15 ? rng() * 1.5 : 1.3 + rng() * 3.6);
      },
      rule: (s) => (s.ny < 0.7 ? 0 : 0.3 + s.canopy * 0.7),
    });
    const geometry = twigGeometry();
    const inst = instanceStream(spots.length);
    const material = barkMaterial(inst, { tint: [0.56, 0.47, 0.38], uvScale: [1, 2.5], valueSpread: 0.3, variantCollapse: true, roughness: 0.92, bleach: 0.35 });
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    spots.forEach((p, i) => {
      const len = 0.2 + p.r * 0.4;
      alignToSlope(p.x, p.z, p.r2 * TAU, 0.9);
      dummy.position.set(p.x, p.h + 0.004, p.z);
      dummy.scale.set(len, len * (0.7 + p.r3 * 0.6), len);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      inst.array.set([p.x, p.h, p.z, len], i * 4);
    });
    register(mesh, 'ground-twigs');
  }

  // ---------- leaf clumps under the canopy ----------
  const leafMax = 1700;
  {
    const spots = scatterTrail({
      count: leafMax,
      seed: 9104,
      lateral: (rng) => {
        const side = rng() < 0.5 ? -1 : 1;
        const u = rng();
        return side * (u < 0.4 ? rng() * 1.8 : 1.0 + rng() * 4.2);
      },
      rule: (s) => (s.ny < 0.66 ? 0 : sstep(0.12, 0.6, s.canopy) * (0.5 + sstep(1.0, 2.6, s.d) * 0.5)),
    });
    const geometry = leafClumpGeometry(mulberry32(WORLD.seed + 9204));
    const inst = instanceStream(spots.length);
    const mesh = new THREE.InstancedMesh(geometry, leafMaterial(inst), spots.length);
    spots.forEach((p, i) => {
      const sc = 0.8 + p.r * 0.7;
      alignToSlope(p.x, p.z, p.r2 * TAU, 1);
      dummy.position.set(p.x, p.h + 0.006, p.z);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      inst.array.set([p.x, p.h, p.z, sc], i * 4);
    });
    register(mesh, 'ground-leaf-clumps');
  }

  // ---------- exposed roots crossing the trail near trees ----------
  const rootMax = 260;
  {
    const rng = mulberry32(WORLD.seed + 9105);
    const trunks = [];
    for (const layer of ctx.vegetation?.layers ?? []) {
      const mesh = layer.mesh;
      const name = mesh?.name ?? '';
      if (!name.includes('trunks') || name.includes('palm') || name.includes('fern') || name.includes('bamboo')) continue;
      const arr = mesh.instanceMatrix.array;
      const max = layer.maxCount;
      for (let i = 0; i < max; i += 1) {
        const o = i * 16;
        const sx = Math.hypot(arr[o], arr[o + 1], arr[o + 2]);
        if (sx < 1e-4) continue;
        trunks.push({ x: arr[o + 12], z: arr[o + 14], radius: Math.max(0.25, sx * 0.35), frac: (i + 0.5) / max });
      }
    }
    const roots = [];
    // candidates: trunks standing 1.5–7 m off a trail; the root runs from the
    // trunk foot toward and across the centre line
    for (const trunk of trunks) {
      if (roots.length >= rootMax * 3) break;
      const near = nearestTrailPoint(trunk.x, trunk.z);
      if (!near || near.d < 1.2 || near.d > 7.5) continue;
      if (rng() > 0.7) continue;
      const dirX = (near.x - trunk.x) / near.d;
      const dirZ = (near.z - trunk.z) / near.d;
      const startOff = trunk.radius + 0.3;
      const endOff = near.d + 0.5 + rng() * 1.0;
      let len = endOff - startOff;
      let start = startOff;
      if (len > 3.6) {
        start = endOff - 3.6;
        len = 3.6;
      }
      if (len < 0.9) continue;
      const cx = trunk.x + dirX * (start + len / 2);
      const cz = trunk.z + dirZ * (start + len / 2);
      if (!usable(cx, cz, 0.8)) continue;
      const ax = trunk.x + dirX * start;
      const az = trunk.z + dirZ * start;
      const bx = trunk.x + dirX * (start + len);
      const bz = trunk.z + dirZ * (start + len);
      if (!usable(ax, az, 0.8) || !usable(bx, bz, 0.8)) continue;
      const ha = terrain.sampleHeight(ax, az);
      const hb = terrain.sampleHeight(bx, bz);
      const hc = terrain.sampleHeight(cx, cz);
      // skip where the ground bows so much the arch would float or vanish
      if (Math.abs(hc - (ha + hb) / 2) > 0.12) continue;
      roots.push({ x: cx, z: cz, y: (ha + hb) / 2, yaw: Math.atan2(-dirZ, dirX), pitch: Math.atan2(hb - ha, len), len, frac: trunk.frac, r: rng(), r2: rng() });
    }
    // extra roots where the canopy beside the path is closed (the trail itself
    // suppresses canopy density, so it is read 4 m off to the side) — they run
    // in from that side and arch over the centre line
    const fillRng = mulberry32(WORLD.seed + 9106);
    let fillTries = 0;
    let fills = 0;
    while (fills < 110 && fillTries < 4000) {
      fillTries += 1;
      const s = fillRng() * totalLength;
      const side = fillRng() < 0.5 ? -1 : 1;
      const p = trailSample(s, 0);
      const edge = trailSample(s, side * 5);
      if (!usable(p.x, p.z, 0.8) || !usable(edge.x, edge.z, 0.8)) continue;
      if (terrain.canopyDensity(edge.x, edge.z) < 0.42) continue;
      const len = 1.4 + fillRng() * 1.8;
      // root centre sits between the edge and the centre line
      const off = side * (0.4 + fillRng() * 1.2);
      const c = trailSample(s, off);
      // +x of the root points from the wooded edge toward the centre line
      const yaw = Math.atan2(side * p.dx, side * p.dz) + (fillRng() - 0.5) * 0.7;
      const dirX = Math.cos(yaw);
      const dirZ = -Math.sin(yaw);
      const ax = c.x - dirX * len / 2;
      const az = c.z - dirZ * len / 2;
      const bx = c.x + dirX * len / 2;
      const bz = c.z + dirZ * len / 2;
      if (!usable(ax, az, 0.8) || !usable(bx, bz, 0.8)) continue;
      const ha = terrain.sampleHeight(ax, az);
      const hb = terrain.sampleHeight(bx, bz);
      const hc = terrain.sampleHeight(c.x, c.z);
      if (Math.abs(hc - (ha + hb) / 2) > 0.1) continue;
      if (terrain.sampleNormal(c.x, c.z, normalTmp).y < 0.8) continue;
      roots.push({ x: c.x, z: c.z, y: (ha + hb) / 2, yaw, pitch: Math.atan2(hb - ha, len), len, frac: 1.2 + fillRng(), r: fillRng(), r2: fillRng() });
      fills += 1;
    }
    // owner order so lower presets drop roots of trees they no longer draw
    roots.sort((a, b) => a.frac - b.frac);
    const chosen = roots.slice(0, rootMax);
    const geometry = rootGeometry();
    const inst = instanceStream(Math.max(1, chosen.length));
    const material = barkMaterial(inst, { tint: [0.74, 0.6, 0.46], uvScale: [1.5, 4], valueSpread: 0.16, roughness: 0.88, moss: 0.55 });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, chosen.length));
    if (chosen.length === 0) {
      dummy.position.set(0, -50, 0);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      inst.array.set([0, -50, 0, 0], 0);
    }
    const zAxis = new THREE.Vector3(0, 0, 1);
    chosen.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      // yaw about world up, then pitch the +x axis along the ground slope
      quat.setFromAxisAngle(UP, p.yaw);
      quatYaw.setFromAxisAngle(zAxis, p.pitch);
      dummy.quaternion.copy(quat).multiply(quatYaw);
      const thick = 0.75 + p.r * 0.7;
      dummy.scale.set(p.len, thick, thick);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      inst.array.set([p.x, p.y, p.z, p.len], i * 4);
    });
    register(mesh, 'ground-roots');
  }

  // ---------- puddles in trail hollows ----------
  let puddleCount = 0;
  {
    const rng = mulberry32(WORLD.seed + 9107);
    const candidates = [];
    // Walk the network; wherever the path is concave (its 2.2 m ring sits
    // above the point — the same measure the terrain shader's hollow channel
    // uses) descend to the nearby minimum and keep it if the floor is flat.
    for (let s = 0; s < totalLength; s += 0.5) {
      const d = (rng() - 0.5) * 3.0;
      let { x, z } = trailSample(s, d);
      if (!usable(x, z, 0.9) || terrain.trailDistance(x, z) > 1.6) continue;
      let h = terrain.sampleHeight(x, z);
      let ringAvg = 0;
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * TAU + 0.3;
        ringAvg += terrain.sampleHeight(x + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2);
      }
      ringAvg /= 6;
      const depth = ringAvg - h;
      if (depth < 0.05) continue;
      for (let stepI = 0; stepI < 14; stepI += 1) {
        let bx = x;
        let bz = z;
        let bh = h;
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * TAU;
          const nx = x + Math.cos(a) * 0.3;
          const nz = z + Math.sin(a) * 0.3;
          const nh = terrain.sampleHeight(nx, nz);
          if (nh < bh) {
            bh = nh;
            bx = nx;
            bz = nz;
          }
        }
        if (bh >= h) break;
        x = bx;
        z = bz;
        h = bh;
      }
      if (!usable(x, z, 0.9) || terrain.trailDistance(x, z) > 1.9) continue;
      let minRise = Infinity;
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * TAU;
        minRise = Math.min(minRise, terrain.sampleHeight(x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3) - h);
      }
      if (minRise < -0.002) continue;
      candidates.push({ x, z, h, depth });
    }
    // the descent converges on the same floors: keep the deepest, 5 m apart
    candidates.sort((a, b) => b.depth - a.depth);
    const puddles = [];
    for (const c of candidates) {
      if (puddles.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 5)) continue;
      puddles.push(c);
      if (puddles.length >= 60) break;
    }
    const N = 20;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (const pd of puddles) {
      const level = pd.h + 0.02 + Math.min(0.02, pd.depth * 0.15);
      const base = positions.length / 3;
      positions.push(pd.x, level, pd.z);
      normals.push(0, 1, 0);
      uvs.push(pd.x * 0.5, pd.z * 0.5);
      let meanR = 0;
      const rim = [];
      for (let k = 0; k < N; k += 1) {
        const a = (k / N) * TAU;
        // march outward until the ground rises above the water level
        let r = 0.2;
        while (r < 1.7 && terrain.sampleHeight(pd.x + Math.cos(a) * r, pd.z + Math.sin(a) * r) < level) r += 0.1;
        rim.push(r);
        meanR += r / N;
      }
      // soften the outline a touch (neighbour average) so it never spikes
      for (let k = 0; k < N; k += 1) {
        const r = (rim[(k - 1 + N) % N] + rim[k] * 2 + rim[(k + 1) % N]) / 4;
        const a = (k / N) * TAU;
        positions.push(pd.x + Math.cos(a) * r, level, pd.z + Math.sin(a) * r);
        normals.push(0, 1, 0);
        uvs.push((pd.x + Math.cos(a) * r) * 0.5, (pd.z + Math.sin(a) * r) * 0.5);
      }
      if (meanR < 0.4) {
        positions.length = base * 3;
        normals.length = base * 3;
        uvs.length = base * 2;
        continue;
      }
      for (let k = 0; k < N; k += 1) {
        indices.push(base, base + 1 + ((k + 1) % N), base + 1 + k);
      }
      puddleCount += 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.length ? positions : [0, -50, 0, 0, -50, 0, 0, -50, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals.length ? normals : [0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.length ? uvs : [0, 0, 0, 0, 0, 0], 2));
    geometry.setIndex(indices.length ? indices : [0, 1, 2]);
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0 });
    // dark tannin water: the floor shows through as near-black brown, the sky
    // reflects as a Fresnel tint, and a slow analytic ripple breaks the mirror
    const view = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(clamp(float(1).sub(dot(view, normalWorld)), 0, 1), 3.0);
    const rippleX = sin(positionWorld.x.mul(7.0).add(time.mul(0.8))).mul(sin(positionWorld.z.mul(5.0).add(time.mul(0.6))));
    const rippleZ = cos(positionWorld.z.mul(6.0).sub(time.mul(0.7))).mul(sin(positionWorld.x.mul(4.0).add(1.3)));
    material.normalNode = normalMap(vec3(rippleX.mul(0.5).add(0.5), rippleZ.mul(0.5).add(0.5), 1.0), vec2(0.06));
    material.colorNode = vec3(0.07, 0.055, 0.035);
    material.emissiveNode = vec3(0.5, 0.62, 0.78).mul(fresnel.mul(0.42).add(0.03));
    material.roughnessNode = float(0.05);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ground-puddles';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // ---------- stats / quality ----------
  function stats() {
    let triangles = 0;
    let instances = 0;
    const rows = [];
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = mesh.isInstancedMesh ? mesh.count : 1;
      rows.push({ name: mesh.name, count: n, triangles: Math.round(tri * n) });
      triangles += tri * n;
      instances += n;
    }
    return { layers: rows, triangles: Math.round(triangles), instances, drawCalls: meshes.length, puddles: puddleCount };
  }

  function applyQuality(preset) {
    const density = preset.vegetationDensity ?? 1;
    for (const layer of layers) {
      // the culler owns the draw count of the layers it packs and applies this
      // same prefix rule (round(max · density)) per cell on its next repack
      if (layer.culled) continue;
      layer.mesh.count = Math.max(1, Math.min(layer.maxCount, Math.round(layer.maxCount * density)));
    }
    for (const mesh of meshes) {
      if (mesh.material.map) mesh.material.map.anisotropy = preset.anisotropy;
    }
  }

  const built = stats();
  console.info(`[ground-detail] ${built.drawCalls} draw calls, ${built.triangles.toLocaleString()} tris @ full density (${built.puddles} puddles), built in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    meshes,
    layers,
    update() {},
    applyQuality,
    get stats() {
      return stats();
    },
  };
}
