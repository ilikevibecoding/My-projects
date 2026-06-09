// Save/load via localStorage with an export/import fallback (works on file:// too).
(function () {
  "use strict";

  const KEY = "pokeclone_save_v1";

  const SaveSys = {
    hasSave() {
      try {
        return !!localStorage.getItem(KEY);
      } catch (e) {
        return false;
      }
    },

    save(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.warn("save failed", e);
        return false;
      }
    },

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn("load failed", e);
        return null;
      }
    },

    clear() {
      try {
        localStorage.removeItem(KEY);
      } catch (e) { /* ignore */ }
    },

    exportCode(state) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    },

    importCode(code) {
      try {
        return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      } catch (e) {
        return null;
      }
    },
  };

  window.SaveSys = SaveSys;
})();
