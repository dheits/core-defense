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

function frisch() {
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

// Baut ein Spiel mit Materie im Überfluss und liefert einen Baukürzel
function neu() {
  const h = frisch();
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

  gleich('Reaktor: Ertrag', h.BUILDINGS.reactor.regen, 6);
  gleich('Akku: Speicher', h.BUILDINGS.akku.capacity, 52);
  gleich('Kernmodi', h.CORE_MODES.length, 3);
  gleich('Anlauf beim Umschalten', h.CORE_SWITCH.time, 3.5);

  gleich('Dauerlast Blaster', last('blaster'), 4.2857, 1e-4);
  gleich('Dauerlast Kanone', last('cannon'), 6.087, 1e-3);
  gleich('Dauerlast Frostturm', last('frost'), 2.7778, 1e-4);

  gleich('Ausbaukosten Blaster Stufe 2 bis 5',
         [1, 2, 3, 4].map(l => h.upgradeSteps(30, l)).join(','), '39,56,72,89');
  gleich('Reparaturanteil', h.REPAIR_SHARE, 0.35);
  gleich('Erstattung beim Abbau', h.SELL_REFUND, 0.6);

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

  gleich('Karten im Pool', h.CARDS.length, 57);
  gleich('Gegnertypen', Object.keys(h.ENEMIES).length, 13);
  gleich('Sturmwellen', h.MODIFIERS.length, 7);
  gleich('Bosse', h.BOSSES.length, 3);
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
