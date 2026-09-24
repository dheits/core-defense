/* Übersetzt die fertig kopierten Dateien in dist-crazygames/ ins Englische.
   Aufruf aus tools/build-crazygames.sh: node tools/crazygames/uebersetzen.js <ziel>

   Ersetzt wird je Zeichenkette, nicht je Textstelle im Quelltext: Ein
   Suchen-und-Ersetzen über die ganze Datei träfe auch Kommentare, Schlüssel
   und Bezeichner. Dafür braucht es einen kleinen Scanner, der Kommentare,
   Regex-Literale und Zeichenketten auseinanderhält — für unseren eigenen
   Quelltext reicht er, einen allgemeinen JavaScript-Parser ersetzt er nicht.

   Abbruch, sobald etwas nicht aufgeht: ein Text ohne Übersetzung, eine
   Stelle, die nicht genau einmal vorkommt, ein Umlaut, der übrig bleibt.
   Ein halb übersetzter Export soll gar nicht erst entstehen. */
'use strict';
const fs = require('fs');
const path = require('path');
const EN = require('./en.js');
const TEXTE = Object.assign({}, EN.texte, EN.einfuehrung);

const ziel = process.argv[2];
if (!ziel) { console.error('Aufruf: node uebersetzen.js <zielordner>'); process.exit(2); }

const fehler = [];
const benutzt = new Set();
const code = new Set(EN.code);

/* Braucht diese Zeichenkette eine Übersetzung? Großbuchstaben, Umlaute oder
   ein Leerzeichen zwischen Wörtern sprechen für Text. Kleingeschriebene
   Einzelwörter sind fast immer Schlüssel — die wenigen, die angezeigt
   werden, stehen ausdrücklich im Wörterbuch. */
function istText(s) {
  if (/^[a-z][A-Za-z0-9]*$/.test(s)) return false;                   // Bezeichner, auch camelCase
  s = s.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ');       // Markup und Platzhalter zählen nicht
  if (!/[A-Za-zÄÖÜäöüß]{2,}/.test(s)) return false;
  if (/^[#.][\w-]+$/.test(s)) return false;                         // Farbe oder Selektor
  if (/^\d+ ?\d*px [\w-]+$|^\d+px [\w-]+$/.test(s)) return false;   // Schriftangaben
  if (/^[\d ]*\d+px sans-serif$/.test(s)) return false;
  return /[A-ZÄÖÜäöüß]/.test(s) || /[A-Za-z] +[A-Za-z]/.test(s);
}

/* Zerlegt Quelltext in Zeichenketten mit Position. Ein '/' eröffnet ein
   Regex-Literal, wenn davor kein Wert stehen kann. */
function zeichenketten(src) {
  const out = [];
  let i = 0, vorher = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '/' && (vorher === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(vorher) || /\breturn$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      let j = i + 1, klasse = false;
      while (j < src.length && (src[j] !== '/' || klasse)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') klasse = true;
        else if (src[j] === ']') klasse = false;
        j++;
      }
      i = j + 1; vorher = 'x'; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') throw new Error('offene Zeichenkette bei ' + i); j++; }
      const roh = src.slice(i, j + 1);
      out.push({ von: i, bis: j + 1, quote: c, wert: Function('return ' + roh)() });
      i = j + 1; vorher = 'x'; continue;
    }
    if (c === '`') {
      let j = i + 1, tiefe = 0;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (tiefe === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { tiefe++; j += 2; continue; }
        if (tiefe > 0 && src[j] === '{') tiefe++;
        if (tiefe > 0 && src[j] === '}') tiefe--;
        j++;
      }
      out.push({ von: i, bis: j + 1, quote: '`', wert: src.slice(i + 1, j) });
      i = j + 1; vorher = 'x'; continue;
    }
    if (!/\s/.test(c)) vorher = c;
    i++;
  }
  return out;
}

function alsLiteral(text, quote) {
  if (quote === '`') return '`' + text + '`';
  return quote + text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .split(quote).join('\\' + quote) + quote;
}

function stellen(datei, src) {
  for (const [d, von, nach] of EN.stellen) {
    if (d !== datei) continue;
    const n = src.split(von).length - 1;
    if (n !== 1) { fehler.push(`${datei}: Stelle kommt ${n}× vor statt 1×: ${von}`); continue; }
    src = src.replace(von, () => nach);
  }
  return src;
}

for (const datei of ['js/config.js', 'js/entities.js', 'js/audio.js', 'js/game.js', 'js/einfuehrung.js']) {
  const pfad = path.join(ziel, datei);
  let src = stellen(datei, fs.readFileSync(pfad, 'utf8'));
  let neu = '', pos = 0;
  for (const z of zeichenketten(src)) {
    let ersatz = null;
    if (Object.prototype.hasOwnProperty.call(TEXTE, z.wert)) {
      benutzt.add(z.wert);
      ersatz = alsLiteral(TEXTE[z.wert], z.quote);
    } else if (istText(z.wert) && !code.has(z.wert)) {
      const zeile = src.slice(0, z.von).split('\n').length;
      fehler.push(`${datei}:${zeile}: keine Übersetzung für ${JSON.stringify(z.wert)}`);
    }
    if (ersatz !== null) { neu += src.slice(pos, z.von) + ersatz; pos = z.bis; }
  }
  neu += src.slice(pos);
  /* Gegenprobe über das Ergebnis: Umlaute darf nur noch ein Kommentar enthalten. */
  for (const z of zeichenketten(neu))
    if (/[ÄÖÜäöüß]/.test(z.wert)) fehler.push(`${datei}: Umlaut übrig in ${JSON.stringify(z.wert)}`);
  fs.writeFileSync(pfad, neu);
}

const html = path.join(ziel, 'index.html');
let seite = fs.readFileSync(html, 'utf8');
for (const [von, nach] of EN.html) {
  const n = seite.split(von).length - 1;
  if (n !== 1) { fehler.push(`index.html: kommt ${n}× vor statt 1×: ${von}`); continue; }
  seite = seite.replace(von, () => nach);
}
const ohneStil = seite.replace(/<style>[\s\S]*?<\/style>/g, '');
if (/[ÄÖÜäöüß]/.test(ohneStil)) fehler.push('index.html: Umlaut übrig');
fs.writeFileSync(html, seite);

const unbenutzt = Object.keys(TEXTE).filter(k => !benutzt.has(k));
for (const k of unbenutzt) fehler.push(`en.js: Übersetzung ohne Verwendung: ${JSON.stringify(k)}`);

if (fehler.length) {
  console.error(fehler.join('\n'));
  console.error(`\n${fehler.length} Fehler — Übersetzung abgebrochen.`);
  process.exit(1);
}
console.log(`Übersetzt: ${benutzt.size} Texte, ${EN.stellen.length} Stellen, ${EN.html.length} Seitenstellen.`);
