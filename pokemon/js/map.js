// Town Map screen (open with M, or from the pause menu). Shows the region,
// your current location, locked/unlocked towns, and lets you fast-travel.
(function () {
  "use strict";

  // Screen-space layout of the region (matches the world's geography).
  const NODES = {
    pallet:   { mx: 56,  my: 122, label: "PALLET HOLLOW", note: "Home" },
    city:     { mx: 56,  my: 74,  label: "VERDANT CITY",  note: "BOULDER Badge" },
    lakeside: { mx: 150, my: 74,  label: "LAKESIDE CITY", note: "CASCADE Badge" },
    summit:   { mx: 196, my: 34,  label: "SUMMIT VILLAGE", note: "VICTORY HALL" },
  };
  // Connectors drawn as routes between nodes.
  const ROUTES = [
    { a: "pallet", b: "city", label: "RT.1" },
    { a: "city", b: "lakeside", label: "RT.3" },
    { a: "lakeside", b: "summit", label: "CAVE" },
  ];
  const ORDER = ["pallet", "city", "lakeside", "summit"];

  function MapScene(game) {
    this.game = game;
    this.t = 0;
    this.busy = false;
    // build the list of selectable (visited, non-current) destinations
    const st = game.state;
    const visited = (st.flags && st.flags.visited) || {};
    this.current = window.BUS_STOPS[st.map] ? st.map : (st.flags && st.flags.lastTown) || "pallet";
    this.dests = ORDER.filter((id) => visited[id] && id !== this.current);
    this.sel = 0;
    this.visited = visited;
  }

  MapScene.prototype.update = function () {
    this.t += 1 / 60;
    const I = window.Input;
    const D = window.Dialog;
    if (D.active) { D.update(); D.handleInput(); return; }
    if (this.busy) return;

    if (I.pressed("b") || I.pressed("map") || I.pressed("start")) {
      AudioSys.sfx("deny");
      this.close();
      return;
    }
    if (this.dests.length > 0) {
      if (I.pressed("up") || I.pressed("left")) { this.sel = (this.sel + this.dests.length - 1) % this.dests.length; AudioSys.sfx("menu"); }
      if (I.pressed("down") || I.pressed("right")) { this.sel = (this.sel + 1) % this.dests.length; AudioSys.sfx("menu"); }
      if (I.pressed("a")) this.confirmTravel();
    }
  };

  MapScene.prototype.close = function () {
    // remove the map (and a pause menu, if it opened us) — back to the world
    this.game.scenes = [this.game.overworld];
  };

  MapScene.prototype.confirmTravel = async function () {
    const D = window.Dialog;
    const st = this.game.state;
    const destId = this.dests[this.sel];
    const node = NODES[destId];
    const fare = window.BUS_FARE;
    this.busy = true;
    const pick = await D.ask([`Travel ($${fare})`, "Cancel"], { cancelable: true, aboveBox: true });
    this.busy = false;
    if (pick !== 0) return;
    if (st.money < fare) {
      this.busy = true;
      await D.say(`You need $${fare} to catch the bus to ${node.label}.`);
      this.busy = false;
      return;
    }
    st.money -= fare;
    AudioSys.sfx("confirm");
    const stop = window.BUS_STOPS[destId];
    const ow = this.game.overworld;
    this.game.scenes = [ow];
    ow.transition(() => ow.loadMap(destId, stop.x, stop.y, stop.dir));
  };

  MapScene.prototype.draw = function (ctx) {
    // parchment background
    ctx.fillStyle = "#e7dcb8";
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = "#d8c99e";
    for (let i = 0; i < 240; i += 8) ctx.fillRect(i, 0, 1, 160);
    // border frame
    ctx.strokeStyle = "#8a6a40";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 234, 154);

    UI.text(ctx, "TOWN MAP", 8, 8, "#6b4a26");

    // routes
    ctx.strokeStyle = "#a98b5a";
    ctx.lineWidth = 3;
    ctx.setLineDash([3, 3]);
    for (const r of ROUTES) {
      const A = NODES[r.a], B = NODES[r.b];
      ctx.beginPath();
      ctx.moveTo(A.mx, A.my);
      ctx.lineTo(B.mx, B.my);
      ctx.stroke();
      UI.text(ctx, r.label, Math.round((A.mx + B.mx) / 2) - 9, Math.round((A.my + B.my) / 2) - 10, "#8a6a40");
    }
    ctx.setLineDash([]);

    // nodes
    for (const id of ORDER) {
      const n = NODES[id];
      const unlocked = !!this.visited[id];
      const isCurrent = id === this.current;
      const isSel = this.dests[this.sel] === id;

      // selection ring
      if (isSel) {
        ctx.strokeStyle = "#d23b3b";
        ctx.lineWidth = 2;
        ctx.strokeRect(n.mx - 10, n.my - 10, 20, 20);
      }
      // building icon
      if (unlocked) {
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(n.mx - 7, n.my - 6, 14, 6);   // roof
        ctx.fillStyle = "#f0ead6";
        ctx.fillRect(n.mx - 6, n.my, 12, 7);        // wall
        ctx.fillStyle = "#7a5230";
        ctx.fillRect(n.mx - 2, n.my + 2, 4, 5);     // door
      } else {
        // locked: gray block + padlock
        ctx.fillStyle = "#9a9382";
        ctx.fillRect(n.mx - 7, n.my - 6, 14, 13);
        ctx.fillStyle = "#5e5746";
        ctx.fillRect(n.mx - 3, n.my - 2, 6, 6);     // lock body
        ctx.strokeStyle = "#5e5746";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(n.mx, n.my - 2, 2.5, Math.PI, 0);   // shackle
        ctx.stroke();
      }

      // current-location pulsing marker
      if (isCurrent && Math.floor(this.t * 3) % 2 === 0) {
        ctx.fillStyle = "#2e6fd2";
        ctx.beginPath();
        ctx.arc(n.mx, n.my - 13, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(n.mx - 1, n.my - 13, 2, 5);
      }

      // label
      const label = unlocked ? n.label : "?????";
      const col = isCurrent ? "#2e6fd2" : unlocked ? "#21232b" : "#8a8270";
      const lx = Math.max(5, Math.min(240 - UI.textWidth(label) - 5, n.mx - UI.textWidth(label) / 2));
      UI.text(ctx, label, lx, n.my + 9, col);
    }

    // info bar
    UI.drawBox(ctx, 4, 138, 232, 20);
    let info;
    if (this.dests.length === 0) {
      info = "Explore on foot to unlock fast travel!";
    } else {
      const sel = NODES[this.dests[this.sel]];
      info = `${sel.label} - ${sel.note}   A: go   B: close`;
    }
    UI.text(ctx, info, 10, 144);

    // "you are here" tag
    UI.text(ctx, "$" + this.game.state.money, 200, 8, "#6b4a26");

    window.Dialog.draw(ctx);
  };

  window.MapScene = MapScene;
})();
