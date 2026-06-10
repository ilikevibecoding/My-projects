// =============================================================
// Main: Game state machine, entity registry, combat resolution,
// match flow, fixed-step loop
// =============================================================
'use strict';

const Game = {
  state: 'loading',           // loading | menu | deploy | playing | paused | end
  playerTeam: 'coalition',
  enemyTeam: 'dominion',
  time: 0,
  frame: 0,
  timeScale: 1,
  testMode: false,
  debugMode: false,
  scene: null,
  camera: null,
  playerStats: { kills: 0, deaths: 0, captures: 0 },
  capitalShips: [],
  generators: [],
  respawnQueue: [],

  get player() { return Player.soldier; },
  get playerVehicle() { return Player.vehicle; },
};

(() => {
  let lastTime = 0;
  let fpsAcc = 0, fpsFrames = 0;
  let winCheckCooldown = 0;
  let playerDeathTimer = -1;
  let spaceBlend = 0;

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  // ---------- boot ---------------------------------------------
  function boot() {
    const params = new URLSearchParams(location.search);
    Game.testMode = params.get('test') === '1';
    Game.debugMode = params.get('debug') === '1' || Game.testMode;
    Game.timeScale = Math.min(6, Math.max(0.1, parseFloat(params.get('speed')) || 1));

    Assets.buildTextures();

    Game.scene = new THREE.Scene();
    Game.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 4200);
    Game.scene.add(Game.camera);

    const canvas = document.getElementById('game-canvas');
    Graphics.init(canvas, Game.scene, Game.camera, { preserveDrawingBuffer: Game.testMode });
    if (['high', 'medium', 'low'].includes(params.get('quality'))) {
      Graphics.applyQuality(params.get('quality'));
    }
    Graphics.buildEnvMap();
    Graphics.buildLighting();

    World.build(Game.scene);
    Effects.init(Game.scene);
    Effects.setShakeReference(Game.camera);
    Weapons.init(Game.scene);
    Soldiers.init(Game.scene);
    Capture.init(Game.scene);
    Vehicles.init(Game.scene);
    Player.init(Game.scene, Game.camera);
    HUD.init();
    HUD.bindDeployMap(document.getElementById('deploy-map'));
    buildCapitalShips();

    HUD.hideLoading();
    Game.state = 'menu';
    HUD.showMenu();

    if (Game.debugMode) document.getElementById('fps').style.display = '';

    // resume audio on any interaction
    document.addEventListener('pointerdown', () => SynthAudio.resume(), { once: true });

    if (Game.testMode) {
      Player.setAutopilot(true);
      setTimeout(() => {
        Game.startMatch('coalition');
        setTimeout(() => {
          const spawns = Capture.spawnablePosts('coalition');
          Game.deployPlayer('assault', spawns[0]);
        }, 400);
      }, 600);
    }

    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------- capital ships (orbital layer) ---------------------
  function buildCapitalShips() {
    const defs = [
      { team: 'coalition', x: -170, z: -260, rot: 0.5 },
      { team: 'dominion', x: 190, z: -240, rot: -2.4 },
    ];
    for (const d of defs) {
      const ship = Assets.buildCapitalShip();
      ship.position.set(d.x, CONFIG.space.orbitAltitude, d.z);
      ship.rotation.y = d.rot;
      Game.scene.add(ship);
      const entry = { team: d.team, model: ship, generators: [], disabled: false };
      for (const genMesh of ship.userData.generators) {
        const gen = {
          kind: 'generator', team: d.team, alive: true,
          health: 120, maxHealth: 120,
          mesh: genMesh,
          position: genMesh.getWorldPosition(new THREE.Vector3()),
          ship: entry,
          name: `${CONFIG.factions[d.team].name} shield generator`,
        };
        entry.generators.push(gen);
        Game.generators.push(gen);
      }
      Game.capitalShips.push(entry);
    }
  }

  function resetCapitalShips() {
    for (const ship of Game.capitalShips) {
      ship.disabled = false;
      for (const g of ship.generators) {
        g.alive = true;
        g.health = g.maxHealth;
        g.mesh.visible = true;
        g.mesh.material.emissiveIntensity = 2.6;
      }
    }
  }

  // ---------- match flow ------------------------------------------
  Game.startMatch = function (team) {
    Game.playerTeam = team;
    Game.enemyTeam = team === 'coalition' ? 'dominion' : 'coalition';
    Game.playerStats = { kills: 0, deaths: 0, captures: 0 };
    Game.respawnQueue.length = 0;
    playerDeathTimer = -1;

    // clear entities
    for (let i = Soldiers.all.length - 1; i >= 0; i--) Soldiers.all[i].despawn();
    Weapons.clearAll();
    Player.reset();

    Capture.startMatch();
    Vehicles.spawnAll();
    resetCapitalShips();

    // spawn bot armies
    for (const t of ['coalition', 'dominion']) {
      const homes = Capture.spawnablePosts(t);
      for (let i = 0; i < CONFIG.botsPerTeam; i++) {
        spawnBot(t, homes);
      }
    }

    Game.state = 'deploy';
    HUD.showDeploy();
    SynthAudio.setMusicLevel(0.18);
  };

  function botClass() {
    const r = Math.random();
    return r < 0.4 ? 'assault' : r < 0.6 ? 'heavy' : r < 0.8 ? 'sniper' : 'engineer';
  }

  function spawnBot(team, homesOverride) {
    const homes = homesOverride || Capture.spawnablePosts(team);
    if (!homes.length) return null;
    const p = homes[(Math.random() * homes.length) | 0];
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * p.radius * 0.6;
    return Soldiers.create(team, botClass(), p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
  }

  Game.deployPlayer = function (cls, post) {
    if (!post) return;
    Player.deploy(cls, post);
    Game.state = 'playing';
    HUD.showHUD();
    HUD.refreshAmmo();
    playerDeathTimer = -1;
    if (!Game.testMode) Player.requestLock();
  };

  Game.pause = function () {
    if (Game.state !== 'playing') return;
    Game.state = 'paused';
    HUD.showPause();
  };

  Game.resume = function () {
    if (Game.state !== 'paused') return;
    Game.state = 'playing';
    HUD.showHUD();
    Player.requestLock();
  };

  Game.backToMenu = function () {
    for (let i = Soldiers.all.length - 1; i >= 0; i--) Soldiers.all[i].despawn();
    Weapons.clearAll();
    Player.reset();
    Game.state = 'menu';
    HUD.showMenu();
    if (document.pointerLockElement) document.exitPointerLock();
    SynthAudio.setMusicLevel(0.3);
  };

  function endMatch(winner) {
    Game.state = 'end';
    Game.playerStats.kills = Game.player ? Game.player.kills : Game.playerStats.kills;
    Game.playerStats.deaths = Game.player ? Game.player.deaths : Game.playerStats.deaths;
    Game.playerStats.captures = Game.player ? Game.player.captures : Game.playerStats.captures;
    HUD.showEnd(winner);
    SynthAudio.sfx(winner === Game.playerTeam ? 'victory' : 'defeat');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- combat resolution --------------------------------------
  // distance between segment (a→b) and vertical segment (p, p+h)
  function segVertDist(ax, ay, az, bx, by, bz, px, py, pz, h) {
    // iterative sampling — robust & fast enough
    let best = 1e9;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const cy = Math.max(py, Math.min(py + h, y));
      const d = Math.sqrt((x - px) ** 2 + (y - cy) ** 2 + (z - pz) ** 2);
      if (d < best) best = d;
    }
    return best;
  }

  Game.hitTestEntities = function (from, to, owner) {
    const ownerTeam = owner ? owner.team : null;
    let best = null, bd = 1e9;
    // soldiers
    for (const s of Soldiers.all) {
      if (!s.alive || s === owner) continue;
      if (ownerTeam && s.team === ownerTeam) continue;
      // quick reject
      const dx = s.position.x - to.x, dz = s.position.z - to.z;
      if (dx * dx + dz * dz > 36) {
        const dx2 = s.position.x - from.x, dz2 = s.position.z - from.z;
        if (dx2 * dx2 + dz2 * dz2 > 36) continue;
      }
      const d = segVertDist(from.x, from.y, from.z, to.x, to.y, to.z,
        s.position.x, s.position.y, s.position.z, 1.78);
      if (d < 0.55) {
        const dist = from.distanceTo(s.position);
        if (dist < bd) { bd = dist; best = s; }
      }
    }
    // vehicles
    for (const v of Vehicles.all) {
      if (!v.alive || v === owner) continue;
      if (owner && v.occupant === owner) continue;
      const d = segVertDist(from.x, from.y, from.z, to.x, to.y, to.z,
        v.position.x, v.position.y - 1, v.position.z, 2.4);
      if (d < v.radius) {
        const dist = from.distanceTo(v.position);
        if (dist < bd) { bd = dist; best = v; }
      }
    }
    // orbital shield generators
    if (to.y > CONFIG.space.orbitAltitude - 80) {
      for (const g of Game.generators) {
        if (!g.alive) continue;
        if (ownerTeam && g.team === ownerTeam) continue;
        const d = segVertDist(from.x, from.y, from.z, to.x, to.y, to.z,
          g.position.x, g.position.y - 2, g.position.z, 4);
        if (d < 2.4) {
          const dist = from.distanceTo(g.position);
          if (dist < bd) { bd = dist; best = g; }
        }
      }
    }
    return best;
  };

  Game.damageEntity = function (ent, dmg, attacker, weapon) {
    if (!ent || ent.health == null) return;
    if (ent.kind === 'soldier') {
      if (!ent.alive) return;
      ent.health -= dmg;
      ent.lastDamageTime = Game.time;
      ent.lastAttacker = attacker;
      if (ent.isPlayer) {
        Graphics.setDamage(Math.min(0.85, 0.3 + dmg / 90));
        SynthAudio.sfx('hurt');
        Effects.addShake(0.06);
      }
      if (attacker && (attacker.isPlayer || (attacker.occupant && attacker.occupant.isPlayer))) {
        HUD.hitmarker(ent.health <= 0);
        SynthAudio.sfx(ent.health <= 0 ? 'kill' : 'hit');
      }
      if (ent.health <= 0) {
        const killer = attacker && attacker.kind === 'soldier' ? attacker
          : attacker && attacker.occupant ? attacker.occupant : attacker;
        ent.die(killer && killer.kind === 'soldier' ? killer : null);
        Capture.onSoldierDeath(ent.team);
        feedKill(killer, ent);
        if (ent.isPlayer) {
          playerDeathTimer = 2.8;
          HUD.setVehicleHud(null);
        }
      }
    } else if (ent.kind === 'generator') {
      ent.health -= dmg;
      if (attacker && (attacker.isPlayer || (attacker.occupant && attacker.occupant.isPlayer))) {
        HUD.hitmarker(ent.health <= 0);
        SynthAudio.sfx('hit');
      }
      if (ent.health <= 0 && ent.alive) {
        ent.alive = false;
        ent.mesh.visible = false;
        Effects.explosion(ent.position.clone(), 7);
        SynthAudio.sfx('explosion', ent.position);
        HUD.killfeed(`${ent.name} destroyed!`, '#ffd671');
        if (ent.ship.generators.every(g => !g.alive) && !ent.ship.disabled) {
          ent.ship.disabled = true;
          Capture.removeTickets(ent.team, CONFIG.space.capitalShipTickets);
          HUD.killfeed(
            `${CONFIG.factions[ent.team].name} capital ship disabled — ${CONFIG.space.capitalShipTickets} tickets lost!`,
            '#ffd671');
        }
      }
    } else {
      // vehicle
      if (!ent.alive) return;
      ent.health -= dmg;
      if (attacker && (attacker.isPlayer || (attacker.occupant && attacker.occupant.isPlayer)) && ent.kind !== 'soldier') {
        HUD.hitmarker(ent.health <= 0);
        SynthAudio.sfx('hit');
      }
      if (ent.health <= 0) ent.explode(attacker);
    }
  };

  function feedKill(killer, victim) {
    const vCol = CONFIG.factions[victim.team].uiColor;
    if (killer && killer.kind === 'soldier') {
      const kCol = CONFIG.factions[killer.team].uiColor;
      HUD.killfeed(
        `<span style="color:${kCol}">${killer.name}</span> ⚡ <span style="color:${vCol}">${victim.name}</span>`,
        killer.team === Game.playerTeam ? CONFIG.factions[Game.playerTeam].uiColor : '#888');
    } else {
      HUD.killfeed(`<span style="color:${vCol}">${victim.name}</span> was destroyed`, '#888');
    }
  }

  Game.applySplash = function (pos, radius, dmg, attacker) {
    for (const s of Soldiers.all) {
      if (!s.alive) continue;
      _v1.set(s.position.x, s.position.y + 1, s.position.z);
      const d = _v1.distanceTo(pos);
      if (d < radius) {
        const fall = 1 - (d / radius) * 0.75;
        Game.damageEntity(s, dmg * fall, attacker, null);
      }
    }
    for (const v of Vehicles.all) {
      if (!v.alive) continue;
      const d = v.position.distanceTo(pos);
      if (d < radius + v.radius) {
        Game.damageEntity(v, dmg * 0.7, attacker, null);
      }
    }
  };

  Game.onBotDespawned = function (s) {
    // queue a replacement if the team still has tickets
    if (Game.state !== 'playing' && Game.state !== 'deploy' && Game.state !== 'paused') return;
    if (Capture.tickets[s.team] > 2) {
      Game.respawnQueue.push({ team: s.team, t: CONFIG.respawnDelay });
    }
  };

  // ---------- loop -----------------------------------------------------
  function simActive() {
    return Game.state === 'playing' || Game.state === 'deploy';
  }

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;
    dt *= Game.timeScale;
    Game.time += dt;
    Game.frame++;

    // fps counter
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) {
      HUD.setFps(Math.round(fpsFrames / fpsAcc), Soldiers.all.length);
      fpsAcc = 0; fpsFrames = 0;
    }

    if (simActive()) {
      Soldiers.update(dt, Game.camera.position);
      Weapons.update(dt);
      Vehicles.update(dt);
      Capture.update(dt);

      // bot respawns
      for (let i = Game.respawnQueue.length - 1; i >= 0; i--) {
        const q = Game.respawnQueue[i];
        q.t -= dt;
        if (q.t <= 0) {
          Game.respawnQueue.splice(i, 1);
          if (Capture.tickets[q.team] > 2) spawnBot(q.team);
        }
      }

      // player flow
      if (Game.state === 'playing') {
        Player.update(dt);
        if (playerDeathTimer > 0) {
          playerDeathTimer -= dt;
          if (playerDeathTimer <= 0) {
            playerDeathTimer = -1;
            Game.state = 'deploy';
            HUD.showDeploy();
            if (document.pointerLockElement && !Game.testMode) document.exitPointerLock();
            if (Game.testMode) {
              const spawns = Capture.spawnablePosts(Game.playerTeam);
              if (spawns.length) Game.deployPlayer('assault', spawns[(Math.random() * spawns.length) | 0]);
            }
          }
        }
      }

      // win check
      winCheckCooldown -= dt;
      if (winCheckCooldown <= 0) {
        winCheckCooldown = 0.5;
        const w = Capture.winner();
        if (w) endMatch(w);
      }

      // ground-to-space blend
      const alt = Game.camera.position.y -
        World.getGroundHeight(Game.camera.position.x, Game.camera.position.z);
      const t = Math.max(0, Math.min(1,
        (alt - CONFIG.space.transitionStart) /
        (CONFIG.space.transitionEnd - CONFIG.space.transitionStart)));
      if (Math.abs(t - spaceBlend) > 0.003) {
        spaceBlend = t;
        World.setSpaceBlend(t);
        HUD.setSpaceBanner(t > 0.9);
      }
    } else if (Game.state === 'menu') {
      // cinematic orbit
      const t = Game.time * 0.07;
      const cx = Math.cos(t) * 95, cz = Math.sin(t) * 95 - 15;
      Game.camera.position.set(cx, World.getGroundHeight(cx, cz) + 26, cz);
      Game.camera.lookAt(0, World.getGroundHeight(0, -15) + 6, -15);
      Capture.update(dt * 0.2);   // keep holograms animating
    }

    Effects.update(dt);
    World.updateDust(dt, Game.camera.position);
    Graphics.updateShadowFollow(Game.camera.position);
    Graphics.update(dt);
    SynthAudio.setListener(Game.camera.position);
    HUD.update(dt);

    Graphics.render();
  }

  // ---------- test hooks -------------------------------------------------
  window.__TEST = {
    get state() { return Game.state; },
    get tickets() { return { ...Capture.tickets }; },
    get posts() {
      const out = {};
      for (const [id, p] of Capture.posts) out[id] = { owner: p.owner, progress: p.progress };
      return out;
    },
    get soldiers() { return Soldiers.all.length; },
    get playerAlive() { return !!(Game.player && Game.player.alive); },
    get botSnapshot() {
      return Soldiers.all.filter(s => !s.isPlayer).slice(0, 40).map(s => ({
        team: s.team[0], x: +s.position.x.toFixed(1), z: +s.position.z.toFixed(1),
        alive: s.alive,
        state: s.brain ? (s.brain.enemy ? 'fight' : s.brain.path ? `path${s.brain.pathIdx}/${s.brain.path.length}` : 'idle') : '-',
        post: s.brain && s.brain.targetPost ? s.brain.targetPost.id : '-',
      }));
    },
    get simTime() { return Game.time; },
    forceEnd(team) { endMatch(team || 'coalition'); },
    forceTickets(c, d) { Capture.tickets.coalition = c; Capture.tickets.dominion = d; },
    teleport(x, z) {
      if (Game.player) {
        const r = World.resolveCollision(x, z, 0.45, 0);
        Game.player.position.set(r.x, World.getGroundHeight(r.x, r.z), r.z);
      }
    },
  };

  window.addEventListener('DOMContentLoaded', boot);
})();
