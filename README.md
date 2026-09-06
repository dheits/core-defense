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
9/s nachlädt. Bei zu vielen Türmen versiegt mitten in der Welle das Feuer. Nachschub und
Speicher sind dabei getrennt: **Reaktoren** liefern Energie pro Sekunde, **Akkus** fassen
sie nur. Wie der Kern seine eigene Leistung verteilt, entscheidet der **Kernmodus**.

**3. Jede Leitung trägt nur so viel.** Der Anschluss ans Netz ist nicht die ganze Frage —
es zählt auch, wie viel Energie dort noch ankommt. Siehe *Leitungslast* weiter unten.

Zweite Währung ist **Materie**: fällt bei jedem Abschuss an und bezahlt alle Bauten.

**4. Karten zwischen den Wellen.** Nach jeder abgewehrten Welle sind vier von 57 Karten
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

Alles Anwählbare sitzt in einer einzeiligen **Taskleiste** am unteren Rand: links die
Bauteile, dann die Kernbefehle, rechts die Kernmodi. Sie ist 41 Pixel hoch, damit das
Spielfeld frei bleibt — die Erklärungen stehen im Tooltip, die Werte eines gebauten
Turms im Inspektor rechts. Ein schmaler Farbbalken am linken Rand jeder Fläche trägt die
Farbe, in der das Bauteil auch auf dem Feld gezeichnet wird.

| Eingabe | Wirkung |
|---|---|
| `1`–`7` / Klick auf Karte | Gebäude wählen |
| Linksklick | bauen bzw. bestehendes Gebäude auswählen |
| Ziehen mit gedrückter Maustaste | Barrieren reihenweise setzen — Lücken beim schnellen Ziehen wachsen zu, Belegtes und Unbezahlbares wird still übersprungen |
| Rechtsklick | Auswahl abbrechen / Gebäude abbauen (60 % des Bauwerts zurück) |
| `U` / `S` | ausgewähltes Gebäude ausbauen / abbauen |
| `R` | reparieren — ohne Auswahl: alles reparieren |
| Leertaste | Welle sofort starten (Restzeit gibt Bonus-Materie) |
| `P` | Pause, Button oben rechts: 1× / 2× / 3× |
| `M` / Lautsprecher-Button | Ton an/aus (wird gespeichert) |
| `O` | Überladung des gewählten Turms |
| `L` | Lastpriorität des gewählten Turms |
| `Q` / `W` / `E` | Kernbefehle: Entladung, Netzstoß, Notpuls |
| `K` | Kernmodus wechseln (Einspeisung → Speicher → Schild) |
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

## Leitungslast

Versorgung ist nicht binär. Jeder Knoten trägt nur eine begrenzte Menge Energie pro
Sekunde weiter: der Kern 58/s, ein Pylon 15/s und je Ausbaustufe 6/s mehr — Stufe 5
also 39/s. Was ein Turm an Dauerlast anfordert (Energie je Schuss geteilt durch die
Schussfolge), fließt durch **alle** Knoten zwischen ihm und dem Kern.

Fordert ein Ast mehr, als seine Leitung trägt, wird alles dahinter gedrosselt: Die
Feuerrate sinkt genau um das Verhältnis, das fehlt. Drei Blaster an einem frischen Pylon
verlangen 12,9/s und passen gerade; der vierte hebt die Anforderung auf 17,1/s bei 15/s
Kapazität, und alle vier feuern mit 88 % ihrer Rate.

Am Kern hat das eine zweite, größere Wirkung. Weil jede Anforderung am Ende durch den
Kernknoten läuft und Reaktoren dort gegengerechnet werden, sagt die Kernkapazität im
Kern genau eines: **Deine Türme dürfen deine Erzeugung um höchstens 58 Energie pro
Sekunde überziehen.** Der Puffer trägt weiterhin die Spitzen — die Leitungslast begrenzt
das Dauerdefizit. Wer 30 Türme betreiben will, braucht die Reaktoren dazu, nicht nur
einen großen Speicher.

Damit ist nicht nur die *Reichweite* des Netzes eine Entscheidung, sondern seine **Form**:

- Ein langer Strang trägt so viel wie sein schwächster Pylon; zwei kurze Äste tragen
  zusammen das Doppelte.
- **Reaktoren speisen dort ein, wo sie stehen.** Ein Reaktor am selben Pylon nimmt dessen
  Leitung 6/s je Stufe ab, ein Akku hebt ihre Kapazität um 4/s je Stufe — draußen am Rand
  sind beide deshalb mehr wert als neben dem Kern.
- Ein Pylon-Ausbau erhöht seine Tragfähigkeit, nicht nur seine Struktur.
- Überladung verdreifacht auch die Last, nicht nur den Verbrauch.

Sichtbar ist das direkt am Netz: Pulse wandern vom Kern nach außen, Tempo und Stärke
folgen der Auslastung, und ab 85 % färbt sich die Leitung erst bernstein, dann rot.
Der Inspektor zeigt am Pylon „Leitungslast 17,1 / 15/s", am Turm „Netzdrossel −12 %".

## Nachschub und Speicher

Ein Reaktor erzeugt, ein Akku fasst — und keiner tut beides. Damit wird aus einer
Nebenwirkung eine Bauentscheidung:

| | Reaktor (50) | Akku (30) |
|---|---|---|
| Nachschub | +6 Energie/s je Stufe | — |
| Speicher | — | +52 je Stufe |
| Am Netz | entlastet seinen Ast um seine Erzeugung | trägt seinen Knoten mit 4/s je Stufe |
| Stufe 5 | **Materiekonverter** — +0,6 Materie/s | **Spitzenlast** — einmal je Welle |

**Regeneration trägt das Dauerfeuer, Speicher den Stoß.** Wer viele Blaster gleichmäßig
feuern lässt, braucht Reaktoren; wer auf Kanonensalven und Kernbefehle setzt, braucht
Puffer — Kernbefehle kosten einen *Anteil* des Speichers, ein großer Puffer macht die
Entladung also stärker, nicht nur länger tragbar.

Der Akku hat dabei eine zweite Wirkung, die zur Leitungslast passt: Was vor Ort gepuffert
wird, muss die Leitung davor nicht als Spitze tragen. Ein Akku hebt deshalb die Kapazität
des Knotens, an dem er hängt, um 4/s je Stufe — draußen am überlasteten Ast ist er damit
so wertvoll wie ein Reaktor.

**Spitzenlast** (Stufe 5): Fällt der Puffer unter 15 %, wirft der Akku einmal je Welle
seinen ganzen Speicher nach. Am Bau sitzt ein weißer Punkt auf dem Pol, solange die
Reserve geladen ist. Die Karte *Zellenstapel* gibt Akkus 45 % mehr Speicher.

## Kernmodi

Der Kern hat eine feste Leistung und verteilt sie. Keine der drei Stellungen ist neutral,
jede gibt etwas und nimmt etwas — gewechselt wird mit `K` oder per Klick in der Taskleiste
am unteren Rand.

| Modus | Vorteil | Preis |
|---|---|---|
| **Einspeisung** | +25 % Regeneration | −15 % Speicher |
| **Speicher** | +40 % Speicher | −15 % Regeneration |
| **Schild** | 60 % des Kernschadens zahlt der Puffer, 2,2 Energie je Schadenspunkt | −10 % auf Regeneration und Speicher |

Der Schild greift nur, solange der Puffer über **35 %** steht, und zieht ihn nie darunter.
Diese Grenze ist keine Feinabstimmung, sondern der Grund, dass der Modus taugt: Ohne sie
zahlt der Puffer bis zur Leere, danach feuert kein Turm mehr, der Kern nimmt wieder vollen
Schaden — und der Schild hat den Zusammenbruch ausgelöst, den er verhindern sollte.

Das Umschalten kostet **3,5 Sekunden Anlauf**. In dieser Zeit wirkt *gar kein* Modus und
der Nachschub fällt auf 60 % — ein Wechsel mitten im Gefecht ist deshalb teuer, in der
Bauphase fast umsonst. Der Kern zeigt den Anlauf als Bogen, der sich schließt.

Der Schildmodus ist die einzige Antwort, die der Kern selbst auf eine Deckungslücke hat:
Er bezahlt Kernschaden mit Energie, die danach den Türmen fehlt. Bei leerem Puffer schützt
er nicht mehr — er verschiebt den Schaden, er streicht ihn nicht.

Zwei Karten greifen hier an: *Schnellschaltung* halbiert den Anlauf, *Zwitterkern*
(selten, einmalig) nimmt dem laufenden Modus die Hälfte seines Nachteils, ohne den
Vorteil anzutasten.

## Kernbefehle

Drei Fähigkeiten mit Abklingzeit, nur im Gefecht, bezahlt aus demselben Puffer, aus dem
die Türme schießen. Jeder Einsatz ist damit ein Tausch: jetzt viel Wirkung, danach ein
paar Sekunden dünnes Feuer.

| Befehl | Taste | Puffer | Bereit nach | Wirkung |
|---|---|---|---|---|
| **Entladung** | `Q` | 55 % | 26 s | Druckwelle im Umkreis von 5,6 Zellen, 2,9 Schaden je Energie, nach außen abnehmend. Zählt als Energieschaden — Schilde nehmen ihn voll. |
| **Netzstoß** | `W` | 40 % | 34 s | 6 s lang doppelter Schaden bei 55 % Verbrauch. Liegt über der Überladung. |
| **Notpuls** | `E` | 45 % | 40 s | Setzt jeden versorgten Bau um ein Drittel instand, ohne Materie. Kalte Türme bleiben kaputt. |

Die Karten *Kondensatorbank* (−28 % Abklingzeit) und *Schwungrad* (−35 % Pufferkosten)
gehen in diese Richtung.

## Sturmwellen

Ab Welle 5 kann eine Welle eine Eigenschaft mitbringen — außer auf Bosswellen, die für
sich schon ein Ereignis sind. Sie steht in der Vorschau, bevor man sie startet, und wer
sie hält, bekommt **50 % mehr Prämie**.

| Sturm | Wirkung |
|---|---|
| Störnebel | Alle Türme sehen 25 % kürzer |
| EMP-Front | Der Puffer lädt kaum noch nach |
| Magnetsturm | Geschosse fliegen 40 % langsamer — Strahlen nicht |
| Schwarm | 70 % mehr Wellenbudget, dafür 45 % weniger Struktur je Gegner |
| Kältefest | Gegner lassen sich nicht bremsen |
| Panzerkonvoi | Jeder Gegner trägt 4 Panzerung mehr |
| Hetzjagd | Gegner laufen 30 % schneller |

Jeder Sturm zielt auf eine Einseitigkeit: *Kältefest* trifft den reinen Frost-Aufbau,
*Störnebel* den auf Reichweite gebauten, *EMP-Front* den ohne Pufferreserve. Die seltene
Karte *Abschirmung* nimmt Störnebel und EMP-Front dauerhaft die Wirkung.

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

### Licht

Über die fertige Szene läuft eine additive Lichtschicht: Mündungsfeuer, Explosionen,
Geschosse, Strahlen, brennende Gegner, Reaktoren und der Kern hellen den Boden um sich
herum auf, statt nur auf ihm zu liegen. Ein überlasteter Pylon glüht rot, der Netzstoß
legt für seine sechs Sekunden ein kaltes Leuchten über jeden versorgten Turm.

Damit das bezahlbar bleibt, wird je Farbe **einmal** ein 128 px großer Verlauf in ein
Offscreen-Bild gezeichnet und danach nur noch skaliert aufgetragen — ein Durchgang, ein
Compositing-Wechsel. Eine dichte Spätspiel-Szene mit 60 Bauten und 70 Gegnern kostet
gemessene 0,5 ms je Bild.

### Was auf dem Feld zurückbleibt

Explosionen, gefallene Bauten und Abschüsse brennen sich in eine eigene Ebene ein, die
nie gelöscht wird. Nach zwanzig Wellen sieht man dem Feld die Schlacht an. Dazu eine
Vignette, die mit der Wellennummer dunkler wird und rot pulst, solange der Kern
ungedeckt getroffen wird.

### Schadensbild

Ab 72 % Struktur bekommt ein Bau Sprünge, ab 55 % mehr davon, ab 35 % glühen sie und
eine Bruchstelle glimmt. Der Rissverlauf wird aus der Position des Baus abgeleitet und
liegt damit fest — ein zitterndes Rissbild wäre unruhig. Beschädigte Bauten rauchen,
schwer getroffene sprühen zusätzlich Funken. Damit ist auf einen Blick zu sehen, wo die
Reparatur (`R`) hingehört.

### Risse

Gegner erscheinen nicht einfach am Rand, sie treten durch einen Riss: ein leuchtender
Schlitz quer zur Laufrichtung, der aufgeht, den Gegner ausspuckt und wieder zufällt.
Bosse reißen ein deutlich größeres Loch.

## Sound

Alle Effekte werden zur Laufzeit über die WebAudio-API synthetisiert — keine Audio-Dateien,
nichts nachzuladen. Jede Stimme ist wie ein echtes Geräusch dreiteilig aufgebaut:

- **Transient** — der harte Anschlag mit sehr kurzer Anstiegszeit, darin steckt die Ortung
- **Körper** — der Ton, oft mit Frequenzfahrt nach unten (Kanone: 165 → 42 Hz)
- **Ausklang** — gefiltertes Rauschen, dessen Filter mitfährt

Dazu kommen **Stereo-Ortung** (ein Turm am linken Feldrand klingt links) und ein kurzer
**Raumhall** über eine synthetisch erzeugte Impulsantwort, mit unterschiedlichem Anteil
je Geräusch: Explosionen bekommen viel, Blaster fast nichts.

Die drei Kernbefehle sind klanglich verwandt, weil sie aus derselben Quelle bezahlt
werden: erst ein kurzes Aufladen, dann die Entspannung — bei der Entladung als Bersten,
beim Netzstoß als aufsteigende Sägezahnfahrt, beim Notpuls als heller Zweiklang. Eine
Sturmwelle kündigt sich mit einem tiefen, leicht verstimmten Zweiklang an.

### Klangbett

Drei Schichten laufen dauerhaft und werden nur in der Lautstärke geregelt, damit die
Stimmung sich ändert, ohne dass je ein Ton „startet": eine tiefe Drone, ein pulsierender
Mittelbau, dessen Schlag mit der Wellenstärke von 0,9 auf 2,6 Hz steigt, und ein hohes
Flirren, das erst auftaucht, wenn ein Boss steht, der Kern brennt oder der Alarm läuft.
Große Ereignisse drücken das Bett kurz weg (Ducking), damit sie Platz haben. Solange die
Seite nur gelesen wird, schweigt es ganz.

### Der Puffer als Ton

Eine eigene Drone folgt der Ladung: Sie fällt von 100 auf 48 Hz, während der Puffer
leerläuft, und wird dabei **lauter** statt leiser — hörbar erst unterhalb von 55 %.
Man hört den Engpass kommen, bevor man auf die Leiste sieht.

### Entfernung und Größe

Ferne Geräusche verlieren ihre Höhen: Ein Tiefpass fährt von 16 kHz in der Feldmitte auf
knapp 4 kHz am Rand — dieselbe Dämpfung wie in echter Luft. Und ein großer Gegner birst
tiefer und länger als ein kleiner, weil die Tonhöhe des Abschussgeräuschs am Radius hängt.

Der AudioContext startet erst nach der ersten Nutzergeste (Browser-Autoplay-Regel).
Häufige Sounds sind pro Typ zeitlich gedrosselt und in Tonhöhe und Filter leicht gestreut,
damit zwanzig Blaster nicht wie ein einziger Automat klingen. Ein Kompressor fängt Spitzen
ab. Bei stumm geschaltetem Ton werden gar keine Audio-Nodes erzeugt.

## Gebäude

- **Pylon** (20) — trägt das Netz weiter, Radius 4,2 Zellen, Leitungslast 15/s (+6/s je Stufe)
- **Reaktor** (50) — +6 Energie/s je Stufe, entlastet seinen Netzast
- **Akku** (30) — +52 Speicher je Stufe, trägt seinen Knoten mit 4/s je Stufe
- **Blaster** (30) — schnelles, billiges Dauerfeuer
- **Kanone** (65) — langsam, hoher Flächenschaden
- **Frostturm** (45) — Sofortstrahl, bremst Gegner um 50 %
- **Barriere** (10) — braucht keinen Strom, lenkt Bodentruppen um, in Reihen ziehbar

Jedes Gebäude hat **fünf Ausbaustufen**: je +42 % Schaden, +7 % Reichweite, +28 % Struktur.
Der Ausbau kostet mit jeder Stufe mehr (Blaster: 39, 56, 72, 89 — zusammen 286 gegenüber
30 für den Neubau), dafür schaltet **Stufe 5 eine eigene Fähigkeit** frei:

| Bauteil | Stufe 5 |
|---|---|
| Blaster | **Zwillingssalve** — feuert gleichzeitig auf ein zweites Ziel |
| Kanone | **Brandsatz** — der Einschlag setzt Getroffene drei Sekunden in Brand |
| Frostturm | **Vereisung** — friert bereits gebremste Gegner 0,85 s völlig ein (3 s Abklingzeit) |
| Pylon | **Verstärkerfeld** — Türme in seinem Netzradius schlagen 15 % härter |
| Reaktor | **Materiekonverter** — erzeugt zusätzlich 0,6 Materie pro Sekunde |
| Akku | **Spitzenlast** — speist unter 15 % Puffer einmal je Welle seinen Speicher ein |
| Barriere | **Reaktivpanzerung** — reißt beim Bersten alles im Umkreis mit |

Am Bau erkennbar: Stufe 2 bis 4 an Kerben am Sockel, Stufe 5 an einem goldenen Ring.

**Reparatur** (`R`): Ein beschädigter Bau wird für 35 % seines Werts anteilig zum Schaden
instandgesetzt — bei ausgebauten Türmen deutlich billiger als Abbau und Neubau. Ohne
Auswahl setzt `R` alles instand, was noch bezahlbar ist, das Kaputteste zuerst.
Abbau erstattet 60 % des gesamten Bauwerts inklusive aller bezahlten Ausbaustufen.

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

## Bilanz nach der Welle

Zwischen Wellenende und Kartenwahl steht, was die Welle gekostet und gebracht hat —
im selben Fenster, in dem man ohnehin einen Moment innehält:

| Zahl | Was sie lehrt |
|---|---|
| **Gegner** | wie groß die Welle wirklich war |
| **Energie verschossen** | was das eigene Feuer kostet — die Gegenrechnung zur Regeneration |
| **für Kernbefehle** | wie viel Puffer die drei Fähigkeiten genommen haben |
| **Materie** | Beute plus Prämie |
| **Kernschaden** | wo die Deckung nicht reichte |
| **Energie als Schild** | was der Schildmodus aufgefangen hat |
| **Bauten verloren** | ob die Front hält |
| **Puffer leer** | Sekunden, in denen ein Turm feuern wollte und nicht konnte |
| **Netzdrossel** | mittlere Drosselung durch die Leitungslast |
| **bester Turm** | welcher Bau den Schaden tatsächlich gemacht hat |

Angezeigt wird nur, was passiert ist: Wer keinen Bau verlor, liest dazu auch keine Null.
Die ersten vier Zahlen stehen immer, der Rest erscheint, wenn er etwas zu sagen hat.

Zwei Feinheiten, die die Zahlen ehrlich halten. Beim *besten Turm* zählt nur Schaden, der
wirklich ankam — der Überschuss des tödlichen Treffers würde eine Kanone sonst
überzeichnen. Und *Puffer leer* zählt nur Türme auf **Vorrang** und **Normal**: Ein Turm
auf Sparlast schweigt bei niedrigem Puffer absichtlich, das ist keine Not, sondern die
eingestellte Ordnung.

## Spielstand und Bestenliste

Beides liegt im `localStorage` des Browsers — keine Datei, kein Server, und beides
funktioniert auch, wenn der Speicher gesperrt ist: Jeder Zugriff ist gekapselt, im
schlimmsten Fall fehlen Fortsetzen und Liste, das Spiel läuft weiter.

**Spielstand.** Gesichert wird in der Bauphase — beim Wellenende, nach jeder Karte, nach
jedem Bau und beim Verlassen der Seite. Beim nächsten Öffnen fragt die Startanzeige, ob
fortgesetzt werden soll; *Neu anfangen* verwirft den Stand ausdrücklich, von selbst
passiert das nie. Mitgeschrieben werden Bauten samt Stufe, Struktur, Lastpriorität und
Überladung, Materie, Puffer, Kern, alle genommenen Karten, der Kernmodus und die bereits
angekündigte nächste Welle — die Vorschau hält also, was sie vor dem Schließen versprach.

Gegner, Geschosse und der laufende Sturm werden *nicht* gesichert. Das ist eine
Entscheidung, keine Sparmaßnahme: Wer mitten im Gefecht die Seite schließt, setzt bei
derselben Welle wieder an. Damit das kein Ausweg aus einer verlorenen Welle wird, zählt
für die Bestenliste `bestWave` — die höchste je *begonnene* Welle. Ein Neuladen kann eine
Wertung dadurch nie senken, nur das Weiterkommen kann sie heben.

**Bestenliste.** Die acht besten Läufe mit Welle, Datum und den drei häufigsten Bauteilen
am Ende. Sie steht auf der Startanzeige und nach dem Kernverlust, dort mit dem eigenen
Lauf hervorgehoben. Ein Lauf wird eingetragen, wenn der Kern fällt — und derselbe Moment
löscht den Spielstand, weil die Partie zu Ende ist und nicht unterbrochen.

## Balance messen

Im Ordner `tools/` liegt ein Prüfstand, der das ganze Spiel ohne Browser in node lädt,
und ein simulierter Spieler, der damit Partien spielt. Beides braucht nichts außer node.

```bash
node tools/bot.js 100 40                 # 100 Partien bis Welle 40
node tools/bot.js 60 40 noflow,nomod     # dieselbe Messung ohne Leitungslast und Sturmwellen
node tools/bot.js 60 40 noakku          # ohne Akkus — der Bot lebt vom Kernpuffer allein
node tools/bot.js 1 40 log               # eine Partie, Verlauf Welle für Welle
```

Ausgegeben werden die Verteilung der erreichten Wellen, Median, Schnitt und wie oft das
Wellenlimit erreicht wurde. **Kennzahl ist der Median**, nicht der Schnitt: Die Verteilung
hat zwei Häufungen, ein einzelner Lauf bis zum Limit verschiebt den Schnitt stark.

Drei Dinge sind beim Auswerten wichtig, sonst führt die Zahl in die Irre:

- **Die Streuung ist groß.** Unter 60 Läufen wandert der Median um mehrere Wellen. Für
  eine belastbare Aussage sind 100 Läufe je Konfiguration nötig.
- **Absolutwerte sagen wenig.** Aussagekräftig ist nur der Vergleich zweier
  Konfigurationen *mit derselben Bot-Version*, gemessen in einem Durchgang. Eine einzige
  Bot-Regel kann alles kippen: Türme erst ab Welle 4 zu mischen statt ab Welle 2 senkte
  den Median von 18 auf 6, weil der Bot den gepanzerten Brutes ohne Kanonen begegnete.
  Das war ein Fehler des Bots, nicht des Spiels.
- **Der Bot ist ein schwacher Stellvertreter.** Er nutzt weder Lastpriorität noch
  Überladung und stellt Reaktoren nicht planvoll an überlastete Äste. Gerade bei der
  Leitungslast — einer Planungsaufgabe — unterschätzt er einen Menschen deutlich.

Stand der Messung (Bot in dieser Fassung, je 200 Läufe, Limit Welle 40):

| Konfiguration | Median | Schnitt | am Limit | Ende bei Welle 10 |
|---|---|---|---|---|
| heutiger Stand | 19 | 19,7 | 23 | 9 |
| ohne Akkubau (`noakku`) | 10 | 13,8 | 7 | — |

Die Trennung von Nachschub und Speicher kostet den Bot rund zwei Wellen im Median (gemessen
vor der Welle-10-Abstimmung: 12 gegen 10) und halb so viele Läufe am Limit. Spürbar, aber
kein Erdrutsch — und der Bot stellt Akkus nicht an überlastete Äste, wo sie am meisten
bringen.

**Wie wenig eine einzelne Messung trägt**, zeigt die Wiederholung: Dieselbe Konfiguration
ergab in drei Durchgängen zu je 60 Läufen die Mediane 16, 14 und 11. Unterschiede unter
etwa fünf Wellen sind bei 60 Läufen also gar nichts — eine frühere Notiz hier behauptete
aus genau so einem Durchgang „11 statt 16" und lag damit um mehr als das Doppelte daneben.
Beim Kernmodus ist deshalb weiter offen, was er bringt: Zwischen fester Einspeisung und
der Regel „vor dem Boss auf Schild" war kein Unterschied zu sehen, der die Streuung
überstanden hätte.

### Die Wand bei Welle 10

Bis vor Kurzem endete dort gut jeder vierte Lauf (57 von 200). Die Ursache lag zur Hälfte
woanders als vermutet — die Untersuchung steht in `IDEAS.md` unter „Gefunden und behandelt".
Die Kurzfassung in Zahlen:

| Stand | Median | am Limit | Ende bei Welle 10 |
|---|---|---|---|
| vorher | 12 | 13 | 57 |
| nur mit der Schild-Untergrenze | 18 | 14 | 29 |
| dazu Titan 880 TP statt 1100, 55 Schaden statt 70 | 19 | 23 | 9 |

Die Verteilung ist um Welle 10 herum jetzt glatt. Der erste sichtbare Prüfstein ist damit
**Welle 20** — der Moloch, an dem 18 von 200 Läufen enden. Das Spiel ist insgesamt eine
Spur leichter geworden; ein Teil davon war allerdings kein Schwierigkeitsgrad, sondern
eine Falle im Schildmodus.

### Selbsttest

Neben der Messung liegt eine Prüfdatei, die das nachrechnet, was sich nicht ansehen lässt:

```bash
node tools/pruefen.js
```

Sie läuft in einer Zehntelsekunde und deckt Leitungslast, die drei Kernbefehle, alle
sieben Sturmwellen, die getrennten Akkus, die drei Kernmodi samt Anlauf und Schild,
Spielstand und Bestenliste, Reparatur und Abbau sowie die Sonderfähigkeiten der fünften
Stufe ab. Der Prüfstand hat dafür einen flüchtigen `localStorage`, der ein erneutes Laden
des Spiels im selben Prozess übersteht — nur so lässt sich Sichern gegen Laden prüfen.
Die Prüfungen sind in zwei Sorten aufgeteilt, und der Unterschied ist wichtig:

- **Verdrahtung.** Der Erwartungswert wird aus `js/config.js` abgeleitet. Diese Prüfungen
  fragen, ob eine Konstante überhaupt an der richtigen Stelle wirkt — sie schlagen bei
  einer bewussten Abstimmung *nicht* Alarm. Hängt jemand die Drosselung aus dem
  Feuerpfad aus oder rechnet der Netzstoß den Verbrauch nicht mehr, fallen sie um.
- **Balance-Anker.** Ein Block am Ende mit fest eingetragenen Zahlen, der den heutigen
  Stand festhält. Er fängt die versehentlich verschobene Zahl, die der Verdrahtungsteil
  bauartbedingt nicht sehen kann. Schlägt er fehl, ist beides eine gültige Antwort: das
  Versehen zurücknehmen — oder den Wert dort nachziehen, wenn die Änderung gewollt war.

Beides ist gegengeprüft: Vier verstellte Werte in `config.js` haben fünf Anker umgeworfen,
zwei ausgehängte Stellen im Feuerpfad zwei Verdrahtungsprüfungen.

Die Schalter `noflow`, `nomod`, `nopower`, `noakku` und `nomode` schalten Leitungslast,
Sturmwellen, Kernbefehle, den Akkubau und den Moduswechsel des Bots ab. So lässt sich messen, was ein einzelnes System zur Schwierigkeit
beiträgt. Der Prüfstand selbst (`tools/harness.js`) ist auch für schnelle Einzelfragen
brauchbar:

```js
const h = require('./tools/harness.js');
h.game.build('pylon', 25, 12);
h.game.recomputeSupply();
console.log(h.game.sources[1].ratio);      // Auslastung dieser Leitung
```

## Dateien

- `index.html` — Landingpage samt eingebettetem Spiel-Markup und HUD
- `landing.css` — Seite (alle Klassen mit `l-` präfixiert)
- `style.css` — HUD und Spielfläche
- `js/config.js` — sämtliche Balance-Werte (Gebäude, Gegner, Wellenkurven)
- `js/entities.js` — Gegner, Projektile, Partikel
- `js/game.js` — Spielzustand, Energienetz, Wellen, Rendering, Eingabe
- `js/audio.js` — Klangerzeugung
- `js/landing.js` — Einblendungen, Vollbild, Skalierung des Spielblocks
- `tools/harness.js` — lädt das Spiel ohne Browser in node
- `tools/bot.js` — simulierter Spieler für Balance-Messungen
- `tools/pruefen.js` — Selbsttest der Mechaniken (`node tools/pruefen.js`)

Balance-Änderungen brauchen fast immer nur `js/config.js`.

### Wie das Spiel in der Seite sitzt

Das HUD ist in festen Pixeln gebaut. Statt es umzurechnen, hängt der ganze
Spielblock (`#stage`, 1312 × 800) in `#fit` und wird per `transform: scale()`
auf die Containerbreite gebracht — Canvas und Bedienelemente bleiben dadurch im
Verhältnis. Mausklicks rechnet `getBoundingClientRect()` automatisch richtig um.

Tastatur und Spieltakt laufen nur, solange das Spielfeld zu mindestens 30 %
im Bild ist. Sonst würde die Leertaste beim Lesen eine Welle starten.
