// builder.js — the vertical assembly screen. Palette of parts, smart snap
// stacking, live stats (mass / thrust / fuel / TWR), launch button.
// Procedural part thumbnails rendered once with a throwaway renderer.

import * as THREE from 'three';
import { PARTS, DEFAULT_STACK, buildPartMesh, stackStats } from './rocket.js';

const PALETTE_ORDER = ['pod', 'nose', 'tankSmall', 'tankLarge', 'engineSmall', 'engineLarge', 'fins', 'decoupler'];

// Insertion logic keeps stacks sane with zero fiddling — KSP mental model:
// boosters get built UNDER the rocket and fire first.
//   decoupler ("connector") slides under everything: the old rocket rides on
//     top, and whatever you add next becomes the new bottom booster stage;
//   engines sink to the very bottom (and cluster radially for more thrust);
//   tanks fuel the booster being built (just below the lowest connector) —
//     or sit under the pod when there is no connector yet;
//   pods & nose cones float to the top;
//   fins ride the bottom booster, just above its engine cluster.
function insertionIndex(stackIds, partId) {
  const type = PARTS[partId].type;
  const types = stackIds.map((id) => PARTS[id].type);
  if (type === 'engine' || type === 'decoupler') return 0;
  if (type === 'pod' || type === 'nose') return stackIds.length;
  if (type === 'fins') {
    let k = 0;
    while (k < types.length && types[k] === 'engine') k++;
    return k;
  }
  // tank: into the booster being built (below the lowest decoupler), else
  // below the topmost run of pods/noses
  const firstDec = types.indexOf('decoupler');
  if (firstDec >= 0) return firstDec;
  let i = stackIds.length;
  while (i > 0) {
    const t = types[i - 1];
    if (t === 'pod' || t === 'nose') i--;
    else break;
  }
  return i;
}

function renderThumbnails() {
  const out = {};
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(96, 96);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const key = new THREE.DirectionalLight('#fff4e0', 3.2);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight('#9fc8ff', 1.4);
  rim.position.set(-3, 1, -2);
  scene.add(key, rim, new THREE.AmbientLight('#404a60', 1.4));
  for (const id of PALETTE_ORDER) {
    const mesh = buildPartMesh(id);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    cam.position.set(center.x + r * 1.5, center.y + r * 0.85, center.z + r * 1.9);
    cam.lookAt(center);
    renderer.render(scene, cam);
    out[id] = renderer.domElement.toDataURL();
    scene.remove(mesh);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}

export function createBuilder({ onStackChange, onLaunch, getInsertAnchor, onInserted }) {
  let stackIds = [...DEFAULT_STACK];
  const paletteEl = document.getElementById('palette');
  const launchBtn = document.getElementById('launch-btn');
  const stMass = document.getElementById('st-mass');
  const stThrust = document.getElementById('st-thrust');
  const stFuel = document.getElementById('st-fuel');
  const stTwr = document.getElementById('st-twr');

  const thumbs = renderThumbnails();

  for (const id of PALETTE_ORDER) {
    const part = PARTS[id];
    const card = document.createElement('div');
    card.className = 'part-card';
    card.dataset.part = id;
    card.innerHTML = `
      <img src="${thumbs[id]}" alt="${part.name}" draggable="false"/>
      <div><div class="pc-name">${part.name}</div><div class="pc-stat">${part.blurb}</div></div>`;
    card.addEventListener('click', () => {
      const at = api.addPart(id, getInsertAnchor?.() ?? null);
      onInserted?.(at, id);
    });
    paletteEl.appendChild(card);
  }

  launchBtn.addEventListener('click', () => onLaunch?.());

  function refreshStats() {
    const stack = stackIds.map((id) => PARTS[id]);
    const s = stackStats(stack);
    stMass.textContent = (s.mass / 1000).toFixed(2) + ' t';
    stThrust.textContent = (s.thrust / 1000).toFixed(0) + ' kN';
    stFuel.textContent = (s.fuel / 1000).toFixed(2) + ' t';
    stTwr.textContent = s.twr.toFixed(2);
    stTwr.classList.toggle('bad', s.twr < 1);
    stTwr.classList.toggle('good', s.twr >= 1.15);
    launchBtn.disabled = false;
  }

  const api = {
    get stackIds() { return [...stackIds]; },

    // anchorGap (optional): a seam index 0..len — insert exactly THERE.
    // 0 = very bottom (under everything), len = on top. Set by right-clicking
    // a stacked part (lower half = below it, upper half = above it).
    // null = smart auto-placement. Returns the index the part landed at.
    addPart(id, anchorGap = null) {
      const idx = anchorGap !== null
        ? Math.max(0, Math.min(stackIds.length, anchorGap))
        : insertionIndex(stackIds, id);
      stackIds.splice(idx, 0, id);
      refreshStats();
      onStackChange?.(api.stackIds);
      return idx;
    },

    removeAt(stackIndex) {
      if (stackIndex < 0 || stackIndex >= stackIds.length) return;
      if (stackIds.length <= 1) return; // never empty the yard completely
      stackIds.splice(stackIndex, 1);
      refreshStats();
      onStackChange?.(api.stackIds);
    },

    setStack(ids) {
      stackIds = [...ids];
      refreshStats();
      onStackChange?.(api.stackIds);
    },

    reset() { api.setStack(DEFAULT_STACK); },

    refreshStats,
  };

  refreshStats();
  return api;
}
