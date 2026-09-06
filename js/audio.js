'use strict';

/* ---------------------------------------------------------------
   Prozeduraler Sound über die WebAudio-API — keine Asset-Dateien.

   Damit es nicht nach Testton klingt, hat jede Stimme drei Teile,
   wie ein echtes Geräusch: einen Transienten (der Klick, in dem die
   Ortung steckt), einen Körper (die Tonhöhe) und einen Ausklang
   (gefiltertes Rauschen). Dazu kommen Stereo-Ortung nach der Position
   auf dem Feld und ein kurzer Raumhall über alles.

   Der AudioContext startet erst nach der ersten Nutzergeste.
---------------------------------------------------------------- */
const SFX = (() => {
  let actx = null, master = null, comp = null, conv = null, verb = null;
  let ferne = 0;                        // Entfernung der gerade gespielten Stimme
  let bed = null;                       // Klangbett: Drone, Puls, Flirren
  let netz = null;                      // Pufferton, folgt der Ladung
  // Manche Browser sperren den Speicher bei file:// oder im privaten Fenster.
  // Das darf höchstens die Ton-Einstellung kosten, nicht das ganze Spiel.
  function merke(wert) {
    try { if (wert === undefined) return localStorage.getItem('cd_muted');
          localStorage.setItem('cd_muted', wert); } catch (e) { /* egal */ }
    return null;
  }
  let muted = merke() === '1';
  const volume = 0.55;
  const last = {};

  // Impulsantwort für den Hall: Rauschen, das exponentiell ausklingt
  function impulse(dur, decay) {
    const rate = actx.sampleRate, len = Math.floor(rate * dur);
    const buf = actx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();

    comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 26;
    comp.ratio.value = 7;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    master = actx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp);
    comp.connect(actx.destination);

    conv = actx.createConvolver();
    conv.buffer = impulse(0.6, 2.4);
    verb = actx.createGain();
    verb.gain.value = 0.75;
    conv.connect(verb);
    verb.connect(comp);                    // Hall am Kompressor vorbei am Master
  }

  function ready() {
    if (muted) return false;
    if (!actx) init();
    if (!actx) return false;
    if (actx.state === 'suspended') actx.resume();
    return true;
  }

  function gate(name, minGap) {
    const t = performance.now() / 1000;
    if (last[name] && t - last[name] < minGap) return false;
    last[name] = t;
    return true;
  }

  /* Ausgangsweg einer Stimme: Lautstärke → Ortung → Master (+ Hallanteil) */
  function out(o) {
    const g = actx.createGain();
    let node = g;
    // Ferne Geräusche verlieren die Höhen — dieselbe Dämpfung wie in echter Luft
    const weit = o.far !== undefined ? o.far : ferne;
    if (weit > 0.05) {
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 16000 - 12200 * Math.min(1, weit);
      g.connect(lp);
      node = lp;
    }
    if (actx.createStereoPanner) {
      const p = actx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
      node.connect(p);
      node = p;
    }
    node.connect(master);
    if (conv && o.send) {
      const s = actx.createGain();
      s.gain.value = o.send;
      node.connect(s);
      s.connect(conv);
    }
    return g;
  }

  /* Oszillator mit Hüllkurve, optionalem Frequenz-Slide und Filter */
  function tone(o) {
    if (!ready()) return;
    const t0 = actx.currentTime + (o.delay || 0);
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;

    const peak = o.gain || 0.1;
    const atk = o.attack !== undefined ? o.attack : 0.004;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    let node = osc;
    if (o.filter) {
      const f = actx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq || 1200;
      if (o.q) f.Q.value = o.q;
      node.connect(f); node = f;
    }
    node.connect(env);
    env.connect(out(o));
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  /* Rauschimpuls mit Filterfahrt — Transienten, Explosionen, Zischen */
  function noise(o) {
    if (!ready()) return;
    const t0 = actx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.2;
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    const shape = o.shape || 1;            // >1 = schnellerer Abfall
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, shape);
    const src = actx.createBufferSource();
    src.buffer = buf;

    const f = actx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1400, t0);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t0 + dur);
    f.Q.value = o.q || 1;

    const env = actx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(o.gain || 0.1, t0 + (o.attack || 0.002));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(env); env.connect(out(o));
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  const R = (a, b) => a + Math.random() * (b - a);
  // Nach jeder Stimme wieder auf „nah" — nur die Feldgeräusche setzen sie.
  function nah() { ferne = 0; }

  /* ---------------------------------------------------------------
     Klangbett. Drei Schichten, die dauerhaft laufen und nur in der
     Lautstärke geregelt werden: eine tiefe Drone, ein pulsierender
     Mittelbau, der mit der Wellenstärke schneller schlägt, und ein
     hohes Flirren für den Moment, in dem es eng wird. So verändert
     sich die Stimmung mit der Lage, ohne dass ein Ton „startet".
  ---------------------------------------------------------------- */
  function buildBed() {
    if (bed || !actx) return;
    const bus = actx.createGain();
    bus.gain.value = 1;
    bus.connect(master);

    const schicht = (typ, freq, detune, lpf, q) => {
      const g = actx.createGain();
      g.gain.value = 0;
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = lpf;
      if (q) lp.Q.value = q;
      lp.connect(g); g.connect(bus);
      for (const d of detune) {
        const o = actx.createOscillator();
        o.type = typ; o.frequency.value = freq; o.detune.value = d;
        o.connect(lp); o.start();
      }
      return g;
    };

    const drone = schicht('sawtooth', 49, [-7, 0, 9], 240);
    const puls = schicht('triangle', 98, [-4, 5], 560);
    const flirren = schicht('sine', 329.6, [0, 11, -13], 2600);

    // Der Puls wird von einem langsamen Oszillator auf- und zugeblendet
    const lfo = actx.createOscillator();
    lfo.type = 'triangle'; lfo.frequency.value = 1.2;
    const lfoTiefe = actx.createGain();
    lfoTiefe.gain.value = 0;
    lfo.connect(lfoTiefe); lfoTiefe.connect(puls.gain);
    lfo.start();

    bed = { bus, drone, puls, flirren, lfo, lfoTiefe };
  }

  function buildNetz() {
    if (netz || !actx) return;
    const g = actx.createGain();
    g.gain.value = 0;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const o = actx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 90;
    const o2 = actx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = 45;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o.start(); o2.start();
    netz = { g, o, o2 };
  }

  const ziel = (param, wert, zeit) =>
    param.setTargetAtTime(wert, actx.currentTime, zeit || 0.25);

  return {
    unlock() { init(); if (actx && actx.state === 'suspended') actx.resume(); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      merke(muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : volume;
      return muted;
    },

    /* ---------------- Türme ----------------
       Jeder Schuss: Anschlag, Körper, Ausklang — mit Streuung, damit
       zwanzig Blaster nicht wie ein einziger Automat klingen. */
    blaster(pan, far) {
      if (!gate('blaster', 0.04)) return;
      ferne = far || 0;
      const v = R(0.92, 1.08);
      noise({ dur: 0.018, freq: 5200 * v, freqTo: 2200, gain: 0.05, filter: 'highpass',
              shape: 3, attack: 0.001, pan });
      tone({ type: 'triangle', freq: 720 * v, to: 190, dur: 0.055, gain: 0.05,
             attack: 0.002, pan, send: 0.08 });
      noise({ dur: 0.085, freq: 1500 * v, freqTo: 420, gain: 0.028, filter: 'bandpass',
              q: 1.6, shape: 2, pan, send: 0.12 });
    },
    cannon(pan, far) {
      if (!gate('cannon', 0.07)) return;
      ferne = far || 0;
      const v = R(0.94, 1.06);
      noise({ dur: 0.03, freq: 6000, freqTo: 1800, gain: 0.13, filter: 'highpass',
              shape: 4, attack: 0.001, pan });
      tone({ type: 'sine', freq: 165 * v, to: 42, dur: 0.3, gain: 0.2, attack: 0.003,
             pan, send: 0.3 });
      tone({ type: 'sine', freq: 74 * v, to: 28, dur: 0.5, gain: 0.14, attack: 0.006,
             pan, send: 0.25 });
      noise({ dur: 0.34, freq: 1900, freqTo: 130, gain: 0.1, shape: 1.6, pan, send: 0.4 });
    },
    frost(pan, far) {
      if (!gate('frost', 0.06)) return;
      ferne = far || 0;
      const v = R(0.95, 1.06);
      noise({ dur: 0.16, freq: 900 * v, freqTo: 6500, gain: 0.05, filter: 'bandpass',
              q: 2.4, shape: 0.7, attack: 0.012, pan, send: 0.25 });
      tone({ type: 'triangle', freq: 620 * v, to: 1900, dur: 0.14, gain: 0.03,
             attack: 0.01, pan, send: 0.2 });
    },

    /* ---------------- Treffer und Abschüsse ----------------
       Ein Abschuss ist ein Bersten: harter Anschlag, kurzer Körper,
       Rauschfahne nach unten. */
    kill(boss, pan, far, gross) {
      ferne = far || 0;
      // Große Gegner bersten tiefer als kleine
      const m = 1 / Math.max(.6, Math.min(2.1, gross || 1));
      if (boss) {
        noise({ dur: 0.05, freq: 7000, freqTo: 2500, gain: 0.3, filter: 'highpass',
                shape: 4, attack: 0.001, pan });
        noise({ dur: 0.9, freq: 2400, freqTo: 55, gain: 0.3, shape: 1.3, pan, send: 0.6 });
        tone({ type: 'sine', freq: 120, to: 26, dur: 0.9, gain: 0.3, attack: 0.005, pan, send: 0.5 });
        tone({ type: 'sawtooth', freq: 80, to: 22, dur: 0.65, gain: 0.1, filter: 'lowpass',
               filterFreq: 700, pan, send: 0.4 });
        return;
      }
      if (!gate('kill', 0.035)) return;
      const v = R(0.9, 1.12) * m;
      noise({ dur: 0.022, freq: 5000 * v, gain: 0.07, filter: 'highpass', shape: 3,
              attack: 0.001, pan });
      noise({ dur: 0.17 / m, freq: 2300 * v, freqTo: 280 * m, gain: 0.08, filter: 'bandpass',
              q: 1.2, shape: 1.8, pan, send: 0.22 });
      tone({ type: 'triangle', freq: 240 * v, to: 70 * m, dur: 0.13 / m, gain: 0.05 / m,
             attack: 0.002, pan, send: 0.18 });
    },
    buildingHit(pan, far) {
      if (!gate('bhit', 0.12)) return;
      ferne = far || 0;
      noise({ dur: 0.03, freq: 3800, gain: 0.05, filter: 'highpass', shape: 3,
              attack: 0.001, pan });
      noise({ dur: 0.1, freq: 700, freqTo: 200, gain: 0.05, shape: 2, pan, send: 0.15 });
      tone({ type: 'square', freq: R(150, 200), to: 85, dur: 0.07, gain: 0.03, pan });
    },
    buildingLost(pan, far) {
      ferne = far || 0;
      noise({ dur: 0.04, freq: 6000, gain: 0.16, filter: 'highpass', shape: 4, attack: 0.001, pan });
      noise({ dur: 0.55, freq: 1700, freqTo: 80, gain: 0.2, shape: 1.5, pan, send: 0.5 });
      tone({ type: 'sawtooth', freq: 190, to: 38, dur: 0.5, gain: 0.12, filter: 'lowpass',
             filterFreq: 900, pan, send: 0.35 });
    },
    coreHit(pan, far) {
      ferne = far || 0;
      if (!gate('core', 0.18)) return;
      tone({ type: 'sine', freq: 96, to: 34, dur: 0.45, gain: 0.26, attack: 0.004, send: 0.45, pan });
      tone({ type: 'triangle', freq: 320, to: 130, dur: 0.18, gain: 0.06, send: 0.3, pan });
      noise({ dur: 0.35, freq: 900, freqTo: 110, gain: 0.11, shape: 1.6, send: 0.4, pan });
    },

    /* ---------------- Bau-Interaktion ---------------- */
    build() {
      nah();
      // Beim Ziehen fallen mehrere Bauten in ein Bild — ohne Sperre
      // stapeln sich die Klänge zu einem Knall.
      if (!gate('build', 0.045)) return;
      tone({ type: 'triangle', freq: 440, dur: 0.07, gain: 0.09, send: 0.1 });
      tone({ type: 'triangle', freq: 660, dur: 0.12, gain: 0.09, delay: 0.06, send: 0.15 });
      noise({ dur: 0.1, freq: 2600, freqTo: 800, gain: 0.035, filter: 'bandpass', q: 1.5 });
    },
    sell() {
      nah();
      tone({ type: 'triangle', freq: 620, dur: 0.08, gain: 0.08 });
      tone({ type: 'triangle', freq: 330, dur: 0.14, gain: 0.08, delay: 0.06, send: 0.12 });
    },
    upgrade() {
      nah();
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.17, gain: 0.075, delay: i * 0.06, send: 0.2 }));
    },
    deny() {
      nah();
      if (!gate('deny', 0.12)) return;
      tone({ type: 'square', freq: 175, to: 120, dur: 0.11, gain: 0.06 });
    },
    lowPower() {
      nah();
      if (!gate('low', 1.6)) return;
      tone({ type: 'sawtooth', freq: 300, to: 110, dur: 0.3, gain: 0.06,
             filter: 'lowpass', filterFreq: 900, send: 0.2 });
    },
    select() {
      nah();
      if (!gate('sel', 0.05)) return;
      tone({ type: 'sine', freq: 880, dur: 0.05, gain: 0.045 });
    },
    alarm() {
      nah();
      if (!gate('alarm', 2.6)) return;
      tone({ type: 'square', freq: 466, dur: 0.17, gain: 0.075, filter: 'lowpass',
             filterFreq: 1900, send: 0.3 });
      tone({ type: 'square', freq: 349, dur: 0.22, gain: 0.075, delay: 0.21,
             filter: 'lowpass', filterFreq: 1900, send: 0.3 });
      tone({ type: 'sine', freq: 92, to: 68, dur: 0.55, gain: 0.11, send: 0.2 });
    },

    bossSpawn() {
      nah();
      this.duck(0.8, 2.2);
      tone({ type: 'sawtooth', freq: 44, to: 88, dur: 1.5, gain: 0.24, attack: 0.15,
             filter: 'lowpass', filterFreq: 420, send: 0.7 });
      tone({ type: 'sine', freq: 58, to: 40, dur: 1.8, gain: 0.26, attack: 0.08, send: 0.5 });
      noise({ dur: 1.1, freq: 300, freqTo: 60, gain: 0.13, shape: 1.2, send: 0.8 });
      [0, .34, .68].forEach((d, i) =>
        tone({ type: 'square', freq: 233, dur: 0.24, gain: 0.06, delay: d,
               filter: 'lowpass', filterFreq: 1400, send: 0.5 }));
    },
    bossRage(pan, far) {
      ferne = far || 0;
      tone({ type: 'sawtooth', freq: 150, to: 92, dur: 0.9, gain: 0.17,
             filter: 'lowpass', filterFreq: 1100, send: 0.5, pan });
      tone({ type: 'square', freq: 74, to: 58, dur: 1.1, gain: 0.12, send: 0.4, pan });
      noise({ dur: 0.7, freq: 1800, freqTo: 140, gain: 0.12, shape: 1.4, send: 0.5, pan });
    },
    bossDown() {
      nah();
      this.duck(0.7, 1.8);
      noise({ dur: 0.06, freq: 7000, gain: 0.3, filter: 'highpass', shape: 4, attack: 0.001 });
      noise({ dur: 1.5, freq: 2600, freqTo: 45, gain: 0.32, shape: 1.2, send: 0.85 });
      tone({ type: 'sine', freq: 130, to: 24, dur: 1.5, gain: 0.3, attack: 0.005, send: 0.6 });
      [392, 523, 659].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.9, gain: 0.07, delay: .35 + i * .1,
               attack: 0.03, send: 0.6 }));
    },

    repair(pan, far) {
      ferne = far || 0;
      noise({ dur: 0.05, freq: 3000, freqTo: 900, gain: 0.06, filter: 'bandpass', q: 2,
              shape: 3, pan });
      tone({ type: 'triangle', freq: 520, dur: 0.09, gain: 0.06, pan, send: 0.12 });
      tone({ type: 'triangle', freq: 780, dur: 0.14, gain: 0.06, delay: 0.08, pan, send: 0.2 });
      noise({ dur: 0.06, freq: 2400, freqTo: 700, gain: 0.045, filter: 'bandpass', q: 2,
              shape: 3, delay: 0.05, pan });
    },

    /* ---------------- Phasen ---------------- */
    /* ---------------- Stimmung ----------------
       Wird viermal je Sekunde mit der Lage gefüttert: Bauphase oder
       Gefecht, wie schwer die Welle wiegt, wie nah es am Ende ist.
       Dazu der Pufferton — eine Drone, die mit der Ladung sinkt und
       erst hörbar wird, wenn es knapp wird. Man hört den Engpass,
       bevor man auf die Leiste sieht. */
    mood(o) {
      if (!ready()) return;
      buildBed(); buildNetz();
      if (!bed) return;
      const aus = o.phase === 'aus';        // Seite wird gelesen, nicht gespielt
      const kampf = o.phase === 'combat';
      const i = Math.max(0, Math.min(1, o.intensity || 0));
      const d = Math.max(0, Math.min(1, o.danger || 0));
      ziel(bed.drone.gain, aus ? 0 : (kampf ? 0.055 + 0.02 * i : 0.03), 1.2);
      // Der Puls schwingt um seinen Grundwert — die Tiefe bleibt darunter,
      // damit die Lautstärke nicht durch null kippt.
      ziel(bed.puls.gain, aus || !kampf ? 0 : 0.022 + 0.036 * i, 0.8);
      ziel(bed.lfoTiefe.gain, aus || !kampf ? 0 : 0.018 + 0.03 * i, 0.8);
      ziel(bed.lfo.frequency, 0.9 + 1.7 * i, 1.5);
      ziel(bed.flirren.gain, aus ? 0 : d * 0.026, 0.9);

      // Pufferton: sinkt beim Leerlaufen und wird dabei lauter
      const f = aus ? 1 : Math.max(0, Math.min(1, o.buffer === undefined ? 1 : o.buffer));
      const laut = f > 0.55 ? 0 : Math.pow((0.55 - f) / 0.55, 1.5) * 0.075;
      ziel(netz.g.gain, laut, 0.3);
      ziel(netz.o.frequency, 48 + 52 * f, 0.4);
      ziel(netz.o2.frequency, 24 + 26 * f, 0.4);
    },

    // Große Ereignisse drücken das Bett kurz weg, damit sie Platz haben
    duck(tiefe, dauer) {
      if (!bed || !actx) return;
      const t = actx.currentTime;
      bed.bus.gain.cancelScheduledValues(t);
      bed.bus.gain.setValueAtTime(bed.bus.gain.value, t);
      bed.bus.gain.linearRampToValueAtTime(1 - (tiefe || 0.7), t + 0.06);
      bed.bus.gain.linearRampToValueAtTime(1, t + (dauer || 1.4));
    },

    /* ---------------- Kernbefehle ----------------
       Alle drei aus demselben Puffer bezahlt, also auch klanglich
       verwandt: ein Aufladen, dann die Entspannung. */
    discharge() {
      nah();
      this.duck(0.6, 1.2);
      tone({ type: 'sine', freq: 60, to: 220, dur: 0.16, gain: 0.14, attack: 0.05 });
      noise({ dur: 0.06, freq: 7000, freqTo: 2000, gain: 0.24, filter: 'highpass',
              shape: 4, attack: 0.001, delay: 0.15 });
      tone({ type: 'sine', freq: 190, to: 32, dur: 0.75, gain: 0.3, attack: 0.004,
             delay: 0.15, send: 0.55 });
      noise({ dur: 0.8, freq: 3200, freqTo: 90, gain: 0.24, shape: 1.3, delay: 0.15, send: 0.6 });
      tone({ type: 'triangle', freq: 900, to: 240, dur: 0.3, gain: 0.07, delay: 0.15, send: 0.4 });
    },
    surge() {
      nah();
      tone({ type: 'sawtooth', freq: 110, to: 460, dur: 0.5, gain: 0.09,
             filter: 'lowpass', filterFreq: 1600, attack: 0.06, send: 0.35 });
      tone({ type: 'square', freq: 220, to: 880, dur: 0.45, gain: 0.045, attack: 0.05, send: 0.3 });
      noise({ dur: 0.5, freq: 400, freqTo: 4200, gain: 0.06, filter: 'bandpass',
              q: 1.4, shape: 0.6, attack: 0.08, send: 0.4 });
    },
    pulse() {
      nah();
      tone({ type: 'sine', freq: 420, to: 700, dur: 0.3, gain: 0.09, attack: 0.01, send: 0.35 });
      tone({ type: 'sine', freq: 630, to: 1050, dur: 0.34, gain: 0.05, attack: 0.02,
             delay: 0.05, send: 0.4 });
      noise({ dur: 0.3, freq: 2200, freqTo: 6000, gain: 0.035, filter: 'bandpass',
              q: 2, shape: 0.8, attack: 0.03, send: 0.3 });
    },
    /* ---------------- Kernmodi ----------------
       Umschalten klingt wie ein Relais, das abfällt; das Fertigmelden
       wie eines, das wieder einrastet. Dazwischen liegt der Anlauf. */
    modeSwitch() {
      nah();
      tone({ type: 'square', freq: 340, to: 150, dur: 0.14, gain: 0.05 });
      noise({ dur: 0.18, freq: 1800, freqTo: 400, gain: 0.05, filter: 'bandpass',
              q: 1.2, shape: 1.4, delay: 0.05, send: 0.25 });
    },
    modeReady() {
      nah();
      tone({ type: 'triangle', freq: 262, dur: 0.16, gain: 0.07, send: 0.25 });
      tone({ type: 'triangle', freq: 392, dur: 0.22, gain: 0.06, delay: 0.09, send: 0.35 });
    },
    // Spitzenlast: ein Akku wirft seine Ladung nach
    reserve() {
      nah();
      tone({ type: 'sawtooth', freq: 90, to: 300, dur: 0.32, gain: 0.08,
             filter: 'lowpass', filterFreq: 1400, attack: 0.02, send: 0.4 });
      tone({ type: 'sine', freq: 520, to: 880, dur: 0.26, gain: 0.05, delay: 0.06, send: 0.35 });
    },
    // Der Kernschild fängt einen Treffer ab
    shieldHit() {
      nah();
      if (!gate('shield', 0.14)) return;
      tone({ type: 'sine', freq: 620, to: 300, dur: 0.16, gain: 0.06, send: 0.3 });
      noise({ dur: 0.12, freq: 3000, freqTo: 900, gain: 0.05, filter: 'bandpass',
              q: 2.2, shape: 1.6, send: 0.25 });
    },

    // Ankündigung einer Sturmwelle: tiefer, unruhiger Zweiklang
    storm() {
      nah();
      this.duck(0.5, 2);
      tone({ type: 'sawtooth', freq: 130, to: 108, dur: 0.9, gain: 0.07,
             filter: 'lowpass', filterFreq: 800, attack: 0.1, send: 0.5 });
      tone({ type: 'sawtooth', freq: 196, to: 164, dur: 0.9, gain: 0.05, detune: 14,
             filter: 'lowpass', filterFreq: 900, attack: 0.14, delay: 0.06, send: 0.5 });
      noise({ dur: 1.1, freq: 300, freqTo: 1400, gain: 0.04, filter: 'bandpass',
              q: 0.9, shape: 0.5, attack: 0.3, send: 0.6 });
    },

    waveStart() {
      nah();
      [0, 0.16, 0.32].forEach((d, i) =>
        tone({ type: 'square', freq: i === 2 ? 494 : 370, dur: 0.15, gain: 0.07, delay: d,
               filter: 'lowpass', filterFreq: 2200, send: 0.35 }));
      tone({ type: 'sine', freq: 60, to: 40, dur: 0.7, gain: 0.14, send: 0.3 });
    },
    waveClear() {
      nah();
      [523, 659, 784].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.6, gain: 0.07, delay: i * 0.085,
               attack: 0.02, send: 0.45 }));
    },
    gameOver() {
      nah();
      this.duck(0.9, 3);
      tone({ type: 'sawtooth', freq: 320, to: 42, dur: 1.6, gain: 0.2, filter: 'lowpass',
             filterFreq: 1100, send: 0.5 });
      tone({ type: 'sine', freq: 160, to: 26, dur: 1.9, gain: 0.16, send: 0.4 });
      noise({ dur: 1.2, freq: 900, freqTo: 60, gain: 0.12, shape: 1.4, send: 0.6 });
    }
  };
})();
