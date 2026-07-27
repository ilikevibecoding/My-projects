// World: chunk registry, generation, meshing budget, and block access.
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE, MESH_BUDGET_PER_FRAME, BLOCK } from './config.js';
import { Chunk } from './chunk.js';
import { generateChunk } from './terrain.js';
import { isSolid } from './blocks.js';

const SIZE = CHUNK_SIZE;

function key(cx, cz) {
  return cx + ',' + cz;
}

export class World {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials; // { opaque, transparent }
    this.chunks = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  getOrCreateChunk(cx, cz) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz, this);
      this.chunks.set(k, c);
      generateChunk(c); // fill voxel data (deterministic)
    }
    return c;
  }

  getChunk(cx, cz) {
    return this.chunks.get(key(cx, cz));
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(wx / SIZE);
    const cz = Math.floor(wz / SIZE);
    const c = this.getOrCreateChunk(cx, cz);
    const lx = wx - cx * SIZE;
    const lz = wz - cz * SIZE;
    return c.getLocal(lx, wy, lz);
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / SIZE);
    const cz = Math.floor(wz / SIZE);
    const c = this.getOrCreateChunk(cx, cz);
    const lx = wx - cx * SIZE;
    const lz = wz - cz * SIZE;
    c.set(lx, wy, lz, id);
    c.dirty = true;
    // mark neighbor chunks dirty if edit is on a border (face culling depends on them)
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === SIZE - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (c) c.dirty = true;
  }

  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(wx, wy, wz));
  }

  // topmost solid block height at column (x,z); returns y of the surface block
  surfaceHeight(wx, wz) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(wx, y, wz))) return y;
    }
    return 0;
  }

  _applyMesh(chunk) {
    chunk.buildMesh();

    // dispose old meshes
    if (chunk.opaqueMesh) {
      this.group.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (chunk.transparentMesh) {
      this.group.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
      chunk.transparentMesh = null;
    }

    if (chunk.opaqueGeoData.pos.length > 0) {
      const geo = Chunk.makeGeometry(chunk.opaqueGeoData);
      const mesh = new THREE.Mesh(geo, this.materials.opaque);
      mesh.frustumCulled = true;
      this.group.add(mesh);
      chunk.opaqueMesh = mesh;
    }
    if (chunk.transGeoData.pos.length > 0) {
      const geo = Chunk.makeGeometry(chunk.transGeoData);
      const mesh = new THREE.Mesh(geo, this.materials.transparent);
      mesh.frustumCulled = true;
      this.group.add(mesh);
      chunk.transparentMesh = mesh;
    }
    // free temp arrays
    chunk.opaqueGeoData = null;
    chunk.transGeoData = null;
  }

  _unloadChunk(k, chunk) {
    if (chunk.opaqueMesh) {
      this.group.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
    }
    if (chunk.transparentMesh) {
      this.group.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
    }
    this.chunks.delete(k);
  }

  // Called each frame: ensure chunks near player exist + meshed, unload far ones.
  update(playerPos) {
    const pcx = Math.floor(playerPos.x / SIZE);
    const pcz = Math.floor(playerPos.z / SIZE);
    const R = RENDER_DISTANCE;

    // Ensure data chunks within render distance exist; collect dirty ones.
    const dirty = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const c = this.getOrCreateChunk(cx, cz);
        if (c.dirty) {
          dirty.push({ c, dist: dx * dx + dz * dz });
        }
      }
    }

    // Build nearest dirty chunks first, up to the per-frame budget.
    dirty.sort((a, b) => a.dist - b.dist);
    const budget = Math.min(MESH_BUDGET_PER_FRAME, dirty.length);
    for (let i = 0; i < budget; i++) {
      this._applyMesh(dirty[i].c);
    }

    // Unload chunks beyond an unload radius to bound memory.
    const unloadR = R + 3;
    for (const [k, c] of this.chunks) {
      const dcx = c.cx - pcx;
      const dcz = c.cz - pcz;
      if (dcx * dcx + dcz * dcz > unloadR * unloadR) {
        this._unloadChunk(k, c);
      }
    }

    return dirty.length - budget; // remaining work
  }

  // Synchronously generate + mesh everything within render distance (for initial load).
  generateInitial(playerPos) {
    const pcx = Math.floor(playerPos.x / SIZE);
    const pcz = Math.floor(playerPos.z / SIZE);
    const R = RENDER_DISTANCE;
    const list = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const c = this.getOrCreateChunk(pcx + dx, pcz + dz);
        list.push({ c, dist: dx * dx + dz * dz });
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    for (const item of list) this._applyMesh(item.c);
  }
}
