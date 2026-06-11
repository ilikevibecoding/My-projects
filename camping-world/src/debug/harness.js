/**
 * Deterministic screenshot harness for the self-play loop.
 *
 * Activated with `?shot=1`. Exposes on window:
 *   __READY        — true once assets are loaded and warm-up frames rendered
 *   __setView(i)   — position the camera at fixed viewpoint i, resolves after settle frames
 *   __views()      — list of viewpoint names
 *   __stats()      — renderer.info snapshot for budget checks
 *
 * Camera poses are defined relative to terrain height so they stay valid as
 * the heightfield evolves.
 */

// pos: [x, z] (camera y = terrain + eye), target: absolute [x, y, z] look-at.
// Composition targets: fire ring ≈ (1.5, *, 1.0); hero tree ≈ (-8.5, *, -6.5);
// sun corridor azimuth ≈ 54° → direction (0.81, 0, 0.59).
// Sun sits at azimuth ≈54° (NE sky), shadows stretch SW — so cameras sit
// S/SW of their subjects looking N/NE for backlit rims + shadows toward lens.
export const VIEWPOINTS = [
  { name: 'campsite-closeup', pos: [-2.4, -3.4], eye: 1.5, target: [1.5, 0.75, 1.0] },
  { name: 'grass-eye-level', pos: [-13, 9], eye: 0.7, target: [-4, 1.3, 19] },
  { name: 'hero-tree-lookup', pos: [-3.5, -0.5], eye: 1.6, target: [-8.5, 7.0, -6.5] },
  { name: 'wide-vista', pos: [-7, 9], eye: 1.7, target: [17.3, 2.6, 26.7] },
  { name: 'backlit-camp', pos: [-6.5, -9.5], eye: 1.55, target: [1.5, 1.3, 1.0] },
  { name: 'ground-detail', pos: [3.4, 3.6], eye: 1.45, target: [1.2, 0.3, 0.8] },
];

export function isShotMode() {
  return new URLSearchParams(location.search).has('shot');
}

export function initHarness({ camera, renderer, getTerrainHeight, requestFrames }) {
  let ready = false;

  window.__READY = false;
  window.__views = () => VIEWPOINTS.map((v) => v.name);

  window.__setView = async (i) => {
    // debug: ?topdown=<height> replaces every view with a bird's-eye of camp
    const td = new URLSearchParams(location.search).get('topdown');
    if (td) {
      const h = parseFloat(td) || 40;
      camera.position.set(1.5, getTerrainHeight(1.5, 1.0) + h, 1.0);
      camera.lookAt(1.6, 0, 1.0);
      camera.updateMatrixWorld();
      await requestFrames(4);
      return `topdown${i}`;
    }
    const v = VIEWPOINTS[i];
    if (!v) throw new Error(`no viewpoint ${i}`);
    const [x, z] = v.pos;
    const y = getTerrainHeight(x, z) + v.eye;
    camera.position.set(x, y, z);
    camera.lookAt(v.target[0], v.target[1], v.target[2]);
    camera.updateMatrixWorld();
    await requestFrames(4); // let temporal effects / shadows settle
    return v.name;
  };

  window.__stats = () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs ? renderer.info.programs.length : 0,
  });

  return {
    async markReady() {
      if (ready) return;
      ready = true;
      await requestFrames(8); // warm-up: compile programs, settle PMREM/shadows
      window.__READY = true;
    },
  };
}
