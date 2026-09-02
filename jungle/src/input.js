// Input: desktop pointer-lock mouse/keyboard, mobile dual virtual sticks and
// (optional) gamepad. Every source is merged in `compose()` so a keyboard, a
// pad and a touch screen can coexist without fighting over the state object.
//
// Look input is delivered in "mouse pixels": mouse deltas are accumulated, stick
// deflection is converted to pixels per second inside consumeLook(dt) so the
// turn rate is independent of the frame rate.

const STICK = {
  moveRadius: 52, // px of thumb travel for full deflection
  lookRadius: 64,
  moveDeadzone: 0.12,
  lookDeadzone: 0.08,
  rimSprintOn: 0.96, // push the move stick to the rim to sprint…
  rimSprintOff: 0.8, // …and pull it back this far to stop
  touchLookRate: 1250, // px-equivalent per second at full deflection (~158°/s at default sensitivity)
  padLookRate: 1500, // ~190°/s
  padMoveDeadzone: 0.18,
  padLookDeadzone: 0.15,
  doubleTapWindow: 280, // ms between two taps
  tapMaxDuration: 220,
  tapMaxTravel: 14,
};

// Radial deadzone + quadratic response curve. Returns [x, y, rawMagnitude].
function shapeStick(x, y, deadzone) {
  const len = Math.hypot(x, y);
  if (len < deadzone || len === 0) {
    return [0, 0, len];
  }
  const t = Math.min(1, (len - deadzone) / (1 - deadzone));
  const mag = t * t;
  return [(x / len) * mag, (y / len) * mag, len];
}

const clamp1 = (v) => Math.min(1, Math.max(-1, v));

export function createInput(ctx) {
  const canvas = ctx.canvas;
  const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  const state = {
    isTouch,
    moveX: 0, // strafe right +
    moveZ: 0, // forward +
    sprint: false,
    jumpHeld: false,
    jumpPressed: false,
    lookDX: 0, // accumulated mouse pixels (consumed every frame)
    lookDY: 0,
    lookAxisX: 0, // -1..1 stick deflection (touch look stick + pad right stick)
    lookAxisY: 0,
    pointerLocked: false,
    interacted: false,
    gamepadConnected: false,
    gamepadActive: false,
  };

  // monotonic clock for tap timing (overridable so tests can drive it deterministically)
  const api = { clock: () => performance.now() };
  const gamepadListeners = [];

  // per-source contributions
  const keySrc = { x: 0, z: 0, sprint: false, jumpHeld: false };
  const touchSrc = { x: 0, z: 0, sprint: false, jumpHeld: false, lookX: 0, lookY: 0 };
  const padSrc = { x: 0, z: 0, sprint: false, rimSprint: false, jumpHeld: false, lookX: 0, lookY: 0, prevA: false, active: false };

  function compose() {
    state.moveX = clamp1(keySrc.x + touchSrc.x + padSrc.x);
    state.moveZ = clamp1(keySrc.z + touchSrc.z + padSrc.z);
    state.sprint = keySrc.sprint || touchSrc.sprint || padSrc.sprint;
    state.jumpHeld = keySrc.jumpHeld || touchSrc.jumpHeld || padSrc.jumpHeld;
    state.lookAxisX = clamp1(touchSrc.lookX + padSrc.lookX);
    state.lookAxisY = clamp1(touchSrc.lookY + padSrc.lookY);
  }

  // ---------- keyboard ----------
  const keys = new Set();

  function syncKeys() {
    keySrc.z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    keySrc.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    keySrc.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    keySrc.jumpHeld = keys.has('Space');
    compose();
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      return;
    }
    keys.add(event.code);
    if (event.code === 'Space') {
      state.jumpPressed = true;
      event.preventDefault();
    }
    state.interacted = true;
    syncKeys();
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    syncKeys();
  });

  function releaseAll() {
    keys.clear();
    syncKeys();
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseAll();
    }
  });

  // ---------- desktop: pointer lock ----------
  if (!isTouch) {
    canvas.addEventListener('click', () => {
      state.interacted = true;
      if (!state.pointerLocked) {
        canvas.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      state.pointerLocked = document.pointerLockElement === canvas;
      ctx.hud?.setPointerLocked(state.pointerLocked);
    });

    window.addEventListener('mousemove', (event) => {
      if (!state.pointerLocked) {
        return;
      }
      state.lookDX += event.movementX;
      state.lookDY += event.movementY;
    });
  }

  // no long-press context menu / text selection on the canvas
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  // ---------- touch: dual sticks ----------
  if (isTouch) {
    document.body.classList.add('is-touch');

    const moveStickEl = document.querySelector('[data-stick-move]');
    const lookStickEl = document.querySelector('[data-stick-look]');
    const moveNub = moveStickEl?.querySelector('.stick-nub');
    const lookNub = lookStickEl?.querySelector('.stick-nub');

    const movePointer = { id: null, originX: 0, originY: 0 };
    const lookPointer = { id: null, originX: 0, originY: 0, downTime: 0, travel: 0, firedJump: false };
    let lastTapEnd = -Infinity;
    let lastTapWasClean = false;
    let jumpHoldTimer = 0;

    function setNub(nub, stickEl, dx, dy, pressed) {
      if (!nub) {
        return;
      }
      if (pressed) {
        nub.style.transition = 'none';
      } else {
        // spring back to the centre with a short ease-out
        nub.style.transition = 'transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      }
      nub.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
      stickEl?.classList.toggle('is-active', pressed);
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }
      state.interacted = true;
      const half = window.innerWidth / 2;
      if (event.clientX < half && movePointer.id === null) {
        movePointer.id = event.pointerId;
        movePointer.originX = event.clientX;
        movePointer.originY = event.clientY;
        setNub(moveNub, moveStickEl, 0, 0, true);
      } else if (event.clientX >= half && lookPointer.id === null) {
        lookPointer.id = event.pointerId;
        lookPointer.originX = event.clientX;
        lookPointer.originY = event.clientY;
        lookPointer.downTime = api.clock();
        lookPointer.travel = 0;
        lookPointer.firedJump = false;
        setNub(lookNub, lookStickEl, 0, 0, true);
        // double-tap on the look side = jump (or surface while swimming)
        if (lastTapWasClean && lookPointer.downTime - lastTapEnd < STICK.doubleTapWindow) {
          state.jumpPressed = true;
          touchSrc.jumpHeld = true;
          lookPointer.firedJump = true; // this tap is spent — a third tap must not chain another jump
          window.clearTimeout(jumpHoldTimer);
          jumpHoldTimer = window.setTimeout(() => {
            touchSrc.jumpHeld = false;
            compose();
          }, 220);
          compose();
          lastTapWasClean = false;
        }
      }
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch {
        // pointer already gone (or synthetic) — capture is only an optimisation
      }
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (event.pointerId === movePointer.id) {
        let dx = event.clientX - movePointer.originX;
        let dy = event.clientY - movePointer.originY;
        const len = Math.hypot(dx, dy);
        if (len > STICK.moveRadius) {
          dx = (dx / len) * STICK.moveRadius;
          dy = (dy / len) * STICK.moveRadius;
        }
        const [sx, sy, raw] = shapeStick(dx / STICK.moveRadius, dy / STICK.moveRadius, STICK.moveDeadzone);
        touchSrc.x = sx;
        touchSrc.z = -sy;
        if (!touchSrc.sprint && raw >= STICK.rimSprintOn) {
          touchSrc.sprint = true;
        } else if (touchSrc.sprint && raw < STICK.rimSprintOff) {
          touchSrc.sprint = false;
        }
        setNub(moveNub, moveStickEl, dx, dy, true);
        compose();
      } else if (event.pointerId === lookPointer.id) {
        let dx = event.clientX - lookPointer.originX;
        let dy = event.clientY - lookPointer.originY;
        lookPointer.travel = Math.max(lookPointer.travel, Math.hypot(dx, dy));
        const len = Math.hypot(dx, dy);
        if (len > STICK.lookRadius) {
          dx = (dx / len) * STICK.lookRadius;
          dy = (dy / len) * STICK.lookRadius;
        }
        const [sx, sy] = shapeStick(dx / STICK.lookRadius, dy / STICK.lookRadius, STICK.lookDeadzone);
        touchSrc.lookX = sx;
        touchSrc.lookY = sy;
        setNub(lookNub, lookStickEl, dx, dy, true);
        compose();
      }
    });

    function releasePointer(event) {
      if (event.pointerId === movePointer.id) {
        movePointer.id = null;
        touchSrc.x = 0;
        touchSrc.z = 0;
        touchSrc.sprint = false;
        setNub(moveNub, moveStickEl, 0, 0, false);
        compose();
      } else if (event.pointerId === lookPointer.id) {
        lookPointer.id = null;
        touchSrc.lookX = 0;
        touchSrc.lookY = 0;
        const now = api.clock();
        lastTapWasClean = !lookPointer.firedJump && now - lookPointer.downTime < STICK.tapMaxDuration && lookPointer.travel < STICK.tapMaxTravel;
        lastTapEnd = now;
        setNub(lookNub, lookStickEl, 0, 0, false);
        compose();
      }
    }

    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
  }

  // ---------- gamepad (optional, polled once per frame by the player) ----------
  function pollGamepad() {
    let pads = null;
    try {
      pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null;
    } catch {
      pads = null;
    }
    let pad = null;
    if (pads) {
      for (const candidate of pads) {
        if (candidate && candidate.connected !== false && candidate.axes && candidate.axes.length >= 2) {
          pad = candidate;
          break;
        }
      }
    }
    const wasConnected = state.gamepadConnected;
    state.gamepadConnected = Boolean(pad);
    if (pad && !wasConnected) {
      for (const listener of gamepadListeners) {
        try {
          listener(pad);
        } catch (error) {
          console.error('gamepad listener failed', error);
        }
      }
    }
    if (!pad) {
      if (padSrc.active) {
        padSrc.active = false;
        padSrc.x = 0;
        padSrc.z = 0;
        padSrc.lookX = 0;
        padSrc.lookY = 0;
        padSrc.sprint = false;
        padSrc.rimSprint = false;
        padSrc.jumpHeld = false;
        state.gamepadActive = false;
        compose();
      }
      return;
    }

    const axes = pad.axes;
    const buttons = pad.buttons || [];
    const [mx, my, rawMove] = shapeStick(axes[0] || 0, axes[1] || 0, STICK.padMoveDeadzone);
    const [lx, ly] = shapeStick(axes[2] || 0, axes[3] || 0, STICK.padLookDeadzone);
    const aPressed = Boolean(buttons[0]?.pressed);
    const triggerValue = typeof buttons[7]?.value === 'number' ? buttons[7].value : buttons[7]?.pressed ? 1 : 0;
    const sprintButton = Boolean(buttons[10]?.pressed) || triggerValue > 0.5;
    if (!padSrc.rimSprint && rawMove >= STICK.rimSprintOn) {
      padSrc.rimSprint = true;
    } else if (padSrc.rimSprint && rawMove < STICK.rimSprintOff) {
      padSrc.rimSprint = false;
    }
    const anyInput = mx !== 0 || my !== 0 || lx !== 0 || ly !== 0 || aPressed || sprintButton;

    if (anyInput || padSrc.active) {
      padSrc.x = mx;
      padSrc.z = -my;
      padSrc.lookX = lx;
      padSrc.lookY = ly;
      padSrc.sprint = sprintButton || (padSrc.rimSprint && my < -0.2);
      padSrc.jumpHeld = aPressed;
      if (aPressed && !padSrc.prevA) {
        state.jumpPressed = true;
      }
      if (anyInput) {
        state.interacted = true;
      }
      padSrc.active = anyInput;
      state.gamepadActive = anyInput;
      compose();
    }
    padSrc.prevA = aPressed;
  }

  // ---------- consumers ----------
  function consumeLook(dt = 1 / 60) {
    let dx = state.lookDX;
    let dy = state.lookDY;
    state.lookDX = 0;
    state.lookDY = 0;
    if (touchSrc.lookX !== 0 || touchSrc.lookY !== 0) {
      dx += touchSrc.lookX * STICK.touchLookRate * dt;
      dy += touchSrc.lookY * STICK.touchLookRate * 0.8 * dt;
    }
    if (padSrc.lookX !== 0 || padSrc.lookY !== 0) {
      dx += padSrc.lookX * STICK.padLookRate * dt;
      dy += padSrc.lookY * STICK.padLookRate * 0.75 * dt;
    }
    return { dx, dy };
  }

  function consumeJump() {
    const pressed = state.jumpPressed;
    state.jumpPressed = false;
    return pressed;
  }

  // fires once each time a pad shows up (e.g. to show a controls hint); returns an unsubscribe
  function onGamepadConnected(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    gamepadListeners.push(listener);
    return () => {
      const index = gamepadListeners.indexOf(listener);
      if (index >= 0) {
        gamepadListeners.splice(index, 1);
      }
    };
  }

  return Object.assign(api, { state, consumeLook, consumeJump, pollGamepad, onGamepadConnected, stick: STICK });
}
