'use strict';
/* ---------------------------------------------------------------
   Prüfstand: lädt das komplette Spiel in node, ohne Browser.

   Das Spiel besteht aus vier klassischen Skripten, die sich ein
   gemeinsames Scope teilen (keine Module — damit index.html auch von
   file:// läuft). Deshalb werden sie hier zu EINEM Quelltext
   zusammengehängt und in einem Rutsch ausgewertet; sonst sähen sie
   die Konstanten der jeweils anderen Datei nicht.

   Alles, was das Spiel vom Browser erwartet, ist unten grob
   nachgebaut: Ein Canvas-Kontext, der jeden Aufruf schluckt, DOM-
   Elemente, die Zuweisungen annehmen, und Zeitgeber, die nichts tun.
   Gerechnet wird trotzdem alles — Netz, Wellen, Schaden, Karten.

     const h = require('./harness.js');
     h.game.build('blaster', 22, 12);
     h.game.update(1 / 60);

   Jedes require() liefert denselben Zustand. Für eine frische Partie
   den Cache leeren (siehe bot.js).
---------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Ein Zeichenkontext, der jeden Aufruf annimmt und nichts tut
function mkCtx() {
  const noop = () => {};
  const c = new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return { width: 0, height: 0 };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; }
  });
  c.createRadialGradient = () => ({ addColorStop: noop });
  c.createLinearGradient = () => ({ addColorStop: noop });
  c.measureText = () => ({ width: 10 });
  return c;
}

function mkEl(id) {
  const kinder = [];
  return {
    id, textContent: '', innerHTML: '', hidden: false, disabled: false, title: '',
    // style muss setProperty können — das Spiel setzt darüber CSS-Variablen
    style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; } },
    dataset: {}, children: kinder,
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild(c) { kinder.push(c); },
    querySelector: () => mkEl('q'),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1312, height: 800 }),
    getContext: () => mkCtx(), width: 1312, height: 800,
    set onclick(v) {}, get onclick() { return null; }
  };
}

const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = mkEl(id)),
  createElement: () => mkEl('neu')
};
global.window = global;
/* Ein echter, aber flüchtiger localStorage: Der Spielstand und die
   Bestenliste sollen sich prüfen lassen, ohne eine Datei anzufassen.
   Er überlebt bewusst ein erneutes Laden des Spiels im selben Prozess —
   genau darum geht es beim Spielstand. */
// Am globalen Objekt, damit er ein erneutes Laden des Prüfstands überlebt —
// sonst ließe sich Speichern und Laden gar nicht gegeneinander prüfen.
const speicher = global.__cdSpeicher || (global.__cdSpeicher = new Map());
global.localStorage = {
  getItem: k => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => { speicher.set(k, String(v)); },
  removeItem: k => { speicher.delete(k); },
  clear: () => speicher.clear()
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.addEventListener = () => {};
global.setTimeout = () => 0;          // toast() soll hier nichts nachlaufen lassen
global.clearTimeout = () => {};
global.AudioContext = undefined;      // ohne AudioContext bleibt SFX stumm

const quelle = ['js/config.js', 'js/entities.js', 'js/audio.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^'use strict';\s*/, ''))
  .join('\n');

/* Indirektes eval, damit der zusammengehängte Quelltext ein eigenes
   Scope bekommt. Was der Prüfstand nach außen geben soll, steht als
   Ausdruck am Ende — anders käme man an die const-Bindungen nicht heran. */
module.exports = (0, eval)(quelle + `
;({
  game, CARDS, BUILDINGS, ENEMIES, MODIFIERS, POWERS, POWER_LIST, BOSSES,
  CORE, GRID, FLOW, UPGRADE, SPECIALS, PRIORITY, TARGETS, OVERLOAD,
  CORE_MODES, CORE_SWITCH, DRUCK, GELAENDE, BODEN,
  sektorVon, sektorMitte, compass, pickGewichtet,
  REPAIR_SHARE, MOD_FROM_WAVE, MOD_BONUS, SELL_REFUND,
  flowCap, akkuFlow, upgradeSteps, waveHpScale, waveBudget, bossFor,
  SAVE_KEY, BEST_KEY, SAVE_VERSION, BEST_MAX, bestenlisteHtml,
  speicher: localStorage,
  // Sturmwellen für Vergleichsmessungen abschaltbar machen
  setModChance: w => { MOD_CHANCE = w; }
})`);
