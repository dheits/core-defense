'use strict';

/* Einführung für neue Spieler.

   Das Spiel selbst weiß nichts von ihr: Sie schaut von außen auf den
   Zustand (game.buildings, game.phase, game.draft …) und rückt einen
   Schritt weiter, sobald der Spieler getan hat, was dort steht. Ein
   Knopf bricht sie jederzeit ab, danach kommt sie nie wieder.

   Gezeigt wird sie nur, wer das Spiel zum ersten Mal öffnet: kein
   gespeicherter Lauf, keine Bestenliste, die Einführung nicht schon
   gesehen. Wer schon eine Partie beendet hat, kennt das Energienetz;
   wer neu ist, scheitert sonst genau daran, bevor er es verstanden hat.
   Auf CrazyGames ist das fast jeder Besucher. */

(function einfuehrung() {
  if (typeof game === 'undefined') return;

  const MERKER = 'cd_einfuehrung';
  const gesehen = () => { try { return !!localStorage.getItem(MERKER); } catch (e) { return false; } };
  const abhaken = () => { try { localStorage.setItem(MERKER, '1'); } catch (e) {} };

  if (gesehen() || game.bestenliste().length || game.buildings.size || game.wave) return;

  const turm = () => [...game.buildings.values()].some(b => b.def.turret);
  const hat = typ => [...game.buildings.values()].some(b => b.type === typ);

  /* Jeder Schritt: Text, was hervorgehoben wird, und wann er erledigt
     ist. `halten` friert den Bau-Countdown ein — wer liest, soll nicht
     nebenbei die erste Welle verpassen. */
  const SCHRITTE = [
    {
      text: 'This is your core. Everything inside its glow gets power. ' +
            'Pick the Blaster below (key 4) and place it next to the core.',
      ziel: '.card[data-type="blaster"]', kern: true, halten: true,
      fertig: turm
    },
    {
      text: 'The glow doesn\'t reach far. A Pylon (key 1) at its edge carries the grid ' +
            'further out — towers beyond it get power too.',
      ziel: '.card[data-type="pylon"]', halten: true,
      fertig: () => hat('pylon')
    },
    {
      text: 'The arrows at the edge show where the wave comes from. ' +
            'Put another tower on that side and start it when you are ready.',
      ziel: '#nextWave', halten: true,
      fertig: () => game.phase !== 'build'
    },
    {
      text: 'Every shot costs energy from the buffer, the blue bar at the top. ' +
            'When it runs dry, your towers stop firing — Reactors (key 2) refill it faster.',
      ziel: '#energyBar',
      fertig: () => game.phase === 'build' || !!game.draft
    },
    {
      text: 'Wave held. After every wave you pick a card; ' +
            'it lasts until the end of the run.',
      fertig: () => !game.draft
    },
    {
      text: 'Click a building to see its stats. From there you can upgrade, ' +
            'repair or sell it. Good luck!',
      // Eine Auswahl von vorher zählt nicht, sonst wäre der Schritt weg, bevor er gelesen ist
      start: () => { vorher = game.selected; },
      fertig: (s) => (!!game.selected && game.selected !== vorher) || s > 12
    }
  ];

  const stage = document.getElementById('stage');
  const box = document.createElement('div');
  box.id = 'einfuehrung';
  box.hidden = true;
  box.innerHTML = '<p></p><div class="ef-fuss"><span class="ef-schritt"></span>' +
                  '<button type="button" class="ghost">Skip tutorial</button></div>';
  stage.appendChild(box);
  const ring = document.createElement('div');
  ring.id = 'einfuehrungKern';
  ring.hidden = true;
  ring.style.left = CORE_PX.x + 'px';
  ring.style.top = CORE_PX.y + 'px';
  stage.appendChild(ring);

  let schritt = -1, seit = 0, markiert = null, halteBei = null, aus = false, vorher = null;

  function markieren(sel) {
    if (markiert) markiert.classList.remove('ef-ziel');
    markiert = sel ? document.querySelector(sel) : null;
    // Beim Energiebalken leuchtet die ganze Anzeige, nicht der schmale Balken
    if (markiert && markiert.id === 'energyBar') markiert = markiert.closest('.stat');
    if (markiert) markiert.classList.add('ef-ziel');
  }

  function zeigen(i) {
    schritt = i; seit = 0;
    const s = SCHRITTE[i];
    box.querySelector('p').textContent = s.text;
    box.querySelector('.ef-schritt').textContent = (i + 1) + '/' + SCHRITTE.length;
    box.hidden = false;
    ring.hidden = !s.kern;
    markieren(s.ziel);
    halteBei = s.halten ? game.buildTimer : null;
    if (s.start) s.start();
  }

  function beenden() {
    if (aus) return;
    aus = true;
    abhaken();
    box.hidden = true;
    ring.hidden = true;
    markieren(null);
    clearInterval(takt);
  }
  box.querySelector('button').onclick = beenden;

  const takt = setInterval(() => {
    // Erst wenn die Startanzeige zu ist und die Partie läuft
    if (!game.gestartet || !document.getElementById('overlay').hidden) return;
    if (game.over) return beenden();
    if (schritt < 0) return zeigen(0);
    seit += 0.2;
    if (halteBei !== null && game.phase === 'build') game.buildTimer = halteBei;
    if (SCHRITTE[schritt].fertig(seit)) {
      if (schritt + 1 < SCHRITTE.length) zeigen(schritt + 1);
      else beenden();
    }
  }, 200);
})();
