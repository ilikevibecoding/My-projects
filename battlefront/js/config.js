// =============================================================
// Galactic Battlefront — configuration & tunables
// =============================================================
'use strict';

const CONFIG = {
  // --- Match -------------------------------------------------
  tickets: 200,
  bleedPerPostPerSec: 0.55,   // ticket bleed per second per post below majority
  botsPerTeam: 16,
  respawnDelay: 3.0,

  // --- World -------------------------------------------------
  world: {
    size: 420,                // playable square, metres
    heightScale: 14,
    seed: 1977,
    fogColor: 0xc7a06a,
    fogNear: 90,
    fogFar: 520,
  },

  // --- Factions ----------------------------------------------
  factions: {
    coalition: {
      key: 'coalition',
      name: 'COALITION',
      color: 0xff8c3a,
      uiColor: '#ff8c3a',
      boltColor: 0xff3324,
      armor: 0xb8a37e,        // tan armour
      accent: 0x7a3b15,
    },
    dominion: {
      key: 'dominion',
      name: 'DOMINION',
      color: 0x4fc3ff,
      uiColor: '#4fc3ff',
      boltColor: 0x2bd84f,
      armor: 0xe8eaee,        // white armour
      accent: 0x23272e,
    },
  },

  // --- Classes -----------------------------------------------
  classes: {
    assault: {
      key: 'assault', name: 'Assault', icon: '\u2694',
      desc: 'Blaster rifle \u00b7 thermal grenades',
      health: 100, speed: 7.2, weapon: 'rifle', grenades: 3,
      pauldron: 0xd24a2f,
    },
    heavy: {
      key: 'heavy', name: 'Heavy', icon: '\u2756',
      desc: 'Rocket launcher \u00b7 extra armour',
      health: 150, speed: 5.8, weapon: 'rocket', grenades: 1,
      pauldron: 0x3c66d6,
    },
    sniper: {
      key: 'sniper', name: 'Sniper', icon: '\u25CE',
      desc: 'Charged precision rifle \u00b7 zoom',
      health: 80, speed: 6.8, weapon: 'sniper', grenades: 1,
      pauldron: 0x42a85f,
    },
    engineer: {
      key: 'engineer', name: 'Engineer', icon: '\u2699',
      desc: 'Scatter blaster \u00b7 repair pulse',
      health: 100, speed: 6.9, weapon: 'scatter', grenades: 2,
      pauldron: 0xc9a83c,
    },
  },

  // --- Weapons -----------------------------------------------
  weapons: {
    rifle: {
      name: 'E-22 Blaster Rifle', damage: 26, speed: 95, rof: 7.5,
      spread: 0.012, clip: 30, reload: 1.6, range: 220,
      boltLen: 2.6, boltRadius: 0.06, auto: true, sfx: 'blaster',
    },
    rocket: {
      name: 'PLX Rocket Launcher', damage: 42, splash: 90, splashRadius: 7, speed: 42,
      rof: 0.75, spread: 0.004, clip: 1, reload: 2.6, range: 300,
      boltLen: 1.2, boltRadius: 0.16, auto: false, sfx: 'rocket', explosive: true,
    },
    sniper: {
      name: 'LR-7 Precision Rifle', damage: 95, speed: 240, rof: 0.9,
      spread: 0.0012, clip: 5, reload: 2.2, range: 480,
      boltLen: 5.0, boltRadius: 0.05, auto: false, sfx: 'sniper', zoom: 3.2,
    },
    scatter: {
      name: 'CR-9 Scatter Blaster', damage: 13, pellets: 6, speed: 70, rof: 1.6,
      spread: 0.062, clip: 8, reload: 2.0, range: 90,
      boltLen: 1.4, boltRadius: 0.055, auto: false, sfx: 'scatter',
    },
    speederGun: {
      name: 'Speeder Cannons', damage: 22, speed: 130, rof: 9,
      spread: 0.02, clip: Infinity, reload: 0, range: 260,
      boltLen: 3.2, boltRadius: 0.08, auto: true, sfx: 'heavyBlaster',
    },
    turretGun: {
      name: 'E-Web Turret', damage: 30, speed: 120, rof: 6.5,
      spread: 0.016, clip: Infinity, reload: 0, range: 300,
      boltLen: 3.4, boltRadius: 0.1, auto: true, sfx: 'heavyBlaster',
    },
    fighterGun: {
      name: 'Laser Cannons', damage: 38, speed: 220, rof: 8,
      spread: 0.012, clip: Infinity, reload: 0, range: 600,
      boltLen: 6.0, boltRadius: 0.14, auto: true, sfx: 'heavyBlaster',
    },
  },

  grenade: {
    damage: 110, radius: 7.5, fuse: 2.4, throwSpeed: 17,
  },

  // --- Command posts (x, z in world units; world is centred on 0) ---
  posts: [
    { id: 'A', name: 'Coalition Base', x: -165, z: -150, home: 'coalition', radius: 16 },
    { id: 'B', name: 'Vaporator Farm', x: -95,  z: 60,   home: null, radius: 14 },
    { id: 'C', name: 'Central Compound', x: 0,  z: -15,  home: null, radius: 15 },
    { id: 'D', name: 'Crash Site', x: 105, z: 75,   home: null, radius: 14 },
    { id: 'E', name: 'Dominion Base', x: 170, z: -140, home: 'dominion', radius: 16 },
  ],
  captureTime: 7.0,           // seconds alone in radius to fully flip

  // --- Player ------------------------------------------------
  player: {
    eyeHeight: 1.62,
    radius: 0.45,
    gravity: 22,
    jumpSpeed: 7.6,
    sprintMult: 1.45,
    regenDelay: 4.5,
    regenRate: 18,
  },

  // --- Vehicles ----------------------------------------------
  speeder: {
    health: 160, accel: 26, maxSpeed: 34, boostSpeed: 46,
    turnRate: 1.9, hoverHeight: 1.35, seatHeight: 1.0,
  },
  turret: { health: 220 },

  // --- Space layer (ground-to-space) -------------------------
  space: {
    transitionStart: 120,     // altitude where sky starts fading to space
    transitionEnd: 260,       // fully in space
    orbitAltitude: 330,
    capitalShipTickets: 50,   // enemy ticket loss when all generators die
  },
  fighter: {
    health: 280, minSpeed: 22, maxSpeed: 95, boostSpeed: 130,
    accel: 30, pitchRate: 1.45, rollRate: 2.6, yawRate: 0.55,
  },

  // --- Bots --------------------------------------------------
  bot: {
    thinkInterval: 0.22,      // seconds between AI decisions
    viewRange: 130,
    fireRange: 95,
    aimError: 0.055,          // radians of aim slop
    strafePeriod: 1.4,
    farUpdateDist: 180,       // beyond this, bots tick less often
  },

  // --- Graphics quality presets -------------------------------
  quality: {
    high:   { shadow: 2048, shadows: true, pixelRatio: 1.5,  bloom: true, particles: 1.0, fxaa: true, dust: 360 },
    medium: { shadow: 1536, shadows: true, pixelRatio: 1.25, bloom: true, particles: 0.7, fxaa: true, dust: 220 },
    low:    { shadow: 1024, shadows: false, pixelRatio: 1,   bloom: false, particles: 0.4, fxaa: false, dust: 90 },
  },
  adaptive: {
    minFps: 42,          // step quality down when below this…
    badSeconds: 4,       // …for this long
    cooldown: 10,        // seconds between automatic steps
  },
};
