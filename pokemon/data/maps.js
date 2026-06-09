// Hand-authored region maps. Tile legend lives in js/tileset.js.
// Maps are ASCII grids; every row in a grid must be the same length.
(function () {
  "use strict";

  const MAPS = {
    // ================= PALLET HOLLOW (start town) =================
    pallet: {
      name: "PALLET HOLLOW",
      type: "outdoor",
      music: "town",
      border: "T",
      encounters: null,
      grid: [
        "TTTTTTTT,,TTTTTTTTTT", // 0
        "T......,,,.........T", // 1
        "T.RRRR..,,..YYYY...T", // 2
        "T.RRRR..,,..YYYY...T", // 3
        "T.oWDo..,,..oWDo...T", // 4
        "T..,,...,,...,,....T", // 5
        "T..,,..s,,,..,,....T", // 6
        "T..,,,,,,,,,,,,....T", // 7
        "T..f....,,....f....T", // 8
        "T.FFFF..,,..FFFF...T", // 9
        "T.......,,.........T", // 10
        "T....AAAAAA....f...T", // 11
        "T....AAAAAA........T", // 12
        "T....oWWDWo........T", // 13
        "T...,,,,,,,,.......T", // 14
        "T.f....,s..........T", // 15
        "T.www..,,......www.T", // 16
        "TTTTTTT,,TTTTTTTTTTT", // 17
      ],
      edges: { north: { map: "route1", alignX: 3 } },
      warps: [
        { x: 4, y: 4, to: { map: "player_home", x: 5, y: 6, dir: "up" } },
        { x: 14, y: 4, to: { map: "rival_home", x: 5, y: 6, dir: "up" } },
        { x: 8, y: 13, to: { map: "lab", x: 5, y: 10, dir: "up" } },
      ],
      signs: [
        { x: 7, y: 6, text: "PALLET HOLLOW — A quiet town where journeys begin." },
        { x: 8, y: 15, text: "PROF. CEDAR'S LAB" },
      ],
      npcs: [
        {
          id: "pallet_girl", variant: "girl", x: 14, y: 8, dir: "down", movement: "wander",
          dialog: ["Wild Pokémon hide in tall grass! You'll need your own Pokémon to go out there."],
        },
      ],
      triggers: [
        { x: 8, y: 0, script: "needStarter" },
        { x: 9, y: 0, script: "needStarter" },
      ],
    },

    // ================= PLAYER HOME =================
    player_home: {
      name: "YOUR HOUSE",
      type: "indoor",
      music: "town",
      border: "#",
      grid: [
        "##########",
        "#BV====C=#",
        "#========#",
        "#=xh=====#",
        "#======b=#",
        "#========#",
        "#========#",
        "#####~####",
      ],
      warps: [{ x: 5, y: 7, to: { map: "pallet", x: 4, y: 5, dir: "down" } }],
      signs: [],
      npcs: [
        {
          id: "mom", variant: "girl", x: 5, y: 3, dir: "down", movement: "static", script: "mom",
        },
      ],
      triggers: [],
    },

    // ================= RIVAL HOME =================
    rival_home: {
      name: "RIVAL'S HOUSE",
      type: "indoor",
      music: "town",
      border: "#",
      grid: [
        "##########",
        "#B=V===B=#",
        "#========#",
        "#==xx====#",
        "#==xx===p#",
        "#========#",
        "#========#",
        "#####~####",
      ],
      warps: [{ x: 5, y: 7, to: { map: "pallet", x: 14, y: 5, dir: "down" } }],
      signs: [],
      npcs: [
        {
          id: "rival_sister", variant: "lass", x: 6, y: 3, dir: "left", movement: "static",
          dialog: ["My brother went to PROF. CEDAR'S lab. He's so impatient to get a Pokémon…"],
        },
      ],
      triggers: [],
    },

    // ================= LAB =================
    lab: {
      name: "CEDAR'S LAB",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "############",
        "#LL=====LL=#",
        "#==========#",
        "#====C=====#",
        "#==========#",
        "#===xxx====#",
        "#==========#",
        "#B=B====B=B#",
        "#==========#",
        "#==========#",
        "#====~=====#",
        "############",
      ],
      warps: [{ x: 5, y: 10, to: { map: "pallet", x: 8, y: 14, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "professor", variant: "professor", x: 5, y: 4, dir: "down", movement: "static", script: "professor" },
        { id: "rival_lab", variant: "rival", x: 7, y: 6, dir: "left", movement: "static", script: "rival_lab", hidden: false },
        { id: "lab_aide", variant: "boy", x: 2, y: 8, dir: "down", movement: "static",
          dialog: ["PROF. CEDAR studies how Pokémon grow. The three Pokémon on his desk are for new trainers!"] },
      ],
      triggers: [],
    },

    // ================= ROUTE 1 =================
    route1: {
      name: "ROUTE 1",
      type: "outdoor",
      music: "route",
      border: "T",
      encounters: "route1",
      grid: [
        "TTTTTTTT,,TTTTTTTTTT", // 0
        "T..ttt..,,...ttt...T", // 1
        "T..ttt..,,...ttt...T", // 2
        "T..ttt..,,..tttt...T", // 3
        "T.......,,.........T", // 4
        "T.f.....,,......f..T", // 5
        "TTTTTT..,,..TTTTTTTT", // 6
        "T.......,,.........T", // 7
        "T..,,,,,,,.....tt..T", // 8
        "T..,,..........tt..T", // 9
        "T..,,..tttt....tt..T", // 10
        "T..,,..tttt....tt..T", // 11
        "T..,,..tttt........T", // 12
        "T..,,..............T", // 13
        "T..,,llllll.llllll.T", // 14
        "T..,,..............T", // 15
        "T..,,....t.........T", // 16
        "T..,,...ttt....f...T", // 17
        "T..,,..ttttt.......T", // 18
        "T..,,...ttt........T", // 19
        "T..,,....t.........T", // 20
        "T..,,..............T", // 21
        "TT.,,..TTTTTTTTTTTTT", // 22
        "T..,,..............T", // 23
        "T..,,,,,,,,,,......T", // 24
        "T..........,,..f...T", // 25
        "T..ttttt...,,......T", // 26
        "T..ttttt...,,......T", // 27
        "T..ttttt...,,......T", // 28
        "TTTTTTTTTTT,,TTTTTTT", // 29
      ],
      edges: {
        north: { map: "city", alignX: 2 },
        south: { map: "pallet", alignX: -3 },
      },
      warps: [],
      signs: [],
      npcs: [
        {
          id: "r1_boy", variant: "boy", x: 14, y: 4, dir: "down", movement: "static",
          dialog: ["Tall grass hides wild Pokémon. Walk through it and they may jump out at you!"],
        },
        {
          id: "t_r1_bug", variant: "bugcatcher", x: 6, y: 9, dir: "right", movement: "static",
          trainer: "r1_bug", sight: 4,
        },
        {
          id: "t_r1_lass", variant: "lass", x: 16, y: 13, dir: "left", movement: "static",
          trainer: "r1_lass", sight: 4,
        },
      ],
      triggers: [],
    },

    // ================= VERDANT CITY =================
    city: {
      name: "VERDANT CITY",
      type: "outdoor",
      music: "town",
      border: "T",
      encounters: null,
      grid: [
        "TTTTTTTTTT,,TTTTTTTTTTTT", // 0
        "T.........,,..........fT", // 1
        "T..AAAA...,,...RRRRRR..T", // 2
        "T..AAAA...,,...RRRRRR..T", // 3
        "T..o+Do...,,...oWWDWo..T", // 4   center | house
        "T...,,....,,.....,,....T", // 5
        "T...,,,,,,,,,,,,,,,....T", // 6
        "T...,,....,,...........T", // 7
        "T.f.,,....,,....f......T", // 8
        "T...,,..TT,,TT.........T", // 9
        "T..YYYY...,,...gggggg..T", // 10
        "T..YYYY...,,...gggggg..T", // 11
        "T..oMDo...,,...gg,Dgg..T", // 12  mart | gym
        "T...,,....,,......,....T", // 13
        "T...,,....,,......,....T", // 14
        "T...,,,,,,,,,,,,,,,....T", // 15
        "T.........,,...........T", // 16
        "T.s.......,,.......s...T", // 17
        "T.........,,...........T", // 18
        "TTTTTTTTTT,,TTTTTTTTTTTT", // 19
      ],
      edges: {
        south: { map: "route1", alignX: -2 },
        north: { map: "route2", alignX: 0 },
      },
      warps: [
        { x: 5, y: 4, to: { map: "center", x: 5, y: 6, dir: "up" } },
        { x: 5, y: 12, to: { map: "mart", x: 5, y: 6, dir: "up" } },
        { x: 18, y: 12, to: { map: "gym", x: 5, y: 12, dir: "up" } },
        { x: 18, y: 4, to: { map: "city_house", x: 5, y: 6, dir: "up" } },
      ],
      signs: [
        { x: 2, y: 17, text: "VERDANT CITY — The jewel of the green valley." },
        { x: 19, y: 17, text: "VERDANT GYM — Leader: FLINT. The Rock-Solid Trainer!" },
      ],
      npcs: [
        {
          id: "city_oldman", variant: "oldman", x: 15, y: 8, dir: "down", movement: "wander",
          dialog: ["The GYM LEADER FLINT uses Rock-type Pokémon. Water or Grass moves will crack his defense!"],
        },
        {
          id: "city_girl", variant: "girl", x: 7, y: 16, dir: "down", movement: "wander",
          dialog: ["The POKéMON CENTER heals your team for free. The shop with the blue roof sells supplies."],
        },
        // appears outside the gym after you win the badge
        { id: "rival_city", variant: "rival", x: 16, y: 14, dir: "down", movement: "static", script: "rival_city" },
      ],
      triggers: [],
    },

    // ================= CITY HOUSE =================
    city_house: {
      name: "CITY HOUSE",
      type: "indoor",
      music: "town",
      border: "#",
      grid: [
        "##########",
        "#BB==V==B#",
        "#========#",
        "#=x===xh=#",
        "#========#",
        "#p======p#",
        "#========#",
        "#####~####",
      ],
      warps: [{ x: 5, y: 7, to: { map: "city", x: 18, y: 5, dir: "down" } }],
      signs: [],
      npcs: [
        {
          id: "house_oldman", variant: "oldman", x: 3, y: 3, dir: "down", movement: "static",
          dialog: [
            "Status problems linger after battle. Poison even hurts your Pokémon as you walk!",
            "Carry Antidotes and Paralyz Heals, or visit the POKéMON CENTER.",
          ],
        },
      ],
      triggers: [],
    },

    // ================= POKEMON CENTER =================
    center: {
      name: "POKéMON CENTER",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "############",
        "#==H====C==#",
        "#==========#",
        "#===cc=====#",
        "#==========#",
        "#p========p#",
        "#==========#",
        "######~#####",
      ],
      warps: [{ x: 6, y: 7, to: { map: "city", x: 5, y: 5, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "nurse", variant: "nurse", x: 4, y: 2, dir: "down", movement: "static", script: "nurse" },
        {
          id: "center_boy", variant: "boy", x: 9, y: 5, dir: "left", movement: "static",
          dialog: ["A Pokémon's max HP grows every time it levels up. Evolution makes them even stronger!"],
        },
      ],
      triggers: [],
    },

    // ================= POKE MART =================
    mart: {
      name: "POKé MART",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "############",
        "#B=B====B=B#",
        "#==========#",
        "#===cc=====#",
        "#==========#",
        "#==========#",
        "#==========#",
        "######~#####",
      ],
      warps: [{ x: 6, y: 7, to: { map: "city", x: 5, y: 13, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "clerk", variant: "clerk", x: 4, y: 2, dir: "down", movement: "static", script: "clerk" },
        {
          id: "mart_girl", variant: "lass", x: 8, y: 4, dir: "down", movement: "wander",
          dialog: ["Great Balls work much better than Poké Balls. Weaken a Pokémon first, then throw!"],
        },
      ],
      triggers: [],
    },

    // ================= GYM =================
    gym: {
      name: "VERDANT GYM",
      type: "indoor",
      music: "gym",
      border: "#",
      grid: [
        "############",
        "#====LL====#",
        "#==========#",
        "#==k====k==#",
        "#==========#",
        "#==========#",
        "#==k====k==#",
        "#==========#",
        "#==========#",
        "#==k====k==#",
        "#==========#",
        "#==========#",
        "#####~######",
      ],
      warps: [{ x: 5, y: 12, to: { map: "city", x: 18, y: 13, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "gymleader", variant: "leader", x: 5, y: 2, dir: "down", movement: "static", script: "gymleader" },
        { id: "t_gym1", variant: "boy", x: 3, y: 8, dir: "right", movement: "static", trainer: "gym_boy", sight: 3 },
        { id: "t_gym2", variant: "bugcatcher", x: 8, y: 5, dir: "left", movement: "static", trainer: "gym_hiker", sight: 3 },
        {
          id: "gym_guide", variant: "oldman", x: 8, y: 11, dir: "left", movement: "static",
          dialog: ["Yo, champ in the making! FLINT's Rock-types are tough. Water and Grass moves hit them hard!"],
        },
      ],
      triggers: [],
    },

    // ================= ROUTE 2 =================
    route2: {
      name: "ROUTE 2",
      type: "outdoor",
      music: "route",
      border: "T",
      encounters: "route2",
      grid: [
        "TTTTTTTTTT,,TTTTTTTT", // 0
        "T....f....,,.......T", // 1
        "T.ttttt...,,..tttt.T", // 2
        "T.ttttt...,,..tttt.T", // 3
        "T.ttttt...,,..tttt.T", // 4
        "T.........,,.......T", // 5
        "T....TT...,,...TT..T", // 6
        "T.........,,.......T", // 7
        "T..rr.....,,..f....T", // 8
        "T.........,,.......T", // 9
        "T...tttttt,,tttt...T", // 10
        "T...tttttt,,tttt...T", // 11
        "T...tttttt,,tttt...T", // 12
        "T.........,,.......T", // 13
        "T..f......,,....r..T", // 14
        "T.........,,.......T", // 15
        "T..tttt...,,.......T", // 16
        "T..tttt...,,..www..T", // 17
        "T..tttt...,,..www..T", // 18
        "T.........,,.......T", // 19
        "TTTTTTTTTT,,TTTTTTTT", // 20
      ],
      edges: {
        south: { map: "city", alignX: 0 },
      },
      warps: [],
      signs: [],
      npcs: [
        {
          id: "t_r2_boy", variant: "boy", x: 8, y: 6, dir: "down", movement: "static",
          trainer: "r2_boy", sight: 4,
        },
        {
          id: "t_r2_lass", variant: "lass", x: 13, y: 9, dir: "left", movement: "static",
          trainer: "r2_lass", sight: 4,
        },
        {
          id: "t_r2_bug", variant: "bugcatcher", x: 5, y: 15, dir: "right", movement: "static",
          trainer: "r2_bug", sight: 5,
        },
        {
          id: "r2_oldman", variant: "oldman", x: 16, y: 1, dir: "down", movement: "static",
          dialog: ["Beyond here the wilds get rough. Rare Pokémon rustle in this route's grass, they say."],
        },
      ],
      triggers: [],
    },
  };

  window.MAPS = MAPS;
})();
