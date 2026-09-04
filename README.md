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

## Wenn der Kern ungedeckt ist

Erreicht ein Gegner eine Stelle am Kern, die kein Turm abdeckt, hämmert er dort
ungestört weiter — ein einzelner Crawler kann so eine ganze Partie beenden. Nach drei
Sekunden ununterbrochenem Schaden am Kern schlägt das Spiel deshalb Alarm:

- eine Warnzeile im HUD, die sagt, wie viele Gegner gerade ungedeckt am Kern stehen
- ein Fadenkreuz auf jedem dieser Gegner und ein pulsierender Ring um den Kern
- **alle Turmreichweiten werden schwach eingeblendet** — damit sieht man auf einen
  Blick, wo die Lücke im Deckungsring klafft
- ein wiederkehrender Alarmton alle 2,6 Sekunden

Zwei Sekunden ohne Treffer beenden die Serie; kurze Durchbrüche lösen also nichts aus.
Die Lücke selbst bleibt bestehen — Rundumdeckung ist die Aufgabe des Spiels, das Spiel
sagt nur, dass etwas fehlt.

## Energie im Gefecht

**Überladung** (`O`): doppelter Schaden für den dreifachen Energiehunger. Gedacht für
den Moment, nicht für dauerhaft — ein überladener Blaster leert den Puffer schneller,
als der Kern ihn füllt.

**Lastpriorität** (`L`): jeder Turm steht auf *Vorrang*, *Normal* oder *Sparlast*.
Türme feuern in dieser Reihenfolge, und die unteren Stufen fassen den Puffer erst an,
wenn er über ihrer Schwelle steht (Normal ab 20 %, Sparlast ab 55 %). So bleibt im
Engpass Energie für die Seite, die wirklich halten muss, statt dass alle gleichzeitig
verstummen. Abweichende Stufen stehen als Buchstabe am Turm.

## Darstellung

Alles ist Canvas-Zeichnung, keine Bilddateien. Jeder Gegnertyp hat eine eigene Silhouette
und eine eigene Bewegung: Der Crawler läuft auf sechs Beinen und wippt dabei, der Runner
zieht Fahrtwind hinter sich her, der Brute stampft, die Drohne schwebt über ihrem Schatten
und dreht zwei Rotoren, der Mender trägt einen rotierenden Ring, der Titan stemmt vier
schwere Beine. Die Schrittphase läuft nur, solange sich der Gegner wirklich bewegt —
wer eine Barriere einschlägt, steht still und zuckt beim Schlag zurück.

Die Anlagen stehen auf einer Bodenplatte, drehen ihren Turmkopf zum Ziel, federn beim
Schuss zurück und blitzen an der Mündung auf; im Leerlauf schwenken sie langsam.
Der Reaktor dreht seine Speichen schneller, wenn er am Netz hängt, der Pylon zeigt einen
zuckenden Lichtbogen, Barrieren bekommen Risse, sobald ihre Struktur unter 65 % fällt.
Abschüsse hinterlassen Trümmerteile, die wegfliegen, rotieren und verglühen.

Alle Animationen hängen an der Spielzeit, die Aufbau-Animation an der Uhr — damit ein
Gebäude, das kurz vor einer Pause gesetzt wird, nicht unsichtbar bleibt.

## Sound

Alle Effekte werden zur Laufzeit über die WebAudio-API synthetisiert — keine Audio-Dateien,
nichts nachzuladen. Jede Stimme ist wie ein echtes Geräusch dreiteilig aufgebaut:

- **Transient** — der harte Anschlag mit sehr kurzer Anstiegszeit, darin steckt die Ortung
- **Körper** — der Ton, oft mit Frequenzfahrt nach unten (Kanone: 165 → 42 Hz)
- **Ausklang** — gefiltertes Rauschen, dessen Filter mitfährt

Dazu kommen **Stereo-Ortung** (ein Turm am linken Feldrand klingt links) und ein kurzer
**Raumhall** über eine synthetisch erzeugte Impulsantwort, mit unterschiedlichem Anteil
je Geräusch: Explosionen bekommen viel, Blaster fast nichts.

Der AudioContext startet erst nach der ersten Nutzergeste (Browser-Autoplay-Regel).
Häufige Sounds sind pro Typ zeitlich gedrosselt und in Tonhöhe und Filter leicht gestreut,
damit zwanzig Blaster nicht wie ein einziger Automat klingen. Ein Kompressor fängt Spitzen
ab. Bei stumm geschaltetem Ton werden gar keine Audio-Nodes erzeugt.

## Gebäude

- **Pylon** (20) — trägt das Netz weiter, Radius 4,2 Zellen
- **Reaktor** (55) — +5 Energie/s, +45 Speicher (skaliert mit Ausbaustufe)
- **Blaster** (30) — schnelles, billiges Dauerfeuer
- **Kanone** (65) — langsam, hoher Flächenschaden
- **Frostturm** (45) — Sofortstrahl, bremst Gegner um 50 %
- **Barriere** (10) — braucht keinen Strom, lenkt Bodentruppen um

Jedes Gebäude hat drei Ausbaustufen (+35 % Schaden, +8 % Reichweite, mehr Struktur).

## Gegner

Crawler ab Welle 1, Runner ab 2, Brute ab 4, Drohne ab 6, Mender ab 8, Saboteur ab 9,
Splitter ab 11, Zapfer ab 13, Wächter ab 15. Jeder Typ ab Welle 2 bringt eine
Eigenschaft mit, die einen bestimmten Turm oder eine bestimmte Reaktion erzwingt:

| Gegner | Eigenschaft | Antwort |
|---|---|---|
| Runner | kaum bremsbar (Verlangsamung wirkt nur zu 45 %) | Feuerkraft statt Frost |
| Brute | Panzerung 6 — **von jedem einzelnen Treffer** abgezogen | Kanone; ein Blaster kratzt für 1 |
| Drohne | Schild, fliegt über Bauten hinweg | Frostturm (Strahl wirkt 1,5-fach am Schild), Reichweite |
| Mender | heilt Gegner im Umkreis | zuerst abschießen |
| Saboteur | läuft nicht zum Kern, sondern zerlegt deinen nächsten **Pylon** | Netzknoten mit Türmen decken |
| Splitter | zerfällt beim Tod in drei Larven | Flächenschaden, sonst kommt die zweite Welle aus der ersten |
| Zapfer | saugt aus 9 Zellen Entfernung 7 Energie pro Sekunde aus dem Puffer | zuerst abschießen, Reichweite hilft |
| Wächter | legt einen Schild von 42 über alles in 3,2 Zellen | Frost bricht Schilde, oder den Wächter zuerst |

Panzerung lässt immer mindestens 15 % des Schadens durch, kein Turm wird also völlig
nutzlos. Geschosse richten an Schilden nur 65 % aus, der Frost-Strahl 150 %.
Die Karten *Durchschlagmunition* und *Schildbrecher* heben beides teilweise auf.

Unterstützungstypen sind je Welle gedeckelt (Wächter 2, Mender und Zapfer 3,
Saboteure 4, Splitter 5), sonst besteht eine Welle nur aus Hilfstruppen.

Die Vorschau in der Bauphase nennt Zusammensetzung, Richtung und Eigenschaften der
nächsten Welle — ohne sie wäre das Kontersystem unsichtbar.

## Das Boss-Ereignis

Alle zehn Wellen kommt ein Boss, im Wechsel einer von drei — angekündigt schon in der
Bauphase davor, mit eigener Leiste im HUD, eigenem Auftritt und zweiter Phase: Unter der
halben Gesundheit wird jeder Boss um 45 % schneller und glüht rot.

| Welle | Boss | Regel |
|---|---|---|
| 10, 40, … | **Titan** | Panzerung 10, heilt sich 9 pro Sekunde |
| 20, 50, … | **Moloch** | Kommt mit drei **Wächtern**. Solange einer steht, kommen beim Moloch nur 12 % des Schadens an — erst die Eskorte, dann der Koloss. |
| 30, 60, … | **Nexus** | Zapft aus 14 Zellen Entfernung 11 Energie pro Sekunde ab und wirft alle 3,2 Sekunden zwei Larven aus. Zwei Zapfer begleiten ihn. |

Ein erlegter Boss bringt 150 Materie zusätzlich zum Kopfgeld — und die nächste
Kartenwahl enthält garantiert eine seltene Karte.

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
