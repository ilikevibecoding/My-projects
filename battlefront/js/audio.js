// =============================================================
// SynthAudio: WebAudio-synthesized SFX + ambient bed. No files.
// =============================================================
'use strict';

const SynthAudio = (() => {
  let ctx = null;
  let master, sfxBus, musicBus;
  let listenerPos = new THREE.Vector3();
  let started = false;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.30; musicBus.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) { started = true; startAmbient(); }
  }

  function setListener(pos) { listenerPos.copy(pos); }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.8;
  }

  // distance attenuation 0..1
  function atten(pos) {
    if (!pos) return 1;
    const d = listenerPos.distanceTo(pos);
    return Math.max(0, 1 - d / 130) ** 1.6;
  }

  // ---------- primitive synths ---------------------------------
  function blip(freq0, freq1, dur, type, gain, pos) {
    if (!ctx || muted) return;
    const a = atten(pos);
    if (a <= 0.01) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    g.gain.setValueAtTime(gain * a, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, gain, pos, type = 'lowpass') {
    if (!ctx || muted) return;
    const a = atten(pos);
    if (a <= 0.01) return;
    const t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.25), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * a, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t);
  }

  // ---------- named SFX -----------------------------------------
  const sfxDefs = {
    blaster: (p) => { blip(1900, 280, 0.16, 'sawtooth', 0.16, p); blip(950, 180, 0.1, 'square', 0.07, p); },
    heavyBlaster: (p) => { blip(1200, 160, 0.22, 'sawtooth', 0.2, p); noiseBurst(0.08, 2400, 0.05, p); },
    sniper: (p) => { blip(2600, 200, 0.3, 'sawtooth', 0.22, p); noiseBurst(0.16, 3600, 0.1, p, 'highpass'); },
    scatter: (p) => { noiseBurst(0.18, 1800, 0.24, p); blip(800, 140, 0.12, 'square', 0.1, p); },
    rocket: (p) => { noiseBurst(0.5, 900, 0.3, p); blip(300, 90, 0.4, 'sawtooth', 0.16, p); },
    explosion: (p) => {
      noiseBurst(0.9, 420, 0.55, p);
      blip(160, 36, 0.7, 'sine', 0.5, p);
      blip(95, 28, 0.9, 'triangle', 0.4, p);
    },
    hit: (p) => blip(2400, 1500, 0.05, 'square', 0.08, p),
    hurt: (p) => blip(220, 90, 0.18, 'square', 0.18, p),
    kill: (p) => { blip(880, 1320, 0.07, 'square', 0.1, p); blip(1320, 1760, 0.09, 'square', 0.1, p); },
    reload: (p) => { blip(500, 320, 0.06, 'square', 0.09, p); setTimeout(() => blip(320, 500, 0.06, 'square', 0.09, p), 160); },
    grenadeThrow: (p) => blip(600, 280, 0.1, 'triangle', 0.1, p),
    captureTick: (p) => blip(660, 660, 0.05, 'sine', 0.06, p),
    captured: (p) => { blip(523, 523, 0.1, 'sine', 0.14, p); setTimeout(() => blip(784, 784, 0.16, 'sine', 0.14, p), 110); },
    lost: (p) => { blip(440, 440, 0.12, 'sine', 0.14, p); setTimeout(() => blip(294, 294, 0.2, 'sine', 0.14, p), 120); },
    spawn: (p) => blip(420, 880, 0.16, 'sine', 0.1, p),
    enterVehicle: (p) => blip(280, 540, 0.14, 'triangle', 0.12, p),
    repair: (p) => blip(700, 1100, 0.12, 'sine', 0.08, p),
    uiClick: () => blip(900, 700, 0.05, 'sine', 0.08, null),
    victory: () => {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, 0.3, 'sine', 0.16, null), i * 170));
    },
    defeat: () => {
      [392, 349, 311, 262].forEach((f, i) => setTimeout(() => blip(f, f, 0.35, 'sine', 0.16, null), i * 200));
    },
  };

  function sfx(name, pos = null) {
    if (!ctx || muted) return;
    const def = sfxDefs[name];
    if (def) def(pos);
  }

  // ---------- ambient bed ----------------------------------------
  let windNode = null;
  function startAmbient() {
    if (!ctx) return;
    // wind: looped filtered noise
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.045;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    windNode = { src, f, g };
    // slow LFO on wind
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    lfo.start();
    // low drone chord (menu mood)
    const chord = [55, 82.4, 110];
    for (const fr of chord) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = 0.035;
      o.connect(og); og.connect(musicBus);
      o.start();
    }
  }

  function setMusicLevel(v) { if (musicBus) musicBus.gain.value = v; }

  return { resume, sfx, setListener, setMusicLevel, setMuted, get ctx() { return ctx; } };
})();
