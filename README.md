# CORE DEFENSE

Ein Tower-Defense-Spiel mit umgedrehter Geometrie: **die Angriffe kommen von außen**,
du baust vom Zentrum nach außen. In der Mitte steht der Kern — gleichzeitig Schutzobjekt
und Energiequelle deiner Türme.

## Starten

`index.html` im Browser öffnen (Doppelklick reicht, es gibt keinen Build-Schritt).
Die Seite ist eine Landingpage, in der das Spiel eingebettet läuft — Abschnitt
„Die Anlage in Betrieb", dort auch der Vollbild-Knopf.
Oder mit lokalem Server:

```bash
python3 -m http.server 8123 --directory ~/Developer/core-defense
```

## Die zwei Kernmechaniken

**1. Energienetz statt Laufwege.** Türme arbeiten nur im Versorgungsradius des Kerns oder
eines Pylons. Pylone zählen selbst nur als Netzknoten, wenn sie versorgt sind — die
Verteidigung wächst also zwingend als Kette von innen nach außen. Ein Turm außerhalb des
Netzes blinkt rot und feuert nicht.

**2. Schüsse kosten Energie.** Jeder Schuss zieht aus dem Energiepuffer, der mit
9/s nachlädt. Bei zu vielen Türmen versiegt mitten in der Welle das Feuer — Reaktoren
erhöhen Regeneration und Speicher.

Zweite Währung ist **Materie**: fällt bei jedem Abschuss an und bezahlt alle Bauten.

**3. Karten zwischen den Wellen.** Nach jeder abgewehrten Welle sind vier von 48 Karten
zur Wahl, die für den Rest der Partie gelten. Der Pool hat fünf Sorten:

- **Grundwerte** für alle Türme — Reichweite, Schaden, Feuerrate, Energie, Struktur
- **Turmspezifisch** — „Kanonen: +50 % Schaden" nützt nur, wer Kanonen gebaut hat
- **Antworten auf Gegner** — Durchschlagmunition, Flakmunition, Schildbrecher, Kettenblitz
- **Zielkonflikte** — +38 % Schaden für 18 % weniger Struktur, 28 % billiger bauen für
  weniger Struktur, mehr Materie für einen kleineren Kern
- **Regeländerungen statt Zahlen** — Dornenbarrieren verletzen ihre Angreifer, der Kern
  stößt zurück, Türme ohne Netz feuern mit halber Rate, über 85 % Puffer feuern alle
  Türme überladen zum normalen Preis

Jede Karte lässt sich höchstens viermal nehmen, einige nur einmal; seltene Karten
erscheinen entsprechend ihrem Gewicht seltener. Beides hält Partien auseinander.

## Steuerung

| Eingabe | Wirkung |
|---|---|
| `1`–`6` / Klick auf Karte | Gebäude wählen |
| Linksklick | bauen bzw. bestehendes Gebäude auswählen |
| Rechtsklick | Auswahl abbrechen / Gebäude abbauen (60 % zurück) |
| `U` / `S` | ausgewähltes Gebäude ausbauen / abbauen |
| Leertaste | Welle sofort starten (Restzeit gibt Bonus-Materie) |
| `P` | Pause, Button oben rechts: 1× / 2× / 3× |
| `M` / Lautsprecher-Button | Ton an/aus (wird gespeichert) |
| `O` | Überladung des gewählten Turms |
| `L` | Lastpriorität des gewählten Turms |
| `1`–`3` bei der Kartenwahl | Karte nehmen |
| `Esc` | alles abwählen |

## Energie im Gefecht

**Überladung** (`O`): doppelter Schaden für den dreifachen Energiehunger. Gedacht für
den Moment, nicht für dauerhaft — ein überladener Blaster leert den Puffer schneller,
als der Kern ihn füllt.

**Lastpriorität** (`L`): jeder Turm steht auf *Vorrang*, *Normal* oder *Sparlast*.
Türme feuern in dieser Reihenfolge, und die unteren Stufen fassen den Puffer erst an,
wenn er über ihrer Schwelle steht (Normal ab 20 %, Sparlast ab 55 %). So bleibt im
Engpass Energie für die Seite, die wirklich halten muss, statt dass alle gleichzeitig
verstummen. Abweichende Stufen stehen als Buchstabe am Turm.

## Sound

Alle Effekte werden zur Laufzeit über die WebAudio-API synthetisiert — keine Audio-Dateien,
nichts nachzuladen. `js/audio.js` enthält zwei Bausteine (`tone` für Oszillator-Töne mit
Hüllkurve und Frequenz-Slide, `noise` für gefilterte Rauschimpulse); daraus setzen sich
Turmfeuer, Treffer, Bau- und Phasen-Signale zusammen.

Der AudioContext startet erst nach der ersten Nutzergeste (Browser-Autoplay-Regel).
Häufige Sounds sind pro Typ zeitlich gedrosselt, damit zwanzig Blaster nicht in eine
Rauschwand kippen, und leicht in der Tonhöhe variiert. Ein Kompressor auf dem Master
fängt Spitzen ab. Bei stumm geschaltetem Ton werden gar keine Audio-Nodes erzeugt.

## Gebäude

- **Pylon** (20) — trägt das Netz weiter, Radius 4,2 Zellen
- **Reaktor** (55) — +5 Energie/s, +45 Speicher (skaliert mit Ausbaustufe)
- **Blaster** (30) — schnelles, billiges Dauerfeuer
- **Kanone** (65) — langsam, hoher Flächenschaden
- **Frostturm** (45) — Sofortstrahl, bremst Gegner um 50 %
- **Barriere** (10) — braucht keinen Strom, lenkt Bodentruppen um

Jedes Gebäude hat drei Ausbaustufen (+35 % Schaden, +8 % Reichweite, mehr Struktur).

## Gegner

Crawler ab Welle 1, Runner ab 2, Brute ab 4, Drohne ab 6, Mender ab 8,
Titan als Boss alle 10 Wellen. Jeder Typ ab Welle 2 bringt eine Eigenschaft mit,
die einen bestimmten Turm erzwingt:

| Gegner | Eigenschaft | Antwort |
|---|---|---|
| Runner | kaum bremsbar (Verlangsamung wirkt nur zu 45 %) | Feuerkraft statt Frost |
| Brute | Panzerung 6 — **von jedem einzelnen Treffer** abgezogen | Kanone; ein Blaster kratzt für 1 |
| Drohne | Schild, fliegt über Bauten hinweg | Frostturm (Strahl wirkt 1,5-fach am Schild), Reichweite |
| Mender | heilt Gegner im Umkreis | zuerst abschießen |
| Titan | Panzerung 10, heilt sich | gebündelter Einzelschaden |

Panzerung lässt immer mindestens 15 % des Schadens durch, kein Turm wird also völlig
nutzlos. Geschosse richten an Schilden nur 65 % aus, der Frost-Strahl 150 %.
Die Karten *Durchschlagmunition* und *Schildbrecher* heben beides teilweise auf.

Die Vorschau in der Bauphase nennt Zusammensetzung, Richtung und Eigenschaften der
nächsten Welle — ohne sie wäre das Kontersystem unsichtbar.

Der Einstieg ist bewusst ruhig: 170 Startmaterie, 34 Sekunden erste Bauphase (danach 22),
und die ersten drei Wellen tröpfeln mit größeren Abständen aus einer Richtung herein.
Ab Welle 8 entspricht die Stärkekurve wieder dem ursprünglichen Verlauf. Bodentruppen weichen Barrieren
seitlich aus, solange eine Lücke existiert — steht keine offen, schlagen sie sie ein.
Wellen sind endlos, Budget und HP skalieren quadratisch mit der Wellennummer.

## Dateien

- `index.html` — Landingpage samt eingebettetem Spiel-Markup und HUD
- `landing.css` — Seite (alle Klassen mit `l-` präfixiert)
- `style.css` — HUD und Spielfläche
- `js/config.js` — sämtliche Balance-Werte (Gebäude, Gegner, Wellenkurven)
- `js/entities.js` — Gegner, Projektile, Partikel
- `js/game.js` — Spielzustand, Energienetz, Wellen, Rendering, Eingabe
- `js/audio.js` — Klangerzeugung
- `js/landing.js` — Einblendungen, Vollbild, Skalierung des Spielblocks

Balance-Änderungen brauchen fast immer nur `js/config.js`.

### Wie das Spiel in der Seite sitzt

Das HUD ist in festen Pixeln gebaut. Statt es umzurechnen, hängt der ganze
Spielblock (`#stage`, 1312 × 800) in `#fit` und wird per `transform: scale()`
auf die Containerbreite gebracht — Canvas und Bedienelemente bleiben dadurch im
Verhältnis. Mausklicks rechnet `getBoundingClientRect()` automatisch richtig um.

Tastatur und Spieltakt laufen nur, solange das Spielfeld zu mindestens 30 %
im Bild ist. Sonst würde die Leertaste beim Lesen eine Welle starten.
