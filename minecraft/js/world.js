import * as THREE from 'three';
import {
  CHUNK_SIZE,
  WORLD_HEIGHT,
  RENDER_DISTANCE,
  UNLOAD_DISTANCE,
  MESH_TIME_BUDGET_MS,
} from './constants.js';
import { Blocks, BLOCK_DEFS, isOpaque, tileForFace } from './blocks.js';
import { WorldGen } from './worldgen.js';

const CS = CHUNK_SIZE;
const LAYER = CS * CS;

// Face winding/uv layout based on the classic three.js voxel example.
const FACES = [
  {
    dir: [-1, 0, 0],
    shade: 0.72,
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    dir: [1, 0, 0],
    shade: 0.72,
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    dir: [0, -1, 0],
    shade: 0.55,
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 1, 0],
    shade: 1.0,
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    dir: [0, 0, -1],
    shade: 0.85,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    dir: [0, 0, 1],
    shade: 0.85,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

for (const face of FACES) {
  face.axis = face.dir.findIndex((v) => v !== 0);
  face.t1 = face.axis === 0 ? 1 : 0;
  face.t2 = face.axis === 2 ? 1 : 2;
}

const AO_CURVE = [0.45, 0.66, 0.83, 1.0];

function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

function grow(arr, minLen) {
  const next = new arr.constructor(Math.max(minLen, arr.length * 2));
  next.set(arr);
  return next;
}

// Reusable scratch buffers for mesh building. Persisting these across chunk
// rebuilds avoids re-allocating millions of array slots per build, which
// otherwise causes GC hitches while flying around.
class MeshBuilder {
  constructor() {
    this.positions = new Float32Array(16384 * 3);
    this.normals = new Float32Array(16384 * 3);
    this.uvs = new Float32Array(16384 * 2);
    this.colors = new Float32Array(16384 * 3);
    this.indices = new Uint32Array(24576);
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  reset() {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  ensureQuad() {
    const v = this.vertexCount + 4;
    if (v * 3 > this.positions.length) {
      this.positions = grow(this.positions, v * 3);
      this.normals = grow(this.normals, v * 3);
      this.colors = grow(this.colors, v * 3);
      this.uvs = grow(this.uvs, v * 2);
    }
    if (this.indexCount + 6 > this.indices.length) {
      this.indices = grow(this.indices, this.indexCount + 6);
    }
  }
}

const solidBuilder = new MeshBuilder();
const transBuilder = new MeshBuilder();

class Chunk {
  constructor(cx, cz, data, heights) {
    this.cx = cx;
    this.cz = cz;
    this.data = data;
    this.heights = heights;
    this.solidMesh = null;
    this.transMesh = null;
    this.hasMesh = false;
    this.dirty = false;
    this.inDirtyQueue = false;
  }
}

export class World {
  constructor(scene, atlas, seed) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed >>> 0;
    this.gen = new WorldGen(this.seed);
    this.chunks = new Map();
    this.edits = new Map(); // chunkKey -> Map(localIdx -> blockId)
    this.loadQueue = [];
    this.dirtyQueue = [];
    this.freshMeshes = [];
    this.lastCenter = null;
    this.unloadCounter = 0;
    this.saveTimer = null;
    this.storageKey = 'blockcraft:edits:' + this.seed;

    this.solidMaterial = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      vertexColors: true,
    });
    this.transMaterial = new THREE.MeshLambertMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.loadEdits();
  }

  // ------------------------------------------------------------ persistence

  loadEdits() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      for (const [key, entries] of Object.entries(parsed.chunks || {})) {
        const map = new Map();
        for (const [idx, id] of entries) map.set(idx, id);
        this.edits.set(key, map);
      }
    } catch (err) {
      console.warn('Could not load saved edits', err);
    }
  }

  saveEdits() {
    try {
      const chunks = {};
      for (const [key, map] of this.edits) {
        chunks[key] = Array.from(map.entries());
      }
      localStorage.setItem(this.storageKey, JSON.stringify({ version: 1, chunks }));
    } catch (err) {
      console.warn('Could not save edits', err);
    }
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      // Serialize during idle time so a big edit log never steals a frame.
      if (window.requestIdleCallback) {
        requestIdleCallback(() => this.saveEdits(), { timeout: 3000 });
      } else {
        this.saveEdits();
      }
    }, 1500);
  }

  // ---------------------------------------------------------------- chunks

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  ensureChunkData(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;

    const { data, heights } = this.gen.generateChunk(cx, cz);
    chunk = new Chunk(cx, cz, data, heights);

    const editMap = this.edits.get(key);
    if (editMap) {
      for (const [idx, id] of editMap) {
        data[idx] = id;
      }
      this.recomputeHeights(chunk);
    }

    this.chunks.set(key, chunk);
    return chunk;
  }

  recomputeHeights(chunk) {
    const { data, heights } = chunk;
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        let top = 0;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const id = data[lx + lz * CS + y * LAYER];
          if (id !== Blocks.AIR && id !== Blocks.WATER) {
            top = y;
            break;
          }
        }
        heights[lx + lz * CS] = top;
      }
    }
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return Blocks.BEDROCK;
    if (wy >= WORLD_HEIGHT) return Blocks.AIR;
    const chunk = this.ensureChunkData(wx >> 4, wz >> 4);
    return chunk.data[(wx & 15) + (wz & 15) * CS + wy * LAYER];
  }

  setBlock(wx, wy, wz, id) {
    if (wy <= 0 || wy >= WORLD_HEIGHT) return false;
    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.ensureChunkData(cx, cz);
    const lx = wx & 15;
    const lz = wz & 15;
    const idx = lx + lz * CS + wy * LAYER;
    if (chunk.data[idx] === id) return false;

    chunk.data[idx] = id;

    const key = chunkKey(cx, cz);
    let editMap = this.edits.get(key);
    if (!editMap) {
      editMap = new Map();
      this.edits.set(key, editMap);
    }
    editMap.set(idx, id);

    // Keep the column-height lighting heuristic up to date.
    const hIdx = lx + lz * CS;
    const isSky = id === Blocks.AIR || id === Blocks.WATER;
    if (!isSky && wy > chunk.heights[hIdx]) {
      chunk.heights[hIdx] = wy;
    } else if (isSky && wy === chunk.heights[hIdx]) {
      let top = 0;
      for (let y = wy; y >= 0; y--) {
        const b = chunk.data[lx + lz * CS + y * LAYER];
        if (b !== Blocks.AIR && b !== Blocks.WATER) {
          top = y;
          break;
        }
      }
      chunk.heights[hIdx] = top;
    }

    this.markDirty(chunk);
    const markNeighbor = (dx, dz) => {
      const n = this.getChunk(cx + dx, cz + dz);
      if (n && n.hasMesh) this.markDirty(n);
    };
    if (lx === 0) markNeighbor(-1, 0);
    if (lx === CS - 1) markNeighbor(1, 0);
    if (lz === 0) markNeighbor(0, -1);
    if (lz === CS - 1) markNeighbor(0, 1);
    if (lx === 0 && lz === 0) markNeighbor(-1, -1);
    if (lx === 0 && lz === CS - 1) markNeighbor(-1, 1);
    if (lx === CS - 1 && lz === 0) markNeighbor(1, -1);
    if (lx === CS - 1 && lz === CS - 1) markNeighbor(1, 1);

    this.scheduleSave();
    return true;
  }

  // ---------------------------------------------------------------- update

  markDirty(chunk) {
    chunk.dirty = true;
    if (!chunk.inDirtyQueue) {
      chunk.inDirtyQueue = true;
      this.dirtyQueue.push(chunk);
    }
  }

  update(px, pz) {
    const pcx = Math.floor(px / CS);
    const pcz = Math.floor(pz / CS);

    // Meshes added last frame have been uploaded to the GPU by now; let the
    // frustum cull them normally again.
    if (this.freshMeshes.length > 0) {
      for (const mesh of this.freshMeshes) mesh.frustumCulled = true;
      this.freshMeshes.length = 0;
    }

    const center = pcx + ',' + pcz;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.loadQueue = [];
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
          const cx = pcx + dx;
          const cz = pcz + dz;
          const chunk = this.getChunk(cx, cz);
          if (chunk && chunk.hasMesh) continue;
          this.loadQueue.push({ cx, cz, d: dx * dx + dz * dz });
        }
      }
      this.loadQueue.sort((a, b) => b.d - a.d);
    }

    // Mesh building is time-budgeted so it never tanks the frame rate.
    const start = performance.now();
    let built = 0;

    // Edited chunks first, for snappy block break/place feedback.
    while (
      this.dirtyQueue.length > 0 &&
      (built === 0 || performance.now() - start < MESH_TIME_BUDGET_MS)
    ) {
      const chunk = this.dirtyQueue.shift();
      chunk.inDirtyQueue = false;
      if (!chunk.dirty) continue;
      if (this.chunks.get(chunkKey(chunk.cx, chunk.cz)) !== chunk) continue;
      this.buildChunkMesh(chunk);
      built++;
    }

    while (
      this.loadQueue.length > 0 &&
      (built === 0 || performance.now() - start < MESH_TIME_BUDGET_MS)
    ) {
      const { cx, cz } = this.loadQueue.pop();
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > RENDER_DISTANCE) continue;
      const chunk = this.ensureChunkData(cx, cz);
      if (chunk.hasMesh && !chunk.dirty) continue;
      this.buildChunkMesh(chunk);
      built++;
    }

    // Unload far-away chunks, a few at a time to avoid disposal bursts when
    // flying across the world quickly.
    if (++this.unloadCounter >= 30) {
      this.unloadCounter = 0;
      let disposed = 0;
      for (const [key, chunk] of this.chunks) {
        const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
        if (d > UNLOAD_DISTANCE) {
          this.disposeChunkMeshes(chunk);
          this.chunks.delete(key);
          if (++disposed >= 8) break;
        }
      }
    }
  }

  get pendingChunks() {
    return this.loadQueue.length;
  }

  disposeChunkMeshes(chunk) {
    for (const meshName of ['solidMesh', 'transMesh']) {
      const mesh = chunk[meshName];
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        chunk[meshName] = null;
      }
    }
    chunk.hasMesh = false;
  }

  // --------------------------------------------------------------- meshing

  makeSampler(cx, cz) {
    const neighborhood = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        neighborhood.push(this.ensureChunkData(cx + dx, cz + dz));
      }
    }
    return {
      block: (wx, wy, wz) => {
        if (wy < 0) return Blocks.BEDROCK;
        if (wy >= WORLD_HEIGHT) return Blocks.AIR;
        const ix = (wx >> 4) - cx + 1;
        const iz = (wz >> 4) - cz + 1;
        const chunk = neighborhood[ix + iz * 3];
        return chunk.data[(wx & 15) + (wz & 15) * CS + wy * LAYER];
      },
      height: (wx, wz) => {
        const ix = (wx >> 4) - cx + 1;
        const iz = (wz >> 4) - cz + 1;
        const chunk = neighborhood[ix + iz * 3];
        return chunk.heights[(wx & 15) + (wz & 15) * CS];
      },
    };
  }

  buildChunkMesh(chunk) {
    const sampler = this.makeSampler(chunk.cx, chunk.cz);
    const x0 = chunk.cx * CS;
    const z0 = chunk.cz * CS;
    const solid = solidBuilder;
    const trans = transBuilder;
    solid.reset();
    trans.reset();
    const data = chunk.data;
    const ao = [0, 0, 0, 0];

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let lz = 0; lz < CS; lz++) {
        for (let lx = 0; lx < CS; lx++) {
          const id = data[lx + lz * CS + y * LAYER];
          if (id === Blocks.AIR) continue;
          const def = BLOCK_DEFS[id];
          const wx = x0 + lx;
          const wz = z0 + lz;

          const isWater = id === Blocks.WATER;
          let waterTopOffset = 0;
          if (isWater && sampler.block(wx, y + 1, wz) !== Blocks.WATER) {
            waterTopOffset = 0.12;
          }

          for (const face of FACES) {
            const dir = face.dir;
            const nx = wx + dir[0];
            const ny = y + dir[1];
            const nz = wz + dir[2];
            const nId = sampler.block(nx, ny, nz);

            if (def.translucent) {
              if (nId === id || isOpaque(nId)) continue;
            } else if (isOpaque(nId)) {
              continue;
            }

            const target = def.translucent ? trans : solid;
            const [u0, v0, u1, v1] = this.atlas.uvRect(tileForFace(id, dir[1]));

            const hcol = sampler.height(nx, nz);
            let light;
            if (ny >= hcol) light = 1;
            else light = Math.max(0.32, 1 - (hcol - ny) * 0.08);
            const base = light * face.shade;

            target.ensureQuad();
            const vBase = target.vertexCount;
            const { positions, normals, uvs, colors, indices } = target;

            for (let ci = 0; ci < 4; ci++) {
              const corner = face.corners[ci];
              const p = corner.pos;

              let vy = y + p[1];
              if (isWater && p[1] === 1 && dir[1] >= 0) vy -= waterTopOffset;

              const vi = (vBase + ci) * 3;
              positions[vi] = lx + p[0];
              positions[vi + 1] = vy;
              positions[vi + 2] = lz + p[2];
              normals[vi] = dir[0];
              normals[vi + 1] = dir[1];
              normals[vi + 2] = dir[2];

              const ti = (vBase + ci) * 2;
              uvs[ti] = u0 + (u1 - u0) * corner.uv[0];
              uvs[ti + 1] = v0 + (v1 - v0) * corner.uv[1];

              let brightness = base;
              if (!def.translucent) {
                const s1 = p[face.t1] === 1 ? 1 : -1;
                const s2 = p[face.t2] === 1 ? 1 : -1;
                const o1 = [0, 0, 0];
                const o2 = [0, 0, 0];
                o1[face.t1] = s1;
                o2[face.t2] = s2;
                const side1 = isOpaque(
                  sampler.block(nx + o1[0], ny + o1[1], nz + o1[2])
                )
                  ? 1
                  : 0;
                const side2 = isOpaque(
                  sampler.block(nx + o2[0], ny + o2[1], nz + o2[2])
                )
                  ? 1
                  : 0;
                let aoLevel;
                if (side1 && side2) {
                  aoLevel = 0;
                } else {
                  const cornerB = isOpaque(
                    sampler.block(nx + o1[0] + o2[0], ny + o1[1] + o2[1], nz + o1[2] + o2[2])
                  )
                    ? 1
                    : 0;
                  aoLevel = 3 - (side1 + side2 + cornerB);
                }
                ao[ci] = aoLevel;
                brightness *= AO_CURVE[aoLevel];
              } else {
                ao[ci] = 3;
              }

              colors[vi] = brightness;
              colors[vi + 1] = brightness;
              colors[vi + 2] = brightness;
            }

            // Flip the quad diagonal when it reduces AO interpolation artifacts.
            const ii = target.indexCount;
            if (ao[0] + ao[3] > ao[1] + ao[2]) {
              indices[ii] = vBase;
              indices[ii + 1] = vBase + 1;
              indices[ii + 2] = vBase + 3;
              indices[ii + 3] = vBase;
              indices[ii + 4] = vBase + 3;
              indices[ii + 5] = vBase + 2;
            } else {
              indices[ii] = vBase;
              indices[ii + 1] = vBase + 1;
              indices[ii + 2] = vBase + 2;
              indices[ii + 3] = vBase + 2;
              indices[ii + 4] = vBase + 1;
              indices[ii + 5] = vBase + 3;
            }
            target.vertexCount += 4;
            target.indexCount += 6;
          }
        }
      }
    }

    this.replaceMesh(chunk, 'solidMesh', solid, this.solidMaterial, x0, z0, 0);
    this.replaceMesh(chunk, 'transMesh', trans, this.transMaterial, x0, z0, 1);
    chunk.hasMesh = true;
    chunk.dirty = false;
  }

  replaceMesh(chunk, slot, builder, material, x0, z0, renderOrder) {
    if (chunk[slot]) {
      this.scene.remove(chunk[slot]);
      chunk[slot].geometry.dispose();
      chunk[slot] = null;
    }
    if (builder.indexCount === 0) return;

    const vc = builder.vertexCount;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(builder.positions.slice(0, vc * 3), 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(builder.normals.slice(0, vc * 3), 3)
    );
    geometry.setAttribute('uv', new THREE.BufferAttribute(builder.uvs.slice(0, vc * 2), 2));
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(builder.colors.slice(0, vc * 3), 3)
    );
    geometry.setIndex(
      new THREE.BufferAttribute(builder.indices.slice(0, builder.indexCount), 1)
    );
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x0, 0, z0);
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // Render un-culled for one frame so the GPU upload happens now, not on
    // the first frame the camera happens to turn toward this chunk (which
    // would cause a visible hitch while looking around).
    mesh.frustumCulled = false;
    this.freshMeshes.push(mesh);
    this.scene.add(mesh);
    chunk[slot] = mesh;
  }
}
