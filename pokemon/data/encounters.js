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
  };
})();
