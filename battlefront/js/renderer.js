// =============================================================
// Graphics pipeline: renderer, post-processing, quality presets
// =============================================================
'use strict';

const Graphics = (() => {
  let renderer, composer, bloomPass, fxaaPass, gradePass, renderPass;
  let scene, camera;
  let quality = 'high';
  let envMap = null;

  // Final colour-grade shader: vignette, chroma fringe, grade, damage flash
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      uVignette: { value: 0.46 },
      uChroma: { value: 0.0016 },
      uDamage: { value: 0.0 },
      uFlash: { value: 0.0 },
      uSaturation: { value: 1.16 },
      uContrast: { value: 1.09 },
      uLift: { value: new THREE.Vector3(0.004, -0.002, -0.012) },
      uGain: { value: new THREE.Vector3(1.06, 1.0, 0.92) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uVignette, uChroma, uDamage, uFlash, uSaturation, uContrast;
      uniform vec3 uLift, uGain;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        // chromatic aberration grows toward edges
        float ca = uChroma * (0.5 + r2 * 4.0);
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + c * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - c * ca).b;
        // lift/gain grade
        col = col * uGain + uLift;
        // filmic contrast curve around mid-grey
        col = (col - 0.5) * uContrast + 0.5;
        // saturation
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, uSaturation);
        // vignette
        float vig = 1.0 - uVignette * smoothstep(0.18, 0.62, r2);
        col *= vig;
        // damage tint (red ring)
        float dmgRing = smoothstep(0.08, 0.5, r2);
        col = mix(col, vec3(0.65, 0.04, 0.02), uDamage * dmgRing * 0.85);
        // white flash (explosions close by)
        col = mix(col, vec3(1.0), uFlash * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  function init(canvas, sc, cam, opts = {}) {
    scene = sc; camera = cam;
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    composer = new THREE.EffectComposer(renderer);
    renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,    // strength
      0.55,   // radius
      0.88    // threshold — only genuinely bright things bloom
    );
    composer.addPass(bloomPass);

    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    composer.addPass(fxaaPass);

    gradePass = new THREE.ShaderPass(GradeShader);
    gradePass.renderToScreen = true;
    composer.addPass(gradePass);

    applyQuality(quality);
    resize();
    window.addEventListener('resize', resize);
    return renderer;
  }

  // best-effort GPU sniff → sensible default preset
  function detectQuality() {
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (!gl) return 'low';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      if (/swiftshader|llvmpipe|software/i.test(gpu)) return 'low';
      if (/intel(?!.*arc)|mali|adreno|apple gpu|powervr/i.test(gpu)) return 'medium';
      return 'high';
    } catch (e) { return 'medium'; }
  }

  function applyQuality(q) {
    quality = q;
    const Q = CONFIG.quality[q];
    const pr = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.shadowMap.enabled = Q.shadows;
    bloomPass.enabled = Q.bloom;
    fxaaPass.enabled = Q.fxaa;
    if (Graphics.sun) {
      Graphics.sun.castShadow = Q.shadows;
      Graphics.sun.shadow.mapSize.setScalar(Q.shadow);
      if (Graphics.sun.shadow.map) {
        Graphics.sun.shadow.map.dispose();
        Graphics.sun.shadow.map = null;
      }
    }
    // force material recompile for shadow toggle
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  // ---- lighting rig -----------------------------------------
  function buildLighting() {
    // golden-hour key light
    const sun = new THREE.DirectionalLight(0xffe3b3, 1.9);
    sun.position.set(-140, 190, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(CONFIG.quality[quality].shadow);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 600;
    const S = 130;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    // warm sky / cool ground bounce
    const hemi = new THREE.HemisphereLight(0xa8c4e8, 0x8a6a42, 0.62);
    scene.add(hemi);

    const amb = new THREE.AmbientLight(0x6a5a44, 0.26);
    scene.add(amb);

    Graphics.sun = sun;
    Graphics.hemi = hemi;
    return sun;
  }

  // keep the tight shadow frustum centred on the camera
  const _sunOff = new THREE.Vector3(-140, 190, 90).normalize().multiplyScalar(260);
  function updateShadowFollow(target) {
    if (!Graphics.sun) return;
    const s = Graphics.sun;
    s.position.copy(target).add(_sunOff);
    s.target.position.copy(target);
    s.target.updateMatrixWorld();
  }

  // ---- procedural environment cubemap (for PBR reflections) --
  function buildEnvMap() {
    const size = 64;
    const canvases = [];
    for (let f = 0; f < 6; f++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, size);
      if (f === 2) {        // +Y  sky top
        g.addColorStop(0, '#9db8e8'); g.addColorStop(1, '#cfa873');
      } else if (f === 3) { // -Y  ground
        g.addColorStop(0, '#a8835a'); g.addColorStop(1, '#6e5436');
      } else {              // horizon faces
        g.addColorStop(0, '#aac0e6'); g.addColorStop(0.55, '#e8b87a');
        g.addColorStop(0.62, '#b8895a'); g.addColorStop(1, '#8a6a44');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      canvases.push(cv);
    }
    const tex = new THREE.CubeTexture(canvases);
    tex.needsUpdate = true;
    tex.encoding = THREE.sRGBEncoding;
    envMap = tex;
    scene.environment = tex;
    return tex;
  }

  let damageLevel = 0, flashLevel = 0;
  function setDamage(v) { damageLevel = Math.max(damageLevel, v); }
  function flash(v) { flashLevel = Math.max(flashLevel, v); }

  // ---- adaptive quality watchdog ------------------------------
  let manualQuality = false;          // user clicked a preset → respect it
  let badTime = 0, stepCooldown = 0;
  function setManualQuality(q) { manualQuality = true; applyQuality(q); }
  function adaptive(dt) {
    if (manualQuality || dt <= 0) return;
    stepCooldown = Math.max(0, stepCooldown - dt);
    const fps = 1 / dt;
    if (fps < CONFIG.adaptive.minFps) badTime += dt;
    else badTime = Math.max(0, badTime - dt * 2);
    if (badTime > CONFIG.adaptive.badSeconds && stepCooldown <= 0) {
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(quality);
      if (i < order.length - 1) {
        applyQuality(order[i + 1]);
        badTime = 0;
        stepCooldown = CONFIG.adaptive.cooldown;
        if (typeof HUD !== 'undefined' && HUD.toast) {
          HUD.toast(`Graphics auto-adjusted to ${order[i + 1].toUpperCase()} for smoother play`);
          HUD.syncQualityButtons(order[i + 1]);
        }
      }
    }
  }

  function update(dt, rawDt) {
    damageLevel = Math.max(0, damageLevel - dt * 1.4);
    flashLevel = Math.max(0, flashLevel - dt * 2.8);
    gradePass.uniforms.uDamage.value = damageLevel;
    gradePass.uniforms.uFlash.value = flashLevel;
    if (!Game.testMode) adaptive(rawDt != null ? rawDt : dt);
  }

  function render() { composer.render(); }

  return {
    init, buildLighting, buildEnvMap, applyQuality, setManualQuality, detectQuality,
    resize, render, update, updateShadowFollow, setDamage, flash,
    get renderer() { return renderer; },
    get envMap() { return envMap; },
    get quality() { return quality; },
    sun: null, hemi: null,
  };
})();
