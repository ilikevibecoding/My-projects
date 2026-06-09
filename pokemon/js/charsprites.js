// Procedural 16x16 overworld character sprites (GB style), generated from
// text templates with per-variant palettes.
(function () {
  "use strict";

  // o outline, h hat/hair, s skin, e eye, c shirt, p pants, b shoes, w accent
  const T = {
    down_stand: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..oossssssssо...",
      "..osessssseso...",
      "..ossssssssso...",
      "...ossssssso....",
      "..occcccccco....",
      ".osccccccccso...",
      ".osccccccccso...",
      "..occcccccco....",
      "...oppppppo.....",
      "...oppooppo.....",
      "...obbo.obbo....",
      "....oo...oo.....",
    ],
    down_walk: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..oossssssssо...",
      "..osessssseso...",
      "..ossssssssso...",
      "...ossssssso....",
      "..occcccccco....",
      "..occcccccccso..",
      ".osccccccccо....",
      "..occcccccco....",
      "...opppppppo....",
      "...oppo.oppo....",
      "..obbo..oppo....",
      "...oo...obbo....",
    ],
    up_stand: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "...ohhhhhhhho...",
      "..occcccccco....",
      ".osccccccccso...",
      ".osccccccccso...",
      "..occcccccco....",
      "...oppppppo.....",
      "...oppooppo.....",
      "...obbo.obbo....",
      "....oo...oo.....",
    ],
    up_walk: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "...ohhhhhhhho...",
      "..occcccccco....",
      "..occcccccccso..",
      ".osccccccccо....",
      "..occcccccco....",
      "...opppppppo....",
      "...oppo.oppo....",
      "..obbo..oppo....",
      "...oo...obbo....",
    ],
    left_stand: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..oosssshhhhо...",
      "..osessshhhho...",
      "..ossssshhhho...",
      "...osssshhho....",
      "...occccccco....",
      "..osccccccco....",
      "..osccccccco....",
      "...occccccco....",
      "....opppppo.....",
      "....opppppo.....",
      "....obbobbo.....",
      ".....oo.oo......",
    ],
    left_walk: [
      "....oooooooo....",
      "...ohhhhhhhho...",
      "..ohhhhhhhhhho..",
      "..ohhhhhhhhhho..",
      "..oosssshhhhо...",
      "..osessshhhho...",
      "..ossssshhhho...",
      "...osssshhho....",
      "...occccccco....",
      "..osccccccco....",
      "..osccccccco....",
      "...occccccco....",
      "...opppopppo....",
      "..oppo..oppo....",
      "..obbo..obbo....",
      "...oo....oo.....",
    ],
  };

  // Normalize templates: fix any accidental wide chars, enforce 16 chars.
  for (const key of Object.keys(T)) {
    T[key] = T[key].map((row) => {
      let r = row.replace(/о/g, "o"); // just in case of lookalike chars
      if (r.length < 16) r = r + ".".repeat(16 - r.length);
      return r.slice(0, 16);
    });
  }

  const SKIN = "#f0c8a0";
  const VARIANTS = {
    player:    { h: "#d23b3b", c: "#d23b3b", p: "#3b56a8", b: "#222831", s: SKIN },
    rival:     { h: "#8a5a30", c: "#7a4a9a", p: "#46485e", b: "#222831", s: SKIN },
    professor: { h: "#9a9a9a", c: "#f0f0f0", p: "#6a6a7a", b: "#3a3a3a", s: SKIN },
    nurse:     { h: "#f08ab4", c: "#fbe9ef", p: "#f4b8ce", b: "#b46a86", s: SKIN },
    clerk:     { h: "#3a3a3a", c: "#3b6fd2", p: "#46485e", b: "#222831", s: SKIN },
    boy:       { h: "#3a3a3a", c: "#3f9a4e", p: "#7a5a3a", b: "#222831", s: SKIN },
    girl:      { h: "#c08030", c: "#e06a8a", p: "#f0f0f0", b: "#a04a5a", s: SKIN },
    oldman:    { h: "#c8c8c8", c: "#8a6a4a", p: "#5a5a6a", b: "#222831", s: "#e0b890" },
    leader:    { h: "#4a3520", c: "#d2823b", p: "#5a4632", b: "#222831", s: "#d8aa80" },
    bugcatcher:{ h: "#e8d048", c: "#f0f0f0", p: "#4a6ad2", b: "#222831", s: SKIN },
    lass:      { h: "#7a4a20", c: "#5ab4e0", p: "#f0f0f0", b: "#a04a5a", s: SKIN },
  };

  function renderTemplate(rows, pal, mirror) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext("2d");
    const colors = {
      o: "#21232b", e: "#21232b",
      h: pal.h, c: pal.c, p: pal.p, b: pal.b, s: pal.s, w: "#f8f8f8",
    };
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = rows[y][x];
        if (ch === "." || !colors[ch]) continue;
        ctx.fillStyle = colors[ch];
        ctx.fillRect(mirror ? 15 - x : x, y, 1, 1);
      }
    }
    return c;
  }

  const CharSprites = {
    sheets: {}, // variant -> {down:[stand,stepA,stepB], up:[...], left:[stand,step], right:[stand,step]}

    init() {
      for (const [name, pal] of Object.entries(VARIANTS)) {
        this.sheets[name] = {
          down: [
            renderTemplate(T.down_stand, pal, false),
            renderTemplate(T.down_walk, pal, false),
            renderTemplate(T.down_walk, pal, true),
          ],
          up: [
            renderTemplate(T.up_stand, pal, false),
            renderTemplate(T.up_walk, pal, false),
            renderTemplate(T.up_walk, pal, true),
          ],
          left: [
            renderTemplate(T.left_stand, pal, false),
            renderTemplate(T.left_walk, pal, false),
          ],
          right: [
            renderTemplate(T.left_stand, pal, true),
            renderTemplate(T.left_walk, pal, true),
          ],
        };
      }
    },

    // frame: 0 stand; walking cycles handled by caller
    draw(ctx, variant, dir, frame, x, y) {
      const sheet = this.sheets[variant] || this.sheets.boy;
      const frames = sheet[dir] || sheet.down;
      const img = frames[Math.min(frame, frames.length - 1)];
      ctx.drawImage(img, Math.round(x), Math.round(y));
    },
  };

  window.CharSprites = CharSprites;
})();
