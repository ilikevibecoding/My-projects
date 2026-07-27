// Pure battle math — no DOM access so it can be unit-tested under Node.
(function () {
  "use strict";

  // Modern 18-type effectiveness chart. CHART[attacking][defending] = multiplier.
  const X = 1, H = 0.5, D = 2, Z = 0;
  const TYPES = [
    "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
    "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
  ];
  //                 nor fir wat ele gra ice fig poi gro fly psy bug roc gho dra dar ste fai
  const RAW = {
    normal:   [X, X, X, X, X, X, X, X, X, X, X, X, H, Z, X, X, H, X],
    fire:     [X, H, H, X, D, D, X, X, X, X, X, D, H, X, H, X, D, X],
    water:    [X, D, H, X, H, X, X, X, D, X, X, X, D, X, H, X, X, X],
    electric: [X, X, D, H, H, X, X, X, Z, D, X, X, X, X, H, X, X, X],
    grass:    [X, H, D, X, H, X, X, H, D, H, X, H, D, X, H, X, H, X],
    ice:      [X, H, H, X, D, H, X, X, D, D, X, X, X, X, D, X, H, X],
    fighting: [D, X, X, X, X, D, X, H, X, H, H, H, D, Z, X, D, D, H],
    poison:   [X, X, X, X, D, X, X, H, H, X, X, X, H, H, X, X, Z, D],
    ground:   [X, D, X, D, H, X, X, D, X, Z, X, H, D, X, X, X, D, X],
    flying:   [X, X, X, H, D, X, D, X, X, X, X, D, H, X, X, X, H, X],
    psychic:  [X, X, X, X, X, X, D, D, X, X, H, X, X, X, X, Z, H, X],
    bug:      [X, H, X, X, D, X, H, H, X, H, D, X, X, H, X, D, H, H],
    rock:     [X, D, X, X, X, D, H, X, H, D, X, D, X, X, X, X, H, X],
    ghost:    [Z, X, X, X, X, X, X, X, X, X, D, X, X, D, X, H, X, X],
    dragon:   [X, X, X, X, X, X, X, X, X, X, X, X, X, X, D, X, H, Z],
    dark:     [X, X, X, X, X, X, H, X, X, X, D, X, X, D, X, H, X, H],
    steel:    [X, D, H, H, X, D, X, X, X, X, X, X, D, X, X, X, H, D],
    fairy:    [X, H, X, X, X, X, D, H, X, X, X, X, X, X, D, D, H, X],
  };

  function typeEffectiveness(moveType, defenderTypes) {
    const row = RAW[moveType];
    if (!row) return 1;
    let mult = 1;
    for (const t of defenderTypes) {
      const idx = TYPES.indexOf(t);
      if (idx >= 0) mult *= row[idx];
    }
    return mult;
  }

  // Stat stage multipliers (-6..+6) for atk/def/spa/spd/spe.
  function stageMultiplier(stage) {
    const s = Math.max(-6, Math.min(6, stage));
    return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  }

  // Accuracy/evasion stages use a 3-based table.
  function accStageMultiplier(stage) {
    const s = Math.max(-6, Math.min(6, stage));
    return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
  }

  // Stats from base + IV at a level (Gen-1-style, no EVs for simplicity).
  function calcHP(base, iv, level) {
    return Math.floor(((base + iv) * 2 * level) / 100) + level + 10;
  }
  function calcStat(base, iv, level) {
    return Math.floor(((base + iv) * 2 * level) / 100) + 5;
  }

  /**
   * Core damage roll.
   * opts: {level, power, attack, defense, stab, typeMult, isCrit, random (0.85..1), burned}
   */
  function damage(opts) {
    if (opts.power <= 0) return 0;
    let atk = opts.attack;
    if (opts.burned) atk = Math.max(1, Math.floor(atk / 2));
    const level = opts.isCrit ? opts.level * 2 : opts.level;
    let dmg = Math.floor(
      Math.floor((Math.floor((2 * level) / 5 + 2) * opts.power * atk) / Math.max(1, opts.defense)) / 50
    ) + 2;
    if (opts.stab) dmg = Math.floor(dmg * 1.5);
    dmg = Math.floor(dmg * opts.typeMult);
    if (dmg <= 0) return opts.typeMult === 0 ? 0 : 1;
    dmg = Math.floor(dmg * (opts.random == null ? 1 : opts.random));
    return Math.max(opts.typeMult === 0 ? 0 : 1, dmg);
  }

  // Gen 3/4 capture formula. Returns {caught, shakes}.
  function captureCheck(opts) {
    const { maxHp, hp, catchRate, ballMod = 1, statusMod = 1, rand = Math.random } = opts;
    const a = Math.max(
      1,
      Math.floor(((3 * maxHp - 2 * hp) * catchRate * ballMod) / (3 * maxHp)) * statusMod
    );
    if (a >= 255) return { caught: true, shakes: 4 };
    const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)));
    let shakes = 0;
    for (let i = 0; i < 4; i++) {
      if (Math.floor(rand() * 65536) < b) shakes++;
      else break;
    }
    return { caught: shakes === 4, shakes };
  }

  // Experience needed to BE at a given level, per growth rate.
  function expForLevel(growth, level) {
    const n = level;
    switch (growth) {
      case "fast": return Math.floor((4 * n * n * n) / 5);
      case "slow": return Math.floor((5 * n * n * n) / 4);
      case "medium-slow":
        return Math.max(0, Math.floor((6 / 5) * n * n * n - 15 * n * n + 100 * n - 140));
      case "medium":
      default: return n * n * n;
    }
  }

  function levelForExp(growth, exp) {
    let lvl = 1;
    while (lvl < 100 && expForLevel(growth, lvl + 1) <= exp) lvl++;
    return lvl;
  }

  // Exp gained for defeating a foe (split among participants).
  function expGain(baseExp, foeLevel, isTrainer, participants) {
    const raw = Math.floor((baseExp * foeLevel) / 7 / Math.max(1, participants));
    return Math.max(1, Math.floor(raw * (isTrainer ? 1.5 : 1)));
  }

  function critChance(critRateStage) {
    // base 1/16; high-crit moves 1/4.
    return critRateStage > 0 ? 1 / 4 : 1 / 16;
  }

  const api = {
    TYPES, typeEffectiveness, stageMultiplier, accStageMultiplier,
    calcHP, calcStat, damage, captureCheck,
    expForLevel, levelForExp, expGain, critChance,
  };

  if (typeof window !== "undefined") window.Formulas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
