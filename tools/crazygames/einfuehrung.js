'use strict';

/* Einführung für neue Spieler im CrazyGames-Export.

   Das Spiel selbst weiß nichts von ihr: Sie schaut von außen auf den
   Zustand (game.buildings, game.phase, game.draft …) und rückt einen
   Schritt weiter, sobald der Spieler getan hat, was dort steht. Ein
   Knopf bricht sie jederzeit ab, danach kommt sie nie wieder.

   Gezeigt wird sie nur, wer das Spiel zum ersten Mal öffnet: kein
   gespeicherter Lauf, keine Bestenliste, die Einführung nicht schon
   gesehen. Auf CrazyGames ist das fast jeder Besucher — und genau der
   scheitert heute am Energienetz, bevor er es verstanden hat. */

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
      text: 'Das ist dein Kern. Alles in seinem Leuchten bekommt Strom. ' +
            'Wähle unten den Blaster (Taste 4) und setze ihn neben den Kern.',
      ziel: '.card[data-type="blaster"]', kern: true, halten: true,
      fertig: turm
    },
    {
      text: 'Das Leuchten reicht nicht weit. Ein Pylon (Taste 1) am Rand trägt das Netz ' +
            'weiter nach außen — Türme dahinter bekommen dann auch Strom.',
      ziel: '.card[data-type="pylon"]', halten: true,
      fertig: () => hat('pylon')
    },
    {
      text: 'Die Pfeile am Spielfeldrand zeigen, woher die Welle kommt. ' +
            'Stell dort noch einen Turm hin und starte sie, wenn du bereit bist.',
      ziel: '#nextWave', halten: true,
      fertig: () => game.phase !== 'build'
    },
    {
      text: 'Jeder Schuss kostet Energie aus dem Puffer, dem blauen Balken oben. ' +
            'Ist er leer, schweigen die Türme — Reaktoren (Taste 2) liefern Nachschub.',
      ziel: '#energyBar',
      fertig: () => game.phase === 'build' || !!game.draft
    },
    {
      text: 'Welle gehalten. Nach jeder Welle wählst du eine Karte, ' +
            'sie gilt bis zum Ende der Partie.',
      fertig: () => !game.draft
    },
    {
      text: 'Ein Klick auf einen Bau zeigt seine Werte. Dort baust du ihn aus, ' +
            'reparierst ihn oder baust ihn ab. Viel Erfolg!',
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
                  '<button type="button" class="ghost">Einführung überspringen</button></div>';
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
