// The brains. Classic dice-roll AI: every `interval` seconds each monster
// gets a movement opportunity — roll 1..20 against its AI level to act.
//
// All classes are pure logic (no three.js / DOM) so they can be unit-tested
// in Node. They communicate through a context object provided each tick:
//
// ctx = {
//   station:  'center'|'doorL'|'doorR'|'closet'|'bed'
//   flashOn:  boolean        — flashlight currently lit
//   holding:  boolean        — player holding the door/closet shut (at station)
//   rng:      () => 0..1
//   cue(name, data)          — audio/visual cue out
//   kill(byWho)              — jumpscare!
// }
export const HALL_STATES = ['hidden', 'far', 'near', 'door', 'inside'];

export class HallMonster {
  // side: 'L' | 'R'
  constructor(side, name) {
    this.side = side;
    this.name = name;
    this.level = 0;
    this.reset();
  }

  reset() {
    this.state = 'hidden';
    this.timer = 2 + Math.random() * 3;
    this.holdProgress = 0;
    this.holdNeed = 0;
    this.doorWait = 0;
    this.exposure = 0;
    this.flashGrace = 0;
    this.insideTimer = 0;
    this.cooldown = 0;
    this.flashKillDelay = 0;
  }

  get atMyDoor() { return `door${this.side}`; }

  interval() { return Math.max(2.6, 5.2 - this.level * 0.11); }
  doorWaitLimit() { return Math.max(8, 17 - this.level * 0.45); }

  update(dt, ctx) {
    if (this.level <= 0) return;
    const atDoor = ctx.station === this.atMyDoor;

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flashGrace > 0) this.flashGrace -= dt;

    // ---- player flashes my hall ----
    const flashingMyHall = atDoor && ctx.flashOn && !ctx.holding;

    switch (this.state) {
      case 'hidden': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = this.interval();
          if (this.cooldown <= 0 && ctx.rng() * 20 < this.level) {
            this.state = 'far';
            ctx.cue('hallAppear', { side: this.side, stage: 'far', who: this.name });
          }
        }
        break;
      }
      case 'far':
      case 'near': {
        if (flashingMyHall && this.flashGrace <= 0) {
          // light repels mid-hall stalkers
          this.flashGrace = 1.2;
          if (ctx.rng() < 0.55 || this.state === 'far') {
            this.state = 'hidden';
            this.cooldown = 4 + ctx.rng() * 4;
            ctx.cue('hallRetreatRun', { side: this.side, who: this.name });
          } else {
            this.state = 'far';
            this.cooldown = 2.5;
            ctx.cue('hallStepBack', { side: this.side, who: this.name });
          }
          break;
        }
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = this.interval();
          if (ctx.rng() * 20 < this.level + 2) {
            if (this.state === 'far') {
              this.state = 'near';
              ctx.cue('hallAdvance', { side: this.side, stage: 'near', who: this.name });
            } else {
              this.state = 'door';
              this.doorWait = 0;
              this.exposure = 0;
              this.holdProgress = 0;
              this.holdNeed = 1.6 + ctx.rng() * 2.4;
              ctx.cue('atDoor', { side: this.side, who: this.name });
            }
          }
        }
        break;
      }
      case 'door': {
        this.doorWait += dt;

        // breathing is audible only while the player stands at this door
        ctx.cue('breathing', { side: this.side, on: atDoor, who: this.name });

        if (atDoor) {
          // FLASH AT BREATHING = DEATH. The signature rule.
          if (ctx.flashOn && !ctx.holding) {
            this.flashKillDelay += dt;
            if (this.flashKillDelay > 0.12) {
              ctx.cue('breathing', { side: this.side, on: false, who: this.name });
              ctx.kill(this.name);
              this.state = 'inside';
              return;
            }
          } else {
            this.flashKillDelay = 0;
          }

          if (ctx.holding) {
            this.exposure = 0;
            this.holdProgress += dt;
            if (this.holdProgress >= this.holdNeed) {
              // repelled!
              this.state = 'hidden';
              this.cooldown = 6 + ctx.rng() * 5;
              ctx.cue('breathing', { side: this.side, on: false, who: this.name });
              ctx.cue('retreatSteps', { side: this.side, who: this.name });
            }
          } else {
            // standing at an open door with it breathing — short fuse
            this.exposure += dt;
            this.holdProgress = 0;
            if (this.exposure > 2.1) {
              ctx.cue('breathing', { side: this.side, on: false, who: this.name });
              ctx.kill(this.name);
              this.state = 'inside';
              return;
            }
          }
        } else {
          this.exposure = 0;
          this.holdProgress = 0;
          this.flashKillDelay = 0;
          if (this.doorWait > this.doorWaitLimit()) {
            // ignored too long — it lets itself in
            this.state = 'inside';
            this.insideTimer = 3.2 + ctx.rng() * 2.4;
            ctx.cue('entersRoom', { side: this.side, who: this.name });
          }
        }
        break;
      }
      case 'inside': {
        this.insideTimer -= dt;
        if (this.insideTimer <= 0) {
          ctx.kill(this.name);
          this.insideTimer = 999; // only kill once
        }
        break;
      }
      // no default
    }
  }
}

// Closet stages: 0 dormant plush, 1 watching plush, 2 crouched, 3 standing-ready
export class ClosetMonster {
  constructor(name = 'snatch') {
    this.name = name;
    this.level = 0;
    this.reset();
  }

  reset() {
    this.stage = 0;
    this.timer = 6;
    this.holdProgress = 0;
    this.flashOnStage3 = 0;
    this.attackWait = 0;
    this.cooldown = 0;
  }

  interval() { return Math.max(3.4, 6.4 - this.level * 0.14); }
  attackLimit() { return Math.max(7, 13 - this.level * 0.3); }

  update(dt, ctx) {
    if (this.level <= 0) return;
    const atCloset = ctx.station === 'closet';
    if (this.cooldown > 0) this.cooldown -= dt;

    // escalation
    if (this.stage < 3) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.interval();
        // holding the closet shut blocks escalation entirely
        const blocked = atCloset && ctx.holding;
        if (!blocked && this.cooldown <= 0 && ctx.rng() * 20 < this.level) {
          this.stage += 1;
          ctx.cue('closetCreak', { stage: this.stage, who: this.name });
          if (this.stage === 3) this.attackWait = 0;
        }
      }
    } else {
      // stage 3: clock is ticking
      this.attackWait += dt;
      if (this.attackWait > this.attackLimit()) {
        ctx.kill(this.name);
        this.attackWait = -999;
        return;
      }
      // flashing it while it stands there = death
      if (atCloset && ctx.flashOn && !ctx.holding) {
        this.flashOnStage3 += dt;
        if (this.flashOnStage3 > 0.85) {
          ctx.kill(this.name);
          this.flashOnStage3 = -999;
          return;
        }
      } else {
        this.flashOnStage3 = Math.max(0, this.flashOnStage3 - dt * 2);
      }
    }

    // holding the doors shut calms it down
    if (atCloset && ctx.holding && this.stage >= 1) {
      this.holdProgress += dt;
      if (this.stage >= 2) ctx.cue('closetRattle', { stage: this.stage, who: this.name });
      const need = this.stage >= 3 ? 2.6 : 2.0;
      if (this.holdProgress >= need) {
        this.holdProgress = 0;
        this.stage -= 1;
        this.cooldown = 3 + ctx.rng() * 3;
        ctx.cue('closetCalm', { stage: this.stage, who: this.name });
      }
    } else {
      this.holdProgress = 0;
    }
  }
}

// Bed gremlins: count 0..3 — three of them out at once means the big one comes.
export class BedSwarm {
  constructor(name = 'gnats') {
    this.name = name;
    this.level = 0;
    this.reset();
  }

  reset() {
    this.count = 0;
    this.timer = 5;
    this.doom = 0;
    this.clearProgress = 0;
    this.spawnPause = 0;
  }

  interval() { return Math.max(3.0, 6.0 - this.level * 0.13); }
  doomLimit() { return Math.max(3.6, 6.5 - this.level * 0.14); }

  update(dt, ctx) {
    if (this.level <= 0) return;
    const atBed = ctx.station === 'bed';
    if (this.spawnPause > 0) this.spawnPause -= dt;

    // spawning happens while you're not watching
    if (!atBed && this.count < 3 && this.spawnPause <= 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.interval();
        if (ctx.rng() * 20 < this.level) {
          this.count += 1;
          ctx.cue('gnatGiggle', { count: this.count, who: this.name });
        }
      }
    }

    // three out = countdown to the big bite
    if (this.count >= 3) {
      this.doom += dt;
      if (this.doom > this.doomLimit()) {
        ctx.kill('grimm-bed');
        this.doom = -999;
        return;
      }
    } else {
      this.doom = 0;
    }

    // flashing the bed clears them
    if (atBed && ctx.flashOn && this.count > 0) {
      this.clearProgress += dt;
      if (this.clearProgress > 0.55) {
        this.clearProgress = 0;
        this.count = 0;
        this.doom = 0;
        this.spawnPause = 2.5;
        ctx.cue('gnatScatter', { who: this.name });
      }
    } else {
      this.clearProgress = 0;
    }
  }
}

// GRIMM — nights 5/6. One entity, four attack vectors, laugh telegraphs.
export class BossMonster {
  constructor(name = 'grimm') {
    this.name = name;
    this.level = 0;
    this.reset();
  }

  reset() {
    this.phase = 'idle';     // idle | staged | threat
    this.location = null;    // 'L' | 'R' | 'closet' | 'bed'
    this.timer = 4;
    this.threatTimer = 0;
    this.holdProgress = 0;
    this.holdNeed = 2.0;
    this.exposure = 0;
    this.flashKillDelay = 0;
    this.bedFlash = 0;
  }

  idleInterval() { return Math.max(2.2, 6.5 - this.level * 0.22); }
  stageInterval() { return Math.max(2.4, 5.0 - this.level * 0.13); }
  threatLimit() { return Math.max(5.5, 10.5 - this.level * 0.25); }

  stationFor(loc) {
    return loc === 'L' ? 'doorL' : loc === 'R' ? 'doorR' : loc;
  }

  update(dt, ctx) {
    if (this.level <= 0) return;

    switch (this.phase) {
      case 'idle': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = this.idleInterval();
          if (ctx.rng() * 20 < this.level) {
            const locs = ['L', 'R', 'closet', 'bed'];
            this.location = locs[Math.floor(ctx.rng() * 4) % 4];
            this.phase = 'staged';
            this.timer = this.stageInterval();
            ctx.cue('bossLaugh', { location: this.location });
            ctx.cue('bossStaged', { location: this.location });
          }
        }
        break;
      }
      case 'staged': {
        // visible/audible at the location; player can already respond
        if (this.tryResolve(dt, ctx, 0.7)) break;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'threat';
          this.threatTimer = 0;
          this.exposure = 0;
          this.holdProgress = 0;
          this.holdNeed = 1.8 + ctx.rng() * 1.6;
          ctx.cue('bossThreat', { location: this.location });
          if (this.location === 'L' || this.location === 'R') {
            ctx.cue('breathing', { side: this.location, on: false, who: this.name }); // reset then set below
          }
        }
        break;
      }
      case 'threat': {
        this.threatTimer += dt;
        const st = this.stationFor(this.location);
        const here = ctx.station === st;

        if (this.location === 'L' || this.location === 'R') {
          ctx.cue('breathing', { side: this.location, on: here, who: this.name });
          if (here) {
            if (ctx.flashOn && !ctx.holding) {
              this.flashKillDelay += dt;
              if (this.flashKillDelay > 0.12) { this.die(ctx); return; }
            } else this.flashKillDelay = 0;
            if (ctx.holding) {
              this.holdProgress += dt;
              this.exposure = 0;
              if (this.holdProgress > this.holdNeed) { this.repelled(ctx); return; }
            } else {
              this.exposure += dt;
              this.holdProgress = 0;
              if (this.exposure > 1.7) { this.die(ctx); return; }
            }
          }
        } else if (this.location === 'closet') {
          if (here && ctx.holding) {
            this.holdProgress += dt;
            ctx.cue('closetRattle', { stage: 3, who: this.name });
            if (this.holdProgress > this.holdNeed + 0.6) { this.repelled(ctx); return; }
          } else {
            this.holdProgress = 0;
            if (here && ctx.flashOn) {
              this.flashKillDelay += dt;
              if (this.flashKillDelay > 0.75) { this.die(ctx); return; }
            } else this.flashKillDelay = 0;
          }
        } else { // bed
          if (here && ctx.flashOn) {
            this.bedFlash += dt;
            if (this.bedFlash > 0.7) { this.repelled(ctx); return; }
          } else {
            this.bedFlash = Math.max(0, this.bedFlash - dt);
          }
        }

        if (this.threatTimer > this.threatLimit()) { this.die(ctx); return; }
        break;
      }
      // no default
    }
  }

  tryResolve(dt, ctx, factor) {
    // early response during 'staged' phase also works
    const st = this.stationFor(this.location);
    const here = ctx.station === st;
    if (!here) return false;
    if (this.location === 'bed') {
      if (ctx.flashOn) {
        this.bedFlash += dt;
        if (this.bedFlash > 0.7 * factor + 0.3) { this.repelled(ctx); return true; }
      }
    } else if (ctx.holding) {
      this.holdProgress += dt;
      if (this.holdProgress > 1.6) { this.repelled(ctx); return true; }
    }
    return false;
  }

  repelled(ctx) {
    ctx.cue('breathing', { side: this.location, on: false, who: this.name });
    ctx.cue('bossRepelled', { location: this.location });
    this.phase = 'idle';
    this.timer = this.idleInterval() + 2;
    this.location = null;
    this.holdProgress = 0;
    this.bedFlash = 0;
    this.flashKillDelay = 0;
  }

  die(ctx) {
    ctx.cue('breathing', { side: this.location, on: false, who: this.name });
    ctx.kill(this.name);
    this.phase = 'done';
  }
}

// per-night difficulty: AI levels 0..20
export const NIGHTS = {
  1: { thump: 4,  peck: 3,  snatch: 0,  gnats: 3,  grimm: 0 },
  2: { thump: 6,  peck: 5,  snatch: 5,  gnats: 5,  grimm: 0 },
  3: { thump: 8,  peck: 8,  snatch: 7,  gnats: 7,  grimm: 0 },
  4: { thump: 11, peck: 11, snatch: 10, gnats: 9,  grimm: 0 },
  5: { thump: 0,  peck: 0,  snatch: 0,  gnats: 0,  grimm: 11 },
  6: { thump: 0,  peck: 0,  snatch: 0,  gnats: 0,  grimm: 16 },
};

export const NIGHT_LENGTH = 320;       // seconds, 12AM -> 6AM
export const HOUR_LENGTH = NIGHT_LENGTH / 6;

// late-night escalation: +1 at 2AM, +1 more at 4AM
export function escalate(baseLevels, hour) {
  const bump = (hour >= 4 ? 2 : hour >= 2 ? 1 : 0);
  const out = {};
  for (const k of Object.keys(baseLevels)) {
    out[k] = baseLevels[k] > 0 ? Math.min(20, baseLevels[k] + bump) : 0;
  }
  return out;
}
