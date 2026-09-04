// Procedural WebAudio soundscape for the jungle. Everything is synthesized —
// no audio files.
//
//   ambience : waterfall (rumble / hiss / sizzle bands, distance low-pass,
//              bearing pan, cliff occlusion), river babble (nearest point on
//              the river center line), lagoon lapping with wave envelopes,
//              canopy wind with random gusts (louder with elevation), leaf
//              rustle, cicada swells
//   fauna    : one-shot voices (whistler, triller, two-note caller, woodpecker
//              rattle, distant hornbill / parrot / monkey, crickets in shade,
//              frogs at the water edge) placed in the world, panned and
//              low-passed relative to the listener every frame
//   player   : footsteps by surface, landing thud, water entry splash, swim
//              strokes, underwater bed + heartbeat + bubbles, surfacing breath
//   mix      : synthesized-IR reverb send, ambience ducking, underwater
//              low-pass, master limiter, smoothed parameter changes
//
// Audio stays silent until the HUD button toggles it (autoplay policies); the
// AudioContext itself is created on the first user gesture and kept suspended
// while muted so it costs nothing.

import { WORLD } from './config.js';
import { clamp, lerp, smoothstep, mulberry32 } from './noise.js';
import { riverCenterX as riverCenterXFallback } from './terrain.js';

const TAU = Math.PI * 2;
const FLOOR = 0.0001; // exponential ramps cannot reach zero
const TICK = 1 / 30; // continuous-layer parameter update rate (s)

// The waterfall is a line source: the sheet hugs the cliff at the top and
// pours into the plunge pool in front of it.
const FALLS_TOP = { x: WORLD.waterfallX, y: 19, z: WORLD.waterfallZ + 0.6 };
const FALLS_BASE = { x: WORLD.waterfallX, y: -0.5, z: WORLD.waterfallZ + 5 };

export function createAudio(ctx) {
  const rnd = mulberry32(WORLD.seed + 4242);
  const rand = (a, b) => a + (b - a) * rnd();
  const lagoon = WORLD.lagoonCenter;
  const half = WORLD.size / 2 - 6;

  let context = null;
  let started = false;
  let muted = true;
  let suspendTimer = 0;

  // buses / global nodes
  let master = null;
  let limiter = null;
  let analyser = null;
  let underwaterFilter = null;
  let duck = null;
  let airGain = null;
  let ambienceBus = null;
  let playerBus = null;
  let submergedBus = null;
  let reverbSend = null;
  let reverbReturn = null;
  const buffers = {};

  // quality
  let lowMode = false;
  let maxVoices = 8;
  let qualityLabel = 'default';

  // stats (for debugState)
  let nodesCreated = 0;
  let continuousNodes = 0;
  const counters = {
    steps: 0,
    lands: 0,
    splashes: 0,
    strokes: 0,
    breaths: 0,
    heartbeats: 0,
    bubbles: 0,
    calls: 0,
  };
  let lastStep = null;
  let lastLand = null;
  let lastSplash = null;
  const recentCalls = [];

  // ------------------------------------------------------------------
  // listener + environment probes
  // ------------------------------------------------------------------
  const listener = {
    x: WORLD.spawn.x,
    y: 4,
    z: WORLD.spawn.z,
    yaw: 0,
    fx: 0,
    fz: -1,
    rx: 1,
    rz: 0,
    underwater: false,
    swimming: false,
    wading: false,
    speed: 0,
  };

  const env = {
    canopy: 0,
    canopyArea: 0,
    elevation: 0,
    height: 0,
    fallsDist: 0,
    riverDist: 0,
    riverStrength: 0,
    lagoonDist: 0,
    shoreDist: 0,
    waterEdge: 0,
    inLagoon: false,
  };

  const spatialTmp = { dist: 0, dh: 0, pan: 0, front: 0 };

  function updateListener() {
    const p = ctx.player;
    if (!p) {
      return;
    }
    const eye = p.eye && Number.isFinite(p.eye.y) ? p.eye : null;
    listener.x = p.position.x;
    listener.z = p.position.z;
    listener.y = eye ? eye.y : p.position.y + WORLD.eyeHeight;
    listener.yaw = p.yawObject?.yaw ?? 0;
    listener.fx = -Math.sin(listener.yaw);
    listener.fz = -Math.cos(listener.yaw);
    // camera local +x (screen right) in world space
    listener.rx = Math.cos(listener.yaw);
    listener.rz = -Math.sin(listener.yaw);
    listener.underwater = Boolean(p.headUnderwater);
    listener.swimming = Boolean(p.isSwimming);
    listener.wading = Boolean(p.isWading);
    listener.speed = p.speed2D ?? 0;
  }

  // distance / stereo pan / front-back factor of a world point relative to the listener
  function spatial(x, y, z, out = spatialTmp) {
    const dx = x - listener.x;
    const dy = y - listener.y;
    const dz = z - listener.z;
    const dh = Math.hypot(dx, dz);
    const inv = dh > 1e-4 ? 1 / dh : 0;
    out.dist = Math.hypot(dh, dy);
    out.dh = dh;
    out.pan = (dx * listener.rx + dz * listener.rz) * inv;
    out.front = (dx * listener.fx + dz * listener.fz) * inv;
    return out;
  }

  function riverX(z) {
    return (ctx.terrain?.riverCenterX ?? riverCenterXFallback)(z);
  }

  function nearestRiverPoint(px, pz) {
    const zMin = lagoon.z + 6;
    const zMax = half;
    let bestZ = clamp(pz, zMin, zMax);
    let bestD = Math.hypot(riverX(bestZ) - px, bestZ - pz);
    const lo = Math.max(zMin, pz - 45);
    const hi = Math.min(zMax, pz + 45);
    for (let z = lo; z <= hi; z += 5) {
      const d = Math.hypot(riverX(z) - px, z - pz);
      if (d < bestD) {
        bestD = d;
        bestZ = z;
      }
    }
    const rLo = Math.max(zMin, bestZ - 5);
    const rHi = Math.min(zMax, bestZ + 5);
    for (let z = rLo; z <= rHi; z += 0.5) {
      const d = Math.hypot(riverX(z) - px, z - pz);
      if (d < bestD) {
        bestD = d;
        bestZ = z;
      }
    }
    return { x: riverX(bestZ), z: bestZ, dist: bestD };
  }

  function closestOnSegment(a, b, px, py, pz, out) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = clamp(((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2, 0, 1);
    out.x = a.x + abx * t;
    out.y = a.y + aby * t;
    out.z = a.z + abz * t;
    return out;
  }

  // ---- canopy density grid (from the instanced tree placements) ----
  const CANOPY_CELLS = 40;
  const canopyCell = WORLD.size / CANOPY_CELLS;
  let canopyGrid = null;

  function buildCanopyGrid() {
    const cells = CANOPY_CELLS;
    let grid = new Float32Array(cells * cells);
    const weights = { 'emergent-trunks': 1.6, 'canopy-trunks': 1.0, 'understory-trunks': 0.45, 'palm-trunks': 0.55, 'fan-palm-trunks': 0.3, 'banana-plants': 0.18 };
    let found = false;
    for (const mesh of ctx.vegetation?.meshes ?? []) {
      const w = weights[mesh.name];
      // the culler repacks mesh.instanceMatrix to the visible set; use the
      // original full matrices it keeps (all placements, as before)
      const arr = ctx.culler?.sourceMatrices?.(mesh) ?? mesh.instanceMatrix?.array;
      if (!w || !arr) {
        continue;
      }
      const n = Math.floor(arr.length / 16);
      for (let i = 0; i < n; i += 1) {
        const x = arr[i * 16 + 12];
        const z = arr[i * 16 + 14];
        const cx = Math.floor((x + WORLD.size / 2) / canopyCell);
        const cz = Math.floor((z + WORLD.size / 2) / canopyCell);
        if (cx < 0 || cz < 0 || cx >= cells || cz >= cells) {
          continue;
        }
        grid[cz * cells + cx] += w;
        found = true;
      }
    }
    if (!found) {
      // heuristic fallback mirroring the vegetation scatter rules
      for (let cz = 0; cz < cells; cz += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
          const x = (cx + 0.5) * canopyCell - WORLD.size / 2;
          const z = (cz + 0.5) * canopyCell - WORLD.size / 2;
          const h = ctx.terrain.sampleHeight(x, z);
          const dl = Math.hypot(x - lagoon.x, z - lagoon.z);
          const dr = z > lagoon.z ? Math.abs(x - riverX(z)) : Infinity;
          grid[cz * cells + cx] = h > 1.1 && dl > WORLD.lagoonRadius + 9 && dr > 17 ? 1 : 0;
        }
      }
    }
    // two 3x3 box blurs => soft ~50 m footprint
    let tmp = new Float32Array(cells * cells);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let z = 0; z < cells; z += 1) {
        for (let x = 0; x < cells; x += 1) {
          let sum = 0;
          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const sx = clamp(x + dx, 0, cells - 1);
              const sz = clamp(z + dz, 0, cells - 1);
              sum += grid[sz * cells + sx];
            }
          }
          tmp[z * cells + x] = sum / 9;
        }
      }
      const swap = grid;
      grid = tmp;
      tmp = swap;
    }
    // normalize so dense forest ~= 1 (95th percentile)
    const sorted = Array.from(grid).sort((a, b) => a - b);
    const norm = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.95)]);
    for (let i = 0; i < grid.length; i += 1) {
      grid[i] = clamp(grid[i] / norm, 0, 1);
    }
    canopyGrid = grid;
  }

  function canopyAt(x, z) {
    if (!canopyGrid) {
      return 0.5;
    }
    const cells = CANOPY_CELLS;
    const gx = clamp((x + WORLD.size / 2) / canopyCell - 0.5, 0, cells - 1.001);
    const gz = clamp((z + WORLD.size / 2) / canopyCell - 0.5, 0, cells - 1.001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(cells - 1, x0 + 1);
    const z1 = Math.min(cells - 1, z0 + 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const a = lerp(canopyGrid[z0 * cells + x0], canopyGrid[z0 * cells + x1], fx);
    const b = lerp(canopyGrid[z1 * cells + x0], canopyGrid[z1 * cells + x1], fx);
    return lerp(a, b, fz);
  }

  const fallsPoint = { x: 0, y: 0, z: 0 };

  function probeEnvironment() {
    env.canopy = canopyAt(listener.x, listener.z);
    let area = env.canopy;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU;
      area += canopyAt(listener.x + Math.sin(a) * 24, listener.z + Math.cos(a) * 24);
    }
    env.canopyArea = area / 5;
    env.height = ctx.terrain.sampleHeight(listener.x, listener.z);
    env.elevation = clamp((listener.y - 4) / 24, 0, 1);

    closestOnSegment(FALLS_BASE, FALLS_TOP, listener.x, listener.y, listener.z, fallsPoint);
    env.fallsDist = Math.hypot(fallsPoint.x - listener.x, fallsPoint.y - listener.y, fallsPoint.z - listener.z);

    const rp = nearestRiverPoint(listener.x, listener.z);
    env.riverDist = rp.dist;
    env.riverX = rp.x;
    env.riverZ = rp.z;
    env.riverStrength = smoothstep(lagoon.z + 8, lagoon.z + 34, rp.z);

    env.lagoonDist = Math.hypot(listener.x - lagoon.x, listener.z - lagoon.z);
    const shoreR = WORLD.lagoonRadius + 2;
    env.inLagoon = env.lagoonDist < shoreR;
    const lagoonEdge = Math.abs(env.lagoonDist - shoreR);
    const riverEdge = Math.abs(rp.dist - (WORLD.riverHalfWidth + 1)) / Math.max(env.riverStrength, 0.05);
    env.shoreDist = Math.min(lagoonEdge, riverEdge);
    env.waterEdge = 1 - smoothstep(3, 24, env.shoreDist);
  }

  // ------------------------------------------------------------------
  // node helpers
  // ------------------------------------------------------------------
  function track(node) {
    nodesCreated += 1;
    return node;
  }

  function gainNode(value) {
    const g = track(context.createGain());
    g.gain.value = value;
    return g;
  }

  function biquad(type, frequency, q = 1, gainDb = 0) {
    const f = track(context.createBiquadFilter());
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    if (gainDb) {
      f.gain.value = gainDb;
    }
    return f;
  }

  function createPanner() {
    if (context.createStereoPanner) {
      return track(context.createStereoPanner());
    }
    // very old WebKit: no StereoPannerNode — degrade to a plain gain with a dummy pan param
    const g = gainNode(1);
    g.pan = { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} };
    return g;
  }

  function loopSource(buffer, rate = 1) {
    const src = track(context.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, rnd() * buffer.duration * 0.9);
    return src;
  }

  // LFO → AudioParam (adds `depth` * sin around the param's own value)
  function lfo(param, frequency, depth, type = 'sine') {
    const osc = track(context.createOscillator());
    osc.type = type;
    osc.frequency.value = frequency;
    const g = gainNode(depth);
    osc.connect(g);
    g.connect(param);
    osc.start();
    return { osc, gain: g };
  }

  function chain(nodes) {
    for (let i = 0; i < nodes.length - 1; i += 1) {
      nodes[i].connect(nodes[i + 1]);
    }
    return nodes[nodes.length - 1];
  }

  function setTarget(param, value, tc) {
    param.setTargetAtTime(value, context.currentTime, tc);
  }

  // ---- buffers ----
  function makeNoise(kind, seconds, channels) {
    const sr = context.sampleRate;
    const len = Math.floor(sr * seconds);
    const buffer = context.createBuffer(channels, len, sr);
    for (let c = 0; c < channels; c += 1) {
      const data = buffer.getChannelData(c);
      if (kind === 'white') {
        for (let i = 0; i < len; i += 1) {
          data[i] = rnd() * 2 - 1;
        }
      } else if (kind === 'pink') {
        // Paul Kellet's refined pink filter
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;
        for (let i = 0; i < len; i += 1) {
          const w = rnd() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      } else {
        // brown: leaky integrator of white noise
        let last = 0;
        for (let i = 0; i < len; i += 1) {
          last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02;
          data[i] = last * 3.5;
        }
      }
    }
    return buffer;
  }

  // Synthesized impulse response: pre-delay, a few early reflections, then
  // exponentially decaying noise whose high end dies faster than the low end.
  function makeImpulse(seconds, decay) {
    const sr = context.sampleRate;
    const len = Math.floor(sr * seconds);
    const buffer = context.createBuffer(2, len, sr);
    const preDelay = Math.floor(sr * 0.012);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      let lp = 0;
      for (let i = preDelay; i < len; i += 1) {
        const t = (i - preDelay) / sr;
        const w = (rnd() * 2 - 1) * Math.exp(-decay * t);
        const a = lerp(0.85, 0.1, Math.min(1, t / seconds));
        lp += a * (w - lp);
        data[i] = lp;
      }
      for (let k = 0; k < 6; k += 1) {
        const idx = preDelay + Math.floor(sr * rand(0.016, 0.07));
        if (idx < len) {
          data[idx] += (k % 2 ? -1 : 1) * rand(0.25, 0.6);
        }
      }
    }
    return buffer;
  }

  // ------------------------------------------------------------------
  // one-shot voice helpers
  // ------------------------------------------------------------------
  const voices = [];

  // A voice is the tail of a one-shot: [lpf] -> gain -> panner -> dest (+ reverb send)
  function makeVoice(dest, { pan = 0, send = 0, lpf = 0 } = {}) {
    const gain = gainNode(1);
    const panner = createPanner();
    panner.pan.value = clamp(pan, -1, 1);
    let input = gain;
    let filter = null;
    if (lpf > 0) {
      filter = biquad('lowpass', lpf, 0.7);
      filter.connect(gain);
      input = filter;
    }
    gain.connect(panner);
    panner.connect(dest);
    let sendGain = null;
    if (send > 0 && reverbSend) {
      sendGain = gainNode(send);
      gain.connect(sendGain);
      sendGain.connect(reverbSend);
    }
    const voice = { input, gain, panner, filter, sendGain, end: 0, pos: null, refDist: 20, level: 1, name: '', nodeCount: 3 };
    voices.push(voice);
    return voice;
  }

  function releaseVoice(voice) {
    voice.panner.disconnect();
    voice.gain.disconnect();
    voice.sendGain?.disconnect();
    voice.filter?.disconnect();
  }

  function cleanupVoices() {
    const now = context.currentTime;
    for (let i = voices.length - 1; i >= 0; i -= 1) {
      const v = voices[i];
      if (v.end && now > v.end + 0.15) {
        releaseVoice(v);
        voices.splice(i, 1);
      }
    }
  }

  // enveloped noise burst: source -> filters -> gain(env) -> voice
  function burst(voice, t0, decay, opts = {}) {
    const { buffer = buffers.white, rate = 1, peak = 0.1, attack = 0.005, hold = 0, filters = [] } = opts;
    const src = track(context.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    let node = src;
    for (const [type, freq, q, gainDb] of filters) {
      const f = biquad(type, freq, q, gainDb);
      node.connect(f);
      node = f;
    }
    const g = gainNode(FLOOR);
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(Math.max(FLOOR, peak), t0 + attack);
    if (hold > 0) {
      g.gain.setValueAtTime(Math.max(FLOOR, peak), t0 + attack + hold);
    }
    const end = t0 + attack + hold + decay;
    g.gain.exponentialRampToValueAtTime(FLOOR, end);
    node.connect(g);
    g.connect(voice.input);
    src.start(t0, rnd() * Math.max(0, buffer.duration - 0.6));
    src.stop(end + 0.03);
    voice.nodeCount += 2 + filters.length;
    return end;
  }

  // enveloped oscillator note with optional frequency glide, tremolo and filters
  function note(voice, t0, dur, opts = {}) {
    const { type = 'sine', freq = 1000, glide = null, peak = 0.1, attack = 0.01, release = null, tremolo = null, filter = null, detune = 0 } = opts;
    const osc = track(context.createOscillator());
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (detune) {
      osc.detune.value = detune;
    }
    if (glide) {
      for (const [dt, f] of glide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t0 + Math.max(0.005, dt));
      }
    }
    let node = osc;
    if (filter) {
      for (const [ftype, ffreq, q, gainDb] of filter) {
        const f = biquad(ftype, ffreq, q, gainDb);
        node.connect(f);
        node = f;
        voice.nodeCount += 1;
      }
    }
    if (tremolo) {
      node = tremoloStage(node, tremolo, t0, t0 + dur + 0.05);
      voice.nodeCount += 3;
    }
    const g = gainNode(FLOOR);
    const p = Math.max(FLOOR, peak);
    const a = Math.min(attack, dur * 0.5);
    const rel = clamp(release ?? dur * 0.6, 0.005, dur - a);
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(p, t0 + a);
    g.gain.setValueAtTime(p, t0 + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    node.connect(g);
    g.connect(voice.input);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    voice.nodeCount += 2;
    return t0 + dur;
  }

  // series tremolo: gain swings between (1 - depth) and 1, never negative
  function tremoloStage(node, tremolo, t0, tEnd) {
    const depth = clamp(tremolo.depth, 0, 1);
    const trem = gainNode(1 - depth * 0.5);
    const l = track(context.createOscillator());
    l.type = tremolo.type ?? 'sine';
    l.frequency.value = tremolo.rate;
    const lg = gainNode(depth * 0.5);
    l.connect(lg);
    lg.connect(trem.gain);
    l.start(t0);
    l.stop(tEnd);
    node.connect(trem);
    return trem;
  }

  // one oscillator, one gain, a train of short pulses (frogs, crickets)
  function pulseTrain(voice, t0, opts = {}) {
    const { type = 'sine', freq = 1000, glideEnd = null, pulses = 4, spacing = 0.12, pulseDur = 0.06, attack = 0.01, peak = 1, filter = null, tremolo = null } = opts;
    const total = pulses * spacing;
    const osc = track(context.createOscillator());
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideEnd) {
      osc.frequency.linearRampToValueAtTime(glideEnd, t0 + total);
    }
    let node = osc;
    if (filter) {
      for (const [ftype, ffreq, q, gainDb] of filter) {
        const f = biquad(ftype, ffreq, q, gainDb);
        node.connect(f);
        node = f;
        voice.nodeCount += 1;
      }
    }
    if (tremolo) {
      node = tremoloStage(node, tremolo, t0, t0 + total + 0.05);
      voice.nodeCount += 3;
    }
    const g = gainNode(FLOOR);
    const p = Math.max(FLOOR, peak);
    const pd = Math.min(pulseDur, spacing - 0.005);
    const a = Math.min(attack, pd * 0.4);
    let t = t0;
    for (let i = 0; i < pulses; i += 1) {
      g.gain.setValueAtTime(FLOOR, t);
      g.gain.linearRampToValueAtTime(p, t + a);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + pd);
      t += spacing;
    }
    node.connect(g);
    g.connect(voice.input);
    osc.start(t0);
    osc.stop(t + 0.03);
    voice.nodeCount += 2;
    return t;
  }

  function duckAmbience(amount, hold) {
    if (!duck) {
      return;
    }
    const now = context.currentTime;
    duck.gain.setTargetAtTime(1 - clamp(amount, 0, 0.8), now, 0.012);
    duck.gain.setTargetAtTime(1, now + hold, 0.35);
  }

  // ------------------------------------------------------------------
  // continuous ambience layers
  // ------------------------------------------------------------------
  const layers = {};
  const state = {
    waterfall: { dist: 0, gain: 0, pan: 0, lpf: 0, occlusion: 0, surge: 1 },
    river: { dist: 0, gain: 0, pan: 0, lpf: 0, strength: 0 },
    lagoon: { gain: 0, foam: 0, wave: 0, pan: 0, proximity: 0 },
    wind: { gain: 0, freq: 0, gust: 0 },
    leaves: { gain: 0 },
    cicadas: [],
    underwater: { lpf: 20000, air: 1, drone: 0, pressure: 0, tension: 0 },
  };

  function buildAmbience() {
    // ---- waterfall: brown rumble + white hiss + white sizzle, each with slow AM ----
    {
      const rumbleSrc = loopSource(buffers.brown);
      const hissSrc = loopSource(buffers.white);
      const rumbleGain = gainNode(1.0);
      const hissGain = gainNode(0.42);
      const sizzleGain = gainNode(0.2);
      const sum = gainNode(1);
      chain([rumbleSrc, biquad('lowpass', 170, 0.8), biquad('peaking', 62, 1.0, 5), rumbleGain, sum]);
      chain([hissSrc, biquad('bandpass', 1050, 0.5), hissGain, sum]);
      chain([hissSrc, biquad('highpass', 3600, 0.7), sizzleGain, sum]);
      const color = biquad('lowpass', 12000, 0.5);
      const gain = gainNode(0);
      const pan = createPanner();
      const send = gainNode(0.22);
      chain([sum, color, gain, pan, ambienceBus]);
      gain.connect(send);
      send.connect(reverbSend);
      lfo(rumbleGain.gain, 0.21, 0.28);
      lfo(rumbleGain.gain, 0.57, 0.14);
      lfo(hissGain.gain, 0.83, 0.09);
      lfo(sizzleGain.gain, 1.9, 0.05);
      layers.waterfall = { gain, pan, color, surge: 1, surgeTarget: 1, surgeTimer: 0 };
    }

    // ---- river babble: two modulated bands + a low gurgle ----
    {
      const src = loopSource(buffers.white);
      const gurgleSrc = loopSource(buffers.brown, 1.3);
      const gA = gainNode(0.55);
      const gB = gainNode(0.35);
      const gG = gainNode(0.6);
      const sum = gainNode(1);
      chain([src, biquad('bandpass', 900, 1.3), gA, sum]);
      chain([src, biquad('bandpass', 2300, 1.8), gB, sum]);
      chain([gurgleSrc, biquad('lowpass', 330, 1.2), gG, sum]);
      const color = biquad('lowpass', 9000, 0.5);
      const gain = gainNode(0);
      const pan = createPanner();
      const send = gainNode(0.18);
      chain([sum, color, gain, pan, ambienceBus]);
      gain.connect(send);
      send.connect(reverbSend);
      const lfoA = lfo(gA.gain, 4.3, 0.3);
      const lfoB = lfo(gB.gain, 6.9, 0.2);
      lfo(gG.gain, 1.3, 0.25);
      layers.river = { gain, pan, color, lfoA: lfoA.osc, lfoB: lfoB.osc, driftTimer: 0 };
    }

    // ---- lagoon: low wash + foam hiss shaped by wave envelopes ----
    {
      const washSrc = loopSource(buffers.pink, 0.8);
      const foamSrc = loopSource(buffers.white);
      const wash = gainNode(0);
      const foam = gainNode(0);
      const pan = createPanner();
      chain([washSrc, biquad('lowpass', 650, 0.7), wash, pan, ambienceBus]);
      chain([foamSrc, biquad('bandpass', 3200, 0.8), foam, pan]);
      layers.lagoon = { wash, foam, pan, waveTimer: rand(1, 3), waveT: 0, wavePeak: 0, waveActive: false, level: 0 };
    }

    // ---- canopy wind + leaf rustle ----
    {
      const windSrc = loopSource(buffers.pink, 0.65);
      const band = biquad('bandpass', 420, 0.45);
      const gain = gainNode(0);
      const send = gainNode(0.08);
      chain([windSrc, band, gain, ambienceBus]);
      gain.connect(send);
      send.connect(reverbSend);
      lfo(gain.gain, 0.07, 0.012);
      layers.wind = { gain, band };

      const leafSrc = loopSource(buffers.white);
      const leaves = gainNode(0);
      chain([leafSrc, biquad('highpass', 1800, 0.7), biquad('bandpass', 4200, 0.8), leaves, ambienceBus]);
      const flutter = lfo(leaves.gain, 5.5, 0);
      layers.leaves = { gain: leaves, flutter: flutter.gain };
    }

    // ---- cicadas: raspy tremolo'd noise bands that swell and fade ----
    layers.cicadas = [];
    const cicadaDefs = [
      { f0: 4300, trem: 96, side: -1 },
      { f0: 5700, trem: 131, side: 1 },
    ];
    cicadaDefs.forEach((def, i) => {
      const src = loopSource(buffers.white);
      const band = biquad('bandpass', def.f0, 9);
      const trem = gainNode(0.5);
      const swell = gainNode(0);
      const pan = createPanner();
      pan.pan.value = def.side * 0.55;
      chain([src, band, trem, swell, pan, ambienceBus]);
      lfo(trem.gain, def.trem, 0.5, 'square');
      layers.cicadas.push({
        band,
        swell,
        pan,
        f0: def.f0,
        side: def.side,
        phase: 'idle',
        timer: rand(2, 10 + i * 6),
        t: 0,
        dur: 1,
        peak: 1,
        level: 0,
        enabled: true,
      });
      state.cicadas.push({ level: 0, gain: 0, f0: def.f0, phase: 'idle' });
    });

    // ---- underwater bed (bypasses the muffle filter) ----
    {
      const droneA = track(context.createOscillator());
      droneA.frequency.value = 54;
      const droneB = track(context.createOscillator());
      droneB.frequency.value = 81.5;
      lfo(droneB.detune, 0.11, 18);
      const drone = gainNode(0);
      const droneLp = biquad('lowpass', 240, 0.8);
      droneA.connect(droneLp);
      droneB.connect(droneLp);
      chain([droneLp, drone, submergedBus]);
      droneA.start();
      droneB.start();
      const pressureSrc = loopSource(buffers.brown, 0.7);
      const pressure = gainNode(0);
      chain([pressureSrc, biquad('lowpass', 160, 0.7), pressure, submergedBus]);
      layers.underwater = { drone, pressure };
    }
  }

  function tickWaterfall(tdt) {
    const L = layers.waterfall;
    const s = spatial(fallsPoint.x, fallsPoint.y, fallsPoint.z);
    const d = s.dist;
    const near = Math.max(0, d - 8);
    let loud = 0.62 / (1 + Math.pow(near / 30, 1.65));
    // the cliff blocks the sound when the listener is north of / above the crest
    const occl = smoothstep(90, 104, -listener.z);
    loud *= 1 - 0.55 * occl;
    L.surgeTimer -= tdt;
    if (L.surgeTimer <= 0) {
      L.surgeTimer = rand(1.5, 4);
      L.surgeTarget = rand(0.86, 1.14);
    }
    L.surge = lerp(L.surge, L.surgeTarget, 1 - Math.exp(-tdt * 1.2));
    const gain = loud * L.surge;
    const pan = clamp(s.pan * clamp(s.dh / 18, 0, 1) * 0.85, -0.85, 0.85);
    let lpf = 12000 / (1 + Math.pow(d / 45, 1.6));
    lpf *= 1 - 0.5 * occl;
    lpf *= 1 - 0.25 * Math.max(0, -s.front);
    lpf = clamp(lpf, 500, 12000);
    setTarget(L.gain.gain, gain, 0.15);
    setTarget(L.pan.pan, pan, 0.15);
    setTarget(L.color.frequency, lpf, 0.2);
    const w = state.waterfall;
    w.dist = d;
    w.gain = gain;
    w.pan = pan;
    w.lpf = lpf;
    w.occlusion = occl;
    w.surge = L.surge;
  }

  function tickRiver(tdt) {
    const L = layers.river;
    const edgeDist = Math.max(0, env.riverDist - WORLD.riverHalfWidth);
    const gain = (0.3 * env.riverStrength) / (1 + Math.pow(edgeDist / 16, 1.9));
    const s = spatial(env.riverX, WORLD.waterLevel, env.riverZ);
    const pan = clamp(s.pan * clamp(edgeDist / 10, 0, 1) * 0.8, -0.8, 0.8);
    const lpf = clamp(9000 / (1 + Math.pow(edgeDist / 40, 1.5)), 700, 9000);
    L.driftTimer -= tdt;
    if (L.driftTimer <= 0) {
      L.driftTimer = rand(1.5, 4);
      setTarget(L.lfoA.frequency, rand(3, 6), 0.8);
      setTarget(L.lfoB.frequency, rand(5, 9.5), 0.8);
    }
    setTarget(L.gain.gain, gain, 0.15);
    setTarget(L.pan.pan, pan, 0.15);
    setTarget(L.color.frequency, lpf, 0.2);
    const r = state.river;
    r.dist = env.riverDist;
    r.gain = gain;
    r.pan = pan;
    r.lpf = lpf;
    r.strength = env.riverStrength;
  }

  function tickLagoon(tdt) {
    const L = layers.lagoon;
    const shoreR = WORLD.lagoonRadius + 2;
    const edge = Math.abs(env.lagoonDist - shoreR);
    let prox = 1 - smoothstep(3, 28, edge);
    if (env.inLagoon) {
      prox = Math.max(prox, 0.55);
    }
    // the falls dominate their corner of the lagoon
    prox *= 1 - 0.6 * (1 - smoothstep(10, 35, env.fallsDist));

    L.waveTimer -= tdt;
    if (L.waveTimer <= 0 && !L.waveActive) {
      L.waveTimer = rand(2.2, 6);
      L.wavePeak = rand(0.5, 1);
      L.waveT = 0;
      L.waveActive = true;
    }
    let target = 0;
    if (L.waveActive) {
      L.waveT += tdt;
      const rise = 0.9;
      const fall = 1.8;
      target = L.waveT < rise ? L.wavePeak * smoothstep(0, rise, L.waveT) : L.wavePeak * (1 - smoothstep(rise, rise + fall, L.waveT));
      if (L.waveT > rise + fall) {
        L.waveActive = false;
      }
    }
    L.level = lerp(L.level, target, 1 - Math.exp(-tdt * 4));
    const base = 0.16 * prox;
    const wash = base * (0.4 + 0.6 * L.level);
    const foam = base * 0.5 * L.level * L.level;
    let pan = 0;
    if (!env.inLagoon) {
      const s = spatial(lagoon.x, WORLD.waterLevel, lagoon.z);
      pan = clamp(s.pan * 0.7 * clamp(edge / 10, 0, 1), -0.7, 0.7);
    }
    setTarget(L.wash.gain, wash, 0.2);
    setTarget(L.foam.gain, foam, 0.2);
    setTarget(L.pan.pan, pan, 0.25);
    const g = state.lagoon;
    g.gain = wash;
    g.foam = foam;
    g.wave = L.level;
    g.pan = pan;
    g.proximity = prox;
  }

  const gust = { level: 0, phase: 'idle', timer: rand(3, 8), t: 0, peak: 0, rise: 1, fall: 3 };

  function updateGust(dt) {
    if (gust.phase === 'idle') {
      gust.timer -= dt;
      gust.level = Math.max(0, gust.level - dt * 0.3);
      if (gust.timer <= 0) {
        gust.phase = 'rise';
        gust.t = 0;
        gust.peak = rand(0.45, 1);
        gust.rise = rand(1, 2.6);
        gust.fall = rand(2, 5.5);
      }
    } else if (gust.phase === 'rise') {
      gust.t += dt;
      gust.level = gust.peak * smoothstep(0, gust.rise, gust.t);
      if (gust.t >= gust.rise) {
        gust.phase = 'fall';
        gust.t = 0;
      }
    } else {
      gust.t += dt;
      gust.level = gust.peak * (1 - smoothstep(0, gust.fall, gust.t));
      if (gust.t >= gust.fall) {
        gust.phase = 'idle';
        gust.timer = rand(4, 14);
      }
    }
  }

  function tickWind() {
    const open = 1 - env.canopy;
    const base = 0.045 + 0.085 * env.elevation;
    const windGain = base * (0.6 + 0.4 * open) * (1 + 1.5 * gust.level);
    const freq = 320 + 380 * open + 350 * gust.level + 200 * env.elevation;
    setTarget(layers.wind.gain.gain, windGain, 0.25);
    setTarget(layers.wind.band.frequency, freq, 0.4);
    const leaves = lowMode ? 0 : (0.012 + 0.11 * gust.level) * (0.2 + 0.8 * env.canopy) * (1 + 0.5 * env.elevation);
    setTarget(layers.leaves.gain.gain, leaves, 0.2);
    setTarget(layers.leaves.flutter.gain, leaves * 0.35, 0.2);
    state.wind.gain = windGain;
    state.wind.freq = freq;
    state.wind.gust = gust.level;
    state.leaves.gain = leaves;
  }

  function tickCicadas(tdt) {
    const heat = 0.3 + 0.7 * env.canopyArea;
    layers.cicadas.forEach((c, i) => {
      if (c.phase === 'idle') {
        c.timer -= tdt;
        if (c.timer <= 0 && c.enabled) {
          c.phase = 'rise';
          c.t = 0;
          c.dur = rand(2, 5);
          c.peak = rand(0.55, 1);
          const f0 = c.f0 * rand(0.93, 1.07);
          setTarget(c.band.frequency, f0, 0.5);
          setTarget(c.pan.pan, c.side * rand(0.35, 0.75), 0.5);
          state.cicadas[i].f0 = f0;
        }
      } else {
        c.t += tdt;
        if (c.t >= c.dur) {
          c.t = 0;
          if (c.phase === 'rise') {
            c.phase = 'hold';
            c.dur = rand(3, 9);
          } else if (c.phase === 'hold') {
            c.phase = 'fall';
            c.dur = rand(2, 6);
          } else {
            c.phase = 'idle';
            c.timer = rand(4, 18);
          }
        }
      }
      let target = 0;
      if (c.phase === 'rise') {
        target = c.peak * smoothstep(0, c.dur, c.t);
      } else if (c.phase === 'hold') {
        target = c.peak * (0.85 + 0.15 * Math.sin(c.t * 1.7));
      } else if (c.phase === 'fall') {
        target = c.peak * (1 - smoothstep(0, c.dur, c.t));
      }
      c.level = lerp(c.level, target, 1 - Math.exp(-tdt * 3));
      // the Q=9 band passes ~2% of the noise energy, hence the large scale
      const gain = c.enabled ? c.level * 0.35 * heat : 0;
      setTarget(c.swell.gain, gain, 0.2);
      state.cicadas[i].level = c.level;
      state.cicadas[i].gain = gain;
      state.cicadas[i].phase = c.phase;
    });
  }

  function tickUnderwater() {
    const uw = listener.underwater;
    setTarget(underwaterFilter.frequency, uw ? 350 : 20000, uw ? 0.05 : 0.09);
    setTarget(airGain.gain, uw ? 0.3 : 1, 0.08);
    setTarget(layers.underwater.drone.gain, uw ? 0.07 : 0, 0.15);
    setTarget(layers.underwater.pressure.gain, uw ? 0.05 : 0, 0.15);
    const u = state.underwater;
    u.lpf = underwaterFilter.frequency.value;
    u.air = airGain.gain.value;
    u.drone = uw ? 0.07 : 0;
    u.pressure = uw ? 0.05 : 0;
    u.tension = clamp(submergeTime / 10, 0, 1);
  }

  // ------------------------------------------------------------------
  // fauna
  // ------------------------------------------------------------------
  const birdActivity = () => 0.25 + 0.75 * env.canopyArea;

  const species = [
    {
      name: 'whistler',
      gap: [7, 20],
      pick: 'canopy',
      range: [12, 60],
      height: [5, 14],
      refDist: 22,
      level: 0.32,
      activity: birdActivity,
      synth(v, t0) {
        const f0 = rand(1900, 3100);
        const n = 1 + Math.floor(rnd() * 3);
        let t = t0;
        for (let i = 0; i < n; i += 1) {
          const f = f0 * (1 + (rnd() - 0.5) * 0.12);
          const dur = rand(0.26, 0.42);
          note(v, t, dur, { freq: f * 0.92, glide: [[dur * 0.35, f * 1.32], [dur, f * 0.85]], peak: 1, attack: 0.03 });
          t += dur + rand(0.18, 0.4);
        }
        return t;
      },
    },
    {
      name: 'triller',
      gap: [9, 26],
      pick: 'canopy',
      range: [12, 60],
      height: [5, 14],
      refDist: 22,
      level: 0.26,
      activity: birdActivity,
      synth(v, t0) {
        const f = rand(3300, 4300);
        const dur = rand(0.6, 1.2);
        note(v, t0, dur, { freq: f, glide: [[dur, f * 0.86]], peak: 1, attack: 0.05, tremolo: { rate: rand(16, 26), depth: 0.85 } });
        note(v, t0 + dur + 0.05, 0.12, { freq: f * 0.8, glide: [[0.12, f * 1.3]], peak: 0.6, attack: 0.02 });
        return t0 + dur + 0.2;
      },
    },
    {
      name: 'two-note',
      gap: [8, 24],
      pick: 'canopy',
      range: [12, 60],
      height: [5, 14],
      refDist: 22,
      level: 0.3,
      activity: birdActivity,
      synth(v, t0) {
        const n = 2 + Math.floor(rnd() * 3);
        const fa = rand(1500, 1900);
        const fb = rand(2300, 2900);
        let t = t0;
        for (let i = 0; i < n; i += 1) {
          note(v, t, 0.13, { freq: fa, glide: [[0.13, fa * 0.95]], peak: 0.85, attack: 0.015 });
          note(v, t + 0.17, 0.2, { freq: fb * 0.9, glide: [[0.2, fb * 1.25]], peak: 1, attack: 0.02 });
          t += 0.55 + rnd() * 0.2;
        }
        return t;
      },
    },
    {
      name: 'woodpecker',
      gap: [14, 40],
      pick: 'canopy',
      range: [15, 55],
      height: [4, 10],
      refDist: 24,
      level: 0.3,
      activity: () => 0.15 + 0.85 * env.canopyArea,
      synth(v, t0) {
        const pulses = 8 + Math.floor(rnd() * 7);
        let spacing = rand(0.052, 0.07);
        const src = track(context.createBufferSource());
        src.buffer = buffers.white;
        src.loop = true;
        const hi = biquad('bandpass', rand(2600, 3200), 4);
        const lo = biquad('bandpass', 700, 2.5);
        const gHi = gainNode(FLOOR);
        const gLo = gainNode(FLOOR);
        src.connect(hi);
        src.connect(lo);
        hi.connect(gHi);
        lo.connect(gLo);
        gHi.connect(v.input);
        gLo.connect(v.input);
        let t = t0;
        for (let i = 0; i < pulses; i += 1) {
          for (const [g, p] of [[gHi, 1], [gLo, 0.7]]) {
            g.gain.setValueAtTime(FLOOR, t);
            g.gain.linearRampToValueAtTime(p, t + 0.003);
            g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.028);
          }
          t += spacing;
          spacing *= 1.012;
        }
        src.start(t0, rnd() * 1.2);
        src.stop(t + 0.05);
        v.nodeCount += 5;
        return t + 0.05;
      },
    },
    {
      name: 'hornbill',
      gap: [30, 80],
      pick: 'far',
      range: [70, 160],
      height: [10, 20],
      refDist: 60,
      level: 0.35,
      activity: () => 1,
      synth(v, t0) {
        const n = 2 + Math.floor(rnd() * 2);
        const f0 = rand(480, 620);
        let t = t0;
        for (let i = 0; i < n; i += 1) {
          const f = f0 * (i === 0 ? 1 : 0.9);
          note(v, t, 0.3, {
            type: 'sawtooth',
            freq: f,
            glide: [[0.05, f * 1.15], [0.3, f * 0.93]],
            peak: 1,
            attack: 0.04,
            filter: [['lowpass', 1400, 1], ['peaking', 1100, 2, 6]],
          });
          t += 0.42 + rnd() * 0.15;
        }
        return t;
      },
    },
    {
      name: 'parrot',
      gap: [40, 110],
      pick: 'far',
      range: [50, 140],
      height: [8, 18],
      refDist: 55,
      level: 0.3,
      activity: () => 1,
      synth(v, t0) {
        const n = 1 + Math.floor(rnd() * 3);
        let t = t0;
        for (let i = 0; i < n; i += 1) {
          const f = rand(1500, 2000);
          note(v, t, 0.28, {
            type: 'sawtooth',
            freq: f,
            glide: [[0.08, f * 1.4], [0.26, f * 0.7]],
            peak: 1,
            attack: 0.02,
            tremolo: { rate: 32, depth: 0.6, type: 'square' },
            filter: [['bandpass', 2200, 1.2]],
          });
          t += 0.36 + rnd() * 0.1;
        }
        return t;
      },
    },
    {
      name: 'monkey',
      gap: [50, 140],
      pick: 'far',
      range: [80, 170],
      height: [8, 16],
      refDist: 70,
      level: 0.35,
      activity: () => 1,
      synth(v, t0) {
        const n = 3 + Math.floor(rnd() * 4);
        let gap = 0.5;
        let t = t0;
        for (let i = 0; i < n; i += 1) {
          const f = rand(380, 520);
          note(v, t, 0.34, { freq: f, glide: [[0.1, f * 1.6], [0.34, f * 1.1]], peak: 1, attack: 0.05 });
          note(v, t, 0.3, { type: 'triangle', freq: f * 2, glide: [[0.1, f * 3.2], [0.3, f * 2.2]], peak: 0.3, attack: 0.05 });
          t += gap;
          gap *= 0.9;
        }
        return t + 0.3;
      },
    },
    {
      name: 'cricket',
      gap: [3, 9],
      pick: 'ground',
      range: [5, 22],
      height: [0.2, 0.6],
      refDist: 12,
      level: 0.09,
      activity: () => smoothstep(0.3, 0.75, env.canopy),
      synth(v, t0) {
        return pulseTrain(v, t0, {
          type: 'sine',
          freq: rand(4400, 5200),
          pulses: 4 + Math.floor(rnd() * 4),
          spacing: rand(0.11, 0.15),
          pulseDur: 0.055,
          attack: 0.008,
          peak: 1,
          tremolo: { rate: 38, depth: 0.5 },
        });
      },
    },
    {
      name: 'frog',
      gap: [4, 12],
      pick: 'shore',
      range: [4, 30],
      height: [0.2, 0.4],
      refDist: 14,
      level: 0.22,
      activity: () => env.waterEdge * (listener.swimming ? 0.5 : 1),
      synth(v, t0) {
        const f = rand(110, 175);
        return pulseTrain(v, t0, {
          type: 'sawtooth',
          freq: f,
          glideEnd: f * 0.85,
          pulses: 3 + Math.floor(rnd() * 4),
          spacing: rand(0.11, 0.2),
          pulseDur: 0.09,
          attack: 0.015,
          peak: 1,
          filter: [['lowpass', 900, 3]],
        });
      },
    },
  ];
  for (const sp of species) {
    sp.timer = rand(sp.gap[0] * 0.3, sp.gap[1] * 0.6);
    sp.calls = 0;
    sp.lastActivity = 0;
  }

  function shorePoint() {
    if (rnd() < 0.5 || listener.z < lagoon.z + 10) {
      const base = Math.atan2(listener.x - lagoon.x, listener.z - lagoon.z);
      const a = base + (rnd() - 0.5) * 1.6;
      const r = WORLD.lagoonRadius + 2.5;
      return { x: lagoon.x + Math.sin(a) * r, z: lagoon.z + Math.cos(a) * r };
    }
    const z = clamp(listener.z + (rnd() - 0.5) * 50, lagoon.z + 8, half);
    const side = rnd() < 0.5 ? -1 : 1;
    return { x: riverX(z) + side * (WORLD.riverHalfWidth + 1.5), z };
  }

  function pickPosition(sp) {
    const [r0, r1] = sp.range;
    let best = null;
    let bestScore = -Infinity;
    const tries = sp.pick === 'canopy' ? 4 : sp.pick === 'ground' || sp.pick === 'shore' ? 3 : 1;
    for (let i = 0; i < tries; i += 1) {
      let x;
      let z;
      if (sp.pick === 'shore') {
        ({ x, z } = shorePoint());
      } else {
        const a = rnd() * TAU;
        const r = rand(r0, r1);
        x = listener.x + Math.sin(a) * r;
        z = listener.z + Math.cos(a) * r;
      }
      x = clamp(x, -half, half);
      z = clamp(z, -half, half);
      const c = canopyAt(x, z);
      let score = rnd() * 0.3;
      if (sp.pick === 'canopy' || sp.pick === 'ground') {
        score += c;
      } else if (sp.pick === 'shore') {
        score -= Math.hypot(x - listener.x, z - listener.z) / 40;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, c };
      }
    }
    const ground = sp.pick === 'shore' ? WORLD.waterLevel : Math.max(WORLD.waterLevel, ctx.terrain.sampleHeight(best.x, best.z));
    return { x: best.x, y: ground + rand(sp.height[0], sp.height[1]), z: best.z, canopy: best.c };
  }

  function applySpatial(v, immediate) {
    const s = spatial(v.pos.x, v.pos.y, v.pos.z);
    const d = s.dist;
    const att = 1 / (1 + Math.pow(d / v.refDist, 1.8));
    const g = v.level * att;
    const pan = clamp(s.pan * clamp(s.dh / 5, 0, 1) * 0.92, -0.95, 0.95);
    const behind = Math.max(0, -s.front);
    const lpf = clamp((15000 / (1 + Math.pow(d / 55, 1.6))) * (1 - 0.35 * behind), 800, 18000);
    const send = clamp(0.12 + d / 160, 0.1, 0.6);
    const t = context.currentTime;
    if (immediate) {
      v.gain.gain.setValueAtTime(g, t);
      v.panner.pan.setValueAtTime(pan, t);
      v.filter?.frequency.setValueAtTime(lpf, t);
      v.sendGain?.gain.setValueAtTime(send, t);
    } else {
      v.gain.gain.setTargetAtTime(g, t, 0.12);
      v.panner.pan.setTargetAtTime(pan, t, 0.12);
      v.filter?.frequency.setTargetAtTime(lpf, t, 0.12);
      v.sendGain?.gain.setTargetAtTime(send, t, 0.12);
    }
    v.dist = d;
    v.curGain = g;
    v.curPan = pan;
    v.curLpf = lpf;
  }

  function faunaVoiceCount() {
    let n = 0;
    for (const v of voices) {
      if (v.pos) {
        n += 1;
      }
    }
    return n;
  }

  function playSpecies(sp, pos = null, force = false) {
    if (!force && faunaVoiceCount() >= maxVoices) {
      return null;
    }
    const v = makeVoice(ambienceBus, { pan: 0, send: 0.2, lpf: 16000 });
    v.pos = pos ?? pickPosition(sp);
    v.refDist = sp.refDist;
    v.level = sp.level;
    v.name = sp.name;
    applySpatial(v, true);
    const t0 = context.currentTime + 0.03;
    try {
      v.end = sp.synth(v, t0);
    } catch (error) {
      v.end = t0 + 0.5;
      console.warn(`audio: ${sp.name} synth failed`, error);
    }
    sp.calls += 1;
    counters.calls += 1;
    recentCalls.push({
      name: sp.name,
      dist: Number(v.dist.toFixed(1)),
      pan: Number(v.curPan.toFixed(2)),
      gain: Number(v.curGain.toFixed(3)),
      lpf: Math.round(v.curLpf),
      canopy: Number((v.pos.canopy ?? 0).toFixed(2)),
    });
    if (recentCalls.length > 10) {
      recentCalls.shift();
    }
    return v;
  }

  // delayed one-shots driven by the frame loop (so they pause with the context)
  const pending = [];
  let hush = 0;
  const BIRDS = new Set(['whistler', 'triller', 'two-note', 'woodpecker']);

  function schedule(delay, fn) {
    pending.push({ t: delay, fn });
  }

  function runPending(dt) {
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) {
        const { fn } = pending[i];
        pending.splice(i, 1);
        fn();
      }
    }
  }

  // A loud player event silences the nearby chorus for a moment and flushes an
  // alarm call or two from the closest trees.
  function startle(intensity) {
    const k = clamp(intensity, 0, 1);
    hush = Math.max(hush, 1.5 + 3 * k);
    const alarms = rnd() < 0.35 + 0.65 * k ? 1 + Math.floor(rnd() * 2) : 0;
    for (let i = 0; i < alarms; i += 1) {
      schedule(rand(0.25, 0.9) + i * rand(0.3, 0.6), () => {
        if (!ready()) {
          return;
        }
        const name = rnd() < 0.6 ? 'two-note' : 'parrot';
        const sp = species.find((s) => s.name === name);
        playSpecies(sp, pickPosition({ ...sp, range: [15, 40] }));
      });
    }
  }

  function updateFauna(dt) {
    hush = Math.max(0, hush - dt);
    for (const sp of species) {
      let activity = clamp(sp.activity(), 0, 1);
      if (hush > 0 && BIRDS.has(sp.name)) {
        activity *= 0.2;
      }
      sp.lastActivity = activity;
      sp.timer -= dt * Math.max(activity, 0.02);
      if (sp.timer <= 0) {
        sp.timer = rand(sp.gap[0], sp.gap[1]);
        if (activity > 0.03) {
          playSpecies(sp);
        }
      }
    }
  }

  function tickVoices() {
    for (const v of voices) {
      if (v.pos) {
        applySpatial(v, false);
      }
    }
  }

  // ------------------------------------------------------------------
  // player sounds
  // ------------------------------------------------------------------
  let stepSide = 1;
  let wasUnderwater = false;
  let wasInWater = false;
  let wasAirborne = false;
  let prevVy = 0;
  let submergeTime = 0;
  let bubbleTimer = 0;
  let heartTimer = 0;
  let strokeTimer = 0;
  let hasLandHook = false;
  let hasSplashHook = false;

  function ready() {
    return Boolean(context && !muted && context.state === 'running');
  }

  const SURFACES = new Set(['grass', 'sand', 'rock', 'water', 'dirt']);

  function surfaceAt(player) {
    if (player.isSwimming || player.isWading || (player.waterDepth ?? 0) > 0.05) {
      return 'water';
    }
    if (typeof player.surface === 'string' && SURFACES.has(player.surface)) {
      return player.surface;
    }
    const { x, z } = player.position;
    const h = ctx.terrain.sampleHeight(x, z);
    const n = ctx.terrain.sampleNormal(x, z);
    if (n.y < 0.72 || h > 12) {
      return 'rock';
    }
    if (h < 1.5) {
      return 'sand';
    }
    return 'grass';
  }

  // Player hooks may pass (player) [legacy], (payload) or (player, payload).
  // Payloads carry a `player` reference and possibly `position`, so identify
  // the controller by its API rather than by its fields.
  function isPlayerObject(o) {
    return Boolean(o) && typeof o === 'object' && typeof o.onStep === 'function';
  }

  function pickInfo(a, b) {
    if (b && typeof b === 'object' && !isPlayerObject(b)) {
      return b;
    }
    if (a && typeof a === 'object' && !isPlayerObject(a)) {
      return a;
    }
    return null;
  }

  function handleStep(a, b) {
    if (!ready()) {
      return;
    }
    const player = ctx.player;
    const info = pickInfo(a, b);
    const surface = typeof info?.surface === 'string' && SURFACES.has(info.surface) ? info.surface : surfaceAt(player);
    const speed = Number.isFinite(info?.speed) ? info.speed : player.speed2D ?? WORLD.walkSpeed;
    const sprinting = typeof info?.sprinting === 'boolean' ? info.sprinting : Boolean(ctx.input?.state?.sprint && speed > WORLD.walkSpeed * 1.25);
    playFootstep(surface, speed, sprinting);
  }

  function playFootstep(surface, speed = WORLD.walkSpeed, sprinting = false) {
    const now = context.currentTime + 0.005;
    const vel = clamp(speed / WORLD.walkSpeed, 0.4, 2.2);
    const loud = (0.55 + 0.45 * Math.min(1, vel / 1.8)) * (sprinting ? 1.35 : 1) * 1.7;
    stepSide = -stepSide;
    const pan = stepSide * 0.14 + (rnd() - 0.5) * 0.06;
    const v = makeVoice(playerBus, { pan, send: surface === 'rock' ? 0.22 : 0.08 });
    v.name = `step:${surface}`;
    switch (surface) {
      case 'sand':
        burst(v, now, 0.15, { rate: rand(0.9, 1.1), peak: 0.2 * loud, attack: 0.008, filters: [['highpass', 900, 0.7], ['bandpass', rand(2600, 3200), 1.1]] });
        burst(v, now + 0.01, 0.07, { buffer: buffers.pink, peak: 0.12 * loud, attack: 0.004, filters: [['lowpass', 220, 0.8]] });
        break;
      case 'rock':
        burst(v, now, 0.055, { peak: 0.2 * loud, attack: 0.002, filters: [['bandpass', rand(3000, 3900), 5]] });
        note(v, now, 0.09, { freq: rand(190, 230), glide: [[0.08, 95]], peak: 0.12 * loud, attack: 0.003 });
        break;
      case 'water': {
        const depth = clamp(ctx.player?.waterDepth ?? 0.3, 0, 1.2);
        burst(v, now, 0.25 + depth * 0.15, { rate: rand(0.8, 1.05), peak: 0.16 * loud * (0.7 + depth), attack: 0.012, filters: [['bandpass', 1700 - depth * 500, 0.7]] });
        note(v, now + rand(0.02, 0.08), 0.09, { freq: rand(800, 1000), glide: [[0.09, 380]], peak: 0.05 * loud, attack: 0.005 });
        burst(v, now, 0.3, { buffer: buffers.pink, peak: 0.08 * loud * (0.5 + depth), attack: 0.04, filters: [['lowpass', 420, 0.8]] });
        break;
      }
      case 'dirt':
        // packed trail: dull thud with a dry scuff, less swish than grass
        burst(v, now, 0.1, { buffer: buffers.pink, rate: rand(0.85, 1.05), peak: 0.2 * loud, attack: 0.005, filters: [['lowpass', 900, 0.9]] });
        burst(v, now + rand(0.02, 0.05), 0.08, { rate: rand(0.9, 1.1), peak: 0.07 * loud, attack: 0.004, filters: [['bandpass', 2200, 1.1]] });
        break;
      default:
        burst(v, now, rand(0.16, 0.22), { buffer: buffers.pink, rate: rand(0.9, 1.2), peak: 0.22 * loud, attack: 0.006, filters: [['bandpass', rand(1300, 1700), 0.8]] });
        burst(v, now + rand(0.05, 0.08), 0.09, { rate: 1.1, peak: 0.09 * loud, attack: 0.004, filters: [['bandpass', 2600, 1.2]] });
        break;
    }
    v.end = now + 0.6;
    counters.steps += 1;
    lastStep = { surface, speed: Number(speed.toFixed(2)), sprinting, loud: Number(loud.toFixed(2)) };
  }

  function playLanding(impact = 0.5, surfaceHint = null) {
    const imp = clamp(impact, 0.1, 1);
    const now = context.currentTime + 0.005;
    const surface = surfaceHint && SURFACES.has(surfaceHint) ? surfaceHint : surfaceAt(ctx.player);
    const v = makeVoice(playerBus, { pan: 0, send: 0.12 + 0.15 * imp });
    v.name = 'land';
    note(v, now, 0.18, { freq: 120, glide: [[0.16, 45]], peak: 0.35 * imp, attack: 0.004 });
    burst(v, now, 0.12, { buffer: buffers.pink, peak: 0.2 * imp, attack: 0.005, filters: [['lowpass', 300, 0.8]] });
    if (surface === 'rock') {
      burst(v, now, 0.08, { peak: 0.18 * imp, attack: 0.002, filters: [['bandpass', 2800, 3]] });
    } else if (surface === 'sand') {
      burst(v, now, 0.18, { peak: 0.16 * imp, attack: 0.01, filters: [['highpass', 900, 0.7], ['bandpass', 2800, 1]] });
    } else if (surface === 'grass' || surface === 'dirt') {
      burst(v, now, 0.2, { buffer: buffers.pink, peak: 0.18 * imp, attack: 0.008, filters: [['bandpass', surface === 'dirt' ? 800 : 1400, 0.8]] });
    }
    v.end = now + 0.5;
    duckAmbience(0.35 * imp, 0.2);
    counters.lands += 1;
    lastLand = { impact: Number(imp.toFixed(2)), surface };
    if (surface === 'water') {
      playSplash(imp);
    } else if (imp > 0.45) {
      startle((imp - 0.45) / 0.55);
    }
  }

  function playSplash(strength = 0.7) {
    const s = clamp(strength, 0.2, 1) * 1.4;
    const now = context.currentTime + 0.005;
    const v = makeVoice(playerBus, { pan: 0, send: 0.2 });
    v.name = 'splash';
    burst(v, now, 0.5 * s + 0.15, { rate: rand(0.9, 1.1), peak: 0.35 * s, attack: 0.02, filters: [['bandpass', 1400, 0.6]] });
    burst(v, now, 0.45, { buffer: buffers.pink, peak: 0.22 * s, attack: 0.015, filters: [['lowpass', 350, 0.9]] });
    burst(v, now + 0.05, 0.35, { peak: 0.12 * s, attack: 0.03, filters: [['highpass', 2500, 0.7]] });
    const drops = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < drops; i += 1) {
      const t = now + rand(0.15, 0.55);
      const f = rand(900, 1400);
      note(v, t, 0.07, { freq: f, glide: [[0.07, f * 0.45]], peak: 0.05 * s, attack: 0.004 });
    }
    v.end = now + 1;
    duckAmbience(0.45 * s, 0.35);
    counters.splashes += 1;
    lastSplash = { strength: Number(s.toFixed(2)) };
    if (s > 0.6) {
      startle((s - 0.6) / 0.8);
    }
  }

  function playStroke() {
    const now = context.currentTime + 0.005;
    stepSide = -stepSide;
    const v = makeVoice(playerBus, { pan: stepSide * 0.25, send: 0.1 });
    v.name = 'stroke';
    burst(v, now, 0.28, { rate: rand(0.9, 1.1), peak: 0.1, attack: 0.03, filters: [['bandpass', 1500, 0.9]] });
    burst(v, now, 0.32, { buffer: buffers.pink, peak: 0.06, attack: 0.04, filters: [['lowpass', 500, 0.8]] });
    v.end = now + 0.5;
    counters.strokes += 1;
  }

  function playUnderStroke() {
    const now = context.currentTime + 0.005;
    stepSide = -stepSide;
    const v = makeVoice(submergedBus, { pan: stepSide * 0.3 });
    v.name = 'understroke';
    burst(v, now, 0.4, { buffer: buffers.pink, rate: 0.8, peak: 0.06, attack: 0.08, filters: [['lowpass', 380, 0.8]] });
    v.end = now + 0.6;
    counters.strokes += 1;
  }

  function playBubble() {
    const now = context.currentTime + 0.005;
    const v = makeVoice(submergedBus, { pan: rand(-0.7, 0.7) });
    v.name = 'bubble';
    const f = rand(300, 700);
    const dur = rand(0.05, 0.12);
    note(v, now, dur, { freq: f, glide: [[dur, f * 2.2]], peak: rand(0.025, 0.05), attack: 0.005 });
    v.end = now + dur + 0.1;
    counters.bubbles += 1;
  }

  function playHeartbeat(intensity = 0.6) {
    const now = context.currentTime + 0.005;
    const v = makeVoice(submergedBus, { pan: 0 });
    v.name = 'heart';
    note(v, now, 0.14, { freq: 58, glide: [[0.12, 38]], peak: 0.4 * intensity, attack: 0.012 });
    note(v, now + 0.2, 0.12, { freq: 52, glide: [[0.1, 36]], peak: 0.28 * intensity, attack: 0.012 });
    v.end = now + 0.45;
    counters.heartbeats += 1;
  }

  function onSubmerge() {
    submergeTime = 0;
    heartTimer = 0.6;
    bubbleTimer = 0.05;
    const now = context.currentTime + 0.005;
    const v = makeVoice(submergedBus, { pan: 0 });
    v.name = 'submerge';
    burst(v, now, 0.35, { buffer: buffers.pink, peak: 0.14, attack: 0.02, filters: [['lowpass', 300, 0.9]] });
    const n = 6 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i += 1) {
      const t = now + rand(0.02, 0.9);
      const f = rand(250, 800);
      const dur = rand(0.05, 0.12);
      note(v, t, dur, { freq: f, glide: [[dur, f * 2.4]], peak: rand(0.03, 0.06), attack: 0.005 });
    }
    v.end = now + 1.2;
    duckAmbience(0.3, 0.3);
  }

  function playBreath() {
    const now = context.currentTime + 0.005;
    const v = makeVoice(playerBus, { pan: 0, send: 0.1 });
    v.name = 'breath';
    burst(v, now, 0.3, { buffer: buffers.pink, peak: 0.22, attack: 0.32, filters: [['bandpass', 1100, 0.7]] });
    burst(v, now, 0.25, { peak: 0.1, attack: 0.01, filters: [['bandpass', 2200, 1]] });
    for (let i = 0; i < 2; i += 1) {
      const t = now + rand(0.2, 0.6);
      const f = rand(1000, 1500);
      note(v, t, 0.06, { freq: f, glide: [[0.06, f * 0.5]], peak: 0.04, attack: 0.004 });
    }
    v.end = now + 0.9;
    counters.breaths += 1;
  }

  function updatePlayerState(dt) {
    const p = ctx.player;
    const uw = listener.underwater;
    if (uw && !wasUnderwater) {
      onSubmerge();
    } else if (!uw && wasUnderwater) {
      playBreath();
    }
    wasUnderwater = uw;

    if (uw) {
      submergeTime += dt;
      bubbleTimer -= dt;
      if (bubbleTimer <= 0) {
        playBubble();
        bubbleTimer = rand(0.12, 0.65) / (1 + listener.speed * 0.35);
      }
      heartTimer -= dt;
      if (heartTimer <= 0) {
        const tension = clamp(submergeTime / 10, 0, 1);
        playHeartbeat(0.35 + 0.65 * tension);
        heartTimer = lerp(1.1, 0.72, tension);
      }
    } else {
      submergeTime = 0;
    }

    if (listener.swimming && listener.speed > 0.6) {
      strokeTimer -= dt;
      if (strokeTimer <= 0) {
        if (uw) {
          playUnderStroke();
        } else {
          playStroke();
        }
        strokeTimer = rand(0.85, 1.25);
      }
    } else {
      strokeTimer = Math.min(strokeTimer, 0.3);
    }

    // fallbacks when the player controller has no land/splash hooks
    const inWater = listener.swimming || listener.wading;
    if (!hasSplashHook && inWater && !wasInWater) {
      playSplash(clamp(Math.max(-prevVy, listener.speed * 0.5) / 6, 0.3, 1));
    }
    if (!hasLandHook) {
      const h = ctx.terrain.sampleHeight(p.position.x, p.position.z);
      const airborne = !inWater && p.position.y - h > 0.12;
      if (wasAirborne && !airborne && prevVy < -3) {
        playLanding(clamp((-prevVy - 3) / 7, 0.15, 1));
      }
      wasAirborne = airborne;
    }
    wasInWater = inWater;
    prevVy = p.velocity?.y ?? 0;
  }

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // fall speed (m/s) -> 0..1 thud impact; a plain jump lands at ~5.4 m/s
  function speedToImpact(speed, airTime = 0) {
    return clamp(Math.max((Math.abs(speed) - 1.5) / 8.5, (airTime / 1.4) * 0.8), 0.12, 1);
  }

  function handleLand(info) {
    if (!ready()) {
      return;
    }
    const data = pickInfo(info, null);
    let impact = 0.4;
    if (finite(info)) {
      impact = info > 1.5 ? speedToImpact(info) : info;
    } else if (data) {
      if (finite(data.impact)) {
        impact = data.impact;
      } else if (finite(data.intensity)) {
        impact = data.intensity;
      } else if (finite(data.speed)) {
        impact = speedToImpact(data.speed, finite(data.airTime) ? data.airTime : 0);
      } else if (finite(data.velocityY)) {
        impact = speedToImpact(data.velocityY);
      }
    }
    playLanding(impact, typeof data?.surface === 'string' ? data.surface : null);
  }

  function handleSplash(info) {
    if (!ready()) {
      return;
    }
    const data = pickInfo(info, null);
    let strength = 0.6;
    if (finite(info)) {
      strength = info > 1.5 ? info / 6 : info;
    } else if (data) {
      if (finite(data.intensity)) {
        strength = data.intensity;
      } else if (finite(data.strength) || finite(data.impact)) {
        strength = finite(data.strength) ? data.strength : data.impact;
      } else if (finite(data.verticalSpeed) || finite(data.speed)) {
        strength = 0.15 + (finite(data.verticalSpeed) ? data.verticalSpeed : 0) * 0.11 + (finite(data.speed) ? data.speed : 0) * 0.045;
      }
    }
    playSplash(clamp(strength, 0.2, 1));
  }

  function hookPlayer() {
    const player = ctx.player;
    if (!player) {
      return;
    }
    if (typeof player.onStep === 'function') {
      player.onStep(handleStep);
    }
    if (typeof player.onLand === 'function') {
      player.onLand(handleLand);
      hasLandHook = true;
    }
    if (typeof player.onSplash === 'function') {
      player.onSplash(handleSplash);
      hasSplashHook = true;
    }
  }
  hookPlayer();

  // ------------------------------------------------------------------
  // lifecycle
  // ------------------------------------------------------------------
  function start() {
    if (started) {
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    started = true;
    try {
      context = new AudioContextClass({ latencyHint: 'interactive' });
    } catch {
      context = new AudioContextClass();
    }
    try {
      buildGraph();
    } catch (error) {
      // never let a synth bug take the app down: degrade to silence
      console.warn('audio graph failed to build — sound disabled', error);
      context.close?.().catch?.(() => {});
      context = null;
    }
  }

  function buildGraph() {
    buffers.white = makeNoise('white', 2.5, 1);
    buffers.pink = makeNoise('pink', 2.5, 2);
    buffers.brown = makeNoise('brown', 2.5, 1);

    // ---- buses ----
    master = gainNode(0); // 0 while muted; ramps to 0.9
    limiter = track(context.createDynamicsCompressor());
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.22;
    master.connect(limiter);
    limiter.connect(context.destination);
    analyser = track(context.createAnalyser());
    analyser.fftSize = 1024;
    limiter.connect(analyser);

    underwaterFilter = biquad('lowpass', 20000, 0.5);
    underwaterFilter.connect(master);
    duck = gainNode(1);
    duck.connect(underwaterFilter);
    airGain = gainNode(1);
    airGain.connect(duck);
    ambienceBus = gainNode(1);
    ambienceBus.connect(airGain);
    playerBus = gainNode(1);
    playerBus.connect(underwaterFilter);
    submergedBus = gainNode(1);
    submergedBus.connect(master);

    reverbSend = gainNode(1);
    const convolver = track(context.createConvolver());
    convolver.buffer = makeImpulse(lowMode ? 1.6 : 2.4, 3.0);
    reverbReturn = gainNode(lowMode ? 0.28 : 0.4);
    reverbSend.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(airGain);

    buildCanopyGrid();
    buildAmbience();
    continuousNodes = nodesCreated;

    if (muted) {
      context.suspend?.().catch?.(() => {});
    }
  }

  function toggle() {
    start();
    muted = !muted;
    window.clearTimeout(suspendTimer);
    if (context) {
      if (!muted) {
        context.resume().catch(() => {});
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(master.gain.value, context.currentTime);
        master.gain.linearRampToValueAtTime(0.9, context.currentTime + 0.3);
      } else {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(master.gain.value, context.currentTime);
        master.gain.linearRampToValueAtTime(0, context.currentTime + 0.25);
        suspendTimer = window.setTimeout(() => {
          if (muted && context) {
            context.suspend?.().catch?.(() => {});
          }
        }, 400);
      }
    }
    return muted;
  }

  // Create (and immediately suspend) the context on the first gesture so the
  // graph is warm and the browser has already granted playback permission.
  function firstGesture() {
    window.removeEventListener('pointerdown', firstGesture);
    window.removeEventListener('keydown', firstGesture);
    try {
      start();
    } catch (error) {
      console.warn('audio start failed', error);
    }
  }
  window.addEventListener('pointerdown', firstGesture, { passive: true });
  window.addEventListener('keydown', firstGesture);

  function applyQuality(preset) {
    const scale = preset?.particleDensity ?? preset?.vegetationDensity ?? 1;
    lowMode = scale < 0.5;
    qualityLabel = preset?.label ?? 'default';
    maxVoices = lowMode ? 4 : scale < 0.75 ? 6 : 8;
    if (layers.cicadas) {
      layers.cicadas.forEach((c, i) => {
        c.enabled = i === 0 || !lowMode;
      });
    }
    if (reverbReturn) {
      setTarget(reverbReturn.gain, lowMode ? 0.28 : 0.4, 0.5);
    }
  }

  let tickAccum = 0;

  function update(dt) {
    if (!context || muted || context.state !== 'running') {
      return;
    }
    const step = Math.min(dt, 0.1);
    updateListener();
    updateGust(step);
    updatePlayerState(step);
    updateFauna(step);
    runPending(step);
    cleanupVoices();

    tickAccum += step;
    if (tickAccum >= TICK) {
      const tdt = tickAccum;
      tickAccum = 0;
      probeEnvironment();
      tickWaterfall(tdt);
      tickRiver(tdt);
      tickLagoon(tdt);
      tickWind();
      tickCicadas(tdt);
      tickUnderwater();
      tickVoices();
    }
  }

  // ------------------------------------------------------------------
  // debug / test hooks
  // ------------------------------------------------------------------
  let rmsBuffer = null;

  function measureRms() {
    if (!analyser || typeof analyser.getFloatTimeDomainData !== 'function') {
      return 0;
    }
    if (!rmsBuffer) {
      rmsBuffer = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(rmsBuffer);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < rmsBuffer.length; i += 1) {
      const x = rmsBuffer[i];
      sum += x * x;
      if (x > peak || -x > peak) {
        peak = Math.abs(x);
      }
    }
    lastPeak = peak;
    return Math.sqrt(sum / rmsBuffer.length);
  }
  let lastPeak = 0;

  const r3 = (v) => (Number.isFinite(v) ? Number(v.toFixed(3)) : v);

  function debugState() {
    const speciesState = {};
    for (const sp of species) {
      speciesState[sp.name] = { activity: r3(sp.lastActivity), nextIn: r3(sp.timer), calls: sp.calls };
    }
    let liveNodes = continuousNodes;
    for (const v of voices) {
      liveNodes += v.nodeCount;
    }
    return {
      started,
      muted,
      contextState: context?.state ?? 'none',
      sampleRate: context?.sampleRate ?? 0,
      currentTime: r3(context?.currentTime ?? 0),
      rms: r3(measureRms()),
      peak: r3(lastPeak),
      quality: { label: qualityLabel, lowMode, maxVoices },
      nodes: { created: nodesCreated, continuous: continuousNodes, liveEstimate: liveNodes, voices: voices.length },
      listener: {
        x: r3(listener.x),
        y: r3(listener.y),
        z: r3(listener.z),
        yaw: r3(listener.yaw),
        underwater: listener.underwater,
        swimming: listener.swimming,
        wading: listener.wading,
        speed: r3(listener.speed),
      },
      env: {
        canopy: r3(env.canopy),
        canopyArea: r3(env.canopyArea),
        elevation: r3(env.elevation),
        height: r3(env.height),
        fallsDist: r3(env.fallsDist),
        riverDist: r3(env.riverDist),
        riverStrength: r3(env.riverStrength),
        lagoonDist: r3(env.lagoonDist),
        shoreDist: r3(env.shoreDist),
        waterEdge: r3(env.waterEdge),
        inLagoon: env.inLagoon,
      },
      layers: {
        waterfall: { ...state.waterfall, dist: r3(state.waterfall.dist), gain: r3(state.waterfall.gain), pan: r3(state.waterfall.pan), lpf: Math.round(state.waterfall.lpf), occlusion: r3(state.waterfall.occlusion), surge: r3(state.waterfall.surge), liveGain: r3(layers.waterfall?.gain.gain.value) },
        river: { ...state.river, dist: r3(state.river.dist), gain: r3(state.river.gain), pan: r3(state.river.pan), lpf: Math.round(state.river.lpf), strength: r3(state.river.strength), liveGain: r3(layers.river?.gain.gain.value) },
        lagoon: { gain: r3(state.lagoon.gain), foam: r3(state.lagoon.foam), wave: r3(state.lagoon.wave), pan: r3(state.lagoon.pan), proximity: r3(state.lagoon.proximity) },
        wind: { gain: r3(state.wind.gain), freq: Math.round(state.wind.freq), gust: r3(state.wind.gust), phase: gust.phase },
        leaves: { gain: r3(state.leaves.gain) },
        cicadas: state.cicadas.map((c) => ({ level: r3(c.level), gain: r3(c.gain), f0: Math.round(c.f0), phase: c.phase })),
        underwater: { lpf: Math.round(state.underwater.lpf), air: r3(state.underwater.air), drone: r3(state.underwater.drone), pressure: r3(state.underwater.pressure), tension: r3(state.underwater.tension) },
        duck: r3(duck?.gain.value),
        reverbReturn: r3(reverbReturn?.gain.value),
      },
      fauna: { hush: r3(hush), pending: pending.length, species: speciesState, recent: recentCalls.slice(), activeVoices: voices.filter((v) => v.pos).map((v) => ({ name: v.name, dist: r3(v.dist), pan: r3(v.curPan), gain: r3(v.curGain) })) },
      player: { ...counters, lastStep, lastLand, lastSplash, hooks: { land: hasLandHook, splash: hasSplashHook } },
    };
  }

  function debugCall(name, pos = null) {
    if (!ready()) {
      return null;
    }
    const sp = species.find((s) => s.name === name);
    if (!sp) {
      return null;
    }
    const v = playSpecies(sp, pos, true);
    return v ? { name, dist: r3(v.dist), pan: r3(v.curPan), gain: r3(v.curGain), lpf: Math.round(v.curLpf) } : null;
  }

  function debugTrigger(what, value) {
    if (!ready()) {
      return false;
    }
    switch (what) {
      case 'step':
        playFootstep(value ?? 'grass', WORLD.walkSpeed, false);
        break;
      case 'sprint-step':
        playFootstep(value ?? 'grass', WORLD.walkSpeed * WORLD.sprintMultiplier, true);
        break;
      case 'land':
        playLanding(value ?? 0.7);
        break;
      case 'splash':
        playSplash(value ?? 0.8);
        break;
      case 'stroke':
        playStroke();
        break;
      case 'breath':
        playBreath();
        break;
      case 'heartbeat':
        playHeartbeat(value ?? 0.8);
        break;
      case 'bubble':
        playBubble();
        break;
      case 'submerge':
        onSubmerge();
        break;
      default:
        return false;
    }
    return true;
  }

  return {
    start,
    toggle,
    update,
    applyQuality,
    debugState,
    debugCall,
    debugTrigger,
    get muted() {
      return muted;
    },
    get species() {
      return species.map((s) => s.name);
    },
  };
}
