# Subnautica-Inspired Underwater Slice

This repository is now a **Unity 6.3 LTS** prototype focused on building the look and feel of a
Subnautica-style underwater scene. The goal is a strong visual vertical slice rather than a full
survival sandbox.

## What is included

- First-person underwater swimming with buoyant acceleration
- Procedurally generated seafloor, reef dressing, and coral silhouettes
- Graphics-focused underwater atmosphere:
  - depth fog
  - animated caustic light patterns
  - water surface shimmer
  - drifting particulates and bubbles
  - fullscreen underwater post effect
- Scanner tool presentation in the lower-right of the view
- Ambient fish schools plus a larger distant creature silhouette
- A light scan loop with several scannable targets

## Unity version

- **Unity 6.3 LTS**
- Project version file targets **6000.3.3f1**

If your local Unity patch is slightly newer within the 6000.3 line, importing the project should
still be fine.

## How to open

1. Open Unity Hub.
2. Add this repository as a project.
3. Open it with Unity **6000.3.x**.
4. Open the scene at `Assets/Scenes/SubnauticaSlice.unity`.
5. Press **Play**.

The scene itself is intentionally minimal; most of the environment is built at runtime by the
bootstrap scripts.

## Controls

- `WASD` - swim
- `Mouse` - look
- `Space` - ascend
- `Left Ctrl` or `C` - descend
- `Left Shift` - burst swim
- `E` - scan highlighted targets

## Scan objective

Swim through the reef and scan nearby flora/fauna targets. The objective text and scanner HUD update
as progress increases.

## Notes

- This prototype is **graphics-first**. The emphasis is on underwater mood, color, composition, and
  motion in the scene.
- The world is assembled procedurally in code to keep the repository lightweight and easy to extend.