// WebAudio chiptune music + SFX, and Pokémon cry playback (.ogg assets).
(function () {
  "use strict";

  const NOTE_RE = /^([a-g])(#?)(\d)$/;
  const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  function freqOf(name) {
    const m = NOTE_RE.exec(name);
    if (!m) return null;
    const semi = SEMI[m[1]] + (m[2] ? 1 : 0);
    const midi = (Number(m[3]) + 1) * 12 + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // "c4:2 e4:2 r:4" -> [{freq, steps}]
  function parseTrack(str) {
    return str.trim().split(/\s+/).map((tok) => {
      const [n, d] = tok.split(":");
      return { freq: n === "r" ? null : freqOf(n), steps: Number(d || 1) };
    });
  }

  const SONGS = {
    title: {
      tempo: 132,
      tracks: [
        { wave: "square", vol: 0.5, notes: "e4:2 g4:2 b4:2 c5:4 b4:2 g4:2 e4:4 r:2 d4:2 f#4:2 a4:2 b4:4 a4:2 f#4:2 d4:4 r:2 c4:2 e4:2 g4:2 a4:4 g4:2 e4:2 g4:2 b4:2 c5:8 r:4" },
        { wave: "triangle", vol: 0.8, notes: "c3:4 g3:4 c3:4 g3:4 d3:4 a3:4 d3:4 a3:4 a2:4 e3:4 a2:4 e3:4 c3:4 g3:4 c3:8" },
      ],
    },
    town: {
      tempo: 100,
      tracks: [
        { wave: "square", vol: 0.4, notes: "g4:4 e4:2 g4:2 a4:4 g4:4 e4:4 c4:4 d4:4 e4:4 g4:4 e4:2 g4:2 c5:4 b4:4 a4:4 g4:4 e4:8" },
        { wave: "triangle", vol: 0.7, notes: "c3:8 f3:8 c3:8 g3:8 c3:8 f3:8 g3:8 c3:8" },
      ],
    },
    route: {
      tempo: 126,
      tracks: [
        { wave: "square", vol: 0.45, notes: "c5:2 b4:2 a4:2 b4:2 c5:4 g4:4 e4:2 f4:2 g4:4 a4:2 b4:2 c5:4 a4:2 f4:2 a4:4 g4:2 e4:2 c4:4 d4:2 e4:2 f4:2 e4:2 d4:2 f4:2 e4:8" },
        { wave: "triangle", vol: 0.7, notes: "c3:4 e3:4 g3:4 e3:4 f3:4 a3:4 g3:4 b3:4 a3:4 f3:4 c3:4 e3:4 d3:4 f3:4 g3:8" },
      ],
    },
    battle: {
      tempo: 160,
      tracks: [
        { wave: "square", vol: 0.45, notes: "a4:1 a4:1 a4:2 g4:1 a4:1 c5:2 a4:2 g4:2 e4:4 f4:1 g4:1 a4:2 g4:1 f4:1 e4:2 d4:2 e4:2 f4:2 e4:2 a4:1 a4:1 a4:2 g4:1 a4:1 c5:2 e5:2 d5:2 c5:2 b4:2 g4:2 a4:8" },
        { wave: "sawtooth", vol: 0.45, notes: "a2:2 a2:2 a2:2 a2:2 f2:2 f2:2 f2:2 f2:2 g2:2 g2:2 g2:2 g2:2 a2:2 a2:2 g2:2 g2:2 a2:2 a2:2 a2:2 a2:2 f2:2 f2:2 f2:2 f2:2 g2:2 g2:2 g2:2 g2:2 a2:4 e2:4" },
      ],
    },
    center: {
      tempo: 112,
      tracks: [
        { wave: "square", vol: 0.4, notes: "e5:2 c5:2 d5:2 b4:2 c5:2 a4:2 b4:2 g4:2 a4:4 c5:4 e5:2 c5:2 d5:2 b4:2 c5:4 g4:4 c5:8" },
        { wave: "triangle", vol: 0.7, notes: "c3:8 g3:8 a3:8 e3:8 f3:8 g3:8 c3:8 c3:4 g2:4" },
      ],
    },
    gym: {
      tempo: 140,
      tracks: [
        { wave: "square", vol: 0.45, notes: "d4:2 d4:2 f4:2 d4:2 g4:4 f4:2 d4:2 e4:2 e4:2 g4:2 e4:2 a4:4 g4:2 e4:2 f4:2 f4:2 a4:2 f4:2 c5:4 a4:2 f4:2 g4:2 a4:2 b4:2 c5:2 d5:8" },
        { wave: "sawtooth", vol: 0.4, notes: "d2:4 d2:4 c2:4 c2:4 e2:4 e2:4 d2:4 d2:4 f2:4 f2:4 e2:4 e2:4 g2:4 g2:4 a2:8" },
      ],
    },
    victory: {
      tempo: 140,
      tracks: [
        { wave: "square", vol: 0.5, notes: "c5:2 c5:2 c5:2 c5:4 g4:4 a4:4 c5:2 a4:2 c5:8" },
        { wave: "triangle", vol: 0.7, notes: "c3:4 c3:4 f3:4 g3:4 c3:8 g3:4 c3:4" },
      ],
    },
  };

  const AudioSys = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: false,
    currentSong: null,
    _timer: null,
    _stepDur: 0,
    _nextTime: 0,
    _positions: null,
    cryCache: {},

    unlock() {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.16;
          this.master.connect(this.ctx.destination);
          this.musicGain = this.ctx.createGain();
          this.musicGain.gain.value = 1;
          this.musicGain.connect(this.master);
          if (this._pendingSong) {
            const s = this._pendingSong;
            this._pendingSong = null;
            this.playMusic(s);
          }
        } catch (e) {
          console.warn("audio unavailable", e);
        }
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
      return this.muted;
    },

    // ----- music -----
    playMusic(name) {
      if (this.currentSong === name) return;
      if (!this.ctx) {
        this._pendingSong = name;
        this.currentSong = name;
        return;
      }
      this.stopMusic();
      const song = SONGS[name];
      if (!song) return;
      this.currentSong = name;
      const parsed = song.tracks.map((t) => ({ ...t, seq: parseTrack(t.notes) }));
      this._stepDur = 60 / song.tempo / 2; // a "step" = eighth note
      this._positions = parsed.map(() => ({ idx: 0, when: this.ctx.currentTime + 0.05 }));
      this._parsedTracks = parsed;
      this._timer = setInterval(() => this._schedule(), 60);
    },

    stopMusic() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
      this.currentSong = null;
      this._pendingSong = null;
    },

    _schedule() {
      if (!this.ctx) return;
      const horizon = this.ctx.currentTime + 0.25;
      this._parsedTracks.forEach((track, ti) => {
        const pos = this._positions[ti];
        while (pos.when < horizon) {
          const note = track.seq[pos.idx % track.seq.length];
          const dur = note.steps * this._stepDur;
          if (note.freq) this._tone(note.freq, pos.when, dur * 0.92, track.wave, track.vol, this.musicGain);
          pos.when += dur;
          pos.idx++;
        }
      });
    },

    _tone(freq, when, dur, wave, vol, dest) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.01);
      g.gain.setValueAtTime(vol, when + Math.max(0.02, dur - 0.04));
      g.gain.linearRampToValueAtTime(0, when + dur);
      osc.connect(g);
      g.connect(dest || this.master);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    },

    // ----- sfx -----
    sfx(kind) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const T = (f, dt, dur, wave = "square", vol = 0.5) => this._tone(f, t + dt, dur, wave, vol);
      switch (kind) {
        case "menu": T(880, 0, 0.05); break;
        case "confirm": T(660, 0, 0.06); T(990, 0.06, 0.08); break;
        case "deny": T(220, 0, 0.12, "square", 0.5); break;
        case "bump": T(110, 0, 0.08, "square", 0.4); break;
        case "hit": T(330, 0, 0.05, "sawtooth", 0.6); T(165, 0.04, 0.1, "sawtooth", 0.5); break;
        case "hit-super": T(440, 0, 0.05, "sawtooth", 0.7); T(220, 0.05, 0.08, "sawtooth", 0.6); T(110, 0.1, 0.14, "sawtooth", 0.5); break;
        case "hit-weak": T(220, 0, 0.08, "sawtooth", 0.4); break;
        case "faint": T(392, 0, 0.1); T(294, 0.1, 0.1); T(196, 0.2, 0.2); break;
        case "ball-throw": T(523, 0, 0.05); T(784, 0.05, 0.07); break;
        case "ball-shake": T(196, 0, 0.07, "square", 0.55); break;
        case "ball-catch": T(523, 0, 0.09); T(523, 0.12, 0.2); break;
        case "heal": T(523, 0, 0.08); T(659, 0.09, 0.08); T(784, 0.18, 0.08); T(1047, 0.27, 0.2); break;
        case "levelup": T(523, 0, 0.06); T(659, 0.06, 0.06); T(784, 0.12, 0.06); T(1047, 0.18, 0.14); break;
        case "exp": T(1175, 0, 0.04, "square", 0.3); break;
        case "save": T(784, 0, 0.07); T(1047, 0.08, 0.12); break;
        case "badge": T(523, 0, 0.1); T(659, 0.1, 0.1); T(784, 0.2, 0.1); T(1047, 0.3, 0.1); T(1319, 0.4, 0.25); break;
      }
    },

    cry(speciesId, volume = 0.35) {
      try {
        let audio = this.cryCache[speciesId];
        if (!audio) {
          audio = new Audio(`assets/cries/${speciesId}.ogg`);
          this.cryCache[speciesId] = audio;
        }
        audio.volume = this.muted ? 0 : volume;
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    },
  };

  window.AudioSys = AudioSys;
})();
