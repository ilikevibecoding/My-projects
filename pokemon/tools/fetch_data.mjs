#!/usr/bin/env node
/**
 * Generates pokemon/data/pokedex.js and pokemon/data/moves.js from pokeapi.co.
 * Run once from repo root:  node pokemon/tools/fetch_data.mjs
 *
 * Output is committed so the game never needs the network at runtime.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://pokeapi.co/api/v2";
const GEN1_COUNT = 151;

// ---------- fetch helpers ----------
const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const data = await res.json();
      cache.set(url, data);
      return data;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- name prettifiers ----------
const NAME_FIXES = {
  "nidoran-f": "Nidoran♀",
  "nidoran-m": "Nidoran♂",
  "mr-mime": "Mr. Mime",
  farfetchd: "Farfetch'd",
};
function prettyName(slug) {
  if (NAME_FIXES[slug]) return NAME_FIXES[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STAT_KEYS = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

function cleanFlavor(text) {
  return text.replace(/[\n\f\r\u00ad]/g, " ").replace(/\s+/g, " ").trim();
}

// ---------- evolution parsing ----------
// Maps trigger to an in-game level so every evolution is reachable by playing.
function evoLevel(details) {
  if (!details) return null;
  const trigger = details.trigger?.name;
  if (trigger === "level-up" && details.min_level) return details.min_level;
  if (trigger === "level-up") return 36; // friendship etc. (not in gen 1 anyway)
  if (trigger === "trade") return 36;
  if (trigger === "use-item") return 36;
  return 36;
}

function walkChain(node, out) {
  const fromId = Number(node.species.url.match(/\/(\d+)\/?$/)[1]);
  for (const child of node.evolves_to || []) {
    const toId = Number(child.species.url.match(/\/(\d+)\/?$/)[1]);
    if (fromId <= GEN1_COUNT && toId <= GEN1_COUNT) {
      if (!out[fromId]) out[fromId] = [];
      const lvl = evoLevel(child.evolution_details[0]);
      out[fromId].push({ to: toId, level: lvl });
    }
    walkChain(child, out);
  }
}

// ---------- main ----------
async function main() {
  const ids = Array.from({ length: GEN1_COUNT }, (_, i) => i + 1);

  console.log("Fetching pokemon + species ...");
  const pokemons = await mapLimit(ids, 10, (id) => getJSON(`${API}/pokemon/${id}`));
  const species = await mapLimit(ids, 10, (id) => getJSON(`${API}/pokemon-species/${id}`));

  console.log("Fetching evolution chains ...");
  const chainUrls = [...new Set(species.map((s) => s.evolution_chain.url))];
  const chains = await mapLimit(chainUrls, 10, (u) => getJSON(u));
  const evolutions = {};
  for (const chain of chains) walkChain(chain.chain, evolutions);
  // Eevee's stone evolutions: make them an even level-30 choice.
  if (evolutions[133]) evolutions[133] = evolutions[133].map((e) => ({ ...e, level: 30 }));

  console.log("Building pokedex ...");
  const moveIds = new Set();
  const pokedex = {};
  for (let i = 0; i < ids.length; i++) {
    const p = pokemons[i];
    const s = species[i];
    const id = ids[i];

    const stats = {};
    for (const st of p.stats) stats[STAT_KEYS[st.stat.name]] = st.base_stat;

    // Red/Blue level-up learnset (fall back to yellow, then any gen-1-ish data).
    const learnset = [];
    for (const m of p.moves) {
      let best = null;
      for (const vg of m.version_group_details) {
        if (vg.move_learn_method.name !== "level-up") continue;
        const v = vg.version_group.name;
        if (v === "red-blue") { best = vg; break; }
        if (v === "yellow" && !best) best = vg;
      }
      if (best) {
        const moveId = Number(m.move.url.match(/\/(\d+)\/?$/)[1]);
        learnset.push([Math.max(1, best.level_learned_at), moveId]);
        moveIds.add(moveId);
      }
    }
    learnset.sort((a, b) => a[0] - b[0]);

    const flavorEntry =
      s.flavor_text_entries.find((f) => f.language.name === "en" && f.version.name === "red") ||
      s.flavor_text_entries.find((f) => f.language.name === "en");
    const genusEntry = s.genera.find((g) => g.language.name === "en");

    pokedex[id] = {
      id,
      name: p.name,
      display: prettyName(p.name),
      types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      stats,
      catchRate: s.capture_rate,
      baseExp: p.base_experience,
      growth: s.growth_rate.name,
      genus: genusEntry ? genusEntry.genus : "",
      flavor: flavorEntry ? cleanFlavor(flavorEntry.flavor_text) : "",
      height: p.height, // decimetres
      weight: p.weight, // hectograms
      learnset,
      evolutions: evolutions[id] || [],
    };
  }

  console.log(`Fetching ${moveIds.size} moves ...`);
  const moveList = await mapLimit([...moveIds], 10, (id) => getJSON(`${API}/move/${id}`));
  const moves = {};
  for (const m of moveList) {
    const meta = m.meta || {};
    const statChanges = (m.stat_changes || [])
      .filter((sc) => STAT_KEYS[sc.stat.name] || sc.stat.name === "accuracy" || sc.stat.name === "evasion")
      .map((sc) => ({ stat: STAT_KEYS[sc.stat.name] || sc.stat.name, change: sc.change }));
    moves[m.id] = {
      id: m.id,
      name: m.name,
      display: prettyName(m.name),
      type: m.type.name,
      class: m.damage_class.name, // physical | special | status
      power: m.power, // null for status / special-calc moves
      accuracy: m.accuracy, // null = never misses
      pp: m.pp,
      priority: m.priority,
      target: m.target.name === "user" || m.target.name === "users-field" ? "user" : "foe",
      category: meta.category ? meta.category.name : "damage",
      effectChance: m.effect_chance,
      ailment: meta.ailment && meta.ailment.name !== "none" ? meta.ailment.name : null,
      ailmentChance: meta.ailment_chance || 0,
      flinchChance: meta.flinch_chance || 0,
      statChance: meta.stat_chance || 0,
      critRate: meta.crit_rate || 0,
      drain: meta.drain || 0, // % of damage healed (negative = recoil)
      healing: meta.healing || 0, // % of max HP
      hits: meta.min_hits ? [meta.min_hits, meta.max_hits] : null,
      statChanges,
    };
  }

  // Manual balance overrides (preserved across regeneration).
  const MOVE_OVERRIDES = {
    ember: { power: 46 }, // +15% per design feedback
  };
  for (const m of Object.values(moves)) {
    if (MOVE_OVERRIDES[m.name]) Object.assign(m, MOVE_OVERRIDES[m.name]);
  }

  mkdirSync(join(ROOT, "data"), { recursive: true });
  const banner = "// Generated by tools/fetch_data.mjs from pokeapi.co — do not edit by hand.\n";
  writeFileSync(
    join(ROOT, "data", "pokedex.js"),
    banner + "window.POKEDEX = " + JSON.stringify(pokedex) + ";\n"
  );
  writeFileSync(
    join(ROOT, "data", "moves.js"),
    banner + "window.MOVES = " + JSON.stringify(moves) + ";\n"
  );
  console.log(
    `Wrote data/pokedex.js (${Object.keys(pokedex).length} species) and data/moves.js (${Object.keys(moves).length} moves)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
