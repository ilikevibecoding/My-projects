import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
for (const id of ['stone_fire_pit','bark_debris_01','dead_tree_trunk','dead_tree_trunk_02','dry_branches_medium_01','tree_stump_01','wooden_crate_01','sand_rocks_small_01']) {
  const doc = await io.read(`public/assets/models/${id}.glb`);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const c = [(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2].map(v=>v.toFixed(2));
  const s = [b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]].map(v=>v.toFixed(2));
  console.log(id.padEnd(24), 'center', c.join(','), ' size', s.join(','), ' minY', b.min[1].toFixed(2));
}
