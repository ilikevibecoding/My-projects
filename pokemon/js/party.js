// Party screen (view / select / battle-switch) and the summary screen.
(function () {
  "use strict";

  function PartyScene(game, mode, onResult) {
    this.game = game;
    this.mode = mode || "view"; // view | select | battle-switch
    this.onResult = onResult || null;
    this.index = 0;
    this.switchFrom = null;
    this.transparent = false;
    this.busy = false;
    this.anim = 0;
  }

  PartyScene.prototype.update = function (dt) {
    this.anim += dt;
    const I = window.Input;
    const D = window.Dialog;
    if (D.active) { D.update(); D.handleInput(); return; }
    if (this.busy) return;
    const party = this.game.state.party;

    if (I.pressed("up")) { this.index = (this.index + party.length - 1) % party.length; AudioSys.sfx("menu"); }
    if (I.pressed("down")) { this.index = (this.index + 1) % party.length; AudioSys.sfx("menu"); }
    if (I.pressed("b")) {
      AudioSys.sfx("deny");
      if (this.switchFrom !== null) {
        this.switchFrom = null;
        return;
      }
      this.game.popScene();
      if (this.onResult) this.onResult(-1);
      return;
    }
    if (I.pressed("a")) {
      AudioSys.sfx("confirm");
      if (this.switchFrom !== null) {
        const a = this.switchFrom, b = this.index;
        if (a !== b) {
          [party[a], party[b]] = [party[b], party[a]];
        }
        this.switchFrom = null;
        return;
      }
      if (this.mode === "select" || this.mode === "battle-switch") {
        this.game.popScene();
        if (this.onResult) this.onResult(this.index);
        return;
      }
      this.openActions();
    }
  };

  PartyScene.prototype.openActions = async function () {
    const D = window.Dialog;
    this.busy = true;
    const pick = await D.ask(["SUMMARY", "SWITCH", "CANCEL"], { aboveBox: false });
    this.busy = false;
    if (pick === 0) {
      this.game.pushScene(new window.SummaryScene(this.game, this.index));
    } else if (pick === 1) {
      this.switchFrom = this.index;
    }
  };

  PartyScene.prototype.draw = function (ctx) {
    const party = this.game.state.party;
    ctx.fillStyle = "#e8eef8";
    ctx.fillRect(0, 0, 240, 160);
    UI.text(ctx, this.mode === "battle-switch" ? "Choose a POKéMON." : "POKéMON", 10, 6);

    party.forEach((mon, i) => {
      const y = 18 + i * 23;
      const selected = i === this.index;
      const marked = this.switchFrom === i;
      UI.drawBox(ctx, 6, y, 228, 22);
      if (selected) {
        ctx.fillStyle = marked ? "#f0d048" : "#cfe0f8";
        ctx.fillRect(8, y + 2, 224, 18);
      } else if (marked) {
        ctx.fillStyle = "#f0e0a0";
        ctx.fillRect(8, y + 2, 224, 18);
      }
      const icon = window.Sprites.icon(mon.species);
      if (window.Sprites.ready(icon)) {
        // icons are 2-frame sheets; draw first frame area
        const fw = icon.naturalWidth > icon.naturalHeight ? icon.naturalWidth / 2 : icon.naturalWidth;
        ctx.drawImage(icon, 0, 0, fw, icon.naturalHeight, 8, y - 3, 28, 28 * (icon.naturalHeight / fw));
      }
      UI.text(ctx, mon.name, 40, y + 3);
      UI.text(ctx, "L" + mon.level, 124, y + 3);
      if (mon.status) UI.text(ctx, window.Mon.statusLabel(mon.status), 150, y + 3, "#d23b3b");
      if (mon.hp <= 0) UI.text(ctx, "FNT", 150, y + 3, "#d23b3b");
      UI.drawHPBar(ctx, 40, y + 13, 90, mon.hp / mon.stats.hp);
      UI.text(ctx, `${mon.hp}/${mon.stats.hp}`, 140, y + 12);
      if (selected) UI.text(ctx, "▶", 0, y + 7);
    });

    window.Dialog.draw(ctx);
  };

  // ---------- summary ----------
  function SummaryScene(game, index) {
    this.game = game;
    this.index = index;
    this.anim = 0;
  }

  SummaryScene.prototype.update = function (dt) {
    this.anim += dt;
    const I = window.Input;
    const party = this.game.state.party;
    if (I.pressed("b") || I.pressed("a")) {
      AudioSys.sfx("deny");
      this.game.popScene();
      return;
    }
    if (I.pressed("left")) { this.index = (this.index + party.length - 1) % party.length; AudioSys.sfx("menu"); }
    if (I.pressed("right")) { this.index = (this.index + 1) % party.length; AudioSys.sfx("menu"); }
  };

  SummaryScene.prototype.draw = function (ctx) {
    const mon = this.game.state.party[this.index];
    const spec = window.Mon.species(mon);
    ctx.fillStyle = "#e8eef8";
    ctx.fillRect(0, 0, 240, 160);

    UI.drawBox(ctx, 4, 4, 110, 92);
    const img = window.Sprites.front(mon.species);
    if (window.Sprites.ready(img)) {
      ctx.drawImage(img, 22, 10, 72, 72);
    }
    UI.text(ctx, `No.${String(mon.species).padStart(3, "0")}`, 12, 82);
    UI.text(ctx, mon.name, 60, 82);

    UI.drawBox(ctx, 118, 4, 118, 92);
    UI.text(ctx, `L${mon.level}  ${spec.types.map((t) => t.toUpperCase()).join("/")}`, 126, 11);
    const rows = [
      ["HP", `${mon.hp}/${mon.stats.hp}`],
      ["ATTACK", mon.stats.atk],
      ["DEFENSE", mon.stats.def],
      ["SP. ATK", mon.stats.spa],
      ["SP. DEF", mon.stats.spd],
      ["SPEED", mon.stats.spe],
    ];
    rows.forEach(([k, v], i) => {
      UI.text(ctx, k, 126, 24 + i * 11);
      UI.text(ctx, String(v), 196, 24 + i * 11);
    });

    UI.drawBox(ctx, 4, 98, 232, 58);
    mon.moves.forEach((mv, i) => {
      const data = window.MOVES[mv.id];
      const x = 12 + (i % 2) * 116;
      const y = 106 + Math.floor(i / 2) * 22;
      UI.text(ctx, data.display.slice(0, 14), x, y);
      UI.text(ctx, `${data.type.toUpperCase().slice(0, 3)} ${mv.pp}/${mv.maxpp}`, x, y + 9, "#6a7a9a");
    });
    if (mon.moves.length === 0) UI.text(ctx, "No moves!", 12, 106);
    const toNext = window.Mon.expToNext(mon);
    UI.text(ctx, `EXP ${mon.exp}  NEXT ${toNext}`, 12, 148, "#6a7a9a");
  };

  window.PartyScene = PartyScene;
  window.SummaryScene = SummaryScene;
})();
