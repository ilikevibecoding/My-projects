// Professor intro sequence + name entry, then hands off to the overworld.
(function () {
  "use strict";

  const LETTERS = [
    "ABCDEFGHI",
    "JKLMNOPQR",
    "STUVWXYZ-",
  ];

  function IntroScene(game) {
    this.game = game;
    this.phase = "speech";
    this.t = 0;
    this.started = false;
  }

  IntroScene.prototype.update = function (dt) {
    this.t += dt;
    const D = window.Dialog;
    AudioSys.playMusic("center");

    if (!this.started) {
      this.started = true;
      this.runSpeech();
    }
    if (this.phase === "speech") {
      D.update();
      D.handleInput();
      return;
    }
    if (this.phase === "name") {
      this.updateNameEntry();
    }
  };

  IntroScene.prototype.runSpeech = async function () {
    const D = window.Dialog;
    await D.say("CEDAR: Hello there! Welcome to the world of POKéMON!");
    await D.say("CEDAR: My name is CEDAR! People call me the POKéMON PROF!");
    await D.say("CEDAR: This world is inhabited by creatures called POKéMON! For some people, POKéMON are pets. Others use them for fights.");
    await D.say("CEDAR: Myself… I study POKéMON as a profession.");
    await D.say("CEDAR: First, what is your name?");
    this.beginNameEntry("RED", (name) => {
      this.game.state.playerName = name;
      this.afterPlayerName();
    });
  };

  IntroScene.prototype.afterPlayerName = async function () {
    const D = window.Dialog;
    this.phase = "speech";
    await D.say(`CEDAR: Right! So your name is ${this.game.state.playerName}!`);
    await D.say("CEDAR: This is my grandson. He's been your rival since you were a baby. …Erm, what is his name again?");
    this.beginNameEntry("BLUE", (name) => {
      this.game.state.rivalName = name;
      this.afterRivalName();
    });
  };

  IntroScene.prototype.afterRivalName = async function () {
    const D = window.Dialog;
    this.phase = "speech";
    await D.say(`CEDAR: That's right! I remember now! His name is ${this.game.state.rivalName}!`);
    await D.say(`CEDAR: ${this.game.state.playerName}! Your very own POKéMON legend is about to unfold! A world of dreams and adventures with POKéMON awaits! Let's go!`);
    AudioSys.stopMusic();
    this.game.startOverworld();
  };

  // ---------- name entry ----------
  IntroScene.prototype.beginNameEntry = function (defaultName, cb) {
    this.phase = "name";
    this.name = "";
    this.defaultName = defaultName;
    this.cursorX = 0;
    this.cursorY = 0;
    this.nameCb = cb;
  };

  IntroScene.prototype.updateNameEntry = function () {
    const I = window.Input;
    const rows = LETTERS.length + 1; // extra row: END
    if (I.pressed("up")) { this.cursorY = (this.cursorY + rows - 1) % rows; AudioSys.sfx("menu"); }
    if (I.pressed("down")) { this.cursorY = (this.cursorY + 1) % rows; AudioSys.sfx("menu"); }
    if (I.pressed("left")) { this.cursorX = (this.cursorX + 8) % 9; AudioSys.sfx("menu"); }
    if (I.pressed("right")) { this.cursorX = (this.cursorX + 1) % 9; AudioSys.sfx("menu"); }
    if (I.pressed("b")) {
      this.name = this.name.slice(0, -1);
      AudioSys.sfx("deny");
    }
    if (I.pressed("start")) {
      this.finishName();
      return;
    }
    if (I.pressed("a")) {
      if (this.cursorY === rows - 1) {
        this.finishName();
        return;
      }
      const ch = LETTERS[this.cursorY][this.cursorX];
      if (ch && ch !== "-" && this.name.length < 7) {
        this.name += ch;
        AudioSys.sfx("menu");
      } else if (ch === "-" && this.name.length < 7) {
        this.name += "-";
        AudioSys.sfx("menu");
      }
    }
  };

  IntroScene.prototype.finishName = function () {
    AudioSys.sfx("confirm");
    const name = this.name.trim() || this.defaultName;
    this.phase = "speech";
    this.nameCb(name);
  };

  IntroScene.prototype.draw = function (ctx) {
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, 240, 160);
    ctx.fillStyle = "#e8eef8";
    ctx.fillRect(0, 0, 240, 56);

    if (this.phase === "name") {
      UI.drawBox(ctx, 12, 6, 216, 30);
      UI.text(ctx, "YOUR NAME:", 22, 12);
      UI.text(ctx, this.name + (Math.floor(this.t * 3) % 2 ? "_" : " "), 90, 22);
      UI.drawBox(ctx, 12, 40, 216, 96);
      for (let y = 0; y < LETTERS.length; y++) {
        for (let x = 0; x < 9; x++) {
          const px = 30 + x * 22, py = 52 + y * 18;
          UI.text(ctx, LETTERS[y][x], px, py);
          if (this.cursorY === y && this.cursorX === x) UI.text(ctx, "▶", px - 9, py);
        }
      }
      const endY = 52 + LETTERS.length * 18;
      UI.text(ctx, "END", 30, endY);
      if (this.cursorY === LETTERS.length) UI.text(ctx, "▶", 21, endY);
      UI.text(ctx, "A: pick  B: erase  START: done", 26, 146, "#6a7a9a");
      return;
    }

    // professor presentation: a Pokémon to gesture with
    const nido = window.Sprites.front(33);
    if (window.Sprites.ready(nido)) {
      const bob = Math.round(Math.sin(this.t * 2) * 2);
      ctx.drawImage(nido, 88, 28 + bob, 64, 64);
    }
    window.Dialog.draw(ctx);
  };

  window.IntroScene = IntroScene;
})();
