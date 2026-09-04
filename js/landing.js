'use strict';

/* Landingpage: Einblendungen, Vollbild und die Frage, ob das Spielfeld
   gerade überhaupt im Bild ist. */

// Abschnitte blenden beim Scrollen ein
const revealObserver = new IntersectionObserver((entries, obs) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('l-shown');
    obs.unobserve(e.target);
  }
}, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.l-reveal').forEach(el => revealObserver.observe(el));

/* Tastatur und Spieltakt laufen nur, solange das Spielfeld sichtbar ist —
   sonst startet die Leertaste beim Lesen ungewollt eine Welle. */
const stageEl = document.getElementById('stage');
if (stageEl && typeof game !== 'undefined') {
  new IntersectionObserver(entries => {
    game.inView = entries[entries.length - 1].intersectionRatio >= 0.3;
  }, { threshold: [0, 0.3, 0.6, 1] }).observe(stageEl);
}

// Spielblock auf die Containerbreite skalieren
const fitEl = document.getElementById('fit');
function fitStage() {
  if (!fitEl || !stageEl) return;
  stageEl.style.setProperty('--ui-scale', fitEl.clientWidth / 1312);
}
fitStage();
addEventListener('resize', fitStage, { passive: true });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage);

// Vollbild für den Spielbereich
const fsBtn = document.getElementById('fsBtn');
const viewport = document.getElementById('viewport');
if (fsBtn && viewport) {
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (viewport.requestFullscreen) viewport.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
    setTimeout(fitStage, 60);
  });
}
