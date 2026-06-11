import * as THREE from 'three';

/**
 * World builder. Phase 0: gray-box stand-in (flat-ish ground, blockout props,
 * simple sky/sun) so the screenshot harness and controls can be proven
 * end-to-end. Replaced piece-by-piece by terrain/sky/vegetation/campsite
 * modules in later phases.
 *
 * Returns { getTerrainHeight, colliders, update }.
 */
export async function buildWorld(scene, renderer, onProgress = () => {}) {
  const colliders = [];

  // --- placeholder sky + light rig ---
  scene.background = new THREE.Color(0x87a4c0);
  scene.fog = new THREE.FogExp2(0x9fb4c4, 0.012);

  const hemi = new THREE.HemisphereLight(0xbdd2e8, 0x59503e, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffeed0, 2.4);
  sun.position.set(-40, 35, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // --- placeholder terrain: gentle sine-bump field ---
  const getTerrainHeight = (x, z) =>
    Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.2 + Math.sin(x * 0.013 + z * 0.021) * 2.0;

  const groundGeo = new THREE.PlaneGeometry(300, 300, 128, 128);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)));
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x6a6f5a, roughness: 1.0 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // --- blockout "trees" ---
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x4f4334, roughness: 0.9 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3d5232, roughness: 1.0 });
  const treeSpots = [
    [-8, -4], [14, -10], [-18, 8], [22, 14], [-25, -15], [9, 25], [-5, 30], [30, -2],
  ];
  for (const [x, z] of treeSpots) {
    const h = 7 + ((x * 13 + z * 7) % 5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 10), treeMat);
    const y = getTerrainHeight(x, z);
    trunk.position.set(x, y + h / 2, z);
    trunk.castShadow = trunk.receiveShadow = true;
    scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + (h - 7) * 0.4, 1), canopyMat);
    canopy.position.set(x, y + h + 1.2, z);
    canopy.castShadow = true;
    scene.add(canopy);
    colliders.push({ x, z, radius: 0.6 });
  }

  // --- blockout campsite at origin: fire ring + "logs" ---
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 0.95 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), ringMat);
    rock.position.set(Math.cos(a) * 0.7, getTerrainHeight(Math.cos(a) * 0.7, Math.sin(a) * 0.7) + 0.1, Math.sin(a) * 0.7);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }
  const logMat = new THREE.MeshStandardMaterial({ color: 0x5e4a33, roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), logMat);
    const a = i * 0.9 + 0.3;
    log.position.set(Math.cos(a) * 0.15, getTerrainHeight(0, 0) + 0.18 + i * 0.07, Math.sin(a) * 0.15);
    log.rotation.set(Math.PI / 2 - 0.15, a, 0.1 * i);
    log.castShadow = log.receiveShadow = true;
    scene.add(log);
  }
  const seatLog = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 2.4, 12), logMat);
  seatLog.position.set(2.2, getTerrainHeight(2.2, 1.4) + 0.22, 1.4);
  seatLog.rotation.z = Math.PI / 2;
  seatLog.rotation.y = 0.5;
  seatLog.castShadow = seatLog.receiveShadow = true;
  scene.add(seatLog);
  colliders.push({ x: 0, z: 0, radius: 0.85 });

  onProgress(1);

  return {
    getTerrainHeight,
    colliders,
    update: () => {},
  };
}
