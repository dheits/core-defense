'use strict';
/* ---------------------------------------------------------------
   Messung für die beiden Stützbauten (Werkdrohne, Schildfeld).

     node tools/stuetzen.js [Läufe] [Welle] [Schalter,...]
     node tools/stuetzen.js 120 8               Voreinstellung: knappe Energie
     node tools/stuetzen.js 120 8 ueberschuss   vier Reaktoren mehr
     node tools/stuetzen.js 120 8 kern          Prüfplätze am Kern, Kern verwundbar

   Der Bot taugt hier nicht: Er repariert zwischen den Wellen alles — also
   genau das, was die Werkdrohne während der Welle tut. Sein Median sieht
   deshalb gleich aus, egal ob die Drohne etwas kann. Stattdessen ein
   fester Aufbau, eine feste Welle, und gezählt wird, was danach an
   Struktur fehlt.

   Verglichen werden drei Varianten, die sich nur in vier Bauten
   unterscheiden: vier Blaster (der Preis, den ein Stützbau schlagen
   muss), vier Werkdrohnen, vier Schildfelder. Gepaart gemessen — Lauf i
   bekommt für alle drei denselben Tagesseed, also dieselbe Welle. Ohne
   diese Paarung ist das Rauschen zwischen den Wellen größer als der
   Unterschied zwischen den Bauten.

   Aussagekräftig ist die Spalte „besser in x/N": Sie zählt, in wie vielen
   gepaarten Läufen die Variante weniger Struktur verlor als der Blaster.
   Der Mittelwert allein trägt weniger, weil einzelne Läufe mit einem
   verlorenen Bauteil ihn stark ziehen.

   Vier Prüfplätze statt einem, weil sonst der Zufall der Einfallsrichtung
   entscheidet, ob der Stützbau in dieser Welle überhaupt etwas zu tun
   bekommt.
---------------------------------------------------------------- */
const path = require('path');
const PRUEFSTAND = path.resolve(__dirname, 'harness.js');

const SCHALTER = (process.argv[4] || '').split(',');
const UEBERSCHUSS = SCHALTER.includes('ueberschuss');
const KERN = SCHALTER.includes('kern');

function aufbau(variante, tag) {
  delete require.cache[PRUEFSTAND];
  if (global.localStorage) global.localStorage.clear();
  const h = require(PRUEFSTAND);
  const g = h.game;
  g.beginnen(tag);          // fester Tag: alle drei Varianten bekommen dieselbe Welle
  g.neuesGelaende(0);
  g.matter = 100000;
  const C = h.CORE, GRID = h.GRID;

  /* Ein geschlossener Barrierenring auf Radius 5 — nur so laufen die
     Gegner überhaupt in Bauten hinein, statt an ihnen vorbei zum Kern. */
  for (let x = 0; x < GRID.cols; x++)
    for (let y = 0; y < GRID.rows; y++) {
      const d = Math.hypot(x - C.cx, y - C.cy);
      if (d >= 4.6 && d < 5.4) g.build('wall', x, y);
    }
  // Acht Blaster dahinter, in alle acht Richtungen, dazu Netz und Nachschub
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.build('blaster', Math.round(C.cx + Math.cos(a) * 3.2), Math.round(C.cy + Math.sin(a) * 3.2));
  }
  g.build('pylon', 17, 12); g.build('pylon', 23, 12);
  for (const [x, y] of [[19, 10], [21, 10], [19, 14], [21, 14]]) g.build('reactor', x, y);
  g.build('akku', 18, 13); g.build('akku', 22, 11);
  // Mit Überschuss: vier Reaktoren mehr, der Puffer ist dann nie das Nadelöhr
  if (UEBERSCHUSS)
    for (const [x, y] of [[18, 11], [22, 13], [18, 12], [22, 12]]) g.build('reactor', x, y);

  const plaetze = KERN ? [[18, 12], [22, 12], [20, 10], [20, 14]]
                       : [[23, 15], [17, 15], [17, 9], [23, 9]];
  for (const [px, py] of plaetze) g.build(variante, px, py);
  g.recomputeSupply();
  g.energy = g.energyMax;
  return { h, g };
}

function lauf(variante, welle, tag) {
  const { g } = aufbau(variante, tag);
  const soll = [...g.buildings.values()].reduce((n, b) => n + b.maxHp, 0);
  const kern0 = g.coreHp;
  /* Der Kern ist für diese Messung unverwundbar. Sonst endet der Lauf mit
     seinem Tod, und gemessen wäre nur, wie lange er durchhielt — die
     Frage ist aber, wie viel Struktur in derselben Welle verloren geht.
     Alles andere läuft normal weiter. Mit `kern` wird das umgekehrt: dann
     stehen die Prüfplätze am Kern, und der Kernschaden ist die Kennzahl. */
  if (!KERN) g.damageCore = () => {};
  g.wave = welle - 1;
  g.planNext();
  g.startWave();
  let t = 0;
  while (!g.over && g.phase === 'combat' && t < 30 * 90) { g.update(1 / 30); t++; }
  const ist = [...g.buildings.values()].reduce((n, b) => n + b.hp, 0);
  return {
    fehlt: soll - ist,                       // verlorene Struktur, Zerstörtes eingeschlossen
    kern: kern0 - g.coreHp,
    energie: g.stats.energie,
    tot: g.over ? 1 : 0
  };
}

const N = +(process.argv[2] || 60);
const WELLE = +(process.argv[3] || 8);
const mittel = a => a.reduce((x, y) => x + y, 0) / a.length;
const arten = ['blaster', 'drohne', 'schild'];

const werte = {}, energie = {}, kern = {}, tot = {};
for (const v of arten) { werte[v] = []; energie[v] = []; kern[v] = []; tot[v] = []; }
for (let i = 0; i < N; i++)
  for (const v of arten) {
    const r = lauf(v, WELLE, 'mess-' + i);
    werte[v].push(r.fehlt);
    energie[v].push(r.energie);
    kern[v].push(r.kern);
    tot[v].push(r.tot);
  }
console.log('Welle ' + WELLE + ', je ' + N + ' gepaarte Läufe (gleiche Welle je Lauf)' +
            (UEBERSCHUSS ? ', mit Energieüberschuss' : ', Energie knapp') +
            (KERN ? ', Prüfplätze am Kern' : ''));
for (const v of arten) {
  const diff = werte[v].map((x, i) => x - werte.blaster[i]);
  const besser = diff.filter(d => d < 0).length;
  console.log(v.padEnd(8) +
    ' Struktur weg ' + mittel(werte[v]).toFixed(1).padStart(7) +
    ' | gegen Blaster ' + (mittel(diff) >= 0 ? '+' : '') + mittel(diff).toFixed(1).padStart(6) +
    ' | besser in ' + besser + '/' + N +
    ' | Energie ' + mittel(energie[v]).toFixed(0).padStart(5) +
    ' | Kernschaden ' + mittel(kern[v]).toFixed(1).padStart(6) +
    ' | Kern verloren ' + tot[v].reduce((a, b) => a + b, 0) + '/' + N);
}
