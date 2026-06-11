#!/usr/bin/env node
// Validates data/maps.js: row widths, warp/NPC/sign positions, edge targets.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
global.window = {};
eval(readFileSync(join(ROOT, "data/maps.js"), "utf8"));
eval(readFileSync(join(ROOT, "data/trainers.js"), "utf8"));
eval(readFileSync(join(ROOT, "data/encounters.js"), "utf8"));

const MAPS = global.window.MAPS;
const SOLID = new Set(["T", "P", "w", "F", "r", "k", "s", "R", "Y", "A", "W", "o", "+", "M", "g",
  "#", "c", "B", "b", "x", "V", "p", "C", "L", "H", "K", "*",
  "G", "q", "O", "E", "J", "U"]);
const KNOWN = new Set([".", "t", "f", ",", "n", "w", "T", "P", "l", "F", "r", "k", "s",
  "R", "Y", "A", "W", "D", "o", "+", "M", "g",
  "#", "=", "-", "c", "B", "b", "x", "h", "V", "p", "C", "L", "H", "~",
  "K", ":", "*", "d", "u",
  "a", "z", "G", "q", "O", "E", "J", "U"]);

let errors = 0;
function err(msg) { console.error("ERROR:", msg); errors++; }

for (const [id, map] of Object.entries(MAPS)) {
  const w = map.grid[0].length;
  map.grid.forEach((row, y) => {
    if (row.length !== w) err(`${id}: row ${y} width ${row.length} != ${w}`);
    for (const ch of row) if (!KNOWN.has(ch)) err(`${id}: unknown tile '${ch}' in row ${y}`);
  });
  const h = map.grid.length;
  const at = (x, y) => (map.grid[y] || "")[x];

  for (const warp of map.warps || []) {
    if (warp.x < 0 || warp.x >= w || warp.y < 0 || warp.y >= h) err(`${id}: warp out of bounds ${JSON.stringify(warp)}`);
    const ch = at(warp.x, warp.y);
    if (ch !== "D" && ch !== "~") err(`${id}: warp at (${warp.x},${warp.y}) is on '${ch}', expected D or ~`);
    const dest = warp.to === "return" ? warp.fallback : warp.to;
    if (warp.to === "return" && !warp.fallback) { err(`${id}: "return" warp needs a fallback`); continue; }
    const target = MAPS[dest.map];
    if (!target) { err(`${id}: warp target map '${dest.map}' missing`); continue; }
    const tch = (target.grid[dest.y] || "")[dest.x];
    if (tch === undefined) err(`${id}: warp target (${dest.x},${dest.y}) out of bounds in ${dest.map}`);
    else if (SOLID.has(tch)) err(`${id}: warp target lands on solid '${tch}' in ${dest.map} (${dest.x},${dest.y})`);
  }

  // every D and ~ should have a warp (except '~' used as rug decor — warn only)
  map.grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "D" && !(map.warps || []).some((wp) => wp.x === x && wp.y === y)) {
        err(`${id}: door at (${x},${y}) has no warp`);
      }
    });
  });

  for (const npc of map.npcs || []) {
    const ch = at(npc.x, npc.y);
    if (ch === undefined) err(`${id}: npc ${npc.id} out of bounds`);
    else if (SOLID.has(ch)) err(`${id}: npc ${npc.id} on solid tile '${ch}'`);
    if (npc.trainer && !global.window.TRAINERS[npc.trainer]) err(`${id}: npc ${npc.id} unknown trainer '${npc.trainer}'`);
  }

  for (const sign of map.signs || []) {
    const ch = at(sign.x, sign.y);
    // signs sit on 's' posts outdoors, or on any solid furniture (museum exhibits, arcade cabinets)
    if (ch !== "s" && !SOLID.has(ch)) err(`${id}: sign at (${sign.x},${sign.y}) is on walkable '${ch}'`);
  }
  // every 's' tile must have text
  map.grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "s" && !(map.signs || []).some((sg) => sg.x === x && sg.y === y)) {
        err(`${id}: sign tile at (${x},${y}) has no text`);
      }
    });
  });

  for (const [dir, edge] of Object.entries(map.edges || {})) {
    if (!MAPS[edge.map]) err(`${id}: edge ${dir} target '${edge.map}' missing`);
  }
  if (map.encounters && !global.window.ENCOUNTERS[map.encounters]) {
    err(`${id}: unknown encounter table '${map.encounters}'`);
  }
}

// trainer rosters reference valid species
eval(readFileSync(join(ROOT, "data/pokedex.js"), "utf8"));
for (const [tid, t] of Object.entries(global.window.TRAINERS)) {
  for (const [sp, lvl] of t.party || []) {
    if (!global.window.POKEDEX[sp]) err(`trainer ${tid}: unknown species ${sp}`);
    if (lvl < 1 || lvl > 100) err(`trainer ${tid}: bad level ${lvl}`);
  }
}
for (const [eid, table] of Object.entries(global.window.ENCOUNTERS)) {
  for (const slot of table.slots) {
    if (!global.window.POKEDEX[slot.id]) err(`encounters ${eid}: unknown species ${slot.id}`);
  }
}

if (errors === 0) console.log("maps OK");
process.exit(errors ? 1 : 0);
