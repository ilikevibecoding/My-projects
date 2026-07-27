# Clash of Clones — a fan parody

A free, browser-based, unofficial **parody** of a certain village-smashing mobile game.
Pure HTML/CSS/JS — no build step, no server, no accounts, no purchases (the gem shop
hands out gems for $0.00, because parody).

## Play

Open `index.html` over any static file server, or via a CDN mirror of this repo:

```
https://cdn.jsdelivr.net/gh/ilikevibecoding/My-projects@main/clash-of-clones/index.html
```

## Features

- Isometric village: build and move buildings, upgrade them with timers, collect
  gold and elixir from mines and collectors (they keep working while you're away)
- Obstacles: trees, trunks, mushrooms, and stones grow over time — pay a builder to
  chop them for loot and a chance of gems; a **Gem Box** spawns periodically
  (always holds 25 gems)
- Wall drag-building: pick Wall in the shop, drag out lines of half-opacity ghost
  walls, then press Enter (or the ✓ button) to build them all at once; walls render
  connected with per-level styles
- Cheat console: the 🗝️ button — enter the secret code (`clash`) for unlimited
  resources, instant builds, and every troop/building unlocked; `nerf` turns it off
- Builders: limited crew, extra huts cost (free) gems; little builders hop around
  construction sites and chop obstacles
- Army: 19 troop types including Wall Breakers, Healers, Minions, Valkyries, Witches,
  Golems, Miners, Electro Dragons, and two heroes
- Defenses: cannons, archer towers, mortars, wizard towers, air defenses, hidden
  teslas, bomb towers, X-Bows, inferno tower beams, and walls
- Battles: raid procedurally generated villages — tap to deploy, troops pathfind and
  smack buildings, defenses shoot back (shells, missiles, zaps, beams), walls block
  ground units, air units float over everything
- Town Hall changes its look as it levels up; CoC-style HUD and tabbed shop
- Stars, destruction %, loot, trophies, win quips
- Everything saved in `localStorage`
- All sound effects synthesized live with WebAudio

## Controls

- Drag to pan, scroll wheel / pinch to zoom
- Tap a building to select, collect, upgrade, or move it
- Tap an obstacle to clear it for rewards
- In battle, pick a troop at the bottom and tap the grass to deploy
- Wall mode: drag to draw, Enter to build, Esc to cancel

## Credits

See [ATTRIBUTION.md](./ATTRIBUTION.md). Artwork from the official Supercell Fan Kit
under their [Fan Content Policy](https://supercell.com/en/fan-content-policy/).
This material is unofficial and is not endorsed by Supercell.
