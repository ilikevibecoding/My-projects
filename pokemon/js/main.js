// Boot, game state, scene stack, fixed-step loop.
(function () {
  "use strict";

  const Game = {
    canvas: null,
    ctx: null,
    scenes: [],
    state: null,
    overworld: null,

    init() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      window.Input.init();
      window.Tileset.init();
      window.CharSprites.init();

      // hide the PC download link when already running from disk
      if (location.protocol === "file:") {
        const dl = document.getElementById("download-link");
        if (dl) dl.style.display = "none";
      }

      this.pushScene(new window.TitleScene(this));

      let last = performance.now();
      let acc = 0;
      const STEP = 1 / 60;
      const loop = (now) => {
        acc += Math.min(0.25, (now - last) / 1000);
        last = now;
        while (acc >= STEP) {
          this.update(STEP);
          acc -= STEP;
        }
        this.draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    newGameState() {
      return {
        version: 1,
        playerName: "RED",
        rivalName: "BLUE",
        money: 5000,
        badges: [],
        party: [],
        bag: {},
        pokedex: { seen: {}, caught: {} },
        map: "player_home",
        x: 5, y: 5, dir: "down",
        lastHeal: { map: "player_home", x: 5, y: 5, dir: "down" },
        flags: { trainers: {} },
        starterId: null,
        playTime: 0,
      };
    },

    // ---------- scene stack ----------
    pushScene(scene) {
      this.scenes.push(scene);
    },
    popScene() {
      return this.scenes.pop();
    },
    replaceScene(scene) {
      this.scenes.pop();
      this.scenes.push(scene);
    },
    topScene() {
      return this.scenes[this.scenes.length - 1];
    },

    startOverworld() {
      // one-time travel allowance so players never get stuck in a no-money loop
      if (this.state && this.state.flags) {
        if (!this.state.flags.travelAllowance) {
          this.state.flags.travelAllowance = true;
          this.state.money = Math.max(this.state.money || 0, 5000);
        }
      }
      this.overworld = new window.OverworldScene(this);
      this.scenes = [this.overworld];
    },

    startBattle(config, onEnd) {
      this.pushScene(new window.BattleScene(this, config, onEnd));
    },

    // Auto-save: called after battles, map changes, heals, and purchases.
    autoSave() {
      if (!this.state || !this.overworld) return;
      if (window.SaveSys.save(this.state)) {
        this.toast = { text: "SAVED", t: 1.4 };
      }
    },

    // After a blackout: heal and respawn at last heal point (lose only 10% of money).
    blackout() {
      const st = this.state;
      st.party.forEach((m) => window.Mon.fullHeal(m));
      st.money = Math.max(0, st.money - Math.floor(st.money / 10));
      const lh = st.lastHeal || { map: "player_home", x: 5, y: 5, dir: "down" };
      if (lh.returnWarp) st.returnWarp = lh.returnWarp; // exit into the right town
      this.overworld.loadMap(lh.map, lh.x, lh.y, lh.dir, true);
    },

    update(dt) {
      if (this.state) this.state.playTime += dt;
      if (this.toast) {
        this.toast.t -= dt;
        if (this.toast.t <= 0) this.toast = null;
      }
      const top = this.topScene();
      if (top) top.update(dt);
      window.Input.endFrame();
    },

    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#0a0c14";
      ctx.fillRect(0, 0, 240, 160);
      // find lowest opaque scene
      let start = this.scenes.length - 1;
      while (start > 0 && this.scenes[start].transparent) start--;
      for (let i = start; i < this.scenes.length; i++) {
        this.scenes[i].draw(ctx);
      }
      // auto-save toast
      if (this.toast) {
        const w = window.UI.textWidth(this.toast.text) + 14;
        window.UI.drawBox(ctx, 240 - w - 3, 160 - 21, w, 18);
        window.UI.text(ctx, this.toast.text, 240 - w + 4, 160 - 16, "#48a048");
      }
    },
  };

  window.Game = Game;
  window.addEventListener("load", () => Game.init());
})();
