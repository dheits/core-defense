# CORE DEFENSE

Ein umgekehrtes Tower-Defense im Browser: Wellen kommen aus allen Richtungen, der Kern
in der Mitte ist zugleich das zu schützende Objekt und die Energiequelle der Türme.

Vanilla HTML/Canvas 2D, kein Build, keine Abhängigkeiten. Vier klassische
`<script>`-Dateien teilen sich einen globalen Scope — das ist Absicht, damit `file://`
läuft. Nicht zu Modulen umbauen.

## Dateien

- `js/config.js` — alle Zahlen, 62 Karten
- `js/entities.js`, `js/audio.js`
- `js/game.js` — das meiste
- `js/landing.js` — nur die Landingpage
- `index.html` — Landingpage und Spiel in einem
- `style.css` (HUD), `landing.css` (Seite)

Einstieg: `README.md` ist die vollständige Referenz (`## Dateien` am Ende erklärt den
Aufbau), offene Ideen stehen in `IDEAS.md`. Ein guter erster Schritt ist: README.md und
IDEAS.md Abschnitt 6 lesen, dann `node tools/pruefen.js`.

## Regeln, die nicht im Code stehen

- **Alles auf Deutsch:** Oberfläche, Kommentare, Dokumentation und Commit-Nachrichten.
  Kommentare erklären, warum, nicht was — dem Ton der bestehenden folgen.
- **`config.js` ist die Wahrheit.** Landingpage, README und Kartentexte werden gegen sie
  geprüft, nicht umgekehrt.
- **Zahlen im HUD mit Komma** (`dez()` in `entities.js`), nicht mit Punkt.
- **Commits** enden mit der Attribution-Zeile, die die Sitzung vorgibt.
- **Kein Deploy:** Die Übertragung auf dheits.de macht der Nutzer selbst, woanders. Hier
  wird nur entwickelt — keine Deploy-Schritte vorschlagen, keine SSH-Verbindung, den
  Live-Stand nicht ungefragt abgleichen.

## Prüfen

```
node tools/pruefen.js
```

Prüfungen in Gruppen, ohne Browser und ohne Bibliothek. `tools/harness.js` lädt das
ganze Spiel in node (DOM-, Canvas- und localStorage-Stubs plus indirektes `eval`); was
geprüft werden soll, muss am Ende der Exportliste stehen. Vier Arten: Verdrahtung (aus
config abgeleitet), Balance-Anker (fest), Kartentexte gegen ihre Wirkung,
Landingpage/README gegen config.

Jede neue Prüfgruppe wird **mutationsgetestet**: Implementierung absichtlich kaputt
machen, schauen, ob die Prüfung anschlägt, zurücknehmen. Das hat mehrfach Prüfungen
entlarvt, die nichts geprüft haben.

## Balance messen

```
node tools/bot.js 100 40
```

Simulierter Spieler. Schalter: `noflow`, `nomod`, `nopower`, `noakku`, `nomode`,
`nodruck`, `schief`, `nogelaende`, `neu`, `stuetzen`, `log`. Dazu `tools/schaden.js`
(Schaden je Turmtyp) und `tools/stuetzen.js` (gepaarte Messung Werkdrohne/Schildfeld).
Ausführlich im README-Abschnitt „Balance messen".

Drei Messfallen:

1. Kennzahl ist der **Median**, nicht der Schnitt (bimodale Verteilung).
2. Unter 60 Läufen ist ein Unterschied von unter etwa 5 Wellen Rauschen.
3. Der Bot ist ein schwacher Stellvertreter: Er nutzt weder Lastpriorität noch
   Überladung, verschiebt nicht und stellt Reaktoren nicht planvoll an überlastete Äste.
   Zahlen nur gegen dieselbe Bot-Version vergleichen, Konfiguration gegen Konfiguration
   in einem Durchgang.

## Im Browser ansehen

`.claude/launch.json` startet `python3 -m http.server 8123`. Achtung Cache: Der Browser
liefert `style.css` und `game.js` gern alt aus. Ein `?v=…` an der HTML hilft nicht — die
Stylesheet-`href` neu setzen oder headless Chrome mit frischem Profil nehmen.

## CrazyGames-Export

`tools/build-crazygames.sh` baut `dist-crazygames/` und `dist-crazygames.zip` (beide
gitignored) aus den echten Quelldateien, ohne sie zu duplizieren. Was dazukommt, liegt in
`tools/crazygames/`: `index.html` (Spielseite ohne Landingpage), `sdk.js` (SDK v3,
gameplayStart/Stop), `crazygames.css`, `fonts.css` (Schriften als Base64 eingebettet,
SIL OFL 1.1, damit keine Anfrage an Google geht) und `listing.md` (Text fürs Formular).
Das Spiel selbst bleibt unverändert.

Der Export ist **englisch**, die Quellen bleiben deutsch. `uebersetzen.js` ersetzt beim
Build jede Zeichenkette, die in `en.js` steht, und bricht ab, wenn ein Text ohne
Übersetzung auftaucht, ein Eintrag verwaist oder ein Umlaut übrig bleibt. Wer im Spiel
einen Text ändert, muss deshalb auch `en.js` anpassen, sonst baut der Export nicht.
Einbuchstabige Texte (etwa `' Z'`) erkennt die Prüfung nicht und stehen von Hand im
Wörterbuch. Den übersetzten Stand spielt der Bot mit
`CD_QUELLE=dist-crazygames node tools/bot.js 20 40`.

Stand: CrazyGames hat die Einreichung am 23.09.2026 mit der Begründung „overall quality
does not yet meet the expectations" abgelehnt, ohne Details. Vermutete Gründe (nicht
bestätigt): durchgehend deutsche Oberfläche, kein Tutorial, steiler Einstieg über Energienetz
und Versorgungsradius. Ob das Spiel international werden soll, ist eine offene
Entscheidung des Nutzers.

## Offen (alles dokumentiert)

- `IDEAS.md` Abschnitt 6: Maschen im Netz statt eines Baums (`recomputeSupply()` wählt
  heute genau einen Elternknoten — größter Hebel, nur mit Messung vorher/nachher), ein
  Gegner, der von außen schießt, Auflagen aufs Tagesfeld, Verlauf nach der Partie. Dazu die
  Frage nach einem Gipfel bei Welle 50 — braucht eine Entscheidung, keine Umsetzung.
- Balance (README): Der Moloch bei Welle 20 beendet 13,5 % aller Läufe. Der Nutzen der
  Kernmodi ist nicht gemessen. Beides zurückgestellt.
- Verworfen mit Begründung: dauerhafte Freischaltungen (`IDEAS.md` Abschnitt 3) —
  kollidieren mit Tagesfeld, Bestenliste und Messbarkeit.
