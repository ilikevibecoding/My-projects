# Abyssal Dive

Abyssal Dive is a graphics-first underwater exploration prototype inspired by the fantasy of a Subnautica-style opening biome. The focus is atmosphere over survival systems: water color, fog, caustics, coral silhouettes, kelp motion, schooling fish, and a handheld scanner loop.

## What is included

- First-person swimming with pointer-lock look controls
- Procedural seafloor shading with underwater fog and moving caustic light
- Dense decorative environment: coral clusters, rock pillars, kelp forests, fish schools, floating particles, and sun shafts
- Scanner gameplay loop with eight discoverable flora, fauna, and artifact targets
- HUD panels for depth, biome, oxygen, energy, scanner progress, and field log entries

## Controls

- `Click` - lock pointer / resume dive
- `WASD` - swim
- `Shift` - boost
- `Space` - ascend
- `C` - descend
- `E` - scan highlighted targets
- `Enter` or `Space` on intro overlay - start dive

## Run locally

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Note on Unity

The request called for a Unity prototype, but this workspace was a plain static web repo with no Unity project structure. Instead of fabricating untestable Unity scene YAML by hand, the repo was rebuilt into a self-contained browser prototype that captures the requested art direction and exploration mood. If you want this migrated into a real Unity URP/HDRP project next, start from a Unity workspace and the rendering/gameplay ideas here can be ported directly.
