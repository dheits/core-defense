'use strict';

/* ---------------------------------------------------------------
   Prozeduraler Sound über die WebAudio-API — keine Asset-Dateien.
   Der AudioContext startet erst nach der ersten Nutzergeste
   (Browser-Autoplay-Regel), SFX.unlock() erledigt das.
---------------------------------------------------------------- */
const SFX = (() => {
  let actx = null, master = null, comp = null;
  let muted = localStorage.getItem('cd_muted') === '1';
  let volume = 0.55;
  const last = {};                       // Throttle-Zeitstempel je Sound

  function init() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 8;
    master = actx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp);
    comp.connect(actx.destination);
  }

  function ready() {
    if (muted) return false;             // stumm: gar keine Nodes erzeugen
    if (!actx) init();
    if (!actx) return false;
    if (actx.state === 'suspended') actx.resume();
    return !muted;
  }

  // Mindestabstand zwischen zwei gleichen Sounds (in Sekunden, Echtzeit)
  function gate(name, minGap) {
    const t = performance.now() / 1000;
    if (last[name] && t - last[name] < minGap) return false;
    last[name] = t;
    return true;
  }

  /* Ein Oszillator-Ton mit Hüllkurve und optionalem Frequenz-Slide */
  function tone(o) {
    if (!ready()) return;
    const t0 = actx.currentTime + (o.delay || 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;

    const peak = (o.gain || 0.1);
    const atk = o.attack !== undefined ? o.attack : 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    let node = osc;
    if (o.filter) {
      const f = actx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq || 1200;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  /* Rauschimpuls — für Treffer, Explosionen, Einschläge */
  function noise(o) {
    if (!ready()) return;
    const t0 = actx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.2;
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buf;

    const f = actx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1400, t0);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t0 + dur);
    f.Q.value = o.q || 1;

    const g = actx.createGain();
    g.gain.setValueAtTime(o.gain || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const R = (a, b) => a + Math.random() * (b - a);

  const api = {
    unlock() { init(); if (actx && actx.state === 'suspended') actx.resume(); },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      localStorage.setItem('cd_muted', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : volume;
      return muted;
    },

    /* --- Türme --- */
    blaster() {
      if (!gate('blaster', 0.045)) return;
      tone({ type: 'square', freq: R(520, 620), to: 220, dur: 0.07, gain: 0.035 });
      noise({ dur: 0.05, freq: 3000, freqTo: 900, gain: 0.025, filter: 'bandpass', q: 2 });
    },
    cannon() {
      if (!gate('cannon', 0.09)) return;
      tone({ type: 'sine', freq: R(150, 175), to: 46, dur: 0.26, gain: 0.16 });
      tone({ type: 'square', freq: 220, to: 70, dur: 0.1, gain: 0.05 });
      noise({ dur: 0.22, freq: 1600, freqTo: 180, gain: 0.09 });
    },
    frost() {
      if (!gate('frost', 0.07)) return;
      tone({ type: 'triangle', freq: R(820, 900), to: 1750, dur: 0.13, gain: 0.045 });
      noise({ dur: 0.12, freq: 4200, freqTo: 7000, gain: 0.02, filter: 'highpass' });
    },

    /* --- Treffer und Zerstörung --- */
    kill(boss) {
      if (boss) {
        noise({ dur: 0.75, freq: 1800, freqTo: 60, gain: 0.3 });
        tone({ type: 'sine', freq: 110, to: 28, dur: 0.8, gain: 0.28 });
        tone({ type: 'sawtooth', freq: 70, to: 24, dur: 0.6, gain: 0.1 });
        return;
      }
      if (!gate('kill', 0.05)) return;
      noise({ dur: 0.13, freq: R(1800, 2600), freqTo: 380, gain: 0.075, filter: 'bandpass', q: 1.4 });
    },
    buildingHit() {
      if (!gate('bhit', 0.14)) return;
      noise({ dur: 0.09, freq: 900, freqTo: 260, gain: 0.05 });
      tone({ type: 'square', freq: R(160, 200), to: 90, dur: 0.06, gain: 0.03 });
    },
    buildingLost() {
      noise({ dur: 0.5, freq: 1500, freqTo: 90, gain: 0.2 });
      tone({ type: 'sawtooth', freq: 190, to: 42, dur: 0.45, gain: 0.12 });
    },
    coreHit() {
      if (!gate('core', 0.2)) return;
      tone({ type: 'sine', freq: 96, to: 38, dur: 0.42, gain: 0.26 });
      tone({ type: 'triangle', freq: 300, to: 140, dur: 0.16, gain: 0.07 });
      noise({ dur: 0.3, freq: 700, freqTo: 120, gain: 0.11 });
    },

    /* --- Bau-Interaktion --- */
    build() {
      tone({ type: 'triangle', freq: 440, dur: 0.07, gain: 0.09 });
      tone({ type: 'triangle', freq: 660, dur: 0.11, gain: 0.09, delay: 0.06 });
      noise({ dur: 0.09, freq: 2400, freqTo: 900, gain: 0.035, filter: 'bandpass', q: 1.5 });
    },
    sell() {
      tone({ type: 'triangle', freq: 620, dur: 0.08, gain: 0.08 });
      tone({ type: 'triangle', freq: 330, dur: 0.13, gain: 0.08, delay: 0.06 });
    },
    upgrade() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.075, delay: i * 0.06 }));
    },
    deny() {
      if (!gate('deny', 0.12)) return;
      tone({ type: 'square', freq: 175, to: 120, dur: 0.11, gain: 0.06 });
    },
    lowPower() {
      if (!gate('low', 1.6)) return;
      tone({ type: 'sawtooth', freq: 300, to: 110, dur: 0.28, gain: 0.06, filter: 'lowpass', filterFreq: 900 });
    },
    select() {
      if (!gate('sel', 0.05)) return;
      tone({ type: 'sine', freq: 880, dur: 0.05, gain: 0.045 });
    },

    /* --- Phasen --- */
    waveStart() {
      [0, 0.16, 0.32].forEach((d, i) =>
        tone({ type: 'square', freq: i === 2 ? 494 : 370, dur: 0.15, gain: 0.07, delay: d, filter: 'lowpass', filterFreq: 2200 }));
      tone({ type: 'sine', freq: 60, to: 40, dur: 0.7, gain: 0.14 });
    },
    waveClear() {
      [523, 659, 784].forEach((f, i) =>
        tone({ type: 'triangle', freq: f, dur: 0.55, gain: 0.07, delay: i * 0.085, attack: 0.02 }));
    },
    gameOver() {
      tone({ type: 'sawtooth', freq: 320, to: 42, dur: 1.6, gain: 0.2, filter: 'lowpass', filterFreq: 1100 });
      tone({ type: 'sine', freq: 160, to: 26, dur: 1.9, gain: 0.16 });
      noise({ dur: 1.2, freq: 900, freqTo: 60, gain: 0.12 });
    }
  };
  return api;
})();
