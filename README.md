# Subnautica - Underwater Exploration

A visually stunning Subnautica-inspired underwater exploration game built entirely in a single HTML file using Three.js with custom GLSL shaders, procedural world generation, and advanced post-processing.

## Visual Features

- **Procedural Terrain** with multi-octave simplex noise displacement and slope-based texturing
- **Animated Caustics** projected onto the ocean floor via procedural shader patterns
- **Volumetric God Rays** penetrating from the water surface with additive blending
- **Dynamic Water Surface** with wave displacement and Fresnel-based refraction (seen from below)
- **Depth-Based Fog** that shifts from teal shallows to deep navy with distance-based density
- **Post-Processing Pipeline**: ACES filmic tone mapping, Unreal bloom, chromatic aberration, underwater distortion, depth color grading, and vignette
- **Bioluminescent Particles** in deep zones with animated glow
- **Kelp Forest** with vertex-shader sway animation
- **Coral Reef Biome** with brain coral, tube coral, fan coral, and table coral in vibrant colors
- **Anemones** with animated tentacles
- **Rock Formations** with procedurally deformed geometry
- **Fish Schools** with full boid behavior (separation, alignment, cohesion) and player avoidance
- **Glowing Jellyfish** with pulsing bell animation, trailing tentacles, and point lights
- **Leviathan Silhouettes** circling in the deep distance
- **Dynamic Bubble & Plankton Particles** with player-emitted bubbles

## Gameplay

- First-person underwater swimming with full 6DOF movement
- Oxygen system (resurface to refill)
- Health, food, and water survival stats
- Resource gathering (quartz, copper, titanium, gold, salt, acid mushrooms)
- Inventory system with hotbar
- Toggleable flashlight for deep exploration
- Lifepod spawn point
- Compass and depth meter

## How to Run

Open `index.html` in a modern desktop browser (Chrome, Firefox, Edge).

Or serve locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Controls

| Key | Action |
|-----|--------|
| WASD | Swim forward/back/strafe |
| Mouse | Look around |
| Space | Ascend |
| Shift | Descend |
| E | Collect resources |
| F | Toggle flashlight |
| 1-5 | Select hotbar slot |
| Click | Lock mouse cursor |

## Biome Zones

| Depth | Zone | Features |
|-------|------|----------|
| 0-10m | Shallows | Bright caustics, coral reef, small fish |
| 10-30m | Reef | Dense coral, kelp edges, schools of fish |
| 30-50m | Kelp Forest | Tall swaying kelp, jellyfish |
| 50-80m | Deep Zone | Dark, bioluminescence, leviathan silhouettes |
| 80-120m | Abyss | Near-total darkness, sparse glow |

## Technical Details

- Three.js r160 with WebGL2
- 6 custom GLSL shaders (terrain, water, kelp, god rays, post-processing)
- Simplex noise implementation for procedural generation
- Instanced rendering for performance
- ACES filmic tone mapping with Unreal bloom
- ~165K vertex budget for smooth 60fps
