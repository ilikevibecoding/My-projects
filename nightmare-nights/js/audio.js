// Every sound in the game is synthesized here with WebAudio.
// No samples, no files — breathing, footsteps, screams, chimes: all generated.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._breath = { L: null, R: null, closet: null };
    this._roomTone = null;
    this._noiseBuf = null;
    this._breathBuf = null;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 8;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(comp);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  get t() { return this.ctx.currentTime; }

  // ---------- buffers ----------
  noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  // one full inhale/exhale cycle, baked into a loopable buffer
  breathBuffer() {
    if (this._breathBuf) return this._breathBuf;
    const sr = this.ctx.sampleRate;
    const dur = 3.6;
    const buf = this.ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const ph = t / dur;
      // envelope: inhale swell (rough), pause, exhale swell (longer)
      let env = 0;
      if (ph < 0.32) env = Math.sin((ph / 0.32) * Math.PI) * 0.85;
      else if (ph > 0.42 && ph < 0.92) env = Math.sin(((ph - 0.42) / 0.5) * Math.PI);
      // growly amplitude modulation
      const growl = 1 + 0.4 * Math.sin(2 * Math.PI * 31 * t) * (ph < 0.32 ? 1 : 0.4);
      const n = (Math.random() * 2 - 1);
      lp += 0.045 * (n - lp);       // ~lowpass
      lp2 += 0.012 * (lp - lp2);    // darker
      d[i] = (lp * 0.7 + lp2 * 1.6) * env * growl * 0.9;
    }
    this._breathBuf = buf;
    return buf;
  }

  _envGain(at, peaks) {
    // peaks: [[dt, gain], ...]
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    for (const [dt, v] of peaks) {
      if (v <= 0.0001) g.gain.exponentialRampToValueAtTime(0.0001, at + dt);
      else g.gain.exponentialRampToValueAtTime(v, at + dt);
    }
    g.connect(this.master);
    return g;
  }

  _noise(at, dur, filterType, freq, q, peaks, pan = 0, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const g = this._envGain(at, peaks);
    src.connect(f); f.connect(p); p.connect(g);
    src.start(at);
    src.stop(at + dur + 0.1);
    return { src, f, g, p };
  }

  _tone(at, dur, type, f0, f1, peaks, pan = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const g = this._envGain(at, peaks);
    o.connect(p); p.connect(g);
    o.start(at);
    o.stop(at + dur + 0.1);
    return o;
  }

  // ---------- ambience ----------
  startRoomTone() {
    if (this._roomTone) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 110;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    // slow wind swells
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.022;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start();
    this._roomTone = { src, lfo };
  }

  stopRoomTone() {
    if (!this._roomTone) return;
    try { this._roomTone.src.stop(); this._roomTone.lfo.stop(); } catch (e) { /* noop */ }
    this._roomTone = null;
  }

  // ---------- breathing (the core mechanic) ----------
  setBreathing(key, on, pan = 0) {
    if (!this.ctx) return;
    const cur = this._breath[key];
    if (on && !cur) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.breathBuffer();
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 0.7;
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.t);
      g.gain.exponentialRampToValueAtTime(0.6, this.t + 0.7);
      src.connect(f); f.connect(p); p.connect(g); g.connect(this.master);
      src.start();
      this._breath[key] = { src, g };
    } else if (!on && cur) {
      cur.g.gain.cancelScheduledValues(this.t);
      cur.g.gain.setValueAtTime(cur.g.gain.value, this.t);
      cur.g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.35);
      const s = cur.src;
      setTimeout(() => { try { s.stop(); } catch (e) { /* noop */ } }, 500);
      this._breath[key] = null;
    }
  }

  stopAllBreathing() {
    for (const k of Object.keys(this._breath)) this.setBreathing(k, false);
  }

  // ---------- one-shots ----------
  // dir: +1 approaching (louder), -1 retreating (fades)
  footsteps(pan, dir = 1, count = 5, heavy = false) {
    if (!this.ctx) return;
    const at = this.t + 0.05;
    for (let i = 0; i < count; i++) {
      const tt = at + i * (0.34 + Math.random() * 0.05);
      const prog = i / (count - 1);
      const vol = dir > 0 ? 0.05 + prog * 0.22 : 0.26 - prog * 0.22;
      this._noise(tt, 0.16, 'lowpass', heavy ? 130 : 190, 1.2,
        [[0.012, vol], [0.16, 0.0001]], pan, 0.6);
      this._tone(tt, 0.1, 'sine', heavy ? 58 : 74, 38, [[0.01, vol * 0.8], [0.1, 0.0001]], pan);
    }
  }

  runAway(pan) {
    if (!this.ctx) return;
    const at = this.t + 0.02;
    for (let i = 0; i < 7; i++) {
      const tt = at + i * 0.16;
      const vol = 0.3 - (i / 7) * 0.26;
      this._noise(tt, 0.1, 'lowpass', 220, 1, [[0.01, vol], [0.1, 0.0001]], pan, 0.75);
    }
    this._noise(at, 1.1, 'bandpass', 800, 0.4, [[0.08, 0.1], [1.1, 0.0001]], pan);
  }

  doorSlam() {
    if (!this.ctx) return;
    const at = this.t;
    this._noise(at, 0.22, 'lowpass', 300, 1, [[0.008, 0.5], [0.22, 0.0001]]);
    this._tone(at, 0.3, 'sine', 70, 32, [[0.01, 0.5], [0.3, 0.0001]]);
  }

  doorRattle(pan = 0) {
    if (!this.ctx) return;
    const at = this.t;
    for (let i = 0; i < 3; i++) {
      this._noise(at + i * 0.07, 0.05, 'highpass', 900, 2, [[0.005, 0.06], [0.05, 0.0001]], pan);
    }
  }

  flashClick() {
    if (!this.ctx) return;
    this._noise(this.t, 0.03, 'highpass', 2400, 1, [[0.004, 0.09], [0.03, 0.0001]]);
  }

  creak(pitch = 1, pan = 0) {
    if (!this.ctx) return;
    const at = this.t;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160 * pitch, at);
    o.frequency.linearRampToValueAtTime(95 * pitch, at + 0.7);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420 * pitch;
    f.Q.value = 6;
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    const g = this._envGain(at, [[0.1, 0.06], [0.4, 0.035], [0.75, 0.0001]]);
    o.connect(f); f.connect(p); p.connect(g);
    o.start(at); o.stop(at + 0.8);
    // wood grain stick-slip
    for (let i = 0; i < 8; i++) {
      this._noise(at + i * 0.07 + Math.random() * 0.02, 0.03, 'bandpass', 800 * pitch, 8,
        [[0.004, 0.025], [0.03, 0.0001]], pan);
    }
  }

  giggle(pan = 0) {
    if (!this.ctx) return;
    const at = this.t + 0.02;
    const base = 580 + Math.random() * 200;
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const tt = at + i * (0.09 + Math.random() * 0.03);
      this._tone(tt, 0.07, 'square', base + i * 60, base * 0.7 + i * 60,
        [[0.008, 0.05], [0.07, 0.0001]], pan);
    }
  }

  scatter(pan = 0) {
    if (!this.ctx) return;
    const at = this.t;
    for (let i = 0; i < 9; i++) {
      this._noise(at + i * 0.05, 0.04, 'highpass', 1300, 2, [[0.004, 0.07 - i * 0.006], [0.04, 0.0001]],
        pan + (Math.random() - 0.5) * 0.6);
    }
  }

  kitchenClatter(pan = 0.8) {
    if (!this.ctx) return;
    const at = this.t;
    for (let i = 0; i < 4; i++) {
      const tt = at + i * (0.12 + Math.random() * 0.2);
      const f0 = 1400 + Math.random() * 2400;
      this._tone(tt, 0.4, 'triangle', f0, f0 * 0.98, [[0.005, 0.035], [0.4, 0.0001]], pan);
      this._tone(tt + 0.01, 0.3, 'triangle', f0 * 1.51, f0 * 1.5, [[0.005, 0.02], [0.3, 0.0001]], pan);
    }
  }

  laugh(pan = 0) {
    // deep, slow — the boss telegraph
    if (!this.ctx) return;
    const at = this.t + 0.05;
    for (let i = 0; i < 5; i++) {
      const tt = at + i * 0.34;
      const f0 = 110 - i * 8;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, tt);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.82, tt + 0.22);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 480;
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      const g = this._envGain(tt, [[0.03, 0.16], [0.3, 0.0001]]);
      o.connect(f); f.connect(p); p.connect(g);
      o.start(tt); o.stop(tt + 0.34);
    }
  }

  hourChime(hour) {
    if (!this.ctx) return;
    const at = this.t;
    const f = 660;
    this._tone(at, 1.6, 'sine', f, f, [[0.02, 0.05], [1.6, 0.0001]]);
    this._tone(at, 1.6, 'sine', f * 2.76, f * 2.76, [[0.02, 0.012], [1.2, 0.0001]]);
  }

  bells6am() {
    if (!this.ctx) return;
    const at = this.t + 0.1;
    const notes = [784, 659, 587, 523, 587, 659, 784, 880];
    notes.forEach((f, i) => {
      const tt = at + i * 0.42;
      this._tone(tt, 1.4, 'sine', f, f, [[0.015, 0.14], [1.4, 0.0001]]);
      this._tone(tt, 1.0, 'sine', f * 2.0, f * 2.0, [[0.015, 0.04], [1.0, 0.0001]]);
      this._tone(tt, 0.8, 'triangle', f * 2.76, f * 2.76, [[0.01, 0.02], [0.8, 0.0001]]);
    });
  }

  cheer() {
    if (!this.ctx) return;
    // children cheering — abstracted as bright chirpy swells
    const at = this.t + 3.2;
    for (let i = 0; i < 6; i++) {
      const f0 = 700 + Math.random() * 500;
      this._tone(at + i * 0.15, 0.5, 'sine', f0, f0 * 1.1, [[0.1, 0.02], [0.5, 0.0001]],
        (Math.random() - 0.5));
    }
  }

  scream() {
    if (!this.ctx) return;
    const at = this.t;
    const dur = 1.05;
    // detuned saw stack with a falling-then-rising wail
    for (const det of [-18, -7, 0, 9, 21]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 640 + det * 6;
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, at + 0.09);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, at + dur);
      o.detune.value = det * 12;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1500, at);
      f.frequency.exponentialRampToValueAtTime(580, at + dur);
      f.Q.value = 1.1;
      const g = this._envGain(at, [[0.015, 0.24], [dur * 0.7, 0.17], [dur, 0.0001]]);
      o.connect(f); f.connect(g);
      o.start(at); o.stop(at + dur + 0.1);
    }
    // throat noise + sub thump
    this._noise(at, dur, 'bandpass', 1900, 0.6, [[0.01, 0.3], [dur, 0.0001]], 0, 1.6);
    this._noise(at, dur * 0.8, 'lowpass', 240, 1, [[0.012, 0.34], [dur * 0.8, 0.0001]]);
    this._tone(at, 0.5, 'sine', 60, 28, [[0.01, 0.5], [0.5, 0.0001]]);
  }

  staticBurst(dur = 1.6) {
    if (!this.ctx) return;
    this._noise(this.t, dur, 'highpass', 600, 0.4, [[0.02, 0.16], [dur, 0.0001]]);
  }
}
