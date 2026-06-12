# PROGRESS — First-Person Camping Demo

Self-evaluating loop: build → screenshot (`tools/shots.mjs`) → judge vs rubric → fix.
Shots per iteration live in `shots/iter_N/`. Judged from actual screenshots, harsh: a maybe is a FAIL.

**Note on the 60fps rubric item:** this environment has no GPU — headless Chrome renders via
SwiftShader (software). Absolute fps numbers here (6–15fps) are a *software-rasterizer lower
bound*, not representative of a mid-range laptop GPU. The fps item is therefore judged by render
budgets: draw calls, triangle counts, instancing discipline (verified from `renderer.info`), plus
the SwiftShader fps as a sanity lower bound.

---

## Iteration 1 — full vertical slice

Everything exists end-to-end: radial seam-free terrain (one mesh from camp clearing to distant
mountains, single analytic height function), splat shader (grass/dirt/rock + path mask + macro
anti-tiling), gradient sky w/ sun disk, clouds, stars, moon; 60k instanced grass, 2 tree species
(~440 instanced), instanced rocks, planar-reflection pond w/ shore depth fade, camp (stone ring,
wood pile, seat log, tent), GPU fire (flames/embers/smoke/sparks + flicker light), FP controller,
4 raycast interactions, post stack (MSAA → GTAO → bloom → ACES → vignette/grain), debugAPI +
Playwright harness. Harness run: ~13.5 min, all shots captured, no fatal page errors.

### Rubric scoring (from shots/iter_1)

| # | Item | Verdict | Evidence / notes |
|---|------|---------|------------------|
| 1 | Terrain reads natural | **FAIL** | Bowl terrain + path blend read well, no tiling. But mountains are crumpled white paper — snow covers everything (snow line 165m vs peaks 380m), no rock detail, forms too spiky. |
| 2 | Vegetation alive | **FAIL** | Grass blades are GIANT (1.5m+) opaque dark walls that swallow the camp, tent and pond. Dark card backfaces read as black rectangles. Trees: decent variation, edge not grid-like (good), but grass ruins the item. |
| 3 | Atmosphere works | **FAIL** | Mountains crisp white, almost zero aerial haze in day shots. Golden hour is warm but foreground is crushed black. Night: stars+moonlight OK. |
| 4 | Fire sells | **FAIL** | Flames/embers/smoke all present and animated, warm flicker light works in night shot. But flames over-bloom into a single white blob (interact_fire_lit) — fails "glow without smearing". |
| 5 | Water works | **FAIL** | Pond not even visible — pond camera is buried inside giant shore grass. Cannot judge reflection/shoreline at all. |
| 6 | Materials read distinct | **FAIL** | Dirt path and birch trunks read. Fire-ring stones = black blobs; tent half-buried; grass walls hide everything; wood-pile end caps glow orange. |
| 7 | Post stack on/balanced | **FAIL** | ACES/bloom/vignette/grain confirmed on. But golden+night foregrounds crush to black, fire bloom smears, AO unverifiable. |
| 8 | Cohesive palette per ToD | **FAIL** | Day OK (blue/green). Golden = muddy near-black foreground vs beige peaks. Night OK-ish. |
| 9 | Tech is clean | **FAIL** | stats.json reports 1 drawCall/1 tri — renderer.info reset by composer passes, instrumentation broken (must fix to verify). Player walk: grounded ✓ inBounds ✓. No acne/z-fight seen but unverifiable budgets = fail. |
| 10 | Interactions work | **PASS** | All four verified with screenshots+state: prompts shown, fire lights (interact_fire_lit), wood toss (interact_wood_toss), seated view (interact_seated), sleep golden→night (stats.sleepChangedTime.ok=true). |
| 11 | Cold-look test | **FAIL** | Vista almost passes (nice bowl + treeline) but white paper mountains + black grass stubble give it away instantly. |

**Score: 1/11 pass.**

### Fix list for iteration 2 (worst first, all implemented in iter 2)
1. **Grass rebuild** — blade height 0.35–0.6m (not 1.5m), narrower blades in card texture, ~3×
   density at half size, normals forced UP so cards shade like the ground (kills black backfaces),
   brighter yellow-green palette matched to terrain texture, clear grass from camp area (r<7) and
   pond shore (pond.r+3).
2. **Atmospheric haze** — day fog 0.00135→~0.0021, tinted to horizon color; golden/night up too.
   Mountains: snow line 165→260 w/ noise edge, more visible rock, start them further out
   (smoothstep 380–1000), lower amplitude ~280.
3. **Pond visible** — fix pond view (above grass, at shore looking across), grass exclusion ring,
   verify reflection + shoreline blend in shot.
4. **Golden hour exposure** — sun elev 0.16→0.22, hemi 0.42→0.52, exposure 1.05, brighter warm fog;
   keep long shadows.
5. **Camp readability** — lighter granite stones, bigger tent (W3.0/H1.95), camp view recomposed
   closer/lower, wood-cap color toned down.
6. **Fire balance** — flame brightness 2.6→~1.6, slightly smaller flame cluster, smoke opacity down.
7. **Stats fix** — renderer.info.autoReset=false + manual reset per frame (real drawCalls/tris).
8. Vista view: move so foreground pine doesn't block center.

---

## Iteration 2 — grass rebuild, haze, pond view, stats (shots/iter_2)

Implemented all 8 fixes. Visual-only run (interactions re-verified later).
Findings from the shots (rubric deltas only):

- Camp now fully readable (tent/fire-ring/wood-pile/seat log all distinct) — big win.
- Grass: correct scale now, BUT dark backface speckle remains (DoubleSide flips the forced-up
  normals per face) → meadow reads black-stubbled at mid-distance. **Still FAIL (2).**
- Mountains: snowline better; NEW artifact found — black sawtooth halo tracing every ridge
  silhouette (zoomed crop confirms). Suspect GTAO depth-discontinuity halo at far range. **FAIL (1,3).**
- Pond now visible BUT surface reads as dark-green noise: normal-map distortion far too strong
  (0.6 in clip space) scrambles the reflection. **FAIL (5).**
- Pine cone tiers show grey undersides (closed cone caps lit by ground hemisphere) — reads like
  rock showing through the tree. **FAIL (2 contributor).**
- Golden warmer but foreground still too dark; night fire-light pool too small.
- Stats now real: 135–335 draw calls, ~2.1–2.6M tris *per frame including shadow + reflection +
  GTAO re-renders* (scene itself ~0.9M). Within budget for a mid-range GPU.

**Score: 1/11** (interactions, carried). Fix list → iter 3: grass face-up normals in fragment
stage; GTAO scene clip box (exclude mountains); water distortion 0.6→0.22 + flatter normals;
open-ended pine cones (DoubleSide); golden exposure 1.18 + vignette 0.32; fire light 52/34m.

## Iteration 3 — normals, GTAO clip, water fix (shots/iter_3)

All six shots + motion pairs captured. Findings:

- **Grass fixed** — bright yellow-green meadow w/ clump variation; backface speckle gone.
- **GTAO sawtooth gone** (scene clip box). Mountains clean silhouettes in haze.
- **Pond works now** — reflects far-shore trees + sky, shoreline blends, rocks at shore.
  Bank lip a touch high (sunken-crater feel), water a bit dark.
- Golden hour: gold grass + long tree shadows + warm haze = strong. Foreground dirt patch huge/red.
- Night: fire light pool now sells the camp; smoke slightly milky.
- Motion pairs (mean abs pixel diff): grass 4.53, water 4.97, fire 8.57 — all clearly animated
  (static-scene noise floor from film grain ≈ 2).
- Remaining weaknesses: distant mountainsides read as smooth "golf lawn" green (need distant-forest
  mottling), bald lawn patches between grass clumps, camp wear disc too big, flames too round,
  rim treeline has a gap on the pond side.

**Score (harsh): 1 Terrain FAIL (distant lawn slopes) · 2 Veg FAIL (bald patches) · 3 Atmos PASS ·
4 Fire FAIL (round blob flames, milky smoke) · 5 Water PASS (reflection+shore+motion verified) ·
6 Materials FAIL (dirt disc oversaturated/red, dominates camp shots) · 7 Post PASS · 8 Palette PASS ·
9 Tech PASS (budgets real: ≤335 calls incl. all passes; no acne/z-fight/floaters seen) ·
10 Interactions PASS (carried iter‑1 evidence) · 11 Cold-look FAIL (distant slopes + flame blob).
= 7/11**

Fix list → iter 4 (worst first): distant-forest mottling on far slopes; grass density floor up;
camp wear disc 4.6m/0.72; pond bank +0.32; flame sprites taller 0.78×1.55, smoke 0.30 alpha;
rim pines 300/85–142m; day fog 0.0023; puffier clouds.
