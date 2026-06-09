// Title screen: logo, cycling Pokémon, New Game / Continue.
(function () {
  "use strict";

  function TitleScene(game) {
    this.game = game;
    this.t = 0;
    this.monId = 25;
    this.monTimer = 0;
    this.menu = null;
    this.menuIndex = 0;
    this.showMenu = false;
  }

  TitleScene.prototype.update = function (dt) {
    this.t += dt;
    this.monTimer += dt;
    if (this.monTimer > 3) {
      this.monTimer = 0;
      this.monId = 1 + Math.floor(Math.random() * 151);
      window.Sprites.front(this.monId);
    }
    const I = window.Input;
    AudioSys.playMusic("title");

    if (!this.showMenu) {
      if (I.pressed("a") || I.pressed("start")) {
        AudioSys.sfx("confirm");
        this.showMenu = true;
        this.options = window.SaveSys.hasSave()
          ? ["CONTINUE", "NEW GAME", "IMPORT SAVE"]
          : ["NEW GAME", "IMPORT SAVE"];
        this.menuIndex = 0;
      }
      return;
    }

    if (I.pressed("up")) { this.menuIndex = (this.menuIndex + this.options.length - 1) % this.options.length; AudioSys.sfx("menu"); }
    if (I.pressed("down")) { this.menuIndex = (this.menuIndex + 1) % this.options.length; AudioSys.sfx("menu"); }
    if (I.pressed("b")) { this.showMenu = false; AudioSys.sfx("deny"); }
    if (I.pressed("a") || I.pressed("start")) {
      AudioSys.sfx("confirm");
      const choice = this.options[this.menuIndex];
      if (choice === "CONTINUE") {
        const state = window.SaveSys.load();
        if (state) {
          this.game.state = state;
          AudioSys.stopMusic();
          this.game.startOverworld();
        }
      } else if (choice === "NEW GAME") {
        this.game.state = this.game.newGameState();
        AudioSys.stopMusic();
        this.game.scenes = [new window.IntroScene(this.game)];
      } else if (choice === "IMPORT SAVE") {
        const code = prompt("Paste your save code:");
        if (code) {
          const state = window.SaveSys.importCode(code);
          if (state && state.party) {
            this.game.state = state;
            window.SaveSys.save(state);
            AudioSys.stopMusic();
            this.game.startOverworld();
          } else {
            alert("That save code didn't work.");
          }
        }
      }
    }
  };

  TitleScene.prototype.draw = function (ctx) {
    // sky gradient bands (GB style)
    ctx.fillStyle = "#7caee8";
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = "#9cc6f2";
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = "#5d94d8";
    ctx.fillRect(0, 110, 240, 50);

    // logo
    UI.drawBox(ctx, 20, 14, 200, 44);
    UI.text(ctx, "POCKET MONSTERS", 38, 24, "#d23b3b");
    UI.text(ctx, "VERDANT VERSION", 50, 40, "#21232b");

    // featured Pokémon
    const img = window.Sprites.front(this.monId);
    if (window.Sprites.ready(img)) {
      const bob = Math.round(Math.sin(this.t * 2.5) * 3);
      ctx.drawImage(img, 88, 64 + bob, 64, 64);
    }

    if (!this.showMenu) {
      if (Math.floor(this.t * 2) % 2 === 0) {
        UI.text(ctx, "PRESS START", 87, 138, "#f8f8f8");
      }
    } else {
      const h = this.options.length * 14 + 12;
      UI.drawBox(ctx, 70, 96, 100, h);
      this.options.forEach((opt, i) => {
        UI.text(ctx, opt, 92, 104 + i * 14);
        if (i === this.menuIndex) UI.text(ctx, "▶", 80, 104 + i * 14);
      });
    }
    UI.text(ctx, "A fan-made tribute", 66, 152, "#2c3e66");
  };

  window.TitleScene = TitleScene;
})();
