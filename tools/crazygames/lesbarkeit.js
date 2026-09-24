/* Lesbarkeit im kleinen Fenster, für den CrazyGames-Export.
   Aufruf aus tools/build-crazygames.sh nach der Übersetzung:
   node tools/crazygames/lesbarkeit.js <ziel>

   CrazyGames testet in 16:9-Fenstern ab 821×462 Pixeln bei
   devicePixelRatio 1. Das Spiel ist für 1312×800 gebaut und wird als
   Ganzes verkleinert; dort landet die Schrift bei 5 bis 7 Pixeln. Die
   HTML-Bedienung gleicht das per CSS-zoom aus (crazygames.css, Faktor
   aus sdk.js). Was game.js direkt ins Canvas schreibt, liest den Faktor
   hier aus der globalen Variable UIK: Schriftgrößen und die Maße der
   Hover-Karte, die sich an Kopf- und Taskleiste ausrichten.

   Jede Stelle muss so oft vorkommen wie angegeben, sonst Abbruch — ändert
   sich game.js, soll das hier auffallen und nicht still danebengreifen. */
'use strict';
const fs = require('fs');
const path = require('path');

const ziel = process.argv[2];
if (!ziel) { console.error('Aufruf: node lesbarkeit.js <zielordner>'); process.exit(2); }

const STELLEN = [
  // Schriften im Canvas: '600 9px sans-serif' → '600 ' + 9 * UIK + 'px sans-serif'
  [/ctx\.font = '(600 )?(\d+)px sans-serif'/g, (m, dick, px) => `ctx.font = '${dick || ''}' + ${px} * UIK + 'px sans-serif'`, 9],
  // Hover-Karte: Innenmaße und Grundlinien wachsen mit der Schrift
  ['const PAD = 9, ZEILE = 15, KOPF = 19, LUECKE = 16;',
   'const PAD = 9 * UIK, ZEILE = 15 * UIK, KOPF = 19 * UIK, LUECKE = 16 * UIK;', 1],
  ['ctx.fillText(titel, x + PAD, y + PAD + 11);', 'ctx.fillText(titel, x + PAD, y + PAD + 11 * UIK);', 1],
  ['let zy = y + PAD + KOPF + 8;', 'let zy = y + PAD + KOPF + 8 * UIK;', 1],
  // … und bleibt zwischen Kopf- und Taskleiste, die mitgewachsen sind
  ['clamp(game.hover.y * GRID.cell - 8, 62, H - h - 84)',
   'clamp(game.hover.y * GRID.cell - 8, 62 * UIK, H - h - 84 * UIK)', 1],
  // Der Inspektor steht mit right/top und seiner Größe in gezoomten Pixeln
  ['{ x: W - 12 - ins.offsetWidth, o: 64, u: 64 + ins.offsetHeight }',
   '{ x: W - (12 + ins.offsetWidth) * UIK, o: 64 * UIK, u: (64 + ins.offsetHeight) * UIK }', 1],
  // Bauplan-Zeile: Abstand unter der Kopfleiste und zwischen den zwei Zeilen
  ['CORE_PX.y + p.ziel * H * .32 : 150;', 'CORE_PX.y + p.ziel * H * .32 : 150 * UIK;', 1],
  ['tx, ty + 17);', 'tx, ty + 17 * UIK);', 1]
];

const fehler = [];
const datei = path.join(ziel, 'js/game.js');
let src = fs.readFileSync(datei, 'utf8');
for (const [von, nach, soll] of STELLEN) {
  const n = typeof von === 'string' ? src.split(von).length - 1 : (src.match(von) || []).length;
  if (n !== soll) { fehler.push(`game.js: ${von} kommt ${n}× vor statt ${soll}×`); continue; }
  src = typeof von === 'string' ? src.split(von).join(nach) : src.replace(von, nach);
}
// UIK muss stehen, bevor irgendetwas zeichnet; sdk.js setzt den echten Wert
if (!src.startsWith("'use strict';\n")) fehler.push("game.js beginnt nicht mit 'use strict';");
src = src.replace("'use strict';\n", "'use strict';\nvar UIK = 1;   // Ausgleich fürs kleine Fenster, gesetzt von sdk.js\n");

if (fehler.length) {
  console.error(fehler.join('\n') + `\n${fehler.length} Fehler — Lesbarkeit abgebrochen.`);
  process.exit(1);
}
fs.writeFileSync(datei, src);
console.log(`Lesbarkeit: ${STELLEN.length} Stellen angepasst.`);
