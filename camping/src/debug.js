// window.debugAPI — deterministic camera views + state control for the
// screenshot harness (tools/shots.mjs). Also handy in the browser console.
import * as THREE from 'three';
import { getConiferForests } from './vegetation.js';
import { getTerrainHeight, POND, WATER_LEVEL } from './terrain.js';

export function installDebugAPI({ player, timeOfDay, camp, interactions, renderer, hud, scene, camera }) {
  const h = (x, z) => getTerrainHeight(x, z);

  // --- scene introspection: find real instance positions so inspection views
  // never land inside a trunk or float in the air ---------------------------
  const _m = new THREE.Matrix4();
  function instancePositions(meshName) {
    const trees = scene.getObjectByName('trees');
    if (!trees) return [];
    const mesh = trees.children.find((c) => c.name === meshName);
    if (!mesh || !mesh.isInstancedMesh) return [];
    const out = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      out.push(new THREE.Vector3(_m.elements[12], _m.elements[13], _m.elements[14]));
    }
    return out;
  }

  let _cache = null;
  function treeData() {
    if (_cache) return _cache;
    // conifers are LOD-managed, so their authoritative positions live on the
    // forest object rather than in any single instanced mesh
    const forests = getConiferForests();
    const pines = forests.length
      ? forests[0].trees.map((t) => t.pos.clone())
      : instancePositions('pineTrunks');
    const leaves = instancePositions('leafTrunks');
    // densest pine: most neighbours within 14 m (the hardest view to render)
    let densest = pines[0] || new THREE.Vector3(-40, 0, -40);
    let bestN = -1;
    for (const p of pines) {
      if (Math.hypot(p.x, p.z) > 95) continue; // stay inside the playable bowl
      let n = 0;
      for (const q of pines) if (p !== q && p.distanceToSquared(q) < 196) n++;
      if (n > bestN) { bestN = n; densest = p; }
    }
    // a lone-ish pine near the forest lobe for trunk/canopy close-ups
    let subject = pines[0] || densest;
    let bestScore = -Infinity;
    for (const p of pines) {
      const r = Math.hypot(p.x, p.z);
      if (r < 30 || r > 70) continue;
      let near = 0;
      for (const q of pines) if (p !== q && p.distanceToSquared(q) < 64) near++;
      const score = -Math.abs(near - 1) - Math.abs(r - 45) * 0.05;
      if (score > bestScore) { bestScore = score; subject = p; }
    }
    let leafSubject = leaves[0] || new THREE.Vector3(20, 0, -20);
    let lb = -Infinity;
    for (const p of leaves) {
      const r = Math.hypot(p.x, p.z);
      if (r < 18 || r > 55) continue;
      if (-Math.abs(r - 30) > lb) { lb = -Math.abs(r - 30); leafSubject = p; }
    }
    _cache = { pines, leaves, densest, densestNeighbours: bestN, subject, leafSubject };
    return _cache;
  }

  // camera placed `dist` from `target` along a compass angle, at eye height
  function lookAtFrom(target, dist, angle, eyeOff = 1.7, aimY = null) {
    const px = target.x + Math.cos(angle) * dist;
    const pz = target.z + Math.sin(angle) * dist;
    const py = h(px, pz) + eyeOff;
    return { pos: [px, py, pz], target: [target.x, aimY ?? (target.y + 1.2), target.z] };
  }

  // named views: [posX, posY, posZ, targetX, targetY, targetZ]
  function views() {
    const fire = camp.positions.fire;
    const pile = camp.positions.pile;
    const seat = camp.positions.seat;
    const tent = camp.positions.tent;
    return {
      camp: {
        pos: [5.6, h(5.6, 4.8) + 1.7, 4.8],
        target: [tent.x, fire.y + 1.1, tent.z],
      },
      vista: {
        pos: [-50, h(-50, 6) + 5.5, 6],
        target: [170, 75, -10],
      },
      forest: {
        pos: [-14, h(-14, -16) + 1.7, -16],
        target: [-55, h(-55, -48) + 6, -48],
      },
      pond: {
        pos: [POND.x - 14.5, WATER_LEVEL + 2.3, POND.z + 9],
        target: [POND.x + 10, WATER_LEVEL + 1.2, POND.z - 6],
      },
      aim_fire: { pos: [fire.x + 2.2, fire.y + 1.7, fire.z + 0.6], target: [fire.x, fire.y + 0.35, fire.z] },
      aim_wood: { pos: [pile.x + 2.0, pile.y + 1.7, pile.z - 0.8], target: [pile.x, pile.y + 0.35, pile.z] },
      aim_log: { pos: [seat.x + 1.9, seat.y + 1.5, seat.z + 1.3], target: [seat.x, seat.y, seat.z] },
      aim_tent: { pos: [tent.x + 2.6, tent.y + 1.8, tent.z + 2.0], target: [tent.x, tent.y + 0.9, tent.z] },

      // ---- inspection views for the visual remaster (data-driven) ----------
      ...(() => {
        const t = treeData();
        const s = t.subject;
        const ls = t.leafSubject;
        const d = t.densest;
        const gx = 3.0, gz = 5.5; // open meadow spot near camp
        const gy = h(gx, gz);
        return {
          // conifer detail
          pine_trunk: lookAtFrom(s, 3.2, 0.9, 1.7, h(s.x, s.z) + 1.6),
          pine_canopy: lookAtFrom(s, 7.0, 2.2, 1.7, h(s.x, s.z) + 6.2),
          pine_midshot: lookAtFrom(s, 14.0, 1.5, 1.7, h(s.x, s.z) + 4.0),
          // THE benchmark view: stand back from the densest cluster and look
          // straight into it, so the frame is packed with foliage (worst-case
          // overdraw) without the camera being buried inside a canopy.
          forest_dense: (() => {
            const ang = Math.atan2(d.z, d.x); // look inward from outside the cluster
            const px = d.x + Math.cos(ang) * 22;
            const pz = d.z + Math.sin(ang) * 22;
            return {
              pos: [px, h(px, pz) + 1.7, pz],
              target: [d.x, h(d.x, d.z) + 5.5, d.z],
            };
          })(),
          // broadleaf detail
          broadleaf_canopy: lookAtFrom(ls, 8.0, 1.1, 1.7, h(ls.x, ls.z) + 4.4),
          understory: lookAtFrom(ls, 4.5, 2.6, 1.4, h(ls.x, ls.z) + 0.8),
          // ground / grass
          ground_near: { pos: [gx, gy + 1.7, gz], target: [gx + 1.4, gy - 0.1, gz + 1.4] },
          grass_near: { pos: [gx + 6, h(gx + 6, gz + 6) + 0.9, gz + 6], target: [gx + 8.5, h(gx + 8, gz + 8) + 0.15, gz + 8.5] },
          path_edge: { pos: [9.5, h(9.5, 3.4) + 1.5, 3.4], target: [16, h(16, 5.5) + 0.2, 5.5] },
          // rock + water
          rock_near: { pos: [POND.x - 6.5, WATER_LEVEL + 2.0, POND.z + 12.5], target: [POND.x - 2.5, WATER_LEVEL + 0.4, POND.z + 8.5] },
          shoreline: { pos: [POND.x - 12, WATER_LEVEL + 1.5, POND.z + 7], target: [POND.x - 2, WATER_LEVEL - 0.1, POND.z + 1] },
          water_surface: { pos: [POND.x - 11, WATER_LEVEL + 1.1, POND.z + 5], target: [POND.x + 6, WATER_LEVEL + 0.25, POND.z - 4] },
          // sky + distance
          sky_zenith: { pos: [0, h(0, 0) + 1.7, 0], target: [6, h(0, 0) + 40, 2] },
          sky_horizon: { pos: [-50, h(-50, 6) + 5.5, 6], target: [180, h(-50, 6) + 12, -10] },
          mountain_ridge: { pos: [-58, h(-58, 10) + 6.0, 10], target: [280, 130, -40] },
          treeline_silhouette: { pos: [12, h(12, 24) + 1.7, 24], target: [-30, h(-30, 60) + 12, 60] },
          // camp
          camp_wide_low: { pos: [7.5, h(7.5, 6.5) + 1.05, 6.5], target: [tent.x, fire.y + 0.9, tent.z] },
          tent_close: { pos: [tent.x + 3.4, tent.y + 1.6, tent.z + 2.6], target: [tent.x, tent.y + 1.0, tent.z] },
          firepit_close: { pos: [fire.x + 1.9, fire.y + 1.35, fire.z + 1.4], target: [fire.x, fire.y + 0.3, fire.z] },
          woodpile_close: { pos: [pile.x + 1.7, pile.y + 1.3, pile.z - 1.1], target: [pile.x, pile.y + 0.3, pile.z] },
          seatlog_close: { pos: [seat.x + 1.8, seat.y + 1.4, seat.z + 1.6], target: [seat.x, seat.y + 0.1, seat.z] },
        };
      })(),
    };
  }

  let fps = 0;
  let lastT = performance.now();
  function tickFPS() {
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (dt > 0) fps = fps * 0.95 + (1000 / dt) * 0.05;
  }

  const api = {
    setView(name) {
      const v = views()[name];
      if (!v) return false;
      const pos = new THREE.Vector3(...v.pos);
      const tgt = new THREE.Vector3(...v.target);
      const dir = tgt.clone().sub(pos);
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      if (name.startsWith('aim_')) {
        player.controlMode = 'player';
        player.enabled = true;
        player.setPose(pos, yaw, pitch);
      } else {
        player.controlMode = 'debug';
        camera.position.copy(pos);
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
      }
      // make the new transform immediately visible to raycasts, frustum
      // culling and the measurement helpers (the renderer would only do this
      // at draw time, one frame later)
      camera.updateMatrixWorld(true);
      return true;
    },
    setState({ timeOfDay: todName, fireLit } = {}) {
      if (todName) timeOfDay.set(todName, true);
      if (fireLit !== undefined) camp.fire.setLit(!!fireLit);
      return api.getState();
    },

    /**
     * Return the world to a known-clean state without a page reload.
     * Page loads cost ~25 s here (procedural world generation), so the capture
     * harness resets instead of reloading between shots; it still does real
     * reloads for playthrough validation and at the start of each pass.
     */
    resetWorld() {
      interactions.seated = false;
      interactions.busy = false;
      interactions.hovered = null;
      if (interactions.hud) interactions.hud._fade = null;
      const fadeEl = document.getElementById('fade');
      if (fadeEl) fadeEl.style.opacity = '0';
      player.enabled = true;
      player.controlMode = 'debug';
      player.debugMove = { f: false, b: false, l: false, r: false };
      player.velocity.set(0, 0, 0);
      camp.fire.setLit(false);
      camp.fire.boost = 0;
      camp.clearAddedWood?.();
      hud.setPrompt('');
      hud.setStatus('');
      window.__PAUSE_RENDER = false;
      return api.getState();
    },
    getState() {
      return {
        timeOfDay: timeOfDay.current,
        transitioning: timeOfDay._t < 1, // time-of-day lerp still running
        fading: !!interactions.hud._fade, // screen fade in progress
        fireLit: camp.fire.lit,
        fireBoost: camp.fire.boost,
        seated: interactions.seated,
        busy: interactions.busy,
      };
    },
    interact() {
      interactions.trigger();
      return interactions.hovered ? interactions.hovered.key : null;
    },
    getHovered() {
      return interactions.hovered ? interactions.hovered.key : null;
    },
    getStats() {
      return {
        fps: Math.round(fps * 10) / 10,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frame: window.__FRAME,
        frameTimes: window.__frameTimeStats ? window.__frameTimeStats() : null,
        memory: {
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs ? renderer.info.programs.length : null,
        },
        renderer: api.getRendererInfo(),
      };
    },

    // ---- performance / cost instrumentation -------------------------------
    // Deterministic stepping: fixed dt per frame so animation is reproducible
    // regardless of how slow the rasterizer is. 0 disables (normal play).
    setFixedStep(dt = 1 / 60) {
      window.__FIXED_STEP = dt > 0 ? dt : 0;
      return window.__FIXED_STEP;
    },

    resetPerf() {
      window.__resetFrameTimes?.();
      return true;
    },

    getRendererInfo() {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const unmasked = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unavailable';
      const s = String(unmasked).toLowerCase();
      let kind = 'unknown';
      if (s.includes('swiftshader')) kind = 'software:SwiftShader';
      else if (s.includes('llvmpipe')) kind = 'software:llvmpipe';
      else if (s.includes('basic render')) kind = 'software:MicrosoftBasicRender';
      else if (s.includes('software') || s.includes('softpipe')) kind = 'software:other';
      else if (s !== 'unavailable') kind = 'hardware';
      return { unmasked, kind, webgl2: renderer.capabilities.isWebGL2 };
    },

    // Estimated VRAM for all textures reachable from the scene (bytes).
    getTextureMemory() {
      const seen = new Set();
      let bytes = 0;
      let count = 0;
      const addTex = (t) => {
        if (!t || seen.has(t)) return;
        seen.add(t);
        const img = t.image;
        const w = img?.width ?? t.source?.data?.width ?? 0;
        const h = img?.height ?? t.source?.data?.height ?? 0;
        if (!w || !h) return;
        // 4 bytes/px, ×1.334 when mipmapped
        const mip = t.generateMipmaps !== false ? 4 / 3 : 1;
        bytes += w * h * 4 * mip;
        count++;
      };
      scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) addTex(v);
          }
          const u = m.userData?.shader?.uniforms;
          if (u) for (const k of Object.keys(u)) { if (u[k]?.value?.isTexture) addTex(u[k].value); }
        }
      });
      return { textures: count, bytes, mb: +(bytes / 1048576).toFixed(2) };
    },

    // True average overdraw: re-render the scene with an additive unlit
    // material into a small target and average the accumulated coverage.
    // 1.0 = every pixel shaded once. Restores all state afterwards.
    measureOverdraw(res = 240) {
      const w = res;
      const h = Math.round(res * (renderer.domElement.height / renderer.domElement.width));
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      const STEP = 1 / 32; // each fragment contributes 1/32 so 32x overdraw = 1.0
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(STEP, STEP, STEP),
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const prevOverride = scene.overrideMaterial;
      const prevTarget = renderer.getRenderTarget();
      const prevClear = renderer.getClearColor(new THREE.Color());
      const prevClearAlpha = renderer.getClearAlpha();
      scene.overrideMaterial = mat;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      const buf = new Uint16Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      scene.overrideMaterial = prevOverride;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClear, prevClearAlpha);
      // half-float decode
      const h2f = (bits) => {
        const s = (bits & 0x8000) ? -1 : 1;
        const e = (bits >> 10) & 0x1f;
        const f = bits & 0x3ff;
        if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
        if (e === 31) return f ? NaN : s * Infinity;
        return s * Math.pow(2, e - 15) * (1 + f / 1024);
      };
      let sum = 0;
      let covered = 0;
      for (let i = 0; i < w * h; i++) {
        const v = h2f(buf[i * 4]) * 32; // undo STEP
        sum += v;
        if (v > 0.01) covered++;
      }
      rt.dispose();
      mat.dispose();
      const px = w * h;
      return {
        avgOverdrawAllPixels: +(sum / px).toFixed(3),
        avgOverdrawCoveredPixels: +(covered ? sum / covered : 0).toFixed(3),
        coveragePct: +((covered / px) * 100).toFixed(1),
        resolution: `${w}x${h}`,
      };
    },

    /** Pin conifers to one level of detail (0 near, 1 mid, 2 impostor, -1 auto). */
    setConiferLOD(level) {
      for (const f of getConiferForests()) f.forceLOD(level);
      return level;
    },

    // Foliage cards actually inside the camera frustum (set by vegetation.js).
    getFoliageStats() {
      const base = window.__foliageStats ? window.__foliageStats(camera) : {};
      const forests = getConiferForests();
      return { ...base, conifers: forests.map((f) => f.stats()) };
    },

    /**
     * Manual mode: the animation loop stops simulating and rendering, and the
     * harness drives both explicitly. This is what makes captures reliable on
     * a software rasterizer — no continuous GPU load (which trips Chrome's
     * watchdog and kills the context), no compositor race, and perfectly
     * deterministic animation timing.
     */
    setManualMode(on) {
      window.__MANUAL_MODE = !!on;
      return window.__MANUAL_MODE;
    },

    /** Advance the simulation by `steps` × `dt` seconds without rendering. */
    step(steps = 1, dt = 1 / 60) {
      for (let i = 0; i < steps; i++) window.__simulate(dt);
      window.__FRAME += steps;
      return window.__getTime();
    },

    /** Render exactly one frame, synchronously. */
    renderOnce() {
      window.__renderFrame();
      window.__FRAME++;
      return window.__FRAME;
    },

    /**
     * Measure true per-frame render cost.
     *
     * Continuous free-running rendering cannot be measured on this machine —
     * software rasterisation is slow enough that Chrome's GPU watchdog kills
     * the context mid-sample. Instead we render a fixed number of frames
     * explicitly and glFinish() after each one, so the timing includes the
     * rasterisation rather than just command submission.
     *
     * This is a *software-renderer* number, used to compare builds against the
     * pre-remaster baseline. The 60 fps @1920x1080 release target must be
     * verified on hardware through a normal browser launch.
     */
    timeOneFrame(dt = 1 / 60) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const t0 = performance.now();
      window.__simulate(dt);
      window.__renderFrame();
      // gl.finish() alone is NOT enough here: ANGLE/SwiftShader defers the
      // actual rasterisation until something reads the surface, which made
      // frames look like 5 ms while a canvas readback took 13 s. A one-pixel
      // read forces the pipeline to complete so the timing is honest.
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = performance.now() - t0;
      window.__FRAME++;
      return {
        ms: +ms.toFixed(1),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        contextLost: gl.isContextLost(),
      };
    },

    /**
     * Step, render and return the frame as a PNG data URL — all inside a single
     * synchronous call, so one CDP round trip yields one deterministic image.
     */
    captureFrame({ steps = 0, dt = 1 / 60 } = {}) {
      if (steps > 0) for (let i = 0; i < steps; i++) window.__simulate(dt);
      window.__renderFrame();
      window.__FRAME += Math.max(1, steps);
      return renderer.domElement.toDataURL('image/png');
    },

    // Capture support: request a direct canvas grab (harness polls __GRAB_DATA).
    requestGrab() {
      window.__GRAB_DATA = null;
      window.__GRAB_REQ = true;
      return true;
    },

    // Pause the render loop (simulation still steps) so DOM screenshots of HUD
    // states don't have to fight the software rasterizer for CPU.
    setPaused(v) {
      window.__PAUSE_RENDER = !!v;
      if (!v) window.__PAUSE_AFTER_FRAME = false;
      return window.__PAUSE_RENDER;
    },

    // Freeze after the next fully drawn frame (capture-safe).
    pauseAfterFrame() {
      window.__PAUSE_AFTER_FRAME = true;
      return true;
    },
    getPlayerState() {
      return player.getState();
    },
    setMoveInput({ f = false, b = false, l = false, r = false } = {}) {
      player.controlMode = 'player';
      player.debugMove = { f, b, l, r };
    },
    setHUD(visible) {
      hud.setVisible(visible);
    },
    listViews() {
      return Object.keys(views());
    },
    _tickFPS: tickFPS,
  };

  window.debugAPI = api;
  return api;
}
