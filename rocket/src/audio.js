// audio.js — procedural WebAudio sound layer. No samples, everything is
// synthesized: noise-based engine rumble, ignition swell, staging clunk,
// wind rush, crash boom, UI blips. The AudioContext is created lazily on the
// first user gesture (browser autoplay policy), so headless screenshot runs
// are completely unaffected.

function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // pinkish noise via a cheap one-pole walk: softer than pure white
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.94 + white * 0.06;
    d[i] = (last * 6.5 + white * 0.28) * 0.55;
  }
  return buf;
}

export function createAudioEngine() {
  let ctx = null;
  let nodes = null;          // built once with the context
  let muted = false;
  let engineLevel = 0;       // last applied engine gain (for debug)

  function build() {
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    master.connect(comp).connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(analyser);

    const noiseBuf = makeNoiseBuffer(ctx);

    // ---- engine loop: roar (bandpass noise) + rumble (lowpass noise) + sub
    const mkLoop = () => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      src.start();
      return src;
    };
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.value = 420;
    roarFilter.Q.value = 0.55;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0;
    mkLoop().connect(roarFilter).connect(roarGain).connect(master);

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 110;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    mkLoop().connect(rumbleFilter).connect(rumbleGain).connect(master);

    const sub1 = ctx.createOscillator(); sub1.type = 'sawtooth'; sub1.frequency.value = 31;
    const sub2 = ctx.createOscillator(); sub2.type = 'sawtooth'; sub2.frequency.value = 44.7;
    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass'; subFilter.frequency.value = 95;
    const subGain = ctx.createGain(); subGain.gain.value = 0;
    sub1.connect(subFilter); sub2.connect(subFilter);
    subFilter.connect(subGain).connect(master);
    sub1.start(); sub2.start();

    // ---- wind rush loop (fast atmospheric flight)
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    mkLoop().connect(windFilter).connect(windGain).connect(master);

    nodes = {
      master, analyser, noiseBuf,
      roarFilter, roarGain, rumbleGain, subGain, windFilter, windGain,
    };
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      build();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.state === 'running';
  }

  // ---------- one-shot helpers ----------
  function noiseBurst({ dur = 0.5, gain = 0.4, type = 'lowpass', f0 = 800, f1 = null, q = 0.7, attack = 0.012 }) {
    if (!ctx || ctx.state !== 'running' || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nodes.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    if (f1 !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(nodes.master);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  function tone({ freq = 440, f1 = null, dur = 0.2, gain = 0.12, type = 'sine', attack = 0.005, when = 0 }) {
    if (!ctx || ctx.state !== 'running' || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(nodes.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const api = {
    // call from any user-gesture handler; safe to call repeatedly
    unlock() { ensure(); },

    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      if (ctx && nodes) {
        const t = ctx.currentTime;
        nodes.master.gain.cancelScheduledValues(t);
        nodes.master.gain.setTargetAtTime(v ? 0 : 0.9, t, 0.03);
      }
    },
    toggleMuted() { api.setMuted(!muted); return muted; },

    // continuous engine + wind state; call every frame during flight.
    // throttle 0..1, atmo 0..1 (air density / sea-level), speed m/s
    setFlightLoop({ throttle = 0, atmo = 1, speed = 0 } = {}) {
      if (!ctx || !nodes || ctx.state !== 'running') { engineLevel = 0; return; }
      const t = ctx.currentTime;
      // vacuum: stylized — keep a faint structural rumble, lose the crackle
      const roar = muted ? 0 : throttle * (0.16 * atmo + 0.012);
      const rumble = muted ? 0 : throttle * (0.22 * atmo + 0.05);
      const sub = muted ? 0 : throttle * (0.16 * atmo + 0.06);
      nodes.roarGain.gain.setTargetAtTime(roar, t, 0.08);
      nodes.rumbleGain.gain.setTargetAtTime(rumble, t, 0.08);
      nodes.subGain.gain.setTargetAtTime(sub, t, 0.1);
      nodes.roarFilter.frequency.setTargetAtTime(260 + 1900 * atmo, t, 0.15);
      const windK = Math.min(1, speed / 320) * atmo;
      nodes.windGain.gain.setTargetAtTime(muted ? 0 : windK * 0.14, t, 0.2);
      nodes.windFilter.frequency.setTargetAtTime(280 + speed * 3.2, t, 0.25);
      engineLevel = rumble + roar;
    },

    // ---------- events ----------
    ignition() {
      // turbopump spin-up: rising filtered noise + deep thump
      noiseBurst({ dur: 1.4, gain: 0.5, type: 'lowpass', f0: 220, f1: 2400, attack: 0.25 });
      tone({ freq: 68, f1: 27, dur: 0.7, gain: 0.5, type: 'sine' });
    },
    liftoff() {
      tone({ freq: 36, f1: 30, dur: 1.2, gain: 0.4, type: 'triangle' });
    },
    stage() {
      // pyro clunk: metallic snap + short debris hiss
      noiseBurst({ dur: 0.16, gain: 0.55, type: 'highpass', f0: 900, attack: 0.004 });
      tone({ freq: 210, f1: 55, dur: 0.22, gain: 0.4, type: 'square' });
      noiseBurst({ dur: 0.7, gain: 0.16, type: 'lowpass', f0: 700, f1: 160 });
    },
    flameout() {
      noiseBurst({ dur: 0.5, gain: 0.22, type: 'lowpass', f0: 1400, f1: 120 });
    },
    spaceReached() {
      tone({ freq: 660, dur: 0.5, gain: 0.10, type: 'sine' });
      tone({ freq: 990, dur: 0.8, gain: 0.08, type: 'sine', when: 0.16 });
      // firework crackles trailing the chime
      for (let i = 0; i < 5; i++) {
        noiseBurst({ dur: 0.12, gain: 0.12, type: 'highpass', f0: 1800, attack: 0.004 });
        tone({ freq: 1200 + i * 180, f1: 300, dur: 0.3, gain: 0.04, type: 'triangle', when: 0.3 + i * 0.22 });
      }
    },
    countBeep(n) {
      // 3..2..1 beeps; n === 0 is the higher "GO" blip right before ignition
      tone({ freq: n === 0 ? 920 : 540, dur: n === 0 ? 0.3 : 0.14, gain: 0.12, type: 'square', attack: 0.004 });
    },
    crash() {
      noiseBurst({ dur: 2.2, gain: 0.8, type: 'lowpass', f0: 900, f1: 70, attack: 0.006 });
      tone({ freq: 80, f1: 24, dur: 1.4, gain: 0.6, type: 'sine' });
    },
    debrisThud() {
      noiseBurst({ dur: 0.8, gain: 0.3, type: 'lowpass', f0: 420, f1: 80, attack: 0.008 });
    },
    uiClick() {
      tone({ freq: 700, f1: 480, dur: 0.07, gain: 0.10, type: 'triangle', attack: 0.002 });
    },
    uiRemove() {
      tone({ freq: 360, f1: 220, dur: 0.09, gain: 0.10, type: 'triangle', attack: 0.002 });
    },
    launchWhoosh() {
      noiseBurst({ dur: 0.55, gain: 0.2, type: 'bandpass', f0: 320, f1: 1300, q: 0.8, attack: 0.06 });
      tone({ freq: 240, f1: 520, dur: 0.4, gain: 0.07, type: 'sine' });
    },

    // headless-test hook: prove the graph is alive without speakers
    stats() {
      if (!ctx || !nodes) return { ctxState: ctx ? ctx.state : 'none', rms: 0, engineLevel: 0, muted };
      const buf = new Float32Array(nodes.analyser.fftSize);
      nodes.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return {
        ctxState: ctx.state,
        rms: +Math.sqrt(sum / buf.length).toFixed(5),
        engineLevel: +engineLevel.toFixed(4),
        muted,
      };
    },
  };
  return api;
}
