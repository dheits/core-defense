'use strict';

/* --------------------------- Helfer --------------------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const key   = (x, y) => x + ',' + y;
const cellToPx = c => (c + 0.5) * GRID.cell;
const pxToCell = p => Math.floor(p / GRID.cell);

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Winkel -> Himmelsrichtung (x nach rechts = Ost, y nach unten = Süd)
function compass(a) {
  const names = ['Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest', 'Nord', 'Nordost'];
  const turn = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return names[Math.round(turn / (Math.PI / 4)) % 8];
}

// Punkt auf dem Kartenrand in Richtung `a` (margin>0 = außerhalb, <0 = innerhalb)
function edgePoint(a, margin) {
  const c = Math.cos(a), s = Math.sin(a);
  const tx = (W / 2 + margin) / Math.max(Math.abs(c), 1e-6);
  const ty = (H / 2 + margin) / Math.max(Math.abs(s), 1e-6);
  const t = Math.min(tx, ty);
  return { x: CORE_PX.x + c * t, y: CORE_PX.y + s * t };
}

/* ------------------------- Partikel --------------------------- */
class Particle {
  constructor(x, y, color, opts = {}) {
    const a = opts.angle !== undefined ? opts.angle : rand(0, Math.PI * 2);
    const s = opts.speed !== undefined ? opts.speed : rand(30, 150);
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.life = this.max = opts.life || rand(0.25, 0.6);
    this.size = opts.size || rand(1.5, 3.5);
    this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.92; this.vy *= 0.92;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = this.life / this.max;
    ctx.globalAlpha = clamp(t, 0, 1);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

/* ------------------------ Projektile -------------------------- */
class Projectile {
  constructor(x, y, target, def, damage, kind) {
    this.kind = kind || 'proj';
    this.x = x; this.y = y;
    this.target = target;
    this.def = def;
    this.damage = damage;
    this.speed = def.projSpeed;
    this.dead = false;
    this.trail = [];
  }
  update(dt, game) {
    const t = this.target;
    // Ziel verloren -> letzte bekannte Richtung weiterfliegen und verpuffen
    if (!t || t.dead) { this.dead = true; return; }
    const dx = t.x - this.x, dy = t.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = this.speed * dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.shift();
    if (d <= step + t.radius) {
      this.x = t.x; this.y = t.y;
      game.dealDamage(t, this.damage, this.def, this.kind);
      this.dead = true;
      return;
    }
    this.x += dx / d * step;
    this.y += dy / d * step;
  }
  draw(ctx) {
    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = this.def.splash ? 3 : 2;
    ctx.beginPath();
    const p0 = this.trail[0] || this;
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.def.splash ? 3.5 : 2, 0, 7);
    ctx.fill();
  }
}

/* -------------------------- Gegner ---------------------------- */
class Enemy {
  constructor(type, x, y, wave) {
    const d = ENEMIES[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y;
    this.maxHp = Math.round(d.hp * waveHpScale(wave));
    this.hp = this.maxHp;
    this.speed = d.speed;
    this.radius = d.radius;
    this.flying = !!d.flying;
    this.dead = false;

    // Konter-Eigenschaften
    this.armor = d.armor || 0;
    this.shieldMax = d.shield ? Math.round(d.shield * (1 + 0.07 * (wave - 1))) : 0;
    this.shield = this.shieldMax;
    this.shieldCd = 0;
    this.slowResist = d.slowResist || 0;
    this.healBeams = [];

    this.slowUntil = 0; this.slowFactor = 1;
    this.attackCd = 0;
    this.target = null;          // Gebäude, das gerade zerlegt wird
    this.angle = 0;
    this.hitFlash = 0;
  }

  get slowed() { return this.slowFactor < 1; }

  applySlow(factor, time, now) {
    const resist = this.slowResist;
    this.slowFactor = Math.min(this.slowFactor, factor + (1 - factor) * resist);
    this.slowUntil = Math.max(this.slowUntil, now + time * (1 - resist));
  }

  update(dt, game) {
    if (this.slowUntil <= game.time) this.slowFactor = 1;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Schild lädt nach einer Feuerpause wieder auf
    if (this.shieldMax) {
      if (this.shieldCd > 0) this.shieldCd -= dt;
      else if (this.shield < this.shieldMax)
        this.shield = Math.min(this.shieldMax, this.shield + this.shieldMax * 0.25 * dt);
    }
    if (this.def.regen) this.hp = Math.min(this.maxHp, this.hp + this.def.regen * dt);

    // Mender flickt seine Nachbarn
    if (this.def.heal) {
      this.healBeams.length = 0;
      const r = this.def.healRange * GRID.cell;
      for (const e of game.enemies) {
        if (e === this || e.dead || e.hp >= e.maxHp) continue;
        if (dist(e.x, e.y, this.x, this.y) > r) continue;
        e.hp = Math.min(e.maxHp, e.hp + this.def.heal * dt);
        this.healBeams.push(e);
      }
    }

    // Richtung: immer zum Kern
    const dx = CORE_PX.x - this.x, dy = CORE_PX.y - this.y;
    const dc = Math.hypot(dx, dy) || 1;
    let dirX = dx / dc, dirY = dy / dc;
    this.angle = Math.atan2(dirY, dirX);

    // Kern erreicht?
    const coreEdge = (CORE.half + 0.5) * GRID.cell;
    if (Math.abs(this.x - CORE_PX.x) < coreEdge + this.radius &&
        Math.abs(this.y - CORE_PX.y) < coreEdge + this.radius) {
      this.attack(dt, game, null);
      return;
    }

    const speed = this.speed * this.slowFactor;

    if (this.flying) {                       // Drohnen ignorieren Bauten
      this.x += dirX * speed * dt;
      this.y += dirY * speed * dt;
      return;
    }

    // Blockiert? Erst seitlich ausweichen, sonst angreifen.
    const probe = this.radius + 6;
    const blocking = game.buildingAt(this.x + dirX * probe, this.y + dirY * probe);
    if (!blocking) {
      this.target = null;
      this.x += dirX * speed * dt;
      this.y += dirY * speed * dt;
      return;
    }

    const base = Math.atan2(dirY, dirX);
    for (const off of [0.7, -0.7, 1.35, -1.35]) {
      const a = base + off;
      const nx = Math.cos(a), ny = Math.sin(a);
      if (!game.buildingAt(this.x + nx * probe, this.y + ny * probe)) {
        this.x += nx * speed * dt * 0.85;
        this.y += ny * speed * dt * 0.85;
        this.target = null;
        this.angle = a;
        return;
      }
    }
    this.attack(dt, game, blocking);
  }

  attack(dt, game, building) {
    this.target = building;
    this.attackCd -= dt;
    if (this.attackCd > 0) return;
    this.attackCd = 1;
    if (building) game.damageBuilding(building, this.def.dmg);
    else game.damageCore(this.def.dmg);
    const a = this.angle;
    for (let i = 0; i < 5; i++)
      game.particles.push(new Particle(this.x + Math.cos(a) * this.radius,
        this.y + Math.sin(a) * this.radius, '#ffb36b',
        { angle: a + rand(-0.9, 0.9), speed: rand(60, 170), life: rand(.2, .45) }));
  }

  draw(ctx) {
    const d = this.def;

    // Heilstrahlen zuerst, damit sie unter den Körpern liegen
    for (const e of this.healBeams) {
      ctx.strokeStyle = 'rgba(125,255,176,.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.slowed) {
      ctx.shadowColor = '#7fb4ff'; ctx.shadowBlur = 12;
    }
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : d.color;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1.5;

    const r = this.radius;
    ctx.beginPath();
    if (this.flying) {                       // Raute mit Rotoren
      ctx.moveTo(r, 0); ctx.lineTo(0, r * .7); ctx.lineTo(-r * .8, 0); ctx.lineTo(0, -r * .7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = .35;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (d.boss) {                     // Sechseck
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.arc(0, 0, r * .45, 0, 7); ctx.fill();
    } else {                                 // Pfeilform Richtung Kern
      ctx.moveTo(r, 0); ctx.lineTo(-r * .75, r * .8); ctx.lineTo(-r * .4, 0); ctx.lineTo(-r * .75, -r * .8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    if (this.shieldMax && this.shield > 0) { // Schild als Ring, Deckkraft = Ladung
      ctx.strokeStyle = '#6bd5ff';
      ctx.globalAlpha = 0.25 + 0.55 * (this.shield / this.shieldMax);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 4.5, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.armor) {                        // Panzerung als zweiter Umriss
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 1.5, 0, 7); ctx.stroke();
    }
    if (d.heal) {                            // Mender: Kreuz
      ctx.strokeStyle = '#0a1420'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x - 4, this.y); ctx.lineTo(this.x + 4, this.y);
      ctx.moveTo(this.x, this.y - 4); ctx.lineTo(this.x, this.y + 4);
      ctx.stroke();
    }

    if (this.hp < this.maxHp) {              // HP-Balken
      const w = this.radius * 2.2, h = 3;
      const x = this.x - w / 2, y = this.y - this.radius - 8;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#6bff9f'; ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
    }
  }
}
