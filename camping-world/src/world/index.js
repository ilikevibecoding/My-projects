import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildTerrain, terrainHeight } from './terrain.js';
import { buildSky, DEFAULT_HDRI } from './sky.js';
import { buildVegetation, setVegetationTime } from './vegetation.js';
import { buildGrass, setGrassTime } from './grass.js';
import { buildCampsite } from './campsite.js';

const MODEL_IDS = [
  // trees
  'island_tree_01',
  'island_tree_02',
  'tree_small_02',
  'searsia_lucida',
  'fir_sapling',
  // hero-LOD trees (nearest the campsite cameras — denser leaf cards)
  'island_tree_01_hero',
  'tree_small_02_hero',
  // mid-LOD trees (clearing edge band)
  'island_tree_01_mid',
  'island_tree_02_mid',
  'tree_small_02_mid',
  'searsia_lucida_mid',
  'fir_sapling_mid',
  // far-LOD trees (backdrop ring)
  'island_tree_02_far',
  'tree_small_02_far',
  // understory
  'shrub_01',
  'shrub_02',
  'shrub_03',
  'fern_02',
  'nettle_plant',
  'dandelion_01',
  // campsite + deadwood + rocks
  'dead_tree_trunk',
  'dead_tree_trunk_02',
  'tree_stump_01',
  'dry_branches_medium_01',
  'bark_debris_01',
  'sand_rocks_small_01',
  'rock_07',
  'boulder_01',
  'rock_moss_set_01',
  'namaqualand_boulder_02',
  'hatchet',
  'wooden_crate_01',
  'wooden_lantern_01',
];

export async function buildWorld(scene, renderer, onProgress = () => {}) {
  const params = new URLSearchParams(location.search);
  const hdriName = params.get('hdri') ?? DEFAULT_HDRI;

  // --- sky first (lighting context), then terrain, then load models ---
  const skyPromise = buildSky(scene, renderer, hdriName);
  const terrain = buildTerrain(scene);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  let loaded = 0;
  const models = {};
  await Promise.all(
    MODEL_IDS.map(async (id) => {
      try {
        models[id] = await loader.loadAsync(`./assets/models/${id}.glb`);
      } catch (e) {
        console.error(`[world] failed to load model ${id}:`, e.message ?? e);
      }
      onProgress(++loaded / (MODEL_IDS.length + 1));
    })
  );

  const sky = await skyPromise;
  onProgress(1);

  const campsite = buildCampsite(scene, models, terrainHeight);
  const vegetation = buildVegetation(scene, models, terrainHeight);
  const grass = buildGrass(scene, terrainHeight, campsite.campCenter);

  console.log(`[world] grass instances: ${grass.count}`);

  const colliders = [...vegetation.colliders, ...campsite.colliders];

  return {
    getTerrainHeight: terrainHeight,
    colliders,
    sky,
    update(elapsed) {
      setGrassTime(elapsed);
      setVegetationTime(elapsed);
    },
  };
}
