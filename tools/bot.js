'use strict';
/* ---------------------------------------------------------------
   Simulierter Spieler für Balance-Messungen.

     node tools/bot.js [Läufe] [Wellenlimit] [Schalter,...]
     node tools/bot.js 100 40                  100 Partien bis Welle 40
     node tools/bot.js 60 40 noflow,nomod      ohne Leitungslast und Sturmwellen
     node tools/bot.js 1 40 log                eine Partie mit Verlaufsprotokoll

   Schalter: noflow (Leitungen ohne Grenze), nomod (keine Sturmwellen),
             nopower (keine Kernbefehle), noakku (keine Akkus bauen),
             nomode (Kernmodus nie wechseln), nodruck (Wellen kommen
             gleichverteilt statt dorthin, wo es zuletzt eng wurde),
             schief (der Bot lässt den Norden frei — so wird sichtbar, was
             das Druckgedächtnis mit einer Schwachstelle macht),
             nogelaende (leeres Feld statt erzeugtem Gelände),
             neu (Lichtbogen und Minenleger in die Turmauswahl aufnehmen),
             stuetzen (Werkdrohnen und Schildfelder dazubauen; unabhängig
                       von `neu`, damit sich beides getrennt messen lässt),
             log (Verlauf ausgeben).

   Der Bot spielt bewusst schlicht: Er hält jede Himmelsrichtung mit
   Türmen besetzt, baut Reaktoren, bevor der Verbrauch die Erzeugung zu
   weit übersteigt, stellt einen Akku dazu, sobald der Puffer keine
   Feuerpause mehr überbrückt, entlastet überlastete Äste, schaltet vor
   Bosswellen auf den Schildmodus, baut aus, wenn sonst nichts ansteht,
   und nimmt eine zufällige Karte.

   WICHTIG für die Auswertung: Er nutzt weder Lastprioritäten noch
   Überladung und stellt Reaktoren nicht planvoll an die richtige
   Stelle. Bei der Leitungslast unterschätzt er einen menschlichen
   Spieler deshalb deutlich. Absolute Zahlen sagen wenig — aussagekräftig
   ist nur der Vergleich zweier Konfigurationen MIT DERSELBEN Bot-Version.
   Und die Streuung ist groß: Unter 60 Läufen wandert der Median um
   mehrere Wellen. Kennzahl ist der Median, nicht der Schnitt, weil die
   Verteilung zwei Häufungen hat.
---------------------------------------------------------------- */
const path = require('path');
const PRUEFSTAND = path.resolve(__dirname, 'harness.js');

// Reaktor bauen, sobald der Dauerverbrauch das Doppelte der Erzeugung übersteigt
const NACHSCHUB_VERHAELTNIS = 2.0;
// So viele Sekunden Dauerfeuer soll der Puffer tragen — sonst kommt ein Akku dazu
const PUFFER_SEKUNDEN = 3.5;

function frischeRunde() {
  delete require.cache[PRUEFSTAND];
  /* Den Speicher leeren, bevor das Spiel neu geladen wird: Es sucht beim
     Start nach einem Spielstand und würde sonst mit dem Aufbau des
     vorigen Laufs weitermachen — jede Messung ab Lauf zwei wäre wertlos.
     Festgehalten in tools/pruefen.js, „Ein alter Spielstand …". */
  if (global.localStorage) global.localStorage.clear();
  return require(PRUEFSTAND);
}

function lauf(maxWelle, opt = {}) {
  const h = frischeRunde(), g = h.game, C = h.CORE, GRID = h.GRID;
  // Der Bot drückt auf „Freies Feld" — ein Tagesfeld wäre in jedem Lauf
  // dasselbe und damit als Messung wertlos.
  g.beginnen('');
  if (opt.ohneLast) {                       // Leitungen praktisch grenzenlos
    h.FLOW.core = 1e6; h.FLOW.pylon = 1e6; h.FLOW.perLevel = 0;
    g.recomputeSupply();
  }
  if (opt.ohneMods) h.setModChance(0);
  // Spanne 0 heißt: Alle Sektoren behalten Gewicht 1, das Gedächtnis wird
  // weiter geführt, wirkt aber nicht. Genau der Vergleich, den man will.
  if (opt.ohneDruck) h.DRUCK.spanne = 0;
  if (opt.ohneGelaende) g.neuesGelaende(0);   // Seed 0 räumt das Feld ab

  const zelle = GRID.cell;
  const kosten = t => g.costOf(t);
  /* `neu`: Die beiden späten Türme kommen in dieselbe Rotation wie die
     drei alten. Nur so lässt sich vergleichen, ob sie mithalten — ein
     Bot, der sie nie baut, misst sie auch nicht. */
  const turmTypen = opt.neueTuerme ? ['blaster', 'cannon', 'frost', 'arc', 'mine']
                                   : ['blaster', 'cannon', 'frost'];

  // Alle Bauplätze im Ring um den Kern, von innen nach außen sortiert
  const plaetze = [];
  for (let x = 0; x < GRID.cols; x++)
    for (let y = 0; y < GRID.rows; y++) {
      const d = Math.hypot(x - C.cx, y - C.cy);
      if (d > 2 && d < 13) plaetze.push({ x, y, d, a: Math.atan2(y - C.cy, x - C.cx) });
    }
  plaetze.sort((p, q) => p.d - q.d);

  const frei = (x, y) => g.free(x, y);
  const versorgt = (x, y) => g.sources.some(s => Math.hypot(x - s.x, y - s.y) <= s.r);
  const sektor = p => Math.round(((p.a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  const bedarf = () => [...g.buildings.values()].reduce((n, b) => n + g.drawOf(b), 0);

  function bauen() {
    let sicherung = 300;                    // gegen Endlosschleifen bei vollem Feld
    while (sicherung-- > 0) {
      // 1. Nachschub zuerst — ohne Energie nützt der schönste Turm nichts
      if (bedarf() > g.regen * NACHSCHUB_VERHAELTNIS && g.matter >= kosten('reactor')) {
        const p = plaetze.find(q => frei(q.x, q.y) && versorgt(q.x, q.y));
        if (p) { g.build('reactor', p.x, p.y); continue; }
      }
      // 1b. Speicher, sobald der Puffer keine Feuerpause mehr überbrückt.
      //     Reaktoren liefern seit der Trennung keinen Speicher mehr.
      if (!opt.ohneAkkus && g.energyMax < bedarf() * PUFFER_SEKUNDEN &&
          g.matter >= kosten('akku')) {
        const p = plaetze.find(q => frei(q.x, q.y) && versorgt(q.x, q.y));
        if (p) { g.build('akku', p.x, p.y); continue; }
      }
      // 2. Überlastete Äste mit einem Reaktor direkt am Knoten entlasten
      const voll = g.sources.filter(s => s.ratio > 1 && s.node);
      if (voll.length && g.matter >= kosten('reactor')) {
        const s = voll[0];
        const p = plaetze.find(q => frei(q.x, q.y) &&
                                    Math.hypot(q.x - s.x, q.y - s.y) <= s.r - 0.5);
        if (p) { g.build('reactor', p.x, p.y); continue; }
      }
      // 3. Die schwächste Himmelsrichtung bekommt den nächsten Turm.
      //    Ab Welle 2 gemischte Typen — wer den gepanzerten Brutes ab
      //    Welle 4 nur mit Blastern begegnet, verliert dort zuverlässig.
      const proSektor = [0, 0, 0, 0, 0, 0, 0, 0];
      for (const b of g.buildings.values())
        if (b.def.turret) proSektor[sektor({ a: Math.atan2(b.y - C.cy, b.x - C.cx) })]++;
      /* `schief`: Der Norden bleibt absichtlich unbesetzt. Nur zum Messen —
         der sonst rundum gleichmäßige Bot hat gar keine schwache Seite, an
         der sich das Druckgedächtnis überhaupt zeigen könnte. */
      if (opt.schief) proSektor[6] = 1e6;
      const duenn = proSektor.indexOf(Math.min(...proSektor));
      const typ = turmTypen[g.wave < 2 ? 0 : (g.wave + duenn) % turmTypen.length];
      if (g.matter >= kosten(typ)) {
        const p = plaetze.find(q => frei(q.x, q.y) && versorgt(q.x, q.y) && sektor(q) === duenn);
        if (p) { g.build(typ, p.x, p.y); continue; }
        // Kein versorgter Platz dort: das Netz in die Richtung verlängern
        if (g.matter >= kosten('pylon') + kosten(typ)) {
          const aussen = plaetze
            .filter(q => frei(q.x, q.y) && versorgt(q.x, q.y) && sektor(q) === duenn)
            .sort((a, b) => b.d - a.d)[0]
            || plaetze.filter(q => frei(q.x, q.y) && versorgt(q.x, q.y))
                      .sort((a, b) => b.d - a.d)[0];
          if (aussen) { g.build('pylon', aussen.x, aussen.y); continue; }
        }
      }
      /* 3b. `stuetzen`: auf je fünf Türme ein Stützbau, abwechselnd
         Werkdrohne und Schildfeld, neben einen bestehenden Turm. Der Bot
         repariert zwischen den Wellen ohnehin alles — den Stützbauten
         bleibt damit nur, was sie WÄHREND der Welle halten. */
      if (opt.stuetzen) {
        const tuerme = [...g.buildings.values()].filter(b => b.def.turret);
        const stuetzen = [...g.buildings.values()].filter(b => b.def.support);
        if (tuerme.length >= 5 && stuetzen.length < Math.floor(tuerme.length / 5)) {
          const typ2 = stuetzen.length % 2 ? 'schild' : 'drohne';
          const ziel = tuerme[(stuetzen.length * 3) % tuerme.length];
          const p = plaetze.find(q => frei(q.x, q.y) && versorgt(q.x, q.y) &&
                                      Math.hypot(q.x - ziel.x, q.y - ziel.y) <= 2.2);
          if (p && g.matter >= kosten(typ2)) { g.build(typ2, p.x, p.y); continue; }
        }
      }
      // 4. Sonst die billigste Ausbaustufe mitnehmen
      const aus = [...g.buildings.values()]
        .filter(b => b.level < h.UPGRADE.maxLevel && (b.def.turret || b.type === 'pylon'))
        .sort((a, b) => g.upgradeCost(a) - g.upgradeCost(b))[0];
      if (aus && g.matter >= g.upgradeCost(aus)) { g.upgrade(aus); continue; }
      break;
    }
    g.repairAll();
  }

  /* Kernmodus: vor einer Bosswelle das Schild, sonst Einspeisung. Der
     Anlauf ist in der Bauphase billig — genau dort wechselt der Bot. */
  function modus() {
    if (opt.ohneModi || g.modeTimer > 0) return;
    const ziel = h.bossFor(g.wave + 1) ? 2 : 0;
    if (g.coreMode !== ziel) g.setMode(ziel);
  }

  function befehle() {
    if (opt.ohnePowers) return;
    const nah = g.enemies.filter(e =>
      Math.hypot(e.x - (C.cx + .5) * zelle, e.y - (C.cy + .5) * zelle) < 5 * zelle).length;
    if (nah >= 4 && g.energy > g.powerCost(h.POWERS.discharge)) g.usePower('discharge');
    if ((g.boss || g.enemies.length > 14) && g.energy > g.energyMax * 0.75) g.usePower('surge');
    if (g.energy > g.energyMax * 0.8 &&
        [...g.buildings.values()].some(b => b.hp < b.maxHp * 0.6)) g.usePower('pulse');
  }

  function protokoll(t) {
    const tuerme = [...g.buildings.values()].filter(b => b.def.turret);
    const drossel = Math.min(...tuerme.map(b => b.flow).concat([1]));
    console.log('  Welle ' + String(g.wave).padStart(2) +
      ' | Kern ' + String(Math.round(g.coreHp)).padStart(4) +
      ' | Materie ' + String(Math.round(g.matter)).padStart(4) +
      ' | Türme ' + String(tuerme.length).padStart(2) +
      ' | Regen ' + String(g.regen).padStart(5) +
      ' | Drossel ' + Math.round(drossel * 100) + '%' +
      ' | Sturm ' + (g.mod ? g.mod.name : '—'));
  }

  // Karte zufällig nehmen — eine feste Wahl würde die Messung verzerren
  const karteNehmen = () => { if (g.draft) g.takeCard((Math.random() * g.draft.length) | 0); };

  let t = 0, letzteWelle = 0;
  const SCHRITT = 1 / 30;                   // grober als das Spiel, aber viermal schneller
  while (!g.over && g.wave < maxWelle && t < 30 * 60 * 60) {
    g.update(SCHRITT); t++;
    if (opt.log && g.wave !== letzteWelle) { letzteWelle = g.wave; protokoll(t); }
    if (g.draft) { karteNehmen(); continue; }
    if (g.phase === 'build') {
      if (t % 15 === 0) { bauen(); modus(); }
      if (g.buildTimer < 1) { bauen(); g.startWave(); }
    } else if (t % 10 === 0) befehle();
  }
  return { wave: g.wave, verloren: g.over };
}

/* ------------------------- Aufruf ------------------------- */
if (require.main === module) {
  const N = +(process.argv[2] || 20);
  const MAX = +(process.argv[3] || 40);
  const schalter = (process.argv[4] || '').split(',');
  const opt = {
    ohnePowers: schalter.includes('nopower'),
    ohneLast: schalter.includes('noflow'),
    ohneMods: schalter.includes('nomod'),
    ohneAkkus: schalter.includes('noakku'),
    ohneModi: schalter.includes('nomode'),
    ohneDruck: schalter.includes('nodruck'),
    schief: schalter.includes('schief'),
    ohneGelaende: schalter.includes('nogelaende'),
    neueTuerme: schalter.includes('neu'),
    stuetzen: schalter.includes('stuetzen'),
    log: schalter.includes('log')
  };

  const wellen = [];
  for (let i = 0; i < N; i++) wellen.push(lauf(MAX, opt).wave);
  wellen.sort((a, b) => a - b);

  const haeufig = {};
  for (const w of wellen) haeufig[w] = (haeufig[w] || 0) + 1;
  const schnitt = wellen.reduce((a, b) => a + b, 0) / wellen.length;
  console.log('Verteilung:', Object.entries(haeufig).map(([k, v]) => k + ':' + v).join(' '));
  console.log('Median ' + wellen[(wellen.length / 2) | 0] +
    ' | Schnitt ' + Math.round(schnitt * 10) / 10 +
    ' | min ' + wellen[0] + ' | max ' + wellen[wellen.length - 1] +
    ' | am Limit ' + wellen.filter(w => w >= MAX).length + '/' + N);
}

module.exports = { lauf };
