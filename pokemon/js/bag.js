// Item definitions and the in-game bag UI scene.
(function () {
  "use strict";

  const ITEMS = {
    potion:       { name: "POTION",       price: 200,  desc: "Restores 20 HP.",          kind: "heal", amount: 20 },
    superpotion:  { name: "SUPER POTION", price: 600,  desc: "Restores 60 HP.",          kind: "heal", amount: 60 },
    hyperpotion:  { name: "HYPER POTION", price: 1500, desc: "Restores 120 HP.",         kind: "heal", amount: 120 },
    fullrestore:  { name: "FULL RESTORE", price: 3000, desc: "Fully restores HP and status.", kind: "fullrestore" },
    revive:       { name: "REVIVE",       price: 1500, desc: "Revives a fainted Pokémon to half HP.", kind: "revive" },
    antidote:     { name: "ANTIDOTE",     price: 100,  desc: "Cures poison.",            kind: "status", cures: "psn" },
    parlyzheal:   { name: "PARLYZ HEAL",  price: 200,  desc: "Cures paralysis.",         kind: "status", cures: "par" },
    awakening:    { name: "AWAKENING",    price: 250,  desc: "Wakes a sleeping Pokémon.", kind: "status", cures: "slp" },
    burnheal:     { name: "BURN HEAL",    price: 250,  desc: "Cures a burn.",            kind: "status", cures: "brn" },
    iceheal:      { name: "ICE HEAL",     price: 250,  desc: "Thaws a frozen Pokémon.",  kind: "status", cures: "frz" },
    fullheal:     { name: "FULL HEAL",    price: 600,  desc: "Cures all status problems.", kind: "status", cures: "all" },
    pokeball:     { name: "POKé BALL",    price: 200,  desc: "A ball for catching Pokémon.", kind: "ball", mod: 1 },
    greatball:    { name: "GREAT BALL",   price: 600,  desc: "A good ball with a higher catch rate.", kind: "ball", mod: 1.5 },
    ultraball:    { name: "ULTRA BALL",   price: 1200, desc: "An ultra-performance ball.", kind: "ball", mod: 2 },
  };
  const ITEM_ORDER = Object.keys(ITEMS);

  const Bag = {
    ITEMS,

    add(state, itemId, count = 1) {
      state.bag[itemId] = (state.bag[itemId] || 0) + count;
    },

    remove(state, itemId, count = 1) {
      if (!state.bag[itemId]) return false;
      state.bag[itemId] -= count;
      if (state.bag[itemId] <= 0) delete state.bag[itemId];
      return true;
    },

    list(state) {
      return ITEM_ORDER.filter((id) => state.bag[id] > 0).map((id) => ({
        id, count: state.bag[id], ...ITEMS[id],
      }));
    },

    // Use an item on a Pokémon (outside or inside battle). Returns message or null if no effect.
    useOn(state, itemId, mon) {
      const item = ITEMS[itemId];
      if (!item) return null;
      switch (item.kind) {
        case "heal": {
          if (mon.hp <= 0 || mon.hp >= mon.stats.hp) return null;
          const healed = Math.min(item.amount, mon.stats.hp - mon.hp);
          mon.hp += healed;
          this.remove(state, itemId);
          return `${mon.name} recovered ${healed} HP!`;
        }
        case "fullrestore": {
          if (mon.hp <= 0 || (mon.hp >= mon.stats.hp && !mon.status)) return null;
          mon.hp = mon.stats.hp;
          mon.status = null;
          this.remove(state, itemId);
          return `${mon.name} became fully healthy!`;
        }
        case "revive": {
          if (mon.hp > 0) return null;
          mon.hp = Math.floor(mon.stats.hp / 2);
          mon.status = null;
          this.remove(state, itemId);
          return `${mon.name} was revived!`;
        }
        case "status": {
          if (mon.hp <= 0) return null;
          if (item.cures === "all" ? !mon.status : mon.status !== item.cures) return null;
          mon.status = null;
          mon.sleepTurns = 0;
          this.remove(state, itemId);
          return `${mon.name} is healthy again!`;
        }
        default:
          return null;
      }
    },
  };

  window.Bag = Bag;

  // ---------- Bag UI scene (overlay) ----------
  // mode: 'menu' (use on party) | 'battle' (resolve with chosen item)
  function BagScene(game, mode, onResult) {
    this.game = game;
    this.mode = mode || "menu";
    this.onResult = onResult || null;
    this.index = 0;
    this.scroll = 0;
    this.transparent = true;
  }

  BagScene.prototype.update = function () {
    const I = window.Input;
    const D = window.Dialog;
    if (D.active) { D.update(); D.handleInput(); return; }
    if (this._busy) return;
    const items = Bag.list(this.game.state);
    if (I.pressed("b")) {
      AudioSys.sfx("deny");
      this.game.popScene();
      if (this.onResult) this.onResult(null);
      return;
    }
    if (items.length === 0) return;
    if (I.pressed("up")) { this.index = Math.max(0, this.index - 1); AudioSys.sfx("menu"); }
    if (I.pressed("down")) { this.index = Math.min(items.length - 1, this.index + 1); AudioSys.sfx("menu"); }
    this.index = Math.min(this.index, items.length - 1);
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index > this.scroll + 5) this.scroll = this.index - 5;

    if (I.pressed("a")) {
      const item = items[this.index];
      AudioSys.sfx("confirm");
      if (this.mode === "battle") {
        // battle scene decides what to do with it
        this.game.popScene();
        if (this.onResult) this.onResult(item.id);
        return;
      }
      this._useFromMenu(item);
    }
  };

  BagScene.prototype._useFromMenu = async function (item) {
    const D = window.Dialog;
    const game = this.game;
    this._busy = true;
    try {
      if (item.kind === "ball") {
        await D.say("You can't use that here!");
        return;
      }
      // pick a party member
      const choice = await new Promise((resolve) => {
        game.pushScene(new window.PartyScene(game, "select", resolve));
      });
      if (choice === null || choice < 0) return;
      const mon = game.state.party[choice];
      const msg = Bag.useOn(game.state, item.id, mon);
      if (msg) {
        AudioSys.sfx("heal");
        await D.say(msg);
      } else {
        await D.say("It won't have any effect.");
      }
    } finally {
      this._busy = false;
    }
  };

  BagScene.prototype.draw = function (ctx) {
    ctx.fillStyle = "rgba(20,24,38,0.45)";
    ctx.fillRect(0, 0, 240, 160);
    UI.drawBox(ctx, 16, 8, 208, 108);
    UI.text(ctx, "BAG", 28, 16);
    const items = Bag.list(this.game.state);
    if (items.length === 0) {
      UI.text(ctx, "It's empty…", 40, 44, "#6a7a9a");
    }
    for (let row = 0; row < 6; row++) {
      const i = this.scroll + row;
      if (i >= items.length) break;
      const it = items[i];
      const y = 30 + row * 13;
      UI.text(ctx, it.name, 40, y);
      UI.text(ctx, "×" + it.count, 180, y);
      if (i === this.index) UI.text(ctx, "▶", 30, y);
    }
    const sel = items[this.index];
    UI.drawBox(ctx, 16, 118, 208, 36);
    if (sel) UI.text(ctx, sel.desc, 24, 130);
    window.Dialog.draw(ctx);
  };

  window.BagScene = BagScene;
})();
