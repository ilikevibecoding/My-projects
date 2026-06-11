// Pokédex: list of all 151 with seen/caught markers and a detail view.
(function () {
  "use strict";

  function PokedexScene(game) {
    this.game = game;
    this.index = 0;
    this.scroll = 0;
    this.detail = false;
    this.anim = 0;
  }

  PokedexScene.prototype.update = function (dt) {
    this.anim += dt;
    const I = window.Input;
    if (this.detail) {
      if (I.pressed("b") || I.pressed("a")) {
        AudioSys.sfx("deny");
        this.detail = false;
      }
      return;
    }
    if (I.pressed("b")) {
      AudioSys.sfx("deny");
      this.game.popScene();
      return;
    }
    const move = (delta) => {
      this.index = Math.max(0, Math.min(150, this.index + delta));
      AudioSys.sfx("menu");
    };
    if (I.pressed("up")) move(-1);
    if (I.pressed("down")) move(1);
    if (I.pressed("left")) move(-7);
    if (I.pressed("right")) move(7);
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index > this.scroll + 8) this.scroll = this.index - 8;
    if (I.pressed("a")) {
      const id = this.index + 1;
      if (this.game.state.pokedex.seen[id]) {
        AudioSys.sfx("confirm");
        this.detail = true;
        AudioSys.cry(id);
      } else {
        AudioSys.sfx("deny");
      }
    }
  };

  PokedexScene.prototype.draw = function (ctx) {
    const dex = this.game.state.pokedex;
    ctx.fillStyle = "#d23b3b";
    ctx.fillRect(0, 0, 240, 160);

    if (this.detail) {
      const id = this.index + 1;
      const spec = window.POKEDEX[id];
      const caught = dex.caught[id];
      UI.drawBox(ctx, 8, 8, 224, 144);
      const img = window.Sprites.front(id);
      if (window.Sprites.ready(img)) {
        if (!caught) ctx.filter = "brightness(0)";
        ctx.drawImage(img, 16, 14, 64, 64);
        ctx.filter = "none";
      }
      UI.text(ctx, `No.${String(id).padStart(3, "0")}`, 92, 20);
      UI.text(ctx, spec.display.toUpperCase(), 92, 32);
      UI.text(ctx, caught ? spec.genus : "???", 92, 44, "#6a7a9a");
      if (caught) {
        UI.text(ctx, `HT ${(spec.height / 10).toFixed(1)}m  WT ${(spec.weight / 10).toFixed(1)}kg`, 92, 56, "#6a7a9a");
        UI.text(ctx, spec.types.map((t) => t.toUpperCase()).join("/"), 92, 68, "#3b56a8");
        const lines = window.Dialog.wrap(spec.flavor, 34).slice(0, 5);
        lines.forEach((line, i) => UI.text(ctx, line, 16, 86 + i * 12));
      } else {
        UI.text(ctx, "Catch it to fill in its data!", 16, 92, "#6a7a9a");
      }
      return;
    }

    UI.drawBox(ctx, 4, 4, 232, 130);
    const seenCount = Object.keys(dex.seen).length;
    const caughtCount = Object.keys(dex.caught).length;
    for (let row = 0; row < 9; row++) {
      const i = this.scroll + row;
      if (i > 150) break;
      const id = i + 1;
      const y = 11 + row * 13;
      const seen = dex.seen[id], caught = dex.caught[id];
      UI.text(ctx, String(id).padStart(3, "0"), 24, y);
      UI.text(ctx, seen ? window.POKEDEX[id].display.toUpperCase() : "-----", 70, y, seen ? "#21232b" : "#9aa6c0");
      if (caught) {
        // tiny poké ball marker
        ctx.fillStyle = "#d23b3b";
        ctx.fillRect(53, y + 1, 5, 3);
        ctx.fillStyle = "#f8f8f8";
        ctx.fillRect(53, y + 4, 5, 2);
        ctx.fillStyle = "#21232b";
        ctx.fillRect(53, y + 3, 5, 1);
        UI.text(ctx, "OK", 190, y, "#48a048");
      }
      if (i === this.index) UI.text(ctx, "▶", 12, y);
    }
    UI.drawBox(ctx, 4, 136, 232, 20);
    UI.text(ctx, `SEEN ${seenCount}   OWN ${caughtCount}`, 16, 142);
  };

  window.PokedexScene = PokedexScene;
})();
