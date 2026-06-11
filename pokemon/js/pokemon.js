// Pokémon instance creation, stats, exp/level, move learning, evolution.
(function () {
  "use strict";

  const F = window.Formulas;

  function rndIV() {
    return Math.floor(Math.random() * 16);
  }

  const Mon = {
    species(mon) {
      return window.POKEDEX[mon.species];
    },

    create(speciesId, level, opts = {}) {
      const spec = window.POKEDEX[speciesId];
      const mon = {
        species: speciesId,
        name: spec.display.toUpperCase(),
        level,
        exp: F.expForLevel(spec.growth, level),
        ivs: opts.ivs || { hp: rndIV(), atk: rndIV(), def: rndIV(), spa: rndIV(), spd: rndIV(), spe: rndIV() },
        status: null,        // 'psn' | 'brn' | 'par' | 'slp' | 'frz'
        sleepTurns: 0,
        moves: [],
        hp: 0,
      };
      this.recalcStats(mon);
      mon.hp = mon.stats.hp;
      const moveIds = opts.moves || this.movesAtLevel(speciesId, level);
      mon.moves = moveIds.map((id) => this.makeMove(id));
      return mon;
    },

    makeMove(id) {
      const data = window.MOVES[id];
      return { id, pp: data.pp, maxpp: data.pp };
    },

    recalcStats(mon) {
      const spec = this.species(mon);
      const prevMax = mon.stats ? mon.stats.hp : null;
      mon.stats = {
        hp: F.calcHP(spec.stats.hp, mon.ivs.hp, mon.level),
        atk: F.calcStat(spec.stats.atk, mon.ivs.atk, mon.level),
        def: F.calcStat(spec.stats.def, mon.ivs.def, mon.level),
        spa: F.calcStat(spec.stats.spa, mon.ivs.spa, mon.level),
        spd: F.calcStat(spec.stats.spd, mon.ivs.spd, mon.level),
        spe: F.calcStat(spec.stats.spe, mon.ivs.spe, mon.level),
      };
      if (prevMax !== null && mon.hp > 0) {
        mon.hp = Math.min(mon.stats.hp, mon.hp + Math.max(0, mon.stats.hp - prevMax));
      }
    },

    movesAtLevel(speciesId, level) {
      const spec = window.POKEDEX[speciesId];
      const ids = [];
      for (const [lvl, moveId] of spec.learnset) {
        if (lvl > level) break;
        if (!ids.includes(moveId)) ids.push(moveId);
      }
      return ids.slice(-4);
    },

    // Moves newly learnable when reaching exactly `level`.
    movesLearnedAt(speciesId, level) {
      const spec = window.POKEDEX[speciesId];
      return spec.learnset.filter(([lvl]) => lvl === level).map(([, id]) => id);
    },

    expToNext(mon) {
      const spec = this.species(mon);
      if (mon.level >= 100) return 0;
      return F.expForLevel(spec.growth, mon.level + 1) - mon.exp;
    },

    // ratio of progress through current level (for exp bar)
    expRatio(mon) {
      const spec = this.species(mon);
      if (mon.level >= 100) return 1;
      const lo = F.expForLevel(spec.growth, mon.level);
      const hi = F.expForLevel(spec.growth, mon.level + 1);
      return Math.max(0, Math.min(1, (mon.exp - lo) / (hi - lo)));
    },

    // Add exp; returns list of levels gained (stats are recalculated).
    gainExp(mon, amount) {
      const spec = this.species(mon);
      mon.exp += amount;
      const gained = [];
      while (mon.level < 100 && mon.exp >= F.expForLevel(spec.growth, mon.level + 1)) {
        mon.level++;
        this.recalcStats(mon);
        gained.push(mon.level);
      }
      return gained;
    },

    // Evolution available at current level? Returns target species id or null.
    pendingEvolution(mon) {
      const spec = this.species(mon);
      const options = spec.evolutions.filter((e) => e.level && mon.level >= e.level);
      if (options.length === 0) return null;
      // multi-branch (Eevee): random pick, deterministic per individual via IV
      const pick = options[(mon.ivs.atk + mon.ivs.spe) % options.length];
      return pick.to;
    },

    evolve(mon, toSpecies) {
      const keepRatio = mon.hp / mon.stats.hp;
      const wasNicknamed = mon.name !== this.species(mon).display.toUpperCase();
      mon.species = toSpecies;
      if (!wasNicknamed) mon.name = window.POKEDEX[toSpecies].display.toUpperCase();
      this.recalcStats(mon);
      mon.hp = Math.max(1, Math.round(mon.stats.hp * keepRatio));
    },

    fullHeal(mon) {
      mon.hp = mon.stats.hp;
      mon.status = null;
      mon.sleepTurns = 0;
      mon.moves.forEach((m) => { m.pp = m.maxpp; });
    },

    statusLabel(status) {
      return { psn: "PSN", brn: "BRN", par: "PAR", slp: "SLP", frz: "FRZ" }[status] || "";
    },
  };

  window.Mon = Mon;
})();
