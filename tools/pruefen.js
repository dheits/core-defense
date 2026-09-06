'use strict';
/* ---------------------------------------------------------------
   Selbsttest der Spielmechaniken.

     node tools/pruefen.js

   Geprüft wird das, was sich nicht ansehen lässt: ob die Leitungslast
   genau so drosselt wie gerechnet, ob ein Kernbefehl den Puffer richtig
   abzieht, ob ein Sturm dort angreift, wo er soll. Jede Prüfung nennt
   den erwarteten Wert ausdrücklich — verschiebt jemand eine Zahl in
   config.js, schlägt sie fehl und sagt, um wie viel.

   Absichtlich keine Bibliothek: der Prüfstand kommt ohne aus, und das
   soll hier auch so bleiben.
---------------------------------------------------------------- */
const path = require('path');
const PRUEFSTAND = path.resolve(__dirname, 'harness.js');

/* Frischer Prüfstand. Der Speicher wird dabei geleert — ein Spielstand
   aus einer vorherigen Prüfung würde sonst beim Start der nächsten
   geladen und deren Aufbau überschreiben. */
function frisch() {
  delete require.cache[PRUEFSTAND];
  if (global.localStorage) global.localStorage.clear();
  return require(PRUEFSTAND);
}
// Dasselbe, aber mit erhaltenem Speicher — das ist ein Neuladen der Seite
function weiter() {
  delete require.cache[PRUEFSTAND];
  return require(PRUEFSTAND);
}

/* ------------------------ Gerüst ------------------------ */
let gruppe = '', gut = 0;
const fehler = [];

function beschreibe(name, fn) {
  gruppe = name;
  try { fn(); }
  catch (e) { fehler.push(gruppe + ' — Abbruch: ' + e.message); }
}

function gleich(was, ist, soll, toleranz = 1e-9) {
  const ok = typeof ist === 'number' && typeof soll === 'number'
    ? Math.abs(ist - soll) <= toleranz
    : ist === soll;
  if (ok) { gut++; return; }
  fehler.push(gruppe + ' — ' + was + ': ' + runde(ist) + ', erwartet ' + runde(soll));
}
function stimmt(was, bedingung) {
  if (bedingung) { gut++; return; }
  fehler.push(gruppe + ' — ' + was);
}
const runde = z => typeof z === 'number' ? Math.round(z * 1e4) / 1e4 : String(z);

/* Baut ein Spiel mit Materie im Überfluss und liefert einen Baukürzel.
   Das erzeugte Gelände wird dabei abgeräumt (Seed 0): Jede Prüfung
   außerhalb des Geländeblocks baut auf festen Zellen, und ein zufällig
   dorthin gewürfeltes Trümmerfeld würde sie ohne eigenes Zutun umwerfen.
   Das Gelände selbst wird weiter unten mit festen Seeds geprüft. */
function neu() {
  const h = frisch();
  h.game.beginnen('');          // wie ein Klick auf „Freies Feld"
  h.game.neuesGelaende(0);      // …aber ohne Gelände, siehe oben
  h.game.matter = 1e6;
  h.bau = (typ, x, y) => { h.game.build(typ, x, y); return h.game.buildings.get(x + ',' + y); };
  return h;
}
// Ein unzerstörbares Ziel, damit Türme etwas zu beschießen haben
function ziel(h, zx, zy) {
  return { x: zx, y: zy, radius: 8, hp: 1e9, maxHp: 1e9, shield: 0, shieldCd: 0,
           armor: 0, dead: false, flying: false, hitFlash: 0, slowFactor: 1, slowUntil: 0,
           slowResist: 0, burnUntil: 0, freezeCd: 0, def: h.ENEMIES.crawler,
           update() {}, applySlow() {} };
}

/* --------------------- Leitungslast --------------------- */
beschreibe('Leitungslast', () => {
  const h = neu(), g = h.game;
  const pylon = h.bau('pylon', 25, 12);
  const tuerme = [h.bau('blaster', 28, 12), h.bau('blaster', 28, 11),
                  h.bau('blaster', 28, 13), h.bau('blaster', 29, 12)];
  g.recomputeSupply();

  const proBlaster = h.BUILDINGS.blaster.energy / h.BUILDINGS.blaster.cooldown;
  gleich('Dauerlast eines Blasters', g.drawOf(tuerme[0]), proBlaster);
  gleich('Kapazität eines frischen Pylons', pylon.node.cap, h.FLOW.pylon);
  gleich('Last am Pylon', pylon.node.through, 4 * proBlaster, 1e-6);
  gleich('Drosselung der Türme dahinter', tuerme[0].flow, h.FLOW.pylon / (4 * proBlaster), 1e-6);
  gleich('überlastete Knoten', g.overloadedNodes, 1);

  // Ein Reaktor am selben Knoten nimmt der Leitung seine Erzeugung ab
  h.bau('reactor', 26, 10);
  g.recomputeSupply();
  gleich('Last nach dem Reaktor', pylon.node.through,
         4 * proBlaster - h.BUILDINGS.reactor.regen, 1e-6);
  gleich('Drosselung aufgehoben', tuerme[0].flow, 1);
  gleich('kein Knoten mehr überlastet', g.overloadedNodes, 0);
});

beschreibe('Leitungslast: Ausbau und Kette', () => {
  const h = neu(), g = h.game;
  const p1 = h.bau('pylon', 25, 12), p2 = h.bau('pylon', 29, 12);
  h.bau('blaster', 32, 12); h.bau('blaster', 32, 11); h.bau('blaster', 32, 13);
  g.recomputeSupply();
  stimmt('zweiter Pylon hängt am ersten', p2.node.parent === p1.node);
  gleich('Last fließt durch beide gleich', p1.node.through, p2.node.through, 1e-9);

  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(p2);
  g.recomputeSupply();
  gleich('Kapazität auf Stufe 5', p2.node.cap,
         h.FLOW.pylon + h.FLOW.perLevel * (h.UPGRADE.maxLevel - 1));
});

beschreibe('Leitungslast: Feuerrate wirklich gedrosselt', () => {
  /* Die absolute Schusszahl hängt an der Schrittweite der Schleife und
     daran, dass ein frischer Turm sofort feuern darf. Aussagekräftig ist
     deshalb das VERHÄLTNIS: dieselbe Aufstellung einmal an der zu
     schwachen Leitung, einmal mit praktisch grenzenloser Leitung.

     Gerechnet wird mit feinen Schritten (1/600 s). Bei 1/60 kostet allein
     das Aufrunden auf ganze Schritte drei Prozent — die Abklingzeit 0,28 s
     dauert dann 17 Schritte statt 16,8 —, und das Verhältnis fiele auf
     0,85 statt 0,875. Das wäre ein Fehler der Messung, nicht des Spiels. */
  function schuesse(grenzenlos) {
    const h = neu(), g = h.game;
    if (grenzenlos) { h.FLOW.pylon = 1e6; h.FLOW.perLevel = 0; }
    h.bau('pylon', 25, 12);
    const t = [h.bau('blaster', 28, 12), h.bau('blaster', 28, 11),
               h.bau('blaster', 28, 13), h.bau('blaster', 29, 12)];
    g.recomputeSupply();
    g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6; g.regen = 0;
    g.spawnQueue = [{ at: 1e9 }];              // Welle darf nicht enden
    let n = 0;
    g.shoot = () => { n++; return { speed: 0 }; };
    g.hurt = () => {};
    g.enemies = [ziel(h, h.GRID.cell * 29.5, h.GRID.cell * 12.5)];
    for (let i = 0; i < 600 * 30; i++) g.update(1 / 600);
    return { n, flow: t[0].flow };
  }
  const eng = schuesse(false), weit = schuesse(true);
  gleich('ohne Engpass keine Drosselung', weit.flow, 1);
  gleich('Verhältnis der Schusszahlen entspricht der Drosselung',
         eng.n / weit.n, eng.flow, 0.005);
});

/* ---------------------- Kernbefehle ---------------------- */
beschreibe('Kernbefehl: Entladung', () => {
  const h = neu(), g = h.game, P = h.POWERS.discharge;
  const zelle = h.GRID.cell;
  const kx = (h.CORE.cx + .5) * zelle, ky = (h.CORE.cy + .5) * zelle;

  g.phase = 'build'; g.energy = g.energyMax;
  g.usePower('discharge');
  gleich('in der Bauphase verweigert', g.cooldowns.discharge, 0);

  g.phase = 'combat';
  const nah = ziel(h, kx + zelle, ky);
  const fern = ziel(h, kx + zelle * 12, ky);
  g.enemies = [nah, fern];
  const vorher = g.energy, kosten = g.powerCost(P);
  g.usePower('discharge');

  gleich('Pufferkosten', vorher - g.energy, kosten, 1e-6);
  const reichweite = P.radius * zelle;
  const erwartet = kosten * P.perEnergy * (1 - 0.55 * zelle / reichweite);
  gleich('Schaden am nahen Ziel', nah.maxHp - nah.hp, erwartet, 1e-6);
  gleich('fernes Ziel unberührt', fern.hp, fern.maxHp);
  gleich('Abklingzeit gesetzt', g.cooldowns.discharge, g.powerCd(P));

  g.energy = g.energyMax;
  g.usePower('discharge');
  gleich('zweiter Einsatz während der Abklingzeit verweigert',
         g.cooldowns.discharge, g.powerCd(P));
});

beschreibe('Kernbefehl: Netzstoß', () => {
  const h = neu(), g = h.game, P = h.POWERS.surge;
  const t = h.bau('blaster', 22, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6; g.regen = 0;
  g.hurt = () => {};
  g.enemies = [ziel(h, h.GRID.cell * 23.5, h.GRID.cell * 12.5)];

  let schaden = 0, schuesse = 0;
  g.shoot = (b, z, d) => { schaden = d; schuesse++; return { speed: 0 }; };

  const grund = g.stat(t, 'damage');
  const vorher = g.energy;
  for (let i = 0; i < 180; i++) g.update(1 / 60);
  const normal = (vorher - g.energy) / schuesse;
  gleich('Schaden ohne Netzstoß', schaden, grund, 1e-9);

  g.usePower('surge');
  gleich('Laufzeit', g.surge, P.time);
  const e1 = g.energy; schuesse = 0;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  gleich('Schaden im Netzstoß', schaden, grund * P.damage, 1e-9);
  gleich('Verbrauch im Netzstoß', (e1 - g.energy) / schuesse, normal * P.cost, 1e-6);

  for (let i = 0; i < 60 * 7; i++) g.update(1 / 60);
  gleich('Netzstoß läuft aus', g.surge, 0);
});

beschreibe('Kernbefehl: Notpuls', () => {
  const h = neu(), g = h.game, P = h.POWERS.pulse;
  const turm = h.bau('blaster', 22, 12);
  const mauer = h.bau('wall', 23, 12);
  const kalt = h.bau('blaster', 2, 2);        // außerhalb des Netzes
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;
  stimmt('entlegener Turm ist ohne Strom', !kalt.supplied);

  turm.hp = 10; mauer.hp = 10; kalt.hp = 10;
  const materie = g.matter;
  g.usePower('pulse');
  gleich('versorgter Turm geheilt', turm.hp, 10 + turm.maxHp * P.heal, 1e-6);
  stimmt('Barriere braucht keinen Strom und wird geheilt', mauer.hp > 10);
  gleich('kalter Turm bleibt beschädigt', kalt.hp, 10);
  gleich('kostet keine Materie', g.matter, materie);

  turm.hp = turm.maxHp; mauer.hp = mauer.maxHp; kalt.hp = kalt.maxHp;
  g.cooldowns.pulse = 0;
  g.usePower('pulse');
  gleich('bei heilen Bauten verweigert', g.cooldowns.pulse, 0);
});

/* ---------------------- Sturmwellen ---------------------- */
beschreibe('Sturmwellen', () => {
  const h = neu(), g = h.game;
  const M = Object.fromEntries(h.MODIFIERS.map(m => [m.id, m]));
  const turm = h.bau('blaster', 22, 12);
  g.recomputeSupply();
  g.wave = 8;

  const reichweite = g.stat(turm, 'range');
  g.mod = M.nebel;
  gleich('Störnebel kürzt die Reichweite', g.stat(turm, 'range'), reichweite * M.nebel.range, 1e-9);
  g.buffs.modImmune = ['nebel', 'emp'];
  gleich('Abschirmung hebt den Störnebel auf', g.stat(turm, 'range'), reichweite, 1e-9);
  g.buffs.modImmune = [];

  g.mod = M.emp;
  g.phase = 'combat'; g.spawnQueue = [{ at: 1e9 }];
  g.energyMax = 500; g.energy = 100; g.regen = 20;
  g.update(1);
  gleich('EMP bremst die Regeneration', g.energy - 100, 20 * M.emp.regen, 1e-6);

  g.mod = M.magnet;
  const geschoss = g.shoot(turm, ziel(h, 0, 0), 5);
  gleich('Magnetsturm bremst Geschosse',
         geschoss.speed, h.BUILDINGS.blaster.projSpeed * M.magnet.projSpeed, 1e-6);

  g.mod = M.kaeltefest;
  stimmt('Kältefest hebt jede Bremse auf', g.modv('noSlow', false) === true);

  g.enemies = [];
  g.mod = M.konvoi;
  gleich('Panzerkonvoi legt Panzerung drauf',
         g.spawn({ type: 'crawler', angle: 0 }).armor,
         (h.ENEMIES.crawler.armor || 0) + M.konvoi.armor);
  g.mod = M.hetzjagd;
  gleich('Hetzjagd macht schneller',
         g.spawn({ type: 'crawler', angle: 0 }).speed,
         h.ENEMIES.crawler.speed * M.hetzjagd.speed, 1e-6);
  g.mod = M.schwarm;
  const dünn = g.spawn({ type: 'crawler', angle: 0 });
  g.mod = null;
  const voll = g.spawn({ type: 'crawler', angle: 0 });
  gleich('Schwarm dünnt die Struktur aus',
         dünn.maxHp, Math.round(voll.maxHp * M.schwarm.hp), 1);
});

beschreibe('Sturmwellen: Ankündigung und Prämie', () => {
  const h = neu(), g = h.game;
  const M = Object.fromEntries(h.MODIFIERS.map(m => [m.id, m]));
  for (let w = 1; w < h.MOD_FROM_WAVE; w++) {
    let gefunden = false;
    for (let i = 0; i < 60; i++) if (g.planWave(w).mod) gefunden = true;
    stimmt('vor Welle ' + h.MOD_FROM_WAVE + ' kein Sturm (Welle ' + w + ')', !gefunden);
  }
  let aufBoss = false;
  for (let i = 0; i < 200; i++) if (g.planWave(10).mod) aufBoss = true;
  stimmt('auf Bosswellen kein Sturm', !aufBoss);

  // Schwarm bringt mehr Gegner mit, weil er das Wellenbudget hebt
  const ohne = g.planWave(9);
  ohne.mod = null;
  stimmt('Wellenplan enthält ein Modifikator-Feld', 'mod' in ohne);
});

/* ------------------ Reparatur und Abbau ------------------ */
beschreibe('Reparatur und Abbau', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(t);
  g.recomputeSupply();

  let wert = g.costOf('blaster');
  for (let l = 1; l < h.UPGRADE.maxLevel; l++)
    wert += Math.round(h.upgradeSteps(h.BUILDINGS.blaster.cost, l));
  gleich('Bauwert eines ausgebauten Turms', g.buildingValue(t), wert);

  t.hp = t.maxHp * 0.3;
  gleich('Reparaturkosten bei 70 % Schaden',
         g.repairCost(t), Math.ceil(0.7 * wert * h.REPAIR_SHARE), 1);

  const vorher = g.matter;
  g.repair(t);
  gleich('nach der Reparatur wieder heil', t.hp, t.maxHp);
  stimmt('Reparatur kostet Materie', g.matter < vorher);

  const m = g.matter;
  g.sell(t);
  gleich('Abbau erstattet den Anteil am vollen Bauwert',
         g.matter - m, Math.round(wert * g.buffs.refund), 1);
});

/* ---------------------- Verschieben ---------------------- */
beschreibe('Verschieben nimmt alles mit außer dem Ort', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(t);
  t.hp = t.maxHp * 0.4; t.prio = 2; t.ziel = 3; t.overload = true;
  const wert = g.buildingValue(t), hp = t.hp;

  gleich('Kosten: ein Viertel des Bauwerts', g.moveCost(t), Math.round(wert * h.MOVE_SHARE));

  const vorher = g.matter;
  stimmt('der Zug beginnt', g.verschiebeStart(t));
  stimmt('und kostet dabei noch nichts', g.matter === vorher);
  stimmt('der Umzug klappt', g.verschiebeZu(26, 15));

  gleich('bezahlt wird genau der Umzug', vorher - g.matter, g.moveCost(t));
  gleich('der Bau steht auf dem neuen Feld', g.buildings.get('26,15'), t);
  stimmt('und nicht mehr auf dem alten', !g.buildings.has('22,12'));
  gleich('die Zeichenposition wandert mit', t.px, (26 + .5) * h.GRID.cell);
  gleich('Stufe bleibt', t.level, h.UPGRADE.maxLevel);
  gleich('Schaden bleibt Schaden', t.hp, hp);
  stimmt('Einstellungen bleiben', t.prio === 2 && t.ziel === 3 && t.overload === true);
  stimmt('der Zug ist beendet', g.verschieben === null);
});

beschreibe('Verschieben ist billiger als Abbau und Neubau', () => {
  const h = neu();
  /* Der Umweg kostet netto 1 − Erstattung. Wäre Verschieben teurer,
     wäre es sinnlos — dann baut man lieber ab und neu. */
  stimmt('sonst wäre der Umweg der bessere Weg',
         h.MOVE_SHARE < 1 - h.SELL_REFUND);
});

beschreibe('Ein Umzug geht nur auf ein freies Feld', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 22, 12);
  h.bau('wall', 24, 12);
  g.gelaende[12 * h.GRID.cols + 26] = h.BODEN.truemmer;

  const probe = (was, x, y) => {
    g.verschiebeStart(t);
    const m = g.matter;
    stimmt(was, !g.verschiebeZu(x, y));
    stimmt(was + ' — und kostet nichts', g.matter === m);
    stimmt(was + ' — der Bau steht noch da', g.buildings.get('22,12') === t);
    g.verschiebeAbbrechen();
  };
  probe('nicht auf einen belegten Platz', 24, 12);
  probe('nicht in die Trümmer', 26, 12);
  probe('nicht auf den Kern', h.CORE.cx, h.CORE.cy);
  probe('nicht aus dem Feld heraus', -1, 12);

  g.verschiebeStart(t);
  g.matter = g.moveCost(t) - 1;
  stimmt('und nicht ohne Materie', !g.verschiebeZu(28, 18));
  stimmt('der Bau steht immer noch', g.buildings.get('22,12') === t);
});

beschreibe('Ein Umzug rechnet das Netz und den Boden neu', () => {
  const h = neu(), g = h.game;
  /* Ein Turm hängt am Pylon. Zieht der Pylon auf die andere Seite des
     Kerns, ist der Turm danach getrennt — der Umzug formt den Baum um. */
  const pylon = h.bau('pylon', 24, 12);
  const turm = h.bau('blaster', 27, 12);
  g.recomputeSupply();
  stimmt('anfangs versorgt', turm.supplied);

  g.verschiebeStart(pylon);
  g.verschiebeZu(20, 16);
  stimmt('nach dem Umzug getrennt', !turm.supplied);
  stimmt('der Pylon selbst hängt noch am Kern', pylon.supplied);
  const ohne = pylon.node.cap;

  // Die Leiterbahn hängt am Ort, nicht am Bau
  g.gelaende[17 * h.GRID.cols + 20] = h.BODEN.leiter;
  g.verschiebeStart(pylon);
  g.verschiebeZu(20, 17);
  stimmt('auf der Leiterbahn weiß er es', pylon.leiter === true);
  gleich('und trägt mehr', pylon.node.cap, ohne * h.GELAENDE.leiter, 1e-9);

  g.verschiebeStart(pylon);
  g.verschiebeZu(20, 15);
  stimmt('herunter vom Draht, wieder gewöhnlich', pylon.leiter === false);
  gleich('und wieder die normale Last', pylon.node.cap, ohne, 1e-9);
});

beschreibe('Ein Umzug überlebt das Neuladen, ein Abbruch kostet nichts', () => {
  const h = neu(), g = h.game;
  g.matter = 400;
  const t = h.bau('blaster', 22, 12);

  const vorAbbruch = g.matter;
  g.verschiebeStart(t);
  stimmt('der Abbruch meldet sich', g.verschiebeAbbrechen());
  stimmt('ein zweiter Abbruch hat nichts mehr zu tun', !g.verschiebeAbbrechen());
  gleich('und kostet nichts', g.matter, vorAbbruch);
  gleich('der Bau steht unverändert', g.buildings.get('22,12'), t);

  g.verschiebeStart(t);
  g.verschiebeZu(27, 16);
  const materie = Math.round(g.matter);

  const h2 = weiter();
  stimmt('der Stand lädt', h2.game.laden(h2.game.gespeicherteRunde()));
  stimmt('der Bau steht nach dem Neuladen auf dem neuen Feld',
         !!h2.game.buildings.get('27,16') && !h2.game.buildings.has('22,12'));
  gleich('und die bezahlte Materie ist weg', Math.round(h2.game.matter), materie);
  stimmt('geladen wird nie mitten im Zug', h2.game.verschieben === null);
});

beschreibe('Ein gefallener Bau zieht nicht mehr um', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 22, 12);
  g.verschiebeStart(t);
  g.damageBuilding(t, t.hp + 1);
  stimmt('der Zug ist mit ihm zu Ende', g.verschieben === null);
  stimmt('und läuft ins Leere', !g.verschiebeZu(26, 16));
  stimmt('nichts steht auf dem Zielfeld', !g.buildings.has('26,16'));

  // Dasselbe, wenn er zwischendurch verkauft wird
  const u = h.bau('blaster', 22, 12);
  g.verschiebeStart(u);
  g.sell(u);
  stimmt('auch der Abbau beendet den Zug', g.verschieben === null);
});

/* ------------------------ Bauplan ------------------------ */
beschreibe('Der Bauplan spiegelt an der Kernachse', () => {
  const h = neu(), g = h.game;
  h.bau('blaster', 14, 8);
  h.bau('wall', 16, 12);
  g.bauplan = { achse: 'x', ziel: 1 };

  const r = g.bauplanRechnung();
  gleich('beide Bauten haben einen Partner', r.n, 2);
  gleich('bezahlt wird der normale Neubaupreis',
         r.summe, g.costOf('blaster') + g.costOf('wall'));

  const m0 = g.matter;
  gleich('und beide entstehen', g.bauplanBauen(), 2);
  stimmt('an der gespiegelten Zelle',
         !!g.buildings.get('26,8') && !!g.buildings.get('24,12'));
  gleich('die Höhe bleibt, wie sie war', g.buildings.get('26,8').y, 8);
  gleich('abgezogen wird genau die Summe', m0 - g.matter, r.summe);
  stimmt('die Vorlage steht unverändert da', !!g.buildings.get('14,8'));
  stimmt('die Vorschau ist danach weg', g.bauplan === null);
});

beschreibe('Gespiegelt wird der Grundriss, nicht der Ausbau', () => {
  const h = neu(), g = h.game;
  const t = h.bau('cannon', 14, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(t);
  gleich('die Vorlage ist ausgebaut', t.level, h.UPGRADE.maxLevel);

  g.bauplan = { achse: 'x', ziel: 1 };
  const m0 = g.matter;
  g.bauplanBauen();
  const kopie = g.buildings.get('26,12');
  gleich('die Kopie fängt auf Stufe 1 an', kopie.level, 1);
  gleich('und kostet auch nur den Neubau', m0 - g.matter, g.costOf('cannon'));
  stimmt('deutlich weniger als die Vorlage wert ist', g.buildingValue(t) > g.costOf('cannon') * 3);
});

beschreibe('Der Bauplan lässt liegen, was nicht geht', () => {
  const h = neu(), g = h.game;
  h.bau('wall', 20, 5);                    // genau auf der Achse
  h.bau('wall', 26, 7);                    // steht schon auf der Zielseite
  h.bau('wall', 14, 9); h.bau('wall', 26, 9);   // Ziel belegt
  h.bau('wall', 14, 11);                   // Ziel liegt in Trümmern
  g.gelaende[11 * h.GRID.cols + 26] = h.BODEN.truemmer;
  h.bau('wall', 14, 13);                   // der einzige, der durchkommt

  g.bauplan = { achse: 'x', ziel: 1 };
  const ziele = g.bauplanZiele();
  gleich('genau ein Ziel bleibt übrig', ziele.length, 1);
  gleich('und zwar dieses', ziele[0].x + ',' + ziele[0].y, '26,13');
});

beschreibe('Reicht die Materie nicht, wächst der Plan von innen nach außen', () => {
  const h = neu(), g = h.game;
  h.bau('wall', 14, 12); h.bau('wall', 10, 12); h.bau('wall', 6, 12);
  g.bauplan = { achse: 'x', ziel: 1 };
  g.matter = g.costOf('wall') * 2 + 1;

  const r = g.bauplanRechnung();
  gleich('zwei von drei sind bezahlbar', r.n, 2);
  stimmt('und zwar die beiden inneren',
         r.ziele[0].x === 26 && r.ziele[1].x === 30 && r.ziele[2].zahlbar === false);

  g.bauplanBauen();
  stimmt('genau die stehen da',
         g.buildings.has('26,12') && g.buildings.has('30,12') && !g.buildings.has('34,12'));
  gleich('und die Materie reicht bis zum Rest', Math.round(g.matter), 1);
});

beschreibe('Der Zeiger wählt die Seite', () => {
  const h = neu(), g = h.game;
  h.bau('wall', 14, 12);
  g.bauplan = { achse: 'x', ziel: 1 };
  const richtung = (x, y) => { g.bauplanRichtung(x, y); return g.bauplan.achse + g.bauplan.ziel; };

  gleich('rechts vom Kern füllt rechts', richtung(34, 12), 'x1');
  gleich('links füllt links', richtung(4, 12), 'x-1');
  gleich('oben füllt oben', richtung(20, 2), 'y-1');
  gleich('unten füllt unten', richtung(20, 22), 'y1');
  // Bei Gleichstand gewinnt die Waagerechte — irgendeine Regel braucht es
  gleich('genau auf der Diagonale entscheidet die Waagerechte', richtung(24, 16), 'x1');
  stimmt('genau auf dem Kern ändert sich nichts', !g.bauplanRichtung(h.CORE.cx, h.CORE.cy));
  gleich('und die Wahl von vorhin steht noch', g.bauplan.achse + g.bauplan.ziel, 'x1');

  // Nach oben gespiegelt bleibt die Spalte, die Zeile klappt um
  h.bau('wall', 14, 20);
  g.bauplanRichtung(20, 2);
  const ziele = g.bauplanZiele();
  stimmt('die Waagerechte spiegelt die Zeile',
         ziele.some(z => z.x === 14 && z.y === 4));
});

beschreibe('Nach dem Spiegeln hängt die Kopie am Netz', () => {
  const h = neu(), g = h.game;
  h.bau('pylon', 16, 12);
  h.bau('blaster', 13, 12);
  g.bauplan = { achse: 'x', ziel: 1 };
  g.bauplanBauen();

  const pylon = g.buildings.get('24,12'), turm = g.buildings.get('27,12');
  stimmt('beide stehen', !!pylon && !!turm);
  stimmt('der Pylon hängt am Kern', pylon.supplied);
  stimmt('und der Turm am Pylon', turm.supplied);
});

beschreibe('Ein Bauplan ohne Klick kostet nichts', () => {
  const h = neu(), g = h.game;
  h.bau('wall', 14, 12);
  g.matter = 300;

  stimmt('ohne Vorschau baut nichts', g.bauplanBauen() === 0);
  stimmt('die Vorschau startet', g.bauplanStart());
  stimmt('der Abbruch meldet sich', g.bauplanAbbrechen());
  stimmt('ein zweiter Abbruch hat nichts mehr zu tun', !g.bauplanAbbrechen());
  gleich('und alles ist, wie es war', g.matter, 300);
  gleich('nur der eine Bau steht', g.buildings.size, 1);

  // Auf einem leeren Feld gibt es nichts zu spiegeln
  const leer = neu();
  stimmt('ohne Bauten fängt es gar nicht erst an', !leer.game.bauplanStart());
});

beschreibe('Der gespiegelte Plan steht im Spielstand', () => {
  const h = neu(), g = h.game;
  g.matter = 500;
  h.bau('blaster', 14, 8);
  g.bauplan = { achse: 'x', ziel: 1 };
  g.bauplanBauen();
  const zahl = g.buildings.size, materie = Math.round(g.matter);

  const h2 = weiter();
  stimmt('der Stand lädt', h2.game.laden(h2.game.gespeicherteRunde()));
  gleich('mit allen Bauten', h2.game.buildings.size, zahl);
  stimmt('auch der gespiegelten', h2.game.buildings.has('26,8'));
  gleich('und der bezahlten Materie', Math.round(h2.game.matter), materie);
  stimmt('geladen wird nie mitten in der Vorschau', h2.game.bauplan === null);
});

/* -------------------- Lichtbogen -------------------- */
beschreibe('Der Lichtbogen springt weiter und wird dabei schwächer', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const b = h.bau('arc', 22, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;

  // Vier Gegner in einer Reihe, je 1,5 Zellen auseinander — innerhalb der
  // Sprungweite von 2,1 Zellen, der erste in Reichweite des Turms
  const reihe = [0, 1.5, 3, 4.5].map(d => ziel(h, z * (24.5 + d), z * 12.5));
  g.enemies = reihe.slice();
  const vorher = reihe.map(e => e.hp);
  g.update(1 / 60);
  const ab = reihe.map((e, i) => vorher[i] - e.hp);

  const d0 = g.stat(b, 'damage'), f = h.BUILDINGS.arc.arcFalloff;
  gleich('das erste Ziel nimmt den vollen Schlag', ab[0], d0, 1e-6);
  gleich('das zweite drei Viertel davon', ab[1], d0 * f, 1e-6);
  gleich('das dritte wieder drei Viertel', ab[2], d0 * f * f, 1e-6);
  gleich('das vierte ebenso', ab[3], d0 * f * f * f, 1e-6);
});

beschreibe('Über die Sprungweite hinaus springt nichts', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  h.bau('arc', 22, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;

  const nah = ziel(h, z * 24.5, z * 12.5);
  const weit = ziel(h, z * 27.5, z * 12.5);      // 3 Zellen weiter, zu weit
  g.enemies = [nah, weit];
  const v = [nah.hp, weit.hp];
  g.update(1 / 60);
  stimmt('der erste wird getroffen', nah.hp < v[0]);
  gleich('der zweite bleibt unberührt', weit.hp, v[1]);
});

beschreibe('Der Bogen ist ein Strahl und bricht Schilde', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const b = h.bau('arc', 22, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;
  const e = ziel(h, z * 24.5, z * 12.5);
  e.shield = 400;
  g.enemies = [e];
  g.update(1 / 60);
  gleich('anderthalbfach gegen den Schild', 400 - e.shield, g.stat(b, 'damage') * 1.5, 1e-6);
  gleich('und die Struktur bleibt heil', e.hp, 1e9);
});

beschreibe('Stufe 5: Kettenreaktion', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const b = h.bau('arc', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(b);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;

  const schwach = ziel(h, z * 24.5, z * 12.5);
  schwach.hp = 1;                                  // stirbt am ersten Treffer
  const nachbar = ziel(h, z * 25.5, z * 12.5);     // eine Zelle daneben
  nachbar.hp = 1e9;
  g.enemies = [schwach, nachbar];
  g.update(1 / 60);

  const kette = h.BUILDINGS.arc.arcFalloff * g.stat(b, 'damage');
  stimmt('der Schwache stirbt', schwach.dead === true);
  gleich('der Nachbar bekommt Sprung und Explosion',
         1e9 - nachbar.hp, kette + h.SPECIALS.arc.blast, 1e-6);
});

/* -------------------- Minenleger -------------------- */
beschreibe('Der Minenleger legt in die toten Winkel', () => {
  const h = neu(), g = h.game;
  const b = h.bau('mine', 22, 12);
  // Ein Blaster deckt alles östlich davon ab — die Mine soll nach Westen
  h.bau('blaster', 25, 12);
  g.recomputeSupply();

  const p = g.minenPlatz(b);
  const blaster = g.buildings.get('25,12');
  stimmt('es gibt einen Platz', !!p);
  stimmt('und keiner, den der Blaster ohnehin deckt',
         Math.hypot(p.zx - 25, p.zy - 12) > g.stat(blaster, 'range'));
  stimmt('im Legeradius', Math.hypot(p.zx - 22, p.zy - 12) <= g.stat(b, 'range'));

  g.mineLegen(b, p);
  gleich('eine Mine liegt', g.minen.length, 1);
  const q = g.minenPlatz(b);
  stimmt('die nächste kommt woandershin', q.zx !== p.zx || q.zy !== p.zy);
});

beschreibe('Der Vorrat ist gedeckelt und nichts liegt unter einem Bau', () => {
  const h = neu(), g = h.game;
  const b = h.bau('mine', 22, 12);
  g.recomputeSupply();
  for (let i = 0; i < 20; i++) {
    const p = g.minenPlatz(b);
    if (!p) break;
    g.mineLegen(b, p);
  }
  gleich('höchstens so viele wie vorgesehen', g.minen.length, g.minenZahl(b));
  stimmt('und keine zweimal auf derselben Zelle',
         new Set(g.minen.map(m => m.zx + ',' + m.zy)).size === g.minen.length);

  /* Wo ein Bau steht, kommt keine Mine hin. Geprüft an genau der Zelle,
     die der Leger sonst gewählt hätte — sonst bewiese der Test nur, dass
     er zufällig woandershin gelegt hat. */
  g.minen.length = 0;
  g.buffs.minenPlus = 0;
  const waere = g.minenPlatz(b);
  h.bau('wall', waere.zx, waere.zy);
  const stattdessen = g.minenPlatz(b);
  stimmt('die Zelle ist jetzt tabu',
         stattdessen.zx !== waere.zx || stattdessen.zy !== waere.zy);
  g.mineLegen(b, stattdessen);
  stimmt('und nichts liegt unter einem Bauwerk',
         g.minen.every(m => !g.buildings.has(m.zx + ',' + m.zy)));

  g.minen.length = 0;
  g.buffs.minenPlus = 2;
  for (let i = 0; i < 20; i++) {
    const p = g.minenPlatz(b);
    if (!p) break;
    g.mineLegen(b, p);
  }
  gleich('die Karte legt zwei drauf', g.minen.length, h.BUILDINGS.mine.minen + 2);
});

beschreibe('Minen zünden unter Bodentruppen, nicht unter Fliegern', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const b = h.bau('mine', 22, 12);
  g.recomputeSupply();
  g.phase = 'combat';

  const legen = () => { g.minen.length = 0;
                        g.mineLegen(b, { x: z * 20.5, y: z * 18.5, zx: 20, zy: 18 });
                        g.minen[0].arm = 0; };

  // Flieger lösen nichts aus
  legen();
  const flieger = ziel(h, z * 20.5, z * 18.5); flieger.flying = true;
  g.enemies = [flieger];
  g.minenPruefen(1 / 60);
  gleich('die Mine liegt noch', g.minen.length, 1);
  gleich('und der Flieger ist unversehrt', flieger.hp, 1e9);

  // Bodentruppen schon
  legen();
  const fuss = ziel(h, z * 20.5, z * 18.5);
  const daneben = ziel(h, z * 21.4, z * 18.5);        // knapp im Splash
  g.enemies = [fuss, daneben];
  g.minenPruefen(1 / 60);
  gleich('die Mine ist weg', g.minen.length, 0);
  stimmt('der Auslöser nimmt den vollen Schaden', 1e9 - fuss.hp > g.stat(b, 'damage') * 0.9);
  stimmt('der Nachbar weniger', 1e9 - daneben.hp > 0 && 1e9 - daneben.hp < 1e9 - fuss.hp);

  // Stufe 5 zündet auch unter Fliegern
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(b);
  legen();
  const f2 = ziel(h, z * 20.5, z * 18.5); f2.flying = true;
  g.enemies = [f2];
  g.minenPruefen(1 / 60);
  gleich('der Näherungszünder greift', g.minen.length, 0);
  stimmt('und der Flieger hat es gemerkt', f2.hp < 1e9);
});

/* -------------------- Werkdrohne -------------------- */
beschreibe('Die Werkdrohne setzt instand und bezahlt es aus dem Puffer', () => {
  const h = neu(), g = h.game;
  const d = h.bau('drohne', 22, 12);
  const wand = h.bau('wall', 24, 12);
  const fern = h.bau('wall', 30, 12);              // außerhalb der Reichweite
  g.recomputeSupply();
  g.phase = 'combat';
  // Der ferne Bau ist der schlimmere Fall — nur die Reichweite hält die
  // Drohne davon ab, sich um ihn zu kümmern.
  wand.hp = 10; fern.hp = 5;
  g.energyMax = 1e6; g.energy = 1e6;

  const e0 = g.energy;
  g.drohneTickt(d, 1);
  const geheilt = wand.hp - 10;
  gleich('sie schiebt ihre Rate nach', geheilt, g.repairRate(d), 1e-6);
  gleich('und zahlt je Struktur', e0 - g.energy, geheilt * h.BUILDINGS.drohne.perHp, 1e-6);
  gleich('was zu weit weg steht, bleibt kaputt', fern.hp, 5);

  // Ohne Energie geht nichts
  g.energy = 0;
  const stand = wand.hp;
  g.drohneTickt(d, 1);
  gleich('ohne Puffer keine Instandsetzung', wand.hp, stand);
});

beschreibe('Die Werkdrohne hängt mit ihrer Dauerlast am Netz', () => {
  const h = neu(), g = h.game;
  const d = h.bau('drohne', 22, 12);
  g.recomputeSupply();
  const soll = h.BUILDINGS.drohne.repair * h.BUILDINGS.drohne.perHp;
  gleich('Dauerlast wie gerechnet', g.drawOf(d), soll, 1e-9);
  stimmt('und sie steht im Leitungsbedarf', d.node.through >= soll - 1e-9);
});

beschreibe('Stufe 5: Notfallschweißung, einmal je Welle', () => {
  const h = neu(), g = h.game;
  const d = h.bau('drohne', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(d);
  const wand = h.bau('wall', 24, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;

  wand.hp = wand.maxHp * 0.1;
  g.drohneTickt(d, 1 / 60);
  gleich('der Bau ist sofort wieder ganz', wand.hp, wand.maxHp);
  stimmt('und die Schweißung ist verbraucht', d.reserve === false);

  wand.hp = wand.maxHp * 0.1;
  g.drohneTickt(d, 1 / 60);
  stimmt('ein zweites Mal in derselben Welle nicht', wand.hp < wand.maxHp);
});

/* -------------------- Schildfeld -------------------- */
beschreibe('Das Schildfeld fängt aus seinem Vorrat ab', () => {
  const h = neu(), g = h.game;
  const f = h.bau('schild', 22, 12);
  const wand = h.bau('wall', 23, 12);
  g.recomputeSupply();
  g.energyMax = 1000; g.energy = 1000;
  const def = h.BUILDINGS.schild;

  // Erst laden: der Vorrat kommt aus dem Überschuss über der Schwelle
  const e0 = g.energy;
  g.schildLaedt(f, 1);
  gleich('eine Sekunde lädt die Laderate', f.puffer, def.laden, 1e-9);
  gleich('und kostet je Punkt', e0 - g.energy, def.laden * def.perPoint, 1e-9);

  const vorrat = f.puffer, hp0 = wand.hp, e1 = g.energy;
  g.damageBuilding(wand, 10);
  gleich('drei Fünftel gehen in den Vorrat', hp0 - wand.hp, 10 * (1 - def.absorb), 1e-6);
  gleich('der Vorrat sinkt genau darum', vorrat - f.puffer, 10 * def.absorb, 1e-6);
  gleich('und der Puffer bleibt im Gefecht unberührt', g.energy, e1);

  // Ist der Vorrat leer, trifft es voll
  f.puffer = 0;
  const hp1 = wand.hp;
  g.damageBuilding(wand, 10);
  gleich('leer heißt ungeschützt', hp1 - wand.hp, 10, 1e-6);
});

beschreibe('Geladen wird nur aus dem Überschuss', () => {
  const h = neu(), g = h.game;
  const f = h.bau('schild', 22, 12);
  g.recomputeSupply();
  const def = h.BUILDINGS.schild;
  g.energyMax = 1000;

  g.energy = 1000 * def.ab;                       // genau auf der Schwelle
  g.schildLaedt(f, 1);
  gleich('auf der Schwelle lädt es nicht', f.puffer, 0);

  g.energy = 1000 * def.ab + 2 * def.perPoint;    // knapp darüber
  g.schildLaedt(f, 1);
  gleich('nur der Überschuss geht hinein', f.puffer, 2, 1e-9);
  gleich('und der Puffer steht wieder auf der Schwelle', g.energy, 1000 * def.ab, 1e-9);

  g.energy = 1000;
  f.puffer = g.schildPool(f);
  g.schildLaedt(f, 1);
  gleich('ein volles Feld lädt nicht weiter', f.puffer, g.schildPool(f));
});

beschreibe('Das Schildfeld deckt sich selbst nicht', () => {
  const h = neu(), g = h.game;
  const f = h.bau('schild', 22, 12);
  g.recomputeSupply();
  g.energyMax = 1000; g.energy = 1000;
  g.schildLaedt(f, 5);
  const hp0 = f.hp, vorrat = f.puffer;
  g.damageBuilding(f, 20);
  gleich('der Generator nimmt den vollen Treffer', hp0 - f.hp, 20, 1e-6);
  gleich('und sein Vorrat rührt sich nicht', f.puffer, vorrat);
});

beschreibe('Stufe 5: Rückkopplung trifft den Angreifer', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const f = h.bau('schild', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(f);
  const wand = h.bau('wall', 23, 12);
  g.recomputeSupply();
  g.energyMax = 1000; g.energy = 1000;
  g.schildLaedt(f, 5);

  const gegner = ziel(h, z * 23.5, z * 12.5);
  g.damageBuilding(wand, 20, gegner);
  gleich('zwei Fünftel des Geschluckten kommen zurück',
         1e9 - gegner.hp, 20 * h.BUILDINGS.schild.absorb * h.SPECIALS.schild.thorns, 1e-6);
});

beschreibe('Das Schildfeld am Kern fängt auch für den Kern ab', () => {
  const h = neu(), g = h.game;
  const f = h.bau('schild', 22, 12);            // zwei Zellen neben dem Kern
  g.recomputeSupply();
  g.energyMax = 1000; g.energy = 1000;
  g.schildLaedt(f, 5);
  const vorrat = f.puffer, hp0 = g.coreHp;
  stimmt('das Feld deckt den Kern', g.schildAmKern() === f);

  g.damageCore(30, null);
  const anteil = h.BUILDINGS.schild.absorb;
  gleich('nur der Rest kommt am Kern an', hp0 - g.coreHp, 30 * (1 - anteil), 1e-6);
  gleich('der Vorrat trägt den Anteil', vorrat - f.puffer, 30 * anteil, 1e-6);

  // Ein Feld weiter draußen deckt den Kern nicht mehr — versorgt ist es,
  // aber vier Zellen entfernt und damit außerhalb seiner Reichweite
  const weit = h.bau('schild', 24, 12);
  g.recomputeSupply();
  g.schildLaedt(weit, 5);
  f.puffer = 0;
  const hp1 = g.coreHp;
  g.damageCore(30, null);
  gleich('ohne Vorrat in Kernnähe trifft es voll', hp1 - g.coreHp, 30, 1e-6);
});

beschreibe('Der Vorrat wächst mit der Ausbaustufe und hängt am Netz', () => {
  const h = neu(), g = h.game;
  const f = h.bau('schild', 22, 12);
  g.recomputeSupply();
  const def = h.BUILDINGS.schild;
  gleich('Stufe 1: ein Vorrat', g.schildPool(f), def.pool);
  gleich('Dauerlast ist die Laderate', g.drawOf(f), def.laden * def.perPoint, 1e-9);
  stimmt('und sie steht im Leitungsbedarf',
         f.node.through >= def.laden * def.perPoint - 1e-9);

  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(f);
  gleich('Stufe 5: fünffacher Vorrat', g.schildPool(f), def.pool * h.UPGRADE.maxLevel);
});

/* ------------------ Sonderfähigkeiten ------------------ */
beschreibe('Stufe 5: Sonderfähigkeiten', () => {
  const h = neu(), g = h.game;
  const p = h.bau('pylon', 22, 12);
  const t = h.bau('blaster', 23, 13);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(p);
  g.recomputeSupply();
  gleich('Verstärkerfeld des ausgebauten Pylons', t.boost, h.SPECIALS.pylon.boost);

  const r = h.bau('reactor', 18, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(r);
  g.recomputeSupply();
  g.phase = 'combat'; g.enemies = [];
  g.spawnQueue = [{ at: 1e9 }];               // sonst gilt die Welle als gehalten
  const m0 = g.matter;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  gleich('Materiekonverter je Sekunde', g.matter - m0, h.SPECIALS.reactor.matter, 1e-6);
});

beschreibe('Stufe 5: Zwillingssalve', () => {
  const h = neu(), g = h.game;
  const b = h.bau('blaster', 22, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(b);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6;
  g.hurt = () => {};
  const zelle = h.GRID.cell;
  const a = ziel(h, zelle * 23.5, zelle * 12.5), c = ziel(h, zelle * 23.5, zelle * 13.5);
  g.enemies = [a, c];
  const getroffen = [];
  g.shoot = (turm, z) => { getroffen.push(z); return { speed: 0 }; };
  g.update(1 / 60);
  gleich('zwei Geschosse je Schuss', getroffen.length, 2);
  stimmt('auf zwei verschiedene Ziele', getroffen[0] !== getroffen[1]);
});

/* -------------------- Getrennte Akkus -------------------- */
beschreibe('Akku und Reaktor sind getrennt', () => {
  const h = neu(), g = h.game;
  const cap0 = g.energyMax, reg0 = g.regen;
  const capMul = g.modeMul('cap'), regMul = g.modeMul('regen');

  stimmt('der Reaktor hat keinen Speicher mehr', !h.BUILDINGS.reactor.capacity);
  stimmt('der Akku erzeugt nichts', !h.BUILDINGS.akku.regen);

  const r = h.bau('reactor', 18, 12);
  g.recomputeSupply();
  gleich('Reaktor hebt nur die Regeneration',
         g.regen, Math.round((h.CORE.regen + h.BUILDINGS.reactor.regen) * regMul * 10) / 10, 1e-9);
  gleich('Reaktor lässt den Speicher unberührt', g.energyMax, cap0);
  g.sell(r);

  const a = h.bau('akku', 18, 12);
  g.recomputeSupply();
  gleich('Akku hebt nur den Speicher', g.energyMax,
         Math.round((h.CORE.energy + h.BUILDINGS.akku.capacity) * capMul));
  gleich('Akku lässt die Regeneration unberührt', g.regen, reg0);

  // Ausbaustufen zählen linear
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(a);
  g.recomputeSupply();
  gleich('Speicher eines Akkus auf Stufe 5', g.capOf(a),
         h.BUILDINGS.akku.capacity * h.UPGRADE.maxLevel);
});

beschreibe('Akku trägt seinen Knoten mit', () => {
  const h = neu(), g = h.game;
  const pylon = h.bau('pylon', 25, 12);
  g.recomputeSupply();
  gleich('Kapazität ohne Akku', pylon.node.cap, h.FLOW.pylon);

  const a = h.bau('akku', 26, 11);
  g.recomputeSupply();
  stimmt('der Akku hängt am Pylon', a.node === pylon.node);
  gleich('Kapazität mit Akku', pylon.node.cap, h.FLOW.pylon + h.akkuFlow(a));

  g.upgrade(a); g.upgrade(a);
  g.recomputeSupply();
  gleich('Akku auf Stufe 3 trägt dreifach', pylon.node.cap, h.FLOW.pylon + h.FLOW.akku * 3);
});

beschreibe('Spitzenlast: der ausgebaute Akku speist einmal je Welle nach', () => {
  const h = neu(), g = h.game;
  const a = h.bau('akku', 18, 12);
  for (let i = 1; i < h.UPGRADE.maxLevel; i++) g.upgrade(a);
  g.recomputeSupply();
  g.phase = 'combat'; g.regen = 0;
  g.spawnQueue = [{ at: 1e9 }];                 // Welle darf nicht enden

  g.energy = g.energyMax * 0.5;
  g.update(1 / 60);
  gleich('über der Schwelle bleibt sie geladen', a.reserve, true);

  g.energy = g.energyMax * (h.SPECIALS.akku.at - 0.02);
  const vorher = g.energy;
  g.update(1 / 60);
  gleich('unter der Schwelle löst sie aus', a.reserve, false);
  gleich('eingespeist wird der ganze Speicher', g.energy - vorher, g.capOf(a), 1e-6);

  g.energy = 0;
  g.update(1 / 60);
  gleich('ein zweites Mal in derselben Welle nicht', g.energy, 0, 1e-9);
  g.phase = 'build'; g.startWave();
  gleich('mit der nächsten Welle wieder scharf', a.reserve, true);
});

beschreibe('Zellenstapel wirkt nur auf Akkus', () => {
  const h = neu(), g = h.game;
  const a = h.bau('akku', 18, 12);
  const vorher = g.capOf(a);
  h.CARDS.find(c => c.id === 'zellenstapel').apply(g.buffs, g);
  g.recomputeSupply();
  gleich('Akku fasst 45 % mehr', g.capOf(a), vorher * 1.45, 1e-9);
});

/* ---------------------- Kernmodi ------------------------- */
beschreibe('Kernmodi verteilen die Leistung', () => {
  const h = neu(), g = h.game;
  h.CORE_MODES.forEach((m, i) => {
    g.coreMode = i; g.modeTimer = 0;
    g.recomputeSupply();
    gleich(m.name + ': Regeneration', g.regen, Math.round(h.CORE.regen * m.regen * 10) / 10, 1e-9);
    gleich(m.name + ': Speicher', g.energyMax, Math.round(h.CORE.energy * m.cap));
  });
});

beschreibe('Kernmodus: der Anlauf kostet', () => {
  const h = neu(), g = h.game;
  gleich('Startmodus', g.coreMode, 0);
  g.setMode(1);
  gleich('Anlaufzeit', g.modeTimer, h.CORE_SWITCH.time, 1e-9);
  gleich('während des Anlaufs wirkt kein Modus beim Speicher',
         g.energyMax, h.CORE.energy);
  gleich('und der Nachschub ist gedrosselt',
         g.regen, Math.round(h.CORE.regen * h.CORE_SWITCH.regen * 10) / 10, 1e-9);
  stimmt('der Modus ist noch nicht gewechselt', g.coreMode === 0);
  stimmt('während des Anlaufs zählt kein aktiver Modus', g.activeMode() === null);

  g.phase = 'build'; g.spawnQueue = [];
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  gleich('nach dem Anlauf steht der neue Modus', g.coreMode, 1);
  gleich('und seine Werte gelten', g.energyMax,
         Math.round(h.CORE.energy * h.CORE_MODES[1].cap));

  // Schnellschaltung halbiert die Anlaufzeit
  h.CARDS.find(c => c.id === 'schnellschaltung').apply(g.buffs, g);
  g.setMode(2);
  gleich('Schnellschaltung halbiert den Anlauf', g.modeTimer, h.CORE_SWITCH.time / 2, 1e-9);
});

beschreibe('Zwitterkern mildert nur den Nachteil', () => {
  const h = neu(), g = h.game;
  const m = h.CORE_MODES[0];
  h.CARDS.find(c => c.id === 'zwitterkern').apply(g.buffs, g);
  g.recomputeSupply();
  gleich('der Vorteil bleibt voll', g.modeMul('regen'), m.regen, 1e-9);
  gleich('der Nachteil nur halb', g.modeMul('cap'), 1 - (1 - m.cap) / 2, 1e-9);
});

beschreibe('Der Schild nimmt den Türmen nie den Strom', () => {
  /* Ohne Untergrenze zahlt der Puffer bis zur Leere, danach feuert nichts
     mehr und der Kern nimmt wieder vollen Schaden — der Schild löst den
     Zusammenbruch aus, den er verhindern soll. Gemessen: 15 von 60 Läufen
     endeten so an Welle 10 statt 1 von 60. */
  const h = neu(), g = h.game;
  const schild = h.CORE_MODES.findIndex(m => m.absorb);
  const m = h.CORE_MODES[schild];
  g.coreMode = schild; g.modeTimer = 0;
  g.recomputeSupply();
  g.coreHpMax = 1e6; g.coreHp = 1e6;
  const grenze = g.energyMax * m.floor;

  g.energy = grenze;
  const hp0 = g.coreHp;
  g.damageCore(30, null);
  gleich('auf der Grenze fängt er nichts mehr ab', hp0 - g.coreHp, 30, 1e-9);
  gleich('und rührt den Puffer nicht an', g.energy, grenze, 1e-9);

  g.energy = g.energyMax;
  g.damageCore(2000, null);                   // ein Schlag, der alles verschlänge
  stimmt('auch ein sehr harter Treffer lässt die Grenze stehen',
         g.energy >= grenze - 1e-9);
  stimmt('was er nicht zahlen kann, kommt am Kern an', g.coreHp < hp0 - 30);
});

beschreibe('Schildmodus bezahlt Kernschaden aus dem Puffer', () => {
  const h = neu(), g = h.game;
  const schild = h.CORE_MODES.findIndex(m => m.absorb);
  const m = h.CORE_MODES[schild];
  g.coreMode = schild; g.modeTimer = 0;
  g.recomputeSupply();
  g.energy = g.energyMax;

  const hp0 = g.coreHp, e0 = g.energy;
  g.damageCore(20, null);
  gleich('Kern nimmt nur den Rest', hp0 - g.coreHp, 20 * (1 - m.absorb), 1e-9);
  gleich('der Puffer zahlt den Rest', e0 - g.energy, 20 * m.absorb * m.perDamage, 1e-9);

  // Leerer Puffer schützt nicht mehr
  g.energy = 0;
  const hp1 = g.coreHp;
  g.damageCore(20, null);
  gleich('ohne Energie kein Schild', hp1 - g.coreHp, 20, 1e-9);

  // Ein anderer Modus schirmt gar nicht ab
  g.coreMode = 0; g.energy = g.energyMax;
  const hp2 = g.coreHp, e2 = g.energy;
  g.damageCore(20, null);
  gleich('Einspeisung schirmt nicht ab', hp2 - g.coreHp, 20, 1e-9);
  gleich('und kostet keine Energie', e2 - g.energy, 0, 1e-9);
});

/* ------------------ Zielpriorität ------------------------- */
beschreibe('Jeder Turm sucht sein Ziel nach eigener Regel', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 24, 12);
  g.recomputeSupply();
  const px = zellen => zellen * h.GRID.cell;

  // Vier Gegner, alle in Reichweite, jeder in einer Eigenschaft vorn
  const mach = (x, hp, speed) => {
    const e = ziel(h, px(x), px(12.5));
    e.hp = hp; e.maxHp = hp; e.speed = speed; e.slowFactor = 1;
    return e;
  };
  const kernNah = mach(22.0, 100, 50);
  const turmNah = mach(25.0, 100, 50);
  const stark   = mach(27.5, 5000, 50);
  const schnell = mach(26.9, 100, 200);
  g.enemies = [stark, schnell, kernNah, turmNah];

  const wer = i => { t.ziel = i; return g.findTarget(t); };
  gleich('Kernnächster ist die Voreinstellung', h.TARGETS[0].id, 'kern');
  stimmt('Kernnächster nimmt den innersten', wer(0) === kernNah);
  stimmt('Nächster nimmt den am Turm', wer(1) === turmNah);
  stimmt('Stärkster nimmt den mit der meisten Struktur', wer(2) === stark);
  stimmt('Schnellster nimmt den flottesten', wer(3) === schnell);

  // Gebremste und eingefrorene Gegner sind nicht mehr die schnellsten
  schnell.slowFactor = 0.1;
  stimmt('gebremst zählt das gedrosselte Tempo', wer(3) !== schnell);
  schnell.slowFactor = 1;
  schnell.frozenUntil = g.time + 5;
  stimmt('eingefroren zählt als Stillstand', wer(3) !== schnell);
});

beschreibe('Zielpriorität wandert durch und wird gesichert', () => {
  const h = neu(), g = h.game;
  const t = h.bau('cannon', 24, 12);
  gleich('frisch gebaut: Kernnächster', t.ziel, 0);
  g.cycleTarget(t); g.cycleTarget(t);
  gleich('zweimal weiter', t.ziel, 2);
  for (let i = 0; i < h.TARGETS.length; i++) g.cycleTarget(t);
  gleich('eine ganze Runde führt zurück', t.ziel, 2);

  g.merken();
  const g2 = weiter().game;
  gleich('der Spielstand kennt die Zielpriorität', g2.buildings.get('24,12').ziel, 2);
});

/* ------------------ Ziehen zum Bauen ---------------------- */
beschreibe('Ziehen setzt eine Reihe Barrieren', () => {
  const h = neu(), g = h.game;
  gleich('der Zug beginnt mit einer Barriere', g.ziehStart('wall', 10, 8), 1);
  g.ziehWeiter(10, 9);
  g.ziehWeiter(10, 12);                       // Sprung: die Lücke muss zuwachsen
  gleich('auch die übersprungenen Zellen stehen', g.buildings.size, 5);
  for (let y = 8; y <= 12; y++) stimmt('Zelle 10,' + y + ' bebaut', g.buildings.has('10,' + y));
  gleich('am Ende meldet der Zug seine Bauten', g.ziehEnde(), 5);
  stimmt('und ist beendet', g.ziehen === null);
});

beschreibe('Ziehen überspringt still, was nicht geht', () => {
  const h = neu(), g = h.game;
  h.bau('blaster', 10, 10);                   // steht im Weg
  g.ziehStart('wall', 10, 8);
  g.ziehWeiter(10, 12);
  stimmt('der belegte Platz bleibt, wie er war', g.buildings.get('10,10').type === 'blaster');
  gleich('die anderen vier Zellen stehen', 
         [8, 9, 11, 12].filter(y => g.buildings.has('10,' + y)).length, 4);
  g.ziehEnde();

  // Nur ziehbare Bauteile
  gleich('ein Turm lässt sich nicht ziehen', g.ziehStart('cannon', 14, 8), 0);
  stimmt('und startet auch keinen Zug', g.ziehen === null);
});

beschreibe('Ziehen hört auf, wenn die Materie ausgeht', () => {
  const h = neu(), g = h.game;
  g.matter = 3 * g.costOf('wall') + 2;         // reicht für genau drei
  g.ziehStart('wall', 10, 4);
  g.ziehWeiter(10, 20);
  gleich('nur drei Barrieren gebaut', g.buildings.size, 3);
  stimmt('und die Materie reicht nicht mehr', g.matter < g.costOf('wall'));
  g.ziehEnde();
});

beschreibe('Ein Zug schreibt nur einen Spielstand', () => {
  const h = neu(), g = h.game;
  h.speicher.clear();
  g.ziehStart('wall', 10, 8);
  g.ziehWeiter(10, 12);
  stimmt('währenddessen liegt noch nichts vor', g.gespeicherteRunde() === null);
  gleich('das Zugende sichert', g.ziehEnde(), 5);
  const stand = g.gespeicherteRunde();
  stimmt('und der Stand kennt alle fünf', stand && stand.bauten.length === 5);
});

/* ------------------ Bilanz nach der Welle ----------------- */
beschreibe('Die Bilanz zählt, was in der Welle passiert ist', () => {
  const h = neu(), g = h.game;
  const blaster = h.bau('blaster', 24, 12);   // beide im Versorgungsradius des Kerns
  const kanone = h.bau('cannon', 25, 12);
  g.recomputeSupply();
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6; g.regen = 0;
  g.spawnQueue = [{ at: 1e9 }];                 // Welle darf nicht enden
  g.stats = { energie: 0, befehle: 0, schild: 0, kernSchaden: 0,
              gegner: 0, materie: 0, verluste: 0, leer: 0, drossel: 0, zeit: 0 };
  blaster.schaden = 0; kanone.schaden = 0;
  g.enemies = [ziel(h, h.GRID.cell * 26.5, h.GRID.cell * 12.5)];
  stimmt('beide hängen am Netz', blaster.supplied && kanone.supplied);
  for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);

  stimmt('verschossene Energie wird gezählt', g.stats.energie > 0);
  stimmt('der Blaster bekommt seinen Schaden zugeschrieben', blaster.schaden > 0);
  stimmt('die Kanone auch', kanone.schaden > 0);
  stimmt('die Kanone schlägt härter als der Blaster', kanone.schaden > blaster.schaden);

  g.damageCore(50, null);
  gleich('Kernschaden landet in der Bilanz', g.stats.kernSchaden, 50, 1e-9);

  const b = g.bilanzZiehen(40);
  gleich('bester Turm ist die Kanone', b.bester.name, h.BUILDINGS.cannon.name);
  gleich('die Prämie steht bei der Materie', b.materie, Math.round(g.stats.materie) + 40);
  gleich('die Welle steht dabei', b.welle, g.wave);
});

beschreibe('Die Bilanz misst leeren Puffer und Drosselung', () => {
  const h = neu(), g = h.game;
  h.bau('pylon', 25, 12);
  const t = [h.bau('blaster', 28, 12), h.bau('blaster', 28, 11),
             h.bau('blaster', 28, 13), h.bau('blaster', 29, 12)];
  g.recomputeSupply();
  stimmt('die Leitung ist überlastet', t[0].flow < 1);
  g.phase = 'combat'; g.energyMax = 1e6; g.energy = 1e6; g.regen = 0;
  g.spawnQueue = [{ at: 1e9 }];
  g.stats = { energie: 0, befehle: 0, schild: 0, kernSchaden: 0,
              gegner: 0, materie: 0, verluste: 0, leer: 0, drossel: 0, zeit: 0 };
  g.enemies = [ziel(h, h.GRID.cell * 30.5, h.GRID.cell * 12.5)];
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  const d = g.stats.drossel / g.stats.zeit;
  gleich('die mittlere Drosselung entspricht dem Fluss', d, 1 - t[0].flow, 0.02);

  // Jetzt der leere Puffer: ein Turm will feuern und kann nicht
  g.energy = 0; g.regen = 0;
  const vorher = g.stats.leer;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  stimmt('leerer Puffer wird als Zeit gezählt', g.stats.leer > vorher + 0.5);
});

beschreibe('Der Wellenstart setzt das Zählwerk zurück', () => {
  const h = neu(), g = h.game;
  const t = h.bau('blaster', 26, 12);
  g.stats.energie = 999; g.stats.gegner = 7; t.schaden = 500;
  g.startWave();
  gleich('Energie zurückgesetzt', g.stats.energie, 0);
  gleich('Gegner zurückgesetzt', g.stats.gegner, 0);
  gleich('Schaden am Turm zurückgesetzt', t.schaden, 0);
});

/* ------------------ Druckgedächtnis ----------------------- */
beschreibe('Ohne Geschichte zieht es an keine Seite', () => {
  const h = neu(), g = h.game;
  const gew = g.druckGewichte();
  gleich('acht Sektoren, wie die Himmelsrichtungen', gew.length, h.DRUCK.sektoren);
  stimmt('alle Gewichte stehen auf 1', gew.every(v => Math.abs(v - 1) < 1e-9));
  gleich('und die Bilanz nennt keine Richtung', g.druckSchwerpunkt(), null);

  // Auch zwei gleich starke Seiten sind keine Auskunft wert
  g.druck = [1.2, 0, 1.2, 0, 0, 0, 0, 0];
  gleich('bei zwei gleich starken Seiten schweigt sie ebenfalls', g.druckSchwerpunkt(), null);
  g.druck = [1.2, 0, 0.4, 0, 0, 0, 0, 0];
  gleich('sobald eine vorn liegt, nennt sie diese', g.druckSchwerpunkt(), 'Ost');
});

beschreibe('Gemessen wird die engste Annäherung, nicht die Zahl der Gegner', () => {
  const h = neu(), g = h.game;
  const zelle = h.GRID.cell;
  const mx = (h.CORE.cx + .5) * zelle, my = (h.CORE.cy + .5) * zelle;
  g.phase = 'combat'; g.spawnQueue = [{ at: 1e9 }];
  g.enemies = [
    ziel(h, mx + zelle * 2, my),                        // dicht im Osten
    ziel(h, mx + zelle * 6, my),                        // weiter draußen, gleiche Seite
    ziel(h, mx - zelle * (h.DRUCK.tiefe + 3), my)       // im Westen, außer Reichweite
  ];
  g.update(1 / 60);

  gleich('der tiefste Einbruch zählt', g.druckNaehe[0], 1 - 2 / h.DRUCK.tiefe, 1e-9);
  gleich('wer draußen bleibt, macht keinen Druck', g.druckNaehe[4], 0);

  g.druckMerken();
  const gew = g.druckGewichte();
  stimmt('Ost bekommt mehr Gewicht als West', gew[0] > gew[4]);
  gleich('die Bilanz nennt die Richtung', g.druckSchwerpunkt(), 'Ost');
  stimmt('die Wellenwerte sind zurückgesetzt',
         g.druckNaehe.every(v => v === 0) && g.druckExtra.every(v => v === 0));
});

beschreibe('Kernschaden und verlorene Bauten zählen auf ihre Seite', () => {
  const h = neu(), g = h.game;
  const zelle = h.GRID.cell;
  g.phase = 'combat';
  // Ein Gegner südlich des Kerns trifft
  g.damageCore(100, { x: (h.CORE.cx + .5) * zelle, y: (h.CORE.cy + 6.5) * zelle });
  gleich('Kernschaden bucht nach Süden', g.druckExtra[2], 100 * h.DRUCK.kernSchaden, 1e-9);

  const wand = h.bau('wall', 12, 12);          // westlich vom Kern
  g.damageBuilding(wand, wand.maxHp + 1);
  stimmt('der Bau ist gefallen', !g.buildings.has('12,12'));
  gleich('der Verlust bucht nach Westen', g.druckExtra[4], h.DRUCK.verlust, 1e-9);
  gleich('und nirgends sonst', g.druckExtra[0], 0);
});

beschreibe('Die Planung zieht die nächste Welle in den Drucksektor', () => {
  const h = neu(), g = h.game;
  g.druck = [3, 0, 0, 0, 0, 0, 0, 0];          // alles kam zuletzt aus Osten
  let ost = 0, west = 0, gesamt = 0;
  for (let i = 0; i < 300; i++)
    for (const e of g.planWave(6).queue) {
      gesamt++;
      const s = h.sektorVon(e.angle);
      if (s === 0) ost++;
      if (s === 4) west++;
    }
  const anteilOst = ost / gesamt, anteilWest = west / gesamt;
  const gleichanteil = 1 / h.DRUCK.sektoren;
  stimmt('Ost bekommt klar mehr als den Gleichanteil (' +
         Math.round(anteilOst * 100) + ' %)', anteilOst > gleichanteil * 1.6);
  stimmt('die ruhige Gegenseite bekommt weniger (' +
         Math.round(anteilWest * 100) + ' %)', anteilWest < gleichanteil);
  stimmt('aber sie kommt weiter vor', west > 0);
});

beschreibe('Der Deckel hält die Rückmeldung im Rahmen', () => {
  const h = neu(), g = h.game;
  g.druck = [50, 0, 0, 0, 0, 0, 0, 0];         // zehn Wellen lang nur eine Seite
  const gew = g.druckGewichte();
  gleich('kein Sektor über max', gew[0], h.DRUCK.max);
  gleich('und keiner unter min', gew[4], h.DRUCK.min);
  gleich('mehr als das Vierfache ist nicht drin', gew[0] / gew[4], h.DRUCK.max / h.DRUCK.min);

  let mitWest = 0;
  for (let i = 0; i < 200; i++)
    if (g.planWave(6).queue.some(e => h.sektorVon(e.angle) === 4)) mitWest++;
  stimmt('auch bei Dauerdruck kommt noch etwas aus der Gegenrichtung (' +
         mitWest + '/200)', mitWest > 10);
});

beschreibe('Ein einmaliger Einbruch klingt wieder ab', () => {
  const h = neu(), g = h.game;
  g.druckNaehe[2] = 1;                         // der Süden war einmal offen
  g.druckMerken();
  const nach = g.druck[2];
  // Gemischt, nicht überschrieben: Eine einzelne Welle darf das Gedächtnis
  // weder ganz bestimmen noch wirkungslos verpuffen.
  stimmt('eine Welle schlägt durch, aber nicht voll', nach > 0.2 && nach < 0.9);
  g.druckMerken();                             // eine ruhige Welle
  stimmt('schon eine ruhige Welle nimmt Druck weg', g.druck[2] < nach * 0.6);
  g.druckMerken();
  stimmt('nach zwei ruhigen Wellen ist kaum noch Druck da', g.druck[2] < nach * 0.3);
  gleich('und die Bilanz nennt keine Richtung mehr', g.druckSchwerpunkt(), null);
});

beschreibe('Jede Welle fängt ohne Altlasten an', () => {
  const h = neu(), g = h.game;
  g.druckNaehe[3] = 0.9; g.druckExtra[3] = 2;      // Reste einer abgebrochenen Welle
  const vorher = g.druck.slice();
  g.startWave();
  stimmt('die Wellenwerte stehen auf null',
         g.druckNaehe.every(v => v === 0) && g.druckExtra.every(v => v === 0));
  stimmt('das Gedächtnis selbst bleibt unberührt',
         g.druck.every((v, i) => v === vorher[i]));
});

beschreibe('Das Druckgedächtnis gehört zum Spielstand', () => {
  const h = neu(), g = h.game;
  g.druck = [0, 0, 1.4, 0, 0, 0, 0, 0];
  gleich('sichern gelingt', g.merken(), true);

  const g2 = weiter().game;                    // wie ein Neuladen der Seite
  gleich('der Süden kommt zurück', g2.druck[2], 1.4, 1e-3);
  gleich('der Rest steht auf null', g2.druck[0], 0);

  // Ein Stand aus einer Fassung vor dieser Änderung hat kein Gedächtnis
  const h3 = weiter();
  const roh = JSON.parse(h3.speicher.getItem(h3.SAVE_KEY));
  delete roh.druck;
  h3.speicher.setItem(h3.SAVE_KEY, JSON.stringify(roh));
  const g4 = weiter().game;
  gleich('er lädt trotzdem', g4.wave, g.wave);
  stimmt('und fängt gleichverteilt an',
         g4.druck.length === h.DRUCK.sektoren && g4.druck.every(v => v === 0));
});

/* ------------------ Erzeugtes Gelände --------------------- */
beschreibe('Derselbe Seed ergibt dasselbe Feld', () => {
  const h = neu(), g = h.game;
  g.neuesGelaende(12345);
  const eins = Array.from(g.gelaende);
  g.neuesGelaende(12345);
  stimmt('zweimal derselbe Seed, zweimal dieselbe Karte',
         Array.from(g.gelaende).every((v, i) => v === eins[i]));
  g.neuesGelaende(999);
  stimmt('ein anderer Seed ergibt etwas anderes',
         Array.from(g.gelaende).some((v, i) => v !== eins[i]));
  g.neuesGelaende(0);
  stimmt('Seed 0 heißt leeres Feld', Array.from(g.gelaende).every(v => v === 0));
});

beschreibe('Das Feld bleibt spielbar, egal was gewürfelt wird', () => {
  const h = neu(), g = h.game, G = h.GRID, C = h.CORE;
  let imRing = 0, aufKern = 0, amRand = 0, zuWeit = 0;
  let maxJeSektor = 0, minTruemmer = 1e9, maxTruemmer = 0, schlimmster = 0;
  for (let seed = 1; seed <= 200; seed++) {
    g.neuesGelaende(seed);
    const proSektor = new Array(h.DRUCK.sektoren).fill(0);
    const freiJeSektor = new Array(h.DRUCK.sektoren).fill(0);
    let truemmer = 0;
    // Wie viel Bauplatz im Ring bleibt jeder Richtung übrig?
    for (let y = 0; y < G.rows; y++)
      for (let x = 0; x < G.cols; x++) {
        const d = Math.hypot(x - C.cx, y - C.cy);
        if (d < h.GELAENDE.frei || d > h.GELAENDE.weit) continue;
        if (g.gelaende[y * G.cols + x] !== h.BODEN.truemmer)
          freiJeSektor[h.sektorVon(Math.atan2(y - C.cy, x - C.cx))]++;
      }
    for (let y = 0; y < G.rows; y++)
      for (let x = 0; x < G.cols; x++) {
        const art = g.gelaende[y * G.cols + x];
        if (!art) continue;
        const d = Math.hypot(x - C.cx, y - C.cy);
        if (g.isCore(x, y)) aufKern++;
        if (d < h.GELAENDE.frei) imRing++;
        if (d > h.GELAENDE.weit) zuWeit++;
        if (x < 1 || y < 1 || x >= G.cols - 1 || y >= G.rows - 1) amRand++;
        if (art === h.BODEN.truemmer) {
          truemmer++;
          proSektor[h.sektorVon(Math.atan2(y - C.cy, x - C.cx))]++;
        }
      }
    maxJeSektor = Math.max(maxJeSektor, ...proSektor);
    for (let i = 0; i < proSektor.length; i++)
      schlimmster = Math.max(schlimmster, proSektor[i] / (proSektor[i] + freiJeSektor[i]));
    minTruemmer = Math.min(minTruemmer, truemmer);
    maxTruemmer = Math.max(maxTruemmer, truemmer);
  }
  gleich('nichts auf dem Kern', aufKern, 0);
  gleich('nichts im freien Ring um den Kern', imRing, 0);
  gleich('nichts jenseits der Außengrenze', zuWeit, 0);
  gleich('nichts am Feldrand', amRand, 0);
  // Zwei Nester à höchstens fünf Zellen — mehr darf in einer Richtung nicht liegen
  stimmt('keine Himmelsrichtung wird zugeschüttet (max ' + maxJeSektor + ' Zellen)',
         maxJeSektor <= h.GELAENDE.proSektor * h.GELAENDE.nest[1]);
  stimmt('und jedes Feld hat Trümmer, aber nie zu viele (' +
         minTruemmer + '-' + maxTruemmer + ')', minTruemmer >= 8 && maxTruemmer <= 45);
  stimmt('in jeder Richtung bleibt der Bauplatz überwiegend frei (höchstens ' +
         Math.round(schlimmster * 100) + ' % Schutt)', schlimmster < 0.25);
});

beschreibe('Auf Trümmern lässt sich nicht bauen', () => {
  const h = neu(), g = h.game;
  g.gelaende[12 * h.GRID.cols + 24] = h.BODEN.truemmer;   // Zelle 24,12
  stimmt('die Zelle gilt als belegt', !g.free(24, 12));
  const materie = g.matter;
  g.build('blaster', 24, 12);
  stimmt('gebaut wird dort nichts', !g.buildings.has('24,12'));
  gleich('und es kostet auch nichts', g.matter, materie);
  // Der Zug über eine Reihe überspringt sie still
  g.tool = 'wall';
  g.ziehStart('wall', 22, 12);
  g.ziehWeiter(26, 12);
  g.ziehEnde();
  stimmt('der Zug lässt die Trümmerzelle aus', !g.buildings.has('24,12'));
  stimmt('baut aber daneben weiter', g.buildings.has('23,12') && g.buildings.has('25,12'));
});

beschreibe('Ein Pylon auf einer Leiterbahn trägt mehr', () => {
  const h = neu(), g = h.game;
  const schlicht = h.bau('pylon', 24, 12);
  g.recomputeSupply();
  const ohne = schlicht.node.cap;
  g.sell(schlicht);

  g.gelaende[12 * h.GRID.cols + 24] = h.BODEN.leiter;
  const drauf = h.bau('pylon', 24, 12);
  g.recomputeSupply();
  gleich('die Leitung trägt anderthalbmal so viel',
         drauf.node.cap, ohne * h.GELAENDE.leiter, 1e-9);
  stimmt('der Bau weiß, worauf er steht', drauf.leiter === true);
});

beschreibe('In der Schneise laufen Bodentruppen schneller', () => {
  const h = neu(), g = h.game, z = h.GRID.cell;
  const mx = (h.CORE.cx + .5) * z, my = (h.CORE.cy + .5) * z;
  g.phase = 'combat'; g.spawnQueue = [{ at: 1e9 }];

  // Zwei gleiche Gegner, gleich weit vom Kern, einer davon auf einer Schneise
  const setz = (e, zellenX, zellenY) => {
    e.x = (h.CORE.cx + zellenX + .5) * z;
    e.y = (h.CORE.cy + zellenY + .5) * z;
  };
  const a = g.spawn({ type: 'crawler', angle: 0 });
  const b = g.spawn({ type: 'crawler', angle: Math.PI });
  setz(a, 8, 0);
  setz(b, -8, 0);
  g.gelaende[(h.CORE.cy | 0) * h.GRID.cols + (h.CORE.cx + 8)] = h.BODEN.schneise;

  const weg = e => { const x0 = e.x, y0 = e.y; e.update(1 / 60, g);
                     return Math.hypot(e.x - x0, e.y - y0); };
  const schnell = weg(a), normal = weg(b);
  gleich('genau der Geländefaktor', schnell / normal, h.GELAENDE.tempo, 1e-6);

  // Fliegende sind nicht am Boden — für sie gilt die Schneise nicht
  const d1 = g.spawn({ type: 'drone', angle: 0 });
  const d2 = g.spawn({ type: 'drone', angle: Math.PI });
  setz(d1, 8, 0); setz(d2, -8, 0);
  gleich('die Drohne fliegt überall gleich schnell', weg(d1) / weg(d2), 1, 1e-6);
  stimmt('der Kern steht noch', g.coreHp > 0 && mx > 0 && my > 0);
});

beschreibe('Das Feld gehört zum Spielstand', () => {
  const h = neu(), g = h.game;
  g.neuesGelaende(4242);
  const karte = Array.from(g.gelaende);
  gleich('sichern gelingt', g.merken(), true);

  const g2 = weiter().game;                    // wie ein Neuladen der Seite
  gleich('der Seed kommt zurück', g2.gelaendeSeed, 4242);
  stimmt('und daraus wieder dieselbe Karte',
         Array.from(g2.gelaende).every((v, i) => v === karte[i]));

  /* Ein Stand aus einer Fassung vor dem Gelände bekommt ein leeres Feld:
     Seine Bauten stehen auf Zellen, die damals frei waren — nachträglich
     Schutt darunter zu schieben würde sie beim Laden verschlucken. */
  const h3 = weiter();
  const roh = JSON.parse(h3.speicher.getItem(h3.SAVE_KEY));
  delete roh.gelaende;
  h3.speicher.setItem(h3.SAVE_KEY, JSON.stringify(roh));
  const g4 = weiter().game;
  gleich('er lädt trotzdem', g4.wave, g.wave);
  gleich('bekommt aber ein leeres Feld', g4.gelaendeSeed, 0);
  stimmt('ohne jedes Gelände', Array.from(g4.gelaende).every(v => v === 0));
});

beschreibe('Gespeicherte Bauten überleben ihr eigenes Gelände', () => {
  const h = neu(), g = h.game;
  g.neuesGelaende(4242);
  // Auf jeden freien Platz im Ring einen Pylon, dann sichern und laden
  let gebaut = 0;
  for (let x = 16; x < 26 && gebaut < 12; x++)
    for (let y = 8; y < 17 && gebaut < 12; y++)
      if (g.free(x, y) && g.boden(x, y) !== h.BODEN.truemmer) { h.bau('pylon', x, y); gebaut++; }
  stimmt('es steht etwas', gebaut === 12);
  g.merken();
  const g2 = weiter().game;
  gleich('alle Bauten kommen zurück', g2.buildings.size, gebaut);
});

/* --------------------- Spielstand ------------------------ */
beschreibe('Spielstand überlebt das Neuladen', () => {
  const h = neu(), g = h.game;
  const p = h.bau('pylon', 24, 12);
  const t = h.bau('blaster', 26, 12);
  h.bau('akku', 24, 11);
  g.upgrade(p); g.upgrade(p);
  t.prio = 2; t.overload = true; t.hp = Math.round(t.maxHp * 0.5);
  h.CARDS.find(c => c.id === 'ladung').apply(g.buffs, g);
  g.takenCards.set('ladung', 1);
  g.wave = 6; g.bestWave = 6; g.matter = 123; g.coreHp = 321;
  g.coreMode = 1;
  g.recomputeSupply();
  const geplant = g.plannedWave.queue.length;
  const sturm = g.plannedWave.mod ? g.plannedWave.mod.id : null;
  gleich('sichern gelingt', g.merken(), true);

  const h2 = weiter(), g2 = h2.game;          // wie ein Neuladen der Seite
  gleich('der Aufbau steht beim Öffnen schon', g2.buildings.size, 3);
  gleich('Ausbaustufe des Pylons', g2.buildings.get('24,12').level, 3);
  gleich('Lastpriorität des Turms', g2.buildings.get('26,12').prio, 2);
  gleich('Überladung des Turms', g2.buildings.get('26,12').overload, true);
  gleich('Schaden am Turm', g2.buildings.get('26,12').hp, Math.round(t.maxHp * 0.5));
  gleich('genommene Karte wirkt weiter', g2.buffs.damage, 1.18, 1e-9);
  gleich('sie steht auch im Kartenkonto', g2.takenCards.get('ladung'), 1);
  gleich('Welle', g2.wave, 6);
  gleich('Materie', g2.matter, 123);
  gleich('Kernstruktur', g2.coreHp, 321);
  gleich('Kernmodus', g2.coreMode, 1);
  gleich('angekündigte Welle ist dieselbe', g2.plannedWave.queue.length, geplant);
  gleich('auch ihr Sturm', g2.plannedWave.mod ? g2.plannedWave.mod.id : null, sturm);
  gleich('das Netz ist neu gerechnet', g2.buildings.get('26,12').supplied, true);
});

beschreibe('Gesichert wird nur in der Bauphase', () => {
  const h = neu(), g = h.game;
  gleich('Bauphase: ja', g.merken(), true);
  g.phase = 'combat';
  gleich('im Gefecht: nein', g.merken(), false);
  g.over = true;
  gleich('nach dem Ende: nein', g.merken(), false);
});

beschreibe('Eine offene Kartenwahl geht nicht verloren', () => {
  const h = neu(), g = h.game;
  h.bau('blaster', 18, 12);
  g.openDraft();
  stimmt('eine Wahl steht an', Array.isArray(g.draft) && g.draft.length > 0);
  gleich('auch dann wird gesichert', g.merken(), true);

  const g2 = weiter().game;
  stimmt('nach dem Neuladen steht wieder eine Wahl an',
         Array.isArray(g2.draft) && g2.draft.length > 0);
  gleich('und der Aufbau ist da', g2.buildings.size, 1);
});

beschreibe('Ein fremdes oder altes Format wird verworfen', () => {
  const h = neu(), g = h.game;
  h.speicher.setItem(h.SAVE_KEY, JSON.stringify({ v: h.SAVE_VERSION + 1, bauten: [] }));
  stimmt('andere Fassung: nicht angeboten', g.gespeicherteRunde() === null);
  h.speicher.setItem(h.SAVE_KEY, '{kein json');
  stimmt('kaputter Text: nicht angeboten', g.gespeicherteRunde() === null);
  gleich('und laden lehnt ab', g.laden({ v: h.SAVE_VERSION, bauten: 'nein' }), false);
});

beschreibe('Ein alter Spielstand startet die nächste Messung nicht', () => {
  /* Das Spiel sucht beim Laden von selbst nach einem Stand. Für den Bot
     ist das eine Falle: Ohne geleerten Speicher liefe Messlauf zwei mit
     dem Aufbau von Lauf eins weiter. Beide Richtungen gehören geprüft. */
  const h = neu(), g = h.game;
  h.bau('blaster', 18, 12);
  gleich('gesichert', g.merken(), true);
  gleich('mit Speicher wird fortgesetzt', weiter().game.buildings.size, 1);
  gleich('mit geleertem Speicher nicht', neu().game.buildings.size, 0);
});

/* --------------------- Bestenliste ----------------------- */
beschreibe('Bestenliste sortiert, deckelt und zählt Bauteile', () => {
  const h = neu(), g = h.game;
  h.bau('blaster', 18, 12); h.bau('blaster', 18, 13); h.bau('cannon', 18, 14);
  g.wave = 7; g.bestWave = 7;
  const e1 = g.eintragen();
  gleich('erster Lauf steht auf Platz 1', e1.platz, 0);
  gleich('Bauteile gezählt', e1.eintrag.teile.blaster, 2);

  g.wave = 3; g.bestWave = 3;
  const e2 = g.eintragen();
  gleich('der schwächere Lauf landet dahinter', e2.platz, 1);
  gleich('vorn steht die höhere Welle', e2.liste[0].wave, 7);

  for (let i = 0; i < h.BEST_MAX + 3; i++) { g.wave = 20 + i; g.bestWave = g.wave; g.eintragen(); }
  const l = g.bestenliste();
  gleich('die Liste bleibt gedeckelt', l.length, h.BEST_MAX);
  stimmt('und bleibt absteigend sortiert', l.every((e, i) => i === 0 || l[i - 1].wave >= e.wave));
});

beschreibe('Gewertet wird die höchste begonnene Welle', () => {
  const h = neu(), g = h.game;
  g.startWave();
  gleich('der Wellenstart merkt sich die Zahl', g.bestWave, 1);
  g.wave = 0;                                  // wie nach einem Neuladen auf den alten Stand
  gleich('gewertet wird trotzdem die höhere', g.eintragen().eintrag.wave, 1);
});

beschreibe('Am Ende ist der Stand weg und der Lauf in der Liste', () => {
  const h = neu(), g = h.game;
  h.bau('blaster', 18, 12);
  gleich('vorher liegt ein Stand vor', g.merken(), true);
  stimmt('und wird auch gefunden', !!g.gespeicherteRunde());
  g.damageCore(1e9, null);
  stimmt('nach dem Kernverlust ist er weg', g.gespeicherteRunde() === null);
  gleich('dafür steht der Lauf in der Bestenliste', g.bestenliste().length, 1);
});

/* --------------------- Tagesfeld -------------------------- */
beschreibe('Der Tag bestimmt das Feld', () => {
  const h = neu(), g = h.game;
  g.beginnen('2026-09-06');
  const karte = Array.from(g.gelaende);
  const seed = g.gelaendeSeed;
  stimmt('das Tagesfeld ist gesetzt', g.tagesfeld());
  stimmt('und es liegt Gelände darauf', karte.some(v => v !== 0));

  g.beginnen('2026-09-06');
  gleich('derselbe Tag, derselbe Seed', g.gelaendeSeed, seed);
  stimmt('und dieselbe Karte', Array.from(g.gelaende).every((v, i) => v === karte[i]));

  g.beginnen('2026-09-07');
  stimmt('ein anderer Tag, ein anderes Feld', g.gelaendeSeed !== seed);

  g.beginnen('');
  stimmt('das freie Feld ist kein Tagesfeld', !g.tagesfeld());
});

beschreibe('Dieselbe Welle am selben Tag ist dieselbe Welle', () => {
  const h = neu(), g = h.game;
  /* Kurzfassung einer geplanten Welle. Bewusst eine Prüfsumme und nicht
     die ganze Liste: Bei einem Fehlschlag soll eine lesbare Zeile
     dastehen und nicht vierzig Gegner mit vier Nachkommastellen. */
  const abdruck = w => {
    let summe = 0;
    for (const e of w.queue)
      summe = (summe * 31 + h.seedVon(e.type + e.angle.toFixed(4))) % 1000000;
    return w.queue.length + ' Gegner · Prüfsumme ' + summe +
           ' · Sturm ' + (w.mod ? w.mod.id : '—');
  };
  g.beginnen('2026-09-06');
  const w7 = abdruck(g.planWave(7)), w8 = abdruck(g.planWave(8));

  // Beliebig oft dazwischen würfeln — die Welle bleibt dieselbe
  for (let i = 0; i < 50; i++) g.planWave(3);
  gleich('Welle 7 ist wieder dieselbe', abdruck(g.planWave(7)), w7);
  stimmt('Welle 8 ist eine andere', abdruck(g.planWave(8)) !== w7);
  gleich('aber auch sie bleibt sich gleich', abdruck(g.planWave(8)), w8);

  g.beginnen('2026-09-07');
  stimmt('am nächsten Tag kommt etwas anderes', abdruck(g.planWave(7)) !== w7);

  g.beginnen('');
  const frei1 = abdruck(g.planWave(7)), frei2 = abdruck(g.planWave(7));
  stimmt('im freien Feld würfelt jede Planung neu', frei1 !== frei2);
});

beschreibe('Auch die Karten zur Wahl gehören zum Tag', () => {
  const h = neu(), g = h.game;
  g.beginnen('2026-09-06');
  g.wave = 5;
  g.openDraft();
  const erste = g.draft.map(c => c.id).join(',');
  g.draft = null;
  g.openDraft();
  gleich('zweimal dieselbe Auswahl', g.draft.map(c => c.id).join(','), erste);

  g.draft = null; g.wave = 6; g.openDraft();
  stimmt('die nächste Welle zieht anders', g.draft.map(c => c.id).join(',') !== erste);
});

beschreibe('Eine Tagespartie bleibt ihrem Tag treu', () => {
  const h = neu(), g = h.game;
  g.beginnen('2026-09-06');
  g.wave = 4; g.bestWave = 4;
  const karte = Array.from(g.gelaende);
  gleich('sichern gelingt', g.merken(), true);

  const g2 = weiter().game;                  // Neuladen, womöglich an einem anderen Tag
  gleich('der Tag kommt zurück', g2.tagesTag, '2026-09-06');
  stimmt('und mit ihm dasselbe Feld',
         Array.from(g2.gelaende).every((v, i) => v === karte[i]));
  stimmt('die Partie wartet auf „Fortsetzen"', g2.gestartet === false);
  gleich('und rechnet solange nicht', (g2.update(1), g2.wave), 4);
});

beschreibe('Vor dem Start läuft nichts und wird nichts gesichert', () => {
  const h = frisch(), g = h.game;             // wie eine frisch geöffnete Seite
  stimmt('die Partie hat nicht begonnen', !g.gestartet);
  const timer = g.buildTimer;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  gleich('die Bauphase tickt nicht hinter der Startanzeige', g.buildTimer, timer);
  gleich('und ein Spielstand entsteht auch nicht', g.merken(), false);
  gleich('gespeichert ist nichts', h.speicher.getItem(h.SAVE_KEY), null);

  g.beginnen('');
  stimmt('nach der Wahl läuft es', g.gestartet);
  g.update(1 / 60);
  stimmt('und die Bauphase zählt herunter', g.buildTimer < timer);
});

beschreibe('Das Ergebnis lässt sich weitergeben', () => {
  const h = neu(), g = h.game;
  g.beginnen('2026-09-06');
  g.wave = 12; g.bestWave = 12;
  h.bau('pylon', 24, 12); h.bau('pylon', 25, 12); h.bau('blaster', 26, 12);
  const erg = g.eintragen();
  gleich('der Tag steht im Eintrag', erg.eintrag.tag, '2026-09-06');
  const text = h.ergebnisText(erg.eintrag);
  stimmt('die Zeile nennt das Tagesfeld mit Datum', text.indexOf('Tagesfeld 06.09.2026') >= 0);
  stimmt('und die erreichte Welle', text.indexOf('Welle 12') >= 0);
  stimmt('und die häufigsten Bauteile', text.indexOf('2 Pylone') >= 0);

  // Im freien Feld sagt sie ausdrücklich, dass das Feld ein eigenes war
  g.tagesTag = '';
  const frei = h.ergebnisText(g.eintragen().eintrag);
  stimmt('freies Feld wird als solches benannt', frei.indexOf('freies Feld') >= 0);
  stimmt('und nennt kein Datum als Feld', frei.indexOf('Tagesfeld') < 0);
});

beschreibe('Der Tag kommt aus dem Kalender des Spielers', () => {
  const h = neu();
  gleich('Silvester, kurz vor Mitternacht',
         h.heute(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  gleich('eine Minute später ist es ein neues Feld',
         h.heute(new Date(2027, 0, 1, 0, 1)), '2027-01-01');
  gleich('einstellige Tage stehen mit Null', h.heute(new Date(2026, 8, 6, 12)), '2026-09-06');
  stimmt('und aus dem Tag wird eine Zahl', h.seedVon('2026-09-06') !== h.seedVon('2026-09-07'));
  gleich('die Anzeige dreht das Datum um', h.datumKurz('2026-09-06'), '06.09.2026');
});

/* ---------------------- Balance-Anker ----------------------
   Alle Prüfungen oben leiten ihren Erwartungswert aus config.js ab.
   Das ist Absicht: Sie prüfen die Verdrahtung — ob eine Konstante
   überhaupt an der richtigen Stelle wirkt — und schlagen nicht bei
   jeder bewussten Abstimmung Alarm.

   Genau deshalb würden sie eine versehentlich verschobene Zahl aber
   auch nicht bemerken. Dafür ist dieser Block da: fest eingetragene
   Werte, die den heutigen Stand festhalten. Schlägt hier etwas fehl,
   sind zwei Antworten richtig — entweder war die Änderung ein Versehen,
   oder sie war gewollt und der Wert wird hier nachgezogen. Wichtig ist
   nur, dass es auffällt.
------------------------------------------------------------- */
beschreibe('Balance-Anker (bei gewollter Abstimmung hier nachziehen)', () => {
  const h = frisch(), g = h.game;
  const last = t => h.BUILDINGS[t].energy / h.BUILDINGS[t].cooldown;

  gleich('Startmaterie', h.game.matter, 170);
  gleich('Kernstruktur', g.coreHpMax, 600);
  gleich('Pufferkapazität', g.energyMax, 111);   // 130 im Modus Einspeisung
  gleich('Regeneration', g.regen, 11.3);         // 9 im Modus Einspeisung

  gleich('Leitungslast des Kerns', h.FLOW.core, 58);
  gleich('Leitungslast eines Pylons', h.FLOW.pylon, 15);
  gleich('Leitungslast eines Pylons auf Stufe 5',
         h.FLOW.pylon + h.FLOW.perLevel * (h.UPGRADE.maxLevel - 1), 39);
  gleich('Leitungslast je Akku-Stufe', h.FLOW.akku, 4);

  gleich('Titan: Trefferpunkte', h.ENEMIES.titan.hp, 880);
  gleich('Titan: Schaden je Schlag', h.ENEMIES.titan.dmg, 55);
  gleich('Titan: Panzerung', h.ENEMIES.titan.armor, 10);
  gleich('Schild: Untergrenze im Puffer',
         h.CORE_MODES.find(m => m.absorb).floor, 0.35);

  gleich('Reaktor: Ertrag', h.BUILDINGS.reactor.regen, 6);
  gleich('Akku: Speicher', h.BUILDINGS.akku.capacity, 52);
  gleich('Kernmodi', h.CORE_MODES.length, 3);
  gleich('Anlauf beim Umschalten', h.CORE_SWITCH.time, 3.5);

  gleich('Dauerlast Blaster', last('blaster'), 4.2857, 1e-4);
  gleich('Dauerlast Kanone', last('cannon'), 6.087, 1e-3);
  gleich('Dauerlast Frostturm', last('frost'), 2.7778, 1e-4);

  gleich('Ausbaukosten Blaster Stufe 2 bis 5',
         [1, 2, 3, 4].map(l => h.upgradeSteps(30, l)).join(','), '39,56,72,89');
  gleich('Bauteile insgesamt', Object.keys(h.BUILDINGS).length, 11);
  gleich('Lichtbogen: Sprünge', h.BUILDINGS.arc.arc, 3);
  gleich('Lichtbogen: Abfall je Sprung', h.BUILDINGS.arc.arcFalloff, 0.72);
  gleich('Dauerlast Lichtbogen', last('arc'), 4.5, 1e-9);
  gleich('Minenleger: Schaden je Mine', h.BUILDINGS.mine.damage, 62);
  gleich('Minenleger: Minen je Leger', h.BUILDINGS.mine.minen, 5);
  gleich('Werkdrohne: Struktur je Sekunde', h.BUILDINGS.drohne.repair, 14);
  gleich('Werkdrohne: Energie je Struktur', h.BUILDINGS.drohne.perHp, 0.3);
  gleich('Schildfeld: Anteil am Treffer', h.BUILDINGS.schild.absorb, 0.7);
  gleich('Schildfeld: Vorrat je Stufe', h.BUILDINGS.schild.pool, 170);
  gleich('Schildfeld: Energie je Punkt', h.BUILDINGS.schild.perPoint, 0.9);
  gleich('Schildfeld: lädt ab', h.BUILDINGS.schild.ab, 0.6);
  gleich('Reparaturanteil', h.REPAIR_SHARE, 0.35);
  gleich('Erstattung beim Abbau', h.SELL_REFUND, 0.6);
  gleich('Anteil beim Verschieben', h.MOVE_SHARE, 0.25);

  gleich('Entladung: Pufferkosten', g.powerCost(h.POWERS.discharge), 61.05, 1e-9);
  gleich('Entladung: Schaden im Zentrum',
         g.powerCost(h.POWERS.discharge) * h.POWERS.discharge.perEnergy, 177.045, 1e-6);
  gleich('Netzstoß: Schadensfaktor', h.POWERS.surge.damage, 2);
  gleich('Netzstoß: Verbrauchsfaktor', h.POWERS.surge.cost, 0.55);
  gleich('Netzstoß: Laufzeit', h.POWERS.surge.time, 6);
  gleich('Notpuls: Heilanteil', h.POWERS.pulse.heal, 0.34);

  gleich('Trefferpunkte Welle 10', h.waveHpScale(10), 3.736, 1e-3);
  gleich('Trefferpunkte Welle 20', h.waveHpScale(20), 9.816, 1e-3);
  gleich('Trefferpunkte Welle 30', h.waveHpScale(30), 21.096, 1e-3);
  gleich('Wellenbudget Welle 10', h.waveBudget(10), 74.4, 1e-2);
  gleich('Wellenbudget Welle 20', h.waveBudget(20), 238.4, 1e-2);
  gleich('Wellenbudget Welle 30', h.waveBudget(30), 516.8, 1e-2);

  // Druckgedächtnis: Diese vier Zahlen entscheiden, wie hart die
  // Rückmeldung ausfällt. min/max sind der Deckel — wer sie weitet,
  // riskiert Partien, die immer an derselben Ecke enden.
  gleich('Druck: Glättung', h.DRUCK.glaettung, 0.55);
  gleich('Druck: Spanne', h.DRUCK.spanne, 1.5);
  gleich('Druck: Untergrenze', h.DRUCK.min, 0.5);
  gleich('Druck: Obergrenze', h.DRUCK.max, 2);
  gleich('Druck: Vorsprung für die Bilanzzeile', h.DRUCK.vorsprung, 0.25);
  gleich('Druck: Tiefe in Zellen', h.DRUCK.tiefe, 12);

  gleich('Karten im Pool', h.CARDS.length, 62);
  gleich('Gegnertypen', Object.keys(h.ENEMIES).length, 13);
  gleich('Sturmwellen', h.MODIFIERS.length, 7);
  gleich('Bosse', h.BOSSES.length, 3);
});

/* --------------------- Kartentexte -----------------------
   Eine Karte, die etwas anderes tut, als auf ihr steht, ist der
   unangenehmste Fehler im Spiel: Man wählt sie bewusst, bekommt etwas
   anderes und merkt es nie. Deshalb wird hier jede der 62 Karten auf
   eine Kopie der Grundwerte angewandt, der Unterschied ausgerechnet und
   nachgesehen, ob die Zahl auch im Text steht.
---------------------------------------------------------- */
beschreibe('Jede Karte tut, was auf ihr steht', () => {
  const h = neu(), g = h.game;

  /* Karten, die ihre Zahl als Wort schreiben („doppelt", „halbe Wucht",
     „ein Sprung mehr") oder sie bewusst nicht nennen. Für sie prüft die
     Schleife nur, DASS sie etwas ändern — die Werte selbst stehen
     darunter einzeln. */
  const inWorten = new Set(['frostbrand', 'sprengbolzen', 'kettenblitz', 'dornen',
    'kernstoss', 'inselbetrieb', 'ausschlachten', 'lastverteiler', 'schnellschaltung',
    'ventil', 'zwitterkern', 'ueberschlag', 'minenfeld', 'werkstatt']);

  /* Die Zahl allein genügt nicht: „+40 % Feuerrate" und „+40 % Reichweite"
     unterscheiden sich in keiner Ziffer. Zu jedem Wert gehört deshalb ein
     Wort, das im Text stehen muss — und bei den Karten für einen einzelnen
     Turmtyp auch dessen Name. */
  const WORT = {
    damage: ['Schaden'], dmg: ['Schaden'], range: ['Reichweite'],
    rate: ['Feuerrate', 'schneller'], energy: ['Energie'], capacity: ['Speicher'],
    regen: ['Energie'], regenMul: ['Regeneration'], netRadius: ['reichen', 'Zellen'],
    bounty: ['Materie'], buildCost: ['kosten', 'billiger'], structure: ['Struktur'],
    repair: ['Struktur'], matterPerWave: ['Materie'], coreRepair: ['Struktur'],
    splash: ['Wirkungsradius'], flow: ['Last'], akkuCap: ['Akkus'],
    powerCd: ['Kernbefehle'], powerDrain: ['Kernbefehle'], pierce: ['Panzerung'],
    vsAir: ['fliegende'], hitSlow: ['bremst'], coreHpMax: ['Kern'],
    repairSpeed: ['Werkdrohnen'], absorbPlus: ['Schildfelder']
  };
  const TYPWORT = { blaster: 'Blaster', cannon: 'Kanone', frost: 'Frost',
                    arc: 'Lichtbogen', mine: 'Mine' };

  const flach = (o, pfad = '', ziel = {}) => {
    for (const [k, v] of Object.entries(o)) {
      const pf = pfad ? pfad + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flach(v, pf, ziel);
      else ziel[pf] = v;
    }
    return ziel;
  };
  const grund = flach(g.buffs);          // frisches Spiel, also die Grundwerte
  const kopie = () => JSON.parse(JSON.stringify(g.buffs));

  for (const c of h.CARDS) {
    const b = kopie();
    // Ein Spielzustand nur so weit, wie die Karten ihn anfassen
    const gg = { coreHpMax: g.coreHpMax, coreHp: g.coreHp, buildings: new Map() };
    c.apply(b, gg);
    const jetzt = flach(b);
    const geaendert = [];
    for (const k of Object.keys(jetzt))
      if (jetzt[k] !== grund[k]) geaendert.push([k, grund[k], jetzt[k]]);
    if (gg.coreHpMax !== g.coreHpMax) geaendert.push(['coreHpMax', g.coreHpMax, gg.coreHpMax]);
    // Die Werkstatt fasst nur bestehende Bauten an, hier steht keiner
    stimmt(c.name + ' ändert nichts', geaendert.length > 0 || c.id === 'werkstatt');
    if (inWorten.has(c.id)) continue;

    for (const [k, alt, wert] of geaendert) {
      if (typeof alt !== 'number' || typeof wert !== 'number') continue;
      /* Drei Lesarten derselben Änderung: als Prozentsatz vom alten Wert
         (1,18 → 18 %), als Summand (+55) und als Prozentpunkt (0,15 → 15).
         Eine davon muss im Text vorkommen. */
      const kandidaten = new Set();
      const merke = z => {
        if (z >= 1) kandidaten.add(String(Math.round(z)));
        kandidaten.add(String(Math.round(z * 10) / 10).replace('.', ','));
      };
      if (alt !== 0) merke(Math.abs(wert / alt - 1) * 100);
      merke(Math.abs(wert - alt));
      merke(Math.abs(wert - alt) * 100);
      stimmt(c.name + ' — „' + c.desc + '" nennt die Änderung an ' + k +
             ' nicht (' + alt + ' → ' + wert + ')',
             [...kandidaten].some(z => c.desc.includes(z)));

      // klein verglichen, damit auch das Wort im Kompositum zählt
      // („Energiespeicher" für Speicher, „Leitungslast" für Last)
      const text = c.desc.toLowerCase();
      const teile = k.split('.');
      const woerter = WORT[teile[teile.length - 1]];
      if (woerter)
        stimmt(c.name + ' — „' + c.desc + '" sagt nicht, dass es um ' + teile[teile.length - 1] +
               ' geht (' + woerter.join(' / ') + ')',
               woerter.some(w => text.includes(w.toLowerCase())));
      if (teile[0] === 'type')
        stimmt(c.name + ' — „' + c.desc + '" nennt den Turmtyp ' + teile[1] + ' nicht',
               text.includes(TYPWORT[teile[1]].toLowerCase()));
    }
  }

  /* Kein Buff ohne Leser: Eine Karte, die einen Wert setzt, den nirgends
     jemand ausliest, wäre eine tote Wahl — und im Spiel nicht zu erkennen. */
  const quellen = ['js/game.js', 'js/entities.js']
    .map(f => require('fs').readFileSync(path.resolve(__dirname, '..', f), 'utf8')).join('\n');
  for (const k of Object.keys(g.buffs)) {
    if (k === 'type') continue;
    stimmt('Buff ' + k + ' wird nirgends gelesen', new RegExp('buffs\\.' + k + '\\b').test(quellen));
  }
  for (const k of ['dmg', 'rate', 'range', 'energy'])
    stimmt('Turmbuff ' + k + ' wird nirgends gelesen',
           quellen.includes("typeBuff(b, '" + k + "')"));

  // Die Karten, die ihre Zahl als Wort schreiben — hier steht sie als Zahl
  const karte = id => h.CARDS.find(c => c.id === id);
  const wirkung = (id, schluessel) => {
    const b = kopie();
    karte(id).apply(b, { coreHpMax: 0, coreHp: 0, buildings: new Map() });
    return schluessel.split('.').reduce((o, t) => o[t], b);
  };
  gleich('Kettenblitz: halbe Wucht auf das zweite Ziel', wirkung('kettenblitz', 'chain'), 0.5);
  gleich('Lastverteiler: doppelte Einspeisung', wirkung('lastverteiler', 'reactorFeed'), 2);
  gleich('Schnellschaltung: halbe Umschaltzeit', wirkung('schnellschaltung', 'modeSwitch'), 0.5);
  gleich('Überlastventil: Überladung kostet das Doppelte', wirkung('ventil', 'overloadCost'), 2);
  gleich('Zwitterkern: halber Nachteil', wirkung('zwitterkern', 'modePenalty'), 0.5);
  gleich('Inselbetrieb: halbe Rate ohne Netz', wirkung('inselbetrieb', 'unpoweredRate'), 0.5);
  gleich('Ausschlachten: voller Preis zurück', wirkung('ausschlachten', 'refund'), 1);
  gleich('Überschlag: ein Sprung mehr', wirkung('ueberschlag', 'arcPlus'), 1);
  gleich('Minenfeld: zwei Minen mehr', wirkung('minenfeld', 'minenPlus'), 2);
  gleich('Unterkühlung: bremst um 10 %', wirkung('unterkuehlung', 'hitSlow'), 0.1, 1e-9);

  // Werkstatt: die einzige Karte, die bestehende Bauten anfasst
  const turm = h.bau('blaster', 22, 12);
  karte('werkstatt').apply(g.buffs, g);
  gleich('Werkstatt: Stufe steigt', turm.level, 2);
  gleich('Werkstatt: Struktur passt zur neuen Stufe', turm.hp, g.structureOf(turm));

  /* Feldharmonie darf nur zweimal kommen: absorbOf deckelt bei 90 %,
     0,7 + 2 × 0,15 liegt schon darüber. Ein drittes Mal wäre eine Wahl,
     die nichts bewirkt. */
  const schild = h.bau('schild', 24, 12);
  gleich('Feldharmonie: höchstens zweimal', karte('feldharmonie').max, 2);
  g.buffs.absorbPlus = 0.30;
  gleich('Schildfeld: Deckel bei 90 %', g.absorbOf(schild), 0.9, 1e-9);
});

/* ---------------------- Landingpage ----------------------
   Die Seite erklärt dieselben Zahlen, die in config.js stehen — und
   nichts hielt die beiden bisher zusammen. Genau da ist der Stand
   auseinandergelaufen: Der Lichtbogen stand mit 12 Schaden statt 14 in
   der Stückliste, der Minenleger mit 46 statt 62, und der Kartenstapel
   war noch der von vor fünf Karten. Diese Prüfungen lesen die HTML-Datei
   und vergleichen, was dort behauptet wird, mit dem, was gilt.
---------------------------------------------------------- */
beschreibe('Die Landingpage nennt die Werte aus config.js', () => {
  const fs = require('fs');
  const h = frisch();
  const seite = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const komma = z => String(z).replace('.', ',');
  const steht = (was, text) => stimmt(was + ' — „' + text + '" fehlt auf der Seite',
                                      seite.includes(text));

  // --- Stückliste: eine Zeile je Bauteil, Kosten, Struktur, Taste ---
  const liste = seite.slice(seite.indexOf('id="bauteile"'),
                            seite.indexOf('</table>', seite.indexOf('id="bauteile"')));
  const zeilen = [...liste.matchAll(
    /<tr><td>\d+<\/td><td><span class="l-key">(.)<\/span> ([^<]+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>([^<]*)<\/td>/g)];
  gleich('Stückliste: Zeilen', zeilen.length, Object.keys(h.BUILDINGS).length);
  for (const [typ, def] of Object.entries(h.BUILDINGS)) {
    const z = zeilen.find(z => z[2] === def.name);
    if (!z) { stimmt('Stückliste: Zeile für ' + def.name, false); continue; }
    gleich(def.name + ': Taste', z[1].toLowerCase(), def.key);
    gleich(def.name + ': Materie', +z[3], def.cost);
    gleich(def.name + ': Struktur', +z[4], def.hp);
    // Steht in der Leistungsspalte eine Schadenszahl, muss sie stimmen
    const dmg = z[5].match(/(\d+) Schaden/);
    if (dmg) gleich(def.name + ': Schaden', +dmg[1], def.damage);
  }
  // Was sonst noch in der Leistungsspalte behauptet wird
  steht('Pylon: Radius', 'Radius ' + komma(h.BUILDINGS.pylon.supply) + ' Z');
  steht('Reaktor: Nachschub', '+' + h.BUILDINGS.reactor.regen + '/s Nachschub');
  steht('Akku: Speicher und Leitung',
        '+' + h.BUILDINGS.akku.capacity + ' Speicher, +' + h.FLOW.akku + '/s Leitung');
  steht('Frostturm: Bremswirkung', '50 % Tempo');
  steht('Werkdrohne: Reparaturrate', h.BUILDINGS.drohne.repair + ' Struktur/s');
  steht('Schildfeld: Vorrat und Anteil',
        'Vorrat ' + h.BUILDINGS.schild.pool + ', schluckt ' +
        Math.round(h.BUILDINGS.schild.absorb * 100) + ' %');

  // --- Ausbau, Reparatur, Abbau, Verschieben ---
  steht('Ausbau: Schaden', '+' + Math.round((h.UPGRADE.damage - 1) * 100) + ' % Schaden');
  steht('Ausbau: Reichweite', '+' + Math.round((h.UPGRADE.range - 1) * 100) + ' % Reichweite');
  steht('Ausbau: Struktur', '+' + Math.round((h.UPGRADE.hp - 1) * 100) + ' % Struktur');
  steht('Reparatur: Anteil', 'Reparieren kostet ' + Math.round(h.REPAIR_SHARE * 100) + ' %');
  steht('Abbau: Erstattung', 'erstattet ' + Math.round(h.SELL_REFUND * 100) + ' %');
  steht('Verschieben: Anteil', 'für ' + Math.round(h.MOVE_SHARE * 100) + ' % des Bauwerts');
  // Jede Stufe-5-Fähigkeit ist genannt — sonst fehlt die des nächsten Bauteils
  for (const [typ, sp] of Object.entries(h.SPECIALS))
    steht('Stufe 5: ' + typ, sp.name);

  // --- Leitungslast, Kern, Karten ---
  steht('Leitungslast: Kern', 'Kern gibt ' + h.FLOW.core + ' Energie pro Sekunde');
  steht('Leitungslast: Pylon', 'ein Pylon ' + h.FLOW.pylon);
  steht('Leitungslast: je Stufe', 'je Ausbaustufe ' + h.FLOW.perLevel + ' mehr');
  steht('Kern: Struktur', 'Energiequelle, ' + h.CORE.hp + ' HP');
  steht('Kern: Versorgungsradius', 'R ' + komma(h.CORE.supply) + ' Zellen');
  steht('Raster', h.GRID.cols + ' × ' + h.GRID.rows + ' Zellen');
  steht('Kartenstapel', 'Aus ' + h.CARDS.length + ' Karten');
  // Die drei Beispielkarten auf der Seite sind Abschriften echter Karten
  for (const [, name, desc] of seite.matchAll(
       /<div class="l-demo-card"><b>([^<]+)<\/b><span>([^<]+)<\/span><\/div>/g)) {
    const k = h.CARDS.find(c => c.name === name);
    stimmt('Beispielkarte „' + name + '" gibt es', !!k);
    if (k) gleich('Beispielkarte ' + name + ': Text', desc, k.desc);
  }
  steht('Sturmwellen: Prämie', Math.round(h.MOD_BONUS * 100) + ' % mehr Prämie');

  // --- Kernbefehle und Kernmodi ---
  for (const p of Object.values(h.POWERS)) {
    steht(p.name + ': Name', p.name);
    steht(p.name + ': Pufferkosten', '<td>' + Math.round(p.drain * 100) + ' %</td>');
    steht(p.name + ': Abklingzeit', '<td>' + p.cd + ' s</td>');
  }
  const schild = h.CORE_MODES.find(m => m.id === 'schild');
  steht('Kernmodus Schild: Anteil', Math.round(schild.absorb * 100) + ' % des Kernschadens');
  steht('Kernmodus Schild: Preis', komma(schild.perDamage) + ' Energie');
  steht('Kernmodus Schild: Untergrenze', Math.round(schild.floor * 100) + ' % Ladung');
  steht('Moduswechsel: Anlauf', komma(h.CORE_SWITCH.time) + ' Sekunden Anlauf');
  steht('Moduswechsel: Drosselung', Math.round(h.CORE_SWITCH.regen * 100) + ' % fällt');

  // --- Gegner: ab welcher Welle steht auf der Seite ---
  for (const [typ, welle] of Object.entries(h.UNLOCK)) {
    const name = h.ENEMIES[typ].name;
    if (!seite.includes('<h3>' + name + '</h3>')) continue;   // Sammelzeilen prüft die nächste Zeile
    steht(name + ': Startwelle', 'ab Welle ' + welle + '</span><h3>' + name + '</h3>');
  }
  // Jeder Gegner, jeder Sturm, jeder Kernmodus wird auf der Seite genannt —
  // sonst erklärt sie beim nächsten neuen Typ eine Fassung, die es nicht mehr gibt
  for (const typ of Object.keys(h.UNLOCK)) steht('Gegner genannt', h.ENEMIES[typ].name);
  for (const b of h.BOSSES) steht('Boss genannt', h.ENEMIES[b.type].name);
  for (const m of h.MODIFIERS) steht('Sturmwelle genannt', '<dt>' + m.name + '</dt>');
  for (const m of h.CORE_MODES) steht('Kernmodus genannt', '<td>' + m.name + '</td>');
  steht('Bosse: Abstand', 'alle ' + h.BOSS_EVERY + ' Wellen');
  steht('Lastpriorität: Normal', 'ab ' + Math.round(h.PRIORITY[1].threshold * 100) + ' %');
  steht('Lastpriorität: Sparlast', 'erst ab ' + Math.round(h.PRIORITY[2].threshold * 100) + ' % Ladung');
});

/* ----------------------- README --------------------------
   Dieselbe Frage wie bei der Landingpage, nur für die lange Fassung:
   Die README erklärt jede Zahl des Spiels, und niemand hielt beide
   zusammen. Geprüft wird, was sich als Zeichenkette aus config.js
   ableiten lässt — Preise, Tabellen, Schwellen. Prosa bleibt Prosa.
---------------------------------------------------------- */
beschreibe('Die README nennt die Werte aus config.js', () => {
  const h = frisch();
  const text = require('fs').readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
  const eng = text.replace(/\s+/g, ' ');      // für Sätze, die über Zeilen laufen
  const komma = z => String(z).replace('.', ',');
  const steht = (was, s, wo = text) =>
    stimmt(was + ' — „' + s + '" fehlt in der README', wo.includes(s));
  /* Die README schreibt kleine Zahlen als Wort und den Deckel als „2,0".
     Beide Schreibweisen sind richtig, also zählt jede davon. */
  const eines = (was, liste, wo = text) =>
    stimmt(was + ' — keine dieser Schreibweisen steht in der README: ' + liste.join(' / '),
           liste.some(s => wo.includes(s)));
  const WORT = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben',
                'acht', 'neun', 'zehn', 'elf', 'zwölf'];

  // --- Gebäude: Preis und Stufe-5-Zeile ---
  for (const def of Object.values(h.BUILDINGS))
    steht('Preis ' + def.name, '**' + def.name + '** (' + def.cost + ')');
  for (const [typ, sp] of Object.entries(h.SPECIALS))
    steht('Stufe 5 ' + typ, '| ' + h.BUILDINGS[typ].name + ' | **' + sp.name + '**');

  // --- Netz und Ausbau ---
  steht('Pylon: Radius', 'Radius ' + komma(h.BUILDINGS.pylon.supply) + ' Zellen');
  steht('Pylon: Leitungslast', 'Leitungslast ' + h.FLOW.pylon + '/s (+' + h.FLOW.perLevel + '/s je Stufe)');
  steht('Kern: Leitungslast', 'der Kern ' + h.FLOW.core + '/s');
  steht('Pylon Stufe 5: Leitungslast', (h.FLOW.pylon + 4 * h.FLOW.perLevel) + '/s');
  steht('Akku: Speicher', '+' + h.BUILDINGS.akku.capacity + ' Speicher je Stufe');
  steht('Akku: Leitung', h.FLOW.akku + '/s je Stufe');
  steht('Reaktor: Nachschub', '+' + h.BUILDINGS.reactor.regen + ' Energie/s je Stufe');
  steht('Ausbau', 'je +' + Math.round((h.UPGRADE.damage - 1) * 100) + ' % Schaden, +' +
        Math.round((h.UPGRADE.range - 1) * 100) + ' % Reichweite, +' +
        Math.round((h.UPGRADE.hp - 1) * 100) + ' % Struktur');
  steht('Reparatur', 'für ' + Math.round(h.REPAIR_SHARE * 100) + ' % seines Werts');
  steht('Abbau', 'erstattet ' + Math.round(h.SELL_REFUND * 100) + ' %');
  steht('Verschieben', '(' + Math.round(h.MOVE_SHARE * 100) + ' % des Bauwerts)');

  // --- Kernbefehle und Kernmodi ---
  for (const p of Object.values(h.POWERS))
    steht(p.name + ': Tabellenzeile',
          '| **' + p.name + '** | `' + p.key.toUpperCase() + '` | ' +
          Math.round(p.drain * 100) + ' % | ' + p.cd + ' s |');
  const [ein, spe, sch] = h.CORE_MODES;
  steht('Einspeisung', '+' + Math.round((ein.regen - 1) * 100) + ' % Regeneration');
  steht('Speicher', '+' + Math.round((spe.cap - 1) * 100) + ' % Speicher');
  steht('Schild: Anteil', Math.round(sch.absorb * 100) + ' % des Kernschadens');
  steht('Schild: Preis', komma(sch.perDamage) + ' Energie je Schadenspunkt');
  steht('Schild: Untergrenze', 'über **' + Math.round(sch.floor * 100) + ' %** steht');
  steht('Moduswechsel: Anlauf', '**' + komma(h.CORE_SWITCH.time) + ' Sekunden Anlauf**');
  steht('Moduswechsel: Drosselung', 'fällt auf ' + Math.round(h.CORE_SWITCH.regen * 100) + ' %');

  // --- Wellen, Stürme, Gegner ---
  steht('Sturm: erste Welle', 'Ab Welle ' + h.MOD_FROM_WAVE);
  steht('Sturm: Prämie', '**' + Math.round(h.MOD_BONUS * 100) + ' % mehr Prämie**');
  for (const m of h.MODIFIERS) steht('Sturm ' + m.id, '| ' + m.name + ' | ');
  for (const [typ, welle] of Object.entries(h.UNLOCK)) {
    const n = h.ENEMIES[typ].name;
    stimmt('Startwelle ' + n + ' (' + welle + ') fehlt in der README',
           eng.includes(n + ' ab Welle ' + welle) || eng.includes(n + ' ab ' + welle));
  }
  steht('Höchstzahlen je Welle',
        'Wächter ' + h.TYPE_CAP.warden + ', Mender und Zapfer ' + h.TYPE_CAP.mender +
        ', Saboteure ' + h.TYPE_CAP.sabot + ', Splitter ' + h.TYPE_CAP.splitter, eng);
  steht('Titan: Panzerung und Heilung',
        'Panzerung ' + h.ENEMIES.titan.armor + ', heilt sich ' + h.ENEMIES.titan.regen);
  steht('Moloch: Restschaden', 'nur ' + Math.round(h.GUARD_REDUCTION * 100) + ' % des Schadens');
  steht('Nexus: Zapfen', 'aus ' + h.ENEMIES.nexus.drainRange + ' Zellen Entfernung ' +
        h.ENEMIES.nexus.drain + ' Energie pro Sekunde');
  steht('Nexus: Brut', 'alle ' + komma(h.ENEMIES.nexus.spawnEvery) + ' Sekunden');
  steht('Zapfer', 'aus ' + h.ENEMIES.drainer.drainRange + ' Zellen Entfernung ' +
        h.ENEMIES.drainer.drain + ' Energie pro Sekunde');
  steht('Wächter: Schild', 'Schild von ' + h.ENEMIES.warden.shieldAura + ' über alles in ' +
        komma(h.ENEMIES.warden.auraRange) + ' Zellen');
  steht('Brute: Panzerung', 'Panzerung ' + h.ENEMIES.brute.armor);

  // --- Anfang, Karten, Feld ---
  steht('Einstieg', h.START_MATTER + ' Startmaterie, ' + h.FIRST_BUILD_TIME +
        ' Sekunden erste Bauphase (danach ' + h.BUILD_TIME + ')', eng);
  steht('Kartenstapel', 'vier von ' + h.CARDS.length + ' Karten');
  steht('Kartenwahl: Tasten', '`1`–`' + h.DRAFT_SIZE + '` bei der Kartenwahl');
  steht('Feldgröße', h.GRID.cols + ' × ' + h.GRID.rows + ' Zellen');
  steht('Spiegelachse', "x' = " + (h.GRID.cols - 1) + ' − x');
  steht('Gelände: freier Ring', '(' + komma(h.GELAENDE.frei) + ' Zellen)');
  steht('Gelände: Reichweite', 'jenseits von ' + h.GELAENDE.weit + ' Zellen');
  steht('Gelände: Leiterbahn', '**' + Math.round((h.GELAENDE.leiter - 1) * 100) + ' % mehr** Last (' +
        komma(h.FLOW.pylon * h.GELAENDE.leiter) + ' statt ' + h.FLOW.pylon + '/s');
  steht('Gelände: Schneise', '**' + Math.round((h.GELAENDE.tempo - 1) * 100) + ' % schneller**');
  const truemmer = h.GELAENDE.proSektor * h.GELAENDE.nest[1];
  eines('Trümmer je Sektor', ['höchstens ' + truemmer + ' Trümmerzellen',
                              'höchstens ' + WORT[truemmer] + ' Trümmerzellen'], eng);

  // --- Prioritäten ---
  steht('Lastpriorität: Schwellen', 'Normal ab ' + Math.round(h.PRIORITY[1].threshold * 100) +
        ' %, Sparlast ab ' + Math.round(h.PRIORITY[2].threshold * 100) + ' %');
  for (const z of h.TARGETS) steht('Zielpriorität ' + z.id, '**' + z.name + '**');
  eines('Druck: Deckel oben', ['**' + komma(h.DRUCK.max) + '**',
                               '**' + komma(h.DRUCK.max.toFixed(1)) + '**']);
  eines('Druck: Deckel unten', ['**' + komma(h.DRUCK.min) + '**',
                                '**' + komma(h.DRUCK.min.toFixed(1)) + '**']);
  steht('Bestenliste: Länge', 'acht besten Läufe');
});

/* ------------------------ Ausgabe ------------------------ */
console.log('');
if (fehler.length) {
  console.log(fehler.length + ' Prüfung' + (fehler.length === 1 ? '' : 'en') + ' fehlgeschlagen:\n');
  for (const f of fehler) console.log('  ✗ ' + f);
  console.log('\n' + gut + ' in Ordnung.');
  process.exit(1);
}
console.log('  ✓ ' + gut + ' Prüfungen in Ordnung.\n');
