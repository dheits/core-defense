'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* Offscreen-Layer für das Versorgungsnetz (nur bei Änderung neu gezeichnet) */
const netCanvas = document.createElement('canvas');
netCanvas.width = W; netCanvas.height = H;
const netCtx = netCanvas.getContext('2d');

/* Bodenspuren. Wird nie gelöscht: Explosionen und gefallene Bauten
   brennen sich ein, und nach zwanzig Wellen sieht man dem Feld die
   Schlacht an. */
const spurCanvas = document.createElement('canvas');
spurCanvas.width = W; spurCanvas.height = H;
const spurCtx = spurCanvas.getContext('2d');

function brandfleck(x, y, r, staerke) {
  const g = spurCtx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(14,8,6,' + staerke * 1.25 + ')');
  g.addColorStop(.55, 'rgba(40,23,16,' + staerke + ')');
  g.addColorStop(.86, 'rgba(112,72,48,' + staerke * .38 + ')');
  g.addColorStop(1, 'rgba(96,62,42,0)');
  spurCtx.fillStyle = g;
  // Leicht unrunde Form, damit nicht überall derselbe Kreis liegt
  spurCtx.save();
  spurCtx.translate(x, y);
  spurCtx.rotate(Math.random() * 6.28);
  spurCtx.scale(1, .78 + Math.random() * .34);
  spurCtx.translate(-x, -y);
  spurCtx.beginPath(); spurCtx.arc(x, y, r, 0, 7); spurCtx.fill();
  spurCtx.restore();
}

/* Lichtschicht. Statt jedes Leuchten neu zu berechnen, wird ein
   Farbverlauf einmal je Farbe in ein kleines Bild gezeichnet und
   danach nur noch skaliert additiv aufgetragen — das ist schnell
   genug für hundert Lichter je Bild. */
const lichtCache = new Map();
function lichtBild(hex) {
  let c = lichtCache.get(hex);
  if (c) return c;
  const n = parseInt(hex.slice(1), 16);
  const rgb = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255);
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(' + rgb + ',.95)');
  rg.addColorStop(.22, 'rgba(' + rgb + ',.45)');
  rg.addColorStop(.55, 'rgba(' + rgb + ',.13)');
  rg.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  lichtCache.set(hex, c);
  return c;
}
function licht(x, y, r, hex, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(lichtBild(hex), x - r, y - r, r * 2, r * 2);
}

/* ---------------------------------------------------------------
   Zwei Dinge überleben das Schließen der Seite: der laufende
   Spielstand und die Bestenliste. Beides liegt im localStorage —
   und beides muss ohne ihn funktionieren. In privaten Fenstern und
   bei manchen file://-Einstellungen wirft schon der Zugriff, deshalb
   geht jeder Zugriff durch diese drei Funktionen.
---------------------------------------------------------------- */
const SAVE_KEY = 'cd_save', BEST_KEY = 'cd_best';
const SAVE_VERSION = 1;          // ändert sich das Format, wird Altes verworfen
const BEST_MAX = 8;              // so viele Einträge hält die Bestenliste

function lese(key) {
  try {
    const roh = localStorage.getItem(key);
    return roh ? JSON.parse(roh) : null;
  } catch (e) { return null; }
}
function schreibe(key, wert) {
  try { localStorage.setItem(key, JSON.stringify(wert)); return true; }
  catch (e) { return false; }
}
function loesche(key) {
  try { localStorage.removeItem(key); } catch (e) { /* egal */ }
}

/* Was eine Welle gekostet und gebracht hat. Wird beim Wellenstart auf
   null gesetzt und beim Wellenende als Bilanz eingefroren. */
function frischeStats() {
  return {
    energie: 0,      // von Türmen verschossen
    befehle: 0,      // von Kernbefehlen aus dem Puffer genommen
    schild: 0,       // vom Schildmodus für Kernschaden bezahlt
    kernSchaden: 0,  // was am Kern ankam
    gegner: 0, materie: 0, verluste: 0,
    leer: 0,         // Sekunden, in denen ein Turm mangels Energie nicht schoss
    drossel: 0, zeit: 0   // für den Schnitt der Netzdrossel
  };
}

/* Alle Zellen zwischen zwei Punkten, den Startpunkt ausgenommen
   (Bresenham). Beim Ziehen springt der Mauszeiger je Bild um mehrere
   Zellen — ohne die Zwischenschritte bekäme die Reihe Lücken. */
function rasterLinie(x0, y0, x1, y1) {
  const zellen = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let fehler = dx - dy, sicherung = 200;
  while ((x0 !== x1 || y0 !== y1) && sicherung-- > 0) {
    const e2 = 2 * fehler;
    if (e2 > -dy) { fehler -= dy; x0 += sx; }
    if (e2 < dx) { fehler += dx; y0 += sy; }
    zellen.push({ x: x0, y: y0 });
  }
  return zellen;
}

const game = {
  time: 0, speed: 1, paused: false, over: false,
  stats: frischeStats(), bilanz: null,
  matter: START_MATTER,
  energy: CORE.energy, energyMax: CORE.energy, regen: CORE.regen,
  coreHp: CORE.hp, coreHpMax: CORE.hp,
  wave: 0, phase: 'build', buildTimer: FIRST_BUILD_TIME,
  // höchste je erreichte Welle dieser Partie — zählt für die Bestenliste,
  // damit ein Neuladen eine verlorene Welle nicht schönrechnet
  bestWave: 0,
  buildings: new Map(),
  enemies: [], projectiles: [], particles: [], beams: [],
  spawnQueue: [], incoming: [],
  tool: null, selected: null, inView: true,
  buffs: freshBuffs(), takenCards: new Map(),
  draft: null, plannedWave: null, turretsDirty: true,
  // Wird der Kern länger ungestört bearbeitet, ist irgendwo die Deckung offen
  alarm: { since: 0, last: -99, on: false, seen: false },
  boss: null, bossReward: false, pendingSpawns: [],
  hover: { x: -1, y: -1, inside: false },
  ziehen: null,                     // läuft gerade ein Zug über mehrere Zellen?
  shake: 0,
  // Leitungslast, Kernbefehle, Sturmwelle, Kernmodus
  sources: [], overloadedNodes: 0,
  coreMode: 0, coreModeNext: 0, modeTimer: 0, shieldFlash: 0,
  lichter: [], risse: [],           // kurzlebige Lichtquellen, Spawn-Risse
  cooldowns: { discharge: 0, surge: 0, pulse: 0 },
  surge: 0, shockwave: null, mod: null,

  /* ------------------------- Raster ------------------------- */
  isCore(x, y) {
    return Math.abs(x - CORE.cx) <= CORE.half && Math.abs(y - CORE.cy) <= CORE.half;
  },
  inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows; },
  free(x, y) { return this.inBounds(x, y) && !this.isCore(x, y) && !this.buildings.has(key(x, y)); },
  buildingAt(px, py) {
    const x = pxToCell(px), y = pxToCell(py);
    if (!this.inBounds(x, y)) return null;
    return this.buildings.get(key(x, y)) || null;
  },

  /* ------------------- Bauen / Verkaufen -------------------- */
  // Karten wirken teils global, teils nur auf einen Turmtyp
  typeBuff(b, key) {
    const t = this.buffs.type[b.type];
    return t && t[key] !== undefined ? t[key] : 1;
  },
  stat(b, name) {
    const base = b.def[name];
    if (base === undefined) return undefined;
    const lvl = b.level - 1;
    if (name === 'damage') {
      const d = base * Math.pow(UPGRADE.damage, lvl) * this.buffs.damage * this.typeBuff(b, 'dmg') * (b.boost || 1);
      return b.overload ? d * OVERLOAD.damage : d;
    }
    if (name === 'range')
      return base * Math.pow(UPGRADE.range, lvl) * this.buffs.range * this.typeBuff(b, 'range')
             * this.modv('range', 1);
    return base;
  },
  cooldownOf(b) { return b.def.cooldown / (this.buffs.rate * this.typeBuff(b, 'rate')); },
  energyOf(b) {
    return b.def.energy * this.buffs.energy * this.typeBuff(b, 'energy')
      * (b.overload ? this.buffs.overloadCost : 1);
  },
  // Ein kurzer Lichtschein an einer Stelle — Treffer, Explosion, Abschuss
  blitz(x, y, r, hex, life) {
    this.lichter.push({ x, y, r, hex, life, max: life });
  },

  // Dauerlast eines Turms in Energie pro Sekunde — genau die Größe,
  // die durch die Leitungen bis zu ihm fließen muss.
  drawOf(b) {
    if (!b.def.turret || !b.def.energy) return 0;
    return this.energyOf(b) / this.cooldownOf(b);
  },
  // Speicher, den ein Bau beisteuert — beim Akku greift die Karte „Zellenstapel"
  capOf(b) {
    if (!b.def.capacity) return 0;
    return b.def.capacity * b.level * (b.type === 'akku' ? this.buffs.akkuCap : 1);
  },
  costOf(type) { return Math.round(BUILDINGS[type].cost * this.buffs.buildCost); },
  upgradeCost(b) {
    return Math.round(upgradeSteps(b.def.cost, b.level) * this.buffs.buildCost);
  },
  // Was in einem Bau steckt: Grundpreis plus alle bezahlten Ausbaustufen
  buildingValue(b) {
    let v = this.costOf(b.type);
    for (let l = 1; l < b.level; l++)
      v += Math.round(upgradeSteps(b.def.cost, l) * this.buffs.buildCost);
    return v;
  },
  repairCost(b) {
    const fehlt = 1 - b.hp / b.maxHp;
    return Math.ceil(fehlt * this.buildingValue(b) * REPAIR_SHARE);
  },
  repair(b) {
    if (b.hp >= b.maxHp) return toast('Unbeschädigt');
    const c = this.repairCost(b);
    if (this.matter < c) { SFX.deny(); return toast('Zu wenig Materie'); }
    this.matter -= c;
    b.hp = b.maxHp;
    SFX.repair(panOf(b.px), farOf(b.px, b.py));
    for (let i = 0; i < 10; i++)
      this.particles.push(new Particle(b.px, b.py, '#6bff9f', { speed: rand(30, 110), life: .45 }));
    updateInspector();
  },
  // Ohne Auswahl: alles instand setzen, was noch bezahlbar ist
  repairAll() {
    const kaputt = [...this.buildings.values()]
      .filter(b => b.hp < b.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (!kaputt.length) return toast('Alles unbeschädigt');
    let n = 0, summe = 0;
    for (const b of kaputt) {
      const c = this.repairCost(b);
      if (this.matter < c) break;
      this.matter -= c; b.hp = b.maxHp; summe += c; n++;
    }
    if (!n) { SFX.deny(); return toast('Zu wenig Materie'); }
    SFX.repair(0);
    toast(n + (n === 1 ? ' Bau' : ' Bauten') + ' instandgesetzt  −' + summe + ' Materie');
  },
  structureOf(b) {
    return Math.round(b.def.hp * this.buffs.structure * Math.pow(UPGRADE.hp, b.level - 1));
  },
  recalcStructure() {                    // nach Karten wie „Panzerplatten"
    for (const b of this.buildings.values()) {
      const max = this.structureOf(b);
      if (max === b.maxHp) continue;
      b.hp += max - b.maxHp;
      b.maxHp = max;
    }
  },

  // Ein Bauwerk anlegen, ohne zu bezahlen — auch der Spielstand baut hierüber
  makeBuilding(type, x, y) {
    const def = BUILDINGS[type];
    const b = {
      type, def, x, y, level: 1,
      hp: 0, maxHp: 0,
      cd: 0, supplied: false, node: null, flow: 1, flash: 0, pulse: 0,
      prio: 1, overload: false, reserve: true, bornAt: performance.now(),
      aim: -Math.PI / 2, scan: rand(0, 6.28),
      px: cellToPx(x), py: cellToPx(y)
    };
    b.maxHp = this.structureOf(b); b.hp = b.maxHp;
    this.buildings.set(key(x, y), b);
    this.turretsDirty = true;
    return b;
  },

  build(type, x, y) {
    const def = BUILDINGS[type];
    const cost = this.costOf(type);
    if (!this.free(x, y)) { SFX.deny(); return toast('Platz belegt'); }
    if (this.matter < cost) { SFX.deny(); return toast('Zu wenig Materie'); }
    this.matter -= cost;
    const b = this.makeBuilding(type, x, y);
    this.recomputeSupply();
    SFX.build();
    for (let i = 0; i < 10; i++)
      this.particles.push(new Particle(b.px, b.py, def.color, { speed: rand(40, 120), life: .4 }));
    this.merken();
  },

  /* ---------------- Ziehen zum Bauen -------------------------
     Nur Bauteile mit `drag` (heute die Barriere) — bei einer Kanone je
     65 Materie wäre ein verrutschter Zug teuer. Was nicht geht, wird
     still übersprungen: Beim Ziehen über eine Reihe wäre eine Absage je
     belegter Zelle nur Lärm. */
  ziehBau(type, x, y) {
    if (!this.free(x, y)) return false;
    if (this.matter < this.costOf(type)) return false;
    this.build(type, x, y);
    return true;
  },
  ziehStart(type, x, y) {
    const def = BUILDINGS[type];
    if (this.over || !def || !def.drag || !this.inBounds(x, y)) return 0;
    this.ziehen = { type, x, y, gebaut: 0 };
    if (this.ziehBau(type, x, y)) this.ziehen.gebaut++;
    return this.ziehen.gebaut;
  },
  ziehWeiter(x, y) {
    const z = this.ziehen;
    if (!z || !this.inBounds(x, y) || (z.x === x && z.y === y)) return 0;
    let n = 0;
    for (const c of rasterLinie(z.x, z.y, x, y))
      if (this.ziehBau(z.type, c.x, c.y)) n++;
    z.x = x; z.y = y; z.gebaut += n;
    return n;
  },
  // Erst am Ende sichern — sonst schriebe ein Zug über zwölf Zellen
  // zwölf Spielstände.
  ziehEnde() {
    const z = this.ziehen;
    this.ziehen = null;
    if (z && z.gebaut) this.merken();
    return z ? z.gebaut : 0;
  },

  sell(b) {
    SFX.sell();
    this.matter += Math.round(this.buildingValue(b) * this.buffs.refund);
    this.buildings.delete(key(b.x, b.y));
    this.turretsDirty = true;
    if (this.selected === b) this.select(null);
    this.recomputeSupply();
    this.merken();
  },

  upgrade(b) {
    if (b.level >= UPGRADE.maxLevel) { SFX.deny(); return toast('Maximalstufe'); }
    const c = this.upgradeCost(b);
    if (this.matter < c) { SFX.deny(); return toast('Zu wenig Materie'); }
    this.matter -= c;
    b.level++;
    SFX.upgrade();
    b.maxHp = this.structureOf(b);
    b.hp = b.maxHp;
    this.recomputeSupply();
    for (let i = 0; i < 14; i++)
      this.particles.push(new Particle(b.px, b.py, '#ffd166', { speed: rand(50, 160), life: .5 }));
    this.merken();
  },

  select(b) {
    if (b && b !== this.selected) SFX.select();
    this.selected = b;
    updateInspector();
  },

  /* --------------------- Energienetz ------------------------
     Zwei Fragen auf einmal: Wer hängt am Netz — und wie viel Energie
     kommt dort noch an? Die Versorgung breitet sich iterativ aus, jeder
     Bau hängt sich an den NÄCHSTEN Knoten in Reichweite. Danach wird von
     außen nach innen aufsummiert, was jeder Ast anfordert; ein Knoten,
     der mehr tragen soll als er kann, drosselt alles hinter sich.
     Deshalb ist nicht nur die Reichweite des Netzes eine Entscheidung,
     sondern auch seine Form: ein langer Strang trägt wenig, zwei kurze
     Äste tragen zusammen das Doppelte. */
  recomputeSupply() {
    const extra = this.buffs.netRadius;
    const core = {
      x: CORE.cx, y: CORE.cy, r: CORE.supply + extra, parent: null, node: null,
      cap: FLOW.core * this.buffs.flow, demand: 0, through: 0, ratio: 0, flow: 1
    };
    const sources = [core];
    const pylons = [];
    for (const b of this.buildings.values()) {
      b.supplied = false; b.node = null;
      if (b.type === 'pylon') pylons.push(b);
    }

    // Der nächstgelegene Knoten in Reichweite wird zum Elternteil —
    // daraus entsteht der Baum, durch den die Energie fließt.
    const nearestSource = (x, y) => {
      let best = null, bd = Infinity;
      for (const s of sources) {
        const d = dist(x, y, s.x, s.y);
        if (d <= s.r && d < bd) { bd = d; best = s; }
      }
      return best;
    };

    // Ein Pylon zählt erst als Quelle, wenn er selbst versorgt ist
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of pylons) {
        if (p.supplied) continue;
        const src = nearestSource(p.x, p.y);
        if (!src) continue;
        p.supplied = true;
        p.parent = src;
        p.node = {
          x: p.x, y: p.y, r: p.def.supply + extra, parent: src, node: p,
          cap: flowCap(p) * this.buffs.flow, demand: 0, through: 0, ratio: 0, flow: 1
        };
        sources.push(p.node);
        changed = true;
      }
    }
    for (const b of this.buildings.values()) {
      if (b.type === 'pylon') continue;
      if (!b.def.needsPower) { b.supplied = true; continue; }
      b.node = nearestSource(b.x, b.y);
      b.supplied = !!b.node;
    }
    this.sources = sources;

    // Verstärkerfeld: ausgebaute Pylone erhöhen den Schaden im eigenen Radius
    const feld = [...this.buildings.values()]
      .filter(b => b.type === 'pylon' && b.supplied && b.level >= UPGRADE.maxLevel);
    for (const b of this.buildings.values()) {
      if (!b.def.turret) continue;
      b.boost = feld.some(p => dist(b.x, b.y, p.x, p.y) <= p.def.supply + extra)
        ? SPECIALS.pylon.boost : 1;
    }

    /* Lastrechnung. Erst meldet jeder Knoten an, was direkt an ihm hängt:
       Türme ziehen, Reaktoren speisen dort ein, wo sie stehen. */
    const feed = this.buffs.reactorFeed;
    for (const b of this.buildings.values()) {
      if (!b.supplied || !b.node) continue;
      if (b.def.turret) b.node.demand += this.drawOf(b);
      else if (b.type === 'reactor') b.node.demand -= b.def.regen * b.level * feed;
      // Der Akku erzeugt nichts, aber er puffert vor Ort — die Leitung
      // davor muss die Spitzen deshalb nicht allein tragen.
      else if (b.type === 'akku') b.node.cap += akkuFlow(b);
    }
    // Dann von außen nach innen aufsummieren. Die Knoten stehen in
    // Ausbreitungsreihenfolge, ein Kind also immer hinter seinem Elternteil.
    for (const s of sources) s.through = s.demand;
    for (let i = sources.length - 1; i > 0; i--) {
      const s = sources[i];
      s.parent.through += Math.max(0, s.through);   // Überschuss bleibt im Ast
    }
    // Und zurück nach außen: jeder Knoten drosselt, was er nicht mehr trägt.
    for (const s of sources) {
      const need = Math.max(0, s.through);
      s.ratio = need / s.cap;
      s.flow = (s.parent ? s.parent.flow : 1) * Math.min(1, s.cap / Math.max(0.0001, need));
    }
    this.overloadedNodes = sources.filter(s => s.ratio > 1).length;
    for (const b of this.buildings.values())
      b.flow = b.node ? b.node.flow : 1;

    // Energie-Ökonomie neu bilanzieren: Reaktoren liefern, Akkus fassen
    let regen = CORE.regen + this.buffs.regen;
    let cap = CORE.energy + this.buffs.capacity;
    for (const b of this.buildings.values()) {
      if (!b.supplied) continue;
      if (b.def.regen) regen += b.def.regen * b.level;
      if (b.def.capacity) cap += this.capOf(b);
    }
    this.regen = Math.round(regen * (this.buffs.regenMul || 1) * this.modeMul('regen') * 10) / 10;
    this.energyMax = Math.max(1, Math.round(cap * this.modeMul('cap')));
    this.energy = Math.min(this.energy, this.energyMax);
    this.drawNet();
  },

  drawNet() {
    netCtx.clearRect(0, 0, W, H);
    netCtx.globalCompositeOperation = 'lighter';
    for (const s of this.sources) {
      const px = cellToPx(s.x), py = cellToPx(s.y), r = s.r * GRID.cell;
      const g = netCtx.createRadialGradient(px, py, r * .25, px, py, r);
      g.addColorStop(0, 'rgba(60,170,255,.16)');
      g.addColorStop(.72, 'rgba(60,170,255,.06)');
      g.addColorStop(1, 'rgba(60,170,255,0)');
      netCtx.fillStyle = g;
      netCtx.beginPath(); netCtx.arc(px, py, r, 0, 7); netCtx.fill();
      netCtx.strokeStyle = 'rgba(95,224,255,.16)';
      netCtx.lineWidth = 1;
      netCtx.beginPath(); netCtx.arc(px, py, r, 0, 7); netCtx.stroke();
    }
    /* Leitungen Kern -> Pylon -> Pylon. Stärke und Farbe zeigen, wie
       nah der Ast an seiner Grenze arbeitet — rot heißt gedrosselt. */
    netCtx.globalCompositeOperation = 'source-over';
    for (const s of this.sources) {
      if (!s.parent) continue;
      const r = s.ratio || 0;
      netCtx.strokeStyle = r > 1 ? 'rgba(255,93,115,.85)'
                        : r > FLOW.warn ? 'rgba(255,180,90,.7)'
                        : 'rgba(95,224,255,.45)';
      netCtx.lineWidth = 1.2 + Math.min(1.5, r) * 1.9;
      netCtx.setLineDash(r > 1 ? [3, 4] : [4, 5]);
      netCtx.beginPath();
      netCtx.moveTo(cellToPx(s.parent.x), cellToPx(s.parent.y));
      netCtx.lineTo(cellToPx(s.x), cellToPx(s.y));
      netCtx.stroke();
    }
    netCtx.setLineDash([]);
  },

  /* ----------------------- Schaden -------------------------- */
  dealDamage(enemy, dmg, def, kind, burn, quelle) {
    if (def && def.splash) {
      const r = def.splash * this.buffs.splash * GRID.cell;
      for (const e of this.enemies) {
        const d = dist(e.x, e.y, enemy.x, enemy.y);
        if (d > r) continue;
        this.hurt(e, dmg * (1 - 0.5 * d / r), 'proj', quelle);
        if (burn) { e.burnDps = burn; e.burnUntil = this.time + SPECIALS.cannon.burnTime; }
      }
      for (let i = 0; i < 16; i++)
        this.particles.push(new Particle(enemy.x, enemy.y, i % 2 ? '#ff9f5a' : '#ffe0a8',
          { speed: rand(60, 260), life: rand(.2, .5) }));
      this.blitz(enemy.x, enemy.y, r * 1.5, '#ffb066', .3);
      brandfleck(enemy.x, enemy.y, r * .8, .1);
    } else {
      this.hurt(enemy, dmg, kind, quelle);
      // Kettenblitz: der Treffer springt auf das nächste Ziel über
      if (this.buffs.chain && kind === 'proj') {
        let best = null, bd = 2.2 * GRID.cell;
        for (const o of this.enemies) {
          if (o === enemy || o.dead) continue;
          const d = dist(o.x, o.y, enemy.x, enemy.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          this.hurt(best, dmg * this.buffs.chain, 'chain', quelle);
          this.beams.push({ x1: enemy.x, y1: enemy.y, x2: best.x, y2: best.y, life: .1, color: '#8affc1' });
        }
      }
      for (let i = 0; i < 4; i++)
        this.particles.push(new Particle(enemy.x, enemy.y, def ? def.color : '#fff',
          { speed: rand(30, 120), life: rand(.15, .3), size: 2 }));
    }
  },

  /* kind: 'beam' (Frost) bricht Schilde, alles andere prallt halb ab.
     Panzerung wird von jedem einzelnen Treffer abgezogen — deshalb
     zählt hier Einzelschaden mehr als Feuerrate. */
  hurt(e, dmg, kind, quelle) {
    if (e.dead) return;
    if (e.flying) dmg *= this.buffs.vsAir;
    if (e.shield > 0) {
      const mult = kind === 'beam' ? 1.5 : (this.buffs.shieldPierce ? 1 : 0.65);
      const onShield = dmg * mult;
      e.shieldCd = 4;
      e.hitFlash = 0.06;
      if (onShield < e.shield) {
        e.shield -= onShield;
        this.particles.push(new Particle(e.x, e.y, '#6bd5ff', { speed: rand(40, 110), life: .25, size: 2 }));
        return;
      }
      dmg -= e.shield / mult;
      e.shield = 0;
      for (let i = 0; i < 8; i++)
        this.particles.push(new Particle(e.x, e.y, '#6bd5ff', { speed: rand(60, 180), life: .35, size: 2 }));
    }
    if (e.def.boss && e.guarded) dmg *= GUARD_REDUCTION;
    const armor = Math.max(0, e.armor - this.buffs.pierce);
    if (armor) dmg = Math.max(dmg * 0.15, dmg - armor);   // nie ganz wirkungslos
    // Für die Bilanz zählt nur, was wirklich ankam — Überschuss beim
    // tödlichen Treffer würde den besten Turm sonst überzeichnen.
    if (quelle) quelle.schaden = (quelle.schaden || 0) + Math.min(dmg, Math.max(0, e.hp));
    e.hp -= dmg;
    e.hitFlash = 0.06;
    if (this.buffs.hitSlow && !this.modv('noSlow', false))
      e.applySlow(1 - this.buffs.hitSlow, 0.8, this.time);
    if (e.hp <= 0) {
      e.dead = true;
      this.stats.gegner++;
      // Sprengbolzen: der Abschuss reißt Umstehende mit (nur eine Stufe tief)
      if (this.buffs.deathSpark && kind !== 'spark') {
        const r = 1.4 * GRID.cell;
        for (const o of this.enemies)
          if (o !== e && !o.dead && dist(o.x, o.y, e.x, e.y) <= r)
            this.hurt(o, this.buffs.deathSpark, 'spark');
      }
      SFX.kill(e.def.boss, panOf(e.x), farOf(e.x, e.y), e.radius / 9);
      this.blitz(e.x, e.y, GRID.cell * (e.def.boss ? 6 : 1.3), e.def.color, e.def.boss ? .9 : .22);
      brandfleck(e.x, e.y, e.radius * (e.def.boss ? 4.5 : 1.5), e.def.boss ? .3 : .055);
      this.matter += e.def.bounty * this.buffs.bounty;
      this.stats.materie += e.def.bounty * this.buffs.bounty;
      const n = e.def.boss ? 40 : 12;
      for (let i = 0; i < n; i++)
        this.particles.push(new Particle(e.x, e.y, e.def.color,
          { speed: rand(50, e.def.boss ? 340 : 200), life: rand(.3, .8) }));
      const teile = e.def.boss ? 14 : 4;
      for (let i = 0; i < teile; i++)
        this.particles.push(new Debris(e.x, e.y, e.def.color, e.def.boss ? 2 : 1));

      if (e.def.splitInto) {                      // aus einem werden drei
        for (let i = 0; i < e.def.splitCount; i++) {
          const a = i / e.def.splitCount * Math.PI * 2 + rand(0, 1);
          this.pendingSpawns.push(new Enemy(e.def.splitInto,
            e.x + Math.cos(a) * 13, e.y + Math.sin(a) * 13, this.wave));
        }
      }
      if (e.def.boss) {                           // Bosse zahlen sich aus
        this.matter += 150;
        this.bossReward = true;
        this.shake = Math.max(this.shake, 14);
        SFX.bossDown();
        toast(e.def.name.toUpperCase() + ' GEFALLEN  +150 Materie');
      }
    }
  },

  damageBuilding(b, dmg) {
    b.hp -= dmg;
    b.flash = 0.12;
    SFX.buildingHit(panOf(b.px), farOf(b.px, b.py));
    if (b.hp <= 0) {
      SFX.buildingLost(panOf(b.px), farOf(b.px, b.py));
      this.blitz(b.px, b.py, GRID.cell * 2.6, '#ffb066', .45);
      brandfleck(b.px, b.py, GRID.cell * 1.15, .28);
      for (let i = 0; i < 18; i++)
        this.particles.push(new Particle(b.px, b.py, b.def.color, { speed: rand(50, 220), life: rand(.3, .7) }));
      for (let i = 0; i < 6; i++)
        this.particles.push(new Debris(b.px, b.py, b.def.color, 1.3));
      if (b.type === 'wall' && b.level >= UPGRADE.maxLevel) {   // Reaktivpanzerung
        const r = SPECIALS.wall.blastRange * GRID.cell;
        for (const e of this.enemies)
          if (dist(e.x, e.y, b.px, b.py) <= r) this.hurt(e, SPECIALS.wall.blast, 'proj');
        for (let i = 0; i < 22; i++)
          this.particles.push(new Particle(b.px, b.py, '#ffd166', { speed: rand(80, 320), life: rand(.3, .6) }));
        this.blitz(b.px, b.py, r * 1.6, '#ffd166', .55);
        brandfleck(b.px, b.py, r * .9, .22);
        SFX.buildingLost(panOf(b.px), farOf(b.px, b.py));
      }
      this.buildings.delete(key(b.x, b.y));
      this.stats.verluste++;
      this.turretsDirty = true;
      if (this.selected === b) this.select(null);
      this.recomputeSupply();
      this.shake = Math.max(this.shake, 5);
    }
  },

  damageCore(dmg, enemy) {
    // Schildmodus: Der Puffer nimmt einen Teil des Treffers auf — solange
    // Energie da ist. Was der Puffer schluckt, fehlt danach den Türmen.
    const m = this.activeMode();
    if (m && m.absorb) {
      // Nur die Ladung über der Untergrenze steht dem Schild zur Verfügung.
      // Was darunter liegt, gehört den Türmen — sonst schießt sich der
      // Schildmodus selbst ins Knie (siehe Kommentar bei CORE_MODES).
      const frei = this.energy - this.energyMax * (m.floor || 0);
      if (frei > 0) {
        const gefangen = Math.min(dmg * m.absorb, frei / m.perDamage);
        if (gefangen > 0.01) {
          this.energy -= gefangen * m.perDamage;
          this.stats.schild += gefangen * m.perDamage;
          dmg -= gefangen;
          this.shieldFlash = 0.4;
          SFX.shieldHit();
        }
      }
    }
    this.coreHp -= dmg;
    this.stats.kernSchaden += dmg;
    SFX.coreHit();
    if (this.time - this.alarm.last > 2) this.alarm.since = this.time;   // neue Serie
    this.alarm.last = this.time;
    if (enemy && this.buffs.coreShock) {          // Kernstoß: zurück und weh
      const a = Math.atan2(enemy.y - CORE_PX.y, enemy.x - CORE_PX.x);
      enemy.x += Math.cos(a) * 26;
      enemy.y += Math.sin(a) * 26;
      this.hurt(enemy, this.buffs.coreShock, 'shock');
    }
    this.shake = Math.max(this.shake, 8);
    this.blitz(enemy ? enemy.x : CORE_PX.x, enemy ? enemy.y : CORE_PX.y,
               GRID.cell * 2.2, '#ff5d73', .3);
    for (let i = 0; i < 8; i++)
      this.particles.push(new Particle(CORE_PX.x + rand(-30, 30), CORE_PX.y + rand(-30, 30),
        '#5fe0ff', { speed: rand(60, 200), life: .5 }));
    if (this.coreHp <= 0 && !this.over) {
      this.coreHp = 0;
      this.over = true;
      SFX.gameOver();
      loesche(SAVE_KEY);                       // die Partie ist zu Ende, nicht unterbrochen
      const erg = this.eintragen();
      showOverlay('KERN VERLOREN',
        'Du hast ' + erg.eintrag.wave + ' Wellen überstanden.' +
        (erg.platz === 0 ? ' Das ist dein bester Lauf.' : ''),
        bestenlisteHtml(erg.liste, erg.eintrag));
    }
  },

  /* ------------------------ Wellen -------------------------- */
  planWave(n) {
    const mod = modifierFor(n);
    let budget = waveBudget(n) * (mod && mod.budget ? mod.budget : 1);
    const pool = Object.keys(UNLOCK).filter(t => n >= UNLOCK[t] && !ENEMIES[t].boss);
    const groups = clamp(1 + Math.floor(n / 3), 1, 5);
    const angles = [];
    const base = rand(0, Math.PI * 2);
    for (let i = 0; i < groups; i++)
      angles.push(base + i / groups * Math.PI * 2 + rand(-.35, .35));

    const queue = [];
    const boss = bossFor(n);
    if (boss) {
      const a = pick(angles);
      queue.push({ type: boss.type, t: 2.2, angle: a, boss: true });
      budget -= ENEMIES[boss.type].budget;
      if (boss.escort) {
        for (let i = 0; i < boss.escort.count; i++) {
          queue.push({ type: boss.escort.type, t: .8 + i * .45,
                       angle: a + (i - (boss.escort.count - 1) / 2) * .16,
                       guard: !!boss.escort.guard });
          budget -= ENEMIES[boss.escort.type].budget;
        }
      }
    }
    let t = 0;
    let gi = 0;
    const gezogen = {};
    while (budget > 0 && queue.length < 400) {
      const frei = pool.filter(x => (gezogen[x] || 0) < (TYPE_CAP[x] || 999));
      if (!frei.length) break;
      const type = pick(frei);
      const d = ENEMIES[type];
      if (d.budget > budget + 1) break;
      gezogen[type] = (gezogen[type] || 0) + 1;
      budget -= d.budget;
      const a = angles[gi % angles.length] + rand(-.12, .12);
      gi += Math.random() < 0.28 ? 1 : 0;
      queue.push({ type, t, angle: a });
      t += spawnGap(n);
    }
    return { queue, angles, mod };
  },

  // Die nächste Welle steht schon in der Bauphase fest — sonst gäbe es
  // nichts anzukündigen.
  planNext() {
    this.plannedWave = this.planWave(this.wave + 1);
    this.incoming = this.plannedWave.angles;
  },

  wavePreview() {
    if (!this.plannedWave) return '';
    const count = {};
    for (const e of this.plannedWave.queue) count[e.type] = (count[e.type] || 0) + 1;
    const parts = Object.keys(count).map(t => {
      const d = ENEMIES[t], tr = traitWords(d);
      return count[t] + ' × ' + d.name + (tr.length ? ' (' + tr.join(', ') + ')' : '');
    });
    const dirs = [...new Set(this.plannedWave.angles.map(compass))];
    return 'Welle ' + (this.wave + 1) + ' aus ' + dirs.join(', ') + ':  ' + parts.join('   ·   ');
  },

  startWave() {
    if (this.phase === 'combat' || this.draft) return;
    if (!this.plannedWave) this.planNext();
    if (this.buildTimer > 0) this.matter += Math.round(this.buildTimer * 2);
    this.wave++;
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.phase = 'combat';
    // Rollen (Boss, Wächter) müssen mitwandern, nicht nur Typ und Zeit
    this.spawnQueue = this.plannedWave.queue
      .map(e => Object.assign({}, e, { at: this.time + e.t }))
      .sort((a, b) => a.at - b.at);
    this.incoming = this.plannedWave.angles;
    this.mod = this.plannedWave.mod || null;
    this.plannedWave = null;
    if (this.buffs.waveStartFull) this.energy = this.energyMax;
    for (const b of this.buildings.values()) {
      if (b.type === 'akku') b.reserve = true;
      b.schaden = 0;                            // Schadensbeitrag dieser Welle
    }
    this.stats = frischeStats();
    const sturm = this.modActive();
    SFX.waveStart();
    if (sturm) SFX.storm();
    toast('WELLE ' + this.wave + (sturm ? ' — ' + sturm.name.toUpperCase() : ''));
  },

  /* ---------------- Karten zwischen den Wellen ---------------- */
  openDraft() {
    const pool = CARDS.filter(c => (this.takenCards.get(c.id) || 0) < (c.max || CARD_MAX));
    const picks = [];
    if (this.bossReward) {                        // Bossbeute: eine seltene Karte ist sicher dabei
      this.bossReward = false;
      const selten = pool.filter(c => (c.weight || 1) < 1);
      if (selten.length) {
        const c = selten[(Math.random() * selten.length) | 0];
        picks.push(c);
        pool.splice(pool.indexOf(c), 1);
      }
    }
    while (picks.length < DRAFT_SIZE && pool.length) {
      let total = 0;
      for (const c of pool) total += c.weight || 1;
      let r = Math.random() * total, idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].weight || 1;
        if (r <= 0) { idx = i; break; }
      }
      picks.push(pool.splice(idx, 1)[0]);
    }
    if (!picks.length) return;
    this.draft = picks;
    showDraft(picks);
  },

  takeCard(i) {
    const c = this.draft && this.draft[i];
    if (!c) return;
    c.apply(this.buffs, this);
    this.takenCards.set(c.id, (this.takenCards.get(c.id) || 0) + 1);
    this.draft = null;
    hideDraft();
    this.recomputeSupply();
    this.recalcStructure();
    SFX.upgrade();
    toast(c.name);
    this.merken();
  },

  spawn(s) {
    const p = edgePoint(s.angle, 34);
    // Gegner kommen nicht einfach am Rand vorbei, sie treten durch einen Riss
    this.risse.push({ x: p.x, y: p.y, a: s.angle, t: 0,
                      life: s.boss ? .95 : .5, gross: s.boss ? 1.9 : 1 });
    const e = new Enemy(s.type, p.x, p.y, this.wave);
    const hpMul = this.modv('hp', 1);
    if (hpMul !== 1) { e.maxHp = Math.max(1, Math.round(e.maxHp * hpMul)); e.hp = e.maxHp; }
    e.speed *= this.modv('speed', 1);
    e.armor += this.modv('armor', 0);
    if (s.guard) e.isGuard = true;
    this.enemies.push(e);
    if (s.boss) {
      this.boss = e;
      this.shake = Math.max(this.shake, 12);
      SFX.bossSpawn();
      toast(e.def.name.toUpperCase() + ' ERSCHEINT');
    }
    return e;
  },

  /* ------------------------ Update -------------------------- */
  update(dt) {
    if (this.draft) return;               // Kartenwahl hält alles an
    this.time += dt;
    this.energy = Math.min(this.energyMax, this.energy + this.regen * dt * this.modv('regen', 1));
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
    for (const id in this.cooldowns)
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    if (this.surge > 0) this.surge = Math.max(0, this.surge - dt);
    if (this.shieldFlash > 0) this.shieldFlash = Math.max(0, this.shieldFlash - dt);
    if (this.modeTimer > 0) {                 // Anlauf des Kernmodus
      this.modeTimer = Math.max(0, this.modeTimer - dt);
      if (this.modeTimer === 0) {
        this.coreMode = this.coreModeNext;
        this.recomputeSupply();
        SFX.modeReady();
        toast('Kernmodus: ' + CORE_MODES[this.coreMode].name);
      }
    }
    if (this.shockwave && (this.shockwave.t += dt) > 0.55) this.shockwave = null;
    for (const l of this.lichter) l.life -= dt;
    if (this.lichter.length) this.lichter = this.lichter.filter(l => l.life > 0);
    for (const r of this.risse) r.t += dt;
    if (this.risse.length) this.risse = this.risse.filter(r => r.t < r.life);

    if (this.phase === 'build') {
      this.buildTimer -= dt;
      if (this.buildTimer <= 0) this.startWave();
    } else {
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
        this.spawn(this.spawnQueue.shift());
      }
      if (!this.spawnQueue.length && !this.enemies.length) {
        this.phase = 'build';
        this.buildTimer = BUILD_TIME;
        const sturm = this.modActive();
        // Eine gehaltene Sturmwelle zahlt sich aus
        const praemie = Math.round((30 + this.wave * 6) * (sturm ? 1 + MOD_BONUS : 1));
        this.mod = null;
        this.surge = 0;
        this.matter += praemie + this.buffs.matterPerWave;
        if (this.buffs.coreRepair)
          this.coreHp = Math.min(this.coreHpMax, this.coreHp + this.buffs.coreRepair);
        this.bilanz = this.bilanzZiehen(praemie);
        SFX.waveClear();
        toast('Welle ' + this.wave + ' abgewehrt  +' + praemie + ' Materie');
        this.planNext();
        this.openDraft();
        this.merken();
      }
    }

    for (const e of this.enemies) e.update(dt, this);
    if (this.pendingSpawns.length) {              // Teilung und Brut erst nach dem Durchlauf
      this.enemies.push(...this.pendingSpawns);
      this.pendingSpawns.length = 0;
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    // Solange ein Wächter steht, kommt beim Boss kaum Schaden an
    if (this.boss && !this.boss.dead)
      this.boss.guarded = this.enemies.some(x => x.isGuard && !x.dead);
    else this.boss = null;

    // Drei Sekunden ununterbrochener Schaden am Kern gelten als Deckungslücke
    const was = this.alarm.on;
    this.alarm.on = (this.time - this.alarm.last < 2) && (this.time - this.alarm.since > 3);
    if (this.alarm.on) {
      SFX.alarm();
      if (!was && !this.alarm.seen) {
        this.alarm.seen = true;
        toast('Kern ungedeckt — hier fehlt ein Turm');
      }
    }

    this.beams = this.beams.filter(b => (b.life -= dt) > 0);

    for (const b of this.buildings.values()) {
      if (b.flash > 0) b.flash -= dt;
      // Beschädigte Bauten rauchen, schwer getroffene sprühen Funken
      const hpF = b.hp / b.maxHp;
      if (hpF < .6 && Math.random() < dt * (1 - hpF) * 6) {
        this.particles.push(new Particle(b.px + rand(-6, 6), b.py + rand(-6, 2), '#8493a6',
          { angle: -Math.PI / 2 + rand(-.5, .5), speed: rand(18, 40),
            life: rand(.8, 1.5), size: rand(2.6, 5.4) }));
        if (hpF < .3 && Math.random() < .4)
          this.particles.push(new Particle(b.px + rand(-5, 5), b.py + rand(-5, 5), '#ffa64a',
            { speed: rand(30, 90), life: rand(.2, .45), size: 1.8 }));
      }
      if (this.buffs.repair && b.hp < b.maxHp)
        b.hp = Math.min(b.maxHp, b.hp + this.buffs.repair * dt);
      // Materiekonverter des voll ausgebauten Reaktors
      if (b.type === 'reactor' && b.supplied && b.level >= UPGRADE.maxLevel)
        this.matter += SPECIALS.reactor.matter * dt;
      // Spitzenlast: der ausgebaute Akku wirft seine Ladung nach, einmal je Welle
      if (b.type === 'akku' && b.supplied && b.reserve && this.phase === 'combat' &&
          b.level >= UPGRADE.maxLevel && this.energy < this.energyMax * SPECIALS.akku.at) {
        b.reserve = false;
        const menge = this.capOf(b);
        this.energy = Math.min(this.energyMax, this.energy + menge);
        this.blitz(b.px, b.py, GRID.cell * 2.4, b.def.color, .5);
        for (let i = 0; i < 12; i++)
          this.particles.push(new Particle(b.px, b.py, b.def.color, { speed: rand(60, 190), life: .5 }));
        SFX.reserve();
        toast('Spitzenlast — ' + Math.round(menge) + ' Energie nachgespeist');
      }
    }

    /* Türme feuern in der Reihenfolge ihrer Lastpriorität, und die
       unteren Stufen fassen den Puffer erst über ihrer Schwelle an. */
    const frac = this.energy / this.energyMax;
    const autoOverload = this.buffs.freeOverloadAt && frac >= this.buffs.freeOverloadAt;
    let knapp = false;                          // wollte ein Turm feuern und konnte nicht?
    let flussSumme = 0, flussZahl = 0;
    for (const b of this.turrets()) {
      // Was die Leitung nicht trägt, kommt hier als langsamere Feuerrate an
      const rateMul = b.supplied ? (b.flow === undefined ? 1 : b.flow) : this.buffs.unpoweredRate;
      if (b.supplied) { flussSumme += rateMul; flussZahl++; }
      if (!rateMul) continue;                     // ohne Netz und ohne Inselbetrieb: still
      b.cd -= dt * rateMul;
      if (b.cd > 0) continue;
      if (frac < PRIORITY[b.prio].threshold) {
        // Vorrang und Normal schweigen nur, wenn der Puffer wirklich leer
        // ist — bei Sparlast ist es die eingestellte Absicht, keine Not.
        if (b.prio < 2) knapp = true;
        b.pulse = 0;
        continue;
      }
      let cost = this.energyOf(b);
      let dmg = this.stat(b, 'damage');
      if (autoOverload) {                         // Überladung geschenkt, solange der Puffer voll ist
        if (b.overload) cost /= this.buffs.overloadCost;
        else dmg *= OVERLOAD.damage;
      }
      if (this.surge > 0) {                       // Netzstoß liegt über allem
        dmg *= POWERS.surge.damage;
        cost *= POWERS.surge.cost;
      }
      const target = this.findTarget(b);
      if (!target) { b.scan += dt * 0.5; b.aim = b.scan; continue; }
      if (this.energy < cost) { b.pulse = 0; knapp = true; SFX.lowPower(); continue; }
      this.energy -= cost;
      this.stats.energie += cost;
      b.cd = this.cooldownOf(b);
      b.pulse = 1;
      b.aim = Math.atan2(target.y - b.py, target.x - b.px);
      const pan = panOf(b.px), weit = farOf(b.px, b.py);
      if (b.type === 'cannon') SFX.cannon(pan, weit);
      else if (b.type === 'frost') SFX.frost(pan, weit);
      else SFX.blaster(pan, weit);
      const voll = b.level >= UPGRADE.maxLevel;
      if (b.def.hitscan) {
        this.hurt(target, dmg, 'beam', b);
        if (b.def.slow && !this.modv('noSlow', false))
          target.applySlow(Math.max(0.1, b.def.slow - this.buffs.slowBonus),
                           b.def.slowTime + this.buffs.slowTime, this.time);
        // Vereisung: wer ohnehin kriecht, steht kurz ganz still
        if (voll && b.type === 'frost' && target.slowed && target.freezeCd <= 0) {
          target.frozenUntil = this.time + SPECIALS.frost.freezeTime;
          target.freezeCd = SPECIALS.frost.freezeCd;
        }
        this.beams.push({ x1: b.px, y1: b.py, x2: target.x, y2: target.y, life: .12, color: b.def.color });
      } else {
        const p = this.shoot(b, target, dmg);
        if (voll && b.type === 'cannon') p.burn = dmg * SPECIALS.cannon.burnDps;
        // Zwillingssalve: ein zweites Geschoss auf das nächstbeste Ziel
        if (voll && b.type === 'blaster') {
          const zweit = this.findTarget(b, target);
          if (zweit) this.shoot(b, zweit, dmg);
        }
      }
    }
    if (this.phase === 'combat') {
      if (knapp) this.stats.leer += dt;
      if (flussZahl) {
        this.stats.drossel += (1 - flussSumme / flussZahl) * dt;
        this.stats.zeit += dt;
      }
    }
    for (const b of this.buildings.values()) if (b.pulse > 0) b.pulse -= dt * 4;

    for (const p of this.projectiles) p.update(dt, this);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead);
  },

  // Ein Geschoss auf den Weg bringen — der Magnetsturm bremst es hier ab
  shoot(b, target, dmg) {
    const p = new Projectile(b.px, b.py, target, b.def, dmg, 'proj', b);
    p.speed *= this.modv('projSpeed', 1);
    this.projectiles.push(p);
    return p;
  },

  // Nächstes Netzteil für Saboteure: Pylone zuerst, sonst Reaktoren
  nearestNetPart(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.type !== 'pylon' && b.type !== 'reactor') continue;
      const d = dist(x, y, b.px, b.py) * (b.type === 'pylon' ? 1 : 1.6);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  coreAttackers() {
    const edge = (CORE.half + 0.5) * GRID.cell;
    return this.enemies.filter(e =>
      Math.abs(e.x - CORE_PX.x) < edge + e.radius + 2 &&
      Math.abs(e.y - CORE_PX.y) < edge + e.radius + 2);
  },

  /* ------------------- Sturmwellen ---------------------------
     Ein Modifikator gilt für die ganze Welle. Die Karte „Abschirmung"
     hebt einzelne davon auf — deshalb geht jeder Zugriff durch modv(). */
  modv(key, fallback) {
    const m = this.mod;
    if (!m || m[key] === undefined) return fallback;
    if (this.buffs.modImmune.indexOf(m.id) >= 0) return fallback;
    return m[key];
  },
  modActive() {
    if (!this.mod) return null;
    return this.buffs.modImmune.indexOf(this.mod.id) >= 0 ? null : this.mod;
  },

  /* ------------------- Bilanz nach der Welle -----------------
     Sie soll dem Spieler sein eigenes System erklären, nicht ihn mit
     Zahlen bewerfen: Nur was in dieser Welle tatsächlich passiert ist,
     steht drin. Wer keinen Kernschaden nahm, liest auch keine Null. */
  bilanzZiehen(praemie) {
    let bester = null;
    for (const b of this.buildings.values())
      if (b.def.turret && b.schaden > 0 && (!bester || b.schaden > bester.schaden)) bester = b;
    const s = this.stats;
    return {
      welle: this.wave,
      gegner: s.gegner,
      energie: Math.round(s.energie),
      befehle: Math.round(s.befehle),
      schild: Math.round(s.schild),
      kernSchaden: Math.round(s.kernSchaden),
      verluste: s.verluste,
      materie: Math.round(s.materie) + (praemie || 0),
      leer: Math.round(s.leer * 10) / 10,
      drossel: s.zeit > 0 ? s.drossel / s.zeit : 0,
      bester: bester ? { name: bester.def.name, level: bester.level,
                         schaden: Math.round(bester.schaden) } : null
    };
  },

  /* ------------------- Spielstand ----------------------------
     Gesichert wird nur in der Bauphase. Das ist keine Sparmaßnahme,
     sondern eine Entscheidung: Gegner, Geschosse und Sturmzustand
     mitzuschreiben wäre viel Zustand für wenig Gewinn, und wer mitten
     im Gefecht die Seite schließt, setzt bei derselben Welle wieder an.
     Damit das kein Ausweg wird, zählt für die Bestenliste bestWave —
     die höchste je begonnene Welle, nicht die zuletzt gespielte. */
  merken() {
    if (this.over || this.phase !== 'build' || this.ziehen) return false;
    const plan = this.plannedWave;
    return schreibe(SAVE_KEY, {
      v: SAVE_VERSION,
      // Wer während der Kartenwahl schließt, soll die Karte nicht verlieren.
      // Gesichert wird nur, DASS eine ansteht — die Auswahl wird neu gezogen.
      draft: !!this.draft,
      wave: this.wave, bestWave: this.bestWave,
      matter: Math.round(this.matter), energy: Math.round(this.energy),
      coreHp: Math.round(this.coreHp), coreHpMax: this.coreHpMax,
      buildTimer: Math.round(this.buildTimer * 10) / 10,
      coreMode: this.coreMode,
      buffs: this.buffs,
      karten: [...this.takenCards],
      bauten: [...this.buildings.values()].map(b => ({
        t: b.type, x: b.x, y: b.y, l: b.level, hp: Math.round(b.hp),
        p: b.prio, o: b.overload ? 1 : 0
      })),
      plan: plan ? { queue: plan.queue, angles: plan.angles,
                     mod: plan.mod ? plan.mod.id : null } : null
    });
  },

  // Gibt es einen Stand? Dann heißt der erste Knopf „Fortsetzen".
  gespeicherteRunde() {
    const s = lese(SAVE_KEY);
    return s && s.v === SAVE_VERSION && Array.isArray(s.bauten) ? s : null;
  },

  laden(s) {
    if (!s || s.v !== SAVE_VERSION || !Array.isArray(s.bauten)) return false;
    try {
      // Reihenfolge zählt: Die Karten bestimmen Struktur und Kosten,
      // also müssen die Boni vor den Bauten stehen.
      this.buffs = Object.assign(freshBuffs(), s.buffs || {});
      this.takenCards = new Map(s.karten || []);
      this.coreHpMax = s.coreHpMax || CORE.hp;
      this.coreHp = clamp(s.coreHp, 1, this.coreHpMax);
      this.matter = Math.max(0, s.matter || 0);
      this.wave = Math.max(0, s.wave | 0);
      this.bestWave = Math.max(this.wave, s.bestWave | 0);
      this.coreMode = CORE_MODES[s.coreMode] ? s.coreMode : 0;
      this.coreModeNext = this.coreMode;
      this.modeTimer = 0;
      this.phase = 'build';
      this.buildTimer = s.buildTimer > 0 ? s.buildTimer : BUILD_TIME;

      this.buildings.clear();
      for (const d of s.bauten) {
        if (!BUILDINGS[d.t] || !this.free(d.x, d.y)) continue;
        const b = this.makeBuilding(d.t, d.x, d.y);
        b.level = clamp(d.l | 0, 1, UPGRADE.maxLevel);
        b.maxHp = this.structureOf(b);
        b.hp = clamp(d.hp, 1, b.maxHp);
        b.prio = PRIORITY[d.p] ? d.p : 1;
        b.overload = !!d.o;
      }
      this.recomputeSupply();
      this.energy = clamp(s.energy, 0, this.energyMax);

      // Die angekündigte Welle soll dieselbe bleiben, sonst hätte die
      // Vorschau vor dem Schließen etwas anderes versprochen.
      if (s.plan && Array.isArray(s.plan.queue) && s.plan.queue.length) {
        this.plannedWave = {
          queue: s.plan.queue, angles: s.plan.angles || [],
          mod: MODIFIERS.find(m => m.id === s.plan.mod) || null
        };
        this.incoming = this.plannedWave.angles;
      } else this.planNext();
      if (s.draft) this.openDraft();
      return true;
    } catch (e) { return false; }
  },

  /* ------------------- Bestenliste --------------------------- */
  bestenliste() {
    const l = lese(BEST_KEY);
    return Array.isArray(l) ? l.filter(e => e && typeof e.wave === 'number') : [];
  },

  // Am Ende einer Partie: eintragen, sortieren, kürzen. Zurück kommt
  // die Liste und der Platz des eigenen Laufs (−1, wenn er nicht reicht).
  eintragen() {
    const teile = {};
    for (const b of this.buildings.values()) teile[b.type] = (teile[b.type] || 0) + 1;
    const eintrag = {
      wave: Math.max(this.wave, this.bestWave),
      datum: Date.now(),
      teile,
      karten: [...this.takenCards.values()].reduce((a, b) => a + b, 0)
    };
    const liste = this.bestenliste();
    liste.push(eintrag);
    liste.sort((a, b) => b.wave - a.wave || a.datum - b.datum);
    liste.length = Math.min(liste.length, BEST_MAX);
    schreibe(BEST_KEY, liste);
    return { eintrag, liste, platz: liste.indexOf(eintrag) };
  },

  /* ------------------- Kernmodi ------------------------------
     Der Kern hat eine feste Leistung und verteilt sie. Keine der drei
     Stellungen ist neutral: Jede gibt etwas und nimmt etwas. Während
     des Anlaufs wirkt gar keine — das ist der Preis fürs Umschalten,
     und der Grund, es in der Bauphase zu tun. */
  modeMul(key) {
    if (this.modeTimer > 0) return key === 'regen' ? CORE_SWITCH.regen : 1;
    const v = CORE_MODES[this.coreMode][key];
    if (v === undefined) return 1;
    // Nur der Nachteil lässt sich mildern („Zwitterkern"), nicht der Vorteil
    return v < 1 ? 1 - (1 - v) * this.buffs.modePenalty : v;
  },
  // Der laufende Modus — während des Anlaufs keiner
  activeMode() { return this.modeTimer > 0 ? null : CORE_MODES[this.coreMode]; },
  modeSwitchTime() { return CORE_SWITCH.time * this.buffs.modeSwitch; },
  setMode(i) {
    if (this.over || this.draft) return;
    const m = CORE_MODES[i];
    if (!m) return;
    if (this.modeTimer > 0) { SFX.deny(); return toast('Kern läuft noch an'); }
    if (i === this.coreMode) return;
    this.coreModeNext = i;
    this.modeTimer = this.modeSwitchTime();
    this.recomputeSupply();                   // Anlauf drosselt sofort
    SFX.modeSwitch();
    toast(m.name + ' — ' + (Math.round(this.modeTimer * 10) / 10) + ' s Anlauf');
    updateInspector();
  },
  cycleMode() { this.setMode((this.coreMode + 1) % CORE_MODES.length); },

  /* ------------------- Kernbefehle ---------------------------
     Bezahlt wird aus demselben Puffer, aus dem die Türme schießen.
     Jeder Einsatz ist damit ein Tausch: jetzt viel Wirkung, danach
     ein paar Sekunden dünnes Feuer. */
  powerCost(p) { return this.energyMax * p.drain * this.buffs.powerDrain; },
  powerCd(p) { return p.cd * this.buffs.powerCd; },
  usePower(id) {
    const p = POWERS[id];
    if (!p || this.over || this.draft) return;
    if (this.phase !== 'combat') { SFX.deny(); return toast('Kernbefehle wirken nur im Gefecht'); }
    if (this.cooldowns[id] > 0) {
      SFX.deny();
      return toast(p.name + ' — noch ' + Math.ceil(this.cooldowns[id]) + ' s');
    }
    const kosten = this.powerCost(p);
    if (this.energy < kosten) { SFX.deny(); return toast('Puffer zu leer für ' + p.name); }
    if (id === 'pulse' && ![...this.buildings.values()].some(b => b.hp < b.maxHp)) {
      SFX.deny(); return toast('Alles unbeschädigt');
    }
    this.energy -= kosten;
    this.stats.befehle += kosten;
    this.cooldowns[id] = this.powerCd(p);

    if (id === 'discharge') {
      const dmg = kosten * p.perEnergy;
      const r = p.radius * GRID.cell;
      for (const e of this.enemies.slice()) {
        const d = dist(e.x, e.y, CORE_PX.x, CORE_PX.y);
        if (d > r) continue;
        this.hurt(e, dmg * (1 - 0.55 * d / r), 'beam');   // Energieschaden: Schilde zuerst
      }
      this.shockwave = { t: 0, r };
      this.blitz(CORE_PX.x, CORE_PX.y, r, '#9beeff', .8);
      this.shake = Math.max(this.shake, 11);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * 6.283;
        this.particles.push(new Particle(
          CORE_PX.x + Math.cos(a) * 30, CORE_PX.y + Math.sin(a) * 30,
          '#9beeff', { speed: rand(160, 320), life: .5, size: 2.4, angle: a }));
      }
      SFX.discharge();
      toast('Entladung — ' + Math.round(dmg) + ' Schaden im Umkreis');
    } else if (id === 'surge') {
      this.surge = p.time;
      SFX.surge();
      toast('Netzstoß — ' + p.time + ' s doppelter Schaden');
    } else if (id === 'pulse') {
      let n = 0;
      for (const b of this.buildings.values()) {
        if (b.hp >= b.maxHp) continue;
        if (b.def.needsPower && !b.supplied) continue;   // was kalt ist, wird nicht geheilt
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * p.heal);
        n++;
        for (let i = 0; i < 6; i++)
          this.particles.push(new Particle(b.px, b.py, '#6bff9f', { speed: rand(30, 110), life: .45 }));
      }
      SFX.pulse();
      toast('Notpuls — ' + n + (n === 1 ? ' Bau' : ' Bauten') + ' instandgesetzt');
    }
    updateInspector();
  },

  turrets() {
    if (this.turretsDirty) {
      this._turrets = [...this.buildings.values()].filter(b => b.def.turret);
      this._turrets.sort((a, b) => a.prio - b.prio);
      this.turretsDirty = false;
    }
    return this._turrets;
  },

  toggleOverload(b) {
    if (!b.def.turret) return;
    b.overload = !b.overload;
    this.recomputeSupply();          // dreifacher Verbrauch heißt dreifache Leitungslast
    SFX.select();
    updateInspector();
  },
  cyclePriority(b) {
    b.prio = (b.prio + 1) % PRIORITY.length;
    this.turretsDirty = true;
    SFX.select();
    updateInspector();
  },

  findTarget(b, ausser) {
    const r = this.stat(b, 'range') * GRID.cell;
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (e === ausser) continue;
      const d = dist(e.x, e.y, b.px, b.py);
      if (d > r + e.radius) continue;
      const toCore = dist(e.x, e.y, CORE_PX.x, CORE_PX.y);   // Priorität: am nächsten am Kern
      if (toCore < bestD) { bestD = toCore; best = e; }
    }
    return best;
  }
};

/* =========================== RENDER =========================== */
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (game.shake > 0)
    ctx.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));

  drawGrid();
  ctx.drawImage(spurCanvas, 0, 0);
  ctx.drawImage(netCanvas, 0, 0);
  drawFlow();
  drawSpawnWarnings();
  drawCore();

  for (const b of game.buildings.values()) drawBuilding(b);
  if (game.selected) drawRange(game.selected.px, game.selected.py, game.stat(game.selected, 'range'), '#5fe0ff');
  if (game.alarm.on) drawAlarmBelow();

  drawRisse();
  for (const e of game.enemies) e.draw(ctx);
  if (game.alarm.on) drawAlarmAbove();
  for (const p of game.projectiles) p.draw(ctx);

  for (const b of game.beams) {
    ctx.globalAlpha = b.life / .12;
    ctx.strokeStyle = b.color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const p of game.particles) p.draw(ctx);
  if (game.shockwave) drawShockwave();

  drawLichter();
  drawGhost();
  ctx.restore();
  drawVignette();
}

/* Lichtschicht: alles, was leuchtet, wird additiv über die Szene
   gelegt — Mündungsfeuer hellt dadurch den Boden auf, statt nur auf
   ihm zu liegen. Ein Durchgang, ein Compositing-Wechsel. */
function drawLichter() {
  const c = GRID.cell;
  ctx.globalCompositeOperation = 'lighter';

  const puls = .5 + .5 * Math.sin(game.time * 2);
  licht(CORE_PX.x, CORE_PX.y, c * 3.1, '#5fe0ff', .11 + puls * .05);

  for (const b of game.buildings.values()) {
    if (!b.supplied) continue;
    if (b.type === 'reactor') {
      const fl = .8 + .2 * Math.sin(game.time * 7 + b.x * 2);
      licht(b.px, b.py, c * (1 + b.level * .22), '#ffd166', .09 * fl);
    } else if (b.type === 'akku') {
      const voll = clamp(game.energy / game.energyMax, 0, 1);
      licht(b.px, b.py, c * (.85 + b.level * .12), '#c9a0ff', .03 + voll * .07);
    } else if (b.type === 'pylon') {
      const heiss = b.node && b.node.ratio > 1;
      licht(b.px, b.py, c * 1.05, heiss ? '#ff5d73' : '#5fe0ff',
            heiss ? .13 + .09 * Math.sin(game.time * 9) : .06);
    } else if (b.def.turret && b.pulse > .35) {
      // Mündungsfeuer wirft Licht nach vorn
      const f = (b.pulse - .35) / .65;
      const d = c * .9;
      licht(b.px + Math.cos(b.aim) * d, b.py + Math.sin(b.aim) * d,
            c * (b.type === 'cannon' ? 2.1 : 1.35), '#fff3d0', f * .3);
    }
  }
  for (const p of game.projectiles)
    licht(p.x, p.y, c * .6, p.def.color, .18);
  for (const b of game.beams)
    licht(b.x2, b.y2, c * .9, b.color, (b.life / .12) * .22);
  for (const e of game.enemies)
    if (e.burnUntil > game.time)
      licht(e.x, e.y, c * .9, '#ff8a3c', .11 + .08 * Math.random());
  for (const l of game.lichter)
    licht(l.x, l.y, l.r * (1.3 - .3 * (l.life / l.max)), l.hex, (l.life / l.max) * .5);
  for (const r of game.risse) {
    const f = Math.sin((r.t / r.life) * Math.PI);
    licht(r.x, r.y, c * 1.5 * r.gross * f, '#ff7d9c', f * .4);
  }
  if (game.surge > 0)
    for (const b of game.turrets())
      if (b.supplied) licht(b.px, b.py, c * 1.05, '#9beeff', .08 + .04 * Math.sin(game.time * 12));

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/* Risse: ein Schlitz, der aufgeht, den Gegner ausspuckt und zufällt */
function drawRisse() {
  for (const r of game.risse) {
    const f = r.t / r.life;
    const auf = Math.sin(f * Math.PI);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.a);
    const h = GRID.cell * (.55 + 1.15 * auf) * r.gross;
    const w = GRID.cell * .14 * auf * r.gross;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,110,150,' + (.4 * auf).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 2.6, h, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,232,240,' + (.9 * auf).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(.6, w), h * .9, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/* Vignette: dunkle Ränder, die mit der Wellennummer zunehmen, und ein
   roter Puls, solange der Kern getroffen wird. Zwei fertige Bilder,
   damit nicht jedes Bild ein Verlauf über die volle Fläche entsteht. */
const vignetten = {};
function vignette(hex) {
  let c = vignetten[hex];
  if (c) return c;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const n = parseInt(hex.slice(1), 16);
  const rgb = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255);
  const rg = g.createRadialGradient(W / 2, H / 2, H * .32, W / 2, H / 2, W * .68);
  rg.addColorStop(0, 'rgba(' + rgb + ',0)');
  rg.addColorStop(.65, 'rgba(' + rgb + ',.35)');
  rg.addColorStop(1, 'rgba(' + rgb + ',1)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  vignetten[hex] = c;
  return c;
}
function drawVignette() {
  const dunkel = Math.min(.5, .16 + game.wave * .008);
  ctx.globalAlpha = dunkel;
  ctx.drawImage(vignette('#02040a'), 0, 0);
  const not = game.alarm.on ? .18 + .12 * Math.sin(game.time * 6)
            : Math.max(0, .45 - game.coreHp / game.coreHpMax) * .5;
  if (not > .01) {
    ctx.globalAlpha = not;
    ctx.drawImage(vignette('#7a0d20'), 0, 0);
  }
  ctx.globalAlpha = 1;
}

/* Energie, die sichtbar fließt: Pulse wandern vom Kern nach außen,
   Tempo und Farbe hängen an der Auslastung der Leitung. */
function drawFlow() {
  const t = game.time;
  for (const s of game.sources) {
    if (!s.parent) continue;
    const r = s.ratio || 0;
    if (r < 0.02) continue;
    const x1 = cellToPx(s.parent.x), y1 = cellToPx(s.parent.y);
    const x2 = cellToPx(s.x), y2 = cellToPx(s.y);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / 30));
    const tempo = 0.22 + Math.min(1.2, r) * 0.38;
    ctx.fillStyle = r > 1 ? '#ff8d9c' : (r > FLOW.warn ? '#ffc27a' : '#9beeff');
    for (let i = 0; i < n; i++) {
      const f = (t * tempo + i / n) % 1;
      ctx.globalAlpha = 0.22 + 0.5 * Math.sin(f * Math.PI);
      ctx.beginPath();
      ctx.arc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, 2, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* Die Druckwelle der Entladung */
function drawShockwave() {
  const w = game.shockwave, f = w.t / 0.55;
  ctx.strokeStyle = '#9beeff';
  ctx.globalAlpha = (1 - f) * 0.9;
  ctx.lineWidth = 6 * (1 - f) + 1;
  ctx.beginPath(); ctx.arc(CORE_PX.x, CORE_PX.y, w.r * f, 0, 7); ctx.stroke();
  ctx.globalAlpha = (1 - f) * 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CORE_PX.x, CORE_PX.y, w.r * f * 0.72, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
}

/* Alarm, Teil 1: zeigt, wo die Deckung endet — alle Turmreichweiten
   schwach eingeblendet, dazu ein Warnring um den Kern. */
function drawAlarmBelow() {
  const puls = 0.5 + 0.5 * Math.sin(game.time * 6);

  ctx.strokeStyle = 'rgba(255,93,115,.30)';
  ctx.lineWidth = 1;
  for (const b of game.turrets()) {
    if (!b.supplied && !game.buffs.unpoweredRate) continue;
    ctx.beginPath();
    ctx.arc(b.px, b.py, game.stat(b, 'range') * GRID.cell, 0, 7);
    ctx.stroke();
  }

  const r = (CORE.half + 0.5) * GRID.cell + 6;
  ctx.strokeStyle = '#ff5d73';
  ctx.globalAlpha = 0.35 + 0.45 * puls;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(CORE_PX.x, CORE_PX.y, r + puls * 5, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
}

/* Alarm, Teil 2: markiert jeden Gegner, der gerade am Kern steht. */
function drawAlarmAbove() {
  const puls = 0.5 + 0.5 * Math.sin(game.time * 6);
  for (const e of game.coreAttackers()) {
    const r = e.radius + 8 + puls * 3;
    ctx.strokeStyle = '#ff5d73';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + 0.45 * puls;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) {           // Fadenkreuz-Striche
      const a = i * Math.PI / 2 + game.time * 0.8;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
      ctx.lineTo(e.x + Math.cos(a) * (r + 6), e.y + Math.sin(a) * (r + 6));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(90,140,200,.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= GRID.cols; x++) { ctx.moveTo(x * GRID.cell, 0); ctx.lineTo(x * GRID.cell, H); }
  for (let y = 0; y <= GRID.rows; y++) { ctx.moveTo(0, y * GRID.cell); ctx.lineTo(W, y * GRID.cell); }
  ctx.stroke();
}

function drawCore() {
  const t = game.time;
  const r = (CORE.half + .5) * GRID.cell;
  ctx.save();
  ctx.translate(CORE_PX.x, CORE_PX.y);

  const hpFrac = game.coreHp / game.coreHpMax;
  const glow = 0.5 + 0.5 * Math.sin(t * 2);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 3.2);
  g.addColorStop(0, `rgba(95,224,255,${.5 + glow * .2})`);
  g.addColorStop(1, 'rgba(95,224,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * 3.2, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Schildmodus: ein Ring, dessen Dichte am Puffer hängt
  const modus = game.activeMode();
  if (modus && modus.absorb) {
    // Unter der Untergrenze fängt der Schild nichts mehr — dann verblasst er
    const rest = clamp((game.energy / game.energyMax - (modus.floor || 0)) /
                       Math.max(0.01, 1 - (modus.floor || 0)), 0, 1);
    const laden = rest;
    ctx.strokeStyle = '#8fa6ff';
    ctx.globalAlpha = .18 + laden * .3 + game.shieldFlash;
    ctx.lineWidth = 2 + game.shieldFlash * 6;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.28, 0, 7); ctx.stroke();
    ctx.globalAlpha = .1 + laden * .12;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.42, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Anlauf: ein Bogen, der sich schließt
  if (game.modeTimer > 0) {
    const f = 1 - game.modeTimer / game.modeSwitchTime();
    ctx.strokeStyle = CORE_MODES[game.coreModeNext].color;
    ctx.globalAlpha = .8;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.28, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.rotate(t * .35);
  ctx.strokeStyle = 'rgba(95,224,255,.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-r * .82, -r * .82, r * 1.64, r * 1.64);
  ctx.rotate(-t * .8);
  ctx.strokeStyle = 'rgba(255,209,102,.55)';
  ctx.beginPath(); ctx.arc(0, 0, r * .62, .4, 2.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * .62, .4 + Math.PI, 2.6 + Math.PI); ctx.stroke();
  ctx.rotate(t * .45);

  const cr = r * .38 * (0.9 + glow * .12);
  ctx.fillStyle = hpFrac > .35 ? '#5fe0ff' : '#ff6b6b';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(0, 0, cr, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, cr * .45, 0, 7); ctx.fill();
  ctx.restore();
}

function drawBuilding(b) {
  const c = GRID.cell, x = b.px, y = b.py, s = c * .40;
  // Aufbau läuft nach der Uhr, nicht nach der Spielzeit — sonst bliebe ein
  // Gebäude unsichtbar, das kurz vor einer Pause gesetzt wurde.
  const grow = Math.min(1, (performance.now() - b.bornAt) / 340);
  const kalt = !b.supplied && b.def.needsPower;
  const hpF = b.hp / b.maxHp;

  ctx.save();
  ctx.translate(x, y);
  if (grow < 1) {
    ctx.globalAlpha = grow;
    ctx.scale(.55 + .45 * grow, .55 + .45 * grow);
  }
  if (kalt) ctx.globalAlpha *= .55 + .25 * Math.sin(game.time * 6);

  // Bodenplatte für alle Bauten außer der Barriere
  if (b.type !== 'wall') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, s * .45, s * 1.05, s * .6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(26,40,62,.96)';
    ctx.strokeStyle = 'rgba(140,200,255,.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, s * .96, 0, 7); ctx.fill(); ctx.stroke();
  }

  const body = b.flash > 0 ? '#fff' : 'rgba(22,34,54,.98)';

  if (b.type === 'wall')        drawWall(b, s, hpF);
  else if (b.type === 'pylon')  drawPylon(b, s, body);
  else if (b.type === 'reactor') drawReactor(b, s, body);
  else if (b.type === 'akku')   drawAkku(b, s, body);
  else                          drawTurret(b, s, body);

  if (hpF < .72) drawSchaden(b, s, hpF);

  // Ausbaustufe als Kerben, die letzte Stufe als Ring um den Sockel
  if (b.level >= UPGRADE.maxLevel) {
    ctx.strokeStyle = 'rgba(255,209,102,' + (.55 + .35 * Math.sin(game.time * 3 + b.x)).toFixed(2) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, s * 1.12, 0, 7); ctx.stroke();
  } else if (b.level > 1) {
    ctx.fillStyle = '#ffd166';
    const n = b.level - 1;
    for (let i = 0; i < n; i++)
      ctx.fillRect(-(n * 5 - 2) / 2 + i * 5, s + 2, 3, 3);
  }
  ctx.restore();

  if (b.overload) {                              // pulsierender Ring
    ctx.strokeStyle = '#ff9f5a';
    ctx.globalAlpha = .45 + .4 * Math.sin(game.time * 8);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, s + 4, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (b.def.turret && b.prio !== 1) {            // abweichende Lastpriorität
    ctx.fillStyle = PRIORITY[b.prio].color;
    ctx.font = '600 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(PRIORITY[b.prio].short, x + c * .34, y - c * .28);
    ctx.textAlign = 'left';
  }
  if (b.hp < b.maxHp) {
    const w = c * .8;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y - c * .5 + 2, w, 3);
    ctx.fillStyle = hpF > .35 ? '#6bff9f' : '#ffb04a';
    ctx.fillRect(x - w / 2, y - c * .5 + 2, w * hpF, 3);
  }
}

/* Schadensbild. Ein Sprung auf dunklem Körper wäre unsichtbar, wenn er
   nur dunkel wäre — deshalb bekommt jeder Riss eine dunkle Kerbe UND eine
   glühende Kante, die mit dem Schaden heller wird. Der Verlauf liegt fest,
   abgeleitet aus der Position: ein zitterndes Rissbild wäre unruhig. */
function drawSchaden(b, s, hpF) {
  const schwer = 1 - hpF;
  let seed = (b.x * 73856093 ^ b.y * 19349663) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = hpF < .35 ? 5 : (hpF < .55 ? 3 : 2);
  const risse = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, len = s * (.5 + rnd() * .72), k = (rnd() - .5) * .95;
    risse.push([
      Math.cos(a) * s * .16, Math.sin(a) * s * .16,
      Math.cos(a + k * .4) * len * .58, Math.sin(a + k * .4) * len * .58,
      Math.cos(a + k) * len, Math.sin(a + k) * len
    ]);
  }
  const zeichne = () => {
    for (const r of risse) {
      ctx.beginPath();
      ctx.moveTo(r[0], r[1]); ctx.lineTo(r[2], r[3]); ctx.lineTo(r[4], r[5]);
      ctx.stroke();
    }
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.lineWidth = 2.4;
  zeichne();
  ctx.strokeStyle = 'rgba(255,158,96,' + (.22 + .6 * schwer).toFixed(2) + ')';
  ctx.lineWidth = .9;
  zeichne();
  ctx.lineCap = 'butt';

  // Unter 40 % glimmt es an einer Bruchstelle
  if (hpF < .4) {
    const fl = .35 + .45 * Math.abs(Math.sin(game.time * 5 + b.x * 1.7));
    ctx.fillStyle = 'rgba(255,120,50,' + fl.toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(risse[0][4] * .8, risse[0][5] * .8, 1.9 + fl, 0, 7);
    ctx.fill();
  }
}

/* Türme: Sockel, drehbarer Turmkopf, Rückstoß und Mündungsfeuer */
function drawTurret(b, s, body) {
  const kick = Math.max(0, b.pulse) * (b.type === 'cannon' ? 5 : 3);
  ctx.fillStyle = body;
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 1.8;

  ctx.save();
  ctx.rotate(b.aim || -Math.PI / 2);
  ctx.translate(-kick, 0);

  const col = b.def.color;
  if (b.type === 'cannon') {
    ctx.fillStyle = 'rgba(10,16,28,.98)';
    ctx.fillRect(2, -5.5, s * 1.15, 11);          // Rohr
    ctx.strokeRect(2, -5.5, s * 1.15, 11);
    ctx.fillStyle = col;
    ctx.fillRect(s * .95, -6.5, 5, 13);           // Mündungsbremse
    ctx.fillRect(s * .55, -7, 3, 14);
  } else if (b.type === 'frost') {
    ctx.fillStyle = 'rgba(10,16,28,.98)';
    ctx.fillRect(2, -3, s * .95, 6);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.strokeRect(2, -3, s * .95, 6);
    ctx.fillStyle = col;                          // Emitterkopf
    ctx.beginPath(); ctx.arc(s * 1.05, 0, 3.4, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(180,220,255,.5)';     // Kühlring
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(s * 1.05, 0, 5.5 + Math.sin(game.time * 4) * .8, 0, 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(10,16,28,.98)';         // Doppellauf
    ctx.fillRect(2, -4.4, s * 1.1, 3.4);
    ctx.fillRect(2, 1, s * 1.1, 3.4);
    ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.strokeRect(2, -4.4, s * 1.1, 3.4);
    ctx.strokeRect(2, 1, s * 1.1, 3.4);
  }

  // Turmkopf über den Rohren
  ctx.fillStyle = body;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, s * .62, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, 0, s * .22, 0, 7); ctx.fill();

  // Mündungsfeuer, solange der Schuss frisch ist
  if (b.pulse > .45) {
    const f = (b.pulse - .45) / .55;
    const mx = b.type === 'cannon' ? s * 1.35 : (b.type === 'frost' ? s * 1.2 : s * 1.25);
    const size = (b.type === 'cannon' ? 9 : 5.5) * f;
    ctx.globalAlpha = f;
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.moveTo(mx + size * 1.8, 0);
    ctx.lineTo(mx, size); ctx.lineTo(mx - size * .5, 0); ctx.lineTo(mx, -size);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = b.def.color;
    ctx.beginPath(); ctx.arc(mx, 0, size * .7, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* Pylon: Mast mit Isolatoren und einem Lichtbogen im Kopf */
function drawPylon(b, s, body) {
  ctx.fillStyle = body;
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * .8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * .8, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.strokeStyle = 'rgba(95,224,255,.5)';
  ctx.lineWidth = 1;
  for (const sgn of [1, -1]) {                   // Isolatorarme
    ctx.beginPath();
    ctx.moveTo(sgn * s * .45, -s * .3);
    ctx.lineTo(sgn * s * .72, -s * .55);
    ctx.stroke();
  }

  const p = .5 + .5 * Math.sin(game.time * 3 + b.x);
  ctx.fillStyle = b.def.color;
  ctx.globalAlpha = .55 + .45 * p;
  ctx.beginPath(); ctx.arc(0, 0, 2.6 + p * 1.2, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  if (b.supplied) {                              // zuckender Lichtbogen
    ctx.strokeStyle = 'rgba(190,240,255,.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-s * .5, -s * .1);
    for (let i = 1; i <= 3; i++)
      ctx.lineTo(-s * .5 + i * s * .33, Math.sin(game.time * 22 + i * 2 + b.y) * 2.2 - s * .1);
    ctx.stroke();
  }
}

/* Reaktor: Gehäuse, drehende Speichen, atmender Kern */
function drawReactor(b, s, body) {
  ctx.fillStyle = body;
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.stroke();

  ctx.save();
  ctx.rotate(game.time * (b.supplied ? 1.9 : .25));
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI * 2 / 3);
    ctx.beginPath(); ctx.moveTo(0, -s * .25); ctx.lineTo(0, -s * .78); ctx.stroke();
  }
  ctx.restore();

  const glow = .45 + .35 * Math.sin(game.time * 4 + b.x);
  ctx.fillStyle = 'rgba(255,209,102,' + glow.toFixed(2) + ')';
  ctx.beginPath(); ctx.arc(0, 0, s * .34, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff8e2';
  ctx.beginPath(); ctx.arc(0, 0, s * .14, 0, 7); ctx.fill();
}

/* Akku: eine Zelle, deren Füllstand am Puffer hängt. Ist die Spitzenlast
   scharf, sitzt ein Punkt auf dem Pol — nach dem Auslösen ist er weg. */
function drawAkku(b, s, body) {
  const w = s * 1.28, h = s * 1.7;
  ctx.fillStyle = body;
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
  // Pol
  ctx.fillStyle = b.def.color;
  ctx.fillRect(-s * .26, -h / 2 - s * .22, s * .52, s * .22);

  const voll = b.supplied ? clamp(game.energy / game.energyMax, 0, 1) : 0;
  const fh = (h - 4) * voll;
  ctx.fillStyle = 'rgba(201,160,255,' + (.35 + .3 * voll).toFixed(2) + ')';
  ctx.fillRect(-w / 2 + 2, h / 2 - 2 - fh, w - 4, fh);
  // Füllstandsstriche
  ctx.strokeStyle = 'rgba(10,16,28,.6)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const y = -h / 2 + (h / 3) * i;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 2, y); ctx.lineTo(w / 2 - 2, y); ctx.stroke();
  }
  if (b.level >= UPGRADE.maxLevel && b.reserve) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -h / 2 - s * .34, s * .16, 0, 7); ctx.fill();
  }
}

/* Barriere: Blockwerk mit Nieten, das bei Schaden reißt */
function drawWall(b, s, hpF) {
  ctx.fillStyle = b.flash > 0 ? '#fff' : 'rgba(42,50,64,.98)';
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.strokeStyle = b.def.color;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-s, -s, s * 2, s * 2);

  ctx.strokeStyle = 'rgba(255,255,255,.10)';     // Fugen
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
  ctx.moveTo(0, -s); ctx.lineTo(0, 0);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.16)';       // Nieten
  for (const nx of [-s * .62, s * .62])
    for (const ny of [-s * .62, s * .62])
      ctx.fillRect(nx - 1.3, ny - 1.3, 2.6, 2.6);

  if (hpF < .65) {                               // Risse, festes Muster je Feld
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1.2;
    const seed = (b.x * 7 + b.y * 13) % 4;
    const risse = hpF < .3 ? 3 : 1;
    for (let i = 0; i <= risse; i++) {
      const a = (seed + i) * 1.7;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
      ctx.lineTo(Math.cos(a) * s * .25 + 2, Math.sin(a) * s * .25 - 2);
      ctx.lineTo(-Math.cos(a) * s * .55, -Math.sin(a) * s * .55);
      ctx.stroke();
    }
  }
}

function drawRange(x, y, cells, color) {
  if (!cells) return;
  ctx.strokeStyle = color; ctx.globalAlpha = .35;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.arc(x, y, cells * GRID.cell, 0, 7); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

function drawGhost() {
  if (!game.tool || !game.hover.inside) return;
  const def = BUILDINGS[game.tool];
  const { x, y } = game.hover;
  const px = cellToPx(x), py = cellToPx(y);
  const ok = game.free(x, y) && game.matter >= def.cost;
  const powered = !def.needsPower ||
    (game.sources || []).some(s => dist(x, y, s.x, s.y) <= s.r);

  ctx.globalAlpha = .55;
  ctx.fillStyle = ok ? (powered ? 'rgba(95,224,255,.25)' : 'rgba(255,160,60,.25)') : 'rgba(255,70,90,.3)';
  ctx.fillRect(x * GRID.cell, y * GRID.cell, GRID.cell, GRID.cell);
  ctx.strokeStyle = ok ? (powered ? '#5fe0ff' : '#ffa14a') : '#ff5d73';
  ctx.lineWidth = 2;
  ctx.strokeRect(x * GRID.cell + 1, y * GRID.cell + 1, GRID.cell - 2, GRID.cell - 2);
  ctx.globalAlpha = 1;

  if (def.range) drawRange(px, py, def.range, def.color);
  if (def.supply) drawRange(px, py, def.supply, '#5fe0ff');
  if (!powered && def.needsPower) {
    ctx.fillStyle = '#ffa14a'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('kein Netz', px, py - GRID.cell * .8);
    ctx.textAlign = 'left';
  }
}

function drawSpawnWarnings() {
  if (game.phase !== 'build' || !game.incoming.length) return;
  const a0 = .35 + .3 * Math.sin(game.time * 5);
  for (const a of game.incoming) {
    const p = edgePoint(a, -22);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a + Math.PI);
    ctx.globalAlpha = a0;
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ============================= UI ============================= */
const el = id => document.getElementById(id);
const shopEl = el('shop');

/* Die Taskleiste ist einzeilig, deshalb steht auf den Flächen nur das
   Nötigste: Taste, Farbe, Name, Preis. Die Beschreibung hängt im
   title-Text, die Werte stehen im Inspektor, sobald etwas gebaut ist. */
function buildShop() {
  shopEl.innerHTML = '';
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const d = document.createElement('div');
    d.className = 'card';
    d.dataset.type = type;
    d.title = def.name + ' — ' + def.desc + '  (Taste ' + def.key + ')';
    // Die Bauteilfarbe sitzt als schmaler Balken am linken Rand der Fläche.
    // Er kostet drei Pixel Breite statt der vierzehn eines Farbpunkts und
    // ist besser zu lesen als eingefärbte Schrift.
    d.style.setProperty('--farbe', def.color);
    d.innerHTML =
      `<span class="k">${def.key}</span>
       <span class="n">${def.name}</span>
       <span class="c">${def.cost}</span>`;
    d.onclick = () => selectTool(type);
    shopEl.appendChild(d);
  }
}

function buildPowers() {
  const box = el('powers');
  box.innerHTML = '';
  for (const p of POWER_LIST) {
    const d = document.createElement('button');
    d.className = 'power';
    d.dataset.id = p.id;
    d.title = 'Kernbefehl ' + p.name + ' — ' + p.desc +
              '  (Taste ' + p.key.toUpperCase() + ', die Zahl ist der Puffer-Anteil in Energie)';
    d.innerHTML = `<span class="pk">${p.key.toUpperCase()}</span>
                   <span class="pn">${p.name}</span><span class="pc"></span>
                   <i class="pcd"></i>`;
    d.dataset.name = p.name;
    d.onclick = () => game.usePower(p.id);
    box.appendChild(d);
  }
}

function buildModes() {
  const box = el('modes');
  box.innerHTML = '';
  CORE_MODES.forEach((m, i) => {
    const d = document.createElement('button');
    d.className = 'mode';
    d.dataset.i = i;
    d.title = 'Kernmodus ' + m.name + ' — ' + m.desc +
              '  (Taste K wechselt weiter, ' +
              (Math.round(CORE_SWITCH.time * 10) / 10) + ' s Anlauf)';
    d.innerHTML = `<span class="mk">${m.short}</span>
                   <span class="mn"></span><span class="mh"></span>
                   <i class="mcd"></i>`;
    d.onclick = () => game.setMode(i);
    box.appendChild(d);
  });
}

/* Nur der laufende Modus zeigt Namen und Preis — die anderen bleiben
   Kürzel. So bleibt die Leiste schmal, ohne die Wahl zu verstecken. */
function updateModes() {
  const laeuft = game.modeTimer > 0;
  for (const d of el('modes').children) {
    const i = +d.dataset.i, m = CORE_MODES[i];
    const zielt = laeuft && i === game.coreModeNext;
    const an = !laeuft && i === game.coreMode;
    d.classList.toggle('on', an);
    d.classList.toggle('warm', zielt);
    d.querySelector('.mcd').style.width =
      zielt ? ((1 - game.modeTimer / game.modeSwitchTime()) * 100) + '%' : '0';
    const name = an || zielt ? m.name : '';
    // Was der Modus kostet und bringt, steht im title — in der Leiste
    // stünde es nur im Weg. Sichtbar bleibt der Anlauf, der drängt.
    const hinweis = zielt ? (Math.ceil(game.modeTimer * 10) / 10).toFixed(1) + ' s' : '';
    const nEl = d.querySelector('.mn'), hEl = d.querySelector('.mh');
    if (nEl.textContent !== name) nEl.textContent = name;
    if (hEl.textContent !== hinweis) hEl.textContent = hinweis;
  }
}

function updatePowers() {
  for (const d of el('powers').children) {
    const p = POWERS[d.dataset.id];
    const rest = game.cooldowns[p.id];
    const kosten = Math.round(game.powerCost(p));
    const bereit = rest <= 0 && game.phase === 'combat';
    const reicht = game.energy >= kosten;
    d.classList.toggle('ready', bereit && reicht);
    d.classList.toggle('poor', bereit && !reicht);
    d.classList.toggle('active', p.id === 'surge' && game.surge > 0);
    d.classList.toggle('cooling', rest > 0);
    // In der schmalen Leiste steht nur die Abklingzeit; was der Befehl aus
    // dem Puffer nimmt, sagt der title — der Puffer selbst steht oben.
    const txt = rest > 0 ? Math.ceil(rest) + ' s' : '';
    const line = d.querySelector('.pc');
    if (line.textContent !== txt) line.textContent = txt;
    // Der Schleier läuft von links nach rechts weg
    d.querySelector('.pcd').style.width =
      (rest > 0 ? (rest / game.powerCd(p) * 100) : 0) + '%';
  }
}

function selectTool(type) {
  game.tool = game.tool === type ? null : type;
  game.select(null);
  for (const c of shopEl.children) c.classList.toggle('active', c.dataset.type === game.tool);
}

function updateShopAffordability() {
  for (const c of shopEl.children) {
    const cost = game.costOf(c.dataset.type);
    c.classList.toggle('poor', game.matter < cost);
    const line = c.querySelector('.c');
    const txt = String(cost);
    if (line.textContent !== txt) line.textContent = txt;
  }
}

function updateInspector() {
  const box = el('inspector'), b = game.selected;
  if (!b) { box.hidden = true; return; }
  box.hidden = false;
  el('insName').textContent = b.def.name;
  el('insLevel').textContent = 'Stufe ' + b.level + '/' + UPGRADE.maxLevel;
  const rows = [['Struktur', Math.ceil(b.hp) + '/' + b.maxHp]];
  if (b.def.turret) {
    rows.push(['Schaden', Math.round(game.stat(b, 'damage') * 10) / 10]);
    rows.push(['Reichweite', (Math.round(game.stat(b, 'range') * 10) / 10) + ' Z']);
    rows.push(['Energie/Schuss', Math.round(game.energyOf(b) * 10) / 10]);
    rows.push(['Schuss alle', (Math.round(game.cooldownOf(b) * 100) / 100) + ' s']);
    rows.push(['Lastpriorität', PRIORITY[b.prio].name]);
    if (b.boost > 1) rows.push(['Verstärkerfeld', '+' + Math.round((b.boost - 1) * 100) + ' %']);
  }
  if (b.def.turret && b.supplied && b.flow < 0.995)
    rows.push(['Netzdrossel', '−' + Math.round((1 - b.flow) * 100) + ' %']);
  if (b.def.regen) rows.push(['Ertrag', '+' + b.def.regen * b.level + '/s']);
  if (b.def.capacity) {
    rows.push(['Speicher', '+' + Math.round(game.capOf(b))]);
    rows.push(['Trägt mit', '+' + akkuFlow(b) + '/s']);
    if (b.level >= UPGRADE.maxLevel)
      rows.push(['Spitzenlast', b.reserve ? 'geladen' : 'verbraucht']);
  }
  if (b.def.supply) rows.push(['Netzradius', b.def.supply + ' Z']);
  // Am Pylon hängt die eigene Leitung, an allem anderen die des Knotens davor
  if (b.type === 'pylon' && b.supplied && b.node)
    rows.push(['Leitungslast', (Math.round(Math.max(0, b.node.through) * 10) / 10) +
                               ' / ' + Math.round(b.node.cap) + '/s']);
  rows.push(['Strom', b.def.needsPower ? (b.supplied ? 'verbunden' : 'GETRENNT') : '—']);
  el('insStats').innerHTML = rows.map(r => `<span>${r[0]}</span><span>${r[1]}</span>`).join('');
  const voll = b.level >= UPGRADE.maxLevel;
  el('upgradeBtn').textContent = voll ? 'Ausgebaut' : 'Ausbau ' + game.upgradeCost(b);
  el('upgradeBtn').disabled = voll;
  el('sellBtn').textContent = 'Abbau +' + Math.round(game.buildingValue(b) * game.buffs.refund);

  const rb = el('repairBtn');
  const heil = b.hp >= b.maxHp;
  rb.textContent = heil ? 'Instand' : 'Reparieren ' + game.repairCost(b);
  rb.disabled = heil;

  // Stufe 5 schaltet die Sonderfähigkeit frei, Stufe 4 zeigt sie schon an
  const sp = SPECIALS[b.type], spBox = el('insSpecial');
  if (sp && b.level >= UPGRADE.maxLevel - 1) {
    spBox.hidden = false;
    spBox.classList.toggle('locked', !voll);
    spBox.innerHTML = '<b>' + (voll ? sp.name : 'Stufe 5: ' + sp.name) + '</b>' + sp.desc;
  } else spBox.hidden = true;

  const turretBox = el('insTurret');
  turretBox.hidden = !b.def.turret;
  if (b.def.turret) {
    el('prioBtn').textContent = 'Last: ' + PRIORITY[b.prio].name;
    el('overloadBtn').textContent = b.overload ? 'Überladung an' : 'Überladung';
    el('overloadBtn').classList.toggle('on', !!b.overload);
    el('overloadBtn').title = 'Doppelter Schaden, ' + game.buffs.overloadCost + '-facher Verbrauch (O)';
  }
}

/* Bilanz der eben gehaltenen Welle. Aufgenommen wird nur, was passiert
   ist: Wer keinen Bau verlor, liest dazu auch keine Null. */
function bilanzHtml(b) {
  if (!b) return '';
  const teile = [];
  const zeig = (wert, text, art) =>
    teile.push('<div' + (art ? ' class="' + art + '"' : '') +
               '><b>' + wert + '</b><span>' + text + '</span></div>');

  zeig(b.gegner, 'Gegner');
  zeig(b.energie, 'Energie verschossen');
  if (b.befehle) zeig(b.befehle, 'für Kernbefehle');
  zeig('+' + b.materie, 'Materie', 'gut');
  if (b.kernSchaden) zeig(b.kernSchaden, 'Kernschaden', 'schlecht');
  if (b.schild) zeig(b.schild, 'Energie als Schild');
  if (b.verluste) zeig(b.verluste, b.verluste === 1 ? 'Bau verloren' : 'Bauten verloren', 'schlecht');
  if (b.leer >= 0.3)
    zeig((Math.round(b.leer * 10) / 10).toFixed(1).replace('.', ',') + ' s', 'Puffer leer', 'schlecht');
  if (b.drossel > 0.02) zeig(Math.round(b.drossel * 100) + ' %', 'Netzdrossel', 'schlecht');
  if (b.bester)
    zeig(b.bester.schaden, 'Schaden · ' + b.bester.name + ' Stufe ' + b.bester.level);
  return teile.join('');
}

/* ---------------- Kartenwahl ---------------- */
function showDraft(cards) {
  el('draftWave').textContent = game.wave;
  el('draftStats').innerHTML = bilanzHtml(game.bilanz);
  const box = el('draftCards');
  box.innerHTML = '';
  cards.forEach((c, i) => {
    const have = game.takenCards.get(c.id) || 0;
    const d = document.createElement('div');
    d.className = 'draft-card';
    d.innerHTML = `<span class="num">${i + 1}</span><h3>${c.name}</h3><p>${c.desc}</p>` +
      (have ? `<span class="have">bereits ${have}×</span>` : '');
    d.onclick = () => game.takeCard(i);
    box.appendChild(d);
  });
  el('draft').hidden = false;
}
function hideDraft() { el('draft').hidden = true; }

let toastTimer = 0;
function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

function showOverlay(title, text, html) {
  el('ovTitle').textContent = title;
  el('ovText').textContent = text;
  const liste = el('ovList');
  liste.hidden = !html;
  liste.innerHTML = html || '';
  el('overlay').hidden = false;
}

/* Bestenliste als Tabelle. „Benutzte Bauteile" sind die drei häufigsten —
   mehr sagt in einer Zeile nichts mehr, weniger sagt nichts über den Aufbau. */
const TEIL_NAMEN = {
  pylon:   ['Pylon', 'Pylone'],
  reactor: ['Reaktor', 'Reaktoren'],
  akku:    ['Akku', 'Akkus'],
  blaster: ['Blaster', 'Blaster'],
  cannon:  ['Kanone', 'Kanonen'],
  frost:   ['Frostturm', 'Frosttürme'],
  wall:    ['Barriere', 'Barrieren']
};
function teilName(typ, n) {
  const w = TEIL_NAMEN[typ];
  return w ? w[n === 1 ? 0 : 1] : typ;
}
function bestenlisteHtml(liste, markiert) {
  if (!liste || !liste.length) return '';
  const zeilen = liste.map((e, i) => {
    const teile = e.teile || {};
    const top = Object.keys(teile).sort((a, b) => teile[b] - teile[a]).slice(0, 3)
      .map(t => teile[t] + ' ' + teilName(t, teile[t])).join(', ');
    const d = new Date(e.datum || 0);
    const datum = String(d.getDate()).padStart(2, '0') + '.' +
                  String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    return '<tr' + (e === markiert ? ' class="neu"' : '') + '>' +
           '<td>' + (i + 1) + '</td><td>Welle ' + e.wave + '</td>' +
           '<td>' + datum + '</td><td>' + top + '</td></tr>';
  }).join('');
  return '<table><tbody>' + zeilen + '</tbody></table>';
}

function updateHud() {
  el('matter').textContent = Math.floor(game.matter);
  el('energyTxt').textContent = Math.floor(game.energy) + '/' + Math.floor(game.energyMax);
  el('regenTxt').textContent = '+' + game.regen + '/s';
  el('energyBar').style.width = (game.energy / game.energyMax * 100) + '%';
  el('coreTxt').textContent = Math.max(0, Math.ceil(game.coreHp)) + '/' + game.coreHpMax;
  el('coreBar').style.width = (Math.max(0, game.coreHp) / game.coreHpMax * 100) + '%';
  el('wave').textContent = game.wave;
  const build = game.phase === 'build';
  el('phaseLabel').textContent = build ? 'Bauphase' : 'Angriff';
  el('phaseValue').textContent = build
    ? Math.ceil(game.buildTimer) + 's'
    : (game.spawnQueue.length + game.enemies.length) + ' Feinde';
  el('nextWave').classList.toggle('hot', build);
  el('nextWave').disabled = !build;

  const bb = el('bossbar');
  if (game.boss && !game.boss.dead) {
    const b = game.boss;
    bb.hidden = false;
    el('bossName').textContent = b.def.name;
    const info = bossFor(game.wave);
    el('bossHint').textContent = info ? info.hint : '';
    el('bossFill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
    const st = el('bossState');
    st.textContent = b.guarded ? 'Abgeschirmt — erst die Wächter ausschalten'
                   : (b.enraged ? 'Rasend' : '');
    st.classList.toggle('guarded', !!b.guarded);
  } else bb.hidden = true;

  const bw = el('bossWarn');
  const kommt = build && !game.draft ? bossFor(game.wave + 1) : null;
  bw.hidden = !kommt;
  if (kommt)
    bw.innerHTML = 'Welle ' + (game.wave + 1) + ': <b>' + ENEMIES[kommt.type].name +
                   '</b> — ' + kommt.hint;

  const alarmEl = el('alarm');
  alarmEl.hidden = !game.alarm.on;
  if (game.alarm.on) {
    const n = game.coreAttackers().length;
    alarmEl.textContent = n > 1
      ? 'Kern unter Beschuss — ' + n + ' Gegner ohne Turmdeckung'
      : 'Kern unter Beschuss — kein Turm reicht dorthin';
  }

  // Sturmwelle: in der Bauphase als Ankündigung, im Gefecht als Merker
  const mb = el('modBadge');
  const sturm = build ? (game.plannedWave && game.plannedWave.mod &&
                         game.buffs.modImmune.indexOf(game.plannedWave.mod.id) < 0
                         ? game.plannedWave.mod : null)
                      : game.modActive();
  mb.hidden = !sturm || !!game.draft;
  if (sturm)
    mb.innerHTML = (build ? 'Welle ' + (game.wave + 1) + ': ' : 'Sturmwelle: ') +
                   '<b>' + sturm.name + '</b> — <i>' + sturm.desc + '</i>';

  const nw = el('netWarn');
  nw.hidden = !game.overloadedNodes;
  if (game.overloadedNodes)
    nw.textContent = game.overloadedNodes === 1
      ? 'Eine Leitung überlastet — Türme dahinter feuern langsamer'
      : game.overloadedNodes + ' Leitungen überlastet — Türme dahinter feuern langsamer';

  updatePowers();
  updateModes();

  const prev = el('preview');
  if (build && !game.draft && game.plannedWave) {
    prev.hidden = false;
    const html = game.wavePreview()
      .replace(/^(Welle \d+ aus [^:]+):/, '<b>$1</b>')
      .replace(/(\d+ ×)/g, '<i>$1</i>');
    if (prev.dataset.txt !== html) { prev.innerHTML = html; prev.dataset.txt = html; }
  } else prev.hidden = true;
  if (game.selected) updateInspector();
  updateShopAffordability();
}

/* =========================== INPUT ============================ */
function mouseCell(ev) {
  const r = canvas.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * W;
  const y = (ev.clientY - r.top) / r.height * H;
  return { x: Math.floor(x / GRID.cell), y: Math.floor(y / GRID.cell) };
}

canvas.addEventListener('mousemove', ev => {
  const c = mouseCell(ev);
  game.hover.x = c.x; game.hover.y = c.y;
  game.hover.inside = game.inBounds(c.x, c.y);
});
canvas.addEventListener('mouseleave', () => game.hover.inside = false);

/* Ziehen zum Bauen. Der Zug beginnt schon beim Drücken, deshalb muss
   der darauf folgende Klick verschluckt werden — sonst käme auf dieselbe
   Zelle sofort ein zweiter Bauversuch samt Absage. */
let zugAktiv = false;

canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 || game.over || !game.tool) return;
  const def = BUILDINGS[game.tool];
  if (!def || !def.drag) return;
  const c = mouseCell(ev);
  if (!game.inBounds(c.x, c.y)) return;
  zugAktiv = true;
  game.ziehStart(game.tool, c.x, c.y);
  // Zeiger einfangen, damit der Zug auch außerhalb des Feldes weiterläuft.
  // Manche Zeiger lassen sich nicht einfangen — dann geht es eben ohne.
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
});

canvas.addEventListener('pointermove', ev => {
  if (!game.ziehen) return;
  const c = mouseCell(ev);
  game.ziehWeiter(c.x, c.y);
});

// Auch außerhalb des Feldes losgelassen soll der Zug sauber enden
const zugEnde = () => { if (game.ziehen) game.ziehEnde(); };
addEventListener('pointerup', zugEnde);
addEventListener('pointercancel', zugEnde);

canvas.addEventListener('click', ev => {
  if (zugAktiv) { zugAktiv = false; return; }
  if (game.over) return;
  const c = mouseCell(ev);
  if (!game.inBounds(c.x, c.y)) return;
  if (game.tool) { game.build(game.tool, c.x, c.y); return; }
  game.select(game.buildings.get(key(c.x, c.y)) || null);
});

canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (game.tool) { selectTool(game.tool); return; }
  const c = mouseCell(ev);
  const b = game.buildings.get(key(c.x, c.y));
  if (b) game.sell(b);
});

addEventListener('keydown', ev => {
  if (!game.inView) return;              // Seite wird gerade gelesen, nicht gespielt
  const k = ev.key.toLowerCase();
  if (game.draft) {                      // während der Kartenwahl zählt nur die Wahl
    const n = parseInt(ev.key, 10);
    if (n >= 1 && n <= game.draft.length) game.takeCard(n - 1);
    return;
  }
  for (const [type, def] of Object.entries(BUILDINGS))
    if (ev.key === def.key) return selectTool(type);
  const power = POWER_LIST.find(p => p.key === k);
  if (power) return game.usePower(power.id);
  if (ev.code === 'Space') { ev.preventDefault(); if (game.phase === 'build') game.startWave(); }
  else if (k === 'escape') { selectTool(null); game.select(null); }
  else if (k === 'p') togglePause();
  else if (k === 'm') toggleMute();
  else if (k === 'u' && game.selected) game.upgrade(game.selected);
  else if (k === 's' && game.selected) game.sell(game.selected);
  else if (k === 'r') { if (game.selected) game.repair(game.selected); else game.repairAll(); }
  else if (k === 'o' && game.selected) game.toggleOverload(game.selected);
  else if (k === 'l' && game.selected && game.selected.def.turret) game.cyclePriority(game.selected);
  else if (k === 'k') game.cycleMode();
});

function togglePause() {
  game.paused = !game.paused;
  el('pauseBtn').textContent = game.paused ? 'Weiter' : 'Pause';
}

function toggleMute() {
  const m = SFX.toggle();
  el('muteBtn').innerHTML = m ? '&#128263;' : '&#128266;';
  if (!m) SFX.select();
}
el('muteBtn').innerHTML = SFX.muted ? '&#128263;' : '&#128266;';
el('muteBtn').onclick = toggleMute;

// AudioContext darf erst nach einer Nutzergeste starten
let tonBereit = false;
const tonAn = () => { SFX.unlock(); tonBereit = true; };
addEventListener('pointerdown', tonAn, { once: true });
addEventListener('keydown', tonAn, { once: true });

/* Klangbett an die Lage koppeln — viermal je Sekunde reicht, die
   Schichten blenden ohnehin weich über. Läuft nach der Uhr, damit
   auch die Pause und das Ende richtig klingen. */
let moodTimer = 0;
function updateMood(dt) {
  if (!tonBereit || (moodTimer -= dt) > 0) return;
  moodTimer = 0.25;
  // Solange die Seite nur gelesen wird, schweigt auch das Bett
  if (!game.inView || !el('overlay').hidden) return SFX.mood({ phase: 'aus' });
  const feinde = game.enemies.length + game.spawnQueue.length * 0.4;
  const kernNot = 1 - game.coreHp / game.coreHpMax;
  SFX.mood({
    phase: game.over ? 'build' : game.phase,
    intensity: game.over ? 0 : Math.min(1, feinde / 20 + game.wave / 70),
    danger: game.over ? 0 : Math.max(game.boss ? 0.75 : 0, game.alarm.on ? 0.9 : 0,
                                     kernNot > 0.6 ? 0.7 : 0),
    buffer: game.over ? 1 : game.energy / game.energyMax
  });
}

el('nextWave').onclick = () => game.startWave();
el('pauseBtn').onclick = togglePause;
el('speedBtn').onclick = () => {
  game.speed = game.speed === 1 ? 2 : (game.speed === 2 ? 3 : 1);
  el('speedBtn').textContent = game.speed + '×';
};
el('repairBtn').onclick = () => game.selected && game.repair(game.selected);
el('prioBtn').onclick = () => game.selected && game.cyclePriority(game.selected);
el('overloadBtn').onclick = () => game.selected && game.toggleOverload(game.selected);
el('upgradeBtn').onclick = () => game.selected && game.upgrade(game.selected);
el('sellBtn').onclick = () => game.selected && game.sell(game.selected);
el('ovBtn').onclick = () => location.reload();

/* =========================== LOOP ============================= */
buildShop();
buildPowers();
buildModes();

/* Beim Öffnen der Seite: Gibt es eine unterbrochene Partie, wird sie
   angeboten statt stillschweigend überschrieben. Der zweite Knopf
   verwirft sie ausdrücklich — von selbst passiert das nie. */
let standVerworfen = false;
const stand = game.gespeicherteRunde();
const fortsetzen = !!(stand && game.laden(stand));
if (!fortsetzen) {
  game.recomputeSupply();
  game.planNext();
}
if (fortsetzen) {
  showOverlay('PARTIE GEFUNDEN',
    'Du warst nach Welle ' + game.wave + ' stehengeblieben — ' + game.buildings.size +
    ' Bauten, ' + Math.round(game.matter) + ' Materie. Die angekündigte Welle ' +
    (game.wave + 1) + ' wartet unverändert.',
    bestenlisteHtml(game.bestenliste()));
  el('ovBtn').textContent = 'Fortsetzen';
  el('ovBtn2').hidden = false;
  el('ovBtn2').onclick = () => {
    standVerworfen = true;
    loesche(SAVE_KEY);
    location.reload();
  };
} else {
  showOverlay('CORE DEFENSE',
    'Der Kern in der Mitte versorgt deine Türme mit Energie. Angriffe kommen aus allen Richtungen. ' +
    'Baue Pylone, um das Netz nach außen zu tragen, und Reaktoren, damit dir mitten in der Welle nicht ' +
    'der Strom ausgeht. Nach jeder Welle wählst du eine Karte, die für den Rest der Partie gilt.',
    bestenlisteHtml(game.bestenliste()));
  el('ovBtn').textContent = 'Starten';
}
el('ovBtn').onclick = () => {
  el('overlay').hidden = true;
  el('ovBtn2').hidden = true;
  el('ovBtn').textContent = 'Neu starten';
  el('ovBtn').onclick = () => location.reload();
};

/* Beim Verlassen der Seite sichern. Nach „Neu anfangen" nicht — sonst
   stünde der eben gelöschte Stand beim Neuladen wieder da. */
const beimGehen = () => { if (!standVerworfen) game.merken(); };
addEventListener('beforeunload', beimGehen);
addEventListener('pagehide', beimGehen);

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  if (!game.inView) { requestAnimationFrame(frame); return; }
  if (!game.paused && !game.over && el('overlay').hidden) {
    for (let i = 0; i < game.speed; i++) game.update(dt);
  }
  render();
  updateHud();
  updateMood(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
