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

// pos: [x, z], eye: height above terrain, yaw/pitch in radians
export const VIEWPOINTS = [
  { name: 'campsite-closeup', pos: [3.4, 4.2], eye: 1.45, yaw: Math.PI + 0.65, pitch: -0.16 },
  { name: 'grass-eye-level', pos: [-10, 14], eye: 0.75, yaw: Math.PI * 0.82, pitch: 0.02 },
  { name: 'hero-tree-lookup', pos: [-7.5, -3.5], eye: 1.6, yaw: -1.95, pitch: 0.42 },
  { name: 'wide-vista', pos: [12, 18], eye: 1.7, yaw: Math.PI * 0.78, pitch: 0.0 },
  { name: 'backlit-camp', pos: [-14, -10], eye: 1.6, yaw: 2.45, pitch: 0.03 },
  { name: 'ground-detail', pos: [1.8, 2.4], eye: 1.5, yaw: -2.2, pitch: -0.78 },
];

export function isShotMode() {
  return new URLSearchParams(location.search).has('shot');
}

export function initHarness({ camera, renderer, getTerrainHeight, requestFrames }) {
  let ready = false;

  window.__READY = false;
  window.__views = () => VIEWPOINTS.map((v) => v.name);

  window.__setView = async (i) => {
    const v = VIEWPOINTS[i];
    if (!v) throw new Error(`no viewpoint ${i}`);
    const [x, z] = v.pos;
    const y = getTerrainHeight(x, z) + v.eye;
    camera.position.set(x, y, z);
    camera.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
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
