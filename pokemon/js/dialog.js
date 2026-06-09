// Pixel font, UI box helpers, and the promise-based dialog/menu system.
(function () {
  "use strict";

  // ---------- 5x7 pixel font ----------
  const G = {};
  function def(ch, rows) {
    G[ch] = rows.map((r) => parseInt(r, 2));
  }
  def("A", ["01110", "10001", "10001", "11111", "10001", "10001", "10001"]);
  def("B", ["11110", "10001", "10001", "11110", "10001", "10001", "11110"]);
  def("C", ["01110", "10001", "10000", "10000", "10000", "10001", "01110"]);
  def("D", ["11110", "10001", "10001", "10001", "10001", "10001", "11110"]);
  def("E", ["11111", "10000", "10000", "11110", "10000", "10000", "11111"]);
  def("F", ["11111", "10000", "10000", "11110", "10000", "10000", "10000"]);
  def("G", ["01110", "10001", "10000", "10111", "10001", "10001", "01111"]);
  def("H", ["10001", "10001", "10001", "11111", "10001", "10001", "10001"]);
  def("I", ["01110", "00100", "00100", "00100", "00100", "00100", "01110"]);
  def("J", ["00111", "00010", "00010", "00010", "00010", "10010", "01100"]);
  def("K", ["10001", "10010", "10100", "11000", "10100", "10010", "10001"]);
  def("L", ["10000", "10000", "10000", "10000", "10000", "10000", "11111"]);
  def("M", ["10001", "11011", "10101", "10101", "10001", "10001", "10001"]);
  def("N", ["10001", "11001", "10101", "10011", "10001", "10001", "10001"]);
  def("O", ["01110", "10001", "10001", "10001", "10001", "10001", "01110"]);
  def("P", ["11110", "10001", "10001", "11110", "10000", "10000", "10000"]);
  def("Q", ["01110", "10001", "10001", "10001", "10101", "10010", "01101"]);
  def("R", ["11110", "10001", "10001", "11110", "10100", "10010", "10001"]);
  def("S", ["01111", "10000", "10000", "01110", "00001", "00001", "11110"]);
  def("T", ["11111", "00100", "00100", "00100", "00100", "00100", "00100"]);
  def("U", ["10001", "10001", "10001", "10001", "10001", "10001", "01110"]);
  def("V", ["10001", "10001", "10001", "10001", "10001", "01010", "00100"]);
  def("W", ["10001", "10001", "10001", "10101", "10101", "10101", "01010"]);
  def("X", ["10001", "10001", "01010", "00100", "01010", "10001", "10001"]);
  def("Y", ["10001", "10001", "01010", "00100", "00100", "00100", "00100"]);
  def("Z", ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]);
  def("a", ["00000", "00000", "01110", "00001", "01111", "10001", "01111"]);
  def("b", ["10000", "10000", "11110", "10001", "10001", "10001", "11110"]);
  def("c", ["00000", "00000", "01110", "10001", "10000", "10001", "01110"]);
  def("d", ["00001", "00001", "01111", "10001", "10001", "10001", "01111"]);
  def("e", ["00000", "00000", "01110", "10001", "11111", "10000", "01110"]);
  def("f", ["00110", "01001", "01000", "11100", "01000", "01000", "01000"]);
  def("g", ["00000", "01111", "10001", "10001", "01111", "00001", "01110"]);
  def("h", ["10000", "10000", "11110", "10001", "10001", "10001", "10001"]);
  def("i", ["00100", "00000", "01100", "00100", "00100", "00100", "01110"]);
  def("j", ["00010", "00000", "00110", "00010", "00010", "10010", "01100"]);
  def("k", ["10000", "10000", "10010", "10100", "11000", "10100", "10010"]);
  def("l", ["01100", "00100", "00100", "00100", "00100", "00100", "01110"]);
  def("m", ["00000", "00000", "11010", "10101", "10101", "10101", "10101"]);
  def("n", ["00000", "00000", "11110", "10001", "10001", "10001", "10001"]);
  def("o", ["00000", "00000", "01110", "10001", "10001", "10001", "01110"]);
  def("p", ["00000", "00000", "11110", "10001", "11110", "10000", "10000"]);
  def("q", ["00000", "00000", "01111", "10001", "01111", "00001", "00001"]);
  def("r", ["00000", "00000", "10110", "11001", "10000", "10000", "10000"]);
  def("s", ["00000", "00000", "01111", "10000", "01110", "00001", "11110"]);
  def("t", ["01000", "01000", "11100", "01000", "01000", "01001", "00110"]);
  def("u", ["00000", "00000", "10001", "10001", "10001", "10011", "01101"]);
  def("v", ["00000", "00000", "10001", "10001", "10001", "01010", "00100"]);
  def("w", ["00000", "00000", "10001", "10001", "10101", "10101", "01010"]);
  def("x", ["00000", "00000", "10001", "01010", "00100", "01010", "10001"]);
  def("y", ["00000", "00000", "10001", "10001", "01111", "00001", "01110"]);
  def("z", ["00000", "00000", "11111", "00010", "00100", "01000", "11111"]);
  def("0", ["01110", "10001", "10011", "10101", "11001", "10001", "01110"]);
  def("1", ["00100", "01100", "00100", "00100", "00100", "00100", "01110"]);
  def("2", ["01110", "10001", "00001", "00010", "00100", "01000", "11111"]);
  def("3", ["11111", "00010", "00100", "00010", "00001", "10001", "01110"]);
  def("4", ["00010", "00110", "01010", "10010", "11111", "00010", "00010"]);
  def("5", ["11111", "10000", "11110", "00001", "00001", "10001", "01110"]);
  def("6", ["00110", "01000", "10000", "11110", "10001", "10001", "01110"]);
  def("7", ["11111", "00001", "00010", "00100", "01000", "01000", "01000"]);
  def("8", ["01110", "10001", "10001", "01110", "10001", "10001", "01110"]);
  def("9", ["01110", "10001", "10001", "01111", "00001", "00010", "01100"]);
  def(" ", ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]);
  def(".", ["00000", "00000", "00000", "00000", "00000", "01100", "01100"]);
  def(",", ["00000", "00000", "00000", "00000", "01100", "00100", "01000"]);
  def("!", ["00100", "00100", "00100", "00100", "00100", "00000", "00100"]);
  def("?", ["01110", "10001", "00001", "00010", "00100", "00000", "00100"]);
  def("'", ["00100", "00100", "01000", "00000", "00000", "00000", "00000"]);
  def("-", ["00000", "00000", "00000", "01110", "00000", "00000", "00000"]);
  def(":", ["00000", "01100", "01100", "00000", "01100", "01100", "00000"]);
  def(";", ["00000", "01100", "01100", "00000", "01100", "00100", "01000"]);
  def("/", ["00001", "00001", "00010", "00100", "01000", "10000", "10000"]);
  def("(", ["00010", "00100", "01000", "01000", "01000", "00100", "00010"]);
  def(")", ["01000", "00100", "00010", "00010", "00010", "00100", "01000"]);
  def("♂", ["00111", "00011", "00101", "01000", "11100", "10100", "11100"]);
  def("♀", ["01100", "10010", "10010", "01100", "00100", "01110", "00100"]);
  def("é", ["00010", "00100", "01110", "10001", "11111", "10000", "01110"]);
  def("×", ["00000", "10001", "01010", "00100", "01010", "10001", "00000"]);
  def("…", ["00000", "00000", "00000", "00000", "00000", "00000", "10101"]);
  def("▶", ["10000", "11000", "11100", "11110", "11100", "11000", "10000"]);
  def("▼", ["00000", "00000", "11111", "01110", "00100", "00000", "00000"]);
  def("&", ["01100", "10010", "10100", "01000", "10101", "10010", "01101"]);
  def("$", ["00100", "01111", "10100", "01110", "00101", "11110", "00100"]);
  def("+", ["00000", "00100", "00100", "11111", "00100", "00100", "00000"]);
  def("%", ["11001", "11010", "00010", "00100", "01000", "01011", "10011"]);
  def("♥", ["00000", "01010", "11111", "11111", "01110", "00100", "00000"]);

  const CHAR_W = 6, CHAR_H = 8;

  const UI = {
    CHAR_W, CHAR_H,
    text(ctx, str, x, y, color = "#21232b") {
      ctx.fillStyle = color;
      let cx = x;
      for (const ch of String(str)) {
        const glyph = G[ch] || G["?"];
        for (let ry = 0; ry < 7; ry++) {
          const bits = glyph[ry];
          for (let rx = 0; rx < 5; rx++) {
            if (bits & (1 << (4 - rx))) ctx.fillRect(cx + rx, y + ry, 1, 1);
          }
        }
        cx += CHAR_W;
      }
      return cx;
    },
    textWidth(str) {
      return String(str).length * CHAR_W;
    },
    // classic white box with dark double border
    drawBox(ctx, x, y, w, h) {
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#21232b";
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, h - 2);
      ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
      ctx.fillStyle = "#6a7a9a";
      ctx.fillRect(x + 3, y + 3, w - 6, 1);
      ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
      ctx.fillRect(x + 3, y + 3, 1, h - 6);
      ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
    },
    // hp bar with color thresholds
    drawHPBar(ctx, x, y, w, ratio) {
      ctx.fillStyle = "#21232b";
      ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(x + 1, y + 1, w - 2, 3);
      const fillW = Math.round((w - 2) * Math.max(0, Math.min(1, ratio)));
      ctx.fillStyle = ratio > 0.5 ? "#48c848" : ratio > 0.2 ? "#e8c030" : "#e04838";
      if (fillW > 0) ctx.fillRect(x + 1, y + 1, fillW, 3);
    },
  };

  // ---------- dialog / menu system ----------
  const BOX_H = 44;

  const Dialog = {
    queue: [],        // pages: each page = array of lines
    lineBuf: [],      // currently displayed (partially typed) lines
    charCount: 0,     // typewriter progress (total chars revealed on page)
    waiting: false,   // page fully typed, waiting for A
    resolveSay: null,
    menu: null,       // {options, index, resolve, cancelable, x, y, w, prompt}
    blink: 0,

    get active() {
      return this.queue.length > 0 || this.resolveSay !== null || this.menu !== null;
    },

    wrap(text, maxChars = 36) {
      const out = [];
      for (const para of String(text).split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          if (line.length === 0) line = word;
          else if ((line + " " + word).length <= maxChars) line += " " + word;
          else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    },

    say(text) {
      return new Promise((resolve) => {
        const lines = this.wrap(text);
        const pages = [];
        for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
        this.queue.push({ pages, resolve });
        if (!this.resolveSay) this._nextMessage();
      });
    },

    _nextMessage() {
      const msg = this.queue[0];
      if (!msg) return;
      this.resolveSay = msg.resolve;
      this.pages = msg.pages;
      this.pageIdx = 0;
      this._startPage();
    },

    _startPage() {
      this.lineBuf = this.pages[this.pageIdx] || [""];
      this.charCount = 0;
      this.waiting = false;
    },

    ask(options, opts = {}) {
      return new Promise((resolve) => {
        const w = Math.max(...options.map((o) => UI.textWidth(o))) + 26;
        this.menu = {
          options,
          index: opts.defaultIndex || 0,
          resolve,
          cancelable: opts.cancelable !== false,
          x: opts.x !== undefined ? opts.x : 240 - w - 4,
          y: opts.y !== undefined ? opts.y : (opts.aboveBox ? 160 - BOX_H - options.length * 14 - 12 : 4),
          w,
        };
      });
    },

    update() {
      this.blink = (this.blink + 1) % 60;
      if (this.resolveSay && !this.waiting) {
        const total = this.lineBuf.join("").length;
        this.charCount = Math.min(total, this.charCount + 2);
        if (this.charCount >= total) this.waiting = true;
      }
    },

    handleInput() {
      const I = window.Input;
      // menu takes priority
      if (this.menu) {
        const m = this.menu;
        if (I.pressed("up")) { m.index = (m.index + m.options.length - 1) % m.options.length; AudioSys.sfx("menu"); }
        if (I.pressed("down")) { m.index = (m.index + 1) % m.options.length; AudioSys.sfx("menu"); }
        if (I.pressed("a")) {
          AudioSys.sfx("confirm");
          this.menu = null;
          m.resolve(m.index);
        } else if (I.pressed("b") && m.cancelable) {
          AudioSys.sfx("deny");
          this.menu = null;
          m.resolve(-1);
        }
        return;
      }
      if (this.resolveSay) {
        if (I.pressed("a") || I.pressed("b")) {
          if (!this.waiting) {
            this.charCount = this.lineBuf.join("").length; // fast-forward
          } else if (this.pageIdx < this.pages.length - 1) {
            this.pageIdx++;
            this._startPage();
          } else {
            const resolve = this.resolveSay;
            this.resolveSay = null;
            this.queue.shift();
            resolve();
            if (this.queue.length > 0) this._nextMessage();
          }
        }
      }
    },

    draw(ctx) {
      if (this.resolveSay) {
        UI.drawBox(ctx, 0, 160 - BOX_H, 240, BOX_H);
        let remaining = this.charCount;
        for (let i = 0; i < this.lineBuf.length; i++) {
          const line = this.lineBuf[i];
          const shown = line.slice(0, Math.max(0, remaining));
          remaining -= line.length;
          UI.text(ctx, shown, 8, 160 - BOX_H + 10 + i * 14);
        }
        if (this.waiting && this.blink < 40) {
          UI.text(ctx, "▼", 240 - 16, 160 - 13);
        }
      }
      if (this.menu) {
        const m = this.menu;
        const h = m.options.length * 14 + 10;
        UI.drawBox(ctx, m.x, m.y, m.w, h);
        m.options.forEach((opt, i) => {
          UI.text(ctx, opt, m.x + 16, m.y + 7 + i * 14);
          if (i === m.index) UI.text(ctx, "▶", m.x + 7, m.y + 7 + i * 14);
        });
      }
    },
  };

  window.UI = UI;
  window.Dialog = Dialog;
})();
