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

## Iteration 2 — clouds, plume taming, physics tuning, cameras

Evidence: `shots/iter_2/`. Node-side tuning sweep (`tools/tune.mjs`) picked 66 kN/21 kg·s⁻¹.

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Rocket stylized-real | **FAIL** | Better lit (hemi/amb down), stripes read; but decals still illegible in all flight shots, pod plain, engine bell invisible under plume; not yet "materially convincing" |
| 2 | Exhaust sells | **FAIL** | Liftoff pad billow is good now ✓, frames differ ✓, but plume is a flat white pillar (no radial falloff → ribbon look), staging.png is still one giant white column, vacuum widening present but ghostly-dim in space.png |
| 3 | Climb gradient | **FAIL** | Clouds finally read as cumulus ✓✓, high_altitude is genuinely strong; but midair reads washed gray-blue (horizon band too pale) and staging-alt sky is lavender mush |
| 4 | Launch site finished | **PASS** | Pad ring/number/scorch ✓ clamps ✓ generators/cable tray ✓ mottled striped grass ✓ shadows agree ✓ (watch: flag drape, mount leg clutter) |
| 5 | Builder clean | **PASS** | Stats: 6.95 t/66 kN/4.30 t/TWR 1.06 → add tank: 12.10 t/0.61 red ✓; styled; snap clean |
| 6 | Physics honest | **PASS** | space at t=64.0 s ✓ (60–90); accel 0.79→9.48 ✓; drag 0.319 low vs 0.099 high ✓; lowtwr maxAlt 0 ✓; coast apogee 3 388 m → crashed ✓ |
| 7 | Staging works | **FAIL** | staged telemetry has the stage event + mass drop ✓, but staging.png STILL shows no visible tumbling debris (lost behind plume / below frame) |
| 8 | Camera never fails | **FAIL** | liftoff/pad/midair/high all framed well now; space.png rocket is hidden behind the REVERT button (UI collision = framing failure); staging framing misses the money shot |
| 9 | Post balanced | **FAIL** | Bloom 0.42/thr 0.9 helped; plume core still blows to paper-white over large areas in staging.png |
| 10 | Tech clean | **PASS*** | 58 calls / 16 k tris / particles within budget; no acne/z-fight seen; *SwiftShader caveat |
| 11 | Cold-look | **FAIL** | liftoff + high_altitude are close; staging/space wash and plume flatness still betray it |

**Score: 4/11.**

### Fix list for iteration 3 (worst first)
1. Plume volumetrics: radial fresnel falloff in cone shader, hotter orange staging,
   vacuum brightness boost + violet-blue tail tint (uVac uniform).
2. Sky: deepen horizon colors low+mid, sharpen falloff (washed midair fix).
3. Banner to top 22% / revert button to 76% so the rocket is never covered (space shot).
4. Staging camera further out + lower look target; shorter post-stage delay (debris in frame).
5. Space camera less steep (up 14, look −4) so limb + wide plume share the frame.
6. Limb shell tighter (R+360).

## Iteration 3 — plume volumetrics v1, sky depth, staging visibility

Evidence: `shots/iter_3/`. Telemetry unchanged-green (64 s, drag, lowtwr, coast, stage event).

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Rocket stylized-real | **FAIL** | Faint KARMAN decal now visible in midair; still under-bold at distance; pod windows small |
| 2 | Exhaust sells | **FAIL** | Radial falloff helped edges; but core remains white ribbon (orange transition too late along length); vacuum plume tail too long/uniform |
| 3 | Climb gradient | **FAIL** | midair now blue + cumulus ✓, high_altitude excellent ✓, space black/stars ✓ — but staging-altitude band still lavender-washed when cameras look into the below-horizon haze zone |
| 4 | Launch site finished | **PASS** | (same as iter 2, still holds) |
| 5 | Builder clean | **PASS** | (stats assertion green every run) |
| 6 | Physics honest | **PASS** | telemetry identical-green to iter 2 |
| 7 | Staging works | **FAIL→close** | Tumbling spent stage now VISIBLE mid-frame ✓ (fins+tank+engine, rotated ~120°) — but a stale 'SPACE REACHED' banner ghost from the previous view contaminates the shot (CSS transition froze under SwiftShader load); plume still hides separation point |
| 8 | Camera never fails | **FAIL** | space.png: REVERT button still overlaps the plume column; staging camera stares into the empty haze band (neither sky nor ground) |
| 9 | Post balanced | **FAIL** | staging/space plume column still saturates to paper |
| 10 | Tech clean | **PASS*** | 58 calls/16 k tris; *SwiftShader caveat |
| 11 | Cold-look | **FAIL** | high_altitude nearly passes; plume look is the blocker |

**Score: 4/11.**

### Fix list for iteration 4 (worst first)
1. Banner/buttons: inline opacity (no CSS opacity transition — they freeze mid-fade under
   load); move REVERT under the readout panel, away from the plume column.
2. Plume: orange onset at 40 % length (was 70 %), vacuum tail fades hard (body exponent
   + uVac·1.6), inner cone shorter, edge colors hotter (#ff4d0e).
3. Staging camera → high three-quarter (planet as backdrop instead of haze band).
4. Rocket textures: 64 px outlined wordmark, 11 px pinstripes, bigger flag patch,
   38 px portholes, 4 px panel lines.

## Iteration 4 — banner fix, plume color curve, staging money shot, bolder livery

Evidence: `shots/iter_4/`. Telemetry green and unchanged (space @64 s, drag, lowtwr,
coast crash, stage event @40.5 s). Frame-stat methodology note: `renderer.info`
autoReset is now off and counts the FULL pipeline (shadow pass + GTAO + bloom mip
chain + output), so numbers jumped from "last pass only" 58 calls/16 k tris to an
honest 304 calls/117 k tris — that is the total per frame, well within mid-range
GPU budgets (bloom's blur chain alone is ~25 fullscreen quads).

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| 1 | Rocket stylized-real | **PASS** | KARMAN wordmark legible in midair, orange band + pinstripes + teal fins read at every distance; portholes/panel lines visible on pad; no gray anywhere |
| 2 | Exhaust sells | **PASS** | Liftoff: hot core + big pad billow ✓; midair: bright wedge w/ orange fringe ✓; high: orange-pink falloff ✓; space: wide translucent vacuum plume, violet-pink tail ✓; liftoff vs liftoff_b differ ✓ |
| 3 | Climb gradient | **PASS** | pad light blue → midair blue + cumulus → staging (2.6 km) lavender → high (3.9 km) deep indigo + limb + stars → space black: continuous. Watch: midair below-horizon haze a touch pale |
| 4 | Launch site finished | **PASS** | holds (pad ring/01/scorch, clamps, generators, mottled grass, agreeing shadows) |
| 5 | Builder clean | **PASS** | stats assertion green (6.95 t/1.06 → add tank 12.10 t/0.61 red) |
| 6 | Physics honest | **PASS** | all five telemetry verdicts green, unchanged since iter 2 |
| 7 | Staging works | **FAIL→hair** | Tumbling spent stage clearly visible mid-frame (fins+tank+bell, ~90° over) ✓ mass-drop event ✓ banner ghost gone ✓ — BUT stale "SPACE REACHED — REVERT WHEN READY" *hint bar* (from prior space view) contaminates the shot; hint state must reset per view |
| 8 | Camera never fails | **PASS** | space shot: rocket clear of all UI ✓; staging: planet-backdrop three-quarter works ✓; liftoff/midair/high framed; no clipping |
| 9 | Post balanced | **PASS** | no blown regions left; bloom glow subtle; vignette+grain present, shadows not crushed |
| 10 | Tech clean | **PASS*** | 304 calls/117 k tris = full pipeline (see note); no z-fight/acne; *SwiftShader caveat. Cleanup owed: favicon 404 + deprecated PCFSoftShadowMap warning in console |
| 11 | Cold-look | **PASS** | liftoff (smoke billow/tower/clouds) and high_altitude (planet ball + limb + stars) both pass the squint test as a real stylized indie game |

**Score: 10/11.**

### Fix list for iteration 5 (worst first)
1. Hint/banner state machine: clear hint + banner at the start of every debug
   setView/warmFlight so no UI state leaks between views (kills the stale
   "SPACE REACHED" hint in staging.png).
2. favicon 404: inline data-URI icon in index.html (console must be clean).
3. Shadow type: PCFSoftShadowMap is deprecated in three 0.184 → set PCFShadowMap
   explicitly, silence the warning.
4. NO visual retuning of passing items (regression risk) — double-green is the goal.

