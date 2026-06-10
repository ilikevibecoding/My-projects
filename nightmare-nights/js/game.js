// Night controller: ties the AI brains to the world, the characters,
// the audio engine and the UI. Owns the whole game state machine.
import * as THREE from 'three';
import {
  HallMonster, ClosetMonster, BedSwarm, BossMonster,
  NIGHTS, NIGHT_LENGTH, HOUR_LENGTH, escalate,
} from './ai.js';
import {
  makeThump, makePeck, makeSnatch, makeSnatchPlush, makeGnat, makeGrimm, JumpscareRig,
} from './characters.js';
import { ROOM } from './world.js';

const SAVE_KEY = 'fnon_unlocked_night';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor({ scene, camera, world, player, audio, ui, post }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.ui = ui;
    this.post = post;

    const q = new URLSearchParams(location.search);
    this.debug = q.get('debug') === '1';
    this.timeScale = parseFloat(q.get('ts') || '1') || 1;
    this.forceNight = parseInt(q.get('night') || '0', 10) || 0;
    const seed = parseInt(q.get('seed') || '0', 10) || 0;
    this.rng = seed ? mulberry32(seed) : Math.random.bind(Math);

    this.state = 'title';
    this.night = 1;
    this.t = 0;
    this.hour = 0;
    this.flavorTimer = 8;
    this.deathBy = null;
    this.fear = 0;

    // ---- AI ----
    this.thump = new HallMonster('L', 'thump');
    this.peck = new HallMonster('R', 'peck');
    this.snatch = new ClosetMonster('snatch');
    this.gnats = new BedSwarm('gnats');
    this.grimm = new BossMonster('grimm');
    this.monsters = [this.thump, this.peck, this.snatch, this.gnats, this.grimm];

    // ---- character visuals ----
    this.chars = {
      thump: makeThump(),
      peck: makePeck(),
      snatch: makeSnatch(),
      plushCalm: makeSnatchPlush(false),
      plushSus: makeSnatchPlush(true),
      grimm: makeGrimm(),
      gnats: [makeGnat(0), makeGnat(1), makeGnat(2)],
    };
    const W = ROOM.W, DZ = ROOM.DOOR_Z;
    // hall L runs x:-4..-14, hall R mirrors
    this.hallSpots = {
      L: { far: new THREE.Vector3(-12.4, 0, DZ), near: new THREE.Vector3(-7.4, 0, DZ), rotY: Math.PI / 2 },
      R: { far: new THREE.Vector3(12.4, 0, DZ), near: new THREE.Vector3(7.4, 0, DZ), rotY: -Math.PI / 2 },
    };
    scene.add(this.chars.thump.group);
    scene.add(this.chars.peck.group);
    scene.add(this.chars.snatch.group);
    scene.add(this.chars.plushCalm);
    scene.add(this.chars.plushSus);
    scene.add(this.chars.grimm.group);
    this.chars.thump.group.visible = false;
    this.chars.peck.group.visible = false;
    this.chars.snatch.group.visible = false;
    this.chars.plushSus.visible = false;
    this.chars.grimm.group.visible = false;
    // plush sits in the closet by default
    const ca = this.world.closet.anchor;
    this.chars.plushCalm.position.set(ca.x - 0.15, 0, ca.z);
    this.chars.plushSus.position.set(ca.x - 0.15, 0, ca.z);
    this.chars.snatch.group.position.set(ca.x, 0, ca.z);
    // gnats on the bed
    const bedSpots = [
      new THREE.Vector3(0.25, 0.76, 1.75),
      new THREE.Vector3(0.85, 0.76, 2.15),
      new THREE.Vector3(1.25, 0.76, 1.6),
    ];
    this.chars.gnats.forEach((gn, i) => {
      gn.group.position.copy(bedSpots[i]);
      gn.group.rotation.y = Math.PI - 0.3 + i * 0.3;
      gn.group.visible = false;
      scene.add(gn.group);
    });

    this.rig = new JumpscareRig(camera);

    // ---- wiring ----
    this.unlocked = this._loadUnlocked();
    this._bindUI();
    this._applyStationZones();

    this.player.onMoveStart = () => this._applyStationZones(true);
    this.player.onArrive = (st) => {
      this._applyStationZones();
      if (this.state === 'night' && this.night === 1 && this.t < 70) {
        if (st === 'doorL' || st === 'doorR') {
          this.ui.cueText('listen... breathing means HOLD THE DOOR. silence means flash the hall.', 4200);
        } else if (st === 'closet') {
          this.ui.cueText('flash to peek inside. hold the doors shut to calm it down.', 3800);
        } else if (st === 'bed') {
          this.ui.cueText('flash the bed to scatter whatever is gathering there.', 3600);
        }
      }
    };

    if (this.debug) this._buildDebugOverlay();
    window.__game = this; // handle for automated self-play
  }

  // ---------- save ----------
  _loadUnlocked() {
    try { return Math.max(1, Math.min(6, parseInt(localStorage.getItem(SAVE_KEY) || '1', 10) || 1)); }
    catch (e) { return 1; }
  }

  _saveUnlocked(n) {
    this.unlocked = Math.max(this.unlocked, n);
    try { localStorage.setItem(SAVE_KEY, String(this.unlocked)); } catch (e) { /* noop */ }
  }

  // ---------- UI bindings ----------
  _bindUI() {
    this.ui.buildNightButtons(this.unlocked, (n) => this.startNight(n));
    this.ui.el.winNext.addEventListener('click', () => {
      if (this.night < 6) this.startNight(this.night + 1);
      else this.toTitle();
    });
    this.ui.el.winMenu.addEventListener('click', () => this.toTitle());
    this.ui.el.deathRetry.addEventListener('click', () => this.startNight(this.night));
    this.ui.el.deathMenu.addEventListener('click', () => this.toTitle());
    this.ui.el.mute.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      this.ui.el.mute.textContent = this.audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
    });

    if (this.forceNight) {
      // test hook: jump straight into a night
      setTimeout(() => this.startNight(Math.min(6, this.forceNight)), 60);
    }
  }

  toTitle() {
    this.state = 'title';
    this.player.enabled = false;
    this.audio.stopAllBreathing();
    this.audio.stopRoomTone();
    this.rig.clear();
    this.ui.show('title');
    this.ui.hideZones();
    this.ui.setBlackout(false);
    this.ui.buildNightButtons(this.unlocked, (n) => this.startNight(n));
    this.ui.staticLevel = 0;
    this.fear = 0;
  }

  startNight(n) {
    this.audio.init();
    this.audio.resume();
    this.ui.el.mute.classList.add('visible');

    this.night = n;
    this.t = 0;
    this.hour = 0;
    this.deathBy = null;
    this.fear = 0;
    this.flavorTimer = 6 + this.rng() * 8;

    // reset brains & apply difficulty
    for (const m of this.monsters) m.reset();
    this._applyLevels();

    // reset visuals
    this.rig.clear();
    this.world.doorL.setClose(0);
    this.world.doorR.setClose(0);
    this.world.closet.setAjar(0.05);
    this.player.enabled = false;
    this.player.goTo('center');
    this.audio.stopAllBreathing();

    // intro card
    this.state = 'intro';
    this.ui.show('intro');
    this.ui.el.introNight.textContent = `NIGHT ${n}`;
    this.ui.setClock(0, n);
    this.ui.staticLevel = 0.5;
    setTimeout(() => { this.ui.staticLevel = 0; }, 450);
    setTimeout(() => {
      if (this.state !== 'intro') return;
      this.state = 'night';
      this.ui.show(null);
      this.player.enabled = true;
      this.audio.startRoomTone();
      this._applyStationZones();
      if (n === 1) {
        this.ui.cueText('survive until 6 am. your flashlight is your only tool.', 4200);
      }
    }, 2300);
  }

  _applyLevels() {
    const lv = escalate(NIGHTS[this.night], this.hour);
    this.thump.level = lv.thump;
    this.peck.level = lv.peck;
    this.snatch.level = lv.snatch;
    this.gnats.level = lv.gnats;
    this.grimm.level = lv.grimm;
  }

  // boss nights swap the closet/hall cast for Grimm regardless of his
  // current (possibly test-frozen) AI level
  get bossNight() {
    return ((NIGHTS[this.night] || {}).grimm || 0) > 0;
  }

  // ---------- zones ----------
  _applyStationZones(hideAll = false) {
    if (this.state !== 'night' || hideAll || this.player.moving) {
      if (this.state === 'night') this.ui.hideZones();
      return;
    }
    const hinted = this.night === 1 && this.t < 60;
    const st = this.player.station;
    const cfg = { left: null, right: null, up: null, down: null, action: null };
    if (st === 'center') {
      cfg.left = '◀ LEFT DOOR';
      cfg.right = 'RIGHT DOOR ▶';
      cfg.up = '▲ CLOSET';
      cfg.down = '▼ TURN TO BED';
    } else if (st === 'doorL') {
      cfg.right = 'BACK ▶';
      cfg.action = 'HOLD — SHUT DOOR';
    } else if (st === 'doorR') {
      cfg.left = '◀ BACK';
      cfg.action = 'HOLD — SHUT DOOR';
    } else if (st === 'closet') {
      cfg.down = '▼ BACK';
      cfg.action = 'HOLD — SHUT CLOSET';
    } else if (st === 'bed') {
      cfg.down = '▼ TURN BACK';
    }
    this.ui.setZones(cfg, hinted);
  }

  // ---------- cue routing (AI -> audio/visual) ----------
  _cue(name, data) {
    const pan = data && data.side ? (data.side === 'L' ? -0.8 : 0.8) : 0;
    switch (name) {
      case 'hallAppear':
        this.audio.footsteps(pan, 1, 3);
        break;
      case 'hallAdvance':
        this.audio.footsteps(pan, 1, 4);
        this.audio.creak(0.8, pan);
        break;
      case 'atDoor':
        this.audio.footsteps(pan, 1, 2, true);
        this.audio.creak(0.6, pan);
        break;
      case 'breathing':
        this.audio.setBreathing(data.side, data.on, pan);
        break;
      case 'retreatSteps':
        this.audio.footsteps(pan, -1, 5);
        break;
      case 'hallRetreatRun':
        this.audio.runAway(pan);
        break;
      case 'hallStepBack':
        this.audio.footsteps(pan, -1, 2);
        break;
      case 'entersRoom':
        this.audio.creak(0.5, pan * 0.5);
        this.audio.footsteps(pan * 0.3, 1, 3, true);
        this.fear = Math.min(1, this.fear + 0.5);
        break;
      case 'closetCreak':
        this.audio.creak(1.1 - data.stage * 0.12, 0);
        if (data.stage >= 2) this.audio.doorRattle(0);
        break;
      case 'closetRattle':
        this.audio.doorRattle(0);
        break;
      case 'closetCalm':
        this.audio.creak(1.3, 0);
        break;
      case 'gnatGiggle':
        this.audio.giggle((this.rng() - 0.5) * 1.2);
        break;
      case 'gnatScatter':
        this.audio.scatter(0);
        break;
      case 'bossLaugh':
        this.audio.laugh(data.location === 'L' ? -0.7 : data.location === 'R' ? 0.7 : 0);
        this.fear = Math.min(1, this.fear + 0.25);
        break;
      case 'bossStaged':
        this.audio.footsteps(data.location === 'L' ? -0.7 : data.location === 'R' ? 0.7 : 0, 1, 3, true);
        break;
      case 'bossThreat':
        this.audio.creak(0.5, 0);
        break;
      case 'bossRepelled':
        this.audio.runAway(data.location === 'L' ? -0.7 : data.location === 'R' ? 0.7 : 0);
        break;
      // no default
    }
  }

  // ---------- death ----------
  _kill(who) {
    if (this.state !== 'night') return;
    this.state = 'dying';
    this.deathBy = who;
    this.player.enabled = false;
    this.player.setFlash(false);
    this.player.setHolding(false);
    this.ui.hideZones();
    this.audio.stopAllBreathing();
    this.audio.scream();
    this.fear = 1;

    const builders = {
      thump: makeThump,
      peck: makePeck,
      snatch: makeSnatch,
      grimm: makeGrimm,
      'grimm-bed': makeGrimm,
    };
    const scale = who.startsWith('grimm') ? 1.12 : 1.0;
    this.rig.start(builders[who] || makeThump, () => {
      this.state = 'dead';
      this.audio.staticBurst(1.4);
      this.ui.staticLevel = 1;
      this.ui.show('death');
      const fade = setInterval(() => {
        this.ui.staticLevel *= 0.86;
        if (this.ui.staticLevel < 0.05) { this.ui.staticLevel = 0.05; clearInterval(fade); }
      }, 90);
    }, { scale, dur: 0.8 });
  }

  // ---------- win ----------
  _win() {
    this.state = 'win';
    this.player.enabled = false;
    this.player.setFlash(false);
    this.audio.stopAllBreathing();
    this.audio.stopRoomTone();
    this.ui.hideZones();
    this.audio.bells6am();
    this.audio.cheer();
    this._saveUnlocked(Math.min(6, this.night + 1));
    this.ui.setBlackout(true);
    setTimeout(() => {
      this.ui.show('win');
      this.ui.el.winSub.textContent = this.night >= 6
        ? 'you survived every nightmare. there is nothing left in the dark.'
        : 'you survived the night';
      this.ui.el.winNext.style.display = this.night >= 6 ? 'none' : '';
      this.ui.setBlackout(false);
    }, 1800);
  }

  // ---------- per-frame ----------
  update(rawDt) {
    const dt = Math.min(rawDt, 0.1) * this.timeScale;

    if (this.state === 'night') {
      this.t += dt;

      // clock
      const newHour = Math.min(5, Math.floor(this.t / HOUR_LENGTH));
      if (newHour !== this.hour) {
        this.hour = newHour;
        this.ui.setClock(this.hour === 0 ? 0 : this.hour, this.night);
        this.audio.hourChime(this.hour);
        this._applyLevels();
      }
      if (this.t >= NIGHT_LENGTH) {
        this._win();
        return;
      }

      // AI tick
      const ctx = {
        station: this.player.moving ? 'moving' : this.player.station,
        flashOn: this.player.flashOn,
        holding: this.player.holding,
        rng: this.rng,
        cue: (n, d) => this._cue(n, d),
        kill: (who) => this._kill(who),
      };
      for (const m of this.monsters) m.update(dt, ctx);

      // flavor sounds (Peck rummaging far right, distant clatters)
      this.flavorTimer -= dt;
      if (this.flavorTimer <= 0) {
        this.flavorTimer = 14 + this.rng() * 22;
        if (this.peck.level > 0 && this.peck.state === 'hidden' && this.rng() < 0.6) {
          this.audio.kitchenClatter(0.85);
        } else if (this.rng() < 0.4) {
          this.audio.creak(0.5 + this.rng() * 0.4, (this.rng() - 0.5) * 1.4);
        }
      }

      // fear decays
      this.fear = Math.max(0, this.fear - dt * 0.08);
    }

    this._syncVisuals(dt);
    if (this.debugEl) this._updateDebugOverlay();
  }

  _syncVisuals(dt) {
    const time = performance.now() / 1000;

    // hall monsters
    for (const [brain, char, side] of [
      [this.thump, this.chars.thump, 'L'],
      [this.peck, this.chars.peck, 'R'],
    ]) {
      const spots = this.hallSpots[side];
      const visible = brain.state === 'far' || brain.state === 'near';
      char.group.visible = visible && this.state !== 'title';
      if (visible) {
        const spot = spots[brain.state];
        char.group.position.copy(spot);
        char.group.rotation.y = spots.rotY + Math.sin(time * 0.4) * 0.06;
        char.setPose(brain.state === 'far' ? 'far' : 'near');
        char.update(time);
      }
    }

    // closet
    const boss = this.bossNight;
    const stage = boss
      ? (this.grimm.location === 'closet' ? 3 : 0)
      : this.snatch.stage;
    const atCloset = this.player.station === 'closet' && !this.player.moving;
    const peeking = atCloset && this.player.flashOn && !this.player.holding;
    const stageAjar = [0.05, 0.09, 0.16, 0.3][stage] ?? 0.05;
    const wantAjar = peeking ? Math.max(stageAjar, 0.42) : stageAjar;
    if (!(atCloset && this.player.holding)) {
      const cur = this.world.closet.getAjar();
      this.world.closet.setAjar(cur + (wantAjar - cur) * Math.min(1, dt * 4));
    }
    const showMonsterInCloset = boss
      ? (this.grimm.location === 'closet' && this.grimm.phase !== 'idle')
      : this.snatch.stage >= 2;
    if (!boss) {
      this.chars.plushCalm.visible = this.snatch.stage === 0 && this.state !== 'title';
      this.chars.plushSus.visible = this.snatch.stage === 1 && this.state !== 'title';
      this.chars.snatch.group.visible = showMonsterInCloset && this.state !== 'title';
      if (showMonsterInCloset) {
        this.chars.snatch.setPose(this.snatch.stage === 2 ? 'crouched' : 'standing');
        const ca = this.world.closet.anchor;
        this.chars.snatch.group.position.x = ca.x;
        this.chars.snatch.group.position.z = ca.z;
        if (this.snatch.stage === 2) this.chars.snatch.group.position.y = -0.62;
        else this.chars.snatch.group.position.y = 0;
        this.chars.snatch.group.rotation.y = 0;
        this.chars.snatch.update(time);
      }
    } else {
      this.chars.plushCalm.visible = this.state !== 'title' && this.grimm.location !== 'closet';
      this.chars.plushSus.visible = false;
      this.chars.snatch.group.visible = false;
    }

    // gnats
    const showCount = this.gnats.count;
    this.chars.gnats.forEach((gn, i) => {
      gn.group.visible = this.state !== 'title' && i < showCount;
      if (gn.group.visible) gn.update(time);
    });

    // grimm placement (boss nights)
    if (boss) {
      const g = this.chars.grimm;
      const active = this.grimm.phase === 'staged' || this.grimm.phase === 'threat';
      const loc = this.grimm.location;
      let vis = false;
      if (active && loc) {
        if (loc === 'L' || loc === 'R') {
          const spot = this.hallSpots[loc];
          const stagePos = this.grimm.phase === 'staged' ? spot.far : spot.near;
          g.group.position.copy(stagePos);
          g.group.rotation.y = spot.rotY;
          g.setPose(this.grimm.phase === 'staged' ? 'far' : 'near');
          vis = true;
        } else if (loc === 'closet') {
          const ca = this.world.closet.anchor;
          g.group.position.set(ca.x, 0, ca.z - 0.05);
          g.group.rotation.y = 0;
          g.group.scale.setScalar(0.82); // crammed into the closet
          g.setPose('near');
          vis = true;
        } else if (loc === 'bed') {
          g.group.position.set(0.6, 0, 2.62);
          g.group.rotation.y = Math.PI;
          g.group.scale.setScalar(1.0);
          g.setPose('near');
          vis = true;
        }
      }
      if (loc !== 'closet' && g.group.scale.x !== 1) g.group.scale.setScalar(1);
      g.group.visible = vis;
      if (vis) g.update(time);
    }

    // world idle motion
    if (this.world.fanBlades) this.world.fanBlades.rotation.y += dt * 3.4;
    if (this.world.detectorLed) {
      this.world.detectorLed.material.emissiveIntensity = (Math.sin(time * 2.2) > 0.92) ? 1.6 : 0.12;
    }

    // jumpscare rig + screen shake + post fear
    const shake = this.rig.update(dt);
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * 0.05 * shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.05 * shake;
    }
    this.post.material.uniforms.uFear.value = this.fear;
    this.post.material.uniforms.uFlicker.value = this.state === 'dying' ? 0.25 : 0;

    // static overlay
    this.ui.drawStatic(dt);
  }

  // ---------- debug ----------
  _buildDebugOverlay() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;color:#7f7;font:11px monospace;' +
      'background:rgba(0,0,0,.7);padding:6px 8px;white-space:pre;pointer-events:none;';
    document.body.appendChild(d);
    this.debugEl = d;
  }

  _updateDebugOverlay() {
    const p = this.player;
    this.debugEl.textContent =
      `state=${this.state} night=${this.night} t=${this.t.toFixed(1)} hour=${this.hour}\n` +
      `station=${p.station}${p.moving ? '(moving)' : ''} flash=${p.flashOn} hold=${p.holding}\n` +
      `thump[${this.thump.level}]=${this.thump.state} wait=${this.thump.doorWait.toFixed(1)}\n` +
      `peck[${this.peck.level}]=${this.peck.state} wait=${this.peck.doorWait.toFixed(1)}\n` +
      `snatch[${this.snatch.level}]=stage${this.snatch.stage} atk=${this.snatch.attackWait.toFixed(1)}\n` +
      `gnats[${this.gnats.level}]=${this.gnats.count} doom=${this.gnats.doom.toFixed(1)}\n` +
      `grimm[${this.grimm.level}]=${this.grimm.phase}@${this.grimm.location} threat=${this.grimm.threatTimer.toFixed(1)}\n` +
      `deathBy=${this.deathBy}`;
  }
}
