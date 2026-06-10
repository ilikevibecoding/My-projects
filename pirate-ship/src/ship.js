// ---------------------------------------------------------------------------
// ship.js — procedural low-poly pirate galleon.
// Local frame matches physics.js: +x starboard, +y up, +z forward (bow).
// Origin = centre of mass (waterline-ish). Keel ~ -1.85, main deck ~ +2.2.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Hull stations: z along the ship, w = half beam, keel/deck heights.
const STATIONS = [
  { z: -13.8, w: 2.3, keel: -0.2, deck: 3.6 }, // transom
  { z: -11.0, w: 3.2, keel: -1.35, deck: 3.0 },
  { z: -7.0, w: 3.7, keel: -1.7, deck: 2.45 },
  { z: -2.0, w: 4.0, keel: -1.85, deck: 2.2 },
  { z: 3.0, w: 3.85, keel: -1.8, deck: 2.2 },
  { z: 7.5, w: 3.3, keel: -1.65, deck: 2.45 },
  { z: 11.0, w: 2.3, keel: -1.3, deck: 2.9 },
  { z: 13.6, w: 0.45, keel: -0.55, deck: 3.5 }, // bow tip (rising sheer)
];

// Cross-section profile from keel (s=0) to bulwark top (s=1): x and y fractions.
const SECTION = [
  [0.0, 0.0],
  [0.5, 0.1],
  [0.88, 0.42],
  [1.0, 0.78],
  [0.97, 1.0],
  [0.92, 1.18], // bulwark lip above deck line
];

function buildHullGeometry() {
  const verts = [];
  const idx = [];
  const ringSize = SECTION.length * 2 - 1; // mirrored, sharing the keel point

  for (const st of STATIONS) {
    const ring = [];
    // port side, from bulwark down to keel
    for (let i = SECTION.length - 1; i >= 0; i--) {
      const [fx, fy] = SECTION[i];
      ring.push([-st.w * fx, st.keel + (st.deck - st.keel) * fy, st.z]);
    }
    // starboard side, keel up to bulwark (skip duplicated keel point)
    for (let i = 1; i < SECTION.length; i++) {
      const [fx, fy] = SECTION[i];
      ring.push([st.w * fx, st.keel + (st.deck - st.keel) * fy, st.z]);
    }
    for (const p of ring) verts.push(...p);
  }
  for (let s = 0; s < STATIONS.length - 1; s++) {
    for (let i = 0; i < ringSize - 1; i++) {
      const a = s * ringSize + i;
      const b = a + 1;
      const c = a + ringSize;
      const d = b + ringSize;
      idx.push(a, c, b, b, c, d);
    }
  }
  // transom (stern cap)
  const sternCenter = verts.length / 3;
  const st0 = STATIONS[0];
  verts.push(0, (st0.keel + st0.deck) / 2, st0.z);
  for (let i = 0; i < ringSize - 1; i++) {
    idx.push(i, i + 1, sternCenter);
  }
  // bow cap (otherwise the bow ring is a gaping hole)
  const bowCenter = verts.length / 3;
  const stN = STATIONS[STATIONS.length - 1];
  const bowBase = (STATIONS.length - 1) * ringSize;
  verts.push(0, (stN.keel + stN.deck) / 2, stN.z);
  for (let i = 0; i < ringSize - 1; i++) {
    idx.push(bowBase + i + 1, bowBase + i, bowCenter);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const non = geo.toNonIndexed();
  non.computeVertexNormals();
  return non;
}

function stationAt(z) {
  // interpolate hull half-width / deck height along the ship
  let a = STATIONS[0];
  let b = STATIONS[STATIONS.length - 1];
  for (let i = 0; i < STATIONS.length - 1; i++) {
    if (z >= STATIONS[i].z && z <= STATIONS[i + 1].z) {
      a = STATIONS[i];
      b = STATIONS[i + 1];
      break;
    }
  }
  const t = (z - a.z) / (b.z - a.z || 1);
  return {
    w: a.w + (b.w - a.w) * t,
    deck: a.deck + (b.deck - a.deck) * t,
    keel: a.keel + (b.keel - a.keel) * t,
  };
}

function buildDeckGeometry() {
  // deck surface with slight camber, overlapping the hull sides (no slot)
  const verts = [];
  const idx = [];
  STATIONS.forEach((st) => {
    const w = st.w * 0.99;
    verts.push(-w, st.deck, st.z, 0, st.deck + 0.18, st.z, w, st.deck, st.z);
  });
  for (let s = 0; s < STATIONS.length - 1; s++) {
    const a = s * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const non = geo.toNonIndexed();
  non.computeVertexNormals();
  return non;
}

function cylinderBetween(r1, r2, from, to, radial = 6) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r2, len, radial);
  geo.translate(0, len / 2, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  geo.applyQuaternion(quat);
  geo.translate(from.x, from.y, from.z);
  return geo;
}

function makeSquareSail(width, height, billow) {
  // hangs from its top edge (origin); billows toward the bow (+z)
  const geo = new THREE.PlaneGeometry(width, height, 8, 6);
  geo.translate(0, -height / 2, 0);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width + 0.5;
    const v = -p.getY(i) / height; // 0 top .. 1 bottom
    p.setZ(i, Math.sin(Math.PI * u) * (0.25 + 0.75 * v) * billow);
    // bottom corners pulled slightly inward (sheeted)
    p.setX(i, p.getX(i) * (1 - v * 0.12));
  }
  geo.computeVertexNormals();
  return geo;
}

function makeJibSail(billow) {
  // triangular staysail between bowsprit and foremast, subdivided fan
  const A = new THREE.Vector3(0, 0.4, 6.4); // tack near bowsprit tip (local to group)
  const B = new THREE.Vector3(0, 8.2, -3.2); // head up the foremast stay
  const C = new THREE.Vector3(0, 0.6, -3.4); // clew at deck
  const segs = 6;
  const verts = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const top = new THREE.Vector3().lerpVectors(A, B, t);
    const bot = new THREE.Vector3().lerpVectors(A, C, t);
    for (let j = 0; j <= 2; j++) {
      const v = j / 2;
      const pt = new THREE.Vector3().lerpVectors(top, bot, v);
      pt.x += Math.sin(Math.PI * t) * Math.sin(Math.PI * v) * billow;
      verts.push(pt.x, pt.y, pt.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const non = geo.toNonIndexed();
  non.computeVertexNormals();
  return non;
}

function makeFlagTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = '#14100e';
  g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#f2ead8';
  // skull
  g.beginPath();
  g.arc(64, 32, 14, 0, Math.PI * 2);
  g.fill();
  g.fillRect(57, 40, 14, 8);
  // eyes + nose
  g.fillStyle = '#14100e';
  g.beginPath();
  g.arc(58, 30, 3.4, 0, Math.PI * 2);
  g.arc(70, 30, 3.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(64, 35);
  g.lineTo(61, 40);
  g.lineTo(67, 40);
  g.fill();
  // crossbones
  g.strokeStyle = '#f2ead8';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(38, 56);
  g.lineTo(90, 68);
  g.moveTo(90, 56);
  g.lineTo(38, 68);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PirateShip {
  constructor(scene) {
    this.group = new THREE.Group();

    // DoubleSide: the hull is a shell — without it, the inner faces are
    // culled and the ship looks like it has holes when seen over the rail.
    const matHull = new THREE.MeshStandardMaterial({
      color: 0x53381f,
      roughness: 0.85,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const matWood = new THREE.MeshStandardMaterial({
      color: 0x96704a,
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide, // deck is a sheet; masts/spars unaffected
    });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x3a2a19, roughness: 0.9, flatShading: true });
    const matGold = new THREE.MeshStandardMaterial({ color: 0xd8a93f, roughness: 0.45, metalness: 0.55 });
    this.matSail = new THREE.MeshStandardMaterial({
      color: 0xf0e6cf,
      roughness: 0.9,
      side: THREE.DoubleSide,
      flatShading: true,
      // faint warm glow fakes sunlight bleeding through the canvas
      emissive: 0x9b8a66,
      emissiveIntensity: 0.34,
    });

    // --- hull + deck
    const hull = new THREE.Mesh(buildHullGeometry(), matHull);
    const deck = new THREE.Mesh(buildDeckGeometry(), matWood);

    // --- superstructure, keel, gold trim
    const woodParts = [];
    const darkParts = [];
    const goldParts = [];

    woodParts.push(new THREE.BoxGeometry(4.6, 1.7, 5.4).translate(0, 3.3, -10.6)); // quarterdeck cabin
    woodParts.push(new THREE.BoxGeometry(3.2, 1.1, 3.6).translate(0, 3.0, 10.4)); // forecastle
    darkParts.push(new THREE.BoxGeometry(0.5, 0.9, 15).translate(0, -2.0, -0.5)); // keel fin
    darkParts.push(new THREE.BoxGeometry(0.4, 1.4, 0.9).translate(0, -1.6, -13.6)); // rudder
    goldParts.push(new THREE.BoxGeometry(4.4, 0.28, 0.18).translate(0, 3.45, -13.95)); // stern trim
    goldParts.push(new THREE.BoxGeometry(3.6, 0.2, 0.16).translate(0, 2.6, -14.0));

    // cannons poking through the bulwarks, hugging the hull at each station
    for (const side of [-1, 1]) {
      for (const z of [-6.5, -2.5, 1.5, 5.5]) {
        const st = stationAt(z);
        const g = new THREE.CylinderGeometry(0.13, 0.16, 1.6, 6)
          .rotateZ(Math.PI / 2)
          .translate(side * (st.w - 0.2), st.deck - 0.55, z);
        darkParts.push(g);
      }
    }

    // --- masts & spars
    const mastDefs = [
      { z: -1.0, base: 2.2, top: 18.2, r: 0.3 }, // main
      { z: 7.5, base: 2.4, top: 15.0, r: 0.24 }, // fore
      { z: -9.5, base: 3.8, top: 13.2, r: 0.2 }, // mizzen
    ];
    for (const m of mastDefs) {
      woodParts.push(
        cylinderBetween(m.r * 0.55, m.r, new THREE.Vector3(0, m.base, m.z), new THREE.Vector3(0, m.top, m.z), 7)
      );
      // crow's nest on the main mast
      if (m.z === -1.0) {
        woodParts.push(new THREE.CylinderGeometry(0.55, 0.42, 0.55, 8, 1, true).translate(0, 14.4, m.z));
      }
    }
    // bowsprit
    woodParts.push(
      cylinderBetween(0.09, 0.2, new THREE.Vector3(0, 3.4, 13.2), new THREE.Vector3(0, 6.6, 20.2), 6)
    );

    // yards (spars carrying the square sails)
    const yards = [
      { z: -1.0, y: 13.4, w: 8.2 },
      { z: -1.0, y: 9.2, w: 10.4 },
      { z: 7.5, y: 11.4, w: 6.6 },
      { z: 7.5, y: 8.0, w: 8.4 },
    ];
    for (const yd of yards) {
      woodParts.push(
        new THREE.CylinderGeometry(0.09, 0.09, yd.w, 6).rotateZ(Math.PI / 2).translate(0, yd.y, yd.z)
      );
    }

    const woodMesh = new THREE.Mesh(mergeGeometries(woodParts), matWood);
    const darkMesh = new THREE.Mesh(mergeGeometries(darkParts), matDark);
    const goldMesh = new THREE.Mesh(mergeGeometries(goldParts), matGold);

    // --- sails (separate meshes so they can furl with the sail setting)
    this.sails = [];
    const sailDefs = [
      { yard: yards[0], drop: 3.6, billow: 0.75 },
      { yard: yards[1], drop: 4.4, billow: 1.05 },
      { yard: yards[2], drop: 2.9, billow: 0.65 },
      { yard: yards[3], drop: 3.6, billow: 0.9 },
    ];
    for (const sd of sailDefs) {
      const sail = new THREE.Mesh(makeSquareSail(sd.yard.w * 0.92, sd.drop, sd.billow), this.matSail);
      sail.position.set(0, sd.yard.y - 0.12, sd.yard.z);
      sail.castShadow = true;
      this.sails.push(sail);
      this.group.add(sail);
    }
    const jibGroup = new THREE.Group();
    jibGroup.position.set(0, 5.4, 13.4);
    const jib = new THREE.Mesh(makeJibSail(0.9), this.matSail);
    jib.castShadow = true;
    jibGroup.add(jib);
    this.jib = jib;
    this.group.add(jibGroup);

    // --- flag
    this.flagGeo = new THREE.PlaneGeometry(2.6, 1.5, 10, 4);
    this.flagGeo.translate(1.3, 0, 0); // streams from the pole
    this.flagBase = this.flagGeo.getAttribute('position').array.slice();
    const flag = new THREE.Mesh(
      this.flagGeo,
      new THREE.MeshStandardMaterial({ map: makeFlagTexture(), side: THREE.DoubleSide, roughness: 1 })
    );
    flag.position.set(0, 18.6, -1.0);
    this.flag = flag;
    this.group.add(flag);

    // --- stern lantern
    const lantern = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32),
      new THREE.MeshStandardMaterial({
        color: 0xffd27a,
        emissive: 0xffb84d,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      })
    );
    lantern.position.set(0, 4.6, -14.3);
    this.group.add(lantern);

    // --- rigging
    const rig = [];
    const addLine = (a, b) => rig.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const m of mastDefs) {
      const hTop = m.top - 0.4;
      for (const side of [-1, 1]) {
        for (const dz of [-1.6, 0, 1.6]) {
          addLine(v(0, hTop * 0.82, m.z), v(side * 3.1, 2.6, m.z + dz));
        }
      }
    }
    addLine(v(0, 18.0, -1), v(0, 6.5, 20.0)); // forestay to bowsprit
    addLine(v(0, 14.8, 7.5), v(0, 6.5, 20.0));
    addLine(v(0, 18.0, -1), v(0, 14.8, 7.5)); // main->fore stay
    addLine(v(0, 13.0, -9.5), v(0, 18.0, -1)); // mizzen->main
    addLine(v(0, 13.0, -9.5), v(0, 3.7, -13.8)); // backstay
    const rigGeo = new THREE.BufferGeometry();
    rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(rig, 3));
    const rigging = new THREE.LineSegments(
      rigGeo,
      new THREE.LineBasicMaterial({ color: 0x1c130c, transparent: true, opacity: 0.85 })
    );

    for (const mesh of [hull, deck, woodMesh, darkMesh, goldMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.add(rigging);

    this._sailAmount = 0;
    scene.add(this.group);
  }

  /** Sync visuals with the physics body + animate sails/flag. */
  update(body, t, dt) {
    this.group.position.set(body.pos.x, body.pos.y, body.pos.z);
    this.group.quaternion.set(body.quat.x, body.quat.y, body.quat.z, body.quat.w);

    // sails furl/unfurl toward the current setting
    const target = body.anchored ? 0 : body.sail.frac;
    this._sailAmount += (target - this._sailAmount) * Math.min(1, dt * 1.8);
    const a = this._sailAmount;
    const sy = 0.08 + 0.92 * a;
    for (const s of this.sails) {
      s.scale.set(1, sy, 0.25 + 0.75 * a);
      s.visible = a > 0.02;
    }
    this.jib.scale.setScalar(Math.max(0.001, a));
    this.jib.visible = a > 0.02;

    // flag streams in the wind (world-space wind direction -> local)
    const windWorld = Math.atan2(1, 1); // wind blows toward +x+z
    const heading = body.heading;
    this.flag.rotation.y = windWorld - heading + Math.PI / 2;
    const p = this.flagGeo.getAttribute('position');
    const base = this.flagBase;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      p.setZ(i, Math.sin(bx * 2.4 - t * 8.0) * 0.16 * (bx / 2.6) + base[i * 3 + 2]);
    }
    p.needsUpdate = true;
  }
}
