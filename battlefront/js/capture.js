// =============================================================
// Capture: command posts, tickets, bleed, win conditions
// =============================================================
'use strict';

const Capture = (() => {
  let scene;
  const posts = new Map();   // id -> { def, state, visual }
  const tickets = { coalition: 0, dominion: 0 };
  let bleedAcc = 0;
  const NEUTRAL_COLOR = 0xcccccc;

  function init(sc) {
    scene = sc;
    for (const def of CONFIG.posts) {
      const visual = Assets.buildCommandPost();
      const y = World.getGroundHeight(def.x, def.z);
      visual.position.set(def.x, y, def.z);
      // scale glow ring to capture radius
      visual.userData.ring.scale.setScalar(def.radius);
      scene.add(visual);
      posts.set(def.id, {
        def,
        owner: def.home || null,
        progress: def.home ? 1 : 0,
        capturer: null,
        contested: false,
        visual,
        beamTimer: 0,
      });
    }
  }

  function startMatch() {
    tickets.coalition = CONFIG.tickets;
    tickets.dominion = CONFIG.tickets;
    bleedAcc = 0;
    for (const [, p] of posts) {
      p.owner = p.def.home || null;
      p.progress = p.def.home ? 1 : 0;
      p.capturer = null;
      p.contested = false;
    }
  }

  function getState(id) { return posts.get(id); }

  function ownedPosts(team) {
    let n = 0;
    for (const [, p] of posts) if (p.owner === team && p.progress >= 1) n++;
    return n;
  }

  function spawnablePosts(team) {
    const out = [];
    for (const [, p] of posts) {
      if (p.owner === team && p.progress >= 0.99) out.push(p.def);
    }
    return out;
  }

  function onSoldierDeath(team) {
    tickets[team] = Math.max(0, tickets[team] - 1);
  }

  function teamColor(team) {
    return team ? CONFIG.factions[team].color : NEUTRAL_COLOR;
  }

  function update(dt) {
    // --- post ownership ---
    for (const [, p] of posts) {
      const { def } = p;
      let coa = 0, dom = 0;
      for (const s of Soldiers.all) {
        if (!s.alive) continue;
        const d = Math.hypot(s.position.x - def.x, s.position.z - def.z);
        if (d < def.radius) {
          if (s.team === 'coalition') coa++; else dom++;
        }
      }
      p.contested = coa > 0 && dom > 0;
      const present = coa > 0 ? (dom > 0 ? null : 'coalition') : (dom > 0 ? 'dominion' : null);
      const rate = dt / CONFIG.captureTime * Math.min(3, Math.max(coa, dom));

      if (present) {
        if (p.owner === present) {
          p.progress = Math.min(1, p.progress + rate);
        } else {
          p.progress -= rate;
          p.capturer = present;
          if (p.progress <= 0) {
            const hadOwner = p.owner;
            p.progress = Math.abs(p.progress);
            p.owner = p.owner === null ? present : null;
            if (hadOwner !== null && p.owner === null) {
              HUD.killfeed(`${CONFIG.factions[present].name} neutralized ${def.name}`,
                CONFIG.factions[present].uiColor);
            } else if (p.owner === present) {
              p.progress = Math.min(1, p.progress);
              onCaptured(p, present);
            }
          }
        }
        // capture beam particles + ticks
        p.beamTimer -= dt;
        if (p.beamTimer <= 0 && p.progress < 1) {
          p.beamTimer = 0.18;
          Effects.captureBeam(
            new THREE.Vector3(def.x + (Math.random() - 0.5) * 3,
              World.getGroundHeight(def.x, def.z) + 0.4,
              def.z + (Math.random() - 0.5) * 3),
            teamColor(present));
          const playerIn = Game.player && Game.player.alive &&
            Math.hypot(Game.player.position.x - def.x, Game.player.position.z - def.z) < def.radius;
          if (playerIn) SynthAudio.sfx('captureTick');
        }
      } else if (!p.contested && p.owner !== null && p.progress < 1) {
        p.progress = Math.min(1, p.progress + dt / CONFIG.captureTime * 0.5);
      }

      // --- visuals ---
      const u = p.visual.userData;
      const col = p.progress >= 0.55 || p.owner ?
        teamColor(p.owner || p.capturer) : NEUTRAL_COLOR;
      const blend = p.contested ? (Math.sin(Game.time * 9) * 0.5 + 0.5) : 1;
      u.holoMat.color.setHex(col);
      u.holoMat.opacity = 0.32 + 0.3 * blend * (0.4 + 0.6 * p.progress);
      u.ringMat.color.setHex(col);
      u.light.color.setHex(col);
      u.light.intensity = 0.7 + 0.7 * blend;
      // animated flag wave
      const holo = u.holo;
      holo.rotation.y = Game.time * 0.7;
      const gp = holo.geometry.attributes.position;
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i);
        gp.setZ(i, Math.sin(x * 2.4 + Game.time * 3.2) * 0.09 * (x + 1.2));
      }
      gp.needsUpdate = true;
    }

    // --- ticket bleed ---
    bleedAcc += dt;
    if (bleedAcc >= 1) {
      bleedAcc -= 1;
      const c = ownedPosts('coalition'), d = ownedPosts('dominion');
      if (c > d) tickets.dominion = Math.max(0, tickets.dominion - (c - d) * CONFIG.bleedPerPostPerSec);
      if (d > c) tickets.coalition = Math.max(0, tickets.coalition - (d - c) * CONFIG.bleedPerPostPerSec);
    }
  }

  function onCaptured(p, team) {
    HUD.killfeed(`${CONFIG.factions[team].name} captured ${p.def.name}`,
      CONFIG.factions[team].uiColor);
    const isPlayerTeam = Game.player && Game.player.team === team;
    SynthAudio.sfx(isPlayerTeam ? 'captured' : 'lost');
    if (Game.player && Game.player.alive && Game.player.team === team &&
        Math.hypot(Game.player.position.x - p.def.x, Game.player.position.z - p.def.z) < p.def.radius) {
      Game.player.captures++;
    }
  }

  function winner() {
    if (tickets.coalition <= 0) return 'dominion';
    if (tickets.dominion <= 0) return 'coalition';
    return null;
  }

  function removeTickets(team, n) {
    tickets[team] = Math.max(0, tickets[team] - n);
  }

  return {
    init, startMatch, update, getState, spawnablePosts, ownedPosts,
    onSoldierDeath, winner, tickets, removeTickets, posts,
  };
})();
