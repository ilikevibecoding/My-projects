// =============================================================
// Player: pointer-lock FPS controller, camera rig, viewmodel
// =============================================================
'use strict';

const Player = (() => {
  let scene, camera;
  let soldier = null;
  let vehicle = null;
  let yaw = 0, pitch = 0;
  let velY = 0, grounded = true;
  const keys = new Set();
  const pressedThisFrame = new Set();
  let mouseDown = false;
  let rmbDown = false;
  let pointerLocked = false;
  let thirdPerson = false;
  let mouseDX = 0, mouseDY = 0;
  let viewModel = null;
  let bobPhase = 0;
  let recoil = 0;
  let swayX = 0, swayY = 0;
  const BASE_FOV = 75;
  let fovCurrent = BASE_FOV;

  // autopilot (headless test mode)
  let autopilot = false;
  let apTimer = 0, apFireTimer = 0;

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function init(sc, cam) {
    scene = sc; camera = cam;
    document.addEventListener('keydown', e => {
      if (e.repeat) return;
      keys.add(e.code);
      pressedThisFrame.add(e.code);
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', e => keys.delete(e.code));
    document.addEventListener('mousedown', e => {
      if (Game.state !== 'playing') return;
      if (e.button === 0) mouseDown = true;
      if (e.button === 2) rmbDown = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) mouseDown = false;
      if (e.button === 2) rmbDown = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
      if (!pointerLocked) return;
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement != null;
      if (!pointerLocked && Game.state === 'playing' && !autopilot) {
        Game.pause();
      }
    });
  }

  function requestLock() {
    if (autopilot) return;
    const el = document.body;
    if (el.requestPointerLock) el.requestPointerLock();
  }

  function setAutopilot(v) { autopilot = v; }

  function deploy(cls, post) {
    if (soldier) { soldier.despawn(); soldier = null; }
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * post.radius * 0.4;
    const x = post.x + Math.cos(a) * r, z = post.z + Math.sin(a) * r;
    soldier = Soldiers.create(Game.playerTeam, cls, x, z, true);
    yaw = Math.atan2(-x, -z);     // face map centre
    pitch = 0;
    velY = 0;
    soldier.yaw = yaw;
    soldier.model.visible = thirdPerson;
    // viewmodel
    if (viewModel) camera.remove(viewModel);
    viewModel = Assets.buildViewModel(cls);
    viewModel.position.set(0.34, -0.32, -0.55);
    viewModel.rotation.y = 0.02;
    camera.add(viewModel);
    SynthAudio.sfx('spawn');
    return soldier;
  }

  function pressed(code) { return pressedThisFrame.has(code); }

  function update(dt) {
    if (autopilot) runAutopilot(dt);

    if (vehicle) {
      updateVehicleControl(dt);
      endFrame();
      return;
    }
    if (!soldier) { endFrame(); return; }

    if (!soldier.alive) {
      // death cam: stay above body
      _camPos.copy(soldier.position);
      _camPos.y += 2.6;
      camera.position.lerp(_camPos, Math.min(1, dt * 3));
      camera.lookAt(soldier.position.x, soldier.position.y + 0.5, soldier.position.z);
      if (viewModel) viewModel.visible = false;
      endFrame();
      return;
    }

    // ---- look -------------------------------------------------
    const sens = 0.0023;
    yaw -= mouseDX * sens;
    pitch -= mouseDY * sens;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    swayX += (mouseDX * 0.0006 - swayX) * Math.min(1, dt * 8);
    swayY += (mouseDY * 0.0006 - swayY) * Math.min(1, dt * 8);

    // ---- move -------------------------------------------------
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw)).negate();      // camera forward (-z at yaw 0)
    _right.set(-_fwd.z, 0, _fwd.x);
    _move.set(0, 0, 0);
    if (keys.has('KeyW')) _move.add(_fwd);
    if (keys.has('KeyS')) _move.sub(_fwd);
    if (keys.has('KeyD')) _move.add(_right);
    if (keys.has('KeyA')) _move.sub(_right);
    const moving = _move.lengthSq() > 0;
    const sprinting = moving && keys.has('ShiftLeft') && !rmbDown;
    if (moving) {
      _move.normalize();
      const sp = soldier.speed * (sprinting ? CONFIG.player.sprintMult : 1) * (rmbDown ? 0.55 : 1);
      const res = World.resolveCollision(
        soldier.position.x + _move.x * sp * dt,
        soldier.position.z + _move.z * sp * dt,
        CONFIG.player.radius, soldier.position.y + 1);
      soldier.position.x = res.x;
      soldier.position.z = res.z;
      soldier.moving = true;
      soldier.walkPhase += sp * dt * 1.65;
      bobPhase += sp * dt * 1.4;
    }
    // gravity / jump
    const gy = World.getGroundHeight(soldier.position.x, soldier.position.z);
    if (grounded && pressed('Space')) { velY = CONFIG.player.jumpSpeed; grounded = false; }
    velY -= CONFIG.player.gravity * dt;
    soldier.position.y += velY * dt;
    if (soldier.position.y <= gy) {
      soldier.position.y = gy;
      velY = 0;
      grounded = true;
    } else if (soldier.position.y > gy + 0.05) {
      grounded = false;
    }
    soldier.yaw = yaw + Math.PI;     // model faces forward (+z yaw convention)
    soldier.pitch = pitch;

    // ---- actions ------------------------------------------------
    const W = CONFIG.weapons[soldier.weaponKey];
    if ((mouseDown && (W.auto || !fireLatch)) || (autopilot && apFire())) tryFire(W);
    if (!mouseDown) fireLatch = false;
    if (pressed('KeyR')) soldier.startReload();
    if (pressed('KeyG') && soldier.grenades > 0) {
      soldier.grenades--;
      getAimRay(_origin, _dir);
      _dir.y += 0.18;
      _dir.normalize();
      Weapons.throwGrenade(soldier, _origin, _dir);
      HUD.refreshAmmo();
    }
    if (pressed('KeyF')) { if (soldier.repairPulse()) HUD.refreshAmmo(); }
    if (pressed('KeyV')) {
      thirdPerson = !thirdPerson;
      soldier.model.visible = thirdPerson;
      if (viewModel) viewModel.visible = !thirdPerson;
    }
    if (pressed('KeyE')) {
      const v = Vehicles.nearestEnterable(soldier.position, 4.2, Game.playerTeam);
      if (v) enterVehicle(v);
    }

    // ---- camera ---------------------------------------------------
    const eyeY = soldier.position.y + CONFIG.player.eyeHeight;
    recoil = Math.max(0, recoil - dt * 6);
    const shk = Effects.getShake();
    const shakeX = (Math.random() - 0.5) * shk * 0.5;
    const shakeY = (Math.random() - 0.5) * shk * 0.5;

    if (!thirdPerson) {
      const bobY = Math.sin(bobPhase * 2) * 0.035 * (moving ? 1 : 0);
      const bobX = Math.cos(bobPhase) * 0.022 * (moving ? 1 : 0);
      camera.position.set(
        soldier.position.x + _right.x * bobX + shakeX,
        eyeY + bobY + shakeY,
        soldier.position.z + _right.z * bobX);
    } else {
      _fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      _camPos.set(
        soldier.position.x - _fwd.x * 4.2 + _right.x * 0.7,
        eyeY - _fwd.y * 4.2 + 0.4,
        soldier.position.z - _fwd.z * 4.2 + _right.z * 0.7);
      const cgy = World.getGroundHeight(_camPos.x, _camPos.z) + 0.4;
      if (_camPos.y < cgy) _camPos.y = cgy;
      camera.position.copy(_camPos);
      camera.position.x += shakeX;
      camera.position.y += shakeY;
    }
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw);
    camera.rotateX(pitch + recoil);

    // ---- fov / zoom -----------------------------------------------
    const zoomed = rmbDown && W.zoom && !thirdPerson;
    const targetFov = zoomed ? BASE_FOV / W.zoom : (sprinting ? BASE_FOV + 7 : BASE_FOV);
    fovCurrent += (targetFov - fovCurrent) * Math.min(1, dt * 10);
    if (Math.abs(camera.fov - fovCurrent) > 0.05) {
      camera.fov = fovCurrent;
      camera.updateProjectionMatrix();
    }
    HUD.setZoomOverlay(zoomed);

    // ---- viewmodel sway --------------------------------------------
    if (viewModel && viewModel.visible) {
      const bobY = Math.sin(bobPhase * 2) * 0.012 * (moving ? 1 : 0);
      viewModel.position.set(
        0.34 - swayX * 0.6,
        -0.32 + bobY + swayY * 0.4 - recoil * 0.4,
        -0.55 + recoil * 0.9);
      viewModel.rotation.set(recoil * 2.2 - swayY * 1.4, 0.02 - swayX * 1.6, 0);
      viewModel.visible = !zoomed;
    }

    endFrame();
  }

  let fireLatch = false;
  function tryFire(W) {
    if (soldier.fireCooldown > 0 || soldier.reloadTimer > 0) return;
    if (soldier.ammo <= 0) { soldier.startReload(); HUD.refreshAmmo(); return; }
    fireLatch = true;
    getAimRay(_origin, _dir);
    Weapons.fire(soldier, _origin, _dir, soldier.weaponKey, CONFIG.factions[soldier.team].boltColor);
    soldier.ammo--;
    soldier.fireCooldown = 1 / W.rof;
    recoil = Math.min(0.09, recoil + 0.024);
    Effects.addShake(0.02);
    if (soldier.ammo <= 0) soldier.startReload();
    HUD.refreshAmmo();
  }

  function getAimRay(origin, dir) {
    camera.getWorldDirection(dir);
    origin.copy(camera.position).addScaledVector(dir, 0.6);
    origin.y -= 0.06;
  }

  // ---- vehicles ------------------------------------------------
  function enterVehicle(v) {
    vehicle = v;
    v.onEnter(soldier);
    soldier.model.visible = false;
    if (viewModel) viewModel.visible = false;
    SynthAudio.sfx('enterVehicle');
    HUD.setVehicleHud(v);
  }

  function exitVehicle() {
    if (!vehicle) return;
    const pos = vehicle.onExit();
    soldier.position.copy(pos);
    soldier.position.y = World.getGroundHeight(pos.x, pos.z);
    soldier.model.visible = thirdPerson;
    if (viewModel) viewModel.visible = !thirdPerson;
    vehicle = null;
    HUD.setVehicleHud(null);
  }

  function updateVehicleControl(dt) {
    if (!vehicle.alive) {
      // vehicle destroyed: eject (if we survived)
      const pos = vehicle.position;
      if (soldier.alive) {
        soldier.position.set(pos.x + 2, World.getGroundHeight(pos.x + 2, pos.z), pos.z);
        soldier.model.visible = thirdPerson;
        if (viewModel) viewModel.visible = !thirdPerson;
      }
      vehicle = null;
      HUD.setVehicleHud(null);
      return;
    }
    const input = {
      forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      turn: (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0),
      boost: keys.has('ShiftLeft'),
      up: keys.has('Space'),
      down: keys.has('ControlLeft') || keys.has('KeyC'),
      fire: mouseDown,
      mouseDX, mouseDY,
    };
    vehicle.drive(input, dt, camera);
    soldier.position.copy(vehicle.position);   // keep soldier with vehicle (capture logic)
    if (pressed('KeyE') && vehicle.canExit()) exitVehicle();
  }

  // ---- autopilot for headless testing ------------------------------
  function apFire() { return false; }
  function runAutopilot(dt) {
    if (!soldier || !soldier.alive || vehicle) return;
    apTimer -= dt;
    apFireTimer -= dt;
    // walk toward nearest non-owned post
    let target = null, bd = 1e9;
    for (const p of CONFIG.posts) {
      const st = Capture.getState(p.id);
      if (st.owner === Game.playerTeam && st.progress >= 1) continue;
      const d = Math.hypot(p.x - soldier.position.x, p.z - soldier.position.z);
      if (d < bd) { bd = d; target = p; }
    }
    if (target) {
      const dx = target.x - soldier.position.x, dz = target.z - soldier.position.z;
      const wantYaw = Math.atan2(-dx, -dz) + Math.PI;
      yaw = Soldiers.lerpAngle(yaw, wantYaw, Math.min(1, dt * 3));
      keys.add('KeyW');
    }
    if (apFireTimer <= 0) {
      apFireTimer = 1.4;
      const W = CONFIG.weapons[soldier.weaponKey];
      tryFire(W);
    }
    if (apTimer <= 0) {
      apTimer = 3;
      if (Math.random() < 0.3) pressedThisFrame.add('Space');
    }
  }

  function endFrame() {
    mouseDX = 0; mouseDY = 0;
    pressedThisFrame.clear();
  }

  function reset() {
    if (soldier) { soldier.despawn(); soldier = null; }
    if (viewModel) { camera.remove(viewModel); viewModel = null; }
    vehicle = null;
    mouseDown = false;
  }

  return {
    init, deploy, update, requestLock, reset, setAutopilot, exitVehicle,
    get soldier() { return soldier; },
    get vehicle() { return vehicle; },
    get yaw() { return yaw; },
    get isPointerLocked() { return pointerLocked; },
    get thirdPerson() { return thirdPerson; },
  };
})();
