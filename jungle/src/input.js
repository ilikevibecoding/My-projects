// Input: desktop pointer-lock mouse/keyboard + mobile dual virtual joysticks.

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
    lookDX: 0,
    lookDY: 0,
    pointerLocked: false,
    interacted: false,
  };

  const keys = new Set();

  function syncKeys() {
    const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    state.moveZ = forward;
    state.moveX = strafe;
    state.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      return;
    }
    keys.add(event.code);
    if (event.code === 'Space') {
      state.jumpHeld = true;
      state.jumpPressed = true;
      event.preventDefault();
    }
    state.interacted = true;
    syncKeys();
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (event.code === 'Space') {
      state.jumpHeld = false;
    }
    syncKeys();
  });

  window.addEventListener('blur', () => {
    keys.clear();
    state.jumpHeld = false;
    syncKeys();
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

  // ---------- touch: dual sticks ----------
  if (isTouch) {
    document.body.classList.add('is-touch');

    const moveStickEl = document.querySelector('[data-stick-move]');
    const lookStickEl = document.querySelector('[data-stick-look]');
    const moveNub = moveStickEl?.querySelector('.stick-nub');
    const lookNub = lookStickEl?.querySelector('.stick-nub');

    const movePointer = { id: null, originX: 0, originY: 0 };
    const lookPointer = { id: null, lastX: 0, lastY: 0 };
    const stickRadius = 52;

    function setNub(nub, dx, dy) {
      if (nub) {
        nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
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
      } else if (lookPointer.id === null) {
        lookPointer.id = event.pointerId;
        lookPointer.lastX = event.clientX;
        lookPointer.lastY = event.clientY;
      }
      canvas.setPointerCapture?.(event.pointerId);
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
        if (len > stickRadius) {
          dx = (dx / len) * stickRadius;
          dy = (dy / len) * stickRadius;
        }
        state.moveX = dx / stickRadius;
        state.moveZ = -dy / stickRadius;
        state.sprint = len >= stickRadius * 0.96;
        setNub(moveNub, dx, dy);
      } else if (event.pointerId === lookPointer.id) {
        const dx = event.clientX - lookPointer.lastX;
        const dy = event.clientY - lookPointer.lastY;
        lookPointer.lastX = event.clientX;
        lookPointer.lastY = event.clientY;
        state.lookDX += dx * 2.2;
        state.lookDY += dy * 2.2;
        setNub(lookNub, dx * 1.4, dy * 1.4);
      }
    });

    function releasePointer(event) {
      if (event.pointerId === movePointer.id) {
        movePointer.id = null;
        state.moveX = 0;
        state.moveZ = 0;
        state.sprint = false;
        setNub(moveNub, 0, 0);
      } else if (event.pointerId === lookPointer.id) {
        lookPointer.id = null;
        setNub(lookNub, 0, 0);
      }
    }

    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);

    // double-tap right side = jump / surface while swimming
    let lastTap = 0;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || event.clientX < window.innerWidth / 2) {
        return;
      }
      const now = performance.now();
      if (now - lastTap < 300) {
        state.jumpPressed = true;
        state.jumpHeld = true;
        window.setTimeout(() => {
          state.jumpHeld = false;
        }, 220);
      }
      lastTap = now;
    });
  }

  function consumeLook() {
    const dx = state.lookDX;
    const dy = state.lookDY;
    state.lookDX = 0;
    state.lookDY = 0;
    return { dx, dy };
  }

  function consumeJump() {
    const pressed = state.jumpPressed;
    state.jumpPressed = false;
    return pressed;
  }

  return { state, consumeLook, consumeJump };
}
