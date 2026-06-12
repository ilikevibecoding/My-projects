# PROGRESS — Mini Rocket-Launch Demo (self-evaluating loop)

Stack: Vite + three (npm). All assets procedural. Headless evaluation via
Playwright (`tools/shots.mjs`) on system Chrome with SwiftShader WebGL2.

**Standing caveat (said once, applies every iteration):** the eval environment
renders with SwiftShader (software). Frame-time numbers from headless runs do
not represent a mid-range laptop GPU, so the "60 fps" rubric item is judged by
budget discipline — draw calls, triangle count, particle caps, shadow/AO
resolution — plus relative frame-ms regression between iterations.

## Rubric (pass/fail each iteration)
1. Rocket reads stylized-real (chunky, saturated, panel lines/decals, not gray)
2. Exhaust sells (hot core; billow at liftoff; vacuum-widened plume; frames differ)
3. Climb gradient works (blue → clouds → limb band → black/stars; continuous journey)
4. Launch site reads finished (terrain, pad, tower, props, shadows agree)
5. Builder clean (styled UI, snap stacking, live stats incl. TWR)
6. Physics honest from telemetry (TWR<1 stays down; accel builds; drag bites low;
   cutoff → coast → descent; space in 60–90 s)
7. Staging works (detach, tumble, fall away)
8. Camera never fails (smooth chase, no clipping)
9. Post stack on + balanced (ACES, bloom, AO, vignette, grain; no blown/crushed)
10. Tech clean (60 fps budgets, no z-fighting, no shadow acne)
11. Cold-look test (liftoff / high-altitude shot passes as a real stylized indie game)

---

## Iteration 1 — vertical slice (everything wired end-to-end)

Built all 10 modules + tools/shots.mjs; full pipeline ran: 8 screenshots, 4 telemetry
scenarios, builder stats assertion. Evidence: `shots/iter_1/`.

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Rocket stylized-real | **FAIL** | Decent in builder (cream/orange/teal, stripes), but washed out in flight shots; pod plain; decals illegible at gameplay distance |
| 2 | Exhaust sells | **FAIL** | Plume is a blown white column everywhere (esp. staging.png); layering unreadable; vacuum widening not visible (space cam looks down the axis); frames a/b do differ ✓ |
| 3 | Climb gradient | **FAIL** | pad=blue ✓, high_altitude/space genuinely promising (limb band + stars ✓), but midair is washed-out haze and clouds render as scattered white DOTS (bokeh garbage) breaking every shot |
| 4 | Launch site finished | **FAIL** | Huge bare gray pad; hold-down clamps read as random black cubes; terrain a flat neon green; flag crumpled; tower/props OK |
| 5 | Builder clean | **PASS** | Styled palette+thumbnails+stats; add tank: mass 6.95→12.10 t, TWR 1.22→0.70 (red) ✓; snap stacking clean in shot |
| 6 | Physics honest | **FAIL** | accel builds ✓ (2.47→10.9), drag low>high ✓ (0.402 vs 0.116), lowtwr stays at 0 m ✓, BUT space at 49 s (<60) and coast scenario reached space (apogee 108 km!) instead of coasting back |
| 7 | Staging works | **FAIL** | staged telemetry: zero stage events (trigger waited for flameout that never came before space); staging.png: detached stage invisible (lost inside blown plume) |
| 8 | Camera never fails | **FAIL** | liftoff.png points at empty sky — no pad/dust in frame; space cam looks down plume axis |
| 9 | Post balanced | **FAIL** | ACES/bloom/AO/vignette/grain all on, but plume regions hard-blown white |
| 10 | Tech clean | **PASS*** | 58 draw calls, 16 k tris, no z-fighting/acne seen in shots; *SwiftShader caveat (budgets honored: flame 16, smoke 33 live) |
| 11 | Cold-look | **FAIL** | high_altitude is the closest (planet ball + limb + stars genuinely pretty) but dot-clouds + blown plume give it away |

**Score: 2/11 (plus caveats).**

### Fix list for iteration 2 (worst first)
1. Clouds: full redo — dense puffy texture (flat bottom, high-alpha core), 15-ish clusters
   instead of uniform scatter, larger sizes, cap radius ≤1.9 km so they don't pepper the sky.
2. Plume blow-out: cone alpha down, bloom threshold 0.9 / strength ~0.45, smoke/flame
   opacity down, kill smoke in thin air; keep hot core readable instead of white wall.
3. Physics: engineLarge 76→66 kN, burn 21 kg/s → space at 64.0 s (node tune sweep);
   coast fuelFraction 0.30→0.10 → apogee 3 388 m, crash at 99 s ✓.
4. Staged telemetry: fire the decoupler at 2 200 m (not at flameout-that-never-comes).
5. Liftoff camera: pull back + lower look target so pad, dust and plume are all in frame.
6. Space camera: side-ish view (show vacuum-wide plume) while keeping limb in frame;
   start below the space line so the SPACE REACHED banner appears in the shot.
7. Staging camera: bigger lateral offset + stronger debris side-kick so the spent stage
   clears the plume visually.
8. Limb shell: too thick ("glass ball") — tighten radius ~R+450, sharper fresnel.
9. Sky gradient: delay indigo onset; 2.6 km should still read blue, not pale lavender.
10. Suppress HUD flash text during debug warm-up (stray "IGNITION" ghosts in shots).
11. Pad dressing: smaller pad disc, higher-contrast markings, restyle clamps, more props.

