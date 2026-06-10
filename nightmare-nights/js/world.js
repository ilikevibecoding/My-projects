// Builds the bedroom, the two hallways, the closet, and all furniture.
// Layout (top view, player faces -z by default):
//
//        hallway L                     hallway R
//   x=-14 ........ x=-4 [ROOM x:-4..4, z:-3..3] x=4 ........ x=14
//                         closet @ z=-3 (front)
//                         bed    @ z=+2.4 (behind player)
//
import * as THREE from 'three';
import {
  wallpaperTexture, floorTexture, rugTexture, hallFloorTexture,
  crayonDrawingTexture, blanketTexture,
} from './textures.js';

export const ROOM = {
  W: 8, D: 6, H: 3,
  DOOR_W: 1.15, DOOR_H: 2.25, DOOR_Z: -1.0,
  HALL_LEN: 10, HALL_W: 1.9, HALL_H: 2.6,
  CLOSET_W: 1.9, CLOSET_H: 2.4, CLOSET_DEPTH: 0.9,
};

function box(w, h, d, mat, x, y, z, parent, shadows = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadows) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m);
  return m;
}

export function buildWorld(scene) {
  const world = {};
  const root = new THREE.Group();
  scene.add(root);
  world.root = root;

  scene.fog = new THREE.FogExp2(0x000000, 0.05);
  scene.background = new THREE.Color(0x000000);

  // ---------- materials ----------
  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.95 });
  const wallPlainMat = new THREE.MeshStandardMaterial({ color: 0x232839, roughness: 0.95 });
  const hallWallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.97 });
  hallWallMat.map.repeat.set(6, 1.6);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 });
  const hallFloorMat = new THREE.MeshStandardMaterial({ map: hallFloorTexture(), roughness: 1.0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 1.0 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9b9482, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a4, roughness: 0.75 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x35415c, roughness: 0.85 });
  const dresserMat = new THREE.MeshStandardMaterial({ color: 0x3c4a68, roughness: 0.8 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 0.4, metalness: 0.4 });
  const closetInnerMat = new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 1.0 });

  const { W, D, H, DOOR_W, DOOR_H, DOOR_Z, HALL_LEN, HALL_W, HALL_H, CLOSET_W, CLOSET_H, CLOSET_DEPTH } = ROOM;

  // ---------- room floor & ceiling ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40),
    new THREE.MeshStandardMaterial({ map: rugTexture(), transparent: true, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 0.2);
  rug.receiveShadow = true;
  root.add(rug);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  root.add(ceil);

  // ---------- walls (with openings) ----------
  const wallT = 0.18;

  // back wall (behind player, z=+3) — solid
  box(W, H, wallT, wallMat, 0, H / 2, D / 2 + wallT / 2, root);

  // front wall (z=-3) — closet opening centered
  {
    const sideW = (W - CLOSET_W) / 2;
    box(sideW, H, wallT, wallMat, -(CLOSET_W / 2 + sideW / 2), H / 2, -D / 2 - wallT / 2, root);
    box(sideW, H, wallT, wallMat, (CLOSET_W / 2 + sideW / 2), H / 2, -D / 2 - wallT / 2, root);
    box(CLOSET_W, H - CLOSET_H, wallT, wallMat, 0, CLOSET_H + (H - CLOSET_H) / 2, -D / 2 - wallT / 2, root);
  }

  // side walls with doorway openings at z = DOOR_Z
  function sideWall(sign) {
    const x = sign * (W / 2 + wallT / 2);
    const zFrontLen = (DOOR_Z - DOOR_W / 2) - (-D / 2);  // front segment length
    const zBackLen = (D / 2) - (DOOR_Z + DOOR_W / 2);    // back segment length
    const front = box(wallT, H, zFrontLen, wallMat, x, H / 2, -D / 2 + zFrontLen / 2, root);
    const back = box(wallT, H, zBackLen, wallMat, x, H / 2, D / 2 - zBackLen / 2, root);
    box(wallT, H - DOOR_H, DOOR_W, wallMat, x, DOOR_H + (H - DOOR_H) / 2, DOOR_Z, root);
    return { front, back };
  }
  sideWall(-1);
  sideWall(1);

  // baseboards
  function baseboard(w, x, z, rotY = 0) {
    const b = box(w, 0.14, 0.04, trimMat, x, 0.07, z, root, false);
    b.rotation.y = rotY;
  }
  baseboard(W - 0.1, 0, D / 2 - 0.02);
  baseboard(W / 2 - CLOSET_W / 2 - 0.05, -(CLOSET_W / 2 + (W / 2 - CLOSET_W / 2) / 2), -D / 2 + 0.02);
  baseboard(W / 2 - CLOSET_W / 2 - 0.05, (CLOSET_W / 2 + (W / 2 - CLOSET_W / 2) / 2), -D / 2 + 0.02);

  // ---------- hallways ----------
  // Hall runs outward from each side doorway, along x. Centered at z=DOOR_Z.
  function hallway(sign) {
    const g = new THREE.Group();
    const cx = sign * (W / 2 + HALL_LEN / 2);
    g.position.set(cx, 0, DOOR_Z);
    root.add(g);

    const hf = new THREE.Mesh(new THREE.PlaneGeometry(HALL_LEN, HALL_W), hallFloorMat);
    hf.rotation.x = -Math.PI / 2;
    hf.receiveShadow = true;
    g.add(hf);

    const hc = new THREE.Mesh(new THREE.PlaneGeometry(HALL_LEN, HALL_W), ceilMat);
    hc.rotation.x = Math.PI / 2;
    hc.position.y = HALL_H;
    g.add(hc);

    // hall side walls
    box(HALL_LEN, HALL_H, 0.15, hallWallMat, 0, HALL_H / 2, -HALL_W / 2 - 0.075, g);
    box(HALL_LEN, HALL_H, 0.15, hallWallMat, 0, HALL_H / 2, HALL_W / 2 + 0.075, g);
    // end cap
    box(0.15, HALL_H, HALL_W + 0.3, wallPlainMat, sign * HALL_LEN / 2, HALL_H / 2, 0, g);
    // a couple of door frames along the hall for depth reading
    for (const dx of [-2.2, 1.6]) {
      const f = new THREE.Group();
      f.position.set(dx, 0, -HALL_W / 2 - 0.02);
      box(0.9, 2.1, 0.06, darkWoodMat, 0, 1.05, 0, f, false);
      box(0.74, 1.95, 0.05, new THREE.MeshStandardMaterial({ color: 0x191722, roughness: 1 }), 0, 0.97, 0.012, f, false);
      g.add(f);
    }
    // faint end-of-hall night light (gives silhouette to approaching shapes)
    const glow = new THREE.PointLight(0x35406b, 7, 9, 1.5);
    glow.position.set(sign * (HALL_LEN / 2 - 0.6), 1.4, 0);
    g.add(glow);
    // visible plug-in nightlight on the end wall — the eye-anchor of the hall
    const nl = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13),
      new THREE.MeshStandardMaterial({ color: 0x222633, emissive: 0x8fa4e8, emissiveIntensity: 2.2 }));
    nl.position.set(sign * (HALL_LEN / 2 - 0.09), 0.5, 0.2);
    nl.rotation.y = sign * -Math.PI / 2;
    g.add(nl);
    return g;
  }
  world.hallL = hallway(-1);
  world.hallR = hallway(1);

  // ---------- bedroom side doors (swing shut when held) ----------
  // Hinge on the front-side jamb; door swings into the doorway.
  function roomDoor(sign) {
    const hinge = new THREE.Group();
    hinge.position.set(sign * (W / 2 + wallT / 2), 0, DOOR_Z - DOOR_W / 2);
    root.add(hinge);

    const panel = new THREE.Group();
    hinge.add(panel);
    const d = box(0.07, DOOR_H - 0.05, DOOR_W - 0.06, doorMat, 0, (DOOR_H - 0.05) / 2, (DOOR_W - 0.06) / 2 + 0.03, panel);
    d.castShadow = true;
    // inset panels
    for (const py of [0.62, 1.55]) {
      box(0.02, 0.62, DOOR_W - 0.4, new THREE.MeshStandardMaterial({ color: 0xa8a394, roughness: 0.8 }),
        sign * -0.045, py, (DOOR_W - 0.06) / 2 + 0.03, panel, false);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), knobMat);
    knob.position.set(sign * -0.09, 1.05, DOOR_W - 0.18);
    panel.add(knob);

    // frame
    const frame = new THREE.Group();
    frame.position.set(sign * (W / 2 + wallT / 2), 0, DOOR_Z);
    box(wallT + 0.1, 0.09, DOOR_W + 0.16, trimMat, 0, DOOR_H + 0.04, 0, frame, false);
    box(wallT + 0.1, DOOR_H + 0.1, 0.09, trimMat, 0, (DOOR_H + 0.1) / 2, -(DOOR_W / 2 + 0.045), frame, false);
    box(wallT + 0.1, DOOR_H + 0.1, 0.09, trimMat, 0, (DOOR_H + 0.1) / 2, (DOOR_W / 2 + 0.045), frame, false);
    root.add(frame);

    // openAngle: door swings INTO the room (like a real bedroom door),
    // resting ~108 deg open against the front wall; closed = blocking doorway
    const openAngle = -sign * 1.88;
    let ratio = 0; // 0 open, 1 closed
    const api = {
      hinge, panel,
      setClose(r) {
        ratio = THREE.MathUtils.clamp(r, 0, 1);
        panel.rotation.y = openAngle * (1 - ratio);
      },
      getClose: () => ratio,
    };
    api.setClose(0);
    return api;
  }
  world.doorL = roomDoor(-1);
  world.doorR = roomDoor(1);

  // ---------- closet ----------
  {
    const g = new THREE.Group();
    g.position.set(0, 0, -D / 2);
    root.add(g);

    // recessed interior
    const innerW = CLOSET_W, innerD = CLOSET_DEPTH;
    box(innerW, CLOSET_H, 0.05, closetInnerMat, 0, CLOSET_H / 2, -innerD, g); // back
    box(0.05, CLOSET_H, innerD, closetInnerMat, -innerW / 2, CLOSET_H / 2, -innerD / 2, g);
    box(0.05, CLOSET_H, innerD, closetInnerMat, innerW / 2, CLOSET_H / 2, -innerD / 2, g);
    box(innerW, 0.05, innerD, closetInnerMat, 0, CLOSET_H, -innerD / 2, g);
    const cFloor = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerD), floorMat);
    cFloor.rotation.x = -Math.PI / 2;
    cFloor.position.set(0, 0.005, -innerD / 2);
    g.add(cFloor);
    // hanger rod + a few hanging clothes silhouettes
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, innerW - 0.2, 8), knobMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, CLOSET_H - 0.35, -innerD * 0.6);
    g.add(rod);
    for (const hx of [-0.62, 0.45]) {
      const clothMat = new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 1 });
      box(0.3, 0.8, 0.06, clothMat, hx, CLOSET_H - 0.8, -innerD * 0.6, g, false);
    }

    // louvered double doors, hinged at outer edges
    function closetDoor(sign) {
      const hinge = new THREE.Group();
      hinge.position.set(sign * innerW / 2, 0, 0.02);
      g.add(hinge);
      const panel = new THREE.Group();
      hinge.add(panel);
      const pw = innerW / 2 - 0.02;
      const frameM = new THREE.MeshStandardMaterial({ color: 0xc4bfb0, roughness: 0.8 });
      // stiles & rails
      box(0.06, CLOSET_H, 0.05, frameM, sign * -pw + sign * 0.03, CLOSET_H / 2, 0, panel);
      box(0.06, CLOSET_H, 0.05, frameM, sign * -0.03, CLOSET_H / 2, 0, panel);
      box(pw, 0.1, 0.05, frameM, sign * -pw / 2, 0.06, 0, panel);
      box(pw, 0.1, 0.05, frameM, sign * -pw / 2, CLOSET_H - 0.05, 0, panel);
      box(pw, 0.12, 0.05, frameM, sign * -pw / 2, CLOSET_H / 2, 0, panel);
      // louvers
      const louverM = new THREE.MeshStandardMaterial({ color: 0xb5b0a1, roughness: 0.85 });
      const louverGeo = new THREE.BoxGeometry(pw - 0.14, 0.035, 0.02);
      for (let sec = 0; sec < 2; sec++) {
        const y0 = sec === 0 ? 0.16 : CLOSET_H / 2 + 0.11;
        const y1 = sec === 0 ? CLOSET_H / 2 - 0.11 : CLOSET_H - 0.15;
        for (let y = y0; y < y1; y += 0.072) {
          const l = new THREE.Mesh(louverGeo, louverM);
          l.position.set(sign * -pw / 2, y, 0);
          l.rotation.x = -0.5;
          panel.add(l);
        }
      }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), knobMat);
      knob.position.set(sign * -pw + sign * 0.07, CLOSET_H / 2 - 0.25, 0.05);
      panel.add(knob);
      return { hinge, panel, sign };
    }
    const dl = closetDoor(-1);
    const dr = closetDoor(1);

    // ajar: doors rotate outward around outer hinges; 0 = shut, 1 = wide open
    let ajar = 0;
    world.closet = {
      group: g,
      setAjar(r) {
        ajar = THREE.MathUtils.clamp(r, 0, 1);
        dl.panel.rotation.y = -ajar * Math.PI * 0.42;
        dr.panel.rotation.y = ajar * Math.PI * 0.42;
      },
      getAjar: () => ajar,
      // anchor for whatever is inside
      anchor: new THREE.Vector3(0, 0, -D / 2 - innerD * 0.55),
    };
    world.closet.setAjar(0.06);

    // frame trim
    box(CLOSET_W + 0.2, 0.1, 0.08, trimMat, 0, CLOSET_H + 0.05, 0.04, g, false);
    box(0.1, CLOSET_H + 0.1, 0.08, trimMat, -(CLOSET_W / 2 + 0.05), (CLOSET_H + 0.1) / 2, 0.04, g, false);
    box(0.1, CLOSET_H + 0.1, 0.08, trimMat, (CLOSET_W / 2 + 0.05), (CLOSET_H + 0.1) / 2, 0.04, g, false);
  }

  // ---------- bed (behind the player) ----------
  {
    const g = new THREE.Group();
    g.position.set(0.6, 0, 1.95);
    root.add(g);
    const frameMat = darkWoodMat;
    // headboard against back wall
    box(2.0, 1.15, 0.09, frameMat, 0, 0.62, 0.93, g);
    box(2.0, 0.32, 0.95, frameMat, 0, 0.26, 0.42, g);  // base
    const mattress = box(1.9, 0.26, 1.85, new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 0.95 }), 0, 0.5, 0, g);
    mattress.castShadow = true;
    const blanket = box(1.92, 0.1, 1.3, new THREE.MeshStandardMaterial({ map: blanketTexture(), roughness: 1 }), 0, 0.66, -0.24, g);
    blanket.castShadow = true;
    for (const px of [-0.5, 0.45]) {
      const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 6, 10),
        new THREE.MeshStandardMaterial({ color: 0xb7b2a3, roughness: 0.95 }));
      pillow.rotation.z = Math.PI / 2;
      pillow.position.set(px, 0.72, 0.62);
      pillow.castShadow = true;
      g.add(pillow);
    }
    // legs
    for (const [lx, lz] of [[-0.92, -0.85], [0.92, -0.85], [-0.92, 0.85], [0.92, 0.85]]) {
      box(0.09, 0.24, 0.09, frameMat, lx, 0.12, lz, g, false);
    }
    world.bed = { group: g, topY: 0.78 };
  }

  // ---------- dressers (flanking closet, like a kid's room) ----------
  function dresser(x, w, h, drawers) {
    const g = new THREE.Group();
    g.position.set(x, 0, -D / 2 + 0.34);
    root.add(g);
    box(w, h, 0.55, dresserMat, 0, h / 2 + 0.04, 0, g);
    const dh = (h - 0.16) / drawers;
    for (let i = 0; i < drawers; i++) {
      box(w - 0.14, dh - 0.07, 0.04, new THREE.MeshStandardMaterial({ color: 0x46557a, roughness: 0.8 }),
        0, 0.12 + dh / 2 + i * dh, 0.29, g, false);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), knobMat);
      k.position.set(0, 0.12 + dh / 2 + i * dh, 0.33);
      g.add(k);
    }
    box(w + 0.06, 0.05, 0.6, dresserMat, 0, h + 0.06, 0, g, false);
    return g;
  }
  const dresserL = dresser(-2.6, 1.5, 1.7, 5);
  const dresserR = dresser(2.7, 1.2, 1.15, 3);

  // ---------- toys & props (original, kid-room-gone-dark) ----------
  {
    // toy robot on the left dresser
    const t = new THREE.Group();
    t.position.set(-2.85, 1.8, -2.65);
    const roboMat = new THREE.MeshStandardMaterial({ color: 0x7a4f8f, roughness: 0.6, metalness: 0.3 });
    box(0.16, 0.2, 0.12, roboMat, 0, 0.1, 0, t, false);
    box(0.12, 0.1, 0.1, roboMat, 0, 0.26, 0, t, false);
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff9a3c, emissiveIntensity: 0.5 });
    box(0.025, 0.02, 0.01, eyeM, -0.03, 0.27, 0.055, t, false);
    box(0.025, 0.02, 0.01, eyeM, 0.03, 0.27, 0.055, t, false);
    box(0.04, 0.16, 0.04, roboMat, -0.1, 0.1, 0, t, false);
    box(0.04, 0.16, 0.04, roboMat, 0.1, 0.1, 0, t, false);
    root.add(t);
    t.rotation.y = 0.5;

    // toy blocks near the rug
    const blockCols = [0x8f4444, 0x44708f, 0x8f8044, 0x4f8f44];
    for (let i = 0; i < 7; i++) {
      const bm = new THREE.MeshStandardMaterial({ color: blockCols[i % 4], roughness: 0.85 });
      const b = box(0.14, 0.14, 0.14, bm, -1.4 + Math.random() * 1.4, 0.07, 0.7 + Math.random() * 1.2, root);
      b.rotation.y = Math.random() * Math.PI;
    }

    // pull-toy: little wooden dog on wheels (original prop)
    const dog = new THREE.Group();
    dog.position.set(1.5, 0, 1.15);
    dog.rotation.y = -0.7;
    const dogMat = new THREE.MeshStandardMaterial({ color: 0x6e5337, roughness: 0.9 });
    box(0.3, 0.16, 0.13, dogMat, 0, 0.2, 0, dog, false);
    box(0.13, 0.12, 0.11, dogMat, 0.19, 0.32, 0, dog, false);
    box(0.05, 0.07, 0.02, dogMat, 0.25, 0.41, 0, dog, false);
    for (const [wx, wz] of [[-0.1, 0.08], [0.1, 0.08], [-0.1, -0.08], [0.1, -0.08]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10),
        new THREE.MeshStandardMaterial({ color: 0x8f3434, roughness: 0.8 }));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.05, wz);
      dog.add(wheel);
    }
    root.add(dog);

    // crayon drawings taped to walls
    const draws = [
      { v: 0, x: -3.99 + 0.19, y: 1.75, z: 1.4, ry: Math.PI / 2 },
      { v: 1, x: 3.99 - 0.19, y: 1.8, z: 0.6, ry: -Math.PI / 2 },
      { v: 2, x: 1.65, y: 1.85, z: -2.99 + 0.1, ry: 0 },
    ];
    for (const d of draws) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52),
        new THREE.MeshStandardMaterial({ map: crayonDrawingTexture(d.v), roughness: 1 }));
      p.position.set(d.x, d.y, d.z);
      p.rotation.y = d.ry;
      p.rotation.z = (Math.random() - 0.5) * 0.08;
      root.add(p);
    }

    // ceiling fan
    const fan = new THREE.Group();
    fan.position.set(0, H - 0.12, -0.3);
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.7 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 12), fanMat);
    fan.add(hub);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), fanMat);
    stem.position.y = 0.14;
    fan.add(stem);
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.13), fanMat);
      blade.position.x = 0.38;
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      arm.add(blade);
      blades.add(arm);
    }
    blades.position.y = -0.05;
    fan.add(blades);
    root.add(fan);
    world.fanBlades = blades;

    // smoke detector with a tiny LED (like the screenshot's ceiling dot)
    const det = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 12),
      new THREE.MeshStandardMaterial({ color: 0xb8b3a4, roughness: 0.7 }));
    det.position.set(0.8, H - 0.02, 0.9);
    root.add(det);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x00ff44, emissiveIntensity: 1.4 }));
    led.position.set(0.83, H - 0.04, 0.9);
    root.add(led);
    world.detectorLed = led;
  }

  // ---------- ambient lighting ----------
  const amb = new THREE.AmbientLight(0x232b45, 4.2);
  scene.add(amb);
  const moon = new THREE.PointLight(0x3d4c70, 9, 11, 1.5);
  moon.position.set(0, H - 0.4, 0.4);
  scene.add(moon);
  world.ambient = amb;
  world.moon = moon;

  return world;
}
