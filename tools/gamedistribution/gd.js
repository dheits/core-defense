
/* GameDistribution-Export: Werbung an den Knöpfen der Anzeige und die beiden
   Pflichtereignisse des SDK. Das SDK selbst lädt index.html im Kopf, weil es
   vor dem Spiel da sein muss; hier hängt nur, was das Spiel von außen braucht.
   Läuft im Export hinter dem Fenster-Teil von sdk.js. */
(function gamedistribution() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  const ABSTAND_MS = 60000;              // zwischen zwei Anzeigen, auch über ein Neuladen hinweg
  const MERKER = 'cd_gd_werbung';
  const zuletzt = () => { try { return +sessionStorage.getItem(MERKER) || 0; } catch (e) { return 0; } };
  const merken = () => { try { sessionStorage.setItem(MERKER, String(Date.now())); } catch (e) { /* egal */ } };

  /* SDK_GAME_PAUSE / SDK_GAME_START: Spiel anhalten und Ton aus, solange die
     Anzeige läuft. Was der Spieler vorher selbst eingestellt hatte (Pause,
     Ton aus), bleibt danach so. */
  let hattePause = false, hatteStumm = false, inWerbung = false;
  function stumm(an) {
    if (typeof SFX === 'undefined' || SFX.muted === an) return;
    SFX.toggle();
    const b = document.getElementById('muteBtn');
    if (b) b.innerHTML = SFX.muted ? '&#128263;' : '&#128266;';
  }
  window.gdEvent = function (ev) {
    if (!ev || typeof game === 'undefined') return;
    if (ev.name === 'SDK_GAME_PAUSE' && !inWerbung) {
      inWerbung = true;
      hattePause = game.paused;
      hatteStumm = typeof SFX !== 'undefined' && SFX.muted;
      if (!game.paused) togglePause();
      stumm(true);
    } else if (ev.name === 'SDK_GAME_START' && inWerbung) {
      inWerbung = false;
      if (game.paused && !hattePause) togglePause();
      stumm(hatteStumm);
    }
  };

  /* Werbung nur als unmittelbare Antwort auf einen Klick, und nur an den
     Knöpfen der Anzeige: Start („Tagesfeld", „Freies Feld", „Fortsetzen") und
     „Neu starten" nach dem Kernverlust. Der zweite Knopf am Spielende
     kopiert nur das Ergebnis und bekommt keine. Der Klick wird gehalten, bis
     die Anzeige vorbei ist, und dann erneut ausgelöst. */
  let frei = false, wartet = false;
  overlay.addEventListener('click', ev => {
    if (frei) return;
    const knopf = ev.target && ev.target.closest && ev.target.closest('button');
    if (!knopf) return;
    if (wartet) { ev.stopImmediatePropagation(); ev.preventDefault(); return; }
    const zaehlt = knopf.id === 'ovBtn' || (knopf.id === 'ovBtn2' && !game.over);
    if (!zaehlt || !window.gdsdk || typeof window.gdsdk.showAd !== 'function') return;
    if (Date.now() - zuletzt() < ABSTAND_MS) return;

    ev.stopImmediatePropagation();
    ev.preventDefault();
    wartet = true;
    merken();
    let fertig = false;
    const weiter = () => {
      if (fertig) return;
      fertig = true;
      wartet = false;
      frei = true;
      try { knopf.click(); } finally { frei = false; }
    };
    try {
      const p = window.gdsdk.showAd();
      if (p && typeof p.then === 'function') p.then(weiter, weiter); else weiter();
    } catch (e) { weiter(); }
  }, true);
})();
