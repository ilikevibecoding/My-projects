# Pocket Monsters — Verdant Version

A Game-Boy-style Pokémon fan game that runs entirely in your browser — or offline on your PC.
All 151 original Pokémon with their real sprites, cries, stats, movesets, and evolutions.

## Play it

- **Browser:** open `https://ehpurple.com/pokemon/` (deployed via GitHub Pages).
- **PC (offline):** download `pokemon-pc.zip` from the link under the game (or zip this folder),
  unzip anywhere, and **double-click `index.html`**. No install, no internet needed —
  saves are stored in your browser.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys / WASD |
| A (confirm / talk) | Z or Space |
| B (cancel / run modifier) | X |
| Start (pause menu) | Enter |

On phones/tablets a touch D-pad and A/B buttons appear automatically.

## What's in the game

- **Full Gen-1 style adventure loop:** pick a starter from Prof. Cedar, battle your rival,
  cross two routes of tall grass and trainers, and take down the Verdant City Gym Leader
  for the Boulder Badge (plus a post-badge rival rematch).
- **All 151 Pokémon** with authentic battle sprites, party icons, and cries; real base stats,
  type charts (18 types), level-up movesets, and evolutions baked from PokeAPI data.
- **Complete battle engine:** damage formula with STAB/crits/type effectiveness, stat stages,
  status conditions (PSN/BRN/PAR/SLP/FRZ), confusion, multi-hit moves, drain/recoil,
  priority, accuracy/evasion, OHKO moves, Struggle, and smart-ish trainer AI.
- **Catching** with the real capture formula (Poké/Great/Ultra Balls, status bonuses, shake checks).
- **Party of 6 + PC box** (withdraw/deposit at the Pokémon Center PC).
- **Exp, levels, move learning** (with replace prompts) **and evolutions.**
- **Items & economy:** potions, status heals, revives, balls; Poké Mart with buy/sell; prize money.
- **Pokémon Center healing, Pokédex** (seen/caught with flavor text), **save/load**
  (localStorage + exportable save codes), chiptune music and sound effects.

## Development

- `tools/fetch_assets.sh` — downloads sprites/cries from the PokeAPI mirrors (already committed).
- `tools/fetch_data.mjs` — regenerates `data/pokedex.js` / `data/moves.js` from pokeapi.co.
- `tools/lint_maps.mjs` — validates the hand-authored maps in `data/maps.js`.
- `tests/formulas.test.mjs` — battle-math unit tests (`node --test pokemon/tests/`).
- `tests/e2e.mjs` — Playwright smoke test (see file header for usage).

No build step. Plain ES5-ish scripts so the same files work from GitHub Pages **and** `file://`.

## Credits & legal

See [`assets/CREDITS.md`](assets/CREDITS.md). This is a non-commercial fan project, not
affiliated with or endorsed by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company.
