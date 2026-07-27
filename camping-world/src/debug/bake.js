/**
 * Grass-card baker. Loads RAW Poly Haven grass scans (full quality, separate
 * clump meshes), renders each selected clump as *unlit albedo* (MeshBasic with
 * the scan's diffuse map) against a transparent background, side-on — ready to
 * become alpha-tested billboard cards.
 *
 * Exposes:
 *   __READY
 *   __clumpCount()        — number of bakeable clumps discovered
 *   __bakeClump(i, px)    — render clump i at px×px, returns dataURL + aspect
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SOURCES = [
  { url: '/raw/models/grass_medium_01/grass_medium_01.gltf', take: 6 },
  { url: '/raw/models/grass_medium_02/grass_medium_02.gltf', take: 2 },
];

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // raw albedo — relit at runtime
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

const clumps = []; // { mesh, box }

const loader = new GLTFLoader();

async function init() {
  for (const src of SOURCES) {
    const gltf = await loader.loadAsync(src.url);
    gltf.scene.updateMatrixWorld(true);
    const meshes = [];
    gltf.scene.traverse((n) => n.isMesh && meshes.push(n));
    // sort by footprint, take the largest distinct clumps
    const withBox = meshes.map((m) => {
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      return { m, box, vol: size.x * size.y * size.z };
    });
    withBox.sort((a, b) => b.vol - a.vol);
    for (const { m, box } of withBox.slice(0, src.take)) {
      const basic = new THREE.MeshBasicMaterial({
        map: m.material.map,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      });
      const clone = new THREE.Mesh(m.geometry, basic);
      clone.applyMatrix4(m.matrixWorld);
      clumps.push({ mesh: clone, box });
    }
  }
  window.__READY = true;
}

window.__clumpCount = () => clumps.length;

window.__bakeClump = async (i, px = 512) => {
  const { mesh, box } = clumps[i];
  scene.clear();
  scene.add(mesh);

  renderer.setSize(px, px);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y) * 0.54;

  const cam = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, 50);
  // side-on, very slight elevation — how a billboard card is seen in-game
  cam.position.set(center.x, center.y + size.y * 0.1, center.z + 10);
  cam.lookAt(center.x, center.y, center.z);

  renderer.render(scene, cam);
  return {
    dataURL: renderer.domElement.toDataURL('image/png'),
    aspect: size.x / size.y,
    heightM: size.y,
    frameM: span * 2, // world meters covered by the square cell image
  };
};

window.__READY = false;
init();
