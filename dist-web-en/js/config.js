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
/* Verschieben statt Abreißen: Ein fertiger Bau darf auf ein freies Feld
   umziehen und behält dabei Stufe, Struktur und alle Einstellungen.
   Der Anteil ist bewusst kleiner als der Umweg über Abbau und Neubau —
   der kostet netto 1 − SELL_REFUND, also 40 % des Bauwerts. Bei „halben
   Kosten" wäre Verschieben teurer als der Umweg und damit sinnlos. */
const MOVE_SHARE = 0.25;

/* ---------------------------------------------------------------
   Gebäude. "supply" = eigener Versorgungsradius (nur Kern/Pylon),
   "needsPower" = muss im Netz hängen um zu arbeiten.

   Nachschub und Speicher sind getrennt: Der Reaktor liefert Energie pro
   Sekunde und entlastet dabei den Ast, an dem er steht. Der Akku liefert
   nichts, er fasst nur — dafür trägt seine Leitung mehr. Damit wird
   "viele kurze Feuerstöße" gegen "langes Dauerfeuer" zu einer echten
   Bauentscheidung statt zu einer Nebenwirkung.
---------------------------------------------------------------- */
const BUILDINGS = {
  pylon: {
    name: 'Pylon', key: '1', cost: 20, hp: 70, color: '#5fe0ff',
    supply: 4.2, needsPower: true,
    desc: 'Carries the power grid further out.'
  },
  reactor: {
    name: 'Reactor', key: '2', cost: 50, hp: 90, color: '#ffd166',
    regen: 6, needsPower: true,
    desc: '+6 energy/s and relieves its own grid branch.'
  },
  akku: {
    name: 'Battery', key: '3', cost: 30, hp: 85, color: '#c9a0ff',
    capacity: 52, needsPower: true,
    desc: '+52 storage, helps carry its node.'
  },
  blaster: {
    name: 'Blaster', key: '4', cost: 30, hp: 80, color: '#8affc1',
    needsPower: true, turret: true,
    range: 3.7, cooldown: 0.28, damage: 7, energy: 1.2, projSpeed: 620,
    desc: 'Fires fast and steadily, and it is cheap.'
  },
  cannon: {
    name: 'Cannon', key: '5', cost: 65, hp: 110, color: '#ff9f5a',
    needsPower: true, turret: true,
    range: 5.2, cooldown: 1.15, damage: 34, splash: 1.3, energy: 7, projSpeed: 340,
    desc: 'Fires slowly, but hits a whole area.'
  },
  frost: {
    name: 'Frost Tower', key: '6', cost: 45, hp: 80, color: '#7fb4ff',
    needsPower: true, turret: true, hitscan: true,
    range: 3.3, cooldown: 0.9, damage: 4, energy: 2.5, slow: 0.5, slowTime: 1.8,
    desc: 'Slows enemies by 50%.'
  },
  wall: {
    name: 'Barrier', key: '7', cost: 10, hp: 260, color: '#8892a6',
    needsPower: false, drag: true,        // lässt sich in einem Zug reihenweise setzen
    desc: 'Diverts ground units and needs no power. Hold the mouse button to build a whole row.'
  },

  /* Die vier folgenden füllen Rollen, die die ersten sieben offenlassen.
     Keine davon ist ein stärkerer Blaster — jede tut etwas, das die
     anderen gar nicht können.

     Lichtbogen: Der Name „Kettenblitz" war schon vergeben (die Karte,
     die Geschosse überspringen lässt). Der Bogen trifft eine Kette von
     Gegnern, jeder Sprung schwächer — gegen Pulks überlegen, gegen
     Panzerung nutzlos, weil die Panzerung von JEDEM der kleinen Treffer
     abgeht. Als Strahl bricht er Schilde besser als ein Geschoss. */
  arc: {
    name: 'Arc Tower', key: '8', cost: 55, hp: 80, color: '#a5b4ff',
    needsPower: true, turret: true, hitscan: true,
    range: 3.6, cooldown: 0.8, damage: 14, energy: 3.6,
    arc: 3, arcRange: 2.1, arcFalloff: 0.72,
    desc: 'The arc jumps to up to three more enemies, each jump weaker.'
  },

  /* Minenleger: der einzige Bau, der Schaden macht, ohne zu zielen.
     Er legt seine Minen dorthin, wo KEIN Turm hinreicht — genau in die
     toten Winkel, die auf einem Feld ohne Pfade zwangsläufig entstehen. */
  mine: {
    name: 'Minelayer', key: '9', cost: 40, hp: 75, color: '#ffb84a',
    needsPower: true, turret: true,
    range: 3.2, cooldown: 3.2, damage: 62, energy: 7, minen: 5, minenSplash: 1.45,
    minenNah: 0.9,
    desc: 'Lays mines in unguarded tiles; they go off under ground units.'
  },

  /* Werkdrohne: setzt instand, während gekämpft wird. Reparieren von
     Hand kostet Materie und geht nur zwischen den Wellen — die Drohne
     kostet Energie und arbeitet mitten im Gefecht. */
  drohne: {
    name: 'Repair Drone', key: '0', cost: 45, hp: 85, color: '#6bff9f',
    needsPower: true, support: true,
    range: 3.4, repair: 14, perHp: 0.3,
    desc: 'Repairs damaged buildings in range, 14 structure per second.'
  },

  /* Schildfeld. Die erste Fassung zog die Energie in dem Augenblick,
     in dem der Treffer fiel — und verlor jede Messung: Energie in
     Feuerkraft verhindert mehr Schaden, als dieselbe Energie als
     Absorption auffängt. Solange beides um denselben Puffer streitet,
     kann ein rein defensiver Bau nicht gewinnen.

     Deshalb lädt es jetzt vor: Es füllt seinen Vorrat nur aus dem
     Überschuss (über 60 % Puffer) — also vor allem in der Bauphase, in
     der die Regeneration sonst am vollen Puffer verpufft. Im Gefecht
     gibt es aus, ohne einen einzigen Schuss zu kosten. */
  schild: {
    name: 'Shield Field', key: 'g', cost: 60, hp: 90, color: '#c9a0ff',
    needsPower: true, support: true,
    range: 3.2, absorb: 0.7, pool: 170, laden: 8, perPoint: 0.9, ab: 0.6,
    desc: 'Charges up from surplus energy and absorbs 70% of every hit on nearby buildings in combat.'
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
  blaster: { name: 'Twin Salvo',   desc: 'Fires at a second target at the same time' },
  cannon:  { name: 'Incendiary',        desc: 'Impacts set targets on fire',
             burnDps: 0.22, burnTime: 3 },
  frost:   { name: 'Deep Freeze',        desc: 'Briefly freezes slowed enemies solid',
             freezeTime: 0.85, freezeCd: 3 },
  pylon:   { name: 'Amplifier Field',   desc: 'Towers in its grid radius hit 15% harder',
             boost: 1.15 },
  reactor: { name: 'Matter Converter', desc: 'Also produces 0.6 matter per second',
             matter: 0.6 },
  akku:    { name: 'Peak Load',      desc: 'When the buffer drops below 15%, the battery feeds in its full storage once per wave',
             at: 0.15 },
  wall:    { name: 'Reactive Armor', desc: 'Takes its attackers with it when it bursts',
             blast: 70, blastRange: 1.8 },
  arc:     { name: 'Chain Reaction',   desc: 'Enemies killed by the arc take their neighbors with them',
             blast: 26, blastRange: 1.4 },
  mine:    { name: 'Proximity Fuse',  desc: 'Mines also go off under flying enemies' },
  drohne:  { name: 'Emergency Weld', desc: 'When a building drops below a quarter of its structure, the drone fully repairs it once per wave',
             at: 0.25 },
  schild:  { name: 'Feedback',     desc: 'Two fifths of the absorbed damage hits the attacker',
             thorns: 0.4 }
};

/* ---------------------------------------------------------------
   Gegner. speed = Pixel/s, dmg = Schaden pro Angriff (1 Angriff/s).

   Konter-Eigenschaften — jede zwingt zu einem anderen Turm:
     armor      zieht von JEDEM Treffer ab. Schnellfeuer wird wertlos,
                Einzelschaden (Kanone) bleibt wirksam.
     shield     schluckt Schaden vorweg und lädt nach Ruhe wieder auf.
                Geschosse richten daran nur 65 % aus, der Strahl
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
  drone:   { name: 'Drone',  hp: 44,  speed: 74, dmg: 10, radius: 10, bounty: 16,  color: '#6bd5ff', budget: 3.8,
             flying: true, shield: 34 },
  mender:  { name: 'Mender',  hp: 95,  speed: 44, dmg: 6,  radius: 11, bounty: 26,  color: '#7dffb0', budget: 3.5,
             heal: 7, healRange: 2.6 },

  // Saboteur: läuft nicht zum Kern, sondern reißt dir das Netz auseinander
  sabot:   { name: 'Saboteur', hp: 78, speed: 92, dmg: 16, radius: 10, bounty: 20, color: '#ffe66b', budget: 3.6,
             huntsNet: true, slowResist: 0.3 },
  // Splitter: aus einem werden drei
  splitter:{ name: 'Splitter', hp: 135, speed: 40, dmg: 12, radius: 14, bounty: 24, color: '#b06bff', budget: 5.6,
             splitInto: 'larve', splitCount: 3 },
  larve:   { name: 'Larva',   hp: 24,  speed: 82, dmg: 5,  radius: 6,  bounty: 3,  color: '#d7a8ff', budget: 0 },
  // Zapfer: zieht Energie aus dem Puffer, sobald er nah genug ist
  drainer: { name: 'Drainer',  hp: 96,  speed: 46, dmg: 8,  radius: 11, bounty: 24, color: '#5fffe0', budget: 4.1,
             drain: 7, drainRange: 9 },
  // Wächter: legt einen Schild über alles in seiner Nähe
  warden:  { name: 'Warden', hp: 145, speed: 36, dmg: 10, radius: 13, bounty: 30, color: '#8fa6ff', budget: 5.4,
             shieldAura: 42, auraRange: 3.2, armor: 3 },

  /* ---- Bosse ---- */
  /* Der Titan eröffnet die Rotation bei Welle 10 und war die Wand, an der
     die meisten Läufe endeten. Gemessen an 80 Läufen: In Welle 10 stammte
     100 % des Kernschadens von ihm selbst, die Begleitwelle richtete nichts
     aus. Die gescheiterten Läufe hatten ihn noch bei 27 % — ihnen fehlte
     Feuerkraft, nicht Deckung —, und bei 70 Schaden je Schlag war der
     angeschlagene Kern nach sechs Sekunden Kontakt weg. Beides ist hier
     gesenkt: weniger Trefferpunkte als Latte, weniger Schaden als
     Zeitfenster zum Reagieren. Die Panzerung bleibt — sie ist die Lehre,
     dass Kanonen dazugehören. */
  titan:   { name: 'Titan',   hp: 880, speed: 24, dmg: 55, radius: 23, bounty: 140, color: '#ff4d4d', budget: 30,
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
  { type: 'titan',  hint: 'Heavily armored and heals itself' },
  { type: 'moloch', hint: 'Invulnerable while its Wardens stand',
    escort: { type: 'warden', count: 3, guard: true } },
  { type: 'nexus',  hint: 'Drains your buffer and keeps spawning brood',
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
  if (d.armor) t.push('armor ' + d.armor);
  if (d.shield) t.push('Shield');
  if (d.flying) t.push('flies');
  if (d.slowResist) t.push('hard to slow');
  if (d.heal) t.push('heals');
  if (d.regen) t.push('regenerates');
  if (d.huntsNet) t.push('hunts pylons');
  if (d.splitInto) t.push('splits');
  if (d.drain) t.push('drains energy');
  if (d.shieldAura) t.push('shields others');
  if (d.spawnEvery) t.push('spawns brood');
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
  { name: 'High',    short: 'H', threshold: 0.00, color: '#ff9f5a' },
  { name: 'Normal',     short: 'N', threshold: 0.20, color: '#cfe2f5' },
  { name: 'Low',   short: 'L', threshold: 0.55, color: '#7b8ea6' }
];

/* ---------------------------------------------------------------
   Zielpriorität je Turm. Voreinstellung ist der Kernnächste: Auf diesem
   Feld läuft alles radial nach innen, wer dem Kern am nächsten ist, ist
   die dringendste Gefahr. Die anderen drei sind Antworten auf bestimmte
   Wellen — Nächster hält den eigenen Abschnitt sauber, Stärkster setzt
   Kanonen auf Brutes und Bosse an, Schnellster fängt Runner ab, bevor
   sie durch sind.

   Das Kürzel steht links oben am Turm, sobald er von der Voreinstellung
   abweicht — die Lastpriorität steht rechts oben und in eigener Farbe.
---------------------------------------------------------------- */
const TARGETS = [
  { id: 'kern',    name: 'Closest to core', short: '',  desc: 'Whoever is closest to the core' },
  { id: 'nah',     name: 'Nearest',     short: 'N', desc: 'Whoever is closest to the tower' },
  { id: 'stark',   name: 'Strongest',    short: 'S', desc: 'Whoever has the most structure left' },
  { id: 'schnell', name: 'Fastest',  short: 'F', desc: 'Whoever is moving fastest right now' }
];

// Überladung: doppelter Schaden, dreifacher Energiehunger
const OVERLOAD = { damage: 2, cost: 3 };

/* ---------------------------------------------------------------
   Leitungslast. Versorgung ist nicht mehr nur „angeschlossen ja/nein":
   Jeder Knoten trägt nur eine begrenzte Menge Energie pro Sekunde
   weiter. Was ein Ast anfordert, fließt durch alle Pylone davor —
   ein überladener Ast drosselt alles hinter sich.

   Der Kern gibt viel ab, ein einzelner Pylon deutlich weniger. Damit
   wird die Form des Netzes zur Entscheidung: ein langer Strang trägt
   wenig, zwei kurze Äste tragen zusammen doppelt so viel. Reaktoren
   speisen dort ein, wo sie stehen, und entlasten ihren eigenen Ast.
---------------------------------------------------------------- */
const FLOW = {
  core: 58,          // Energie/s, die der Kern selbst nach außen abgibt
  pylon: 15,         // Grundlast eines Pylons ...
  perLevel: 6,       // ... plus je Ausbaustufe (Stufe 5 = 39)
  akku: 4,           // ... und je Akku-Stufe am selben Knoten
  warn: 0.85         // ab hier färbt sich die Leitung
};
function flowCap(b) {
  const grund = FLOW.pylon + FLOW.perLevel * (b.level - 1);
  // Auf einer alten Leiterbahn trägt der Pylon mehr — der einzige
  // Geländevorteil, den man beim Bauen bewusst suchen kann.
  return b.leiter ? grund * GELAENDE.leiter : grund;
}
// Ein Akku puffert dort, wo er hängt — die Leitung davor trägt entsprechend mehr
function akkuFlow(b) { return FLOW.akku * b.level; }

/* ---------------------------------------------------------------
   Kernmodi. Der Kern hat eine feste Leistung und verteilt sie — mehr
   Nachschub, mehr Speicher oder ein Schild, das Kernschaden aus dem
   Puffer bezahlt. Es gibt keine neutrale Stellung: Jeder Modus ist ein
   Tausch, und das Umschalten kostet ein paar Sekunden Anlauf, in denen
   gar kein Modus wirkt und der Nachschub einbricht. Wer wechselt, tut
   es also besser in der Bauphase.

   regen/cap sind Faktoren auf die Grundwerte von CORE. Werte unter 1
   sind Nachteile — nur die halbiert die Karte "Zwitterkern".
---------------------------------------------------------------- */
const CORE_MODES = [
  { id: 'einspeisung', name: 'Supply', short: 'SUP', color: '#ffd166',
    regen: 1.25, cap: 0.85, hint: '+25% regen\n−15% storage',
    desc: '+25% regeneration, but 15% less storage' },
  { id: 'speicher',    name: 'Storage',    short: 'STO', color: '#9beeff',
    regen: 0.85, cap: 1.40, hint: '+40% storage\n−15% regen',
    desc: '+40% storage, but 15% less regeneration' },
  { id: 'schild',      name: 'Shield',      short: 'SHD', color: '#8fa6ff',
    regen: 0.90, cap: 0.90, absorb: 0.6, perDamage: 2.2, floor: 0.35,
    hint: '60% of core damage\nfrom the buffer',
    desc: 'The buffer pays for 60% of core damage — 2.2 energy per damage point, but never below 35% charge; costs 10% regen and storage' }
];
/* Die Untergrenze im Schildmodus ist keine Feinabstimmung, sondern der
   Grund, dass der Modus überhaupt taugt: Ohne sie zahlt der Puffer den
   Schaden bis zur Leere, danach feuert kein Turm mehr, der Kern nimmt
   wieder vollen Schaden — und der Schild hat den Zusammenbruch selbst
   ausgelöst, den er verhindern sollte. Gemessen an einem Bot, der vor
   Bosswellen auf Schild schaltete: 15 von 60 Läufen endeten an Welle 10
   statt 1 von 60. Mit der Grenze bleibt der Schild eine Reserve und
   nimmt den Türmen nie den Strom. */
const CORE_SWITCH = {
  time: 3.5,         // Sekunden Anlauf beim Umschalten
  regen: 0.6         // solange läuft der Kern gedrosselt
};

/* ---------------------------------------------------------------
   Kernbefehle: drei Fähigkeiten, die aus dem Puffer bezahlt werden.
   Sie kosten genau das, was sonst die Türme verschießen — deshalb ist
   jeder Einsatz ein Tausch, kein Geschenk. Nur im Gefecht verfügbar.
---------------------------------------------------------------- */
const POWERS = {
  discharge: {
    id: 'discharge', name: 'Discharge', key: 'q', cd: 26, drain: 0.55,
    perEnergy: 2.9, radius: 5.6,
    desc: 'Releases half the buffer as an outward shockwave. Damage grows with the charge.'
  },
  surge: {
    id: 'surge', name: 'Grid Surge', key: 'w', cd: 34, drain: 0.4,
    time: 6, damage: 2, cost: 0.55,
    desc: '6 s of double damage at just under half the energy cost — the buffer is empty afterwards.'
  },
  pulse: {
    id: 'pulse', name: 'Repair Pulse', key: 'e', cd: 40, drain: 0.45, heal: 0.34,
    desc: 'Repairs every building on the grid by a third, free of matter.'
  }
};
const POWER_LIST = [POWERS.discharge, POWERS.surge, POWERS.pulse];

/* ---------------------------------------------------------------
   Wellenmodifikatoren. Ab Welle 5 kann eine Welle eine Eigenschaft
   mitbringen, die in der Vorschau angekündigt wird. Sie greift genau
   dort an, wo ein einseitiger Aufbau blind ist — und zahlt dafür eine
   höhere Prämie.
---------------------------------------------------------------- */
const MODIFIERS = [
  { id: 'nebel',    name: 'Jamming Fog',     desc: 'All towers have 25% less range',            range: 0.75 },
  { id: 'emp',      name: 'EMP Front',     desc: 'The buffer barely recharges',          regen: 0.2 },
  { id: 'magnet',   name: 'Magnetic Storm',   desc: 'Projectiles fly 40% slower',        projSpeed: 0.6 },
  { id: 'schwarm',  name: 'Swarm',       desc: 'Far more enemies, but thin-skinned ones',      budget: 1.7, hp: 0.55 },
  { id: 'kaeltefest',name:'Frostproof',     desc: 'Enemies cannot be slowed',        noSlow: true },
  { id: 'konvoi',   name: 'Armored Convoy',  desc: 'Every enemy has 4 more armor',     armor: 4 },
  { id: 'hetzjagd', name: 'Stampede',      desc: 'Enemies move 30% faster',            speed: 1.3 }
];
const MOD_FROM_WAVE = 5;      // vorher lernt man noch die Grundregeln
let MOD_CHANCE = 0.35;
const MOD_BONUS = 0.5;        // halbe Prämie obendrauf für eine gehaltene Sturmwelle

// Auf Bosswellen kein Modifikator — die sind für sich schon ein Ereignis.
function modifierFor(w) {
  if (w < MOD_FROM_WAVE || bossFor(w)) return null;
  if (wuerfel() > MOD_CHANCE) return null;
  return MODIFIERS[(wuerfel() * MODIFIERS.length) | 0];
}

/* ---------------------------------------------------------------
   Erzeugtes Gelände. Das Feld startet nicht mehr leer: Jede Partie
   bekommt aus einem Seed eine eigene Karte. Der Sinn ist nicht Deko,
   sondern das Brechen der radialen Symmetrie — auf einem leeren Feld
   ist jede Himmelsrichtung gleich, also ist auch jeder Aufbau gleich.

   Drei Sorten, jede mit genau einer Wirkung:
     Trümmer     — hier lässt sich nicht bauen. Netzäste müssen herum.
     Leiterbahn  — ein Pylon darauf trägt die Hälfte mehr Last.
     Schneise    — Bodentruppen laufen hier schneller. Fliegende nicht,
                   die sind ohnehin nicht am Boden.

   Der Ring `frei` um den Kern bleibt immer sauber: Die ersten Bauten
   einer Partie dürfen nicht am Würfel hängen. Und je Himmelsrichtung
   liegen höchstens `proSektor` Trümmerfelder, damit keine Seite
   zugebaut ist, bevor die erste Welle kommt.
---------------------------------------------------------------- */
const BODEN = { leer: 0, truemmer: 1, leiter: 2, schneise: 3 };
const GELAENDE = {
  frei: 4.2,          // Zellen um den Kern, die frei bleiben
  weit: 13,           // so weit nach außen reicht Gelände überhaupt
  rand: 1,            // Abstand zum Feldrand
  nester: [5, 8],     // so viele Trümmerfelder je Partie
  nest: [2, 5],       // Zellen je Feld
  proSektor: 2,       // Trümmerbudget je Himmelsrichtung: so viele Felder mal `nest`-Höchstlänge
  bahnen: [2, 3],     // alte Leiterbahnen, radial nach außen
  bahn: [4, 8],       // Zellen je Bahn
  schneisen: [1, 2],
  schneise: [6, 11],
  leiter: 1.5,        // Leitungslast eines Pylons auf einer Leiterbahn
  tempo: 1.3          // Tempo von Bodentruppen in einer Schneise
};

/* ---------------------------------------------------------------
   Druckgedächtnis. Die Einfallsrichtungen lagen bisher gleichmäßig auf
   dem Kreis und wurden nur zufällig gedreht — deshalb war der
   symmetrische Igel der beste Aufbau, und deshalb sah jede Partie ab
   Welle 10 gleich aus. Jetzt merkt sich das Feld je Sektor, wie weit
   die letzte Welle gekommen ist, und zieht die nächste dorthin.

   Die acht Sektoren sind dieselben wie die Himmelsrichtungen in der
   Vorschau (compass()), sonst wäre die Ankündigung nicht lesbar.

   `min`/`max` sind kein Feinschliff, sondern der Kern der Sache: Ohne
   Deckel schlägt die Rückmeldung nach zwei, drei Wellen immer auf
   dieselbe Seite, und die Partie endet an einer Ecke statt an einer
   Entscheidung. Mit Deckel bleibt jede Richtung möglich — die schwache
   nur wahrscheinlicher.
---------------------------------------------------------------- */
const DRUCK = {
  sektoren: 8,
  tiefe: 12,        // Zellen: erst innerhalb dieses Radius zählt Annäherung
  glaettung: 0.55,  // wie stark die letzte Welle das Gedächtnis überschreibt
  spanne: 1.5,      // wie stark Druckunterschiede die Gewichte spreizen
  min: 0.5,         // kein Sektor verstummt ganz …
  max: 2.0,         // … und keiner bekommt alles
  kernSchaden: 0.01,// Zuschlag je Punkt Kernschaden aus dem Sektor
  verlust: 0.3,     // Zuschlag je verlorenem Bau in dem Sektor
  zeigen: 1.15,     // so weit muss ein Sektor über dem Schnitt liegen …
  vorsprung: 0.25   // … und so weit vor dem zweiten, damit die Bilanz ihn nennt
};

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
  flow: 1, reactorFeed: 1, akkuCap: 1,
  // Kernmodi
  modeSwitch: 1, modePenalty: 1,
  // Kernbefehle und Sturmwellen
  powerCd: 1, powerDrain: 1, modImmune: [],
  waveStartFull: false, freeOverloadAt: 0, unpoweredRate: 0,
  // Bauwesen
  bounty: 1, buildCost: 1, structure: 1, repair: 0, refund: SELL_REFUND,
  coreRepair: 0, matterPerWave: 0,
  // Wirkung gegen Eigenschaften
  pierce: 0, shieldPierce: false, vsAir: 1,
  chain: 0, deathSpark: 0, hitSlow: 0,
  wallThorns: 0, coreShock: 0,
  overloadCost: OVERLOAD.cost,
  // Die vier späten Bauteile
  arcPlus: 0, minenPlus: 0, repairSpeed: 1, absorbPlus: 0,
  // Türme einzeln: Schaden, Rate, Reichweite, Verbrauch
  type: {
    blaster: { dmg: 1, rate: 1, range: 1, energy: 1 },
    cannon:  { dmg: 1, rate: 1, range: 1, energy: 1 },
    frost:   { dmg: 1, rate: 1, range: 1, energy: 1 },
    arc:     { dmg: 1, rate: 1, range: 1, energy: 1 },
    mine:    { dmg: 1, rate: 1, range: 1, energy: 1 }
  }
};

// Tiefe Kopie — sonst teilen sich alle Partien dasselbe type-Objekt
function freshBuffs() { return JSON.parse(JSON.stringify(BASE_BUFFS)); }

const CARDS = [
  /* --- Grundwerte, überall wirksam --- */
  { id:'optik',        name:'Focused Optics',  desc:'+14% range for all towers',
    apply:b => b.range *= 1.14 },
  { id:'ladung',       name:'Dense Charge', desc:'+18% damage',
    apply:b => b.damage *= 1.18 },
  { id:'zyklus',       name:'Shorter Cycles',     desc:'+16% fire rate',
    apply:b => b.rate *= 1.16 },
  { id:'supraleiter',  name:'Superconductor',        desc:'Every shot costs 18% less energy',
    apply:b => b.energy *= 0.82 },
  { id:'puffer',       name:'Bigger Buffer',    desc:'+55 energy storage',
    apply:b => b.capacity += 55 },
  { id:'reaktorkern',  name:'Hot Reactor Core', desc:'+5 energy per second',
    apply:b => b.regen += 5 },
  { id:'kuehlung',     name:'Core Cooling',        desc:'+25% energy regeneration',
    apply:b => b.regenMul *= 1.25 },
  { id:'netzausbau',   name:'Grid Expansion',         desc:'Core and pylons reach 0.7 tiles further',
    apply:b => b.netRadius += 0.7 },
  { id:'bergung',      name:'Salvage Crew',      desc:'+30% matter from kills',
    apply:b => b.bounty *= 1.3 },
  { id:'werkbank',     name:'Workbench',           desc:'All buildings cost 12% less',
    apply:b => b.buildCost *= 0.88 },
  { id:'panzerplatten',name:'Armor Plating',      desc:'+30% structure for all buildings',
    apply:b => b.structure *= 1.3 },
  { id:'nanoreparatur',name:'Nano Repair',      desc:'Buildings heal 2 structure per second',
    apply:b => b.repair += 2 },
  { id:'lieferung',    name:'Supply Drop', desc:'+25 matter after every wave',
    apply:b => b.matterPerWave += 25 },
  { id:'kernwerft',    name:'Core Shipyard',          desc:'The core repairs 70 structure after every wave',
    apply:b => b.coreRepair += 70 },

  /* --- Blaster --- */
  { id:'schnellwechsel',name:'Quick Swap',    desc:'Blaster: +45% fire rate',
    apply:b => b.type.blaster.rate *= 1.45 },
  { id:'harteKerne',   name:'Hardened Cores',    desc:'Blaster: +45% damage',
    apply:b => b.type.blaster.dmg *= 1.45 },
  { id:'doppelrohr',   name:'Double Barrel',         desc:'Blaster: 40% less energy per shot',
    apply:b => b.type.blaster.energy *= 0.6 },

  /* --- Kanone --- */
  // splash sitzt an jeder Explosion — an der Kanone wie an der Mine
  { id:'streuladung',  name:'Scatter Charge',        desc:'Cannons and mines: +45% blast radius',
    apply:b => b.splash *= 1.45 },
  { id:'schwereRohre', name:'Heavy Barrels',      desc:'Cannons: +50% damage',
    apply:b => b.type.cannon.dmg *= 1.5 },
  { id:'autolader',    name:'Autoloader',          desc:'Cannons: +40% fire rate',
    apply:b => b.type.cannon.rate *= 1.4 },
  { id:'langrohr',     name:'Long Barrel',           desc:'Cannons: +30% range',
    apply:b => b.type.cannon.range *= 1.3 },

  /* --- Frost --- */
  { id:'frostbrand',   name:'Frostbite',         desc:'Frost slows harder and longer',
    apply:b => { b.slowBonus += 0.12; b.slowTime += 0.6; } },
  { id:'kaeltestrahl', name:'Cold Beam',        desc:'Frost: +120% damage',
    apply:b => b.type.frost.dmg *= 2.2 },
  { id:'weitwurf',     name:'Long Throw',           desc:'Frost: +40% range',
    apply:b => b.type.frost.range *= 1.4 },

  /* --- Lichtbogen, Minenleger, Werkdrohne, Schildfeld --- */
  { id:'ueberschlag',  name:'Flashover',         desc:'Arc Tower: one more jump',
    apply:b => b.arcPlus += 1 },
  { id:'ionenspur',    name:'Ion Trail',          desc:'Arc Tower: +45% damage',
    apply:b => b.type.arc.dmg *= 1.45 },
  { id:'minenfeld',    name:'Minefield',          desc:'Every minelayer keeps two more mines ready',
    apply:b => b.minenPlus += 2 },
  { id:'wartungsnetz', name:'Maintenance Net',       desc:'Repair drones repair 60% faster',
    apply:b => b.repairSpeed *= 1.6 },
  /* Nur zweimal: absorbOf deckelt bei 90 %, ein drittes Mal täte gar
     nichts mehr — und eine Karte, die nichts tut, ist eine verlorene Wahl. */
  { id:'feldharmonie', name:'Field Harmony', max:2,
    desc:'Shield fields absorb 15 percentage points more, up to 90%',
    apply:b => b.absorbPlus += 0.15 },

  /* --- Antworten auf Gegner-Eigenschaften --- */
  { id:'durchschlag',  name:'Piercing Rounds',desc:'Every hit ignores 5 armor',
    apply:b => b.pierce += 5 },
  { id:'flak',         name:'Flak Rounds',       desc:'+60% damage against flying targets',
    apply:b => b.vsAir *= 1.6 },
  { id:'unterkuehlung',name:'Hypothermia',       desc:'Every hit briefly slows by 10%',
    apply:b => b.hitSlow += 0.1 },
  { id:'sprengbolzen', name:'Explosive Bolts',       desc:'Killed enemies take bystanders with them',
    apply:b => b.deathSpark += 18 },
  { id:'kettenblitz',  name:'Chain Lightning',        desc:'Projectiles jump to a second target at half force',
    apply:b => b.chain += 0.5 },

  /* --- Regeln statt Zahlen --- */
  { id:'dornen',       name:'Thorn Barriers',    desc:'Barriers hurt their attackers',
    apply:b => b.wallThorns += 14 },
  { id:'kernstoss',    name:'Core Shock',           desc:'The core hurts and knocks back whatever attacks it',
    apply:b => b.coreShock += 20 },
  { id:'inselbetrieb', name:'Island Mode', weight:0.6, max:1,
    desc:'Towers without a grid connection fire at half rate instead of not at all',
    apply:b => b.unpoweredRate = 0.5 },
  { id:'kaltstart',    name:'Cold Start', weight:0.7, max:1,
    desc:'The buffer is full at the start of every wave',
    apply:b => b.waveStartFull = true },
  { id:'ausschlachten',name:'Scrapping', max:1,
    desc:'Selling refunds the full price',
    apply:b => b.refund = 1 },

  /* --- Zielkonflikte: stark, aber mit Preis --- */
  { id:'zuendschnur',  name:'Short Fuse',         desc:'+38% damage, but 18% less structure',
    apply:b => { b.damage *= 1.38; b.structure *= 0.82; } },
  { id:'hochlast',     name:'High Load',           desc:'+32% fire rate, but +25% energy use',
    apply:b => { b.rate *= 1.32; b.energy *= 1.25; } },
  { id:'schlank',      name:'Lean Build',  desc:'Build 28% cheaper, 14% less structure',
    apply:b => { b.buildCost *= 0.72; b.structure *= 0.86; } },
  { id:'fernzuendung', name:'Remote Detonation',        desc:'+32% range, but 8% less damage',
    apply:b => { b.range *= 1.32; b.damage *= 0.92; } },
  { id:'notstrom',     name:'Emergency Circuit',      desc:'+8 energy per second, but 30 less storage',
    apply:b => { b.regen += 8; b.capacity -= 30; } },
  { id:'anzapfung',    name:'Core Tap',      desc:'+55% matter, but the core loses 70 structure',
    apply:(b,g) => { b.bounty *= 1.55; g.coreHpMax -= 70; g.coreHp = Math.min(g.coreHp, g.coreHpMax); } },
  { id:'brennstab',    name:'Fuel Rod',          desc:'+20% damage, but buildings cost 10% more',
    apply:b => { b.damage *= 1.2; b.buildCost *= 1.1; } },

  /* --- Netz, Kernbefehle, Sturmwellen --- */
  { id:'hochspannung', name:'High Voltage',     desc:'All lines carry 35% more load',
    apply:b => b.flow *= 1.35 },
  { id:'sammelschiene',name:'Busbar',    desc:'+20% line load and 0.4 tiles more grid radius',
    apply:b => { b.flow *= 1.2; b.netRadius += 0.4; } },
  { id:'lastverteiler',name:'Load Balancer',    desc:'Reactors relieve their branch twice as much',
    apply:b => b.reactorFeed *= 2 },
  { id:'kondensator',  name:'Capacitor Bank',  desc:'Core commands recharge 28% faster',
    apply:b => b.powerCd *= 0.72 },
  { id:'schwungrad',   name:'Flywheel',       desc:'Core commands draw 35% less from the buffer',
    apply:b => b.powerDrain *= 0.65 },

  /* --- Akkus und Kernmodi --- */
  { id:'zellenstapel', name:'Cell Stack',    desc:'Batteries hold 45% more',
    apply:b => b.akkuCap *= 1.45 },
  { id:'schnellschaltung',name:'Fast Switch', max:2,
    desc:'The core switches modes twice as fast',
    apply:b => b.modeSwitch *= 0.5 },

  /* --- Selten und einmalig --- */
  { id:'notreserve',   name:'Emergency Reserve', max:1, weight:0.8,
    desc:'The core gains 150 structure and is fully restored at once',
    apply:(b,g) => { g.coreHpMax += 150; g.coreHp = g.coreHpMax; } },
  { id:'schildbrecher',name:'Shieldbreaker', max:1, weight:0.7,
    desc:'Projectiles deal full damage to shields',
    apply:b => b.shieldPierce = true },
  { id:'ventil',       name:'Overload Valve', max:1, weight:0.7,
    desc:'Overload only costs double',
    apply:b => b.overloadCost = 2 },
  { id:'zweiterRing',  name:'Second Core Ring', max:1, weight:0.5,
    desc:'Core and pylons reach 1.6 tiles further',
    apply:b => b.netRadius += 1.6 },
  { id:'fusionszelle', name:'Fusion Cell', max:1, weight:0.5,
    desc:'+10 energy per second and +90 storage',
    apply:b => { b.regen += 10; b.capacity += 90; } },
  { id:'werkstatt',    name:'Workshop', max:1, weight:0.4,
    desc:'Every existing building instantly gains a level',
    apply:(b,g) => {
      for (const x of g.buildings.values()) {
        if (x.level >= UPGRADE.maxLevel) continue;
        x.level++;
        x.maxHp = g.structureOf(x); x.hp = x.maxHp;
      }
    } },
  { id:'abschirmung',  name:'Shielding', max:1, weight:0.5,
    desc:'Jamming Fog and EMP Front no longer affect you',
    apply:b => b.modImmune = b.modImmune.concat(['nebel', 'emp']) },
  { id:'zwitterkern',  name:'Hybrid Core', max:1, weight:0.5,
    desc:'The core mode loses half its drawback',
    apply:b => b.modePenalty *= 0.5 },
  { id:'automatik',    name:'Auto Overload', max:1, weight:0.35,
    desc:'While the buffer is above 85%, all towers fire overloaded — at no extra cost',
    apply:b => b.freeOverloadAt = 0.85 }
];
