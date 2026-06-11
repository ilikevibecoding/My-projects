// Overworld scene: map rendering, grid movement, NPCs, warps, encounters,
// trainer line-of-sight, and story scripts.
(function () {
  "use strict";

  const TILE = 16;
  const VIEW_W = 240, VIEW_H = 160;
  const WALK_SPEED = 4.2;  // tiles per second
  const RUN_SPEED = 7.5;

  const DIRS = {
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
  };

  function OverworldScene(game) {
    this.game = game;
    this.npcs = [];
    this.anim = 0;        // global tile animation clock
    this.fade = 0;        // 0 = none, >0 fading
    this.fadeDir = 0;
    this.banner = 0;      // map-name banner timer
    this.busy = false;    // script/cutscene lock
    this.stepParity = 0;
    this.loadMap(game.state.map, game.state.x, game.state.y, game.state.dir, true);
  }

  OverworldScene.prototype.mapDef = function () {
    return window.MAPS[this.game.state.map];
  };

  OverworldScene.prototype.loadMap = function (mapId, x, y, dir, instant) {
    const st = this.game.state;
    st.map = mapId;
    st.x = x;
    st.y = y;
    st.dir = dir || st.dir || "down";
    this.moving = null;
    this.banner = 2.2;
    const def = window.MAPS[mapId];
    this.npcs = (def.npcs || []).map((n) => ({
      ...n,
      px: n.x, py: n.y,
      homeX: n.x, homeY: n.y,
      moving: null, wanderT: 1 + Math.random() * 2,
      stepParity: 0,
    }));
    if (def.music) AudioSys.playMusic(def.music);
    if (!instant) {
      this.fadeDir = -1; // fade back in
      this.fade = 1;
    }
    // auto-save on every map change once the adventure has started
    if (st.flags && st.flags.gotStarter) this.game.autoSave();
  };

  // ---------- collision helpers ----------
  OverworldScene.prototype.tileAt = function (x, y) {
    const def = this.mapDef();
    if (y < 0 || y >= def.grid.length || x < 0 || x >= def.grid[0].length) return def.border;
    return def.grid[y][x];
  };

  OverworldScene.prototype.npcAt = function (x, y) {
    return this.npcs.find((n) => this.npcVisible(n) &&
      ((n.moving ? (n.moving.tx === x && n.moving.ty === y) : (n.x === x && n.y === y))));
  };

  OverworldScene.prototype.npcVisible = function (npc) {
    const flags = this.game.state.flags;
    if (npc.id === "rival_lab") return !flags.rivalLabDone;
    if (npc.id === "rival_city") return !!flags.badge && !flags.rivalCityDone;
    if (npc.id === "shadow_gate") return !flags.badge;     // steps aside after badge 1
    if (npc.id === "shadow_cave") return !flags.badge2;    // steps aside after badge 2
    return true;
  };

  OverworldScene.prototype.walkable = function (x, y, isPlayer) {
    const def = this.mapDef();
    if (y < 0 || y >= def.grid.length || x < 0 || x >= def.grid[0].length) return false;
    const ch = def.grid[y][x];
    if (window.Tileset.isSolid(ch) || window.Tileset.isLedge(ch)) return false;
    if (this.npcAt(x, y)) return false;
    if (isPlayer === false) {
      const st = this.game.state;
      if (st.x === x && st.y === y) return false;
      // NPCs stay off warps and grass
      if ((def.warps || []).some((w) => w.x === x && w.y === y)) return false;
      if (ch === "t") return false;
    }
    return true;
  };

  // ---------- update ----------
  OverworldScene.prototype.update = function (dt) {
    this.anim += dt;
    if (this.banner > 0) this.banner -= dt;

    const D = window.Dialog;
    if (this.fade !== 0 && this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 3;
      if (this.fadeDir > 0 && this.fade >= 1) { this.fade = 1; this.fadeDir = 0; }
      if (this.fadeDir < 0 && this.fade <= 0) { this.fade = 0; this.fadeDir = 0; }
    }

    this.updateNpcs(dt);

    if (D.active) {
      D.update();
      D.handleInput();
      return;
    }
    if (this.busy || this.fadeDir !== 0) return;

    const I = window.Input;
    const st = this.game.state;

    // continue an in-progress step
    if (this.moving) {
      this.advanceMove(dt);
      return;
    }

    if (I.pressed("start")) {
      AudioSys.sfx("confirm");
      this.game.pushScene(new window.MenuScene(this.game));
      return;
    }
    if (I.pressed("a")) {
      this.interact();
      return;
    }

    for (const dir of ["up", "down", "left", "right"]) {
      if (I.isHeld(dir)) {
        this.tryMove(dir);
        return;
      }
    }
  };

  OverworldScene.prototype.tryMove = function (dir) {
    const st = this.game.state;
    if (st.dir !== dir) {
      st.dir = dir;
      this.turnDelay = 0.08; // brief turn-in-place
      if (!this._turnT) this._turnT = 0;
    }
    const d = DIRS[dir];
    const nx = st.x + d.dx, ny = st.y + d.dy;
    const def = this.mapDef();

    // map edge transition
    if (nx < 0 || ny < 0 || nx >= def.grid[0].length || ny >= def.grid.length) {
      const edge = (def.edges || {})[dir === "up" ? "north" : dir === "down" ? "south" : dir === "left" ? "west" : "east"];
      if (edge) this.edgeTransfer(edge, dir);
      return;
    }

    // triggers that block movement (checked on target tile)
    const trig = (def.triggers || []).find((t) => t.x === nx && t.y === ny);
    if (trig && this.runBlockTrigger(trig)) return;

    const ch = def.grid[ny][nx];

    // ledge hop (only southward)
    if (window.Tileset.isLedge(ch) && dir === "down") {
      const lx = nx, ly = ny + 1;
      if (this.walkable(lx, ly, true)) {
        this.moving = { tx: lx, ty: ly, progress: 0, fromX: st.x, fromY: st.y, hop: true };
        return;
      }
    }

    if (!this.walkable(nx, ny, true)) {
      if (!this._bumpT || this._bumpT <= 0) {
        AudioSys.sfx("bump");
        this._bumpT = 0.3;
      }
      this._bumpT -= 1 / 60;
      return;
    }

    this.moving = { tx: nx, ty: ny, progress: 0, fromX: st.x, fromY: st.y, hop: false };
  };

  OverworldScene.prototype.advanceMove = function (dt) {
    const st = this.game.state;
    const m = this.moving;
    const speed = (window.Input.isHeld("b") ? RUN_SPEED : WALK_SPEED) * (m.hop ? 1.2 : 1);
    m.progress += dt * speed / (m.hop ? 2 : 1);
    if (m.progress >= 1) {
      st.x = m.tx;
      st.y = m.ty;
      this.moving = null;
      this.stepParity = 1 - this.stepParity;
      this.onStep();
    }
  };

  OverworldScene.prototype.edgeTransfer = function (edge, dir) {
    const st = this.game.state;
    const target = window.MAPS[edge.map];
    let nx = st.x + (edge.alignX || 0);
    let ny = st.y + (edge.alignY || 0);
    if (dir === "up") ny = target.grid.length - 1;
    if (dir === "down") ny = 0;
    if (dir === "left") nx = target.grid[0].length - 1;
    if (dir === "right") nx = 0;
    this.transition(() => this.loadMap(edge.map, nx, ny, dir));
  };

  OverworldScene.prototype.transition = function (fn) {
    this.busy = true;
    this.fadeDir = 1;
    this.fade = Math.max(this.fade, 0.001);
    const wait = () => {
      if (this.fade >= 1 && this.fadeDir === 0) {
        fn();
        this.busy = false;
      } else {
        requestAnimationFrame(wait);
      }
    };
    requestAnimationFrame(wait);
  };

  // after each completed step
  OverworldScene.prototype.onStep = function () {
    const st = this.game.state;
    const def = this.mapDef();

    // warps
    const warp = (def.warps || []).find((w) => w.x === st.x && w.y === st.y);
    if (warp) {
      let dest = warp.to;
      if (dest === "return") {
        // shared interiors (Center/Mart) exit back to wherever the player came in
        dest = st.returnWarp || warp.fallback;
      } else if (def.type === "outdoor" && window.MAPS[dest.map] && window.MAPS[dest.map].type === "indoor") {
        // remember the tile just outside this door for "return" exits
        st.returnWarp = { map: st.map, x: warp.x, y: warp.y + 1, dir: "down" };
      }
      this.transition(() => this.loadMap(dest.map, dest.x, dest.y, dest.dir));
      return;
    }

    // poison damage while walking (every 4 steps)
    this._psnSteps = (this._psnSteps || 0) + 1;
    if (this._psnSteps % 4 === 0) {
      for (const mon of st.party) {
        if (mon.status === "psn" && mon.hp > 1) mon.hp = Math.max(1, mon.hp - 1);
      }
    }

    // tall grass encounters
    const ch = this.tileAt(st.x, st.y);
    if (ch === "t" && def.encounters) {
      const table = window.ENCOUNTERS[def.encounters];
      if (table && Math.random() < table.rate && st.party.some((m) => m.hp > 0)) {
        this.startWildBattle(table);
        return;
      }
    }

    // trainer line of sight
    this.checkTrainerSight();
  };

  OverworldScene.prototype.startWildBattle = function (table) {
    const total = table.slots.reduce((s, x) => s + x.weight, 0);
    let roll = Math.random() * total;
    let slot = table.slots[0];
    for (const s of table.slots) {
      roll -= s.weight;
      if (roll <= 0) { slot = s; break; }
    }
    const level = slot.min + Math.floor(Math.random() * (slot.max - slot.min + 1));
    const wild = window.Mon.create(slot.id, level);
    this.busy = true;
    this.game.startBattle({ kind: "wild", enemyMon: wild }, () => {
      this.busy = false;
    });
  };

  // ---------- trainers ----------
  OverworldScene.prototype.checkTrainerSight = function () {
    const st = this.game.state;
    for (const npc of this.npcs) {
      // trainers only auto-engage if they have an explicit sight range
      if (!npc.trainer || !npc.sight || st.flags.trainers[npc.id] || !this.npcVisible(npc)) continue;
      const d = DIRS[npc.dir];
      for (let i = 1; i <= npc.sight; i++) {
        const cx = npc.x + d.dx * i, cy = npc.y + d.dy * i;
        const ch = this.tileAt(cx, cy);
        if (window.Tileset.isSolid(ch)) break;
        if (st.x === cx && st.y === cy) {
          this.engageTrainer(npc);
          return;
        }
        if (this.npcAt(cx, cy)) break;
      }
    }
  };

  OverworldScene.prototype.engageTrainer = async function (npc) {
    const st = this.game.state;
    this.busy = true;
    npc.alert = 0.7;
    AudioSys.sfx("confirm");
    await new Promise((r) => setTimeout(r, 700));
    npc.alert = 0;
    // walk trainer up to the player
    const d = DIRS[npc.dir];
    while (Math.abs(npc.x - st.x) + Math.abs(npc.y - st.y) > 1) {
      npc.x += d.dx;
      npc.y += d.dy;
      npc.stepParity = 1 - npc.stepParity;
      await new Promise((r) => setTimeout(r, 220));
    }
    // face each other
    st.dir = { up: "down", down: "up", left: "right", right: "left" }[npc.dir];
    const t = window.TRAINERS[npc.trainer];
    await window.Dialog.say(t.intro);
    this.game.startBattle({ kind: "trainer", trainerId: npc.trainer, npcId: npc.id }, (won) => {
      this.busy = false;
    });
  };

  // ---------- interaction ----------
  OverworldScene.prototype.facingTile = function () {
    const st = this.game.state;
    const d = DIRS[st.dir];
    return { x: st.x + d.dx, y: st.y + d.dy };
  };

  OverworldScene.prototype.interact = async function () {
    const st = this.game.state;
    const def = this.mapDef();
    let { x, y } = this.facingTile();
    let npc = this.npcAt(x, y);
    // talk across a counter
    if (!npc && this.tileAt(x, y) === "c") {
      const d = DIRS[st.dir];
      npc = this.npcAt(x + d.dx, y + d.dy);
    }
    if (npc) {
      // face the player
      npc.dir = { up: "down", down: "up", left: "right", right: "left" }[st.dir];
      this.busy = true;
      try {
        if (npc.script && SCRIPTS[npc.script]) {
          await SCRIPTS[npc.script](this.game, this, npc);
        } else if (npc.trainer) {
          const t = window.TRAINERS[npc.trainer];
          if (st.flags.trainers[npc.id]) {
            await window.Dialog.say(t.defeat);
          } else {
            await window.Dialog.say(t.intro);
            this.game.startBattle({ kind: "trainer", trainerId: npc.trainer, npcId: npc.id }, () => {});
          }
        } else if (npc.dialog) {
          for (const line of npc.dialog) await window.Dialog.say(line);
        }
      } finally {
        this.busy = false;
      }
      return;
    }
    const sign = (def.signs || []).find((s) => s.x === x && s.y === y);
    if (sign) {
      await window.Dialog.say(sign.text);
      return;
    }
    const ch = this.tileAt(x, y);
    if (ch === "C") {
      this.busy = true;
      try {
        await this.usePC();
      } finally {
        this.busy = false;
      }
    } else if (ch === "V") {
      await window.Dialog.say("There's a movie on TV. Four boys are walking on railroad tracks… Better get going!");
    } else if (ch === "B") {
      await window.Dialog.say("Crammed full of Pokémon books!");
    } else if (ch === "L") {
      await window.Dialog.say("Complicated machines! Lights are blinking importantly.");
    } else if (ch === "H") {
      await window.Dialog.say("It's the Pokémon healing machine. The nurse operates it with care.");
    } else if (ch === "w") {
      await window.Dialog.say("The water is sparkling clean.");
    }
  };

  // ---------- PC box ----------
  OverworldScene.prototype.usePC = async function () {
    const D = window.Dialog;
    const st = this.game.state;
    st.box = st.box || [];
    await D.say(`${st.playerName} booted up the PC.`);
    while (true) {
      const pick = await D.ask(["WITHDRAW", "DEPOSIT", "LOG OFF"], { cancelable: true, aboveBox: true });
      if (pick === 0) {
        if (st.box.length === 0) {
          await D.say("The BOX is empty.");
          continue;
        }
        const names = st.box.slice(0, 8).map((m) => `${m.name} L${m.level}`).concat(["Cancel"]);
        const w = await D.ask(names, { cancelable: true, aboveBox: true });
        if (w < 0 || w >= Math.min(8, st.box.length)) continue;
        if (st.party.length >= 6) {
          await D.say("Your party is full!");
          continue;
        }
        const mon = st.box.splice(w, 1)[0];
        st.party.push(mon);
        AudioSys.sfx("confirm");
        await D.say(`${mon.name} was withdrawn from the BOX!`);
      } else if (pick === 1) {
        if (st.party.length <= 1) {
          await D.say("You can't deposit your last Pokémon!");
          continue;
        }
        const idx = await new Promise((resolve) => {
          this.game.pushScene(new window.PartyScene(this.game, "select", resolve));
        });
        if (idx === null || idx < 0) continue;
        const mon = st.party.splice(idx, 1)[0];
        st.box.push(mon);
        AudioSys.sfx("confirm");
        await D.say(`${mon.name} was sent to the BOX.`);
      } else {
        break;
      }
    }
  };

  // blocking triggers; returns true if movement was blocked
  OverworldScene.prototype.runBlockTrigger = function (trig) {
    const st = this.game.state;
    const block = (text) => {
      this.busy = true;
      window.Dialog.say(text).then(() => { this.busy = false; });
      return true;
    };
    if (trig.script === "needStarter" && !st.flags.gotStarter) {
      return block("PROF. CEDAR: Hey! Wait! It's dangerous to go out in the tall grass without a Pokémon! Come to my lab first!");
    }
    if (trig.script === "route3Gate" && !st.flags.badge) {
      return block("GRUNT: Road's closed, squirt. Team Shadow business! …Unless you've got a GYM BADGE, beat it!");
    }
    if (trig.script === "tunnelGate" && !st.flags.badge2) {
      return block("GRUNT: GRANITE TUNNEL is Team Shadow turf! No entry! …What, you want the CASCADE BADGE first? Ha!");
    }
    if (trig.script === "hallGate" && !(st.flags.badge && st.flags.badge2)) {
      return block("GUARD: VICTORY HALL is for proven trainers only. Show me BOTH badges — BOULDER and CASCADE!");
    }
    return false;
  };

  // ---------- NPC movement ----------
  OverworldScene.prototype.updateNpcs = function (dt) {
    for (const npc of this.npcs) {
      if (npc.moving) {
        npc.moving.progress += dt * 2.6;
        if (npc.moving.progress >= 1) {
          npc.x = npc.moving.tx;
          npc.y = npc.moving.ty;
          npc.moving = null;
          npc.stepParity = 1 - npc.stepParity;
        }
        continue;
      }
      if (npc.movement !== "wander" || this.busy || window.Dialog.active) continue;
      npc.wanderT -= dt;
      if (npc.wanderT <= 0) {
        npc.wanderT = 1.2 + Math.random() * 2.5;
        const dirs = Object.keys(DIRS);
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        npc.dir = dir;
        const d = DIRS[dir];
        const nx = npc.x + d.dx, ny = npc.y + d.dy;
        if (Math.abs(nx - npc.homeX) <= 2 && Math.abs(ny - npc.homeY) <= 2 && this.walkable(nx, ny, false)) {
          npc.moving = { tx: nx, ty: ny, progress: 0, fromX: npc.x, fromY: npc.y };
        }
      }
    }
  };

  // ---------- draw ----------
  OverworldScene.prototype.draw = function (ctx) {
    const st = this.game.state;
    const def = this.mapDef();
    const T = window.Tileset;
    const frame = Math.floor(this.anim * 2) % 2;

    // camera (pixel-space), centered on the player's interpolated position
    const ppx = this.playerPixelX(), ppy = this.playerPixelY();
    let camX = Math.round(ppx + 8 - VIEW_W / 2);
    let camY = Math.round(ppy + 8 - VIEW_H / 2);
    const mapW = def.grid[0].length * TILE, mapH = def.grid.length * TILE;
    if (mapW <= VIEW_W) camX = Math.round((mapW - VIEW_W) / 2);
    else camX = Math.max(0, Math.min(mapW - VIEW_W, camX));
    if (mapH <= VIEW_H) camY = Math.round((mapH - VIEW_H) / 2);
    else camY = Math.max(0, Math.min(mapH - VIEW_H, camY));

    const x0 = Math.floor(camX / TILE) - 1, y0 = Math.floor(camY / TILE) - 1;
    const x1 = Math.ceil((camX + VIEW_W) / TILE) + 1, y1 = Math.ceil((camY + VIEW_H) / TILE) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = this.tileAt(tx, ty);
        T.draw(ctx, ch, tx * TILE - camX, ty * TILE - camY, frame);
      }
    }

    // entities sorted by y
    const ents = [];
    for (const npc of this.npcs) {
      if (!this.npcVisible(npc)) continue;
      ents.push({
        y: this.npcPixelY(npc),
        draw: () => {
          const nx = this.npcPixelX(npc) - camX, ny = this.npcPixelY(npc) - camY;
          const f = npc.moving ? (npc.moving.progress < 0.5 ? 1 + npc.stepParity % (npc.dir === "left" || npc.dir === "right" ? 1 : 2) : 0) : 0;
          window.CharSprites.draw(ctx, npc.variant, npc.dir, f, nx, ny - 2);
          if (npc.alert) {
            UI.drawBox(ctx, nx + 2, ny - 16, 12, 13);
            UI.text(ctx, "!", nx + 5, ny - 13);
          }
        },
      });
    }
    ents.push({
      y: ppy,
      draw: () => {
        let f = 0;
        if (this.moving) {
          const phase = this.moving.progress < 0.5;
          if (st.dir === "left" || st.dir === "right") f = phase ? 1 : 0;
          else f = phase ? 1 + this.stepParity : 0;
        }
        window.CharSprites.draw(ctx, "player", st.dir, f, ppx - camX, ppy - camY - 2 - (this.moving && this.moving.hop ? Math.round(Math.sin(this.moving.progress * Math.PI) * 6) : 0));
      },
    });
    ents.sort((a, b) => a.y - b.y);
    ents.forEach((e) => e.draw());

    // map name banner
    if (this.banner > 0 && this.fade <= 0) {
      const w = UI.textWidth(def.name) + 14;
      UI.drawBox(ctx, 4, 4, w, 18);
      UI.text(ctx, def.name, 11, 9);
    }

    window.Dialog.draw(ctx);

    if (this.fade > 0) {
      ctx.fillStyle = `rgba(10,12,20,${Math.min(1, this.fade)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  };

  OverworldScene.prototype.playerPixelX = function () {
    const st = this.game.state;
    if (!this.moving) return st.x * TILE;
    return Math.round((this.moving.fromX + (this.moving.tx - this.moving.fromX) * this.moving.progress) * TILE);
  };
  OverworldScene.prototype.playerPixelY = function () {
    const st = this.game.state;
    if (!this.moving) return st.y * TILE;
    return Math.round((this.moving.fromY + (this.moving.ty - this.moving.fromY) * this.moving.progress) * TILE);
  };
  OverworldScene.prototype.npcPixelX = function (npc) {
    if (!npc.moving) return npc.x * TILE;
    return Math.round((npc.moving.fromX + (npc.moving.tx - npc.moving.fromX) * npc.moving.progress) * TILE);
  };
  OverworldScene.prototype.npcPixelY = function (npc) {
    if (!npc.moving) return npc.y * TILE;
    return Math.round((npc.moving.fromY + (npc.moving.ty - npc.moving.fromY) * npc.moving.progress) * TILE);
  };

  // ---------- story scripts ----------
  const SCRIPTS = {
    async mom(game) {
      const D = window.Dialog;
      const st = game.state;
      if (!st.flags.gotStarter) {
        await D.say("MOM: Right. All boys leave home some day. It said so on TV.");
        await D.say("MOM: PROF. CEDAR, next door, is looking for you!");
      } else {
        await D.say("MOM: You look tired. Let me heal your Pokémon.");
        st.party.forEach((m) => window.Mon.fullHeal(m));
        AudioSys.sfx("heal");
        game.autoSave();
        await D.say("MOM: There! All better. Take care out there!");
      }
    },

    async professor(game, scene, npc) {
      const D = window.Dialog;
      const st = game.state;
      if (st.flags.gotStarter) {
        if (st.flags.badge) {
          await D.say("CEDAR: The BOULDER BADGE! Outstanding! You and your Pokémon make a great team.");
        } else {
          await D.say("CEDAR: How's your Pokémon coming along? Raise it well, and challenge the VERDANT GYM up north!");
        }
        return;
      }
      await D.say("CEDAR: Welcome! I'm PROF. CEDAR, and I study Pokémon.");
      await D.say("CEDAR: When I was young, I was a serious trainer. Now I only have these three Pokémon left…");
      await D.say("CEDAR: You can have one! Choose wisely — it will be your partner for the whole journey.");
      const starters = [1, 4, 7]; // Bulbasaur, Charmander, Squirtle
      let pick = -1;
      while (pick < 0) {
        pick = await D.ask(["BULBASAUR", "CHARMANDER", "SQUIRTLE"], { cancelable: false, aboveBox: true });
        const sp = window.POKEDEX[starters[pick]];
        await D.say(`CEDAR: ${sp.display.toUpperCase()}, the ${sp.genus}! ${sp.flavor}`);
        const sure = await D.ask(["Take it!", "Think again"], { cancelable: false, aboveBox: true });
        if (sure !== 0) pick = -1;
      }
      const starterId = starters[pick];
      const mon = window.Mon.create(starterId, 8);
      st.party.push(mon);
      st.starterId = starterId;
      st.flags.gotStarter = true;
      st.pokedex.seen[starterId] = true;
      st.pokedex.caught[starterId] = true;
      AudioSys.cry(starterId);
      AudioSys.sfx("levelup");
      game.autoSave();
      await D.say(`${st.playerName} received ${mon.name}!`);
      window.Bag.add(st, "pokeball", 5);
      window.Bag.add(st, "potion", 5);
      await D.say("CEDAR: Take these POKé BALLS and POTIONS too. Catch more Pokémon in the tall grass to build your team!");

      // rival ambush
      const rival = scene.npcs.find((n) => n.id === "rival_lab");
      if (rival) {
        const rivalStarter = { 1: 4, 4: 7, 7: 1 }[starterId]; // type advantage vs player
        await D.say(`${st.rivalName}: Gramps, what about me?!`);
        await D.say(`CEDAR: Patience, ${st.rivalName}. You can have the last one.`);
        await D.say(`${st.rivalName}: Fine! This one looks way stronger anyway!`);
        const t = window.TRAINERS.rival_1;
        t.party = [[rivalStarter, 7]];
        await D.say(t.intro);
        game.startBattle({ kind: "trainer", trainerId: "rival_1", npcId: "rival_lab" }, async () => {
          st.flags.rivalLabDone = true;
          await D.say(`${st.rivalName}: My Pokémon just needs more training! I'm outta here. Smell ya later!`);
        });
      }
    },

    async rival_lab(game, scene, npc) {
      await window.Dialog.say(`${game.state.rivalName}: Back off! Gramps promised ME a Pokémon too!`);
    },

    async nurse(game) {
      const D = window.Dialog;
      const st = game.state;
      await D.say("NURSE: Welcome to the Pokémon Center! Shall I restore your Pokémon to full health?");
      const yes = await D.ask(["Yes please", "No thanks"], { cancelable: false, aboveBox: true });
      if (yes === 0) {
        st.party.forEach((m) => window.Mon.fullHeal(m));
        st.lastHeal = { map: "center", x: 6, y: 5, dir: "down", returnWarp: st.returnWarp || null };
        AudioSys.sfx("heal");
        game.autoSave();
        await D.say("NURSE: …… …… Ding! Your Pokémon are fighting fit! We hope to see you again!");
      } else {
        await D.say("NURSE: Do come back any time!");
      }
    },

    async clerk(game) {
      await new Promise((resolve) => {
        game.pushScene(new window.ShopScene(game, resolve));
      });
    },

    async gymleader(game, scene, npc) {
      const D = window.Dialog;
      const st = game.state;
      if (st.flags.badge) {
        await D.say("FLINT: With that badge, no wild Pokémon will doubt you. Go see what's beyond ROUTE 2!");
        return;
      }
      const t = window.TRAINERS.gymleader;
      await D.say(t.intro);
      game.startBattle({ kind: "trainer", trainerId: "gymleader", npcId: "gymleader", isGym: true }, async (won) => {
        if (won) {
          st.flags.badge = true;
          AudioSys.sfx("badge");
          await D.say(`${st.playerName} received the BOULDER BADGE!`);
          await D.say("FLINT: That badge proves your skill. Your Pokémon's attack power grows with your confidence!");
          await D.say("FLINT: You've beaten the VERDANT GYM — you're a true Pokémon trainer now. Congratulations, champ!");
        }
      });
    },

    async shadow_gate(game) {
      await window.Dialog.say("GRUNT: Team Shadow is expanding east! No badge, no passage — boss's orders!");
    },

    async shadow_cave(game) {
      await window.Dialog.say("GRUNT: The tunnel's ours! Only show-offs with the CASCADE BADGE would dare push past me!");
    },

    async tunnel_kid(game) {
      const D = window.Dialog;
      const st = game.state;
      if (st.flags.trainers.t_tun_grunt1 && st.flags.trainers.t_tun_grunt2) {
        if (!st.flags.tunnelCleared) {
          st.flags.tunnelCleared = true;
          window.Bag.add(st, "ultraball", 3);
          AudioSys.sfx("levelup");
          game.autoSave();
          await D.say("KID: You beat Team Shadow! They gave my POKéMON back! Take these — you've earned them!");
          await D.say(`${st.playerName} received 3 ULTRA BALLS!`);
        } else {
          await D.say("KID: Thank you again! VICTORY HALL is past the north exit. Good luck!");
        }
      } else {
        await D.say("KID: *sniff* Team Shadow took my POKéMON… Those two grunts over there have it! Please help!");
      }
    },

    async gym2leader(game, scene, npc) {
      const D = window.Dialog;
      const st = game.state;
      if (st.flags.badge2) {
        await D.say("MARINA: With BOULDER and CASCADE badges, you're ready for VICTORY HALL, up past GRANITE TUNNEL!");
        return;
      }
      const t = window.TRAINERS.gym2leader;
      await D.say(t.intro);
      game.startBattle({ kind: "trainer", trainerId: "gym2leader", npcId: "gym2leader", isGym: true }, async (won) => {
        if (won) {
          st.flags.badge2 = true;
          AudioSys.sfx("badge");
          game.autoSave();
          await D.say(`${st.playerName} received the CASCADE BADGE!`);
          await D.say("MARINA: The road north is open now. GRANITE TUNNEL leads to SUMMIT VILLAGE — and VICTORY HALL.");
        }
      });
    },

    async rest_healer(game) {
      const D = window.Dialog;
      const st = game.state;
      await D.say("HEALER: Weary trainers rest here before the final climb. Let me heal your team.");
      st.party.forEach((m) => window.Mon.fullHeal(m));
      st.lastHeal = { map: "resthouse", x: 4, y: 4, dir: "down" };
      AudioSys.sfx("heal");
      game.autoSave();
      await D.say("HEALER: There. Go show VICTORY HALL what you're made of!");
    },

    async hall_guard(game) {
      const st = game.state;
      if (st.flags.badge && st.flags.badge2) {
        await window.Dialog.say("GUARD: BOULDER and CASCADE… both badges! Go on in, challenger. The CHAMPION awaits.");
      } else {
        await window.Dialog.say("GUARD: VICTORY HALL is for trainers holding BOTH badges. No exceptions.");
      }
    },

    async champion(game, scene, npc) {
      const D = window.Dialog;
      const st = game.state;
      if (st.flags.champion) {
        await D.say(`${st.rivalName}: Yeah yeah, you're the CHAMPION… for now. I'm already training for the rematch!`);
        return;
      }
      const counterFinal = { 1: 6, 4: 9, 7: 3 }[st.starterId || 1]; // fully evolved counter to your starter
      const t = window.TRAINERS.rival_final;
      t.party = [[18, 24], [143, 23], [counterFinal, 26]]; // Pidgeot, Snorlax, final-evo counter
      await D.say(t.intro);
      game.startBattle({ kind: "trainer", trainerId: "rival_final", npcId: "champion" }, async (won) => {
        if (won) {
          st.flags.champion = true;
          AudioSys.sfx("badge");
          game.autoSave();
          await D.say(`${st.playerName} defeated the CHAMPION!`);
          await D.say("Your name has been etched into VICTORY HALL's history. You are the new CHAMPION!");
          game.pushScene(new window.CreditsScene(game));
        }
      });
    },

    async rival_city(game, scene, npc) {
      const D = window.Dialog;
      const st = game.state;
      const t = window.TRAINERS.rival_2;
      const starter = st.starterId || 1;
      const rivalStarter = { 1: 4, 4: 7, 7: 1 }[starter];
      const evolved = window.POKEDEX[rivalStarter].evolutions[0];
      t.party = [[16, 11], [rivalStarter, 13]];
      await D.say(`${st.rivalName}: Heard you took the badge… I got one ages ago! Let's settle who's better!`);
      game.startBattle({ kind: "trainer", trainerId: "rival_2", npcId: "rival_city" }, async (won) => {
        if (won) {
          st.flags.rivalCityDone = true;
          await D.say(`${st.rivalName}: Whatever! I'm off to find rare Pokémon. You just got lucky! Smell ya later!`);
        }
      });
    },
  };

  window.OverworldScene = OverworldScene;
})();
