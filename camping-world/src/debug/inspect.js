/**
 * Single-model inspector: /inspect.html?model=island_tree_01&angle=0
 * Neutral studio: gray ground, sky env, sun. Camera auto-frames the model.
 * Exposes __READY and __setAngle(deg) for screenshot tooling.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const params = new URLSearchParams(location.search);
const modelId = params.get('model') ?? 'island_tree_01';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb2c8);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 500);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const sun = new THREE.DirectionalLight(0xfff2dd, 2.5);
sun.position.set(30, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1 })
);
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

let radius = 5;
let center = new THREE.Vector3();
let yaw = ((parseFloat(params.get('angle') ?? '30') || 0) * Math.PI) / 180;

function placeCamera() {
  const d = radius * 2.4;
  camera.position.set(
    center.x + Math.sin(yaw) * d,
    center.y + radius * 0.35,
    center.z + Math.cos(yaw) * d
  );
  camera.lookAt(center);
}

window.__setAngle = async (deg) => {
  yaw = (deg * Math.PI) / 180;
  placeCamera();
  await new Promise((r) => setTimeout(r, 100));
  return deg;
};

window.__READY = false;

loader.load(`/assets/models/${modelId}.glb`, (gltf) => {
  const obj = gltf.scene;
  obj.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = n.receiveShadow = true;
      if (n.material?.transparent) {
        n.material.transparent = false;
        n.material.alphaTest = 0.45;
        n.material.side = THREE.DoubleSide;
      }
    }
  });
  scene.add(obj);

  const box = new THREE.Box3().setFromObject(obj);
  center = box.getCenter(new THREE.Vector3());
  radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2.8, 0.4);
  // sit the model on the ground plane
  obj.position.y -= box.min.y;
  center.y -= box.min.y;
  placeCamera();

  let tris = 0;
  obj.traverse((n) => {
    if (n.isMesh) {
      const g = n.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  console.log(`[inspect] ${modelId}: ${Math.round(tris).toLocaleString()} tris`);
  setTimeout(() => (window.__READY = true), 300);
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
