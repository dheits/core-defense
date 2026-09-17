'use strict';

/* CrazyGames-Export: Fenstergröße statt Container (ersetzt den Scale-Teil
   von landing.js), plus die SDK-Pflichtsignale. Kein Scroll-Kontext hier,
   also bleibt game.inView dauerhaft an. */

const stageEl = document.getElementById('stage');
const fitEl = document.getElementById('fit');
function fitStage() {
  if (!fitEl || !stageEl) return;
  stageEl.style.setProperty('--ui-scale', fitEl.clientWidth / 1312);
}
fitStage();
addEventListener('resize', fitStage, { passive: true });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage);

if (typeof game !== 'undefined') game.inView = true;

(async function crazygames() {
  const sdk = window.CrazyGames && window.CrazyGames.SDK;
  if (!sdk) return; // lokaler Test ohne das externe SDK-Skript

  try {
    await sdk.init();
  } catch (e) {
    console.warn('CrazyGames SDK init fehlgeschlagen', e);
  }
  // Erst nach init() erlaubt (davor meldet das SDK einen Fehler). Das Spiel
  // hat keine eigene Ladephase — game.js ist zu diesem Zeitpunkt schon
  // fertig ausgeführt, also folgt loadingStop() direkt hinterher.
  try { sdk.game.loadingStart(); sdk.game.loadingStop(); } catch (e) {}

  // gameplayStart/Stop an dieselbe Bedingung gehängt, die auch der eigene
  // Render-Loop für "läuft die Simulation gerade" benutzt (game.js, frame()):
  // !game.paused && !game.over && Overlay unsichtbar. Von außen abgefragt,
  // statt es in game.js zu verdrahten.
  let playing = null;
  let wasOver = false;
  setInterval(() => {
    if (typeof game === 'undefined') return;
    const overlay = document.getElementById('overlay');
    const active = !game.paused && !game.over && !!overlay && overlay.hidden;
    if (active !== playing) {
      playing = active;
      try { active ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); } catch (e) {}
    }

    // Midgame-Ad am einzigen echten Bruchpunkt der Partie: wenn der Kern
    // fällt. Einmal pro Game-Over, nicht bei jeder Pause/jedem Kartenzug.
    if (game.over && !wasOver) {
      wasOver = true;
      try {
        sdk.ad.requestAd('midgame', { adStarted() {}, adFinished() {}, adError() {} });
      } catch (e) {}
    }
    if (!game.over) wasOver = false;
  }, 250);
})();
