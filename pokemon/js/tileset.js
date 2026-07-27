// Procedurally drawn 16x16 GB-style tiles. No external art assets needed,
// which keeps the game fully offline-capable and licence-clean.
(function () {
  "use strict";

  const TILE = 16;

  // ---------- tiny pixel-art helpers ----------
  function maker(draw) {
    return draw; // (ctx, ox, oy, frame) => void
  }

  function fillTile(ctx, ox, oy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(ox, oy, TILE, TILE);
  }

  function px(ctx, ox, oy, x, y, color, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  }

  // deterministic speckle
  function speckle(ctx, ox, oy, color, mod, salt = 0) {
    ctx.fillStyle = color;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if ((x * 7 + y * 13 + salt + x * y) % mod === 0) ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  // Draw a 16-row template where each char maps to a palette color ('.' = skip).
  function template(ctx, ox, oy, rows, pal) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === ".") continue;
        const color = pal[c];
        if (!color) continue;
        ctx.fillRect(ox + x, oy + y, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  // ---------- palette ----------
  const P = {
    grass1: "#9bd45e", grass2: "#8cc653", grass3: "#5f9a3c", grassDark: "#3f7028",
    path1: "#e8d6a0", path2: "#d9c389", pathEdge: "#b89b62",
    water1: "#4f8fe0", water2: "#3b78c8", waterHi: "#9cc6f2",
    trunk: "#7a5230", trunkDark: "#54371e",
    leaf1: "#3e8a3a", leaf2: "#2f6e2c", leaf3: "#56a850", leafHi: "#79c473",
    rock1: "#b0a89a", rock2: "#8d8478", rock3: "#6b6358",
    fence: "#c9a978", fenceDark: "#92703f",
    roofRed1: "#d8604e", roofRed2: "#b04434", roofBlue1: "#5a7fd6", roofBlue2: "#3f5ea8",
    roofTan1: "#d8a04e", roofTan2: "#b07c34",
    wall1: "#efe6d2", wall2: "#d8cdb4", wallEdge: "#9a8d6f",
    door1: "#8a5a30", door2: "#6b421f",
    win1: "#79b1e8", win2: "#4d7fc0",
    floorWood1: "#d9b277", floorWood2: "#c79c5e",
    floorLab1: "#dcdfe6", floorLab2: "#c4c9d4",
    wallIn1: "#b9aa8c", wallIn2: "#998a6c",
    counter1: "#caa66a", counter2: "#a37e44",
    rug1: "#7fd6c2", rug2: "#56b3a0",
    dark: "#222222", white: "#f8f8f8",
    sand1: "#efe2b0", sand2: "#e0cf94",
    ledge: "#7fb648", ledgeDark: "#54822c",
    mach1: "#aab4c8", mach2: "#7e8aa4", machLight: "#e05a5a", machLight2: "#5ae07a",
    tv1: "#5a5f6e", tv2: "#3a3e4a", tvScreen: "#8fd0ff",
    bed1: "#e07a8a", bed2: "#c05a6a", bedSheet: "#f4f4f4",
    book1: "#9a4a3a", book2: "#3a6a9a", book3: "#4a9a5a", shelf: "#8a6a40", shelfDark: "#5e4527",
    plant1: "#4a9a4a", plantPot: "#b06a3a",
    pcBody: "#c8ccd8", pcScreen: "#63d68f",
    flowerR: "#e84a4a", flowerY: "#f0d048",
    gym1: "#cfc4ac", gym2: "#b3a587",
  };

  // ---------- tile painters ----------
  const PAINTERS = {
    // grass
    ".": maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 7);
      speckle(c, x, y, P.grass3, 23, 5);
    }),
    // tall grass
    t: maker((c, x, y) => {
      fillTile(c, x, y, P.grass2);
      speckle(c, x, y, P.grass1, 11);
      const pal = { g: P.grass3, d: P.grassDark };
      template(c, x, y, [
        "................",
        ".d..g...d...g...",
        ".dg.dg..dg..dg..",
        ".gd.gd.ggd..gd..",
        "ggdggddggddggdd.",
        "gddgddgddgdgddg.",
        "................",
        "..g...d...g..d..",
        ".dg..dg..dg..dg.",
        ".gd.ggd..gd.ggd.",
        "ggddggddggddggdd",
        "gddgddgddgddgddg",
        "................",
        ".d...g...d...g..",
        "gddgddgddgddgdd.",
        "dgddgddgddgddgg.",
      ], pal);
    }),
    // flowers (animated sway)
    f: maker((c, x, y, frame) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      const fx = frame % 2 === 0 ? 0 : 1;
      [[3, 4, P.flowerR], [10, 9, P.flowerY], [4, 11, P.flowerY], [11, 3, P.flowerR]].forEach(([bx, by, col], i) => {
        const ox2 = (i % 2 === 0 ? fx : -fx);
        px(c, x, y, bx + ox2, by, col, 2, 2);
        px(c, x, y, bx + ox2 + 1, by - 1, P.white, 1, 1);
        px(c, x, y, bx + ox2, by + 2, P.grass3, 1, 2);
      });
    }),
    // path
    ",": maker((c, x, y) => {
      fillTile(c, x, y, P.path1);
      speckle(c, x, y, P.path2, 6, 3);
      speckle(c, x, y, P.pathEdge, 29, 11);
    }),
    // sand
    n: maker((c, x, y) => {
      fillTile(c, x, y, P.sand1);
      speckle(c, x, y, P.sand2, 5, 7);
    }),
    // water (animated)
    w: maker((c, x, y, frame) => {
      fillTile(c, x, y, frame % 2 ? P.water1 : P.water2);
      const off = frame % 2 ? 0 : 2;
      c.fillStyle = P.waterHi;
      for (let i = 0; i < 3; i++) {
        c.fillRect(x + 1 + i * 5 + off, y + 3 + i * 4, 3, 1);
        c.fillRect(x + 3 + i * 4 - off, y + 9 + ((i * 5) % 4), 3, 1);
      }
      c.fillStyle = frame % 2 ? P.water2 : P.water1;
      for (let i = 0; i < 2; i++) c.fillRect(x + 2 + i * 7 - off, y + 6 + i * 6, 4, 1);
    }),
    // tree
    T: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      template(c, x, y, [
        "....ooooooo.....",
        "..oollhhllloo...",
        ".ollhhllllllo...",
        ".olhhlllldllo...",
        "ollhlllllldllo..",
        "olhlllhhllldlo..",
        "ollllhhllllllo..",
        "olllllllddlllo..",
        ".ollhhllldllo...",
        ".ollhlllllloo...",
        "..ooollllloo....",
        "....obbbbo......",
        "....obddbo......",
        "....obbbbo......",
        "...oobbbboo.....",
        "................",
      ], { o: P.trunkDark, l: P.leaf1, h: P.leafHi, d: P.leaf2, b: P.trunk });
    }),
    // pine tree
    p2: null,
    P: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      template(c, x, y, [
        ".......oo.......",
        "......olho......",
        ".....ollldo.....",
        "....olllllo.....",
        "....ollhlldo....",
        "...olllllllo....",
        "...ollhllldo....",
        "..olllllllldo...",
        "..ollhlllllldo..",
        ".ollllllllllldo.",
        ".olllhllllllldo.",
        "ollllllllllllldo",
        "......obbo......",
        "......obbo......",
        ".....oobboo.....",
        "................",
      ], { o: P.trunkDark, l: P.leaf2, h: P.leaf3, d: P.grassDark, b: P.trunk });
    }),
    // ledge (south jump)
    l: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      px(c, x, y, 0, 8, P.ledge, 16, 4);
      px(c, x, y, 0, 12, P.ledgeDark, 16, 2);
      px(c, x, y, 0, 14, P.grassDark, 16, 1);
      for (let i = 0; i < 4; i++) px(c, x, y, 1 + i * 4, 9, P.leafHi, 2, 1);
    }),
    // fence
    F: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      px(c, x, y, 1, 4, P.fence, 3, 9);
      px(c, x, y, 12, 4, P.fence, 3, 9);
      px(c, x, y, 0, 6, P.fence, 16, 2);
      px(c, x, y, 0, 10, P.fence, 16, 2);
      px(c, x, y, 1, 12, P.fenceDark, 3, 1);
      px(c, x, y, 12, 12, P.fenceDark, 3, 1);
      px(c, x, y, 0, 8, P.fenceDark, 16, 1);
    }),
    // rock
    r: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      template(c, x, y, [
        "................",
        "................",
        "....ooooo.......",
        "...orrhhro......",
        "..orrhhrrro.....",
        ".orrrrrrrrro....",
        ".orrrrrddrro....",
        "orrhrrrrrddro...",
        "orrrrrrrrddro...",
        "orrrrdddrrrro...",
        ".orrrrrrddro....",
        "..oorrrddoo.....",
        "....ooooo.......",
        "................",
        "................",
        "................",
      ], { o: P.rock3, r: P.rock1, h: P.white, d: P.rock2 });
    }),
    // asphalt street
    a: maker((c, x, y) => {
      fillTile(c, x, y, "#6e7178");
      speckle(c, x, y, "#7b7e86", 9, 3);
      speckle(c, x, y, "#5f626a", 23, 7);
    }),
    // crosswalk stripes on asphalt
    z: maker((c, x, y) => {
      fillTile(c, x, y, "#6e7178");
      speckle(c, x, y, "#5f626a", 23, 7);
      c.fillStyle = "#e8e8e0";
      for (let i = 0; i < 3; i++) c.fillRect(x + 1, y + 2 + i * 5, 14, 3);
    }),
    // concrete building wall
    G: maker((c, x, y) => {
      fillTile(c, x, y, "#b9bcc4");
      c.fillStyle = "#a6a9b2";
      c.fillRect(x, y + 7, 16, 1);
      c.fillRect(x + 7, y, 1, 7);
      c.fillRect(x + 3, y + 8, 1, 8);
      c.fillRect(x + 11, y + 8, 1, 8);
      speckle(c, x, y, "#c6c9d0", 17, 5);
      px(c, x, y, 0, 14, "#83868e", 16, 2);
    }),
    // concrete flat roof
    q: maker((c, x, y) => {
      fillTile(c, x, y, "#8d909a");
      speckle(c, x, y, "#9b9ea8", 11, 2);
      px(c, x, y, 0, 0, "#7a7d86", 16, 2);
      px(c, x, y, 0, 13, "#a4a7b0", 16, 1);
    }),
    // office window (on concrete)
    O: maker((c, x, y) => {
      fillTile(c, x, y, "#b9bcc4");
      px(c, x, y, 0, 14, "#83868e", 16, 2);
      px(c, x, y, 1, 2, "#5a6a86", 14, 11);
      px(c, x, y, 2, 3, "#9cc6f2", 12, 9);
      px(c, x, y, 3, 4, "#cfe4fa", 4, 3);
      px(c, x, y, 8, 3, "#7fa8d8", 1, 9);
      px(c, x, y, 2, 8, "#7fa8d8", 12, 1);
    }),
    // arcade neon sign
    E: maker((c, x, y) => {
      fillTile(c, x, y, "#3a2a52");
      px(c, x, y, 1, 1, "#241a36", 14, 14);
      const cols = ["#ff5a8a", "#ffd048", "#5af0a0", "#5ab4ff"];
      for (let i = 0; i < 4; i++) {
        px(c, x, y, 2 + i * 3, 3, cols[i], 2, 2);
        px(c, x, y, 2 + ((i + 2) % 4) * 3, 11, cols[(i + 1) % 4], 2, 2);
      }
      // "A" letter
      px(c, x, y, 6, 6, "#f8f8f8", 4, 1);
      px(c, x, y, 6, 7, "#f8f8f8", 1, 4);
      px(c, x, y, 9, 7, "#f8f8f8", 1, 4);
      px(c, x, y, 7, 8, "#f8f8f8", 2, 1);
      px(c, x, y, 0, 14, "#83868e", 16, 2);
    }),
    // museum sign (column motif)
    J: maker((c, x, y) => {
      fillTile(c, x, y, "#cfc8b4");
      px(c, x, y, 0, 14, "#83868e", 16, 2);
      px(c, x, y, 2, 2, "#a89f86", 12, 2);
      for (let i = 0; i < 3; i++) px(c, x, y, 3 + i * 4, 5, "#a89f86", 2, 8);
      px(c, x, y, 2, 12, "#a89f86", 12, 1);
    }),
    // bus stop shelter
    U: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      px(c, x, y, 1, 2, "#d8a04e", 14, 3); // roof
      px(c, x, y, 2, 5, "#5a6a86", 2, 9);  // posts
      px(c, x, y, 12, 5, "#5a6a86", 2, 9);
      px(c, x, y, 3, 6, "#9cc6f2", 9, 4);  // glass
      px(c, x, y, 4, 10, "#8a8d96", 8, 2); // bench
      // bus symbol on the roof
      px(c, x, y, 6, 3, "#f8f8f8", 4, 1);
    }),
    // cave wall
    K: maker((c, x, y) => {
      fillTile(c, x, y, "#5a4f48");
      c.fillStyle = "#473e38";
      c.fillRect(x, y + 5, 16, 1);
      c.fillRect(x, y + 11, 16, 1);
      c.fillRect(x + 5, y, 1, 5);
      c.fillRect(x + 11, y + 6, 1, 5);
      c.fillRect(x + 3, y + 12, 1, 4);
      speckle(c, x, y, "#6b5f56", 13, 4);
      px(c, x, y, 0, 15, "#332c27", 16, 1);
    }),
    // cave floor
    ":": maker((c, x, y) => {
      fillTile(c, x, y, "#8a7d6e");
      speckle(c, x, y, "#7b6f61", 7, 2);
      speckle(c, x, y, "#9c8e7d", 17, 9);
      speckle(c, x, y, "#6b6054", 29, 5);
    }),
    // crystal (solid, decorative)
    "*": maker((c, x, y) => {
      PAINTERS[":"](c, x, y);
      template(c, x, y, [
        "................",
        "................",
        "......o.........",
        ".....obo..o.....",
        ".....obdo.obo...",
        "....obbdoobdo...",
        "....obddooddo...",
        "...obbddobddo...",
        "...obdddobdddo..",
        "...oddddoodddo..",
        "....oooo..ooo...",
        "................",
        "................",
        "................",
        "................",
        "................",
      ], { o: "#3a3160", b: "#9c8ee0", d: "#6e5fc0" });
    }),
    // dock planks (walkable)
    d: maker((c, x, y) => {
      fillTile(c, x, y, "#c79c5e");
      c.fillStyle = "#a37c42";
      for (let i = 0; i < 4; i++) c.fillRect(x, y + 3 + i * 4, 16, 1);
      c.fillRect(x + 1, y, 1, 16);
      c.fillRect(x + 14, y, 1, 16);
      speckle(c, x, y, "#b78c50", 19, 3);
    }),
    // puddle (walkable, gym 2 deco)
    u: maker((c, x, y, frame) => {
      PAINTERS["-"](c, x, y);
      c.fillStyle = frame % 2 ? "#9cc6f2" : "#7fb2e8";
      c.beginPath();
      c.ellipse(x + 8, y + 8, 6, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#c4ddf6";
      c.fillRect(x + 5, y + 6, 3, 1);
    }),
    // indoor boulder (gym)
    k: maker((c, x, y) => {
      PAINTERS["="](c, x, y);
      template(c, x, y, [
        "................",
        "................",
        "....ooooo.......",
        "...orrhhro......",
        "..orrhhrrro.....",
        ".orrrrrrrrro....",
        ".orrrrrddrro....",
        "orrhrrrrrddro...",
        "orrrrrrrrddro...",
        "orrrrdddrrrro...",
        ".orrrrrrddro....",
        "..oorrrddoo.....",
        "....ooooo.......",
        "................",
        "................",
        "................",
      ], { o: P.rock3, r: P.rock1, h: P.white, d: P.rock2 });
    }),
    // sign
    s: maker((c, x, y) => {
      fillTile(c, x, y, P.grass1);
      speckle(c, x, y, P.grass2, 9);
      px(c, x, y, 2, 3, P.fenceDark, 12, 8);
      px(c, x, y, 3, 4, P.fence, 10, 6);
      px(c, x, y, 4, 5, P.fenceDark, 8, 1);
      px(c, x, y, 4, 7, P.fenceDark, 8, 1);
      px(c, x, y, 7, 11, P.fenceDark, 2, 4);
    }),
    // building parts
    R: maker((c, x, y) => roof(c, x, y, P.roofRed1, P.roofRed2)),
    Y: maker((c, x, y) => roof(c, x, y, P.roofBlue1, P.roofBlue2)),
    A: maker((c, x, y) => roof(c, x, y, P.roofTan1, P.roofTan2)),
    W: maker((c, x, y) => {
      fillTile(c, x, y, P.wall1);
      speckle(c, x, y, P.wall2, 13, 3);
      px(c, x, y, 0, 14, P.wallEdge, 16, 2);
      px(c, x, y, 0, 0, P.wall2, 16, 1);
    }),
    D: maker((c, x, y) => {
      fillTile(c, x, y, P.wall1);
      px(c, x, y, 0, 14, P.wallEdge, 16, 2);
      px(c, x, y, 3, 2, P.trunkDark, 10, 13);
      px(c, x, y, 4, 3, P.door1, 8, 12);
      px(c, x, y, 5, 4, P.door2, 6, 5);
      px(c, x, y, 10, 9, P.path1, 1, 2);
    }),
    o: maker((c, x, y) => {
      fillTile(c, x, y, P.wall1);
      speckle(c, x, y, P.wall2, 13, 3);
      px(c, x, y, 0, 14, P.wallEdge, 16, 2);
      px(c, x, y, 2, 3, P.wallEdge, 12, 9);
      px(c, x, y, 3, 4, P.win1, 10, 7);
      px(c, x, y, 4, 5, P.waterHi, 3, 2);
      px(c, x, y, 7, 4, P.win2, 1, 7);
    }),
    // pokecenter sign (P), mart sign (M), gym sign (g) on walls
    "+": maker((c, x, y) => {
      fillTile(c, x, y, P.wall1);
      px(c, x, y, 0, 14, P.wallEdge, 16, 2);
      px(c, x, y, 2, 2, P.white, 12, 11);
      px(c, x, y, 3, 3, P.roofRed1, 10, 9);
      px(c, x, y, 6, 4, P.white, 4, 7);
      px(c, x, y, 4, 6, P.white, 8, 3);
      px(c, x, y, 7, 6, P.roofRed2, 2, 2);
    }),
    M: maker((c, x, y) => {
      fillTile(c, x, y, P.wall1);
      px(c, x, y, 0, 14, P.wallEdge, 16, 2);
      px(c, x, y, 2, 2, P.roofBlue2, 12, 11);
      px(c, x, y, 3, 3, P.roofBlue1, 10, 9);
      template(c, x, y, [
        "................",
        "................",
        "................",
        "................",
        "....w......w....",
        "....ww....ww....",
        "....w.w..w.w....",
        "....w..ww..w....",
        "....w......w....",
        "....w......w....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
      ], { w: P.white });
    }),
    g: maker((c, x, y) => {
      // gym: stone-brick wall
      fillTile(c, x, y, P.gym1);
      c.fillStyle = P.gym2;
      c.fillRect(x, y + 4, 16, 1);
      c.fillRect(x, y + 9, 16, 1);
      c.fillRect(x, y + 14, 16, 1);
      c.fillRect(x + 4, y, 1, 4);
      c.fillRect(x + 11, y + 5, 1, 4);
      c.fillRect(x + 6, y + 10, 1, 4);
      speckle(c, x, y, "#dcd2bc", 19, 6);
      px(c, x, y, 0, 15, P.wallEdge, 16, 1);
    }),
    // interior
    "#": maker((c, x, y) => {
      fillTile(c, x, y, P.wallIn1);
      speckle(c, x, y, P.wallIn2, 13, 5);
      px(c, x, y, 0, 12, P.wallIn2, 16, 1);
      px(c, x, y, 0, 13, P.shelfDark, 16, 3);
    }),
    "=": maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      c.fillStyle = P.floorWood2;
      for (let i = 0; i < 4; i++) c.fillRect(x, y + i * 4 + 3, 16, 1);
      c.fillRect(x + 7, y, 1, 16);
    }),
    "-": maker((c, x, y) => {
      fillTile(c, x, y, P.floorLab1);
      c.fillStyle = P.floorLab2;
      c.fillRect(x, y + 7, 16, 1);
      c.fillRect(x + 7, y, 1, 16);
      speckle(c, x, y, "#eef1f6", 17, 9);
    }),
    c: maker((c, x, y) => {
      fillTile(c, x, y, P.counter1);
      px(c, x, y, 0, 0, P.white, 16, 3);
      px(c, x, y, 0, 3, P.counter2, 16, 2);
      px(c, x, y, 0, 12, P.counter2, 16, 4);
      speckle(c, x, y, P.counter2, 21, 4);
    }),
    B: maker((c, x, y) => {
      fillTile(c, x, y, P.shelf);
      px(c, x, y, 0, 0, P.shelfDark, 16, 1);
      px(c, x, y, 0, 15, P.shelfDark, 16, 1);
      const cols = [P.book1, P.book2, P.book3];
      for (let s = 0; s < 2; s++) {
        px(c, x, y, 1, 2 + s * 7, "#3a2c18", 14, 6);
        for (let i = 0; i < 6; i++) px(c, x, y, 2 + i * 2, 3 + s * 7, cols[(i + s) % 3], 2, 4);
        px(c, x, y, 0, 8 + s * 7 - 1, P.shelfDark, 16, 1);
      }
    }),
    b: maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      px(c, x, y, 1, 0, P.bed2, 14, 16);
      px(c, x, y, 2, 1, P.bed1, 12, 14);
      px(c, x, y, 2, 1, P.bedSheet, 12, 5);
      px(c, x, y, 3, 2, "#dadada", 10, 2);
    }),
    x: maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      c.fillStyle = P.floorWood2;
      for (let i = 0; i < 4; i++) c.fillRect(x, y + i * 4 + 3, 16, 1);
      px(c, x, y, 1, 2, P.shelfDark, 14, 11);
      px(c, x, y, 2, 3, P.fence, 12, 8);
      px(c, x, y, 2, 11, P.shelf, 12, 2);
    }),
    h: maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      c.fillStyle = P.floorWood2;
      for (let i = 0; i < 4; i++) c.fillRect(x, y + i * 4 + 3, 16, 1);
      px(c, x, y, 4, 4, P.shelfDark, 8, 8);
      px(c, x, y, 5, 5, P.roofRed1, 6, 6);
    }),
    V: maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      px(c, x, y, 1, 2, P.tv2, 14, 11);
      px(c, x, y, 2, 3, P.tv1, 12, 9);
      px(c, x, y, 3, 4, P.tvScreen, 10, 6);
      px(c, x, y, 4, 5, P.white, 3, 2);
      px(c, x, y, 5, 13, P.tv2, 6, 2);
    }),
    p: maker((c, x, y) => {
      fillTile(c, x, y, P.floorWood1);
      template(c, x, y, [
        "................",
        ".....gg..g......",
        "...gg.gg.gg.....",
        "..g.ggg.gg.g....",
        "...ggg.ggg.g....",
        "..g.gggggg.g....",
        "....gggggg......",
        ".....gggg.......",
        "....oooooo......",
        "....obbbbo......",
        "....obbbbo......",
        "....obbbbo......",
        "....oooooo......",
        "................",
        "................",
        "................",
      ], { g: P.plant1, o: P.shelfDark, b: P.plantPot });
    }),
    C: maker((c, x, y) => {
      fillTile(c, x, y, P.floorLab1);
      px(c, x, y, 2, 1, P.pcBody, 12, 12);
      px(c, x, y, 3, 2, P.tv2, 10, 8);
      px(c, x, y, 4, 3, P.pcScreen, 8, 6);
      px(c, x, y, 3, 11, P.tv1, 10, 1);
      px(c, x, y, 4, 13, P.pcBody, 8, 2);
    }),
    L: maker((c, x, y) => {
      fillTile(c, x, y, P.floorLab1);
      px(c, x, y, 1, 0, P.mach2, 14, 14);
      px(c, x, y, 2, 1, P.mach1, 12, 12);
      px(c, x, y, 3, 2, P.tv2, 5, 4);
      px(c, x, y, 4, 3, P.machLight2, 3, 2);
      px(c, x, y, 9, 2, P.machLight, 2, 2);
      px(c, x, y, 9, 5, P.machLight2, 2, 2);
      px(c, x, y, 3, 8, P.tv2, 10, 3);
      for (let i = 0; i < 4; i++) px(c, x, y, 4 + i * 2, 9, P.machLight, 1, 1);
    }),
    H: maker((c, x, y) => {
      fillTile(c, x, y, P.floorLab1);
      px(c, x, y, 1, 2, P.mach2, 14, 11);
      px(c, x, y, 2, 3, P.mach1, 12, 9);
      for (let i = 0; i < 3; i++) px(c, x, y, 3 + i * 4, 4, P.machLight2, 2, 2);
      px(c, x, y, 3, 8, P.tvScreen, 10, 2);
      px(c, x, y, 4, 13, P.mach2, 8, 2);
    }),
    "~": maker((c, x, y) => {
      fillTile(c, x, y, P.rug1);
      px(c, x, y, 0, 0, P.rug2, 16, 1);
      px(c, x, y, 0, 15, P.rug2, 16, 1);
      px(c, x, y, 0, 0, P.rug2, 1, 16);
      px(c, x, y, 15, 0, P.rug2, 1, 16);
      speckle(c, x, y, P.rug2, 19, 8);
    }),
  };
  delete PAINTERS.p2;

  function roof(c, x, y, light, dark) {
    fillTile(c, x, y, light);
    c.fillStyle = dark;
    for (let i = -1; i < 5; i++) c.fillRect(x, y + 3 + i * 4, 16, 1);
    for (let i = 0; i < 4; i++) {
      c.fillRect(x + ((i * 5 + 2) % 16), y + 4 + i * 4, 1, 3);
      c.fillRect(x + ((i * 9 + 9) % 16), y + 4 + i * 4, 1, 3);
    }
    c.fillRect(x, y, 16, 1);
  }

  const SOLID = new Set(["T", "P", "w", "F", "r", "k", "s", "R", "Y", "A", "W", "o", "+", "M", "g",
    "#", "c", "B", "b", "x", "V", "p", "C", "L", "H", "K", "*",
    "G", "q", "O", "E", "J", "U"]);
  const WALK_BEHIND = new Set(); // (kept simple: no overhang tiles)

  const Tileset = {
    TILE,
    atlas: null,
    index: {},
    frames: 2,

    init() {
      const chars = Object.keys(PAINTERS);
      const canvas = document.createElement("canvas");
      canvas.width = chars.length * TILE;
      canvas.height = TILE * this.frames;
      const ctx = canvas.getContext("2d");
      chars.forEach((ch, i) => {
        for (let f = 0; f < this.frames; f++) {
          PAINTERS[ch](ctx, i * TILE, f * TILE, f);
        }
        this.index[ch] = i;
      });
      this.atlas = canvas;
    },

    draw(ctx, ch, dx, dy, frame = 0) {
      let i = this.index[ch];
      if (i === undefined) i = this.index["."];
      ctx.drawImage(this.atlas, i * TILE, (frame % this.frames) * TILE, TILE, TILE, dx, dy, TILE, TILE);
    },

    isSolid(ch) {
      return SOLID.has(ch);
    },
    isWater(ch) { return ch === "w"; },
    isGrass(ch) { return ch === "t"; },
    isLedge(ch) { return ch === "l"; },
    walkBehind(ch) { return WALK_BEHIND.has(ch); },
  };

  window.Tileset = Tileset;
})();
