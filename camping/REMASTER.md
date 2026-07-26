# Visual Remaster — Baseline Record

Gameplay, controls, progression, level layout and interactions are frozen.
Only how the game *looks* is in scope.

---

## 1. Rendering environment (measured, not assumed)

Every launch path on this machine resolves to the same software rasteriser.

| Launch path | Unmasked WebGL renderer | Hardware? | Strict HW context (`failIfMajorPerformanceCaveat`) |
|---|---|---|---|
| Plain Chrome, default flags ("normal player launch" here) | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` | **No — software** | **Refused** |
| Headed Playwright (harness / perf runs) | same string | **No — software** | **Refused** |
| Headed Playwright + `--use-angle=swiftshader` | same string | **No — software** | Granted¹ |
| Headless capture worker | same string | **No — software** | **Refused** |

¹ Forcing the backend makes Chrome stop reporting a performance caveat even
though the renderer is unchanged. The unmasked renderer string — not
`failIfMajorPerformanceCaveat` — is the reliable signal.

**There is no physical GPU available to the agent.** No SwiftShader-vs-GPU
comparison can be made here, and per the brief no further time was spent trying
to obtain one. Chrome's `chrome://gpu` page cannot be dumped in this container
(headless `--dump-dom chrome://gpu` returns an empty document), so the
unmasked-renderer probe above is the authoritative record.

### Consequences that shaped the harness

1. **`--use-angle=swiftshader` is mandatory.** Chrome's *automatic* software
   fallback submits frames ~36x slower than explicitly selecting the same
   backend, despite reporting an identical renderer string.
2. **An open CDP evaluation starves rendering.** `page.evaluate(() => new
   Promise(...))` and `waitForFunction` polling run a nested message loop in
   the renderer; frame submission collapses by ~90x. Every wait in the harness
   sleeps in Node and then makes one short synchronous evaluate.
3. **Sustained software rendering trips Chrome's GPU watchdog.** The context is
   lost roughly 90 s into a session and every ~60 s after; three.js does not
   recover, so every later capture is silently blank.
   `--disable-gpu-watchdog` kills the whole browser and is worse.
4. **`window.__FRAME` counts *submitted* frames, not rasterised ones**, and
   `gl.finish()` does not force completion — ANGLE/SwiftShader defers
   rasterisation until something reads the surface. Naive measurement reported
   9–13 fps for frames that actually take seconds.

The harness therefore runs the game in **manual mode** (set before boot): the
simulation is advanced by an exact number of fixed 1/60 steps and exactly one
frame is rendered and read back per capture, inside a single synchronous call.
This is reliable (117/117 baseline captures, zero errors), ~40x faster than the
previous approach, and makes animation state deterministic instead of dependent
on machine load.

---

## 2. Performance policy

| | Target |
|---|---|
| Release target | **stable 60 fps @ 1920×1080** on a normal hardware-accelerated browser |
| Release floor | **30 fps** minimum |
| Agent environment | software rasteriser only — used for **relative** regression tracking |

* Official measurements run on **one** browser instance with nothing else
  rendering. Parallel workers may capture functional states but are never used
  for performance acceptance.
* Software timings force pipeline completion (`glFinish()` **plus** a 1×1
  `readPixels`), otherwise the numbers are fiction.
* **The graphical target is not lowered because the agent lacks a GPU.**

### ⚠ Hardware test that must be run by a human

Open the game in a normal browser on a machine with a real GPU and confirm:

1. `chrome://gpu` shows hardware-accelerated WebGL, and the unmasked renderer is
   the physical GPU.
2. Stable 60 fps at 1920×1080 standing in the dense forest view, panning across
   the treeline, and at the campsite at night with the fire lit.
3. No frame-time spikes above 33 ms while walking (asset streaming / LOD pops).

### Software baseline (pre-remaster, single instance)

| View | ms/frame | p95 | draw calls | triangles | overdraw¹ | texture mem | visible foliage |
|---|---|---|---|---|---|---|---|
| forest_dense @1280×720 | 5402 | 5626 | 339 | 2.60 M | 40.9× | 1.83 MB | 297 |
| camp @1280×720 | 4583 | 4672 | 229 | 2.13 M | 38.2× | 1.83 MB | 255 |
| forest_dense @1920×1080 | 8046 | 8238 | 339 | 2.60 M | 40.9× | 1.83 MB | 297 |

¹ Average coverage per pixel with depth testing disabled — an upper bound that
is directly comparable between builds. **~40× is the headline problem**: the
scene is drowning in overlapping alpha-blended grass and foliage.

**Budgets for the remaster** (must not regress at equal or better quality):
draw calls ≤ 400, triangles ≤ 2.6 M, overdraw ≤ 40×, texture memory ≤ 24 MB,
software ms/frame ≤ baseline for the same view.

---

## 3. Asset inventory and ranked weaknesses

39 states are captured at 1280×720, 1920×1080 and 1366×768 (`tools/capture.mjs`),
plus 4 animation pairs and a 16-check real-input playthrough.

Ranked by damage to the overall presentation:

| # | Asset / area | Why it fails | Technique planned |
|---|---|---|---|
| 1 | **Conifer foliage** | Stacks of hard-faceted cones. No needles, no branch structure, no depth; a flat triangular silhouette repeated hundreds of times. Dominates every forest view. | Alpha-tested needle-sprig atlas on real whorled branch geometry; near/mid/far LODs; impostors for the distant treeline |
| 2 | **Broadleaf foliage** | Clumps of low-poly spheres — reads as blobs, no leaves, no branches | Leaf-cluster cards on branch geometry, same atlas pipeline |
| 3 | **Grass** | Huge flat quads visible as rectangles up close, one hue, uniform height, obvious repeating pattern, and the main source of the 40× overdraw | Tighter cards, height/hue/phase variation, species mix, aggressive distance fade, fewer + better blades |
| 4 | **Ground / terrain surface** | Flat green and flat brown with a hard path edge and no near-field detail | Detail-texture blending, path edge break-up, scatter of ground debris |
| 5 | **Tent** | Flat orange triangle: no floor, no back wall (interior reads as a black void), no guy lines, pegs or fabric detail | Rebuild with fabric shading, seams, guys, pegs, closed rear, lit interior |
| 6 | **Sky & clouds** | Flat gradient with soft white blobs; no depth, no sun scatter | Layered cloud noise, sun disc + scatter, better horizon falloff |
| 7 | **Distant mountains** | Grey/white low-poly cones with no aerial perspective | Ridge silhouettes, snow lines, distance haze |
| 8 | **Rocks** | Grey blobs, uniform | Sharper facets, lichen/moss variation, better contact |
| 9 | **Logs / woodpile** | Plain cylinders, dark uniform bark | End-grain rings, bark relief, varied sizes |
| 10 | **Campfire** | Billboard flames, weak embers | Layered flames, embers, better light falloff |
| 11 | **Water** | Flat dark teal, hard shoreline | Shoreline blend, better normals, depth tint |
| 12 | **HUD** | Plain text, no visual identity | Typography, prompt framing, state feedback |

Cross-cutting: no aerial perspective, everything equally saturated at all
depths, weak contact shadows, no foreground framing.

---

## 4. Conifer spike (stream A, first pass)

The cone-stack pines were rebuilt as: photographic needle sprigs cut into an
alpha-tested atlas, mounted on real whorled branch geometry, with three levels
of detail and impostors rendered from the detailed tree itself. Details are in
`src/conifer.js` and `tools/atlas.mjs`.

**Halo check** (the specific risk with black-background extraction). The atlas
builder un-premultiplies, edge-dilates and then measures its own mip chain:

| level | size | mean covered colour |
|---|---|---|
| base | 1024² | (73.4, 94.6, 53.5) |
| mip 1 | 512² | (73.1, 94.1, 53.3) |
| mip 3 | 128² | (77.7, 98.9, 56.9) |
| mip 5 | 32² | (82.4, 104.5, 61.8) |

Worst-case ratio **0.996** — no darkening, so no black outlines. Confirmed
visually by compositing the atlas over magenta.

**Benchmark, intentionally difficult forest view, single instance:**

| Metric | Baseline (cones) | Spike | Δ |
|---|---|---|---|
| forest_dense @1280×720 | 5402 ms/frame | 7896 ms/frame | +46% |
| camp @1280×720 | 4583 ms/frame | 4750 ms/frame | +4% |
| triangles, forest_dense | 2.60 M | 3.20 M | +23% |
| triangles, camp | 2.13 M | **1.97 M** | −8% |
| draw calls | 339 | 379 | +12% |
| overdraw | 40.9× | 53.2× | +30% |
| texture memory | 1.83 MB | 6.50 MB | budget 24 MB |
| visible foliage cards | n/a (cone tiers) | ~27 000 | 37 near / 114 mid / 269 impostor |
| hardware result | — | **not measurable here** — see §2 | |

**The important finding:** cutting triangles by 28% did not change frame time
at all. The cost is fill, not geometry — on this rasteriser overdraw is
everything. And the camp view sits at 39.7× overdraw with almost no conifers on
screen, which means **grass is the dominant global fill cost**, not trees.
Grass is therefore promoted ahead of broadleaf in the work order, and card
silhouette trimming is added to the plan for every foliage type.

---

## 5. Harness reference

```
node tools/capture.mjs <pass> [--viewports=1280x720,1920x1080,1366x768]
                              [--only=<state|group>] [--workers=N]
                              [--play] [--perf]
```

* `--play` — real key/mouse playthrough: walk, strafe, back, pointer-lock mouse
  look, hover + interact with firepit / woodpile / seat log / tent, stand, sleep,
  and a final render check. 16/16 passing.
* `--perf` — official single-instance measurement. Never run with workers.
* Output: `shots/remaster/<pass>/` with a `report.json` recording per-state draw
  calls, triangles, verified time-of-day / fire state, HUD assertions and all
  console/page errors.

### Bugs found and fixed while building the baseline

1. Interaction hover used the previous render's camera matrix — the crosshair
   target lagged one frame behind the camera.
2. Interaction raycasts used stale target world matrices, so before the first
   draw the tent's collider still sat at the origin and aiming at the firepit
   reported the tent.
3. Adding wood used a wall-clock `setTimeout(600 ms)` while the log's flight is
   simulation-driven (0.625 s), so the fire's flare drifted out of sync with the
   log landing at low frame rates.
