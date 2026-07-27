# PROGRESS — Drifter MCV-7 (first-person ship interior)

Self-evaluating loop. Each iteration: implement → screenshot (tools/shots.mjs) →
judge against rubric → fix list → repeat. Stop: all rubric items pass twice in a
row, or iteration 12.

## Rubric
1. Lighting reads intentional (key/fill, glowing emissives, not flat)
2. Materials read physical (metal/painted/fabric, reflections, roughness variation)
3. Detail density (no large undetailed surfaces)
4. Post stack balanced (ACES, bloom, AO, vignette, grain; no blown/crushed)
5. Space view sells motion (planet + rim glow, obvious parallax)
6. Cohesive palette across all shots
7. Tech clean (60fps, no z-fighting/acne/missing faces)
8. Cold-look test (corridor shot reads as real indie space game)
9. Interactions work (lock, prompts, 3 interactions, fades, status)

---

## Iteration 1
Built everything: 6 modules, procedural textures, kit-bashed interior (corridor,
cockpit, quarters, galley, bathroom), 3-layer starfield + 2 planets + nebulae,
post stack (N8AO/bloom/ACES/grain/vignette), shots harness. Playwright headless
works via SwiftShader (~0.5 fps there; capture via canvas toDataURL — page
screenshots hang in compositor). Draw calls ~200, tris ~110k → real-GPU 60 fps
is not in question.

Scores (harsh):
1. Lighting intentional — **FAIL**. Whole interior is washed out, near-white;
   no key/fill contrast; bloom smears everything bright.
2. Materials physical — **FAIL**. Glass is an opaque white mirror (env blowout).
   Painted panels wash to pure white; metals OK-ish.
3. Detail density — **FAIL**. Cockpit side walls + quarters walls read bare at
   this exposure; greebles exist but get nuked by the washout.
4. Post balanced — **FAIL**. Massive blown highlights (window = white sheet,
   corridor end = white blob). Grain/vignette fine, AO invisible under flat light.
5. Space sells motion — **FAIL**. Cockpit viewport is a glowing white wall;
   porthole shows faint planet behind mirror glass; no stars visible.
6. Cohesive palette — **PASS** (off-white/orange/teal/gray holds up in all 4).
7. Tech clean — **PASS** (no z-fight/acne/missing faces seen; budget light).
8. Cold-look — **FAIL** (reads "overexposed Three.js demo").
9. Interactions — **FAIL**. Hover ray missed all 3 (test aims pointed too high);
   prompts/fades implemented but unproven.

Fix list for iter 2 (worst first):
- Exposure 1.1→0.95, env 0.25→0.12, ambient down, ceiling lights dimmer; aim
  for moody contrast, AO visible, emissives glowing not flooding.
- Glass: metalness 0.9→0, opacity 0.05, envMapIntensity 0.3 — must be invisible.
- Space through windows: brighter stars, bigger/closer planets, stronger rim.
- Darken hull albedo (0.78→0.66 lightness), heavier grime/seams; darker floor.
- Bloom: threshold 0.85, strength 0.4; dim screens/strips so they glow only.
- Fix interaction test aim angles (pitch was too shallow, missed hover boxes).

## Iteration 2
Relit (exposure 0.95, env 0.10, bloom 0.38/0.88), glass now transparent
dielectric, stars pixel-sized, planets bigger; interaction aims fixed.

Scores:
1. Lighting — **FAIL** (better: warm/cool reads, but corridor end still blows
   out white; cockpit has odd teal cast over whole ceiling from console light).
2. Materials — **FAIL** (panels/metal/fabric read, but seat+blanket orange washes
   to beige; emissive cooktop rings wash to cream; counter metal OK).
3. Detail density — **FAIL** (quarters ceiling + wall above bed bare; cockpit
   sill band bare; corridor good).
4. Post — **FAIL** (bloom still floods corridor far end; otherwise balanced,
   AO now visible at panel seams).
5. Space motion — **FAIL** (moon visible from cockpit but ghostly — we placed
   bodies on the dark side of the sun; gas giant washed pale behind porthole;
   stars sparse in shots).
6. Palette — **PASS** (consistent, though orange drifts tan).
7. Tech — **PASS** (200 calls / 116k tris; no artifacts spotted).
8. Cold-look — **FAIL** (corridor close; quarters reads "clean dollhouse").
9. Interactions — **PASS** (all 3 hover→prompt→fire with messages + status,
   verified in stats.json + screenshots; highlight box is hideous butter slab).

Fix list for iter 3:
- Flip sun behind-starboard so planet faces toward ship are lit; gas giant →
  port side; moon ahead lit; add ringed crescent starboard. Window view → left
  porthole. Saturate planet bands.
- Kill cockpit teal cast (console light 5→2, range 2.6).
- Corridor: strips 2.4→1.8 emissive, lights 7, bloom .38/.88, fog .035.
- Quarters: cabinet above bed, ceiling housings/vent/pipe, lamp out of porthole
  sightline, headboard strip flush to wall; deeper orange fabric.
- Hover highlight: additive, opacity ~0.05 + edges.
- Cooktop rings/sign lights: lower emissive so color stays saturated.

## Iteration 3
Sun flipped, planets repositioned + ringed crescent added, quarters detailed,
hover toned down. Shots showed lit moon from cockpit, but the global "wash"
persisted. Spent the iteration root-causing it with A/B probes (red/blue/green
material swaps, sun off, AO off, bloom off): **N8AOPass was gamma-correcting
its output while OutputPass converts to sRGB again — the entire frame was
double-gamma'd since iteration 1.** Every light level we tuned was compensating
for that. Fixed with `n8ao.configuration.gammaCorrection = false`, then re-raised
lighting (exposure 1.05, env 0.16, practical lights +40%).

Scores: not formally scored — the pipeline fix invalidates the iter-3 captures
(judged from probes: palette/saturation massively better, oranges finally read
orange, rubber reads black). Interactions still pass (verified in stats.json).
Carrying over open items:
- Re-verify all 4 views under the corrected pipeline.
- Corridor far-end bloom, planet wash, quarters porthole framing.

## Iteration 4
First captures with the corrected (single-gamma) pipeline + rebalanced lights.

Scores:
1. Lighting — **FAIL** (cockpit/quarters/window now read deliberate and moody;
   corridor ruined by a giant warm bloom flood from the ceiling fixtures).
2. Materials — **FAIL** (metals/paint/fabric all read physical at last —
   porthole ring is genuinely good — but deck floor crushes to black, tread
   detail gone).
3. Detail density — **PASS** (paneling, greebles, pipes in every shot; no bare
   surface at these framings).
4. Post — **FAIL** (corridor bloom flood = blown highlight region; elsewhere
   balanced; grain/vignette/AO all visible and sane).
5. Space motion — **PASS** (cockpit: lit moon + rim + stars; window: saturated
   banded gas giant fills porthole; parallax layers run in motion).
   …borderline: gas giant so close no stars visible around it in window shot.
6. Palette — **PASS** (burnt orange / off-white / teal / gunmetal everywhere).
7. Tech — **PASS** (194-231 calls, ~115k tris; no z-fight/acne visible).
8. Cold-look — **FAIL** (corridor flood; galley under-cabinet teal flare).
9. Interactions — **PASS** (json + screenshots; cooktop rings glow orange now).

Fix list for iter 5:
- Bloom 0.30/0.5/0.90; warm strips 1.7; should kill the corridor flood.
- Floor albedo 46→58 + envMapIntensity 1.1 so tread reads in dark rooms.
- Gas giant to R=980 (porthole gets planet limb + rim + stars, not a wall of
  bands); rim 2.4.
- Galley brighter (pendant 24, fill 8); hover overlay opacity 0.02.
- AO 3.0 (quarters ceiling blotch).

## Iteration 5
Bloom calmed, floors lifted, gas giant pushed out (porthole now frames the
whole planet with limb + glow — looks great), galley brightened.

Scores:
1. Lighting — **FAIL**. Corridor STILL floods warm at the ceiling: the point
   lights sit 0.25 m under the ceiling, inverse-square nukes the nearby panels.
   Cockpit/quarters/window read intentional.
2. Materials — **PASS** (porthole metal, painted panels w/ wear, orange fabric,
   black rubber; visible roughness variation on counters/floors).
3. Detail density — **PASS**.
4. Post — **FAIL** (corridor ceiling region effectively blown; everything else
   balanced).
5. Space motion — **PASS** (planet + rim + stars through porthole; moon ahead;
   parallax layers + streaks in motion).
6. Palette — **PASS**.
7. Tech — **PASS**.
8. Cold-look — **FAIL** (corridor is the cold-look shot and it has the flood;
   rest of frame is genuinely close).
9. Interactions — **PASS**.

Fix list for iter 6:
- Corridor: replace ceiling point lights with downward SpotLights (fixtures
  stay emissive, light pools on the deck instead of nuking the ceiling).
- Floor metalness 0.55 + albedo lift again (deck still crushes under spots).
- Teal strips 2.4 + wall-base edge strips so the trench glow actually reads.
- Cockpit: add cool window-spill fill light; console glow 3.
- Quarters ceiling light lowered/strengthened slightly.

## Iteration 6
Corridor switched to downlight spots + edge strips: the shot finally has pools
of light, teal floor lines, readable depth. Cockpit gained cool window spill.

Scores:
1. Lighting — **FAIL** (close: corridor's nearest two ceiling fixtures still
   bloom into one hot mass at top of frame; everything else deliberate).
2. Materials — **PASS**.
3. Detail density — **PASS**.
4. Post — **FAIL** (same single hot region; rest balanced).
5. Space motion — **PASS** (gas giant framed with limb + glow in porthole now).
6. Palette — **PASS**.
7. Tech — **PASS** (~230 calls / 118k tris worst case).
8. Cold-look — **FAIL** (fixture bloom + galley teal flare + scene still reads
   slightly sterile/empty — no loose props anywhere).
9. Interactions — **PASS**.

Fix list for iter 7:
- Fixture emissives 1.5 + diffuser slats over the light quads (smaller bright
  area = less bloom); galley under-cabinet strip on a dim teal material.
- Hover overlay faces nearly invisible (0.008), edges only.
- Lived-in props: crates by engineering hatch, open maintenance recess with
  pipes/LEDs + leaning panel, pan on cooktop, mugs, boots by the bed.

## Iteration 7
Fixture diffuser slats + dimmer strips fixed the corridor blowout; props in.

Scores:
1. Lighting — **PASS** (corridor: defined fixtures, warm pools, teal accents,
   readable falloff; cockpit and quarters keep key/fill/accent separation).
2. Materials — **PASS** (metal ring, painted panels, fabric, rubber, glass all
   distinct; roughness breakup visible on counter/floor/walls).
3. Detail density — **PASS** (recess, props, conduits, ribs, grates, decals).
4. Post — **PASS** (no blown regions, no crushed blacks, AO/grain/vignette
   present but not loud).
5. Space motion — **PASS** (gas giant framed in porthole w/ limb glow + stars;
   moon ahead of cockpit; layered parallax + streaks in motion).
6. Palette — **PASS**.
7. Tech — **PASS** (239 calls / 120k tris worst view; no artifacts in shots).
8. Cold-look — **FAIL** (hesitated: corridor still perfectly mirror-symmetric
   — identical rails/boxes both sides — and the deck centre is empty).
9. Interactions — **PASS** (all three verified again; highlight now subtle).

Fix list for iter 8 (cold-look only, do not disturb passing items):
- Stagger junction boxes per side; hazard threshold stripes on the deck at the
  bulkheads; rubber cable run + clamps along the deck from the open recess;
  overhead grab handles alternating sides.

## Iteration 8 — first full pass
Symmetry broken (staggered junction boxes, one-sided recess + leaning panel,
deck cable run, alternating grab handles, threshold stripes).

Scores:
1. Lighting — **PASS** (warm pools + teal accents + cool space light; falloff
   reads deliberately in all four shots).
2. Materials — **PASS** (worn metal / painted panel / fabric / rubber / glass;
   reflections on porthole ring and deck; roughness breakup everywhere).
3. Detail density — **PASS** (no bare surface in any framing).
4. Post — **PASS** (ACES + bloom contained to emissives, AO grounded, grain +
   vignette subtle; no blown regions, no crushed blacks).
5. Space motion — **PASS** (banded gas giant with limb glow + stars in the
   porthole; lit moon with atmosphere rim ahead of the cockpit; 3-layer
   parallax + near-hull streaks sell flight in motion).
6. Palette — **PASS** (burnt orange / bone white / teal / gunmetal, all shots).
7. Tech — **PASS** (worst view 239 calls / 122k tris, 1×1024 + 2×512 shadow
   maps; no z-fighting/acne/missing faces in any capture. SwiftShader cannot
   measure real fps; this budget is comfortably 60fps-class on a mid-range
   laptop GPU).
8. Cold-look — **PASS** (no hesitation this time: corridor reads as a game
   screenshot — lived-in, lit, art-directed).
9. Interactions — **PASS** (hover→prompt→E→fade/message/status verified for
   bed/galley/sink; highlight reads as thin edge wireframe).

9/9. Stopping condition requires a second consecutive full pass → iteration 9
re-captures with zero code changes to confirm stability.

## Iteration 9 — second consecutive full pass (STOP)
Zero code changes; re-captured all views + interaction smoke tests. All four
shots hold up (the gas giant had drifted slightly in the porthole between
runs — incidental confirmation that the space motion is live). All three
interactions re-verified. **9/9 again → stopping condition met.**

---

# FINAL SUMMARY

## What passed (and why I believe it)
- **Lighting**: every room has a deliberate key (corridor downlight spots,
  quarters reading lamp, galley pendant, cockpit console + cool window spill),
  warm practicals against cool space light, and emissive accents that glow
  without flooding. The rest-cycle toggle re-grades the whole interior.
- **Materials**: five distinct PBR families (worn painted hull, dark painted
  band, brushed/worn metal, fabric/rubber, glass) — all canvas-procedural with
  matching roughness + normal maps; PMREM environment gives metals real
  reflections.
- **Detail density**: panel grids with stencils/vents/accent stripes, corridor
  ribs, ceiling pipe runs with clamps, wall conduits + junction boxes, floor
  trench grates with teal glow, threshold hazard stripes, crates, an open
  maintenance recess, grab handles, props (pan, mugs, boots).
- **Post**: ACES + UnrealBloom (0.30/0.5/0.90) + N8AO + vignette + grain +
  exp fog. The critical fix of the whole project: N8AO was gamma-correcting
  inside the chain while OutputPass converted to sRGB again — everything
  before iteration 4 was tuned against a double-gamma'd frame.
- **Space**: 3-layer drifting starfield + near-hull speed streaks, banded gas
  giant (custom shader: sun-lit bands + fresnel rim + additive atmosphere
  shell) sliding past the port porthole on a 340 s orbit, lit moon ahead of
  the cockpit, ringed crescent far starboard, nebula sprites, sun glow.
- **Interactions**: raycast hover + edge highlight + prompt; bed (fade,
  "8 hours pass", rest-cycle lighting), galley ("Energy restored"), bathroom
  (fade, "Refreshed"); one-line HUD status with ship clock.
- **Tech budget**: worst view 239 draw calls / ~122 k tris, one 1024 shadow
  map + two 512 spot shadows, AO at half res. 60 fps on a mid-range laptop GPU
  is comfortably within budget (SwiftShader CI can't measure real fps).

## What is still weak
- The fabric quilt seams read slightly oversized up close on the bed.
- Quarters ceiling has a soft AO blotch near the vent housing.
- The porthole "depth tube" interior is plain; at extreme angles it reads flat.
- Stars are uniform points — no bright cross-flare hero stars.
- Head-bob/rumble is tuned by feel, never validated by a human play session.
- HUD (DOM) isn't in the canvas captures; interaction proof relies on DOM
  state JSON + lighting change visible in renders.

## With five more iterations I would
1. Bake an interior-specific PMREM (render a cube probe in the corridor) so
   metals reflect the actual orange/teal interior instead of RoomEnvironment.
2. Animate the screens (canvas redraw at 2-4 Hz: scrolling text, radar sweep)
   and add a slow camera-facing dust mote particle layer in the light pools.
3. Give the gas giant a proper day/night city-light texture + cloud-shadow
   layer, and add a slow ship roll (0.5°) so the starfield drifts in all axes.
4. Replace AABB collision with capsule-vs-OBB so the leaning panel and angled
   cockpit walls collide exactly.
5. Footstep-synced bob + soft audio (engine hum loop, footsteps, UI blips) —
   sound is half the cold-look test in practice.
