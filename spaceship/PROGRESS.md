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
