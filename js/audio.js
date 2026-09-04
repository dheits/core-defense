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
  let muted = localStorage.getItem('cd_muted') === '1';
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
    if (actx.createStereoPanner) {
      const p = actx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
      g.connect(p);
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

  return {
    unlock() { init(); if (actx && actx.state === 'suspended') actx.resume(); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      localStorage.setItem('cd_muted', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : volume;
      return muted;
    },

    /* ---------------- Türme ----------------
       Jeder Schuss: Anschlag, Körper, Ausklang — mit Streuung, damit
       zwanzig Blaster nicht wie ein einziger Automat klingen. */
    blaster(pan) {
      if (!gate('blaster', 0.04)) return;
      const v = R(0.92, 1.08);
      noise({ dur: 0.018, freq: 5200 * v, freqTo: 2200, gain: 0.05, filter: 'highpass',
              shape: 3, attack: 0.001, pan });
      tone({ type: 'triangle', freq: 720 * v, to: 190, dur: 0.055, gain: 0.05,
             attack: 0.002, pan, send: 0.08 });
      noise({ dur: 0.085, freq: 1500 * v, freqTo: 420, gain: 0.028, filter: 'bandpass',
              q: 1.6, shape: 2, pan, send: 0.12 });
    },
    cannon(pan) {
      if (!gate('cannon', 0.07)) return;
      const v = R(0.94, 1.06);
      noise({ dur: 0.03, freq: 6000, freqTo: 1800, gain: 0.13, filter: 'highpass',
              shape: 4, attack: 0.001, pan });
      tone({ type: 'sine', freq: 165 * v, to: 42, dur: 0.3, gain: 0.2, attack: 0.003,
             pan, send: 0.3 });
      tone({ type: 'sine', freq: 74 * v, to: 28, dur: 0.5, gain: 0.14, attack: 0.006,
             pan, send: 0.25 });
      noise({ dur: 0.34, freq: 1900, freqTo: 130, gain: 0.1, shape: 1.6, pan, send: 0.4 });
    },
    frost(pan) {
      if (!gate('frost', 0.06)) return;
      const v = R(0.95, 1.06);
      noise({ dur: 0.16, freq: 900 * v, freqTo: 6500, gain: 0.05, filter: 'bandpass',
              q: 2.4, shape: 0.7, attack: 0.012, pan, send: 0.25 });
      tone({ type: 'triangle', freq: 620 * v, to: 1900, dur: 0.14, gain: 0.03,
             attack: 0.01, pan, send: 0.2 });
    },

    /* ---------------- Treffer und Abschüsse ----------------
       Ein Abschuss ist ein Bersten: harter Anschlag, kurzer Körper,
       Rauschfahne nach unten. */
    kill(boss, pan) {
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
      const v = R(0.9, 1.12);
      noise({ dur: 0.022, freq: 5000 * v, gain: 0.07, filter: 'highpass', shape: 3,
              attack: 0.001, pan });
      noise({ dur: 0.17, freq: 2300 * v, freqTo: 280, gain: 0.08, filter: 'bandpass',
              q: 1.2, shape: 1.8, pan, send: 0.22 });
      tone({ type: 'triangle', freq: 240 * v, to: 70, dur: 0.13, gain: 0.05,
             attack: 0.002, pan, send: 0.18 });
    },
    buildingHit(pan) {
      if (!gate('bhit', 0.12)) return;
      noise({ dur: 0.03, freq: 3800, gain: 0.05, filter: 'highpass', shape: 3,
              attack: 0.001, pan });
      noise({ dur: 0.1, freq: 700, freqTo: 200, gain: 0.05, shape: 2, pan, send: 0.15 });
      tone({ type: 'square', freq: R(150, 200), to: 85, dur: 0.07, gain: 0.03, pan });
    },
    buildingLost(pan) {
      noise({ dur: 0.04, freq: 6000, gain: 0.16, filter: 'highpass', shape: 4, attack: 0.001, pan });
      noise({ dur: 0.55, freq: 1700, freqTo: 80, gain: 0.2, shape: 1.5, pan, send: 0.5 });
      tone({ type: 'sawtooth', freq: 190, to: 38, dur: 0.5, gain: 0.12, filter: 'lowpass',
             filterFreq: 900, pan, send: 0.35 });
    },
    coreHit(pan) {
      if (!gate('core', 0.18)) return;
      tone({ type: 'sine', freq: 96, to: 34, dur: 0.45, gain: 0.26, attack: 0.004, send: 0.45, pan });
      tone({ type: 'triangle', freq: 320, to: 130, dur: 0.18, gain: 0.06, send: 0.3, pan });
      noise({ dur: 0.35, freq: 900, freqTo: 110, gain: 0.11, shape: 1.6, send: 0.4, pan });
    },

    /* ---------------- Bau-Interaktion ---------------- */
    build() {
      tone({ type: 'triangle', freq: 440, dur: 0.07, gain: 0.09, send: 0.1 });
      tone({ type: 'triangle', freq: 660, dur: 0.12, gain: 0.09, delay: 0.06, send: 0.15 });
      noise({ dur: 0.1, freq: 2600, freqTo: 800, gain: 0.035, filter: 'bandpass', q: 1.5 });
    },
    sell() {
      tone({ type: 'triangle', freq: 620, dur: 0.08, gain: 0.08 });
      tone({ type: 'triangle', freq: 330, dur: 0.14, gain: 0.08, delay: 0.06, send: 0.12 });
    },
    upgrade() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.17, gain: 0.075, delay: i * 0.06, send: 0.2 }));
    },
    deny() {
      if (!gate('deny', 0.12)) return;
      tone({ type: 'square', freq: 175, to: 120, dur: 0.11, gain: 0.06 });
    },
    lowPower() {
      if (!gate('low', 1.6)) return;
      tone({ type: 'sawtooth', freq: 300, to: 110, dur: 0.3, gain: 0.06,
             filter: 'lowpass', filterFreq: 900, send: 0.2 });
    },
    select() {
      if (!gate('sel', 0.05)) return;
      tone({ type: 'sine', freq: 880, dur: 0.05, gain: 0.045 });
    },
    alarm() {
      if (!gate('alarm', 2.6)) return;
      tone({ type: 'square', freq: 466, dur: 0.17, gain: 0.075, filter: 'lowpass',
             filterFreq: 1900, send: 0.3 });
      tone({ type: 'square', freq: 349, dur: 0.22, gain: 0.075, delay: 0.21,
             filter: 'lowpass', filterFreq: 1900, send: 0.3 });
      tone({ type: 'sine', freq: 92, to: 68, dur: 0.55, gain: 0.11, send: 0.2 });
    },

    /* ---------------- Phasen ---------------- */
    waveStart() {
      [0, 0.16, 0.32].forEach((d, i) =>
        tone({ type: 'square', freq: i === 2 ? 494 : 370, dur: 0.15, gain: 0.07, delay: d,
               filter: 'lowpass', filterFreq: 2200, send: 0.35 }));
      tone({ type: 'sine', freq: 60, to: 40, dur: 0.7, gain: 0.14, send: 0.3 });
    },
    waveClear() {
      [523, 659, 784].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.6, gain: 0.07, delay: i * 0.085,
               attack: 0.02, send: 0.45 }));
    },
    gameOver() {
      tone({ type: 'sawtooth', freq: 320, to: 42, dur: 1.6, gain: 0.2, filter: 'lowpass',
             filterFreq: 1100, send: 0.5 });
      tone({ type: 'sine', freq: 160, to: 26, dur: 1.9, gain: 0.16, send: 0.4 });
      noise({ dur: 1.2, freq: 900, freqTo: 60, gain: 0.12, shape: 1.4, send: 0.6 });
    }
  };
})();
