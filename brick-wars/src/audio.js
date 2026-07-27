// audio.js — tiny synthesized soundscape. No samples; everything is built
// from oscillators and filtered noise at runtime, created after the first
// user gesture so autoplay policies are respected.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.swordHum = null;
    this.studCombo = 0;
    this._comboTimer = null;
  }

  /** Must be called from a user gesture (the Play click). */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startSwordHum();
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _startSwordHum() {
    const t = this._now();
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 78;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 79.7; // detune beat
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 2.3;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(gain.gain);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc1.start(t);
    osc2.start(t);
    lfo.start(t);
    this.swordHum = { gain, filter };
  }

  swing() {
    if (!this.ctx) return;
    const t = this._now();
    // pitch sweep on the hum
    this.swordHum.filter.frequency.cancelScheduledValues(t);
    this.swordHum.filter.frequency.setValueAtTime(320, t);
    this.swordHum.filter.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    this.swordHum.filter.frequency.exponentialRampToValueAtTime(320, t + 0.32);
    this.swordHum.gain.gain.cancelScheduledValues(t);
    this.swordHum.gain.gain.setValueAtTime(0.05, t);
    this.swordHum.gain.gain.linearRampToValueAtTime(0.16, t + 0.06);
    this.swordHum.gain.gain.linearRampToValueAtTime(0.05, t + 0.34);
    // airy whoosh
    this._noiseBurst({ t, dur: 0.28, from: 900, to: 240, gain: 0.18, type: 'bandpass' });
  }

  crateSmash() {
    if (!this.ctx) return;
    const t = this._now();
    this._noiseBurst({ t, dur: 0.22, from: 2600, to: 500, gain: 0.4, type: 'lowpass' });
    // plastic clacks
    for (let i = 0; i < 4; i++) {
      this._click(t + 0.05 + i * 0.055, 700 + Math.random() * 900, 0.12);
    }
  }

  studTick() {
    if (!this.ctx) return;
    this.studCombo = Math.min(this.studCombo + 1, 16);
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => (this.studCombo = 0), 900);
    const t = this._now();
    const semitone = [0, 4, 7, 12, 16, 19, 24][this.studCombo % 7] + Math.floor(this.studCombo / 7) * 12;
    const freq = 740 * Math.pow(2, semitone / 12);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  spiritChime() {
    if (!this.ctx) return;
    const t = this._now();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 1);
    });
    // shimmer
    this._noiseBurst({ t, dur: 0.7, from: 4000, to: 7000, gain: 0.05, type: 'highpass' });
  }

  brickSnap() {
    if (!this.ctx) return;
    this._click(this._now(), 900 + Math.random() * 500, 0.18);
  }

  buildComplete() {
    if (!this.ctx) return;
    const t = this._now();
    [392, 523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + i * 0.11;
      g.gain.setValueAtTime(0.001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  jump() {
    if (!this.ctx) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  winFanfare() {
    if (!this.ctx) return;
    const t = this._now();
    const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    seq.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i < 4 ? 'triangle' : 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + i * 0.16;
      g.gain.setValueAtTime(0.001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + (i >= 4 ? 1.1 : 0.4));
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 1.2);
    });
  }

  _click(t, freq, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  _noiseBurst({ t, dur, from, to, gain, type }) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }
}
