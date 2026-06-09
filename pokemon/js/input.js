// Keyboard + touch input with edge-triggered "pressed" detection.
(function () {
  "use strict";

  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
    z: "a", Z: "a", " ": "a",
    x: "b", X: "b", Backspace: "b", Escape: "b",
    Enter: "start",
  };

  const Input = {
    held: {},      // name -> bool
    pressedSet: {},// name -> bool (cleared each frame after consumption)

    init() {
      window.addEventListener("keydown", (e) => {
        const name = KEYMAP[e.key];
        if (!name) return;
        e.preventDefault();
        if (!this.held[name]) this.pressedSet[name] = true;
        this.held[name] = true;
        if (window.AudioSys) window.AudioSys.unlock();
      });
      window.addEventListener("keyup", (e) => {
        const name = KEYMAP[e.key];
        if (!name) return;
        e.preventDefault();
        this.held[name] = false;
      });
      window.addEventListener("blur", () => {
        this.held = {};
        this.pressedSet = {};
      });

      // Touch buttons
      document.querySelectorAll("[data-key]").forEach((btn) => {
        const name = btn.dataset.key;
        const down = (e) => {
          e.preventDefault();
          if (!this.held[name]) this.pressedSet[name] = true;
          this.held[name] = true;
          if (window.AudioSys) window.AudioSys.unlock();
        };
        const up = (e) => {
          e.preventDefault();
          this.held[name] = false;
        };
        btn.addEventListener("pointerdown", down);
        btn.addEventListener("pointerup", up);
        btn.addEventListener("pointerleave", up);
        btn.addEventListener("pointercancel", up);
      });
    },

    pressed(name) {
      if (this.pressedSet[name]) {
        this.pressedSet[name] = false;
        return true;
      }
      return false;
    },

    isHeld(name) {
      return !!this.held[name];
    },

    // call at end of each frame
    endFrame() {
      this.pressedSet = {};
    },
  };

  window.Input = Input;
})();
