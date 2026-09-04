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

const UPGRADE = { maxLevel: 3, costFactor: 0.85, damage: 1.35, range: 1.08, hp: 1.3 };

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
  titan:   { name: 'Titan',   hp: 1100, speed: 24, dmg: 70, radius: 23, bounty: 140, color: '#ff4d4d', budget: 30,
             boss: true, armor: 10, regen: 9 }
};

// Kurzform der Eigenschaften für Wellenvorschau und Zeichnung
function traitWords(d) {
  const t = [];
  if (d.armor) t.push('Panzer ' + d.armor);
  if (d.shield) t.push('Schild');
  if (d.flying) t.push('fliegt');
  if (d.slowResist) t.push('kaum bremsbar');
  if (d.heal) t.push('heilt');
  if (d.regen) t.push('regeneriert');
  return t;
}

// Ab welcher Welle taucht ein Typ auf
const UNLOCK = { crawler: 1, runner: 2, brute: 4, drone: 6, mender: 8, titan: 10 };

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
function waveHpScale(w) { return 1 + 0.16 * (w - 1) + 0.021 * (w - 1) * (w - 1); }

// Wellenstärke: flacher Einstieg, ab etwa Welle 8 identisch zur alten Kurve
function waveBudget(w)  { return 2.4 + w * 2.6 + w * w * 0.56; }

// Abstand zwischen zwei Gegnern beim Spawn — die ersten Wellen tröpfeln herein
function spawnGap(w) {
  const early = w < 4 ? 1.6 : 1;
  return rand(0.3, 0.8) * early / (1 + w * 0.02);
}

/* ---------------------------------------------------------------
   Karten zwischen den Wellen. Nach jeder abgewehrten Welle sind drei
   davon zur Wahl — jede Partie läuft dadurch anders.

   apply(b, g): b sind die laufenden Multiplikatoren, g der Spielzustand
   für alles, was sofort passieren soll. `once` heißt: nur einmal ziehbar.
---------------------------------------------------------------- */
const BASE_BUFFS = {
  damage: 1, range: 1, rate: 1, energy: 1, splash: 1,
  slowBonus: 0, slowTime: 0,
  regen: 0, capacity: 0, netRadius: 0,
  bounty: 1, buildCost: 1, structure: 1, repair: 0,
  pierce: 0,                  // durchschlägt so viel Panzerung
  shieldPierce: false,        // Geschosse voll wirksam gegen Schilde
  overloadCost: OVERLOAD.cost
};

const CARDS = [
  { id:'optik',        name:'Fokussierte Optik',  desc:'+12 % Reichweite für alle Türme',
    apply:b => b.range *= 1.12 },
  { id:'ladung',       name:'Verdichtete Ladung', desc:'+15 % Schaden',
    apply:b => b.damage *= 1.15 },
  { id:'zyklus',       name:'Kürzere Zyklen',     desc:'+14 % Feuerrate',
    apply:b => b.rate *= 1.14 },
  { id:'supraleiter',  name:'Supraleiter',        desc:'Jeder Schuss kostet 15 % weniger Energie',
    apply:b => b.energy *= 0.85 },
  { id:'puffer',       name:'Größerer Puffer',    desc:'+45 Energiespeicher',
    apply:b => b.capacity += 45 },
  { id:'reaktorkern',  name:'Heißer Reaktorkern', desc:'+4 Energie pro Sekunde',
    apply:b => b.regen += 4 },
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
  { id:'streuladung',  name:'Streuladung',        desc:'+35 % Wirkungsradius der Kanonen',
    apply:b => b.splash *= 1.35 },
  { id:'frostbrand',   name:'Frostbrand',         desc:'Frost bremst stärker und länger',
    apply:b => { b.slowBonus += 0.12; b.slowTime += 0.6; } },
  { id:'durchschlag',  name:'Durchschlagmunition',desc:'Jeder Treffer ignoriert 4 Panzerung',
    apply:b => b.pierce += 4 },
  { id:'kuehlung',     name:'Kernkühlung',        desc:'+25 % Energie-Regeneration',
    apply:(b,g) => b.regenMul = (b.regenMul || 1) * 1.25 },

  { id:'notreserve',   name:'Notreserve', once:true, desc:'Kern +150 Struktur, sofort instandgesetzt',
    apply:(b,g) => { g.coreHpMax += 150; g.coreHp = g.coreHpMax; } },
  { id:'schildbrecher',name:'Schildbrecher', once:true, desc:'Geschosse wirken voll gegen Schilde',
    apply:b => b.shieldPierce = true },
  { id:'ventil',       name:'Überlastventil', once:true, desc:'Überladung kostet nur noch das Doppelte',
    apply:b => b.overloadCost = 2 }
];
