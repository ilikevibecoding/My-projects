// Pause menu (START): Pokédex, Pokémon, Bag, Save, Options, Exit.
(function () {
  "use strict";

  function MenuScene(game) {
    this.game = game;
    this.index = 0;
    this.transparent = true;
    this.busy = false;
  }

  MenuScene.prototype.options = function () {
    return ["POKéDEX", "POKéMON", "BAG", `${this.game.state.playerName}`, "SAVE", "OPTIONS", "EXIT"];
  };

  MenuScene.prototype.update = function () {
    const I = window.Input;
    const D = window.Dialog;
    if (D.active) { D.update(); D.handleInput(); return; }
    if (this.busy) return;
    const opts = this.options();
    if (I.pressed("up")) { this.index = (this.index + opts.length - 1) % opts.length; AudioSys.sfx("menu"); }
    if (I.pressed("down")) { this.index = (this.index + 1) % opts.length; AudioSys.sfx("menu"); }
    if (I.pressed("b") || I.pressed("start")) {
      AudioSys.sfx("deny");
      this.game.popScene();
      return;
    }
    if (I.pressed("a")) {
      AudioSys.sfx("confirm");
      this.select(opts[this.index]);
    }
  };

  MenuScene.prototype.select = async function (option) {
    const game = this.game;
    const D = window.Dialog;
    switch (option) {
      case "POKéDEX":
        game.pushScene(new window.PokedexScene(game));
        break;
      case "POKéMON":
        if (game.state.party.length === 0) {
          this.busy = true;
          await D.say("You don't have any Pokémon yet!");
          this.busy = false;
        } else {
          game.pushScene(new window.PartyScene(game, "view"));
        }
        break;
      case "BAG":
        game.pushScene(new window.BagScene(game, "menu"));
        break;
      case "SAVE": {
        this.busy = true;
        const ok = window.SaveSys.save(game.state);
        if (ok) {
          AudioSys.sfx("save");
          await D.say(`${game.state.playerName} saved the game!`);
        } else {
          await D.say("Saving to this browser failed. Use OPTIONS > Export to copy a save code instead.");
        }
        this.busy = false;
        break;
      }
      case "OPTIONS": {
        this.busy = true;
        const pick = await D.ask(["Export save", "Toggle sound", "Back"], { aboveBox: true });
        if (pick === 0) {
          const code = window.SaveSys.exportCode(game.state);
          try {
            await navigator.clipboard.writeText(code);
            await D.say("Save code copied to clipboard! Paste it somewhere safe, then IMPORT SAVE on the title screen.");
          } catch (e) {
            prompt("Copy your save code:", code);
          }
        } else if (pick === 1) {
          const muted = AudioSys.toggleMute();
          await D.say(muted ? "Sound off." : "Sound on!");
        }
        this.busy = false;
        break;
      }
      default:
        if (option === this.game.state.playerName) {
          this.busy = true;
          const st = game.state;
          const badges = st.flags.badge ? 1 : 0;
          const mins = Math.floor(st.playTime / 60);
          await D.say(`${st.playerName} — Money: $${st.money}\nBadges: ${badges}   Play time: ${mins} min`);
          this.busy = false;
        } else {
          game.popScene();
        }
    }
  };

  MenuScene.prototype.draw = function (ctx) {
    const opts = this.options();
    const w = 102;
    const h = opts.length * 14 + 10;
    UI.drawBox(ctx, 240 - w - 3, 3, w, h);
    opts.forEach((opt, i) => {
      UI.text(ctx, opt, 240 - w + 12, 10 + i * 14);
      if (i === this.index) UI.text(ctx, "▶", 240 - w + 3, 10 + i * 14);
    });
    window.Dialog.draw(ctx);
  };

  window.MenuScene = MenuScene;
})();
