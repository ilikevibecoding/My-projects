// Instance compaction for map-spanning InstancedMesh layers.
//
// Every plant layer is one InstancedMesh whose instances cover the whole 400 m
// map, drawn with frustumCulled = false — so the shadow pass, the water
// reflection pass and the main pass each processed all ~100 k instances every
// frame, most of them behind the camera or collapsed to zero-area triangles by
// their distance fade. This module keeps the full instance data on the CPU,
// sorts it into 16 m ground cells, and whenever the view changes rewrites each
// layer's GPU buffers with only the instances that can contribute to a pixel
// in any pass this frame:
//
//   * main camera frustum (widened by a margin so small turns need no repack),
//   * the water's mirror-camera frustum while planar reflections are on
//     (layers on the ground-cover layer are excluded from that pass anyway),
//   * the sun's shadow box for shadow-casting layers,
//   * and never beyond the layer's distance fade, which in the shaders scales
//     the geometry to a point / drives alpha to zero — identical output.
//
// Visuals are unchanged: per-instance appearance is keyed off a stable id
// attribute (`aId`, the original instance index) instead of instanceIndex, the
// quality-density prefix rule (instance k live while k < round(max·density),
// or gate[k] <= density — the same rule the owner's applyQuality writes to
// mesh.count) is applied per cell, and the packed buffer keeps the instances
// in their ascending original order, so every depth tie between two cards
// resolves exactly as it did in the full buffer.

import * as THREE from 'three/webgpu';
import { WORLD } from './config.js';

export const INSTANCE_ID_ATTRIBUTE = 'aId';

const CELL = 16;
const FOV_MARGIN_DEG = 7; // extra half-angle on the main / mirror frusta
const SWAY_MARGIN = 2.5; // metres of wind / flutter displacement a card can reach
const SHADOW_MARGIN = 14; // shadow focus drifts with the look direction between repacks
const REPACK_MOVE = 1.2; // metres of camera travel before repacking
const REPACK_TURN = Math.cos(THREE.MathUtils.degToRad(2.5)); // ~2.5° of look change

const _box = new THREE.Box3();
const _frustum = new THREE.Frustum();
const _mirrorFrustum = new THREE.Frustum();
const _mat = new THREE.Matrix4();
const _mirrorCam = new THREE.PerspectiveCamera();
const _wideCam = new THREE.PerspectiveCamera();
const _reflect = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mirrorPos = new THREE.Vector3();

function upperBound(arr, value, hi) {
  let lo = 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Give an InstancedMesh its own BufferGeometry object (sharing every vertex
// buffer and the index with the source) so per-mesh instanced attributes can
// be attached even when several meshes draw the same geometry.
export function ownGeometry(mesh) {
  const src = mesh.geometry;
  if (src.userData.ownedBy === mesh) return src;
  const geo = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(src.attributes)) {
    geo.setAttribute(name, attribute);
  }
  if (src.index) geo.setIndex(src.index);
  for (const group of src.groups) geo.addGroup(group.start, group.count, group.materialIndex);
  geo.boundingSphere = src.boundingSphere ? src.boundingSphere.clone() : null;
  geo.boundingBox = src.boundingBox ? src.boundingBox.clone() : null;
  geo.userData.ownedBy = mesh;
  geo.userData.source = src;
  mesh.geometry = geo;
  return geo;
}

// three.js reads an InstancedMesh's matrices two ways: a layer whose matrices
// fit one uniform block (64 KiB → count <= 1024) gets a `buffer()` uniform
// whose update() always reports a change, so the whole block was re-uploaded
// for every render object of the mesh in every pass — ~2 MB per frame on High
// for matrices that only change when the culler repacks; a bigger layer gets
// an InstancedInterleavedBuffer read as four vec4 vertex attributes, uploaded
// once per version bump using the update ranges (the packed prefix). Padding a
// small layer's attribute past the limit puts it on the second path on both
// backends (`mesh.count` still draws the real prefix; the padding rows are
// zero matrices nothing ever reads). Same float32 mat4s, same shader math,
// same pixels. Must run before the mesh's first render: the InstanceNode
// captures the attribute object when the material is first built.
// (A StorageInstancedBufferAttribute would be a storage binding on WebGPU but
// becomes a `mat4` vertex attribute on WebGL 2, which three's GLSL builder
// cannot bind — the WebGL build never finished loading with it.)
const UNIFORM_MATRIX_LIMIT = 1024;
export function padInstanceMatrices(mesh) {
  const current = mesh.instanceMatrix;
  if (!current || current.count > UNIFORM_MATRIX_LIMIT) return current;
  const array = new Float32Array((UNIFORM_MATRIX_LIMIT + 1) * 16);
  array.set(current.array.subarray(0, current.count * 16));
  const padded = new THREE.InstancedBufferAttribute(array, 16);
  padded.setUsage(current.usage);
  padded.version = current.version;
  mesh.instanceMatrix = padded;
  return padded;
}

// WebGPU variant of the above: as a StorageInstancedBufferAttribute the same
// array is read from one storage buffer shared by every shader variant of the
// mesh (three's isStorageMatrix path) — no padding, no per-node copies (the
// padded attribute path keeps ~65 KB per node variant per layer, ~25 MB in all)
// and uploaded once per repack via its update range. WebGL 2 cannot bind it
// (see above), so it keeps the padding.
export function useStorageMatrices(mesh) {
  const current = mesh.instanceMatrix;
  if (!current || current.isStorageInstancedBufferAttribute || current.count > UNIFORM_MATRIX_LIMIT) return current;
  const storage = new THREE.StorageInstancedBufferAttribute(current.array, 16);
  storage.setUsage(current.usage);
  storage.version = current.version;
  mesh.instanceMatrix = storage;
  return storage;
}

// Attach the stable per-instance id attribute (original index) to a mesh.
// Static usage on purpose: a static attribute is uploaded once per version
// bump, using its update range (the packed prefix); a dynamic one would be
// re-uploaded whole by every pass of every frame.
export function attachInstanceIds(mesh) {
  const geo = ownGeometry(mesh);
  if (geo.getAttribute(INSTANCE_ID_ATTRIBUTE)) return geo.getAttribute(INSTANCE_ID_ATTRIBUTE);
  const n = mesh.instanceMatrix.count;
  const ids = new Float32Array(n);
  for (let i = 0; i < n; i += 1) ids[i] = i;
  const attribute = new THREE.InstancedBufferAttribute(ids, 1);
  geo.setAttribute(INSTANCE_ID_ATTRIBUTE, attribute);
  return attribute;
}

// three.js reads an InstancedMesh's matrices through an InstanceNode that
// wraps `instanceMatrix.array` in its own InstancedInterleavedBuffer (one per
// compiled shader: main material, shadow material, …). The node copies the
// attribute's version and update ranges into that buffer in its per-frame
// `update()`, which the renderer runs AFTER the geometry upload of the same
// render — so the GPU matrices would lag the repack by one scene render while
// `count`, the id attribute and the anchor stream are already the new pack.
// Sync the wrapping buffers right after packing, so the very next upload
// carries the packed prefix. One pass over the compiled shader states per
// repack: Map<instanceMatrix attribute, [wrapping buffers]>. Small layers
// whose matrices fit a uniform buffer have no wrapping buffer (that path is
// re-uploaded whole every render) and need nothing.
function collectInstanceMatrixBuffers(renderer) {
  const map = new Map();
  const cache = renderer?._nodes?.nodeBuilderCache;
  if (!cache) return map;
  for (const state of cache.values()) {
    const nodes = state.updateNodes;
    if (!nodes) continue;
    for (const node of nodes) {
      if (!node.instanceMatrix || !node.buffer) continue;
      let list = map.get(node.instanceMatrix);
      if (!list) map.set(node.instanceMatrix, (list = []));
      list.push(node.buffer);
    }
  }
  return map;
}
function syncInstanceMatrixBuffers(bufferMap, instanceMatrix, floatCount) {
  const buffers = bufferMap.get(instanceMatrix);
  if (!buffers) return 0;
  for (const buffer of buffers) {
    buffer.version = instanceMatrix.version;
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, floatCount);
  }
  return buffers.length;
}

export function createInstanceCuller(ctx) {
  const layers = [];
  const half = WORLD.size / 2;
  const cellsPerSide = Math.ceil(WORLD.size / CELL) + 2; // one ring of slack each side
  const state = {
    camX: NaN,
    camY: NaN,
    camZ: NaN,
    fov: Infinity, // fov the current pack was built for (Infinity until the first pack)
    dirX: NaN,
    dirY: NaN,
    dirZ: NaN,
    reflection: null,
    shadowKey: '',
    densityKey: '',
    force: true,
    repacks: 0,
    lastMs: 0,
    visibleInstances: 0,
    totalInstances: 0,
    syncedBuffers: 0, // InstanceNode matrix buffers re-synced (diagnostics)
    debugAll: false, // testing: pack every live instance (no view culling)
    fullUpload: false, // testing: upload whole buffers instead of the packed prefix
  };

  // ---------------------------------------------------------------------
  // registration: snapshot the full instance data of a layer into cells
  // ---------------------------------------------------------------------
  // The live prefix (which instances the preset draws) is derived here with the
  // owner's own rule — `gate` (attachment layers) or round(max · density) of
  // the named preset density — because the culler owns `mesh.count` once a
  // layer is registered (owners skip culled meshes in applyQuality). A layer
  // registered with neither is never thinned: that is what every authored
  // layer (landmarks) means, and thinning it silently by the vegetation
  // density would drop its tufts — and their shadow — on the low presets.
  function register(mesh, {
    maxCount = mesh.instanceMatrix.count,
    gate = null, // ascending Float64Array of density thresholds (attachment layers)
    densityKey = null, // 'vegetation' | 'grass': ctx.quality[densityKey + 'Density'] gates the live prefix
    stream = null, // { array: Float32Array(count*4), attribute: InstancedBufferAttribute } written per instance
    fadeEnd = null, // metres from the render camera past which the shaders collapse the instance
    fadeInStart = null, // metres before which the shaders collapse the instance (far-only fillers)
    inReflection = true, // false for ground-cover layers the mirror camera never draws
    castShadow = mesh.castShadow,
    radius = null, // geometry bounding radius at scale 1 (defaults to the geometry's sphere)
  } = {}) {
    const existing = layers.find((l) => l.mesh === mesh);
    if (existing) return existing;
    if (ctx.isWebGPU) useStorageMatrices(mesh);
    else padInstanceMatrices(mesh);
    const idAttr = attachInstanceIds(mesh);
    const layer = {
      mesh,
      maxCount,
      gate,
      densityKey,
      stream,
      idAttr,
      fadeEnd,
      fadeInStart,
      inReflection,
      castShadow,
      radius,
      cells: null,
      cellOf: null,
      matrices: null,
      streamData: null,
      live: 0, // packed (drawn) count
      kept: 0, // non-degenerate instances in the snapshot
    };
    layers.push(layer);
    return layer;
  }

  function snapshot(layer) {
    const { mesh, maxCount } = layer;
    const src = mesh.instanceMatrix.array;
    const matrices = new Float32Array(maxCount * 16);
    matrices.set(src.subarray(0, maxCount * 16));
    layer.matrices = matrices;
    if (layer.stream) {
      layer.streamData = new Float32Array(maxCount * 4);
      layer.streamData.set(layer.stream.array.subarray(0, maxCount * 4));
    }
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const baseRadius = layer.radius ?? (geo.boundingSphere ? geo.boundingSphere.radius : 2);
    const baseCenterY = geo.boundingSphere ? geo.boundingSphere.center.y : 0;

    // bucket the instances by ground cell (ascending index order per cell); a
    // cell only carries its index list and bounds — the packed buffers are
    // filled from `layer.matrices` in original index order
    const cellIndex = new Int32Array(maxCount);
    const counts = new Map();
    let kept = 0;
    for (let i = 0; i < maxCount; i += 1) {
      const o = i * 16;
      const sx = Math.hypot(src[o], src[o + 1], src[o + 2]);
      const sy = Math.hypot(src[o + 4], src[o + 5], src[o + 6]);
      const sz = Math.hypot(src[o + 8], src[o + 9], src[o + 10]);
      if (sx + sy + sz < 1e-6) {
        cellIndex[i] = -1; // culled (zero matrix): can never produce a pixel
        continue;
      }
      const cx = Math.min(cellsPerSide - 1, Math.max(0, Math.floor((src[o + 12] + half) / CELL) + 1));
      const cz = Math.min(cellsPerSide - 1, Math.max(0, Math.floor((src[o + 14] + half) / CELL) + 1));
      const key = cz * cellsPerSide + cx;
      cellIndex[i] = key;
      counts.set(key, (counts.get(key) || 0) + 1);
      kept += 1;
    }
    const cells = [];
    const byKey = new Map();
    for (const [key, count] of counts) {
      const cell = {
        key,
        count,
        indices: new Int32Array(count),
        fill: 0,
        visible: false,
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
        // world-space centre / radius for the distance tests
        cx: 0,
        cy: 0,
        cz: 0,
        cr: 0,
      };
      cells.push(cell);
      byKey.set(key, cell);
    }
    const cellOf = new Int32Array(maxCount).fill(-1);
    cells.forEach((cell, index) => { cell.index = index; });
    for (let i = 0; i < maxCount; i += 1) {
      const key = cellIndex[i];
      if (key < 0) continue;
      const cell = byKey.get(key);
      cellOf[i] = cell.index;
      cell.indices[cell.fill] = i;
      cell.fill += 1;
      const o = i * 16;
      const s = Math.max(Math.hypot(src[o], src[o + 1], src[o + 2]), Math.hypot(src[o + 4], src[o + 5], src[o + 6]), Math.hypot(src[o + 8], src[o + 9], src[o + 10]));
      const r = baseRadius * s + SWAY_MARGIN;
      const x = src[o + 12];
      const y = src[o + 13] + baseCenterY * s;
      const z = src[o + 14];
      if (x - r < cell.minX) cell.minX = x - r;
      if (x + r > cell.maxX) cell.maxX = x + r;
      if (y - r < cell.minY) cell.minY = y - r;
      if (y + r > cell.maxY) cell.maxY = y + r;
      if (z - r < cell.minZ) cell.minZ = z - r;
      if (z + r > cell.maxZ) cell.maxZ = z + r;
    }
    for (const cell of cells) {
      cell.cx = (cell.minX + cell.maxX) * 0.5;
      cell.cy = (cell.minY + cell.maxY) * 0.5;
      cell.cz = (cell.minZ + cell.maxZ) * 0.5;
      cell.cr = Math.hypot(cell.maxX - cell.minX, cell.maxY - cell.minY, cell.maxZ - cell.minZ) * 0.5;
    }
    layer.cells = cells;
    layer.cellOf = cellOf;
    layer.kept = kept;
    state.totalInstances = layers.reduce((sum, l) => sum + (l.kept || 0), 0);
  }

  // CPU-side edits of a layer's instance data (e.g. a post-hoc cull zeroing
  // some matrices) must address the ORIGINAL indexing: call beginEdit() first
  // — it restores the full data into the GPU arrays if they were compacted —
  // edit, then refresh() so the next update snapshots the edited data.
  function beginEdit(mesh) {
    const layer = layers.find((l) => l.mesh === mesh);
    if (layer && layer.cells) {
      layer.mesh.instanceMatrix.array.set(layer.matrices);
      if (layer.stream) layer.stream.array.set(layer.streamData);
      layer.cells = null;
    }
  }
  function refresh(mesh) {
    const layer = layers.find((l) => l.mesh === mesh);
    if (layer) {
      layer.cells = null;
      state.force = true;
    }
  }

  // ---------------------------------------------------------------------
  // per-frame: decide whether the view changed enough, then repack
  // ---------------------------------------------------------------------
  function activeCountFor(layer) {
    const preset = ctx.quality;
    if (!preset || (!layer.gate && !layer.densityKey)) return layer.maxCount;
    const density = layer.densityKey === 'grass' ? preset.grassDensity : preset.vegetationDensity;
    const n = layer.gate ? upperBound(layer.gate, density + 1e-9, layer.gate.length) : Math.round(layer.maxCount * density);
    return Math.max(1, Math.min(layer.maxCount, n));
  }

  function shadowBounds() {
    const sky = ctx.sky;
    if (!sky?.shadowRegion) return null;
    return sky.shadowRegion(); // { x, z, extent } or null when shadows are off
  }

  function update() {
    const camera = ctx.camera;
    if (!camera) return;
    for (const layer of layers) if (!layer.cells) snapshot(layer);

    camera.getWorldPosition(_pos);
    camera.getWorldDirection(_dir);
    const reflection = Boolean(ctx.water?.reflectionEnabled);
    const shadow = shadowBounds();
    const shadowKey = shadow ? `${Math.round(shadow.x / 4)},${Math.round(shadow.z / 4)},${shadow.extent}` : '';
    const preset = ctx.quality;
    const densityKey = preset ? `${preset.vegetationDensity}/${preset.grassDensity}` : '';

    const moved = Math.hypot(_pos.x - state.camX, _pos.y - state.camY, _pos.z - state.camZ);
    const turned = _dir.x * state.dirX + _dir.y * state.dirY + _dir.z * state.dirZ;
    // The FOV is deliberately NOT part of the key: sprinting eases the player
    // camera from 70° to 76° and re-targets it from the running speed, so it
    // changes by a hair on most frames while running, and keying on it made
    // the culler repack every one of those frames (a visible hitch). The
    // widened frustum below is packed at fov + 2·margin, so a view that has
    // grown by less than the margin is still fully covered; only growth
    // beyond it forces a repack.
    const projectionKey = `${camera.aspect}|${camera.near}|${camera.far}`;
    const fovGrew = camera.fov > state.fov + FOV_MARGIN_DEG;
    if (
      !state.force &&
      moved < REPACK_MOVE &&
      turned > REPACK_TURN &&
      !fovGrew &&
      reflection === state.reflection &&
      shadowKey === state.shadowKey &&
      densityKey === state.densityKey &&
      projectionKey === state.projectionKey
    ) {
      return;
    }
    const t0 = performance.now();
    state.force = false;
    state.camX = _pos.x;
    state.camY = _pos.y;
    state.camZ = _pos.z;
    state.dirX = _dir.x;
    state.dirY = _dir.y;
    state.dirZ = _dir.z;
    state.fov = camera.fov;
    state.reflection = reflection;
    state.shadowKey = shadowKey;
    state.densityKey = densityKey;
    state.projectionKey = projectionKey;

    // widened main frustum
    _wideCam.fov = Math.min(170, camera.fov + FOV_MARGIN_DEG * 2);
    _wideCam.aspect = camera.aspect;
    _wideCam.near = camera.near;
    _wideCam.far = camera.far;
    _wideCam.updateProjectionMatrix();
    camera.updateMatrixWorld();
    _mat.copy(camera.matrixWorld).invert();
    _frustum.setFromProjectionMatrix(_mat.premultiply(_wideCam.projectionMatrix));

    // mirror-camera frustum (planar reflection across y = waterLevel)
    if (reflection) {
      const wl = WORLD.waterLevel;
      _reflect.set(1, 0, 0, 0, 0, -1, 0, 2 * wl, 0, 0, 1, 0, 0, 0, 0, 1);
      _mirrorCam.matrixWorld.multiplyMatrices(_reflect, camera.matrixWorld);
      _mirrorCam.matrixWorldInverse.copy(_mirrorCam.matrixWorld).invert();
      _mirrorPos.set(_pos.x, 2 * wl - _pos.y, _pos.z);
      _mat.copy(_mirrorCam.matrixWorldInverse);
      _mirrorFrustum.setFromProjectionMatrix(_mat.premultiply(_wideCam.projectionMatrix));
    }

    let visible = 0;
    const matrixBuffers = collectInstanceMatrixBuffers(ctx.renderer);
    for (const layer of layers) {
      const activeCount = activeCountFor(layer);
      const useMirror = reflection && layer.inReflection;
      const useShadow = Boolean(shadow) && layer.castShadow;
      const fadeEnd = layer.fadeEnd;
      const fadeInStart = layer.fadeInStart;
      const matArr = layer.mesh.instanceMatrix.array;
      const streamArr = layer.stream ? layer.stream.array : null;
      const idArr = layer.idAttr.array;
      let cursor = 0;
      let anyVisible = false;
      for (const cell of layer.cells) {
        cell.visible = false;
        // density prefix: skip cells with no live instance at all
        if (cell.indices[0] >= activeCount) continue;
        _box.min.set(cell.minX, cell.minY, cell.minZ);
        _box.max.set(cell.maxX, cell.maxY, cell.maxZ);

        // distance fade: nearest / farthest approach of the cell to the eye(s)
        let dMin = Infinity;
        let dMax = 0;
        if (fadeEnd !== null || fadeInStart !== null) {
          const d = Math.hypot(cell.cx - _pos.x, cell.cy - _pos.y, cell.cz - _pos.z);
          dMin = Math.max(0, d - cell.cr);
          dMax = d + cell.cr;
          if (useMirror) {
            const dm = Math.hypot(cell.cx - _mirrorPos.x, cell.cy - _mirrorPos.y, cell.cz - _mirrorPos.z);
            dMin = Math.min(dMin, Math.max(0, dm - cell.cr));
            dMax = Math.max(dMax, dm + cell.cr);
          }
          if (!state.debugAll && fadeEnd !== null && dMin >= fadeEnd) continue;
          if (!state.debugAll && fadeInStart !== null && dMax <= fadeInStart) continue;
        }

        let inView = state.debugAll || _frustum.intersectsBox(_box);
        if (!inView && useMirror) inView = _mirrorFrustum.intersectsBox(_box);
        if (!inView && useShadow) {
          const e = shadow.extent + SHADOW_MARGIN;
          inView = cell.maxX >= shadow.x - e && cell.minX <= shadow.x + e && cell.maxZ >= shadow.z - e && cell.minZ <= shadow.z + e;
        }
        if (!inView) continue;
        cell.visible = true;
        anyVisible = true;
      }
      // Copy in ORIGINAL index order (not cell order) so the draw order inside
      // the packed buffer is the pre-culler order: with alpha-tested cards the
      // depth test resolves exact ties by primitive order, and a different
      // order flips those pixels. One linear pass over the live prefix; the
      // copies are plain loops (no subarray views → no garbage per repack).
      if (anyVisible) {
        const cells = layer.cells;
        const cellOf = layer.cellOf;
        const src = layer.matrices;
        const srcStream = layer.streamData;
        for (let i = 0; i < activeCount; i += 1) {
          const ci = cellOf[i];
          if (ci < 0 || !cells[ci].visible) continue;
          const so = i * 16;
          const doff = cursor * 16;
          for (let k = 0; k < 16; k += 1) matArr[doff + k] = src[so + k];
          if (streamArr) {
            const s4 = i * 4;
            const d4 = cursor * 4;
            streamArr[d4] = srcStream[s4];
            streamArr[d4 + 1] = srcStream[s4 + 1];
            streamArr[d4 + 2] = srcStream[s4 + 2];
            streamArr[d4 + 3] = srcStream[s4 + 3];
          }
          idArr[cursor] = i;
          cursor += 1;
        }
      }
      if (cursor === 0) {
        // keep one degenerate instance so the draw stays valid
        matArr.fill(0, 0, 16);
        if (streamArr) streamArr.fill(0, 0, 4);
        idArr[0] = 0;
        cursor = 1;
      }
      layer.live = cursor;
      visible += cursor;
      const mesh = layer.mesh;
      mesh.count = cursor;
      const im = mesh.instanceMatrix;
      const matFloats = state.fullUpload ? im.array.length : cursor * 16;
      im.clearUpdateRanges();
      im.addUpdateRange(0, matFloats);
      im.needsUpdate = true;
      state.syncedBuffers += syncInstanceMatrixBuffers(matrixBuffers, im, matFloats);
      if (layer.stream) {
        const sa = layer.stream.attribute;
        sa.clearUpdateRanges();
        sa.addUpdateRange(0, state.fullUpload ? sa.array.length : cursor * 4);
        sa.needsUpdate = true;
      }
      layer.idAttr.clearUpdateRanges();
      layer.idAttr.addUpdateRange(0, state.fullUpload ? layer.idAttr.array.length : cursor);
      layer.idAttr.needsUpdate = true;
    }
    state.visibleInstances = visible;
    state.repacks += 1;
    state.lastMs = performance.now() - t0;
  }

  // `mesh.count` is now the packed (visible) count, no longer the quality
  // density prefix. Modules that reason about "instance k is live" in the
  // original indexing (player trunk collision, particles' tree list, audio's
  // canopy grid) should use these instead of mesh.count / instanceMatrix.array.
  function activeCount(mesh) {
    const layer = layers.find((l) => l.mesh === mesh);
    return layer ? activeCountFor(layer) : mesh.count;
  }
  function sourceMatrices(mesh) {
    const layer = layers.find((l) => l.mesh === mesh);
    if (!layer) return mesh.instanceMatrix.array;
    if (!layer.cells) snapshot(layer);
    return layer.matrices;
  }

  return {
    register,
    beginEdit,
    refresh,
    update,
    activeCount,
    sourceMatrices,
    layers,
    stats: state,
    forceRepack() {
      state.force = true;
    },
  };
}
