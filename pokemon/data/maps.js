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
        "T....AAAAAA....fU..T", // 11
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
        { id: "bus_driver_pallet", variant: "clerk", x: 16, y: 12, dir: "down", movement: "static", script: "bus_driver" },
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
          trainer: "r1_bug",
        },
        {
          id: "t_r1_lass", variant: "lass", x: 16, y: 13, dir: "left", movement: "static",
          trainer: "r1_lass",
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
        "T...,,,,,,,,,,,,,,,,,,,,", // 6  (east exit to Route 3)
        "T...,,....,,...........,", // 7
        "T.f.,,....,,....f......T", // 8
        "T...,,..TT,,TT.........T", // 9
        "T..YYYY...,,...gggggg..T", // 10
        "T..YYYY...,,...gggggg..T", // 11
        "T..oMDo...,,...ggDDgg..T", // 12  mart | gym (double door)
        "T...,,....,,......,....T", // 13
        "T...,,....,,......,....T", // 14
        "T...,,,,,,,,,,,,,,,....T", // 15
        "T..U......,,...........T", // 16
        "T.s.......,,.......s...T", // 17
        "T.........,,...........T", // 18
        "TTTTTTTTTT,,TTTTTTTTTTTT", // 19
      ],
      edges: {
        south: { map: "route1", alignX: -2 },
        north: { map: "route2", alignX: 0 },
        east: { map: "route3", alignY: 0 },
      },
      warps: [
        { x: 5, y: 4, to: { map: "center", x: 5, y: 6, dir: "up" } },
        { x: 5, y: 12, to: { map: "mart", x: 5, y: 6, dir: "up" } },
        { x: 17, y: 12, to: { map: "gym", x: 5, y: 12, dir: "up" } },
        { x: 18, y: 12, to: { map: "gym", x: 5, y: 12, dir: "up" } },
        { x: 18, y: 4, to: { map: "city_house", x: 5, y: 6, dir: "up" } },
      ],
      signs: [
        { x: 2, y: 17, text: "VERDANT CITY — The jewel of the green valley." },
        { x: 19, y: 17, text: "VERDANT GYM — Leader: FLINT. The Rock-Solid Trainer!" },
      ],
      triggers: [
        { x: 23, y: 6, script: "route3Gate" },
        { x: 23, y: 7, script: "route3Gate" },
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
        // Team Shadow grunt blocks the east road until you have the badge
        { id: "shadow_gate", variant: "clerk", x: 21, y: 6, dir: "left", movement: "static", script: "shadow_gate" },
        { id: "bus_driver_city", variant: "clerk", x: 4, y: 16, dir: "down", movement: "static", script: "bus_driver" },
      ],
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
      warps: [{ x: 6, y: 7, to: "return", fallback: { map: "city", x: 5, y: 5, dir: "down" } }],
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
      warps: [{ x: 6, y: 7, to: "return", fallback: { map: "city", x: 5, y: 13, dir: "down" } }],
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
        { id: "t_gym1", variant: "boy", x: 3, y: 8, dir: "right", movement: "static", trainer: "gym_boy" },
        { id: "t_gym2", variant: "bugcatcher", x: 8, y: 5, dir: "left", movement: "static", trainer: "gym_hiker" },
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
          trainer: "r2_boy",
        },
        {
          id: "t_r2_lass", variant: "lass", x: 13, y: 9, dir: "left", movement: "static",
          trainer: "r2_lass",
        },
        {
          id: "t_r2_bug", variant: "bugcatcher", x: 5, y: 15, dir: "right", movement: "static",
          trainer: "r2_bug",
        },
        {
          id: "r2_oldman", variant: "oldman", x: 16, y: 1, dir: "down", movement: "static",
          dialog: ["Beyond here the wilds get rough. Rare Pokémon rustle in this route's grass, they say."],
        },
      ],
      triggers: [],
    },
    // ================= ROUTE 3 (east, badge-gated) =================
    route3: {
      name: "ROUTE 3",
      type: "outdoor",
      music: "route",
      border: "T",
      encounters: "route3",
      grid: [
        "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", // 0
        "T...f....tttt.......f........T", // 1
        "T..TT....tttt....TT....tttt..T", // 2
        "T..TT....tttt....TT....tttt..T", // 3
        "T................TT....tttt..T", // 4
        "T.....r......................T", // 5
        ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,", // 6
        ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,", // 7
        "T............................T", // 8
        "T..llllll....llllll....llll..T", // 9
        "T............................T", // 10
        "T..ttttt.....f......ttttt....T", // 11
        "T..ttttt............ttttt....T", // 12
        "T..ttttt..TT........ttttt..f.T", // 13
        "T.........TT.........s.......T", // 14
        "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", // 15
      ],
      edges: {
        west: { map: "city", alignY: 0 },
        east: { map: "lakeside", alignY: 1 },
      },
      warps: [],
      signs: [
        { x: 21, y: 14, text: "ROUTE 3 — East: LAKESIDE TOWN. Beware of strong wild Pokémon!" },
      ],
      npcs: [
        { id: "t_r3_camper", variant: "boy", x: 7, y: 4, dir: "down", movement: "static", trainer: "r3_camper" },
        { id: "t_r3_lass", variant: "lass", x: 14, y: 8, dir: "down", movement: "static", trainer: "r3_lass" },
        { id: "t_r3_youngster", variant: "boy", x: 23, y: 10, dir: "left", movement: "static", trainer: "r3_youngster" },
        { id: "t_r3_picnic", variant: "girl", x: 5, y: 10, dir: "right", movement: "static", trainer: "r3_picnic" },
        {
          id: "r3_oldman", variant: "oldman", x: 3, y: 8, dir: "down", movement: "static",
          dialog: ["Trainers here only battle if you talk to them. Hop the ledges to skip back west quickly!"],
        },
      ],
      triggers: [],
    },

    // ================= LAKESIDE CITY =================
    lakeside: {
      name: "LAKESIDE CITY",
      type: "outdoor",
      music: "town",
      border: "T",
      encounters: null,
      grid: [
        "TTTTTTTTTTTTTrrDrrTTTTTTTTTTTT", // 0  cave mouth (door x15)
        "T............,aa,...........fT", // 1
        "T.AAAAA......,aa,.qqqqqqq....T", // 2
        "T.AAAAA......,aa,.qqqqqqq....T", // 3
        "T.o+DWo......,aa,.GOJDOOG....T", // 4  center | museum
        "T..,,........,aa,....,.......T", // 5
        "T..,,........,aa,....,.......T", // 6
        "aaaaaaaaaaaaaazzaaaaaaaaaaaaaT", // 7  main street west exit
        "aaaaaaaaaaaaaazzaaaaaaaaaaaaaT", // 8
        "T..YYYYY.....,aa,..qqqqq.qqqqT", // 9  mart | arcade | apartment
        "T..YYYYY.....,aa,..GEDOG.GOOGT", // 10
        "T..oMDWo.....,aa,....,...GODGT", // 11
        "T...,,.......,aa,....,.....,.T", // 12
        "T............,aa,...........fT", // 13
        "TaaaaaaaaaaaaazzaaaaaaaaaaaaaT", // 14 second street
        "TaaaaaaaaaaaaazzaaaaaaaaaaaaaT", // 15
        "T.gggggg.....,aa,U.RRRRR.....T", // 16 gym | bus stop | cafe
        "T.gggggg.....,aa,..RRRRR.....T", // 17
        "T.ggDDgg.s...,aa,..oWDWo.....T", // 18
        "T...,,.......,aa,....,.......T", // 19
        "T.wwwwd......,aa,.....f......T", // 20 lake
        "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", // 21
      ],
      edges: {
        west: { map: "route3", alignY: -1 },
      },
      warps: [
        { x: 15, y: 0, to: { map: "tunnel", x: 11, y: 17, dir: "up" } },
        { x: 4, y: 4, to: { map: "center", x: 5, y: 6, dir: "up" } },
        { x: 21, y: 4, to: { map: "museum", x: 5, y: 6, dir: "up" } },
        { x: 5, y: 11, to: { map: "mart", x: 5, y: 6, dir: "up" } },
        { x: 21, y: 10, to: { map: "arcade", x: 5, y: 6, dir: "up" } },
        { x: 27, y: 11, to: { map: "apartment", x: 5, y: 6, dir: "up" } },
        { x: 4, y: 18, to: { map: "gym2", x: 5, y: 12, dir: "up" } },
        { x: 5, y: 18, to: { map: "gym2", x: 5, y: 12, dir: "up" } },
        { x: 21, y: 18, to: { map: "cafe", x: 5, y: 5, dir: "up" } },
      ],
      signs: [
        { x: 9, y: 18, text: "LAKESIDE GYM — Leader MARINA, the Rising Tide. Win the CASCADE BADGE inside!" },
      ],
      npcs: [
        {
          id: "lake_girl", variant: "girl", x: 8, y: 13, dir: "down", movement: "wander",
          dialog: ["MARINA's Water-types splash hard! Electric or Grass moves will shock her team."],
        },
        {
          id: "lake_fisher", variant: "oldman", x: 3, y: 19, dir: "down", movement: "static",
          dialog: ["The cave up north is GRANITE TUNNEL. Team Shadow goons have been lurking in there…"],
        },
        {
          id: "city_walker1", variant: "boy", x: 19, y: 5, dir: "down", movement: "wander",
          dialog: ["The ARCADE's Lucky Wheel ate half my allowance… then paid it all back double!"],
        },
        {
          id: "city_walker2", variant: "lass", x: 23, y: 12, dir: "down", movement: "wander",
          dialog: ["Big city, huh? The MUSEUM up north has a carving of a Pokémon nobody's ever caught."],
        },
        // grunt blocks the tunnel until badge 2
        { id: "shadow_cave", variant: "clerk", x: 15, y: 1, dir: "down", movement: "static", script: "shadow_cave" },
        // bus stop
        { id: "bus_driver_lakeside", variant: "clerk", x: 18, y: 16, dir: "down", movement: "static", script: "bus_driver" },
      ],
      triggers: [
        { x: 15, y: 0, script: "tunnelGate" },
      ],
    },

    // ================= MUSEUM =================
    museum: {
      name: "LAKESIDE MUSEUM",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "############",
        "#B=x==x==xB#",
        "#==========#",
        "#====LL====#",
        "#==========#",
        "#x========x#",
        "#==========#",
        "#####~######",
      ],
      warps: [{ x: 5, y: 7, to: { map: "lakeside", x: 21, y: 5, dir: "down" } }],
      signs: [],
      // Clickable exhibits: each shows a Pokémon sprite on its display case and a
      // pop-up page with the artifact's history when you face it and press A.
      exhibits: [
        {
          x: 3, y: 1, species: 151, title: "ANCIENT CARVING", stone: true,
          history: "A stone carving of a small, round Pokémon said to hold the genes of all others. No trainer has ever caught it. Its name: MEW.",
        },
        {
          x: 6, y: 1, species: 35, title: "MOON STONE RELIC",
          history: "A glittering stone that fell from the night sky. CLEFAIRY are said to gather and dance wherever a MOON STONE lands.",
        },
        {
          x: 9, y: 1, species: 142, title: "OLD AMBER",
          history: "Something feathery is trapped in this amber. It belonged to AERODACTYL, a fierce flier from over 100 million years ago.",
        },
        {
          x: 1, y: 5, species: 138, title: "HELIX FOSSIL",
          history: "A spiral shell turned to stone — the fossil of OMANYTE, an ancient Pokémon that drifted through prehistoric seas.",
        },
        {
          x: 10, y: 5, species: 140, title: "DOME FOSSIL",
          history: "A hard, dome-shaped fossil — the shell of KABUTO. A few are rumored to still scuttle in deep caves.",
        },
      ],
      npcs: [
        { id: "curator", variant: "professor", x: 5, y: 4, dir: "down", movement: "static",
          dialog: [
            "Welcome to the LAKESIDE MUSEUM! Step up to any display case and press A to study the artifact.",
            "My favorite? The ancient MEW carving. Some say that Pokémon still hides where no trainer can reach…",
          ] },
        { id: "museum_kid", variant: "boy", x: 8, y: 5, dir: "up", movement: "static",
          dialog: ["They dug those fossils out of GRANITE TUNNEL! Maybe there are more in there!"] },
      ],
      triggers: [],
    },

    // ================= ARCADE =================
    arcade: {
      name: "GAME CORNER",
      type: "indoor",
      music: "title",
      border: "#",
      grid: [
        "############",
        "#V=V=V==V=V#",
        "#==========#",
        "#====L=====#",
        "#==========#",
        "#V=V====V=V#",
        "#==========#",
        "#####~######",
      ],
      warps: [{ x: 5, y: 7, to: { map: "lakeside", x: 21, y: 11, dir: "down" } }],
      signs: [
        { x: 1, y: 1, text: "BATTLE BLASTER EX — OUT OF ORDER. (Someone jammed a bottle cap in the slot.)" },
        { x: 3, y: 1, text: "PIKA-PINBALL — Hi-score: 999,999 by 'BLUE'. …That show-off." },
        { x: 8, y: 1, text: "DIG DIG DIGLETT — A mole-whacking classic. The mallet is missing." },
        { x: 10, y: 5, text: "KARATE CHOP HERO — Two pads are cracked. The machine hums menacingly." },
      ],
      npcs: [
        { id: "wheel_host", variant: "clerk", x: 5, y: 4, dir: "down", movement: "static", script: "lucky_wheel" },
        { id: "arcade_kid", variant: "boy", x: 2, y: 4, dir: "right", movement: "static",
          dialog: ["The LUCKY WHEEL by the big machine pays out items and money! I won a GREAT BALL once!"] },
        { id: "arcade_lass", variant: "lass", x: 9, y: 3, dir: "left", movement: "wander",
          dialog: ["I've spun the wheel 20 times today. My mom is going to turn ME into a slot machine."] },
      ],
      triggers: [],
    },

    // ================= CAFE =================
    cafe: {
      name: "LAKESIDE CAFé",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "##########",
        "#B=====VB#",
        "#==cc====#",
        "#=xh==xh=#",
        "#========#",
        "#####~####",
      ],
      warps: [{ x: 5, y: 5, to: { map: "lakeside", x: 21, y: 19, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "barista", variant: "nurse", x: 3, y: 1, dir: "down", movement: "static", script: "cafe_barista" },
        { id: "cafe_patron1", variant: "oldman", x: 2, y: 4, dir: "up", movement: "static",
          dialog: ["I saw Team Shadow grunts buy 12 espressos to-go. Whatever they're digging for in that tunnel, it's keeping them up at night."] },
        { id: "cafe_patron2", variant: "girl", x: 7, y: 4, dir: "up", movement: "static",
          dialog: ["The barista's MIME JR. latte art is adorable. Wait… do we even have MIME JR. around here?"] },
      ],
      triggers: [],
    },

    // ================= APARTMENT =================
    apartment: {
      name: "LAKESIDE APARTMENTS",
      type: "indoor",
      music: "town",
      border: "#",
      grid: [
        "##########",
        "#B=V===bb#",
        "#========#",
        "#=xh=====#",
        "#p======p#",
        "#========#",
        "#####~####",
      ],
      warps: [{ x: 5, y: 6, to: { map: "lakeside", x: 27, y: 12, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "apt_man", variant: "boy", x: 5, y: 3, dir: "down", movement: "static",
          dialog: [
            "I saw Team Shadow drag a crying kid's POKéMON into GRANITE TUNNEL!",
            "Someone strong enough should teach those goons a lesson.",
          ] },
        { id: "apt_granny", variant: "oldman", x: 7, y: 4, dir: "left", movement: "static",
          dialog: ["City rent is criminal, dear. Back in my day a Poké Ball cost 50 and trainers said thank you."] },
      ],
      triggers: [],
    },

    // ================= GYM 2 (Water) =================
    gym2: {
      name: "LAKESIDE GYM",
      type: "indoor",
      music: "gym",
      border: "#",
      grid: [
        "############",
        "#====LL====#",
        "#==========#",
        "#--u====u--#",
        "#--========#",
        "#--==u==---#",
        "#---====---#",
        "#--u====u--#",
        "#--========#",
        "#---==u=---#",
        "#==========#",
        "#==========#",
        "#####~######",
      ],
      warps: [{ x: 5, y: 12, to: { map: "lakeside", x: 4, y: 19, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "gym2leader", variant: "nurse", x: 5, y: 2, dir: "down", movement: "static", script: "gym2leader" },
        { id: "t_gym2_swim1", variant: "lass", x: 3, y: 6, dir: "right", movement: "static", trainer: "gym2_swim1" },
        { id: "t_gym2_swim2", variant: "boy", x: 8, y: 8, dir: "left", movement: "static", trainer: "gym2_swim2" },
        {
          id: "gym2_guide", variant: "oldman", x: 8, y: 11, dir: "left", movement: "static",
          dialog: ["Yo, champ in the making! MARINA's water Pokémon wash trainers away. Got anything Electric or Grass?"],
        },
      ],
      triggers: [],
    },

    // ================= GRANITE TUNNEL =================
    tunnel: {
      name: "GRANITE TUNNEL",
      type: "indoor",
      music: "gym",
      border: "K",
      encounters: "tunnel",
      grid: [
        "KKKKKKKKKKK::KKKKKKKKKKK", // 0
        "K::::::::::::::::::::::K", // 1
        "K::*:::KKKK::::KKK:::::K", // 2
        "K::::::KKKK:::::KK::*::K", // 3
        "K:::::::::::::::::::::::", // 4 -> dead end? no, wall right side
        "K::::::::::::::::::::::K", // 5
        "KKKKKK::::KKKKK::::KKKKK", // 6
        "K:::::::::::::::::::::*K", // 7
        "K::*::::::::::::::::::::", // 8 -> fix
        "K::::::KKKKKKKK::::::::K", // 9
        "K::::::K::::::K::::::::K", // 10
        "K::::::K:*::::K:::KKK::K", // 11
        "K::::::K::::::K:::KKK::K", // 12
        "K::::::KKKKKKKK::::::::K", // 13
        "K::::::::::::::::::::::K", // 14
        "K:::KKK::::::::::KK::::K", // 15
        "K:::KKK::::*:::::KK::::K", // 16
        "K::::::::::~:::::::::::K", // 17
        "KKKKKKKKKKK::KKKKKKKKKKK", // 18
      ],
      edges: {
        north: { map: "summit", alignX: -2 },
      },
      warps: [
        { x: 11, y: 17, to: { map: "lakeside", x: 15, y: 1, dir: "down" } },
      ],
      signs: [],
      npcs: [
        { id: "t_tun_grunt1", variant: "clerk", x: 8, y: 7, dir: "right", movement: "static", trainer: "tun_grunt1" },
        { id: "t_tun_grunt2", variant: "clerk", x: 16, y: 10, dir: "left", movement: "static", trainer: "tun_grunt2" },
        { id: "t_tun_hiker", variant: "bugcatcher", x: 4, y: 14, dir: "right", movement: "static", trainer: "tun_hiker" },
        { id: "tunnel_kid", variant: "boy", x: 12, y: 5, dir: "down", movement: "static", script: "tunnel_kid" },
      ],
      triggers: [],
    },

    // ================= SUMMIT VILLAGE =================
    summit: {
      name: "SUMMIT VILLAGE",
      type: "outdoor",
      music: "center",
      border: "P",
      encounters: null,
      grid: [
        "PPPPPPPPPPPPPPPPPP", // 0
        "P....f...WWWWW...P", // 1
        "P..PP....WWDWW...P", // 2
        "P.........,.....fP", // 3
        "P..AAAA....,..PP.P", // 4
        "P..AAAA....,.....P", // 5
        "P..oWDo...,,..r..P", // 6
        "P...,.....,....U.P", // 7
        "P...,,,,,,,,..s..P", // 8
        "P.f......,,......P", // 9
        "PPPPPPPPP,,PPPPPPP", // 10
      ],
      edges: {
        south: { map: "tunnel", alignX: 2 },
      },
      warps: [
        { x: 5, y: 6, to: { map: "resthouse", x: 4, y: 5, dir: "up" } },
        { x: 11, y: 2, to: { map: "hall", x: 4, y: 9, dir: "up" } },
      ],
      signs: [
        { x: 14, y: 8, text: "SUMMIT VILLAGE — Home of VICTORY HALL. Only true badge holders may enter." },
      ],
      npcs: [
        {
          id: "summit_girl", variant: "girl", x: 13, y: 7, dir: "down", movement: "wander",
          dialog: ["The CHAMPION waits inside VICTORY HALL. They say he's a kid from PALLET HOLLOW with a real attitude…"],
        },
        { id: "hall_guard", variant: "oldman", x: 12, y: 3, dir: "left", movement: "static", script: "hall_guard" },
        { id: "bus_driver_summit", variant: "clerk", x: 15, y: 8, dir: "down", movement: "static", script: "bus_driver" },
      ],
      triggers: [
        { x: 11, y: 2, script: "hallGate" },
      ],
    },

    // ================= REST HOUSE =================
    resthouse: {
      name: "REST HOUSE",
      type: "indoor",
      music: "center",
      border: "#",
      grid: [
        "##########",
        "#H==cc==B#",
        "#========#",
        "#p======p#",
        "#========#",
        "####~#####",
      ],
      warps: [{ x: 4, y: 5, to: { map: "summit", x: 5, y: 7, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "rest_healer", variant: "nurse", x: 4, y: 2, dir: "down", movement: "static", script: "rest_healer" },
      ],
      triggers: [],
    },

    // ================= VICTORY HALL =================
    hall: {
      name: "VICTORY HALL",
      type: "indoor",
      music: "gym",
      border: "#",
      grid: [
        "##########",
        "#LL====LL#",
        "#========#",
        "#==~~~~==#",
        "#==~~~~==#",
        "#========#",
        "#p======p#",
        "#========#",
        "#========#",
        "#========#",
        "####~#####",
      ],
      warps: [{ x: 4, y: 10, to: { map: "summit", x: 11, y: 3, dir: "down" } }],
      signs: [],
      npcs: [
        { id: "champion", variant: "rival", x: 4, y: 2, dir: "down", movement: "static", script: "champion" },
      ],
      triggers: [],
    },
  };

  window.MAPS = MAPS;
})();
