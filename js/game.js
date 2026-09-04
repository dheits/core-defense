'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* Offscreen-Layer für das Versorgungsnetz (nur bei Änderung neu gezeichnet) */
const netCanvas = document.createElement('canvas');
netCanvas.width = W; netCanvas.height = H;
const netCtx = netCanvas.getContext('2d');

const game = {
  time: 0, speed: 1, paused: false, over: false,
  matter: START_MATTER,
  energy: CORE.energy, energyMax: CORE.energy, regen: CORE.regen,
  coreHp: CORE.hp, coreHpMax: CORE.hp,
  wave: 0, phase: 'build', buildTimer: FIRST_BUILD_TIME,
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
  shake: 0,

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
      const d = base * Math.pow(UPGRADE.damage, lvl) * this.buffs.damage * this.typeBuff(b, 'dmg');
      return b.overload ? d * OVERLOAD.damage : d;
    }
    if (name === 'range')
      return base * Math.pow(UPGRADE.range, lvl) * this.buffs.range * this.typeBuff(b, 'range');
    return base;
  },
  cooldownOf(b) { return b.def.cooldown / (this.buffs.rate * this.typeBuff(b, 'rate')); },
  energyOf(b) {
    return b.def.energy * this.buffs.energy * this.typeBuff(b, 'energy')
      * (b.overload ? this.buffs.overloadCost : 1);
  },
  costOf(type) { return Math.round(BUILDINGS[type].cost * this.buffs.buildCost); },
  upgradeCost(b) {
    return Math.round(b.def.cost * UPGRADE.costFactor * b.level * 1.6 * this.buffs.buildCost);
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

  build(type, x, y) {
    const def = BUILDINGS[type];
    const cost = this.costOf(type);
    if (!this.free(x, y)) { SFX.deny(); return toast('Platz belegt'); }
    if (this.matter < cost) { SFX.deny(); return toast('Zu wenig Materie'); }
    this.matter -= cost;
    const b = {
      type, def, x, y, level: 1,
      hp: 0, maxHp: 0,
      cd: 0, supplied: false, flash: 0, pulse: 0,
      prio: 1, overload: false, bornAt: performance.now(), aim: -Math.PI / 2, scan: rand(0, 6.28),
      px: cellToPx(x), py: cellToPx(y)
    };
    b.maxHp = this.structureOf(b); b.hp = b.maxHp;
    this.buildings.set(key(x, y), b);
    this.turretsDirty = true;
    this.recomputeSupply();
    SFX.build();
    for (let i = 0; i < 10; i++)
      this.particles.push(new Particle(b.px, b.py, def.color, { speed: rand(40, 120), life: .4 }));
  },

  sell(b) {
    SFX.sell();
    this.matter += Math.round(this.costOf(b.type) * this.buffs.refund * b.level);
    this.buildings.delete(key(b.x, b.y));
    this.turretsDirty = true;
    if (this.selected === b) this.select(null);
    this.recomputeSupply();
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
    if (b.type === 'reactor') this.recomputeSupply();
    for (let i = 0; i < 14; i++)
      this.particles.push(new Particle(b.px, b.py, '#ffd166', { speed: rand(50, 160), life: .5 }));
  },

  select(b) {
    if (b && b !== this.selected) SFX.select();
    this.selected = b;
    updateInspector();
  },

  /* --------------------- Energienetz ------------------------ */
  recomputeSupply() {
    const extra = this.buffs.netRadius;
    const sources = [{ x: CORE.cx, y: CORE.cy, r: CORE.supply + extra, parent: null }];
    const pylons = [];
    for (const b of this.buildings.values()) {
      b.supplied = false;
      if (b.type === 'pylon') pylons.push(b);
    }
    // Iterativ ausbreiten: ein Pylon zählt erst als Quelle, wenn er selbst versorgt ist
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of pylons) {
        if (p.supplied) continue;
        const src = sources.find(s => dist(p.x, p.y, s.x, s.y) <= s.r);
        if (src) {
          p.supplied = true;
          p.parent = src;
          sources.push({ x: p.x, y: p.y, r: p.def.supply + extra, parent: src, node: p });
          changed = true;
        }
      }
    }
    for (const b of this.buildings.values()) {
      if (b.type === 'pylon') continue;
      b.supplied = !b.def.needsPower || sources.some(s => dist(b.x, b.y, s.x, s.y) <= s.r);
    }
    this.sources = sources;

    // Energie-Ökonomie neu bilanzieren
    let regen = CORE.regen + this.buffs.regen;
    let cap = CORE.energy + this.buffs.capacity;
    for (const b of this.buildings.values()) {
      if (b.type === 'reactor' && b.supplied) {
        regen += b.def.regen * b.level;
        cap += b.def.capacity * b.level;
      }
    }
    this.regen = Math.round(regen * (this.buffs.regenMul || 1) * 10) / 10;
    this.energyMax = cap;
    this.energy = Math.min(this.energy, cap);
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
    // Leitungen Kern -> Pylon -> Pylon
    netCtx.globalCompositeOperation = 'source-over';
    netCtx.strokeStyle = 'rgba(95,224,255,.45)';
    netCtx.lineWidth = 1.5;
    netCtx.setLineDash([4, 5]);
    for (const s of this.sources) {
      if (!s.parent) continue;
      netCtx.beginPath();
      netCtx.moveTo(cellToPx(s.parent.x), cellToPx(s.parent.y));
      netCtx.lineTo(cellToPx(s.x), cellToPx(s.y));
      netCtx.stroke();
    }
    netCtx.setLineDash([]);
  },

  /* ----------------------- Schaden -------------------------- */
  dealDamage(enemy, dmg, def, kind) {
    if (def && def.splash) {
      const r = def.splash * this.buffs.splash * GRID.cell;
      for (const e of this.enemies) {
        const d = dist(e.x, e.y, enemy.x, enemy.y);
        if (d <= r) this.hurt(e, dmg * (1 - 0.5 * d / r), 'proj');
      }
      for (let i = 0; i < 16; i++)
        this.particles.push(new Particle(enemy.x, enemy.y, i % 2 ? '#ff9f5a' : '#ffe0a8',
          { speed: rand(60, 260), life: rand(.2, .5) }));
    } else {
      this.hurt(enemy, dmg, kind);
      // Kettenblitz: der Treffer springt auf das nächste Ziel über
      if (this.buffs.chain && kind === 'proj') {
        let best = null, bd = 2.2 * GRID.cell;
        for (const o of this.enemies) {
          if (o === enemy || o.dead) continue;
          const d = dist(o.x, o.y, enemy.x, enemy.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          this.hurt(best, dmg * this.buffs.chain, 'chain');
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
  hurt(e, dmg, kind) {
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
    e.hp -= dmg;
    e.hitFlash = 0.06;
    if (this.buffs.hitSlow) e.applySlow(1 - this.buffs.hitSlow, 0.8, this.time);
    if (e.hp <= 0) {
      e.dead = true;
      // Sprengbolzen: der Abschuss reißt Umstehende mit (nur eine Stufe tief)
      if (this.buffs.deathSpark && kind !== 'spark') {
        const r = 1.4 * GRID.cell;
        for (const o of this.enemies)
          if (o !== e && !o.dead && dist(o.x, o.y, e.x, e.y) <= r)
            this.hurt(o, this.buffs.deathSpark, 'spark');
      }
      SFX.kill(e.def.boss, panOf(e.x));
      this.matter += e.def.bounty * this.buffs.bounty;
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
    SFX.buildingHit(panOf(b.px));
    if (b.hp <= 0) {
      SFX.buildingLost(panOf(b.px));
      for (let i = 0; i < 18; i++)
        this.particles.push(new Particle(b.px, b.py, b.def.color, { speed: rand(50, 220), life: rand(.3, .7) }));
      for (let i = 0; i < 6; i++)
        this.particles.push(new Debris(b.px, b.py, b.def.color, 1.3));
      this.buildings.delete(key(b.x, b.y));
      this.turretsDirty = true;
      if (this.selected === b) this.select(null);
      this.recomputeSupply();
      this.shake = Math.max(this.shake, 5);
    }
  },

  damageCore(dmg, enemy) {
    this.coreHp -= dmg;
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
    for (let i = 0; i < 8; i++)
      this.particles.push(new Particle(CORE_PX.x + rand(-30, 30), CORE_PX.y + rand(-30, 30),
        '#5fe0ff', { speed: rand(60, 200), life: .5 }));
    if (this.coreHp <= 0 && !this.over) {
      this.coreHp = 0;
      this.over = true;
      SFX.gameOver();
      showOverlay('KERN VERLOREN', `Du hast ${this.wave} Wellen überstanden.`);
    }
  },

  /* ------------------------ Wellen -------------------------- */
  planWave(n) {
    let budget = waveBudget(n);
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
    return { queue, angles };
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
    this.phase = 'combat';
    // Rollen (Boss, Wächter) müssen mitwandern, nicht nur Typ und Zeit
    this.spawnQueue = this.plannedWave.queue
      .map(e => Object.assign({}, e, { at: this.time + e.t }))
      .sort((a, b) => a.at - b.at);
    this.incoming = this.plannedWave.angles;
    this.plannedWave = null;
    if (this.buffs.waveStartFull) this.energy = this.energyMax;
    SFX.waveStart();
    toast('WELLE ' + this.wave);
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
  },

  spawn(s) {
    const p = edgePoint(s.angle, 34);
    const e = new Enemy(s.type, p.x, p.y, this.wave);
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
    this.energy = Math.min(this.energyMax, this.energy + this.regen * dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);

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
        this.matter += 30 + this.wave * 6 + this.buffs.matterPerWave;
        if (this.buffs.coreRepair)
          this.coreHp = Math.min(this.coreHpMax, this.coreHp + this.buffs.coreRepair);
        SFX.waveClear();
        toast('Welle ' + this.wave + ' abgewehrt  +' + (30 + this.wave * 6) + ' Materie');
        this.planNext();
        this.openDraft();
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
      if (this.buffs.repair && b.hp < b.maxHp)
        b.hp = Math.min(b.maxHp, b.hp + this.buffs.repair * dt);
    }

    /* Türme feuern in der Reihenfolge ihrer Lastpriorität, und die
       unteren Stufen fassen den Puffer erst über ihrer Schwelle an. */
    const frac = this.energy / this.energyMax;
    const autoOverload = this.buffs.freeOverloadAt && frac >= this.buffs.freeOverloadAt;
    for (const b of this.turrets()) {
      const rateMul = b.supplied ? 1 : this.buffs.unpoweredRate;
      if (!rateMul) continue;                     // ohne Netz und ohne Inselbetrieb: still
      b.cd -= dt * rateMul;
      if (b.cd > 0) continue;
      if (frac < PRIORITY[b.prio].threshold) { b.pulse = 0; continue; }
      let cost = this.energyOf(b);
      let dmg = this.stat(b, 'damage');
      if (autoOverload) {                         // Überladung geschenkt, solange der Puffer voll ist
        if (b.overload) cost /= this.buffs.overloadCost;
        else dmg *= OVERLOAD.damage;
      }
      const target = this.findTarget(b);
      if (!target) { b.scan += dt * 0.5; b.aim = b.scan; continue; }
      if (this.energy < cost) { b.pulse = 0; SFX.lowPower(); continue; }
      this.energy -= cost;
      b.cd = this.cooldownOf(b);
      b.pulse = 1;
      b.aim = Math.atan2(target.y - b.py, target.x - b.px);
      const pan = panOf(b.px);
      if (b.type === 'cannon') SFX.cannon(pan);
      else if (b.type === 'frost') SFX.frost(pan);
      else SFX.blaster(pan);
      if (b.def.hitscan) {
        this.hurt(target, dmg, 'beam');
        if (b.def.slow)
          target.applySlow(Math.max(0.1, b.def.slow - this.buffs.slowBonus),
                           b.def.slowTime + this.buffs.slowTime, this.time);
        this.beams.push({ x1: b.px, y1: b.py, x2: target.x, y2: target.y, life: .12, color: b.def.color });
      } else {
        this.projectiles.push(new Projectile(b.px, b.py, target, b.def, dmg, 'proj'));
      }
    }
    for (const b of this.buildings.values()) if (b.pulse > 0) b.pulse -= dt * 4;

    for (const p of this.projectiles) p.update(dt, this);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead);
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
    SFX.select();
    updateInspector();
  },
  cyclePriority(b) {
    b.prio = (b.prio + 1) % PRIORITY.length;
    this.turretsDirty = true;
    SFX.select();
    updateInspector();
  },

  findTarget(b) {
    const r = this.stat(b, 'range') * GRID.cell;
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
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
  ctx.drawImage(netCanvas, 0, 0);
  drawSpawnWarnings();
  drawCore();

  for (const b of game.buildings.values()) drawBuilding(b);
  if (game.selected) drawRange(game.selected.px, game.selected.py, game.stat(game.selected, 'range'), '#5fe0ff');
  if (game.alarm.on) drawAlarmBelow();

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

  drawGhost();
  ctx.restore();
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
    ctx.fillStyle = 'rgba(16,26,42,.95)';
    ctx.strokeStyle = 'rgba(120,190,255,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, s * .96, 0, 7); ctx.fill(); ctx.stroke();
  }

  const body = b.flash > 0 ? '#fff' : 'rgba(14,22,36,.96)';

  if (b.type === 'wall')        drawWall(b, s, hpF);
  else if (b.type === 'pylon')  drawPylon(b, s, body);
  else if (b.type === 'reactor') drawReactor(b, s, body);
  else                          drawTurret(b, s, body);

  // Ausbaustufe als Kerben am Sockel
  if (b.level > 1) {
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < b.level - 1; i++)
      ctx.fillRect(-5 + i * 5, s + 2, 3, 3);
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

function buildShop() {
  shopEl.innerHTML = '';
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const d = document.createElement('div');
    d.className = 'card';
    d.dataset.type = type;
    d.innerHTML =
      `<div class="n"><span class="dot" style="background:${def.color}"></span>${def.name}
         <span class="k">${def.key}</span></div>
       <div class="c">${def.cost} Materie</div>
       <div class="d">${def.desc}</div>`;
    d.onclick = () => selectTool(type);
    shopEl.appendChild(d);
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
    const txt = cost + ' Materie';
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
  }
  if (b.def.regen) rows.push(['Ertrag', '+' + b.def.regen * b.level + '/s']);
  if (b.def.supply) rows.push(['Netzradius', b.def.supply + ' Z']);
  rows.push(['Strom', b.def.needsPower ? (b.supplied ? 'verbunden' : 'GETRENNT') : '—']);
  el('insStats').innerHTML = rows.map(r => `<span>${r[0]}</span><span>${r[1]}</span>`).join('');
  el('upgradeBtn').textContent = b.level >= UPGRADE.maxLevel ? 'Max' : 'Ausbau ' + game.upgradeCost(b);
  el('upgradeBtn').disabled = b.level >= UPGRADE.maxLevel;
  el('sellBtn').textContent = 'Abbau +' + Math.round(game.costOf(b.type) * game.buffs.refund * b.level);

  const turretBox = el('insTurret');
  turretBox.hidden = !b.def.turret;
  if (b.def.turret) {
    el('prioBtn').textContent = 'Last: ' + PRIORITY[b.prio].name;
    el('overloadBtn').textContent = b.overload ? 'Überladung an' : 'Überladung';
    el('overloadBtn').classList.toggle('on', !!b.overload);
    el('overloadBtn').title = 'Doppelter Schaden, ' + game.buffs.overloadCost + '-facher Verbrauch (O)';
  }
}

/* ---------------- Kartenwahl ---------------- */
function showDraft(cards) {
  el('draftWave').textContent = game.wave;
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

function showOverlay(title, text) {
  el('ovTitle').textContent = title;
  el('ovText').textContent = text;
  el('overlay').hidden = false;
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

canvas.addEventListener('click', ev => {
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
  if (ev.code === 'Space') { ev.preventDefault(); if (game.phase === 'build') game.startWave(); }
  else if (k === 'escape') { selectTool(null); game.select(null); }
  else if (k === 'p') togglePause();
  else if (k === 'm') toggleMute();
  else if (k === 'u' && game.selected) game.upgrade(game.selected);
  else if (k === 's' && game.selected) game.sell(game.selected);
  else if (k === 'o' && game.selected) game.toggleOverload(game.selected);
  else if (k === 'l' && game.selected && game.selected.def.turret) game.cyclePriority(game.selected);
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
addEventListener('pointerdown', () => SFX.unlock(), { once: true });
addEventListener('keydown', () => SFX.unlock(), { once: true });

el('nextWave').onclick = () => game.startWave();
el('pauseBtn').onclick = togglePause;
el('speedBtn').onclick = () => {
  game.speed = game.speed === 1 ? 2 : (game.speed === 2 ? 3 : 1);
  el('speedBtn').textContent = game.speed + '×';
};
el('prioBtn').onclick = () => game.selected && game.cyclePriority(game.selected);
el('overloadBtn').onclick = () => game.selected && game.toggleOverload(game.selected);
el('upgradeBtn').onclick = () => game.selected && game.upgrade(game.selected);
el('sellBtn').onclick = () => game.selected && game.sell(game.selected);
el('ovBtn').onclick = () => location.reload();

/* =========================== LOOP ============================= */
buildShop();
game.recomputeSupply();
game.planNext();
showOverlay('CORE DEFENSE',
  'Der Kern in der Mitte versorgt deine Türme mit Energie. Angriffe kommen aus allen Richtungen. ' +
  'Baue Pylone, um das Netz nach außen zu tragen, und Reaktoren, damit dir mitten in der Welle nicht ' +
  'der Strom ausgeht. Nach jeder Welle wählst du eine Karte, die für den Rest der Partie gilt.');
el('ovBtn').textContent = 'Starten';
el('ovBtn').onclick = () => {
  el('overlay').hidden = true;
  el('ovBtn').textContent = 'Neu starten';
  el('ovBtn').onclick = () => location.reload();
};

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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
