/* ============ Tiny WebAudio synth — all sounds generated in code ============ */
const Sound = (() => {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(gainNode, t0, attack, decay, peak = 0.3) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone({ freq = 440, type = 'square', attack = 0.005, decay = 0.15, peak = 0.25, slide = 0, delay = 0 }) {
    if (muted) return;
    const c = ac();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + attack + decay);
    env(g, t0, attack, decay, peak);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  function noise({ decay = 0.2, peak = 0.25, freq = 1000, delay = 0 }) {
    if (muted) return;
    const c = ac();
    const t0 = c.currentTime + delay;
    const len = Math.ceil(c.sampleRate * (decay + 0.05));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.15), t0 + decay);
    const g = c.createGain();
    env(g, t0, 0.005, decay, peak);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
  }

  return {
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    tap() { tone({ freq: 660, type: 'sine', decay: 0.07, peak: 0.12 }); },
    place() { tone({ freq: 220, type: 'triangle', decay: 0.18, peak: 0.3, slide: -80 }); noise({ decay: 0.12, peak: 0.1, freq: 600 }); },
    coin() { tone({ freq: 1180, type: 'square', decay: 0.09, peak: 0.12 }); tone({ freq: 1570, type: 'square', decay: 0.14, peak: 0.12, delay: 0.06 }); },
    elixir() { tone({ freq: 520, type: 'sine', decay: 0.16, peak: 0.16, slide: 260 }); },
    gem() { [1320, 1660, 2090].forEach((f, i) => tone({ freq: f, type: 'triangle', decay: 0.14, peak: 0.12, delay: i * 0.07 })); },
    build() { noise({ decay: 0.15, peak: 0.2, freq: 900 }); tone({ freq: 330, type: 'triangle', decay: 0.1, peak: 0.15, delay: 0.05 }); },
    upgrade() { [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', decay: 0.15, peak: 0.16, delay: i * 0.08 })); },
    error() { tone({ freq: 180, type: 'sawtooth', decay: 0.2, peak: 0.14, slide: -60 }); },
    deploy() { tone({ freq: 500, type: 'square', decay: 0.08, peak: 0.13, slide: 200 }); },
    shoot() { noise({ decay: 0.08, peak: 0.08, freq: 2400 }); },
    boom() { noise({ decay: 0.5, peak: 0.4, freq: 500 }); tone({ freq: 70, type: 'sine', decay: 0.4, peak: 0.35, slide: -30 }); },
    crumble() { noise({ decay: 0.6, peak: 0.35, freq: 350 }); },
    chop() { noise({ decay: 0.09, peak: 0.22, freq: 1400 }); tone({ freq: 190, type: 'triangle', decay: 0.08, peak: 0.14, delay: 0.02 }); },
    poof() { noise({ decay: 0.3, peak: 0.22, freq: 900 }); tone({ freq: 620, type: 'sine', decay: 0.18, peak: 0.1, slide: 220 }); },
    zap() { tone({ freq: 1600, type: 'sawtooth', decay: 0.07, peak: 0.09, slide: -900 }); noise({ decay: 0.05, peak: 0.07, freq: 3200 }); },
    beam() { tone({ freq: 240, type: 'sawtooth', decay: 0.28, peak: 0.08, slide: 160 }); },
    cheatCode() { [392, 494, 587, 784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'square', decay: 0.16, peak: 0.13, delay: i * 0.07 })); noise({ decay: 0.4, peak: 0.12, freq: 2000, delay: 0.5 }); },
    star() { [784, 988, 1319].forEach((f, i) => tone({ freq: f, type: 'square', decay: 0.16, peak: 0.14, delay: i * 0.09 })); },
    victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', decay: 0.22, peak: 0.2, delay: i * 0.13 })); },
    defeat() { [392, 370, 330, 262].forEach((f, i) => tone({ freq: f, type: 'sine', decay: 0.3, peak: 0.18, delay: i * 0.18 })); },
    hogYell() { tone({ freq: 300, type: 'sawtooth', decay: 0.35, peak: 0.2, slide: 400 }); },
  };
})();
