// Lazy-loading cache for Pokémon sprite images (front/back/icons).
(function () {
  "use strict";

  const cache = {};

  function load(path) {
    if (cache[path]) return cache[path];
    const img = new Image();
    img.src = path;
    cache[path] = img;
    return img;
  }

  const Sprites = {
    front(id) { return load(`assets/pokemon/front/${id}.png`); },
    back(id) { return load(`assets/pokemon/back/${id}.png`); },
    icon(id) { return load(`assets/pokemon/icons/${id}.png`); },

    ready(img) {
      return img.complete && img.naturalWidth > 0;
    },

    // Preload a set of species for an upcoming battle.
    preload(ids) {
      ids.forEach((id) => {
        this.front(id);
        this.back(id);
        this.icon(id);
      });
    },
  };

  window.Sprites = Sprites;
})();
