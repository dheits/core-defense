'use strict';

/* ---------------------------------------------------------------
   Spielfeld: quadratisches Raster, der Kern sitzt exakt im Zentrum.
   Alle Reichweiten/Radien sind in ZELLEN angegeben (nicht Pixel).
---------------------------------------------------------------- */
const GRID = { cols: 41, rows: 25, cell: 32 };
const W = GRID.cols * GRID.cell;
const H = GRID.rows * GRID.cell;

const CORE = {
  cx: (GRID.cols - 1) / 2,      // 20
  cy: (GRID.rows - 1) / 2,      // 12
  half: 1,                      // 3x3 Zellen
  hp: 600,
  energy: 130,                  // Puffer-Kapazität
  regen: 9,                     // Energie pro Sekunde
  supply: 5.4                   // Versorgungsradius
};
const CORE_PX = { x: (CORE.cx + 0.5) * GRID.cell, y: (CORE.cy + 0.5) * GRID.cell };

const START_MATTER = 170;
const BUILD_TIME = 22;          // Sekunden Bauphase zwischen den Wellen
const FIRST_BUILD_TIME = 34;    // mehr Ruhe vor der allerersten Welle
const SELL_REFUND = 0.6;

/* ---------------------------------------------------------------
   Gebäude. "supply" = eigener Versorgungsradius (nur Kern/Pylon),
   "needsPower" = muss im Netz hängen um zu arbeiten.
---------------------------------------------------------------- */
const BUILDINGS = {
  pylon: {
    name: 'Pylon', key: '1', cost: 20, hp: 70, color: '#5fe0ff',
    supply: 4.2, needsPower: true,
    desc: 'Trägt das Energienetz weiter nach außen.'
  },
  reactor: {
    name: 'Reaktor', key: '2', cost: 55, hp: 90, color: '#ffd166',
    regen: 5, capacity: 45, needsPower: true,
    desc: '+5 Energie/s, +45 Speicher.'
  },
  blaster: {
    name: 'Blaster', key: '3', cost: 30, hp: 80, color: '#8affc1',
    needsPower: true, turret: true,
    range: 3.7, cooldown: 0.28, damage: 7, energy: 1.2, projSpeed: 620,
    desc: 'Schnelles Dauerfeuer, günstig.'
  },
  cannon: {
    name: 'Kanone', key: '4', cost: 65, hp: 110, color: '#ff9f5a',
    needsPower: true, turret: true,
    range: 5.2, cooldown: 1.15, damage: 34, splash: 1.3, energy: 7, projSpeed: 340,
    desc: 'Langsam, hoher Flächenschaden.'
  },
  frost: {
    name: 'Frostturm', key: '5', cost: 45, hp: 80, color: '#7fb4ff',
    needsPower: true, turret: true, hitscan: true,
    range: 3.3, cooldown: 0.9, damage: 4, energy: 2.5, slow: 0.5, slowTime: 1.8,
    desc: 'Bremst Gegner um 50 %.'
  },
  wall: {
    name: 'Barriere', key: '6', cost: 10, hp: 260, color: '#8892a6',
    needsPower: false,
    desc: 'Lenkt Bodentruppen um, braucht keinen Strom.'
  }
};

/* ---------------------------------------------------------------
   Ausbau bis Stufe 5. Die Kosten steigen je Stufe deutlich, dafür
   schaltet die letzte Stufe eine Fähigkeit frei, die den Turm
   qualitativ verändert — nicht nur seine Zahlen.
---------------------------------------------------------------- */
const UPGRADE = { maxLevel: 5, damage: 1.42, range: 1.07, hp: 1.28 };

// Kosten für den Sprung von b.level auf die nächste Stufe
function upgradeSteps(cost, level) { return Math.round(cost * (0.75 + 0.55 * level)); }

// Anteil des Bauwerts, den eine vollständige Instandsetzung kostet
const REPAIR_SHARE = 0.35;

/* Stufe 5: je Bauart eine eigene Fähigkeit */
const SPECIALS = {
  blaster: { name: 'Zwillingssalve',   desc: 'Feuert gleichzeitig auf ein zweites Ziel' },
  cannon:  { name: 'Brandsatz',        desc: 'Der Einschlag setzt Getroffene in Brand',
             burnDps: 0.22, burnTime: 3 },
  frost:   { name: 'Vereisung',        desc: 'Friert gebremste Gegner kurz völlig ein',
             freezeTime: 0.85, freezeCd: 3 },
  pylon:   { name: 'Verstärkerfeld',   desc: 'Türme im Netzradius schlagen 15 % härter',
             boost: 1.15 },
  reactor: { name: 'Materiekonverter', desc: 'Erzeugt zusätzlich 0,6 Materie je Sekunde',
             matter: 0.6 },
  wall:    { name: 'Reaktivpanzerung', desc: 'Reißt beim Bersten die Angreifer mit',
             blast: 70, blastRange: 1.8 }
};

/* ---------------------------------------------------------------
   Gegner. speed = Pixel/s, dmg = Schaden pro Angriff (1 Angriff/s).

   Konter-Eigenschaften — jede zwingt zu einem anderen Turm:
     armor      zieht von JEDEM Treffer ab. Schnellfeuer wird wertlos,
                Einzelschaden (Kanone) bleibt wirksam.
     shield     schluckt Schaden vorweg und lädt nach Ruhe wieder auf.
                Geschosse richten daran nur die Hälfte aus, der Strahl
                des Frostturms das Anderthalbfache.
     slowResist verkürzt Verlangsamung.
     heal       heilt andere Gegner in Reichweite (in Zellen: healRange).
     regen      heilt sich selbst, HP pro Sekunde.
---------------------------------------------------------------- */
const ENEMIES = {
  crawler: { name: 'Crawler', hp: 28,  speed: 52, dmg: 8,  radius: 9,  bounty: 6,   color: '#ff6b8a', budget: 1 },
  runner:  { name: 'Runner',  hp: 20,  speed: 104, dmg: 6, radius: 8,  bounty: 8,   color: '#ffa14a', budget: 1.4,
             slowResist: 0.55 },
  brute:   { name: 'Brute',   hp: 150, speed: 32, dmg: 26, radius: 15, bounty: 22,  color: '#c86bff', budget: 4.5,
             armor: 6 },
  drone:   { name: 'Drohne',  hp: 44,  speed: 74, dmg: 10, radius: 10, bounty: 16,  color: '#6bd5ff', budget: 3.8,
             flying: true, shield: 34 },
  mender:  { name: 'Mender',  hp: 95,  speed: 44, dmg: 6,  radius: 11, bounty: 26,  color: '#7dffb0', budget: 3.5,
             heal: 7, healRange: 2.6 },

  // Saboteur: läuft nicht zum Kern, sondern reißt dir das Netz auseinander
  sabot:   { name: 'Saboteur', hp: 78, speed: 92, dmg: 16, radius: 10, bounty: 20, color: '#ffe66b', budget: 3.6,
             huntsNet: true, slowResist: 0.3 },
  // Splitter: aus einem werden drei
  splitter:{ name: 'Splitter', hp: 135, speed: 40, dmg: 12, radius: 14, bounty: 24, color: '#b06bff', budget: 5.6,
             splitInto: 'larve', splitCount: 3 },
  larve:   { name: 'Larve',   hp: 24,  speed: 82, dmg: 5,  radius: 6,  bounty: 3,  color: '#d7a8ff', budget: 0 },
  // Zapfer: zieht Energie aus dem Puffer, sobald er nah genug ist
  drainer: { name: 'Zapfer',  hp: 96,  speed: 46, dmg: 8,  radius: 11, bounty: 24, color: '#5fffe0', budget: 4.1,
             drain: 7, drainRange: 9 },
  // Wächter: legt einen Schild über alles in seiner Nähe
  warden:  { name: 'Wächter', hp: 145, speed: 36, dmg: 10, radius: 13, bounty: 30, color: '#8fa6ff', budget: 5.4,
             shieldAura: 42, auraRange: 3.2, armor: 3 },

  /* ---- Bosse ---- */
  titan:   { name: 'Titan',   hp: 1100, speed: 24, dmg: 70, radius: 23, bounty: 140, color: '#ff4d4d', budget: 30,
             boss: true, armor: 10, regen: 9 },
  moloch:  { name: 'Moloch',  hp: 900, speed: 21, dmg: 95, radius: 28, bounty: 260, color: '#ff7a3d', budget: 34,
             boss: true, armor: 14 },
  nexus:   { name: 'Nexus',   hp: 820, speed: 27, dmg: 62, radius: 26, bounty: 240, color: '#c46bff', budget: 32,
             boss: true, armor: 6, drain: 11, drainRange: 14, spawnEvery: 3.2, spawnType: 'larve', spawnCount: 2 }
};

/* ---------------------------------------------------------------
   Boss-Ereignis: alle zehn Wellen, im Wechsel und jeweils mit
   eigener Regel. Die Eskorte kommt zusammen mit dem Boss herein.
---------------------------------------------------------------- */
const BOSSES = [
  { type: 'titan',  hint: 'Schwer gepanzert und heilt sich selbst' },
  { type: 'moloch', hint: 'Unverwundbar, solange seine Wächter stehen',
    escort: { type: 'warden', count: 3, guard: true } },
  { type: 'nexus',  hint: 'Zapft deinen Puffer an und wirft ständig Brut aus',
    escort: { type: 'drainer', count: 2 } }
];
const BOSS_EVERY = 10;
const BOSS_RAGE = 0.5;          // ab dieser Restgesundheit wird er schneller
const GUARD_REDUCTION = 0.12;   // so viel Schaden kommt beim bewachten Boss an

function bossFor(wave) {
  if (wave % BOSS_EVERY !== 0) return null;
  return BOSSES[(wave / BOSS_EVERY - 1) % BOSSES.length];
}

// Kurzform der Eigenschaften für Wellenvorschau und Zeichnung
function traitWords(d) {
  const t = [];
  if (d.armor) t.push('Panzer ' + d.armor);
  if (d.shield) t.push('Schild');
  if (d.flying) t.push('fliegt');
  if (d.slowResist) t.push('kaum bremsbar');
  if (d.heal) t.push('heilt');
  if (d.regen) t.push('regeneriert');
  if (d.huntsNet) t.push('jagt Pylone');
  if (d.splitInto) t.push('teilt sich');
  if (d.drain) t.push('zapft Energie');
  if (d.shieldAura) t.push('schildet ab');
  if (d.spawnEvery) t.push('wirft Brut aus');
  return t;
}

// Ab welcher Welle taucht ein Typ auf
// Höchstzahl je Welle für Sondertypen — sonst besteht eine Welle nur aus
// Unterstützern und spielt sich zäh. Die Boss-Eskorte zählt separat.
const TYPE_CAP = { mender: 3, warden: 2, drainer: 3, sabot: 4, splitter: 5 };

// Larven entstehen nur durch Teilung, stehen also nicht im Wellenpool
const UNLOCK = {
  crawler: 1, runner: 2, brute: 4, drone: 6, mender: 8, sabot: 9,
  splitter: 11, drainer: 13, warden: 15
};

/* ---------------------------------------------------------------
   Lastabwurf: Jeder Turm bekommt eine Stufe. Türme feuern in dieser
   Reihenfolge, und die unteren Stufen rühren den Puffer erst an,
   wenn er über ihrer Schwelle steht — so bleibt Energie für das,
   was wirklich halten muss.
---------------------------------------------------------------- */
const PRIORITY = [
  { name: 'Vorrang',    short: 'V', threshold: 0.00, color: '#ff9f5a' },
  { name: 'Normal',     short: 'N', threshold: 0.20, color: '#cfe2f5' },
  { name: 'Sparlast',   short: 'S', threshold: 0.55, color: '#7b8ea6' }
];

// Überladung: doppelter Schaden, dreifacher Energiehunger
const OVERLOAD = { damage: 2, cost: 3 };

// Gegner-HP wächst mit der Wellennummer
// Bis Welle 20 die eingespielte Kurve; danach ein zweiter Term, weil ab dort
// voll ausgebaute Türme mit Sonderfähigkeiten stehen.
function waveHpScale(w) {
  const spaet = w > 20 ? 0.02 * (w - 20) * (w - 20) : 0;
  return 1 + 0.16 * (w - 1) + 0.016 * (w - 1) * (w - 1) + spaet;
}

// Wellenstärke: flacher Einstieg, ab etwa Welle 8 identisch zur alten Kurve
function waveBudget(w) {
  const spaet = w > 22 ? 0.35 * (w - 22) * (w - 22) : 0;
  return 2.4 + w * 2.6 + w * w * 0.46 + spaet;
}

// Abstand zwischen zwei Gegnern beim Spawn — die ersten Wellen tröpfeln herein
function spawnGap(w) {
  const early = w < 4 ? 1.6 : 1;
  return rand(0.3, 0.8) * early / (1 + w * 0.02);
}

/* ---------------------------------------------------------------
   Karten zwischen den Wellen. Nach jeder abgewehrten Welle sind vier
   davon zur Wahl — jede Partie läuft dadurch anders.

   apply(b, g): b sind die laufenden Multiplikatoren, g der Spielzustand
   für alles, was sofort passieren soll.
   weight: Ziehwahrscheinlichkeit (1 = normal, darunter selten).
   max:    wie oft eine Karte insgesamt genommen werden kann.
---------------------------------------------------------------- */
const DRAFT_SIZE = 4;
const CARD_MAX = 4;                    // Standardgrenze je Karte

const BASE_BUFFS = {
  // Grundwerte für alle Türme
  damage: 1, range: 1, rate: 1, energy: 1, splash: 1,
  slowBonus: 0, slowTime: 0,
  // Energie und Netz
  regen: 0, capacity: 0, netRadius: 0, regenMul: 1,
  waveStartFull: false, freeOverloadAt: 0, unpoweredRate: 0,
  // Bauwesen
  bounty: 1, buildCost: 1, structure: 1, repair: 0, refund: SELL_REFUND,
  coreRepair: 0, matterPerWave: 0,
  // Wirkung gegen Eigenschaften
  pierce: 0, shieldPierce: false, vsAir: 1,
  chain: 0, deathSpark: 0, hitSlow: 0,
  wallThorns: 0, coreShock: 0,
  overloadCost: OVERLOAD.cost,
  // Türme einzeln: Schaden, Rate, Reichweite, Verbrauch
  type: {
    blaster: { dmg: 1, rate: 1, range: 1, energy: 1 },
    cannon:  { dmg: 1, rate: 1, range: 1, energy: 1 },
    frost:   { dmg: 1, rate: 1, range: 1, energy: 1 }
  }
};

// Tiefe Kopie — sonst teilen sich alle Partien dasselbe type-Objekt
function freshBuffs() { return JSON.parse(JSON.stringify(BASE_BUFFS)); }

const CARDS = [
  /* --- Grundwerte, überall wirksam --- */
  { id:'optik',        name:'Fokussierte Optik',  desc:'+14 % Reichweite für alle Türme',
    apply:b => b.range *= 1.14 },
  { id:'ladung',       name:'Verdichtete Ladung', desc:'+18 % Schaden',
    apply:b => b.damage *= 1.18 },
  { id:'zyklus',       name:'Kürzere Zyklen',     desc:'+16 % Feuerrate',
    apply:b => b.rate *= 1.16 },
  { id:'supraleiter',  name:'Supraleiter',        desc:'Jeder Schuss kostet 18 % weniger Energie',
    apply:b => b.energy *= 0.82 },
  { id:'puffer',       name:'Größerer Puffer',    desc:'+55 Energiespeicher',
    apply:b => b.capacity += 55 },
  { id:'reaktorkern',  name:'Heißer Reaktorkern', desc:'+5 Energie pro Sekunde',
    apply:b => b.regen += 5 },
  { id:'kuehlung',     name:'Kernkühlung',        desc:'+25 % Energie-Regeneration',
    apply:b => b.regenMul *= 1.25 },
  { id:'netzausbau',   name:'Netzausbau',         desc:'Kern und Pylone reichen 0,7 Zellen weiter',
    apply:b => b.netRadius += 0.7 },
  { id:'bergung',      name:'Bergungstrupp',      desc:'+30 % Materie aus Abschüssen',
    apply:b => b.bounty *= 1.3 },
  { id:'werkbank',     name:'Werkbank',           desc:'Alle Bauteile kosten 12 % weniger',
    apply:b => b.buildCost *= 0.88 },
  { id:'panzerplatten',name:'Panzerplatten',      desc:'+30 % Struktur für alle Bauten',
    apply:b => b.structure *= 1.3 },
  { id:'nanoreparatur',name:'Nanoreparatur',      desc:'Bauten heilen 2 Struktur pro Sekunde',
    apply:b => b.repair += 2 },
  { id:'lieferung',    name:'Nachschublieferung', desc:'+25 Materie nach jeder Welle',
    apply:b => b.matterPerWave += 25 },
  { id:'kernwerft',    name:'Kernwerft',          desc:'Der Kern repariert nach jeder Welle 70 Struktur',
    apply:b => b.coreRepair += 70 },

  /* --- Blaster --- */
  { id:'schnellwechsel',name:'Schnellwechsel',    desc:'Blaster: +45 % Feuerrate',
    apply:b => b.type.blaster.rate *= 1.45 },
  { id:'harteKerne',   name:'Gehärtete Kerne',    desc:'Blaster: +45 % Schaden',
    apply:b => b.type.blaster.dmg *= 1.45 },
  { id:'doppelrohr',   name:'Doppelrohr',         desc:'Blaster: 40 % weniger Energie je Schuss',
    apply:b => b.type.blaster.energy *= 0.6 },

  /* --- Kanone --- */
  { id:'streuladung',  name:'Streuladung',        desc:'Kanonen: +45 % Wirkungsradius',
    apply:b => b.splash *= 1.45 },
  { id:'schwereRohre', name:'Schwere Rohre',      desc:'Kanonen: +50 % Schaden',
    apply:b => b.type.cannon.dmg *= 1.5 },
  { id:'autolader',    name:'Autolader',          desc:'Kanonen: +40 % Feuerrate',
    apply:b => b.type.cannon.rate *= 1.4 },
  { id:'langrohr',     name:'Langrohr',           desc:'Kanonen: +30 % Reichweite',
    apply:b => b.type.cannon.range *= 1.3 },

  /* --- Frost --- */
  { id:'frostbrand',   name:'Frostbrand',         desc:'Frost bremst stärker und länger',
    apply:b => { b.slowBonus += 0.12; b.slowTime += 0.6; } },
  { id:'kaeltestrahl', name:'Kältestrahl',        desc:'Frost: +120 % Schaden',
    apply:b => b.type.frost.dmg *= 2.2 },
  { id:'weitwurf',     name:'Weitwurf',           desc:'Frost: +40 % Reichweite',
    apply:b => b.type.frost.range *= 1.4 },

  /* --- Antworten auf Gegner-Eigenschaften --- */
  { id:'durchschlag',  name:'Durchschlagmunition',desc:'Jeder Treffer ignoriert 5 Panzerung',
    apply:b => b.pierce += 5 },
  { id:'flak',         name:'Flakmunition',       desc:'+60 % Schaden gegen fliegende Ziele',
    apply:b => b.vsAir *= 1.6 },
  { id:'unterkuehlung',name:'Unterkühlung',       desc:'Jeder Treffer bremst kurz um 10 %',
    apply:b => b.hitSlow += 0.1 },
  { id:'sprengbolzen', name:'Sprengbolzen',       desc:'Getötete Gegner reißen Umstehende mit',
    apply:b => b.deathSpark += 18 },
  { id:'kettenblitz',  name:'Kettenblitz',        desc:'Geschosse springen auf ein zweites Ziel über',
    apply:b => b.chain += 0.5 },

  /* --- Regeln statt Zahlen --- */
  { id:'dornen',       name:'Dornenbarrieren',    desc:'Barrieren verletzen ihre Angreifer',
    apply:b => b.wallThorns += 14 },
  { id:'kernstoss',    name:'Kernstoß',           desc:'Der Kern verletzt und stößt zurück, was ihn angreift',
    apply:b => b.coreShock += 20 },
  { id:'inselbetrieb', name:'Inselbetrieb', weight:0.6, max:1,
    desc:'Türme ohne Netzanschluss feuern mit halber Rate statt gar nicht',
    apply:b => b.unpoweredRate = 0.5 },
  { id:'kaltstart',    name:'Kaltstart', weight:0.7, max:1,
    desc:'Zu Beginn jeder Welle ist der Puffer voll',
    apply:b => b.waveStartFull = true },
  { id:'ausschlachten',name:'Ausschlachten', max:1,
    desc:'Abbau erstattet den vollen Preis',
    apply:b => b.refund = 1 },

  /* --- Zielkonflikte: stark, aber mit Preis --- */
  { id:'zuendschnur',  name:'Zündschnur',         desc:'+38 % Schaden, aber 18 % weniger Struktur',
    apply:b => { b.damage *= 1.38; b.structure *= 0.82; } },
  { id:'hochlast',     name:'Hochlast',           desc:'+32 % Feuerrate, aber +25 % Energieverbrauch',
    apply:b => { b.rate *= 1.32; b.energy *= 1.25; } },
  { id:'schlank',      name:'Schlanke Bauweise',  desc:'28 % billiger bauen, 14 % weniger Struktur',
    apply:b => { b.buildCost *= 0.72; b.structure *= 0.86; } },
  { id:'fernzuendung', name:'Fernzündung',        desc:'+32 % Reichweite, aber 8 % weniger Schaden',
    apply:b => { b.range *= 1.32; b.damage *= 0.92; } },
  { id:'notstrom',     name:'Notstromkreis',      desc:'+8 Energie pro Sekunde, aber 30 Speicher weniger',
    apply:b => { b.regen += 8; b.capacity -= 30; } },
  { id:'anzapfung',    name:'Kernanzapfung',      desc:'+55 % Materie, aber Kern −70 Struktur',
    apply:(b,g) => { b.bounty *= 1.55; g.coreHpMax -= 70; g.coreHp = Math.min(g.coreHp, g.coreHpMax); } },
  { id:'brennstab',    name:'Brennstab',          desc:'+20 % Schaden, aber Bauten kosten 10 % mehr',
    apply:b => { b.damage *= 1.2; b.buildCost *= 1.1; } },

  /* --- Selten und einmalig --- */
  { id:'notreserve',   name:'Notreserve', max:1, weight:0.8,
    desc:'Kern +150 Struktur, sofort instandgesetzt',
    apply:(b,g) => { g.coreHpMax += 150; g.coreHp = g.coreHpMax; } },
  { id:'schildbrecher',name:'Schildbrecher', max:1, weight:0.7,
    desc:'Geschosse wirken voll gegen Schilde',
    apply:b => b.shieldPierce = true },
  { id:'ventil',       name:'Überlastventil', max:1, weight:0.7,
    desc:'Überladung kostet nur noch das Doppelte',
    apply:b => b.overloadCost = 2 },
  { id:'zweiterRing',  name:'Zweiter Kernring', max:1, weight:0.5,
    desc:'Kern und Pylone reichen 1,6 Zellen weiter',
    apply:b => b.netRadius += 1.6 },
  { id:'fusionszelle', name:'Fusionszelle', max:1, weight:0.5,
    desc:'+10 Energie pro Sekunde und +90 Speicher',
    apply:b => { b.regen += 10; b.capacity += 90; } },
  { id:'werkstatt',    name:'Werkstatt', max:1, weight:0.4,
    desc:'Jeder bestehende Bau steigt sofort eine Stufe auf',
    apply:(b,g) => {
      for (const x of g.buildings.values()) {
        if (x.level >= UPGRADE.maxLevel) continue;
        x.level++;
        x.maxHp = g.structureOf(x); x.hp = x.maxHp;
      }
    } },
  { id:'automatik',    name:'Automatikschaltung', max:1, weight:0.35,
    desc:'Über 85 % Puffer feuern alle Türme überladen, ohne Aufpreis',
    apply:b => b.freeOverloadAt = 0.85 }
];
