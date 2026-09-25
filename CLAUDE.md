# CORE DEFENSE

Ein umgekehrtes Tower-Defense im Browser: Wellen kommen aus allen Richtungen, der Kern
in der Mitte ist zugleich das zu schützende Objekt und die Energiequelle der Türme.

Vanilla HTML/Canvas 2D, kein Build, keine Abhängigkeiten. Die klassischen
`<script>`-Dateien teilen sich einen globalen Scope — das ist Absicht, damit `file://`
läuft. Nicht zu Modulen umbauen.

## Dateien

- `js/config.js` — alle Zahlen, 62 Karten
- `js/entities.js`, `js/audio.js`
- `js/game.js` — das meiste
- `js/einfuehrung.js` — geführte erste Welle für neue Spieler, liest `game` nur von außen
- `js/landing.js` — nur die Landingpage
- `index.html` — Landingpage und Spiel in einem
- `style.css` (HUD), `landing.css` (Seite)

Einstieg: `README.md` ist die vollständige Referenz (`## Dateien` am Ende erklärt den
Aufbau), offene Ideen stehen in `IDEAS.md`. Ein guter erster Schritt ist: README.md und
IDEAS.md Abschnitt 6 lesen, dann `node tools/pruefen.js`.

## Regeln, die nicht im Code stehen

- **Alles auf Deutsch:** Oberfläche, Kommentare, Dokumentation und Commit-Nachrichten.
  Kommentare erklären, warum, nicht was — dem Ton der bestehenden folgen. Englisch ist
  nur, was der Build aus den deutschen Quellen erzeugt (`dist-web-en/`).
- **Live auf dheits.de läuft die englische Fassung** aus `dist-web-en/`, nicht die
  deutsche Landingpage. Der Ordner ist eingecheckt, weil der Nutzer ihn auf dem Server aus
  dem Repo holt und die Hashes vergleicht. Nach jeder Änderung am Spiel
  `tools/build-crazygames.sh web` laufen lassen und mitcommitten — `pruefen.js` schlägt
  sonst an.
  dheits.de cacht `js/` und CSS 30 Tage; der Build hängt deshalb in `dist-web-en/index.html`
  an jeden Verweis `?v=` plus Datei-Hash an.
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

## Englischer Export

Live auf dheits.de läuft die englische Fassung. Gebaut wird sie aus den echten
Quelldateien, statt sie doppelt im Repo zu pflegen:

```
tools/build-crazygames.sh web
```

Heraus kommt `dist-web-en/` (eingecheckt, siehe Regeln oben). Was dazukommt, liegt in
`tools/crazygames/`: `index.html` (Spielseite ohne Landingpage), `crazygames.css`
(das Spielfeld füllt das Fenster) und `sdk.js` — ohne CrazyGames-SDK bleibt davon die
Skalierung. Das Spiel selbst bleibt unverändert.

Der Export ist **englisch**, die Quellen bleiben deutsch. `uebersetzen.js` ersetzt beim
Build jede Zeichenkette, die in `en.js` steht, und bricht ab, wenn ein Text ohne
Übersetzung auftaucht, ein Eintrag verwaist oder ein Umlaut übrig bleibt. Wer im Spiel
einen Text ändert, muss deshalb auch `en.js` anpassen, sonst baut der Export nicht.
Einbuchstabige Texte (etwa `' Z'`) erkennt die Prüfung nicht und stehen von Hand im
Wörterbuch. Den übersetzten Stand spielt der Bot mit
`CD_QUELLE=dist-web-en node tools/bot.js 20 40`.

Die Einführung (`js/einfuehrung.js`, README-Abschnitt „Einführung“) gehört zum
Hauptspiel und wird mitkopiert; ihre englischen Texte stehen in `en.js` unter
`einfuehrung`.

Lesbarkeit: Das Spiel ist auf 1312×800 gebaut und schrumpft in kleinen Fenstern mit.
`sdk.js` berechnet dagegen einen Ausgleich `--ui-k` / `UIK` (Kehrwert der Verkleinerung,
höchstens 1,8), die Bedienflächen wachsen per CSS-`zoom` darum (`crazygames.css`), und
`lesbarkeit.js` stellt Canvas-Schriften und die Maße der Hover-Karte beim Build darauf
um. Unter 1180 Design-Pixeln Breite schaltet `.kompakt` auf die schmale Taskleiste
(Bauteile ohne Namen). Der Maßstab stammt aus dem CrazyGames-Test (16:9 ab 821×462 bei
devicePixelRatio 1) und gilt unverändert weiter, weil auch dheits.de in kleinen Fenstern
gelesen wird. Nach Änderungen an HUD oder Taskleiste in 821×462, 907×510 und 1920×1080
nachsehen.

### CrazyGames ist erledigt

Das Portal ist kein Ziel mehr. Zweimal eingereicht, zweimal abgelehnt: am 23.09.2026 als
CORE DEFENSE, am 25.09.2026 als Core Defense TD, beide Male mit derselben Begründung ohne
Einzelheiten („The overall quality of the game does not yet meet the expectations of our
platform“). Am 25.09.2026 wurde die Löschung des Entwicklerkontos beantragt (DSGVO
Art. 17, an submissions@crazygames.com). Damit sind auch die Punkte erledigt, die daran
hingen: die ungenutzten eingebetteten Schriften im Export, die Medien in
`tools/crazygames/medien/` und `listing.md`.

`tools/build-crazygames.sh` ohne Argument baut weiterhin `dist-crazygames/` samt Zip, mit
SDK und eingebetteten Schriften. Gebraucht wird das nicht mehr; die Namen bleiben, weil
die web-Variante auf denselben Dateien sitzt. Ein Rest steckt noch im Wörterbuch: In
`en.js` heißt das Spiel CORE DEFENSE TD, weil der Name auf CrazyGames durch die erste
Einreichung belegt war — die web-Variante ersetzt das beim Bauen wieder durch
CORE DEFENSE.

## Offen (alles dokumentiert)

- `IDEAS.md` Abschnitt 6: Maschen im Netz statt eines Baums (`recomputeSupply()` wählt
  heute genau einen Elternknoten — größter Hebel, nur mit Messung vorher/nachher), ein
  Gegner, der von außen schießt, Auflagen aufs Tagesfeld, Verlauf nach der Partie. Dazu die
  Frage nach einem Gipfel bei Welle 50 — braucht eine Entscheidung, keine Umsetzung.
- Balance (README): Der Moloch bei Welle 20 beendet 13,5 % aller Läufe. Der Nutzen der
  Kernmodi ist nicht gemessen. Beides zurückgestellt.
- Verworfen mit Begründung: dauerhafte Freischaltungen (`IDEAS.md` Abschnitt 3) —
  kollidieren mit Tagesfeld, Bestenliste und Messbarkeit.
