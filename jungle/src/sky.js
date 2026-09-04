// Sky dome, sun, fill lighting, shadows and atmosphere — art-directed tropical
// late-morning light: a hard warm sun over a cool green-blue shade, layered
// height mist in the lagoon basin and a distance haze that stacks silhouettes
// into blue-green depth layers.

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec4,
  uniform,
  output,
  positionWorld,
  cameraPosition,
  length,
  dot,
  exp,
  max,
  abs,
  pow,
  mix,
  clamp,
  select,
  getShadowMaterial,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { WORLD } from './config.js';

// ---------- depth-only shadow maps ----------
// ShadowNode gives every shadow map an RGBA8 colour attachment and fills it
// with (0,0,0,1) for every caster fragment, but the PCF filter only ever reads
// the depth texture (the colour is consumed solely when
// renderer.shadowMap.transmitted is on, which it is not). At 2048² that is
// 16 MB cleared and written per map per frame; the three 4096² Ultra cascades
// carry 192 MB. Same depth in, same shadow out:
//   * the colour attachment becomes R8 (a quarter of the bytes)
//   * it is no longer cleared (autoClearColor off for the shadow render only;
//     the depth clear is untouched)
//   * the shadow-pass material stops writing colour altogether (depth writes
//     and alpha-test discards are unaffected by the colour mask).
// The material is recreated by three after every dispose, so the flag is
// (re)applied right before each shadow render.
// The per-frame guard mirrors ShadowNode.updateBefore in r184, which renders
// one shadow map per NodeFrame.frameId no matter how many cameras render the
// scene in that frame (the water reflection renders it again with a mirrored
// camera; nothing that casts a shadow is excluded from that view, so a second
// map would be identical). Written out explicitly so a future three.js that
// keys the guard per camera cannot silently double the shadow cost.
class DepthOnlyShadowNode extends THREE.ShadowNode {
  setupRenderTarget(shadow, builder) {
    const target = super.setupRenderTarget(shadow, builder);
    target.shadowMap.texture.format = THREE.RedFormat;
    return target;
  }

  updateShadow(frame) {
    const material = getShadowMaterial(this.light);
    if (material.colorWrite) {
      material.colorWrite = false;
    }
    super.updateShadow(frame);
  }

  renderShadow(frame) {
    const { renderer } = frame;
    const autoClearColor = renderer.autoClearColor;
    renderer.autoClearColor = false;
    super.renderShadow(frame);
    renderer.autoClearColor = autoClearColor;
  }

  updateBefore(frame) {
    const { shadow } = this;
    if (!(shadow.needsUpdate || shadow.autoUpdate)) {
      return;
    }
    if (this._renderedFrameId === frame.frameId) {
      return;
    }
    this._renderedFrameId = frame.frameId;
    this.updateShadow(frame);
    if (this.shadowMap.depthTexture.version === this._depthVersionCached) {
      shadow.needsUpdate = false;
    }
  }
}

// CSMShadowNode (r184) builds one plain ShadowNode per cascade in _init;
// swap them for the depth-only flavour before the cascade TSL is assembled.
class DepthOnlyCSMShadowNode extends CSMShadowNode {
  _init(builder) {
    super._init(builder);
    this._shadowNodes = this._shadowNodes.map((node) => new DepthOnlyShadowNode(node.light, node.shadow));
  }
}

export function createSky(ctx) {
  const { scene, camera } = ctx;

  // ---------- sun direction ----------
  const sunDirection = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - WORLD.sunElevation);
  const theta = THREE.MathUtils.degToRad(WORLD.sunAzimuth);
  sunDirection.setFromSphericalCoords(1, phi, theta);

  // ---------- sky dome ----------
  const sky = new SkyMesh();
  sky.scale.setScalar(800); // must stay inside the camera far plane
  sky.material.fog = false; // never fog the sky dome itself
  // Lower rayleigh = deeper blue zenith and a horizon that no longer clips to
  // white; a touch more turbidity keeps the horizon band soft and hazy.
  sky.turbidity.value = 1.8;
  sky.rayleigh.value = 1.05;
  // small Mie coefficient with a fairly tight forward lobe: a compact warm
  // halo around the sun instead of a white-out over a third of the sky
  sky.mieCoefficient.value = 0.0018;
  sky.mieDirectionalG.value = 0.85;
  // Cloud UVs are built from the normalized view direction (dome scale is
  // irrelevant) and multiplied by 1000 inside SkyMesh: 0.0028 puts the base
  // fbm octave at roughly one cloud per 25° of sky and keeps the finest octave
  // well above pixel size — larger values alias into speckle.
  sky.cloudScale.value = 0.0028;
  sky.cloudCoverage.value = 0.36;
  sky.cloudDensity.value = 0.55;
  sky.cloudSpeed.value = 0.0006;
  sky.cloudElevation.value = 0.3;
  sky.showSunDisc.value = 0; // renders as a black dot with these settings — off
  sky.sunPosition.value.copy(sunDirection);
  scene.add(sky);

  // ---------- sun light ----------
  // Hot, slightly warm key light, about 1.3 stops over the fill on a horizontal
  // surface: the jungle floor drops into real shade between the sunlit
  // patches but keeps its texture (the litter albedo is already dark).
  const sun = new THREE.DirectionalLight(0xffefcf, 5.8);
  sun.castShadow = true;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- ambient fill ----------
  // Cool sky bounce from above, warm olive ground bounce from below. Lambert
  // divides this by pi, so 2.2 is ~0.7 irradiance in the shade.
  const hemi = new THREE.HemisphereLight(0xa8c8e6, 0x55603a, 2.7);
  scene.add(hemi);

  // ---------- atmosphere ----------
  // Two fog layers integrated analytically along the view ray:
  //  * a distance haze that lifts far silhouettes into blue-green layers and
  //    picks up a warm glow toward the sun,
  //  * an exponential height mist pooled in the lagoon basin / valley floor.
  const atmosphere = {
    hazeColor: uniform(new THREE.Color(0.44, 0.66, 0.72)),
    hazeDensity: uniform(0.0021),
    hazeStart: uniform(60.0),
    glowColor: uniform(new THREE.Color(1.0, 0.82, 0.58)),
    glowStrength: uniform(0.55),
    mistColor: uniform(new THREE.Color(0.66, 0.78, 0.74)),
    mistDensity: uniform(0.0045),
    mistBase: uniform(WORLD.waterLevel + 0.6),
    mistFalloff: uniform(0.42),
    sunDir: uniform(sunDirection.clone()),
    // submerged: dense teal absorption replaces the air haze while the eye is under water
    submerged: uniform(0),
    waterColor: uniform(new THREE.Color(0.03, 0.22, 0.26)),
    waterDensity: uniform(0.075),
  };

  scene.fogNode = Fn(() => {
    const toFragment = positionWorld.sub(cameraPosition);
    const dist = length(toFragment).max(1e-3);
    const viewDir = toFragment.div(dist);

    // distance haze — exponential in the distance beyond a clear near field
    const hazeDist = dist.sub(atmosphere.hazeStart).max(0);
    const haze = float(1).sub(exp(hazeDist.mul(atmosphere.hazeDensity).negate()));

    // height mist — density falls off exponentially above mistBase; the
    // integral along the ray has a closed form, guarded where the ray is level
    const k = atmosphere.mistFalloff;
    const dy = positionWorld.y.sub(cameraPosition.y);
    const denom = clamp(dy.mul(k), -30, 30);
    const level = abs(denom).lessThan(1e-3);
    const safeDenom = select(level, float(1), denom);
    const ratio = select(level, float(1), float(1).sub(exp(safeDenom.negate())).div(safeDenom));
    const startDensity = exp(cameraPosition.y.sub(atmosphere.mistBase).mul(k).negate());
    const mistAmount = atmosphere.mistDensity.mul(dist).mul(startDensity).mul(ratio);
    const mist = float(1).sub(exp(mistAmount.negate()));

    // warm glow in the haze toward the sun
    const sunAmount = pow(max(dot(viewDir, atmosphere.sunDir), 0), 7);
    const hazeColor = mix(atmosphere.hazeColor, atmosphere.glowColor, sunAmount.mul(atmosphere.glowStrength));

    // layer the two: mist sits in front of the haze
    const airTotal = clamp(haze.add(mist).sub(haze.mul(mist)), 0, 0.96);
    const mistShare = mist.div(max(airTotal, 1e-4)).min(1);
    const airColor = mix(hazeColor, atmosphere.mistColor, mistShare.mul(0.7));

    // under water: exponential absorption toward deep teal, slightly brighter
    // looking up toward the surface (light comes from above)
    const upness = clamp(viewDir.y.mul(0.5).add(0.5), 0, 1);
    const waterFog = float(1).sub(exp(dist.mul(atmosphere.waterDensity).negate())).mul(0.97);
    const waterColor = mix(atmosphere.waterColor, atmosphere.waterColor.mul(2.2), upness.mul(0.6));

    const total = mix(airTotal, waterFog, atmosphere.submerged);
    const fogColor = mix(airColor, waterColor, atmosphere.submerged);

    return vec4(mix(output.rgb, fogColor, total), output.a);
  })();

  // ---------- shadow frustum tracking ----------
  // Single-map mode: the ortho frustum is fitted around the ground ahead of
  // the camera (not centered on the player), so half of it is never wasted
  // behind us, and texel-snapped in light space to stop shimmer.
  // Cascaded mode (Ultra, or preset.shadowCascades > 0): CSMShadowNode splits
  // the view frustum into slices, each with its own map — crisp dappled light
  // at the feet, coarser far away where the haze hides it anyway.
  const shadowState = {
    extent: 62, // half-size of the single ortho frustum (m)
    lookAhead: 26, // how far in front of the camera the frustum is centered (m)
    mapSize: 2048,
    cascades: 0, // 0 = single fitted map (what is currently installed)
    enabled: true, // preset.shadowsEnabled
    generation: 0, // bumped on every installed shadow setup
  };
  let csm = null;
  let generationMarker = null;
  const sunOffset = sunDirection.clone().multiplyScalar(150);
  const forward = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const lightSpaceFocus = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // light-space basis for the texel snap: the sun never moves, so build it once
  const lightBasis = new THREE.Matrix4().lookAt(sunOffset, origin, up);
  const lightBasisInverse = lightBasis.clone().invert();
  let lastAspect = 0;
  let lastFov = 0;

  function configureShadow(shadow) {
    shadow.mapSize.set(shadowState.mapSize, shadowState.mapSize);
    shadow.bias = -0.00025;
    shadow.normalBias = 0.05;
    shadow.radius = 3;
    const cam = shadow.camera;
    cam.near = 1;
    cam.far = 320;
    cam.left = -shadowState.extent;
    cam.right = shadowState.extent;
    cam.top = shadowState.extent;
    cam.bottom = -shadowState.extent;
    cam.updateProjectionMatrix();
  }
  configureShadow(sun.shadow);
  sun.shadow.shadowNode = new DepthOnlyShadowNode(sun, sun.shadow);

  // Every lit material bakes the sun's shadow node into its shader, and the
  // renderer only rebuilds a material when its lights cache key changes. A
  // shadow-setup swap (single map <-> cascades, new map size, shadows off)
  // therefore has to change that key for *every* render object — including
  // the ones not being drawn right now (culled, or only in the water
  // reflection). Toggling castShadow does not do that (its key round-trips
  // back to the old value) and a stale object would then keep updating a
  // disposed ShadowNode → crash. So a swap:
  //   1. freezes the retired LightShadow — the retired ShadowNode reads
  //      autoUpdate from it, so any stale reference goes inert instead of
  //      rendering a disposed map,
  //   2. gives the sun a fresh LightShadow carrying the new setup,
  //   3. tells the sun's light node to drop its cached shadow node (the light
  //      'dispose' event → AnalyticLightNode.disposeShadow, which also frees
  //      the old map),
  //   4. bumps a zero-intensity marker light: a new light id changes the
  //      lights cache key once and for all, so every render object rebuilds
  //      on its next draw, whenever that is. No blank frames, no blink.
  function installShadowSetup(count) {
    shadowState.cascades = count;
    shadowState.generation += 1;

    const retired = sun.shadow;
    // same class, fresh camera, no shadowNode property; cloned before the
    // retired one is frozen so the copy keeps autoUpdate = true
    const fresh = retired.clone();
    retired.autoUpdate = false;
    retired.needsUpdate = false;
    if (csm) {
      csm.dispose(); // removes the cascade carrier objects from the scene
      csm.updateBefore = () => {};
      for (const node of csm._shadowNodes) {
        node.shadow.autoUpdate = false;
        node.shadow.needsUpdate = false;
        if (node.shadowMap) {
          node.shadowMap.dispose();
        }
      }
      csm = null;
    }

    sun.shadow = fresh;
    configureShadow(fresh);
    if (count > 0) {
      // maxFar 150 m: the first cascade then spans ~0–24 m (≈3 cm texels at
      // 2048), the last one fades out where the distance haze takes over.
      csm = new DepthOnlyCSMShadowNode(sun, {
        cascades: count,
        maxFar: 150,
        mode: 'practical',
        lightMargin: 120,
      });
      csm.fade = true;
      sun.shadow.shadowNode = csm;
    } else {
      sun.shadow.shadowNode = new DepthOnlyShadowNode(sun, fresh);
    }
    sun.castShadow = shadowState.enabled;

    // only AnalyticLightNode listens to this; DirectionalLight.dispose() would
    // also dispose the (already retired) shadow map, so dispatch it directly
    sun.dispatchEvent({ type: 'dispose' });

    if (generationMarker) {
      scene.remove(generationMarker);
    }
    generationMarker = new THREE.AmbientLight(0x000000, 0);
    generationMarker.name = `shadow-generation-${shadowState.generation}`;
    scene.add(generationMarker);

    lastAspect = 0; // force a cascade re-split on the next update
  }

  function setCascades(count) {
    if (count === shadowState.cascades) {
      return;
    }
    installShadowSetup(count);
  }

  function update(dt = 0.016) {
    const eye = ctx.player ? ctx.player.position : camera.position;

    // snap the fog into "submerged" mode the moment the eye crosses the surface
    const target = ctx.player?.headUnderwater ? 1 : 0;
    const s = atmosphere.submerged.value;
    atmosphere.submerged.value = Math.abs(target - s) < 0.02 ? target : s + (target - s) * Math.min(1, dt * 18);

    // CSMShadowNode binds itself to whichever camera built the first material;
    // make sure the cascades follow the player camera, not the water mirror
    if (csm && csm.camera && csm.camera !== camera) {
      csm.camera = camera;
      lastAspect = 0;
    }

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) {
      forward.set(0, 0, -1);
    }
    forward.normalize();

    focus.set(eye.x, 0, eye.z).addScaledVector(forward, shadowState.lookAhead);

    // snap the frustum center to shadow-map texels in light space
    lightSpaceFocus.copy(focus).applyMatrix4(lightBasisInverse);
    const texel = (shadowState.extent * 2) / sun.shadow.mapSize.width;
    lightSpaceFocus.x = Math.floor(lightSpaceFocus.x / texel) * texel;
    lightSpaceFocus.y = Math.floor(lightSpaceFocus.y / texel) * texel;
    focus.copy(lightSpaceFocus).applyMatrix4(lightBasis);

    sun.position.set(focus.x + sunOffset.x, focus.y + sunOffset.y, focus.z + sunOffset.z);
    sun.target.position.copy(focus);

    // cascades follow the camera frustum; re-split when the projection changes
    if (csm && csm.camera && (camera.aspect !== lastAspect || camera.fov !== lastFov)) {
      lastAspect = camera.aspect;
      lastFov = camera.fov;
      csm.updateFrustums();
    }

    sky.position.set(eye.x, 0, eye.z);
  }

  function applyQuality(preset) {
    const name = ctx.qualityName || '';
    // Every cascade re-renders all shadow casters (the instanced jungle is
    // ~1.2 M triangles per pass), so cascades are an Ultra-only luxury; High
    // uses the single camera-fitted map.
    const cascades = preset.shadowCascades ?? (name === 'ultra' ? 3 : 0);

    // the cascade shadows clone this size when they are built
    shadowState.mapSize = preset.shadowMapSize;
    shadowState.enabled = Boolean(preset.shadowsEnabled);
    // smaller maps get a tighter frustum so texel density stays acceptable
    shadowState.extent = preset.shadowMapSize >= 4096 ? 80 : preset.shadowMapSize >= 2048 ? 62 : 46;
    shadowState.lookAhead = shadowState.extent * 0.42;

    installShadowSetup(shadowState.enabled ? cascades : 0);
  }

  return {
    sky,
    sun,
    hemi,
    sunDirection,
    update,
    applyQuality,
    // Ground footprint (axis-aligned box, centre + half-extent) that can hold
    // a caster contributing to this frame's shadow maps — for the instance
    // culler. Conservative: the light-space box is tilted by the sun's
    // elevation (1/sin widens it along the azimuth) and a caster of height h
    // shadows up to h·cot(elevation) sideways; the cascades on Ultra fit the
    // camera frustum out to maxFar with the light margin behind it.
    shadowRegion() {
      if (!shadowState.enabled || !sun.castShadow) return null;
      const el = THREE.MathUtils.degToRad(WORLD.sunElevation);
      const heightShift = 36 / Math.tan(el); // tallest emergent ≈ 36 m
      if (shadowState.cascades > 0) {
        const eye = ctx.player ? ctx.player.position : camera.position;
        return { x: eye.x, z: eye.z, extent: 150 + 40 + heightShift };
      }
      return { x: focus.x, z: focus.z, extent: shadowState.extent / Math.sin(el) + heightShift };
    },
    // debug / tuning hooks
    _atmosphere: atmosphere,
    _shadowState: shadowState,
    _setCascades: setCascades,
    get _csm() {
      return csm;
    },
  };
}
