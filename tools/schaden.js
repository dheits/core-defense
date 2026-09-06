'use strict';
/* ---------------------------------------------------------------
   Wie viel Schaden macht welcher Turmtyp wirklich?

     node tools/schaden.js [Läufe] [Welle]
     node tools/schaden.js 30 8      Voreinstellung: 30 Läufe auf Welle 8
     node tools/schaden.js 30 16     dasselbe später, wenn die Gegner zäher sind

   Der Bot taugt für diese Frage nicht: Er baut die Typen im Wechsel, also
   entscheidet seine Reihenfolge mit, wer wie oft schießt. Hier steht
   stattdessen ein fester Aufbau — von jedem Turmtyp gleich viele Stück,
   gleichmäßig auf den Ring verteilt, alle versorgt, Energie im Überfluss.
   Danach läuft eine Welle, und gezählt wird `b.schaden`: dasselbe Feld,
   das auch die Bilanz nach der Welle im Spiel anzeigt.

   Gemessen wird damit die Feuerkraft am selben Platz gegen dieselben
   Gegner — nicht der Wert im Spiel. Ein Turm, der hier hinten liegt, kann
   trotzdem gut sein, wenn er verlangsamt, Pulks trifft oder tote Winkel
   deckt. Die Spalte „Schaden je Energie" ist deshalb die interessantere:
   Energie ist im Spiel die knappe Größe, nicht der Bauplatz.
---------------------------------------------------------------- */
const path = require('path');
const PRUEFSTAND = path.resolve(__dirname, 'harness.js');
const TYPEN = ['blaster', 'cannon', 'frost', 'arc', 'mine'];

let DEFS = null;          // die Gebäudetabelle des letzten Laufs, für die Ausgabe

function lauf(welle, tag) {
  delete require.cache[PRUEFSTAND];
  if (global.localStorage) global.localStorage.clear();
  const h = require(PRUEFSTAND);
  const g = h.game, C = h.CORE;
  DEFS = h.BUILDINGS;
  g.beginnen(tag);
  g.neuesGelaende(0);
  g.matter = 1e6;

  // Innen Reaktoren, darum ein Pylonring — so ist jeder Turm draußen versorgt
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI * 2 / 12;
    g.build('reactor', Math.round(C.cx + Math.cos(a) * 2), Math.round(C.cy + Math.sin(a) * 2));
  }
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    g.build('pylon', Math.round(C.cx + Math.cos(a) * 4), Math.round(C.cy + Math.sin(a) * 4));
  }
  /* Die Türme im Wechsel auf die Plätze des äußeren Rings: So bekommt
     jeder Typ dieselbe Mischung aus Richtungen, und keiner steht
     geschlossen dort, wo die Welle zufällig hereinkommt. */
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const x = Math.round(C.cx + Math.cos(a) * 6.4), y = Math.round(C.cy + Math.sin(a) * 6.4);
    if (g.free(x, y)) { g.build(TYPEN[n % TYPEN.length], x, y); n++; }
  }
  g.recomputeSupply();
  g.energyMax = 1e6; g.energy = 1e6; g.regen = 1e5;   // Energie soll nichts begrenzen
  g.damageCore = () => {};                            // der Lauf soll die Welle zu Ende sehen

  g.wave = welle - 1;
  g.planNext();
  g.startWave();
  let t = 0;
  while (!g.over && g.phase === 'combat' && t < 30 * 90) { g.update(1 / 30); t++; }

  const summe = {}, zahl = {};
  for (const b of g.buildings.values()) {
    if (!b.def.turret) continue;
    summe[b.type] = (summe[b.type] || 0) + (b.schaden || 0);
    zahl[b.type] = (zahl[b.type] || 0) + 1;
  }
  return { summe, zahl };
}

const N = +(process.argv[2] || 30);
const WELLE = +(process.argv[3] || 8);
const gesamt = {}, stueck = {};
for (const t of TYPEN) { gesamt[t] = 0; stueck[t] = 0; }
for (let i = 0; i < N; i++) {
  const r = lauf(WELLE, 'schaden-' + i);
  /* Über alle Läufe summiert, Schaden wie Stückzahl: Das Gelände wechselt
     mit dem Tag, deshalb ist gelegentlich ein Ringplatz belegt und ein Typ
     steht einmal nur dreimal statt viermal. */
  for (const t of TYPEN) {
    gesamt[t] += r.summe[t] || 0;
    stueck[t] += r.zahl[t] || 0;
  }
}
console.log('Welle ' + WELLE + ', ' + N + ' Läufe, Türme je Typ insgesamt ' +
            TYPEN.map(t => t + ':' + stueck[t]).join(' '));
const basis = gesamt.blaster / (stueck.blaster || 1);
for (const t of TYPEN) {
  const jeTurm = gesamt[t] / (stueck[t] || 1);
  const last = DEFS[t].energy / DEFS[t].cooldown;      // Dauerlast bei ununterbrochenem Feuer
  console.log(t.padEnd(8) +
    ' Schaden je Turm und Welle ' + jeTurm.toFixed(0).padStart(6) +
    ' | gegen Blaster ' + (100 * gesamt[t] / (stueck[t] || 1) / (basis || 1)).toFixed(0).padStart(4) + ' %' +
    ' | Dauerlast ' + last.toFixed(2).padStart(5) + '/s' +
    ' | Schaden je Energie ' + (jeTurm / last).toFixed(1).padStart(6));
}
