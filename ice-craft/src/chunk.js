// Chunk: voxel storage + mesh building via per-face culling.
import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK } from './config.js';
import { blockDef, isOpaque, isAir } from './blocks.js';
import { ATLAS_COLS, ATLAS_ROWS } from './blocks.js';

const SIZE = CHUNK_SIZE;
const HEIGHT = WORLD_HEIGHT;
const LAYER = SIZE * SIZE;

// Per-direction face geometry.
// dir order: [px, nx, py, ny, pz, nz]
const FACES = [
  { // +X
    normal: [1, 0, 0],
    corners: [ [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1] ],
    shade: 0.82,
  },
  { // -X
    normal: [-1, 0, 0],
    corners: [ [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0] ],
    shade: 0.72,
  },
  { // +Y (top)
    normal: [0, 1, 0],
    corners: [ [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0] ],
    shade: 1.0,
  },
  { // -Y (bottom)
    normal: [0, -1, 0],
    corners: [ [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1] ],
    shade: 0.5,
  },
  { // +Z
    normal: [0, 0, 1],
    corners: [ [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1] ],
    shade: 0.66,
  },
  { // -Z
    normal: [0, 0, -1],
    corners: [ [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0] ],
    shade: 0.76,
  },
];

const DIR_OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function tileUV(tileIndex) {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  // Inset slightly to avoid bleeding between atlas tiles.
  const inset = 0.001;
  const u0 = (col + inset) / ATLAS_COLS;
  const u1 = (col + 1 - inset) / ATLAS_COLS;
  // Canvas row 0 is at the top; flip V so row 0 maps to top of texture.
  const v1 = 1 - (row + inset) / ATLAS_ROWS;
  const v0 = 1 - (row + 1 - inset) / ATLAS_ROWS;
  return { u0, u1, v0, v1 };
}

export class Chunk {
  constructor(cx, cz, world) {
    this.cx = cx;
    this.cz = cz;
    this.world = world;
    this.voxels = new Uint8Array(SIZE * SIZE * HEIGHT);
    this.opaqueMesh = null;
    this.transparentMesh = null;
    this.dirty = true;
    this.generated = false;
  }

  static index(x, y, z) {
    return x + z * SIZE + y * LAYER;
  }

  get(x, y, z) {
    if (y < 0 || y >= HEIGHT) return BLOCK.AIR;
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE) {
      // delegate to world for cross-chunk lookups
      return this.world.getBlock(this.cx * SIZE + x, y, this.cz * SIZE + z);
    }
    return this.voxels[Chunk.index(x, y, z)];
  }

  set(x, y, z, id) {
    if (x < 0 || x >= SIZE || z < 0 || z >= SIZE || y < 0 || y >= HEIGHT) return;
    this.voxels[Chunk.index(x, y, z)] = id;
    this.dirty = true;
  }

  // local-only get (no world delegation), for fast same-chunk reads
  getLocal(x, y, z) {
    if (y < 0 || y >= HEIGHT || x < 0 || x >= SIZE || z < 0 || z >= SIZE) return BLOCK.AIR;
    return this.voxels[Chunk.index(x, y, z)];
  }

  faceVisible(current, neighbor) {
    if (isAir(neighbor)) return true;
    if (isOpaque(neighbor)) return false;
    // neighbor is transparent (ice/crystal)
    if (isOpaque(current)) return true;
    // both transparent: hide internal faces between same type
    return current !== neighbor;
  }

  buildMesh() {
    const opaque = { pos: [], norm: [], uv: [], col: [], idx: [] };
    const trans = { pos: [], norm: [], uv: [], col: [], idx: [] };

    const baseX = this.cx * SIZE;
    const baseZ = this.cz * SIZE;

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < SIZE; z++) {
        for (let x = 0; x < SIZE; x++) {
          const id = this.voxels[Chunk.index(x, y, z)];
          if (id === BLOCK.AIR) continue;
          const def = blockDef(id);
          const target = def.opaque ? opaque : trans;

          for (let f = 0; f < 6; f++) {
            const off = DIR_OFFSETS[f];
            const nb = this.get(x + off[0], y + off[1], z + off[2]);
            if (!this.faceVisible(id, nb)) continue;

            const face = FACES[f];
            const tile = def.faces[f];
            const { u0, u1, v0, v1 } = tileUV(tile);
            const shade = def.light ? 1.0 : face.shade;

            const vi = target.pos.length / 3;
            const wx = baseX + x;
            const wz = baseZ + z;
            for (let c = 0; c < 4; c++) {
              const cc = face.corners[c];
              target.pos.push(wx + cc[0], y + cc[1], wz + cc[2]);
              target.norm.push(face.normal[0], face.normal[1], face.normal[2]);
              target.col.push(shade, shade, shade);
            }
            // UVs: map corners 0..3 -> (u0,v0),(u0,v1),(u1,v1),(u1,v0)
            target.uv.push(u0, v0, u0, v1, u1, v1, u1, v0);
            target.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          }
        }
      }
    }

    this.opaqueGeoData = opaque;
    this.transGeoData = trans;
    this.dirty = false;
  }

  static makeGeometry(data) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
    geo.setIndex(data.idx);
    return geo;
  }
}
