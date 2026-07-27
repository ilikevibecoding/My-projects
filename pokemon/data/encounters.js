// Wild encounter tables per route. weight = relative chance; ids are National Dex.
(function () {
  "use strict";

  window.ENCOUNTERS = {
    route1: {
      rate: 0.11, // chance per step in tall grass
      slots: [
        { id: 16, min: 2, max: 4, weight: 35 },  // Pidgey
        { id: 19, min: 2, max: 4, weight: 35 },  // Rattata
        { id: 10, min: 3, max: 5, weight: 12 },  // Caterpie
        { id: 13, min: 3, max: 5, weight: 12 },  // Weedle
        { id: 25, min: 3, max: 5, weight: 6 },   // Pikachu
      ],
    },
    route2: {
      rate: 0.15,
      slots: [
        { id: 16, min: 5, max: 8, weight: 20 },  // Pidgey
        { id: 21, min: 5, max: 8, weight: 15 },  // Spearow
        { id: 29, min: 5, max: 8, weight: 12 },  // Nidoran F
        { id: 32, min: 5, max: 8, weight: 12 },  // Nidoran M
        { id: 43, min: 5, max: 8, weight: 12 },  // Oddish
        { id: 69, min: 5, max: 8, weight: 12 },  // Bellsprout
        { id: 56, min: 6, max: 8, weight: 8 },   // Mankey
        { id: 133, min: 6, max: 8, weight: 5 },  // Eevee
        { id: 63, min: 6, max: 8, weight: 4 },   // Abra
      ],
    },
    route3: {
      rate: 0.13,
      slots: [
        { id: 16, min: 10, max: 13, weight: 18 },  // Pidgey
        { id: 21, min: 10, max: 13, weight: 14 },  // Spearow
        { id: 43, min: 10, max: 13, weight: 12 },  // Oddish
        { id: 69, min: 10, max: 13, weight: 12 },  // Bellsprout
        { id: 54, min: 11, max: 13, weight: 10 },  // Psyduck
        { id: 60, min: 11, max: 13, weight: 10 },  // Poliwag
        { id: 58, min: 11, max: 13, weight: 8 },   // Growlithe
        { id: 37, min: 11, max: 13, weight: 8 },   // Vulpix
        { id: 63, min: 11, max: 13, weight: 5 },   // Abra
        { id: 25, min: 11, max: 13, weight: 3 },   // Pikachu
      ],
    },
    tunnel: {
      rate: 0.13,
      slots: [
        { id: 41, min: 14, max: 17, weight: 35 },  // Zubat
        { id: 74, min: 14, max: 17, weight: 28 },  // Geodude
        { id: 66, min: 14, max: 17, weight: 18 },  // Machop
        { id: 46, min: 14, max: 16, weight: 12 },  // Paras
        { id: 95, min: 15, max: 18, weight: 7 },   // Onix
      ],
    },
  };
})();
