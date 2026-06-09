// Poké Mart: buy and sell items.
(function () {
  "use strict";

  const STOCK = ["pokeball", "greatball", "potion", "superpotion", "antidote", "parlyzheal", "awakening", "burnheal", "revive"];
  const BADGE_STOCK = ["ultraball", "hyperpotion", "fullheal"];

  function ShopScene(game, onDone) {
    this.game = game;
    this.onDone = onDone || null;
    this.phase = "root"; // root | buy | sell
    this.index = 0;
    this.scroll = 0;
    this.busy = false;
    this.transparent = true;
  }

  ShopScene.prototype.stock = function () {
    const ids = [...STOCK];
    if (this.game.state.flags.badge) ids.push(...BADGE_STOCK);
    return ids.map((id) => ({ id, ...window.Bag.ITEMS[id] }));
  };

  ShopScene.prototype.update = function () {
    const I = window.Input;
    const D = window.Dialog;
    if (D.active) { D.update(); D.handleInput(); return; }
    if (this.busy) return;

    if (!this._welcomed) {
      this._welcomed = true;
      this.rootMenu();
      return;
    }

    const list = this.phase === "buy" ? this.stock() : window.Bag.list(this.game.state);
    if (this.phase === "buy" || this.phase === "sell") {
      if (I.pressed("b")) {
        AudioSys.sfx("deny");
        this.rootMenu();
        return;
      }
      if (list.length === 0) return;
      if (I.pressed("up")) { this.index = Math.max(0, this.index - 1); AudioSys.sfx("menu"); }
      if (I.pressed("down")) { this.index = Math.min(list.length - 1, this.index + 1); AudioSys.sfx("menu"); }
      this.index = Math.min(this.index, list.length - 1);
      if (this.index < this.scroll) this.scroll = this.index;
      if (this.index > this.scroll + 5) this.scroll = this.index - 5;
      if (I.pressed("a")) {
        AudioSys.sfx("confirm");
        if (this.phase === "buy") this.buy(list[this.index]);
        else this.sell(list[this.index]);
      }
    }
  };

  ShopScene.prototype.rootMenu = async function () {
    const D = window.Dialog;
    this.busy = true;
    this.phase = "root";
    const pick = await D.ask(["BUY", "SELL", "QUIT"], { cancelable: true, x: 8, y: 8 });
    this.busy = false;
    if (pick === 0) {
      this.phase = "buy";
      this.index = 0;
      this.scroll = 0;
    } else if (pick === 1) {
      this.phase = "sell";
      this.index = 0;
      this.scroll = 0;
    } else {
      this.busy = true;
      await D.say("CLERK: Thank you! Please come again!");
      this.game.popScene();
      if (this.onDone) this.onDone();
    }
  };

  ShopScene.prototype.buy = async function (item) {
    const D = window.Dialog;
    const st = this.game.state;
    this.busy = true;
    const counts = ["×1", "×5", "×10", "Cancel"];
    const pick = await D.ask(counts, { aboveBox: true });
    if (pick >= 0 && pick < 3) {
      const qty = [1, 5, 10][pick];
      const cost = item.price * qty;
      if (st.money < cost) {
        await D.say("CLERK: Sorry, you don't have enough money for that.");
      } else {
        const sure = await D.ask(["Deal!", "No thanks"], { aboveBox: true, cancelable: false });
        if (sure === 0) {
          st.money -= cost;
          window.Bag.add(st, item.id, qty);
          AudioSys.sfx("confirm");
          await D.say(`CLERK: ${item.name} ×${qty}, that'll be $${cost}. Here you go!`);
        }
      }
    }
    this.busy = false;
  };

  ShopScene.prototype.sell = async function (item) {
    const D = window.Dialog;
    const st = this.game.state;
    this.busy = true;
    const price = Math.floor(item.price / 2);
    const sure = await D.ask([`Sell for $${price}`, "Keep it"], { aboveBox: true, cancelable: false });
    if (sure === 0) {
      window.Bag.remove(st, item.id, 1);
      st.money += price;
      AudioSys.sfx("confirm");
      await D.say(`CLERK: I'll take that ${item.name} for $${price}!`);
    }
    this.busy = false;
  };

  ShopScene.prototype.draw = function (ctx) {
    ctx.fillStyle = "rgba(20,24,38,0.45)";
    ctx.fillRect(0, 0, 240, 160);
    UI.drawBox(ctx, 130, 4, 106, 20);
    UI.text(ctx, `$${this.game.state.money}`, 140, 10);

    if (this.phase === "buy" || this.phase === "sell") {
      const list = this.phase === "buy" ? this.stock() : window.Bag.list(this.game.state);
      UI.drawBox(ctx, 16, 28, 208, 92);
      UI.text(ctx, this.phase === "buy" ? "WHAT WOULD YOU LIKE?" : "SELL WHICH ITEM?", 26, 34);
      if (list.length === 0) UI.text(ctx, "Nothing here…", 40, 56, "#6a7a9a");
      for (let row = 0; row < 6; row++) {
        const i = this.scroll + row;
        if (i >= list.length) break;
        const it = list[i];
        const y = 46 + row * 12;
        UI.text(ctx, it.name, 40, y);
        UI.text(ctx, this.phase === "buy" ? `$${it.price}` : `×${it.count}`, 168, y);
        if (i === this.index) UI.text(ctx, "▶", 30, y);
      }
      const sel = list[this.index];
      UI.drawBox(ctx, 16, 122, 208, 32);
      if (sel) UI.text(ctx, sel.desc, 24, 132);
    }
    window.Dialog.draw(ctx);
  };

  window.ShopScene = ShopScene;
})();
