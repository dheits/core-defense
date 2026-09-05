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
    style: {}, dataset: {}, children: kinder,
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
global.localStorage = { getItem: () => null, setItem: () => {} };
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
  CORE, GRID, FLOW, UPGRADE, SPECIALS, PRIORITY, OVERLOAD,
  CORE_MODES, CORE_SWITCH,
  REPAIR_SHARE, MOD_FROM_WAVE, MOD_BONUS, SELL_REFUND,
  flowCap, akkuFlow, upgradeSteps, waveHpScale, waveBudget, bossFor,
  // Sturmwellen für Vergleichsmessungen abschaltbar machen
  setModChance: w => { MOD_CHANCE = w; }
})`);
