'use strict';

/* --------------------------- Helfer --------------------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const key   = (x, y) => x + ',' + y;
const cellToPx = c => (c + 0.5) * GRID.cell;
const pxToCell = p => Math.floor(p / GRID.cell);

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Farbe abdunkeln — Gliedmaßen brauchen einen eigenen, sichtbaren Ton
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgb(' + Math.round(((n >> 16) & 255) * f) + ',' +
                  Math.round(((n >> 8) & 255) * f) + ',' +
                  Math.round((n & 255) * f) + ')';
}

// Stereo-Ortung: links auf dem Feld heißt links im Kopfhörer
function panOf(x) { return Math.max(-1, Math.min(1, (x / W - 0.5) * 1.7)); }

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

    // Animation: Schrittphase, Rotorwinkel, Trefferzucken
    this.walk = Math.random() * 6.28;
    this.spin = Math.random() * 6.28;
    this.recoil = 0;
    this.moving = 0;
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
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    this.spin += dt * (this.flying ? 34 : 3);
    this.moving = Math.max(0, this.moving - dt * 4);

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
      this.walk += speed * dt * 0.09;
      this.moving = 1;
      return;
    }

    // Blockiert? Erst seitlich ausweichen, sonst angreifen.
    const probe = this.radius + 6;
    const blocking = game.buildingAt(this.x + dirX * probe, this.y + dirY * probe);
    if (!blocking) {
      this.target = null;
      this.x += dirX * speed * dt;
      this.y += dirY * speed * dt;
      this.walk += speed * dt * 0.09;
      this.moving = 1;
      return;
    }

    const base = Math.atan2(dirY, dirX);
    for (const off of [0.7, -0.7, 1.35, -1.35]) {
      const a = base + off;
      const nx = Math.cos(a), ny = Math.sin(a);
      if (!game.buildingAt(this.x + nx * probe, this.y + ny * probe)) {
        this.x += nx * speed * dt * 0.85;
        this.y += ny * speed * dt * 0.85;
        this.walk += speed * dt * 0.08;
        this.moving = 1;
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
    this.recoil = 1;
    if (building) {
      game.damageBuilding(building, this.def.dmg);
      if (building.type === 'wall' && game.buffs.wallThorns)
        game.hurt(this, game.buffs.wallThorns, 'thorns');
    } else game.damageCore(this.def.dmg, this);
    const a = this.angle;
    for (let i = 0; i < 5; i++)
      game.particles.push(new Particle(this.x + Math.cos(a) * this.radius,
        this.y + Math.sin(a) * this.radius, '#ffb36b',
        { angle: a + rand(-0.9, 0.9), speed: rand(60, 170), life: rand(.2, .45) }));
  }

  draw(ctx) {
    const d = this.def, r = this.radius;

    // Heilstrahlen zuerst, damit sie unter den Körpern liegen
    for (const e of this.healBeams) {
      ctx.strokeStyle = 'rgba(125,255,176,.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Schatten gibt Bodenhaftung — bei Fliegern klein und weit unten
    const hover = this.flying ? 6 + Math.sin(this.spin * 0.12) * 2.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(this.x + hover * .3, this.y + r * .55 + hover,
                r * (this.flying ? .55 : .85), r * (this.flying ? .3 : .42), 0, 0, 7);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y - hover);
    ctx.rotate(this.angle);
    ctx.translate(-this.recoil * 3, 0);          // Zucken nach einem Schlag

    const body = this.hitFlash > 0 ? '#ffffff' : d.color;
    const line = 'rgba(6,10,18,.8)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';

    if (d.boss) this.drawTitan(ctx, r, body, line);
    else if (this.flying) this.drawDrone(ctx, r, body, line);
    else if (d.heal) this.drawMender(ctx, r, body, line);
    else if (d.armor) this.drawBrute(ctx, r, body, line);
    else if (this.slowResist) this.drawRunner(ctx, r, body, line);
    else this.drawCrawler(ctx, r, body, line);

    ctx.restore();

    if (this.slowed) {                           // Frost: heller Rand statt teurem Blur
      ctx.strokeStyle = 'rgba(160,215,255,.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(this.x, this.y - hover, r + 2.5, 0, 7); ctx.stroke();
      for (let i = 0; i < 3; i++) {              // Eiskristalle
        const a = this.spin * .3 + i * 2.1;
        const px = this.x + Math.cos(a) * (r + 2), py = this.y - hover + Math.sin(a) * (r + 2);
        ctx.fillStyle = 'rgba(200,235,255,.9)';
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      }
    }
    if (this.shieldMax && this.shield > 0) {     // Schild als Ring, Deckkraft = Ladung
      ctx.strokeStyle = '#6bd5ff';
      ctx.globalAlpha = 0.25 + 0.55 * (this.shield / this.shieldMax);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y - hover, r + 4.5, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (this.hp < this.maxHp) {                  // HP-Balken
      const w = r * 2.2, h = 3;
      const x = this.x - w / 2, y = this.y - hover - r - 9;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = this.hp / this.maxHp > .35 ? '#6bff9f' : '#ffb04a';
      ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
    }
  }

  /* --- Beine: Phase aus der Schrittzahl, Ausschlag nur in Bewegung --- */
  legs(ctx, r, count, spread, len, thick, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const bx = r * spread - i * (r * spread * 2) / Math.max(1, count - 1);
      for (const sgn of [1, -1]) {
        const ph = Math.sin(this.walk * 2 + i * 1.9 + (sgn > 0 ? 0 : Math.PI)) * this.moving;
        ctx.beginPath();
        ctx.moveTo(bx, sgn * r * .35);
        ctx.quadraticCurveTo(bx + ph * r * .35, sgn * r * .8,
                             bx + ph * r * .6, sgn * r * len);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  drawCrawler(ctx, r, body, line) {
    this.legs(ctx, r, 3, .55, 1.15, 2, shade(this.def.color, .62));
    const wob = Math.sin(this.walk * 4) * .8 * this.moving;
    ctx.save(); ctx.translate(0, wob);
    ctx.fillStyle = body; ctx.strokeStyle = line;
    ctx.beginPath(); ctx.ellipse(-r * .1, 0, r * .95, r * .68, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * .6, 0, r * .42, r * .46, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';        // Panzerfugen
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * .1 + i * r * .34, -r * .5);
      ctx.lineTo(-r * .1 + i * r * .34, r * .5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.20)';     // Lichtkante
    ctx.beginPath(); ctx.ellipse(-r * .12, -r * .28, r * .7, r * .2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2c8';                   // Augen
    ctx.beginPath(); ctx.arc(r * .74, -r * .22, r * .13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .74, r * .22, r * .13, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawRunner(ctx, r, body, line) {
    if (this.moving > .2) {                      // Fahrtwind hinter dem Körper
      ctx.strokeStyle = 'rgba(255,180,110,.4)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const o = (i - 1) * r * .45;
        ctx.beginPath();
        ctx.moveTo(-r * 1.2 - Math.abs(o), o);
        ctx.lineTo(-r * (2.4 + Math.sin(this.walk * 3 + i) * .5), o);
        ctx.stroke();
      }
    }
    this.legs(ctx, r, 2, .35, 1.35, 2, shade(this.def.color, .62));
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r * 1.15, 0); ctx.lineTo(0, r * .55);
    ctx.lineTo(-r * .85, 0); ctx.lineTo(0, -r * .55);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0); ctx.lineTo(0, -r * .42); ctx.lineTo(-r * .6, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff2c8';
    ctx.beginPath(); ctx.arc(r * .5, 0, r * .17, 0, 7); ctx.fill();
  }

  drawBrute(ctx, r, body, line) {
    const stomp = Math.sin(this.walk * 1.6) * 1.6 * this.moving;
    this.legs(ctx, r, 2, .5, .95, 3.6, shade(this.def.color, .58));
    ctx.save(); ctx.translate(0, stomp);
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 1.8;
    ctx.beginPath();                             // massiger Rumpf
    ctx.moveTo(r * .9, -r * .55); ctx.lineTo(r * 1.05, 0); ctx.lineTo(r * .9, r * .55);
    ctx.lineTo(-r * .8, r * .7); ctx.lineTo(-r * .95, 0); ctx.lineTo(-r * .8, -r * .7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.22)';     // Panzerplatten
    ctx.fillRect(-r * .55, -r * .55, r * .5, r * 1.1);
    ctx.fillRect(r * .1, -r * .42, r * .38, r * .84);
    ctx.fillStyle = 'rgba(255,255,255,.14)';     // Lichtkante
    ctx.fillRect(-r * .8, -r * .62, r * 1.7, r * .16);
    ctx.fillStyle = '#ffe9a8';                   // Sichtschlitz
    ctx.fillRect(r * .72, -r * .14, r * .24, r * .28);
    ctx.restore();
  }

  drawDrone(ctx, r, body, line) {
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 1.6;
    ctx.beginPath();                             // Rumpf
    ctx.moveTo(r * .95, 0); ctx.lineTo(0, r * .5);
    ctx.lineTo(-r * .7, 0); ctx.lineTo(0, -r * .5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const sgn of [1, -1]) {                 // zwei Rotoren
      const ax = -r * .1, ay = sgn * r * .72;
      ctx.strokeStyle = line; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, sgn * r * .3); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.strokeStyle = 'rgba(180,235,255,.75)';
      for (let i = 0; i < 2; i++) {
        const a = this.spin + i * Math.PI / 2 + (sgn > 0 ? 0 : .6);
        ctx.beginPath();
        ctx.moveTo(ax - Math.cos(a) * r * .5, ay - Math.sin(a) * r * .5);
        ctx.lineTo(ax + Math.cos(a) * r * .5, ay + Math.sin(a) * r * .5);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(140,210,255,.28)';
      ctx.beginPath(); ctx.arc(ax, ay, r * .5, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.2)';      // Lichtkante am Rumpf
    ctx.beginPath();
    ctx.moveTo(r * .9, 0); ctx.lineTo(0, -r * .42); ctx.lineTo(-r * .55, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eaffff';                   // Sensorauge
    ctx.beginPath(); ctx.arc(r * .5, 0, 2.4, 0, 7); ctx.fill();
  }

  drawMender(ctx, r, body, line) {
    ctx.save();
    ctx.rotate(this.spin * .5);                  // Ring dreht sich
    ctx.strokeStyle = 'rgba(125,255,176,.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([r * .5, r * .35]);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const puls = .9 + Math.sin(this.spin * 1.6) * .1;
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r * .72 * puls, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(10,20,16,.85)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * .38, 0); ctx.lineTo(r * .38, 0);
    ctx.moveTo(0, -r * .38); ctx.lineTo(0, r * .38);
    ctx.stroke();
  }

  drawTitan(ctx, r, body, line) {
    const stomp = Math.sin(this.walk * 1.2) * 2.2 * this.moving;
    ctx.strokeStyle = shade(this.def.color, .55); ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {                 // schwere Beine
      const bx = r * .45 - i * r * .9;
      for (const sgn of [1, -1]) {
        const ph = Math.sin(this.walk * 1.2 + i * 2.1 + (sgn > 0 ? 0 : Math.PI)) * this.moving;
        ctx.beginPath();
        ctx.moveTo(bx, sgn * r * .5);
        ctx.lineTo(bx + ph * r * .3, sgn * r * 1.05);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.save(); ctx.translate(0, stomp);
    ctx.fillStyle = body; ctx.strokeStyle = line; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {                 // Panzersegmente
      const a = i / 3 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * .9, Math.sin(a) * r * .9);
      ctx.lineTo(-Math.cos(a) * r * .9, -Math.sin(a) * r * .9);
      ctx.stroke();
    }
    const gl = .55 + Math.sin(this.spin * 2) * .25;   // glühender Kern
    ctx.fillStyle = 'rgba(255,220,160,' + gl.toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r * .38, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r * .16, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* Trümmer: bleiben nach einem Abschuss kurz liegen und verglühen */
class Debris {
  constructor(x, y, color, scale) {
    const a = rand(0, Math.PI * 2), sp = rand(40, 190) * (scale || 1);
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    this.rot = rand(0, 6.28); this.spin = rand(-9, 9);
    this.size = rand(2.2, 4.6) * (scale || 1);
    this.life = this.max = rand(.5, 1.1);
    this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.90; this.vy *= 0.90;
    this.rot += this.spin * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = this.life / this.max;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * .7);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
