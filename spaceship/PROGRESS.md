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
