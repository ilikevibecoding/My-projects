// Turn-based battle engine: wild + trainer battles, full move effects,
// catching, exp/levels/evolution/move-learning, AI, and animations.
(function () {
  "use strict";

  const F = window.Formulas;
  const D = () => window.Dialog;

  const STRUGGLE = {
    id: -1, name: "struggle", display: "Struggle", type: "normal", class: "physical",
    power: 50, accuracy: null, pp: 1, priority: 0, target: "foe", category: "damage",
    effectChance: null, ailment: null, ailmentChance: 0, flinchChance: 0, statChance: 0,
    critRate: 0, drain: -25, healing: 0, hits: null, statChanges: [],
  };

  const STAT_NAMES = { atk: "ATTACK", def: "DEFENSE", spa: "SP. ATK", spd: "SP. DEF", spe: "SPEED", accuracy: "accuracy", evasion: "evasiveness" };

  function freshStages() {
    return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
  }
  function freshVolatile() {
    return { confusion: 0, flinch: false, recharge: false };
  }

  function BattleScene(game, config, onEnd) {
    this.game = game;
    this.config = config;
    this.onEnd = onEnd || (() => {});
    this.tweens = [];
    this.timers = [];
    this.anim = 0;
    this.done = false;

    const st = game.state;
    this.trainer = config.kind === "trainer" ? window.TRAINERS[config.trainerId] : null;
    if (this.trainer) {
      this.enemyTeam = this.trainer.party.map(([sp, lvl]) => window.Mon.create(sp, lvl));
      this.enemyIdx = 0;
      this.enemy = this.enemyTeam[0];
    } else {
      this.enemy = config.enemyMon;
      this.enemyTeam = [this.enemy];
      this.enemyIdx = 0;
    }
    this.playerIdx = st.party.findIndex((m) => m.hp > 0);
    this.player = st.party[this.playerIdx];
    this.participants = new Set([this.playerIdx]);

    this.stages = { player: freshStages(), enemy: freshStages() };
    this.volatile = { player: freshVolatile(), enemy: freshVolatile() };
    this.runAttempts = 0;

    // presentation state
    this.fx = {
      enemyX: 300, playerX: -90,         // slide-in offsets
      enemyVisible: true, playerVisible: true,
      enemyFlash: 0, playerFlash: 0,
      enemyLungeX: 0, enemyLungeY: 0, playerLungeX: 0, playerLungeY: 0,
      enemyDrop: 0, playerDrop: 0,
      ball: null, // {x,y,angle}
      dispEnemyHP: this.enemy.hp, dispPlayerHP: this.player ? this.player.hp : 0,
      dispExp: this.player ? window.Mon.expRatio(this.player) : 0,
    };
    this.menu = null; // {kind:'action'|'moves', index}
    this.fade = 1;

    AudioSys.playMusic("battle");
    window.Sprites.preload([this.enemy.species, ...st.party.map((m) => m.species)]);
    this.run().catch((e) => console.error("battle error", e));
  }

  // ---------- tiny coroutine helpers ----------
  BattleScene.prototype.wait = function (sec) {
    return new Promise((resolve) => this.timers.push({ left: sec, resolve }));
  };
  BattleScene.prototype.tween = function (sec, fn) {
    return new Promise((resolve) => this.tweens.push({ t: 0, dur: sec, fn, resolve }));
  };
  BattleScene.prototype.say = function (text) {
    return D().say(text);
  };

  BattleScene.prototype.update = function (dt) {
    this.anim += dt;
    if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);

    for (const t of [...this.timers]) {
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(this.timers.indexOf(t), 1);
        t.resolve();
      }
    }
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(p);
      if (p >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }

    // animate HP bars and exp bar toward targets
    const lerpHP = (cur, target, max) => {
      const speed = Math.max(20, max * 1.2) * dt;
      if (Math.abs(cur - target) <= speed) return target;
      return cur + Math.sign(target - cur) * speed;
    };
    this.fx.dispEnemyHP = lerpHP(this.fx.dispEnemyHP, Math.max(0, this.enemy.hp), this.enemy.stats.hp);
    if (this.player) {
      this.fx.dispPlayerHP = lerpHP(this.fx.dispPlayerHP, Math.max(0, this.player.hp), this.player.stats.hp);
      const targetExp = window.Mon.expRatio(this.player);
      this.fx.dispExp += Math.sign(targetExp - this.fx.dispExp) * Math.min(Math.abs(targetExp - this.fx.dispExp), dt * 0.8);
    }
    if (this.fx.enemyFlash > 0) this.fx.enemyFlash -= dt;
    if (this.fx.playerFlash > 0) this.fx.playerFlash -= dt;

    const Dg = D();
    if (Dg.active) {
      Dg.update();
      Dg.handleInput();
      return;
    }
    if (this.menu) this.updateMenu();
  };

  BattleScene.prototype.hpSettled = async function () {
    while (Math.abs(this.fx.dispEnemyHP - Math.max(0, this.enemy.hp)) > 0.5 ||
           (this.player && Math.abs(this.fx.dispPlayerHP - Math.max(0, this.player.hp)) > 0.5)) {
      await this.wait(0.05);
    }
  };

  // ---------- menus ----------
  BattleScene.prototype.openMenu = function (kind, options) {
    return new Promise((resolve) => {
      this.menu = { kind, options, index: 0, resolve };
    });
  };

  BattleScene.prototype.updateMenu = function () {
    const I = window.Input;
    const m = this.menu;
    if (!m) return;
    const cols = 2;
    if (m.kind === "action" || m.kind === "moves") {
      const n = m.options.length;
      if (I.pressed("up")) { m.index = (m.index + n - cols) % n; AudioSys.sfx("menu"); }
      if (I.pressed("down")) { m.index = (m.index + cols) % n; AudioSys.sfx("menu"); }
      if (I.pressed("left")) { m.index = (m.index + n - 1) % n; AudioSys.sfx("menu"); }
      if (I.pressed("right")) { m.index = (m.index + 1) % n; AudioSys.sfx("menu"); }
      if (I.pressed("a")) {
        AudioSys.sfx("confirm");
        this.menu = null;
        m.resolve(m.index);
      } else if (I.pressed("b") && m.kind === "moves") {
        AudioSys.sfx("deny");
        this.menu = null;
        m.resolve(-1);
      }
    }
  };

  // ---------- main battle coroutine ----------
  BattleScene.prototype.run = async function () {
    const st = this.game.state;
    st.pokedex.seen[this.enemy.species] = true;

    // slide-in
    this.tween(0.6, (p) => { this.fx.enemyX = Math.round(300 - 300 * p + 0 * p); });
    await this.tween(0.6, (p) => { this.fx.playerX = Math.round(-90 + 90 * p); });

    if (this.trainer) {
      await this.say(`${this.trainer.name} wants to battle!`);
      await this.say(`${this.trainer.name} sent out ${this.enemy.name}!`);
    } else {
      AudioSys.cry(this.enemy.species);
      await this.say(`Wild ${this.enemy.name} appeared!`);
    }
    AudioSys.cry(this.player.species, 0.3);
    await this.say(`Go! ${this.player.name}!`);

    // ----- turn loop -----
    while (!this.done) {
      const action = await this.chooseAction();
      if (this.done) break;

      if (action.type === "run") {
        if (await this.tryRun()) break;
        await this.enemyFreeAttack();
      } else if (action.type === "item") {
        const finished = await this.useItem(action.itemId);
        if (this.done) break;
        if (finished) await this.enemyFreeAttack();
      } else if (action.type === "switch") {
        await this.switchPlayerMon(action.index);
        await this.enemyFreeAttack();
      } else if (action.type === "move") {
        await this.fightTurn(action.move);
      }
      if (this.done) break;

      await this.endOfTurn();
    }
  };

  BattleScene.prototype.chooseAction = async function () {
    while (true) {
      const pick = await this.openMenu("action", ["FIGHT", "BAG", "PKMN", "RUN"]);
      if (pick === 0) {
        const usable = this.player.moves.filter((mv) => mv.pp > 0);
        if (usable.length === 0) {
          await this.say(`${this.player.name} has no PP left!`);
          return { type: "move", move: { ...STRUGGLE } };
        }
        const mi = await this.openMenu("moves", this.player.moves.map((mv) => mv));
        if (mi === -1) continue;
        const mv = this.player.moves[mi];
        if (mv.pp <= 0) {
          await this.say("There's no PP left for this move!");
          continue;
        }
        return { type: "move", move: mv };
      }
      if (pick === 1) {
        const itemId = await new Promise((resolve) => {
          this.game.pushScene(new window.BagScene(this.game, "battle", resolve));
        });
        if (!itemId) continue;
        return { type: "item", itemId };
      }
      if (pick === 2) {
        const idx = await new Promise((resolve) => {
          this.game.pushScene(new window.PartyScene(this.game, "battle-switch", resolve));
        });
        if (idx === null || idx < 0) continue;
        const target = this.game.state.party[idx];
        if (idx === this.playerIdx) {
          await this.say(`${target.name} is already out!`);
          continue;
        }
        if (target.hp <= 0) {
          await this.say(`${target.name} is in no shape to fight!`);
          continue;
        }
        return { type: "switch", index: idx };
      }
      if (pick === 3) {
        if (this.trainer) {
          await this.say("You can't run from a trainer battle!");
          continue;
        }
        return { type: "run" };
      }
    }
  };

  // ---------- actions ----------
  BattleScene.prototype.tryRun = async function () {
    this.runAttempts++;
    const ps = this.effectiveStat(this.player, "spe", "player");
    const es = this.effectiveStat(this.enemy, "spe", "enemy");
    let escaped = false;
    if (ps >= es) escaped = true;
    else {
      const f = ((ps * 128 / Math.max(1, es)) + 30 * this.runAttempts) % 256;
      escaped = Math.floor(Math.random() * 256) < f;
    }
    if (escaped) {
      AudioSys.sfx("confirm");
      await this.say("Got away safely!");
      this.finish(true, true);
      return true;
    }
    await this.say("Can't escape!");
    return false;
  };

  BattleScene.prototype.useItem = async function (itemId) {
    const st = this.game.state;
    const item = window.Bag.ITEMS[itemId];
    if (item.kind === "ball") {
      if (this.trainer) {
        await this.say("You can't catch another trainer's Pokémon!");
        return false;
      }
      window.Bag.remove(st, itemId, 1);
      return await this.throwBall(item);
    }
    // healing items: choose target
    const idx = await new Promise((resolve) => {
      this.game.pushScene(new window.PartyScene(this.game, "select", resolve));
    });
    if (idx === null || idx < 0) return false;
    const target = st.party[idx];
    const msg = window.Bag.useOn(st, itemId, target);
    if (!msg) {
      await this.say("It won't have any effect.");
      return false;
    }
    AudioSys.sfx("heal");
    await this.say(`${st.playerName} used the ${item.name}. ${msg}`);
    await this.hpSettled();
    return true;
  };

  BattleScene.prototype.throwBall = async function (item) {
    const st = this.game.state;
    AudioSys.sfx("ball-throw");
    await this.say(`${st.playerName} threw a ${item.name}!`);

    // ball arc
    this.fx.ball = { x: 40, y: 100, angle: 0 };
    await this.tween(0.5, (p) => {
      this.fx.ball.x = 40 + p * 130;
      this.fx.ball.y = 100 - Math.sin(p * Math.PI) * 70 - p * 40;
    });
    this.fx.enemyVisible = false;
    this.fx.ball.y = 64;

    const statusMod = this.enemy.status === "slp" || this.enemy.status === "frz" ? 2
      : this.enemy.status ? 1.5 : 1;
    const result = F.captureCheck({
      maxHp: this.enemy.stats.hp,
      hp: Math.max(1, this.enemy.hp),
      catchRate: window.Mon.species(this.enemy).catchRate,
      ballMod: item.mod,
      statusMod,
    });

    const shakes = result.caught ? 3 : Math.min(3, result.shakes);
    for (let i = 0; i < shakes; i++) {
      await this.wait(0.55);
      AudioSys.sfx("ball-shake");
      await this.tween(0.3, (p) => {
        this.fx.ball.angle = Math.sin(p * Math.PI * 2) * 0.5;
      });
      this.fx.ball.angle = 0;
    }

    if (result.caught) {
      await this.wait(0.4);
      AudioSys.sfx("ball-catch");
      await this.say(`Gotcha! ${this.enemy.name} was caught!`);
      st.pokedex.caught[this.enemy.species] = true;
      st.pokedex.seen[this.enemy.species] = true;
      if (st.party.length < 6) {
        st.party.push(this.enemy);
        await this.say(`${this.enemy.name} joined your party!`);
      } else {
        st.box = st.box || [];
        st.box.push(this.enemy);
        await this.say(`Your party is full! ${this.enemy.name} was sent to the PC BOX in the POKéMON CENTER.`);
      }
      this.finish(true, true);
      return false;
    }

    this.fx.ball = null;
    this.fx.enemyVisible = true;
    const lines = ["Oh no! The Pokémon broke free!", "Aww! It appeared to be caught!", "Aargh! Almost had it!", "Shoot! It was so close, too!"];
    await this.say(lines[Math.min(3, result.shakes)]);
    return true;
  };

  BattleScene.prototype.switchPlayerMon = async function (idx, silent) {
    const st = this.game.state;
    if (this.player && this.player.hp > 0 && !silent) {
      await this.say(`${this.player.name}, come back!`);
    }
    this.playerIdx = idx;
    this.player = st.party[idx];
    this.participants.add(idx);
    this.stages.player = freshStages();
    this.volatile.player = freshVolatile();
    this.fx.dispPlayerHP = this.player.hp;
    this.fx.dispExp = window.Mon.expRatio(this.player);
    this.fx.playerX = -90;
    this.fx.playerDrop = 0;
    AudioSys.cry(this.player.species, 0.3);
    this.tween(0.4, (p) => { this.fx.playerX = Math.round(-90 + 90 * p); });
    await this.say(`Go! ${this.player.name}!`);
  };

  BattleScene.prototype.enemyFreeAttack = async function () {
    if (this.done) return;
    const move = this.pickEnemyMove();
    await this.executeMove("enemy", move);
    await this.afterMoveFaintChecks();
  };

  // ---------- the fight turn ----------
  BattleScene.prototype.fightTurn = async function (playerMove) {
    const enemyMove = this.pickEnemyMove();
    const pm = window.MOVES[playerMove.id] || STRUGGLE;
    const em = window.MOVES[enemyMove.id] || STRUGGLE;
    const pSpeed = this.effectiveStat(this.player, "spe", "player") * (this.player.status === "par" ? 0.5 : 1);
    const eSpeed = this.effectiveStat(this.enemy, "spe", "enemy") * (this.enemy.status === "par" ? 0.5 : 1);

    let order;
    if (pm.priority !== em.priority) order = pm.priority > em.priority ? ["player", "enemy"] : ["enemy", "player"];
    else if (pSpeed !== eSpeed) order = pSpeed > eSpeed ? ["player", "enemy"] : ["enemy", "player"];
    else order = Math.random() < 0.5 ? ["player", "enemy"] : ["enemy", "player"];

    for (const side of order) {
      if (this.done) return;
      const mon = side === "player" ? this.player : this.enemy;
      if (mon.hp <= 0) continue;
      await this.executeMove(side, side === "player" ? playerMove : enemyMove);
      const fainted = await this.afterMoveFaintChecks();
      if (fainted || this.done) return;
    }
  };

  // poison/burn chip damage at the end of each full turn
  BattleScene.prototype.endOfTurn = async function () {
    if (this.done) return;
    for (const side of ["player", "enemy"]) {
      const mon = side === "player" ? this.player : this.enemy;
      if (!mon || mon.hp <= 0) continue;
      if (mon.status === "psn") {
        mon.hp = Math.max(0, mon.hp - Math.max(1, Math.floor(mon.stats.hp / 8)));
        AudioSys.sfx("hit-weak");
        await this.say(`${mon.name} is hurt by poison!`);
        await this.hpSettled();
      } else if (mon.status === "brn") {
        mon.hp = Math.max(0, mon.hp - Math.max(1, Math.floor(mon.stats.hp / 16)));
        AudioSys.sfx("hit-weak");
        await this.say(`${mon.name} is hurt by its burn!`);
        await this.hpSettled();
      }
      if (mon.hp <= 0) {
        const fainted = await this.afterMoveFaintChecks();
        if (fainted || this.done) return;
      }
    }
  };

  BattleScene.prototype.pickEnemyMove = function () {
    const usable = this.enemy.moves.filter((m) => m.pp > 0);
    if (usable.length === 0) return { ...STRUGGLE };
    if (!this.trainer) return usable[Math.floor(Math.random() * usable.length)];
    // trainer AI: weight by expected damage
    const defTypes = window.Mon.species(this.player).types;
    let best = null, bestW = -1;
    for (const mv of usable) {
      const data = window.MOVES[mv.id];
      let w = 8;
      if (data.power) {
        const eff = F.typeEffectiveness(data.type, defTypes);
        const stab = window.Mon.species(this.enemy).types.includes(data.type) ? 1.5 : 1;
        w = data.power * eff * stab;
      } else if (data.ailment && this.player.status) {
        w = 1; // don't re-status
      }
      w *= 0.7 + Math.random() * 0.6;
      if (w > bestW) { bestW = w; best = mv; }
    }
    return best;
  };

  BattleScene.prototype.effectiveStat = function (mon, stat, side) {
    return Math.max(1, Math.floor(mon.stats[stat] * F.stageMultiplier(this.stages[side][stat])));
  };

  // ---------- move execution ----------
  BattleScene.prototype.executeMove = async function (side, moveSlot) {
    const attacker = side === "player" ? this.player : this.enemy;
    const defender = side === "player" ? this.enemy : this.player;
    const defSide = side === "player" ? "enemy" : "player";
    const vol = this.volatile[side];
    const data = moveSlot.id === -1 ? STRUGGLE : window.MOVES[moveSlot.id];

    // recharge turn (Hyper Beam)
    if (vol.recharge) {
      vol.recharge = false;
      await this.say(`${attacker.name} must recharge!`);
      return;
    }

    // status that prevents moving
    if (attacker.status === "slp") {
      attacker.sleepTurns--;
      if (attacker.sleepTurns <= 0) {
        attacker.status = null;
        await this.say(`${attacker.name} woke up!`);
      } else {
        await this.say(`${attacker.name} is fast asleep.`);
        return;
      }
    }
    if (attacker.status === "frz") {
      if (Math.random() < 0.2) {
        attacker.status = null;
        await this.say(`${attacker.name} thawed out!`);
      } else {
        await this.say(`${attacker.name} is frozen solid!`);
        return;
      }
    }
    if (vol.flinch) {
      vol.flinch = false;
      await this.say(`${attacker.name} flinched and couldn't move!`);
      return;
    }
    if (attacker.status === "par" && Math.random() < 0.25) {
      await this.say(`${attacker.name} is fully paralyzed!`);
      return;
    }
    if (vol.confusion > 0) {
      vol.confusion--;
      if (vol.confusion === 0) {
        await this.say(`${attacker.name} snapped out of confusion!`);
      } else {
        await this.say(`${attacker.name} is confused!`);
        if (Math.random() < 0.33) {
          const dmg = F.damage({
            level: attacker.level, power: 40,
            attack: this.effectiveStat(attacker, "atk", side),
            defense: this.effectiveStat(attacker, "def", side),
            stab: false, typeMult: 1, isCrit: false, random: 0.85 + Math.random() * 0.15,
          });
          attacker.hp = Math.max(0, attacker.hp - dmg);
          AudioSys.sfx("hit");
          await this.say("It hurt itself in its confusion!");
          await this.hpSettled();
          return;
        }
      }
    }

    if (moveSlot.pp !== undefined && moveSlot.id !== -1) moveSlot.pp = Math.max(0, moveSlot.pp - 1);
    await this.say(`${attacker.name} used ${data.display.toUpperCase()}!`);

    // lunge animation
    const lungeKeyX = side === "player" ? "playerLungeX" : "enemyLungeX";
    const dirX = side === "player" ? 1 : -1;
    this.tween(0.25, (p) => {
      this.fx[lungeKeyX] = Math.round(Math.sin(p * Math.PI) * 10 * dirX);
    });

    // accuracy
    const defTypes = window.Mon.species(defender).types;
    const typeMult = data.power || data.category === "ailment" || data.category === "ohko"
      ? F.typeEffectiveness(data.type, defTypes) : 1;
    if (data.accuracy !== null) {
      const accMult = F.accStageMultiplier(this.stages[side].accuracy) / F.accStageMultiplier(this.stages[defSide].evasion);
      const chance = (data.accuracy / 100) * accMult;
      if (Math.random() > chance) {
        await this.say(side === "player" ? `${attacker.name}'s attack missed!` : `${attacker.name}'s attack missed!`);
        return;
      }
    }

    // OHKO moves
    if (data.category === "ohko") {
      if (typeMult === 0 || defender.level > attacker.level) {
        await this.say("It didn't affect " + defender.name + "!");
        return;
      }
      defender.hp = 0;
      AudioSys.sfx("hit-super");
      await this.say("It's a one-hit KO!");
      await this.hpSettled();
      return;
    }

    // pure status moves
    if (data.class === "status") {
      if (data.healing > 0) {
        const target = data.target === "user" ? attacker : defender;
        if (target.hp >= target.stats.hp) {
          await this.say("But it failed!");
          return;
        }
        target.hp = Math.min(target.stats.hp, target.hp + Math.floor(target.stats.hp * data.healing / 100));
        AudioSys.sfx("heal");
        await this.say(`${target.name} regained health!`);
        await this.hpSettled();
        if (data.name === "rest") {
          attacker.status = "slp";
          attacker.sleepTurns = 2;
          await this.say(`${attacker.name} fell asleep!`);
        }
        return;
      }
      if (data.ailment) {
        if (typeMult === 0) {
          await this.say(`It doesn't affect ${defender.name}!`);
          return;
        }
        const ok = await this.applyAilment(defender, defSide, data.ailment, true);
        if (!ok) await this.say("But it failed!");
        return;
      }
      if (data.statChanges.length > 0) {
        const targetSide = data.target === "user" ? side : defSide;
        const target = data.target === "user" ? attacker : defender;
        await this.applyStatChanges(target, targetSide, data.statChanges);
        return;
      }
      await this.say("But nothing happened!");
      return;
    }

    // ----- damaging move -----
    let hits = 1;
    if (data.hits) hits = data.hits[0] + Math.floor(Math.random() * (data.hits[1] - data.hits[0] + 1));
    let totalDamage = 0;
    let landed = 0;

    for (let h = 0; h < hits; h++) {
      if (defender.hp <= 0) break;
      let dmg;
      // fixed-damage specials
      if (data.name === "seismic-toss" || data.name === "night-shade") dmg = attacker.level;
      else if (data.name === "sonic-boom") dmg = 20;
      else if (data.name === "dragon-rage") dmg = 40;
      else if (data.name === "super-fang") dmg = Math.max(1, Math.floor(defender.hp / 2));
      else if (data.name === "psywave") dmg = Math.max(1, Math.floor(attacker.level * (0.5 + Math.random())));
      else {
        if (typeMult === 0) {
          await this.say(`It doesn't affect ${defender.name}!`);
          return;
        }
        if (data.name === "dream-eater" && defender.status !== "slp") {
          await this.say("But it failed!");
          return;
        }
        const isCrit = Math.random() < F.critChance(data.critRate);
        const phys = data.class === "physical";
        const atkStat = phys ? "atk" : "spa";
        const defStat = phys ? "def" : "spd";
        // crits ignore stages (gen1-style simplification)
        const atkVal = isCrit ? attacker.stats[atkStat] : this.effectiveStat(attacker, atkStat, side);
        const defVal = isCrit ? defender.stats[defStat] : this.effectiveStat(defender, defStat, defSide);
        dmg = F.damage({
          level: attacker.level,
          power: data.power || 0,
          attack: atkVal,
          defense: defVal,
          stab: window.Mon.species(attacker).types.includes(data.type),
          typeMult,
          isCrit,
          random: 0.85 + Math.random() * 0.15,
          burned: phys && attacker.status === "brn",
        });
        if (isCrit && dmg > 0) {
          this._critMsg = true;
        }
      }
      defender.hp = Math.max(0, defender.hp - dmg);
      totalDamage += dmg;
      landed++;

      // hit feedback
      const flashKey = defSide === "player" ? "playerFlash" : "enemyFlash";
      this.fx[flashKey] = 0.35;
      AudioSys.sfx(typeMult > 1 ? "hit-super" : typeMult < 1 ? "hit-weak" : "hit");
      await this.wait(0.3);
    }

    await this.hpSettled();
    if (this._critMsg) {
      this._critMsg = false;
      await this.say("A critical hit!");
    }
    if (hits > 1) await this.say(`Hit ${landed} time(s)!`);
    if (typeMult > 1) await this.say("It's super effective!");
    else if (typeMult > 0 && typeMult < 1) await this.say("It's not very effective…");

    // recoil / drain
    if (data.drain > 0 && totalDamage > 0) {
      attacker.hp = Math.min(attacker.stats.hp, attacker.hp + Math.max(1, Math.floor(totalDamage * data.drain / 100)));
      await this.say(`${defender.name} had its energy drained!`);
      await this.hpSettled();
    } else if (data.drain < 0 && totalDamage > 0) {
      attacker.hp = Math.max(0, attacker.hp - Math.max(1, Math.floor(totalDamage * -data.drain / 100)));
      await this.say(`${attacker.name} is hit with recoil!`);
      await this.hpSettled();
    }

    // self-faint moves
    if (data.name === "self-destruct" || data.name === "explosion") {
      attacker.hp = 0;
      await this.hpSettled();
    }
    // recharge moves
    if (data.name === "hyper-beam" && defender.hp > 0) {
      this.volatile[side].recharge = true;
    }

    if (defender.hp <= 0) return;

    // secondary effects
    if (data.ailment && data.ailmentChance > 0 && Math.random() * 100 < data.ailmentChance) {
      await this.applyAilment(defender, defSide, data.ailment, false);
    }
    if (data.statChanges.length > 0 && data.statChance > 0 && Math.random() * 100 < data.statChance) {
      const targetSide = data.target === "user" ? side : defSide;
      const target = data.target === "user" ? attacker : defender;
      await this.applyStatChanges(target, targetSide, data.statChanges);
    }
    if (data.flinchChance > 0 && Math.random() * 100 < data.flinchChance) {
      this.volatile[defSide].flinch = true;
    }
  };

  BattleScene.prototype.applyAilment = async function (target, targetSide, ailment, verbose) {
    const types = window.Mon.species(target).types;
    if (ailment === "confusion") {
      if (this.volatile[targetSide].confusion > 0) return false;
      this.volatile[targetSide].confusion = 2 + Math.floor(Math.random() * 3);
      await this.say(`${target.name} became confused!`);
      return true;
    }
    if (target.status) return false;
    const map = {
      poison: { st: "psn", msg: "was poisoned!", immune: ["poison", "steel"] },
      paralysis: { st: "par", msg: "is paralyzed! It may be unable to move!", immune: ["electric"] },
      burn: { st: "brn", msg: "was burned!", immune: ["fire"] },
      sleep: { st: "slp", msg: "fell asleep!", immune: [] },
      freeze: { st: "frz", msg: "was frozen solid!", immune: ["ice"] },
    };
    const def = map[ailment];
    if (!def) return false;
    if (def.immune.some((t) => types.includes(t))) return false;
    target.status = def.st;
    if (def.st === "slp") target.sleepTurns = 1 + Math.floor(Math.random() * 3);
    await this.say(`${target.name} ${def.msg}`);
    return true;
  };

  BattleScene.prototype.applyStatChanges = async function (target, targetSide, changes) {
    for (const sc of changes) {
      const cur = this.stages[targetSide][sc.stat];
      const next = Math.max(-6, Math.min(6, cur + sc.change));
      if (next === cur) {
        await this.say(`${target.name}'s ${STAT_NAMES[sc.stat]} won't go any ${sc.change > 0 ? "higher" : "lower"}!`);
        continue;
      }
      this.stages[targetSide][sc.stat] = next;
      const big = Math.abs(sc.change) >= 2 ? " sharply" : "";
      await this.say(`${target.name}'s ${STAT_NAMES[sc.stat]}${big} ${sc.change > 0 ? "rose" : "fell"}!`);
    }
  };

  // ---------- faints / win / loss ----------
  BattleScene.prototype.afterMoveFaintChecks = async function () {
    if (this.enemy.hp <= 0) {
      await this.handleEnemyFaint();
      return true;
    }
    if (this.player.hp <= 0) {
      await this.handlePlayerFaint();
      return true;
    }
    return false;
  };

  BattleScene.prototype.handleEnemyFaint = async function () {
    const st = this.game.state;
    AudioSys.sfx("faint");
    AudioSys.cry(this.enemy.species, 0.25);
    await this.tween(0.5, (p) => { this.fx.enemyDrop = Math.round(p * 70); });
    this.fx.enemyVisible = false;
    await this.say(`${this.trainer ? "Foe " : "Wild "}${this.enemy.name} fainted!`);

    // experience
    const participants = [...this.participants].filter((i) => st.party[i] && st.party[i].hp > 0);
    const spec = window.Mon.species(this.enemy);
    const gain = F.expGain(spec.baseExp, this.enemy.level, !!this.trainer, Math.max(1, participants.length));
    for (const idx of participants) {
      const mon = st.party[idx];
      AudioSys.sfx("exp");
      await this.say(`${mon.name} gained ${gain} EXP. Points!`);
      const levels = window.Mon.gainExp(mon, gain);
      for (const lvl of levels) {
        AudioSys.sfx("levelup");
        await this.say(`${mon.name} grew to level ${lvl}!`);
        await this.learnMovesAtLevel(mon, lvl);
      }
      if (levels.length > 0) {
        const evoTarget = window.Mon.pendingEvolution(mon);
        if (evoTarget) await this.runEvolution(mon, evoTarget);
      }
    }

    // next trainer mon?
    if (this.trainer && this.enemyIdx < this.enemyTeam.length - 1) {
      this.enemyIdx++;
      this.enemy = this.enemyTeam[this.enemyIdx];
      st.pokedex.seen[this.enemy.species] = true;
      this.stages.enemy = freshStages();
      this.volatile.enemy = freshVolatile();
      this.fx.dispEnemyHP = this.enemy.hp;
      this.fx.enemyVisible = true;
      this.fx.enemyDrop = 0;
      this.fx.enemyX = 300;
      AudioSys.cry(this.enemy.species);
      this.tween(0.4, (p) => { this.fx.enemyX = Math.round(300 - 300 * p); });
      await this.say(`${this.trainer.name} sent out ${this.enemy.name}!`);
      return;
    }

    // victory!
    if (this.trainer) {
      AudioSys.playMusic("victory");
      await this.say(`${this.game.state.playerName} defeated ${this.trainer.name}!`);
      await this.say(this.trainer.defeat);
      st.money += this.trainer.prize;
      await this.say(`${st.playerName} got $${this.trainer.prize} for winning!`);
      if (this.config.npcId) st.flags.trainers[this.config.npcId] = true;
    }
    this.finish(true);
  };

  BattleScene.prototype.handlePlayerFaint = async function () {
    const st = this.game.state;
    AudioSys.sfx("faint");
    await this.tween(0.5, (p) => { this.fx.playerDrop = Math.round(p * 70); });
    this.fx.playerVisible = false;
    await this.say(`${this.player.name} fainted!`);

    const healthy = st.party.findIndex((m) => m.hp > 0);
    if (healthy === -1) {
      await this.say(`${st.playerName} is out of usable Pokémon!`);
      if (this.trainer) {
        await this.say(this.trainer.victory);
      }
      // (money penalty is applied once, inside game.blackout())
      await this.say(`${st.playerName} blacked out!`);
      this.finish(false);
      return;
    }
    // force switch
    const idx = await new Promise((resolve) => {
      const pick = (i) => {
        if (i === null || i < 0 || st.party[i].hp <= 0) {
          this.game.pushScene(new window.PartyScene(this.game, "battle-switch", pick));
        } else resolve(i);
      };
      this.game.pushScene(new window.PartyScene(this.game, "battle-switch", pick));
    });
    this.fx.playerVisible = true;
    await this.switchPlayerMon(idx, true);
  };

  BattleScene.prototype.learnMovesAtLevel = async function (mon, level) {
    const newMoves = window.Mon.movesLearnedAt(mon.species, level);
    for (const moveId of newMoves) {
      if (mon.moves.some((m) => m.id === moveId)) continue;
      const data = window.MOVES[moveId];
      if (mon.moves.length < 4) {
        mon.moves.push(window.Mon.makeMove(moveId));
        await this.say(`${mon.name} learned ${data.display.toUpperCase()}!`);
      } else {
        await this.say(`${mon.name} wants to learn ${data.display.toUpperCase()}, but it already knows 4 moves!`);
        const opts = mon.moves.map((m) => window.MOVES[m.id].display).concat(["Give up"]);
        const pick = await D().ask(opts, { aboveBox: true, cancelable: false });
        if (pick >= 0 && pick < 4) {
          const old = window.MOVES[mon.moves[pick].id].display;
          mon.moves[pick] = window.Mon.makeMove(moveId);
          await this.say(`1, 2 and… poof! ${mon.name} forgot ${old.toUpperCase()} and learned ${data.display.toUpperCase()}!`);
        } else {
          await this.say(`${mon.name} did not learn ${data.display.toUpperCase()}.`);
        }
      }
    }
  };

  BattleScene.prototype.runEvolution = async function (mon, toSpecies) {
    const st = this.game.state;
    const fromName = mon.name;
    await this.say(`What? ${fromName} is evolving!`);
    this._evolving = { mon, t: 0 };
    await this.tween(1.6, (p) => { this._evolving.t = p; });
    window.Mon.evolve(mon, toSpecies);
    this._evolving = null;
    st.pokedex.seen[toSpecies] = true;
    st.pokedex.caught[toSpecies] = true;
    AudioSys.cry(toSpecies);
    AudioSys.sfx("levelup");
    await this.say(`Congratulations! Your ${fromName} evolved into ${window.POKEDEX[toSpecies].display}!`);
    if (mon === this.player) this.fx.dispPlayerHP = mon.hp;
  };

  BattleScene.prototype.finish = function (won, instant) {
    if (this.done) return;
    this.done = true;
    const game = this.game;
    const end = async () => {
      await this.wait(instant ? 0.2 : 0.8);
      AudioSys.stopMusic();
      game.popScene();
      const def = window.MAPS[game.state.map];
      if (def && def.music) AudioSys.playMusic(def.music);
      if (!won) game.blackout();
      this.onEnd(won);
    };
    end();
  };

  // ---------- drawing ----------
  BattleScene.prototype.draw = function (ctx) {
    // background
    ctx.fillStyle = "#f0f4e8";
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = "#e0ecd0";
    ctx.fillRect(0, 0, 240, 76);

    // platforms
    ctx.fillStyle = "#c8dca8";
    ctx.beginPath();
    ctx.ellipse(178, 76, 52, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(56, 116, 56, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // enemy sprite
    if (this.fx.enemyVisible) {
      const img = window.Sprites.front(this.enemy.species);
      if (window.Sprites.ready(img)) {
        const flash = this.fx.enemyFlash > 0 && Math.floor(this.anim * 20) % 2 === 0;
        if (!flash) {
          ctx.save();
          if (this.fx.enemyDrop) {
            ctx.beginPath();
            ctx.rect(0, 0, 240, 84);
            ctx.clip();
          }
          ctx.drawImage(img, 146 + this.fx.enemyX + this.fx.enemyLungeX, 12 + this.fx.enemyDrop, 64, 64);
          ctx.restore();
        }
      }
    }
    // poké ball capture animation
    if (this.fx.ball) {
      ctx.save();
      ctx.translate(this.fx.ball.x + 6, this.fx.ball.y + 6);
      ctx.rotate(this.fx.ball.angle);
      ctx.fillStyle = "#21232b";
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = "#d23b3b";
      ctx.fillRect(-5, -5, 10, 5);
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(-5, 0, 10, 5);
      ctx.fillStyle = "#21232b";
      ctx.fillRect(-5, -1, 10, 2);
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    // player back sprite
    if (this.fx.playerVisible && this.player) {
      const img = window.Sprites.back(this.player.species);
      if (window.Sprites.ready(img)) {
        const flash = this.fx.playerFlash > 0 && Math.floor(this.anim * 20) % 2 === 0;
        if (!flash) {
          ctx.save();
          if (this.fx.playerDrop) {
            ctx.beginPath();
            ctx.rect(0, 0, 240, 124);
            ctx.clip();
          }
          // evolution flash
          if (this._evolving && Math.floor(this.anim * 8) % 2 === 0 && this._evolving.mon === this.player) {
            ctx.filter = "brightness(3)";
          }
          ctx.drawImage(img, 18 + this.fx.playerX + this.fx.playerLungeX, 52 + this.fx.playerDrop, 68, 68);
          ctx.filter = "none";
          ctx.restore();
        }
      }
    }

    // enemy info box
    UI.drawBox(ctx, 4, 4, 110, 30);
    UI.text(ctx, this.enemy.name.slice(0, 11), 10, 9);
    UI.text(ctx, "L" + this.enemy.level, 86, 9);
    UI.drawHPBar(ctx, 10, 22, 86, this.fx.dispEnemyHP / this.enemy.stats.hp);
    if (this.enemy.status) UI.text(ctx, window.Mon.statusLabel(this.enemy.status), 98, 19, "#d23b3b");

    // player info box
    if (this.player) {
      UI.drawBox(ctx, 126, 76, 110, 38);
      UI.text(ctx, this.player.name.slice(0, 11), 132, 81);
      UI.text(ctx, "L" + this.player.level, 208, 81);
      UI.drawHPBar(ctx, 132, 92, 86, this.fx.dispPlayerHP / this.player.stats.hp);
      UI.text(ctx, `${Math.round(this.fx.dispPlayerHP)}/${this.player.stats.hp}`, 148, 99);
      if (this.player.status) UI.text(ctx, window.Mon.statusLabel(this.player.status), 132, 99, "#d23b3b");
      // exp bar
      ctx.fillStyle = "#21232b";
      ctx.fillRect(132, 108, 86, 3);
      ctx.fillStyle = "#48a0e8";
      ctx.fillRect(133, 109, Math.round(84 * this.fx.dispExp), 1);
    }

    // menus
    if (this.menu && this.menu.kind === "action") {
      UI.drawBox(ctx, 120, 124, 120, 36);
      this.menu.options.forEach((opt, i) => {
        const x = 134 + (i % 2) * 56;
        const y = 131 + Math.floor(i / 2) * 14;
        UI.text(ctx, opt, x, y);
        if (i === this.menu.index) UI.text(ctx, "▶", x - 9, y);
      });
      UI.drawBox(ctx, 0, 124, 120, 36);
      UI.text(ctx, "What will", 8, 131);
      UI.text(ctx, `${this.player.name.slice(0, 10)} do?`, 8, 144);
    } else if (this.menu && this.menu.kind === "moves") {
      UI.drawBox(ctx, 0, 116, 240, 44);
      this.menu.options.forEach((mv, i) => {
        const data = window.MOVES[mv.id];
        const x = 16 + (i % 2) * 116;
        const y = 124 + Math.floor(i / 2) * 16;
        UI.text(ctx, data.display.slice(0, 12), x, y, mv.pp === 0 ? "#9aa6c0" : "#21232b");
        if (i === this.menu.index) UI.text(ctx, "▶", x - 10, y);
      });
      const sel = this.menu.options[this.menu.index];
      const sd = window.MOVES[sel.id];
      UI.drawBox(ctx, 4, 88, 96, 24);
      UI.text(ctx, `${sd.type.toUpperCase().slice(0, 8)} ${sel.pp}/${sel.maxpp}`, 11, 96);
    }

    window.Dialog.draw(ctx);

    if (this.fade > 0) {
      ctx.fillStyle = `rgba(10,12,20,${this.fade})`;
      ctx.fillRect(0, 0, 240, 160);
    }
  };

  window.BattleScene = BattleScene;
})();
