// Headless self-play: drives the actual game AI (ai.js) with a simulated
// player policy that only "knows" what a real player could hear/see.
// Usage: node selfplay-sim.mjs [runsPerNight]
import {
  HallMonster, ClosetMonster, BedSwarm, BossMonster,
  NIGHTS, NIGHT_LENGTH, escalate,
} from '../js/ai.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVE_TIME = 0.5; // seconds to move between stations

// ---------------------------------------------------------------
// Player bot. Reacts only to cues (sound) + what's visible at the
// current station, like a human player would.
// ---------------------------------------------------------------
class Bot {
  constructor(skill = 'good') {
    this.skill = skill;            // 'good' reacts fast, 'sloppy' slower
    this.station = 'center';
    this.moving = 0;
    this.flashOn = false;
    this.holding = false;
    // knowledge from audio cues
    this.breathing = { L: false, R: false };
    this.heardSteps = { L: 0, R: 0 };   // recency of footsteps per side
    this.closetSuspicion = 0;           // raised by creaks/rattles
    this.bedSuspicion = 0;              // raised by giggles
    this.bossLoc = null;
    this.bossActive = false;
    this.plan = [];                     // queue of {action, arg, t}
    this.actT = 0;
    this.listenT = 0;
    this.holdT = 0;
    this.patrol = ['doorL', 'doorR'];
    this.patrolIdx = 0;
    this.reactDelay = skill === 'good' ? 0.25 : 0.8;
  }

  hear(name, data) {
    const side = data && data.side;
    switch (name) {
      case 'breathing': this.breathing[side] = data.on; break;
      case 'hallAppear': case 'hallAdvance': case 'atDoor':
        if (side) this.heardSteps[side] = 8; break;
      case 'retreatSteps': case 'hallRetreatRun':
        if (side) this.heardSteps[side] = 0; break;
      case 'closetCreak': this.closetSuspicion = Math.max(this.closetSuspicion, data.stage >= 2 ? 2 : 1); break;
      case 'closetRattle': this.closetSuspicion = Math.max(this.closetSuspicion, 2); break;
      case 'closetCalm': this.closetSuspicion = Math.max(0, this.closetSuspicion - 1); break;
      case 'gnatGiggle': this.bedSuspicion += 1; break;
      case 'gnatScatter': this.bedSuspicion = 0; break;
      case 'bossLaugh': case 'bossStaged': this.bossLoc = data.location; this.bossActive = true; break;
      case 'bossRepelled': this.bossLoc = null; this.bossActive = false; break;
      // no default
    }
  }

  // decide + act each tick; returns ctx fields
  tick(dt, rng) {
    for (const s of ['L', 'R']) this.heardSteps[s] = Math.max(0, this.heardSteps[s] - dt);

    if (this.moving > 0) {
      this.moving -= dt;
      this.flashOn = false;
      this.holding = false;
      if (this.moving <= 0) { this.listenT = 0; this.holdT = 0; }
      return;
    }

    // --- boss night: respond to the laugh's location ---
    if (this.bossActive && this.bossLoc) {
      const want = this.bossLoc === 'L' ? 'doorL' : this.bossLoc === 'R' ? 'doorR' : this.bossLoc;
      if (this.station !== want) { this.goTo(want); return; }
      if (this.bossLoc === 'bed') {
        this.flashOn = true; this.holding = false;
      } else {
        this.holding = true; this.flashOn = false;
      }
      return;
    }

    // --- breathing at my door: HOLD ---
    if (this.station === 'doorL' && this.breathing.L) { this.holding = true; this.flashOn = false; return; }
    if (this.station === 'doorR' && this.breathing.R) { this.holding = true; this.flashOn = false; return; }

    // --- bed emergency ---
    if (this.bedSuspicion >= (this.skill === 'good' ? 1 : 2) && this.station !== 'bed') {
      this.goTo('bed');
      return;
    }
    if (this.station === 'bed') {
      if (this.bedSuspicion > 0) { this.flashOn = true; return; }
      this.goTo('center'); return;
    }

    // --- closet emergency ---
    if (this.closetSuspicion >= 2 && this.station !== 'closet') {
      this.goTo('closet');
      return;
    }
    if (this.station === 'closet') {
      if (this.closetSuspicion >= 1) {
        this.holding = true; this.flashOn = false;
        this.holdT += dt;
        if (this.holdT > 3.2) { this.closetSuspicion = 0; this.holdT = 0; }
        return;
      }
      this.goTo('center'); return;
    }

    // --- at a door: listen first, then flash if silent ---
    if (this.station === 'doorL' || this.station === 'doorR') {
      const side = this.station === 'doorL' ? 'L' : 'R';
      this.listenT += dt;
      if (this.listenT < 0.65 + this.reactDelay) { this.flashOn = false; this.holding = false; return; }
      if (this.listenT < 1.15 + this.reactDelay) { this.flashOn = true; this.holding = false; return; }
      // done here; next patrol target
      this.flashOn = false;
      this.nextPatrol(side);
      return;
    }

    // --- center: head to most suspicious door, else patrol ---
    if (this.heardSteps.L > 0 && this.heardSteps.L >= this.heardSteps.R) { this.goTo('doorL'); return; }
    if (this.heardSteps.R > 0) { this.goTo('doorR'); return; }
    this.goTo(this.patrol[this.patrolIdx]);
  }

  nextPatrol(fromSide) {
    this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
    // occasionally glance at the bed even without sound (good players do)
    this.goTo('center');
  }

  goTo(st) {
    if (st === this.station) return;
    // movement graph: everything passes through center except direct moves
    this.station = st;
    this.moving = MOVE_TIME;
    this.flashOn = false;
    this.holding = false;
  }
}

// ---------------------------------------------------------------
function runNight(night, seed, skill) {
  const rng = mulberry32(seed);
  const thump = new HallMonster('L', 'thump');
  const peck = new HallMonster('R', 'peck');
  const snatch = new ClosetMonster();
  const gnats = new BedSwarm();
  const grimm = new BossMonster();
  const monsters = [thump, peck, snatch, gnats, grimm];
  const bot = new Bot(skill);

  let dead = null;
  let t = 0;
  const dt = 0.05;
  const cueLog = [];

  while (t < NIGHT_LENGTH && !dead) {
    const hour = Math.min(5, Math.floor(t / (NIGHT_LENGTH / 6)));
    const lv = escalate(NIGHTS[night], hour);
    thump.level = lv.thump; peck.level = lv.peck; snatch.level = lv.snatch;
    gnats.level = lv.gnats; grimm.level = lv.grimm;

    bot.tick(dt, rng);
    const ctx = {
      station: bot.moving > 0 ? 'moving' : bot.station,
      flashOn: bot.flashOn,
      holding: bot.holding,
      rng,
      cue: (n, d) => { bot.hear(n, d); cueLog.push([t.toFixed(1), n, d && (d.side || d.location || d.stage || d.count)]); },
      kill: (who) => { dead = who; },
    };
    for (const m of monsters) m.update(dt, ctx);
    t += dt;
  }
  return { survived: !dead, dead, t, cues: cueLog.length };
}

const runs = parseInt(process.argv[2] || '120', 10);
const skills = ['good', 'sloppy'];
console.log(`self-play: ${runs} runs per night per skill\n`);
for (const skill of skills) {
  console.log(`--- bot skill: ${skill} ---`);
  for (let night = 1; night <= 6; night++) {
    let wins = 0;
    const deaths = {};
    let totalT = 0;
    for (let i = 0; i < runs; i++) {
      const r = runNight(night, night * 1000 + i * 17 + 3, skill);
      if (r.survived) wins += 1;
      else { deaths[r.dead] = (deaths[r.dead] || 0) + 1; totalT += r.t; }
    }
    const lossN = runs - wins;
    const avgDeathT = lossN ? (totalT / lossN).toFixed(0) : '-';
    console.log(
      `night ${night}: win ${(100 * wins / runs).toFixed(0).padStart(3)}%` +
      `  deaths: ${JSON.stringify(deaths)} avgDeathT=${avgDeathT}s`);
  }
  console.log('');
}
