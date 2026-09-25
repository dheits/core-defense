# CORE DEFENSE

Ein Tower-Defense-Spiel mit umgedrehter Geometrie: **die Angriffe kommen von außen**,
du baust vom Zentrum nach außen. In der Mitte steht der Kern — gleichzeitig Schutzobjekt
und Energiequelle deiner Türme.

**Repo:** [github.com/dheits/core-defense](https://github.com/dheits/core-defense) (öffentlich).
**Live:** [dheits.de/core-defense](https://dheits.de/core-defense/) — dort läuft die
**englische Fassung** aus `dist-web-en/` (ohne Landingpage, Spiel im ganzen Fenster), als
Unterordner der Hauptseite mit eigenem nginx-Block. `dist-web-en/` ist deshalb eingecheckt
und wird auf dem Server aus dem Repo geholt; `git push origin main` allein ändert die
Live-Seite nicht. Die Quellen hier bleiben deutsch, `index.html` mit Landingpage ist die
deutsche Fassung zum lokalen Spielen.

## Starten

`index.html` im Browser öffnen (Doppelklick reicht, es gibt keinen Build-Schritt).
Die Seite ist eine Landingpage, in der das Spiel eingebettet läuft — Abschnitt
„Die Anlage in Betrieb", dort auch der Vollbild-Knopf.
Oder mit lokalem Server:

```bash
python3 -m http.server 8123 --directory ~/Developer/core-defense
```

## Einführung

Wer das Spiel zum ersten Mal öffnet, wird durch die erste Welle geführt: Blaster neben den
Kern, Pylon an den Rand des Leuchtens, Welle starten, dann Puffer, Kartenwahl und
Inspektor. Jeder Schritt hebt das passende Bedienelement hervor und rückt erst weiter,
wenn er getan ist. Bis die Welle läuft, steht der Bau-Countdown — wer liest, soll die
erste Welle nicht verpassen. *Einführung überspringen* beendet sie jederzeit.

Als neu gilt, wer weder einen gespeicherten Lauf noch einen Eintrag in der Bestenliste hat.
Gesehen oder übersprungen merkt sie sich in `cd_einfuehrung` und kommt nicht wieder.
`js/einfuehrung.js` liest den Spielzustand nur von außen; `game.js` weiß nichts von ihr.

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

**4. Karten zwischen den Wellen.** Nach jeder abgewehrten Welle sind vier von 62 Karten
zur Wahl, die für den Rest der Partie gelten. Der Pool hat fünf Sorten:

- **Grundwerte** für alle Türme — Reichweite, Schaden, Feuerrate, Energie, Struktur
- **Turmspezifisch** — „Kanonen: +50 % Schaden" nützt nur, wer Kanonen gebaut hat
- **Antworten auf Gegner** — Durchschlagmunition, Flakmunition, Schildbrecher, Kettenblitz
- **Zielkonflikte** — +38 % Schaden für 18 % weniger Struktur, 28 % billiger bauen für
  weniger Struktur, mehr Materie für einen kleineren Kern
- **Regeländerungen statt Zahlen** — Dornenbarrieren verletzen ihre Angreifer, der Kern
  stößt zurück, Türme ohne Netz feuern mit halber Rate, über 85 % Puffer feuern alle
  Türme überladen zum normalen Preis

Jede Karte lässt sich höchstens viermal nehmen, einige nur ein- oder zweimal — dort, wo
ein weiteres Mal an einem Deckel im Code verpuffen würde; seltene Karten erscheinen
entsprechend ihrem Gewicht seltener. Beides hält Partien auseinander.

## Steuerung

Alles Anwählbare sitzt in einer **Taskleiste** am unteren Rand: links die Bauteile,
dann der Bauplan, die Kernbefehle und rechts die Kernmodi. Die Bauteile stehen seit dem
siebten in zwei Reihen zu sechs und fünf — elf Flächen passen nicht mehr in eine Zeile, und die Leiste
kostet dadurch rund eine Zellenreihe Spielfeld mehr. Die Erklärungen stehen im Tooltip,
die Werte eines gebauten Turms im Inspektor rechts. Ein schmaler Farbbalken am linken Rand jeder Fläche trägt die
Farbe, in der das Bauteil auch auf dem Feld gezeichnet wird.

| Eingabe | Wirkung |
|---|---|
| `1`–`9`, `0`, `G` / Klick auf Karte | Gebäude wählen |
| Maus über einen Bau | Reichweitenkreis und die wichtigsten Werte, ohne Klick |
| Linksklick | bauen bzw. bestehendes Gebäude auswählen |
| Ziehen mit gedrückter Maustaste | Barrieren reihenweise setzen — Lücken beim schnellen Ziehen wachsen zu, Belegtes und Unbezahlbares wird still übersprungen |
| Rechtsklick | Auswahl abbrechen / Gebäude abbauen (60 % des Bauwerts zurück) |
| `U` / `S` | ausgewähltes Gebäude ausbauen / abbauen |
| `R` | reparieren — ohne Auswahl: alles reparieren |
| `V` | ausgewähltes Gebäude auf ein freies Feld verschieben (25 % des Bauwerts) |
| `B` | Bauplan: eine Hälfte des Feldes auf die andere spiegeln |
| Leertaste | Welle sofort starten (Restzeit gibt Bonus-Materie) |
| `P` | Pause, Button oben rechts: 1× / 2× / 3× |
| `M` / Lautsprecher-Button | Ton an/aus (wird gespeichert) |
| `O` | Überladung des gewählten Turms |
| `L` | Lastpriorität des gewählten Turms |
| `Z` | Zielpriorität des gewählten Turms |
| `Q` / `W` / `E` | Kernbefehle: Entladung, Netzstoß, Notpuls |
| `K` | Kernmodus wechseln (Einspeisung → Speicher → Schild) |
| `1`–`4` bei der Kartenwahl | Karte nehmen |
| `Esc` | alles abwählen |

**Werte beim Überfahren.** Wer wissen wollte, was ein Bau leistet, musste ihn bisher
erst anklicken — beim Bauen ist das die falsche Reihenfolge, denn entschieden wird vor dem
Klick. Jetzt zeigt schon das Überfahren den Reichweitenkreis und daneben eine kleine Karte
mit vier bis fünf Zahlen: Struktur, Schaden, Reichweite, Schussfolge, Dauerlast — beim
Pylon stattdessen Netzradius und Leitungslast, beim Akku Speicher und was er mitträgt.
Eine Netzdrossel steht dabei, sobald es eine gibt; ein Bau ohne Strom sagt es. Die Karte
weicht dem Inspektor aus, statt sich unter ihn zu schieben, und liegt außerhalb der
Bilderschütterung — eine Tabelle, die bei jedem Einschlag wackelt, liest sich nicht. Ist
der Bau bereits ausgewählt, bleibt sie weg: Dann steht alles Ausführliche schon rechts.

Der Bauzeiger zeigt seither ebenfalls die Reichweite, die der Bau *bekommt*, nicht die aus
`config.js`: Nach einer Karte wie *Fokussierte Optik* oder *Netzausbau* war der Kreis
vorher zu klein. Dasselbe galt für die Zeile „Netzradius" im Inspektor.

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

**Zielpriorität** (`Z`): worauf ein Turm schießt, wenn mehrere in Reichweite stehen.

| Stellung | Kürzel | Nimmt sich |
|---|---|---|
| **Kernnächster** | — | wer dem Kern am nächsten ist (Voreinstellung) |
| **Nächster** | `N` | wer dem Turm am nächsten ist |
| **Stärkster** | `S` | wer die meiste Struktur übrig hat |
| **Schnellster** | `T` | wer gerade am schnellsten läuft |

Die Voreinstellung passt zum Feld: Hier läuft alles radial nach innen, wer dem Kern am
nächsten ist, ist die dringendste Gefahr. *Stärkster* setzt Kanonen auf Brutes und Bosse
an, statt sie an Crawler zu verschwenden; *Schnellster* fängt Runner ab, bevor sie durch
sind; *Nächster* hält den eigenen Abschnitt sauber. Gebremste zählen mit ihrem gedrosselten
Tempo, Eingefrorene als Stillstand — sonst würde ein Frostturm seinen eigenen Nachbarn
dauernd auf ein stehendes Ziel schicken.

Das Kürzel steht links oben am Turm, sobald er von der Voreinstellung abweicht. Die
Lastpriorität steht rechts oben und in eigener Farbe.

## Leitungslast

Angeschlossen zu sein ist nicht die ganze Antwort. Jeder Knoten trägt nur eine begrenzte Menge Energie pro
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
| **Netzstoß** | `W` | 40 % | 34 s | 6 s lang doppelter Schaden, und jeder Schuss kostet nur 55 %. Liegt über der Überladung. |
| **Notpuls** | `E` | 45 % | 40 s | Setzt jeden versorgten Bau um ein Drittel instand, ohne Materie. Kalte Türme bleiben kaputt. |

Die Karten *Kondensatorbank* (−28 % Abklingzeit) und *Schwungrad* (−35 % Pufferkosten)
gehen in diese Richtung.

## Sturmwellen

Ab Welle 5 kann eine Welle eine Eigenschaft mitbringen — außer auf Bosswellen, die für
sich schon ein Ereignis sind. Sie steht in der Vorschau, bevor man sie startet, und wer
sie hält, bekommt **50 % mehr Prämie**.

| Sturm | Wirkung |
|---|---|
| Störnebel | Alle Türme reichen 25 % weniger weit |
| EMP-Front | Der Puffer lädt kaum noch nach |
| Magnetsturm | Geschosse fliegen 40 % langsamer — Strahlen nicht |
| Schwarm | 70 % mehr Wellenbudget, dafür 45 % weniger Struktur je Gegner |
| Kältefest | Gegner lassen sich nicht bremsen |
| Panzerkonvoi | Jeder Gegner trägt 4 Panzerung mehr |
| Hetzjagd | Gegner laufen 30 % schneller |

Jeder Sturm zielt auf eine Einseitigkeit: *Kältefest* trifft den reinen Frost-Aufbau,
*Störnebel* den auf Reichweite gebauten, *EMP-Front* den ohne Pufferreserve. Die seltene
Karte *Abschirmung* nimmt Störnebel und EMP-Front dauerhaft die Wirkung.

## Erzeugtes Gelände

Das Feld startet nicht leer. Zu Beginn jeder Partie wird aus einem Seed eine eigene Karte
gebaut — der Sinn ist nicht Deko, sondern das Brechen der radialen Symmetrie: Auf einem
leeren Feld ist jede Himmelsrichtung gleich, also ist auch jeder Aufbau gleich.

Drei Sorten, jede mit genau einer Wirkung:

| Boden | Wirkung | Aussehen |
|---|---|---|
| **Trümmer** | Hier lässt sich nicht bauen. Das Netz muss herum. | graue gebrochene Platten |
| **Leiterbahn** | Ein Pylon darauf trägt **50 % mehr** Last (22,5 statt 15/s auf Stufe 1). | cyanfarbene Leitung mit Kontakten, radial |
| **Schneise** | Bodentruppen laufen hier **30 % schneller**. Fliegende nicht. | heller Streifen mit Winkeln nach innen |

Trümmerfelder wachsen als kurzer Irrlauf aus einem Startpunkt, Leiterbahnen und Schneisen
laufen radial nach außen — in derselben Richtung, in der auch das Netz wächst und die
Gegner kommen.

Damit eine gewürfelte Karte keine Partie ruiniert, gelten drei Regeln:

- **Der Ring um den Kern bleibt frei** (4,2 Zellen). Die ersten Bauten einer Partie dürfen
  nicht vom Würfel abhängen.
- **Je Himmelsrichtung höchstens zehn Trümmerzellen.** Gezählt wird in Zellen, nicht in
  Feldern: Ein Irrlauf wandert über Sektorgrenzen, und zwei Felder beiderseits einer Grenze
  könnten dieselbe Richtung sonst doch noch zuschütten. Gemessen über 400 Seeds bleiben in
  der am stärksten betroffenen Richtung immer noch 82 % des Bauplatzes frei.
- **Nichts am Feldrand und nichts jenseits von 13 Zellen** — dort baut ohnehin niemand.

Über 400 Seeds liegen 13 bis 33 Trümmerzellen auf dem Feld (Median 22), dazu 8–23 Zellen
Leiterbahn und 2–18 Zellen Schneise.

Gemessen kostet das Gelände fast nichts: je 300 Läufe ergaben mit Gelände Median 18 und
Schnitt 18,4, auf leerem Feld (`nogelaende`) Median 18 und Schnitt 19,1 — eine halbe Welle,
deutlich innerhalb der Streuung. Das ist kein Versehen, sondern die Absicht: Das Gelände
soll die Partie *anders* machen, nicht schwerer. Und wieder misst der Bot nur die eine
Hälfte — er weicht Trümmern aus, aber er sucht keine Leiterbahn.

Gespeichert wird **nur der Seed**, nicht die Karte: `neuesGelaende(seed)` baut sie Zelle
für Zelle wieder auf, und der Zufallsgenerator dafür ist seedbar (mulberry32). Beim Laden
steht das Gelände vor den Bauten — sonst käme ein Bau durch, der auf seinem eigenen Feld
gar nicht stehen dürfte. Ein Spielstand aus einer Fassung vor dieser Änderung bekommt
**Seed 0**, also ein leeres Feld: Nachträglich Schutt unter Bauten zu schieben, die dort
seit zwanzig Wellen stehen, wäre der falsche Umgang mit einem alten Stand.

## Tagesfeld

Beim Start stehen zwei Knöpfe: **Tagesfeld** (mit dem Datum) und **Freies Feld**. Auf dem
Tagesfeld spielen an einem Tag alle dasselbe — und erst damit lässt sich ein Ergebnis
überhaupt vergleichen.

Gleich sind: **das Gelände**, die **Zusammensetzung jeder Welle** samt Sturm und Boss, und
die **Karten, die zur Wahl stehen**. Nicht gleich sind die **Einfallsrichtungen** — die
folgen dem Druckgedächtnis und damit deinem eigenen Spiel — und alles, was am Bildbedarf
hängt (Partikel, Streuung im Feuer). Der Anspruch ist also nicht ein Lauf, der sich Bild
für Bild wiederholen ließe, sondern dieselbe Aufgabe für alle.

Der Kniff steckt darin, **wie** gewürfelt wird. Nicht aus einem laufenden Strom, sondern je
Ziehung aus einem eigenen Seed aus `Tag | Zweck | Nummer`:

```js
mitWuerfel(zweck, n, fn) {
  if (!this.tagesTag) return fn();              // freies Feld: echter Zufall
  const vorher = wuerfel;
  wuerfel = prng(seedVon(this.tagesTag + '|' + zweck + '|' + n));
  try { return fn(); } finally { wuerfel = vorher; }
}
```

Ein laufender Strom müsste mitgesichert werden und wäre nach einer fortgesetzten Partie um
ein paar Ziehungen verschoben — dann wäre Welle 12 nach dem Neuladen eine andere als
vorher. So bekommt Welle 12 ihren Seed, ganz gleich wie oft vorher gewürfelt wurde. Der
Preis dafür ist eine Regel, an die man sich halten muss: **Alles, was den Verlauf einer
Partie bestimmt, muss durch `wuerfel()` gehen** — `rand()`, `pick()` und `pickGewichtet()`
tun das. Deko darf weiter direkt `Math.random()` nehmen, die soll nicht Teil des
Tagesfeldes sein.

Der Tag ist der **Kalendertag des Spielers**, nicht UTC: Wer um 23:59 anfängt, spielt das
Feld von gestern zu Ende, und um 00:01 steht ein neues bereit.

Zwei Kleinigkeiten hängen mit dran:

- **Die Partie gehört ihrem Tag.** Der Spielstand merkt sich das Datum; wer morgen
  weiterspielt, spielt das Feld von gestern zu Ende. Alles andere wäre eine andere Partie.
- **Hinter der Startanzeige läuft nichts mehr.** Vorher tickte die erste Bauphase, während
  man noch den Einleitungstext las. Jetzt beginnt die Zeit mit dem Knopfdruck — und ohne
  Knopfdruck entsteht auch kein Spielstand.

Nach dem Kernverlust steht neben „Neu starten" ein Knopf **Ergebnis kopieren**. In der
Zwischenablage landet eine Zeile zum Weitergeben:

```
CORE DEFENSE · Tagesfeld 06.09.2026 · Welle 23 · 6 Pylone, 4 Blaster, 3 Reaktoren
```

Im freien Feld steht dort ausdrücklich `freies Feld` statt eines Datums — ein Ergebnis
ohne gemeinsames Feld soll sich nicht wie ein vergleichbares lesen. In der Bestenliste
steht bei Tagesläufen entsprechend `Tagesfeld 06.09.2026` statt des Spieldatums.

## Druckgedächtnis

Die Einfallsrichtungen lagen früher gleichmäßig auf dem Kreis und wurden nur zufällig
gedreht. Das hatte eine unangenehme Folge: Der beste Aufbau war der gleichmäßige Igel,
und ab Welle 10 sah jede Partie gleich aus. Jetzt merkt sich das Feld, wo es eng wurde.

Gemessen wird während jeder Welle in acht Sektoren — denselben, die die Vorschau als
Himmelsrichtungen nennt:

| Größe | Wie sie zählt |
|---|---|
| **Engste Annäherung** | 0 bis 1, gemessen ab 12 Zellen Abstand zum Kern. Wer weiter draußen stirbt, macht keinen Druck. |
| **Kernschaden** | 0,01 je Punkt, gebucht auf die Seite, aus der der Treffer kam |
| **Verlorene Bauten** | 0,3 je Bau, gebucht auf seine Position |

Die Annäherung zählt als **Höchstwert**, nicht als Summe: Die Aussage ist der Durchbruch,
nicht die Zahl der Läufer. Kernschaden und Verluste addieren sich dagegen — sie sagen,
was der Durchbruch gekostet hat.

Nach der Welle wird das Ergebnis zu 55 % ins Gedächtnis gemischt, der Rest bleibt vom
Vorherigen stehen. Ein einmaliger Einbruch ist damit nach zwei ruhigen Wellen fast
vergessen, eine dauerhaft offene Flanke nicht.

Aus dem Gedächtnis werden Gewichte je Sektor, gemessen **gegen den eigenen Mittelwert**:
Eine Welle, die überall gleich weit kam, sagt nichts über eine Schwachstelle und
verschiebt deshalb auch nichts. Ohne Geschichte steht jeder Sektor auf 1, und die Drehung
des Rings ist wieder gleichverteilt wie vorher. Ganz dieselbe Planung ist es trotzdem
nicht: Welche Richtung den nächsten Pulk bekommt, wird jetzt gezogen statt reihum
vergeben — auch bei lauter Einsen. Das allein verteilt die Gegner ungleichmäßiger auf die
Richtungen als früher.

Die Gewichte wirken an drei Stellen:

- **Wo der Ring liegt.** Die Zahl der Einfallsrichtungen bleibt gleich, und sie bleiben
  gleichmäßig über den Kreis verteilt — verschoben wird nur, wo die erste zu liegen kommt.
- **Wie viel Masse jede Richtung bekommt.** Gegner kommen in Pulks; wohin der nächste
  Pulk geht, wird gewichtet gezogen.
- **Wo der Boss erscheint.** Auch er sucht die schwache Seite.

Der Deckel ist dabei der wichtigste Teil: Kein Sektor kommt über **2,0**, keiner unter
**0,5**. Ohne ihn schlägt die Rückmeldung nach zwei, drei Wellen immer auf dieselbe Seite
und die Partie endet an einer Ecke statt an einer Entscheidung. Mit ihm bleibt jede
Richtung möglich, die schwache nur wahrscheinlicher: Bei Dauerdruck aus einer Richtung
bekommt sie rund ein Drittel aller Gegner statt der gleichverteilten 12,5 % — und in
jeder vierten Welle kommt trotzdem etwas aus der Gegenrichtung.

Eine eigene Anzeige braucht es dafür nicht. Die Bilanz nach der Welle nennt die Richtung,
in die es zieht, und danach zeigen Vorschau und Randpfeile die geplante Welle ohnehin.
Genannt wird sie nur, wenn eine Seite wirklich heraussticht: über dem Schnitt **und**
mindestens 0,25 Gewicht vor der zweitstärksten. Zwei fast gleich starke Seiten zu einer zu
erklären wäre eine Auskunft, die nicht stimmt.

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

Ab 72 % Struktur bekommt ein Bau zwei Sprünge, ab 55 % drei, ab 35 % fünf; die Risse
glühen umso heller, je schwerer der Schaden ist, und unter 40 % glimmt zusätzlich eine
Bruchstelle. Der Rissverlauf wird aus der Position des Baus abgeleitet und
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
- **Barriere** (10) — braucht keinen Strom, lenkt Bodentruppen um, lässt sich in Reihen ziehen
- **Lichtbogen** (55) — Strahl, der auf drei weitere Gegner überspringt
- **Minenleger** (40) — legt Minen in Zellen, die kein Turm deckt
- **Werkdrohne** (45) — setzt Bauten in Reichweite instand, mitten im Gefecht
- **Schildfeld** (60) — lädt aus Überschuss vor und fängt Treffer auf Nachbarn und Kern ab

Jedes Gebäude hat **fünf Ausbaustufen**: je +42 % Schaden, +7 % Reichweite, +28 % Struktur.
Der Ausbau kostet mit jeder Stufe mehr (Blaster: 39, 56, 72, 89 — zusammen 256 gegenüber
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
| Lichtbogen | **Kettenreaktion** — wer am Bogen stirbt, entlädt sich in seine Nachbarn |
| Minenleger | **Näherungszünder** — die Minen zünden auch unter fliegenden Gegnern |
| Werkdrohne | **Notfallschweißung** — einmal je Welle ein fallender Bau sofort wieder ganz |
| Schildfeld | **Rückkopplung** — zwei Fünftel des Geschluckten treffen den Angreifer |

Am Bau erkennbar: Stufe 2 bis 4 an Kerben am Sockel, Stufe 5 an einem goldenen Ring.

**Reparatur** (`R`): Ein beschädigter Bau wird für 35 % seines Werts anteilig zum Schaden
instandgesetzt — bei ausgebauten Türmen deutlich billiger als Abbau und Neubau. Ohne
Auswahl setzt `R` alles instand, was noch bezahlbar ist, das Kaputteste zuerst.
Abbau erstattet 60 % des gesamten Bauwerts inklusive aller bezahlten Ausbaustufen.

**Verschieben** (`V`, oder der Knopf im Inspektor): Ein fertiger Bau zieht auf ein freies
Feld um und behält dabei Stufe, Struktur samt Schaden und alle Einstellungen. Danach
klebt er am Zeiger — Zielfeld, Reichweite und Netzradius werden dort angezeigt, eine
Linie führt zum alten Platz zurück, `Esc` oder Rechtsklick bricht ab. Bezahlt wird
**ein Viertel des Bauwerts**.

Warum ein Viertel und nicht die Hälfte: Abbau und Neubau kosten zusammen netto 40 % des
Bauwerts (60 % zurück, 100 % wieder hin) — bei „halben Kosten" wäre der Umzug also
*teurer* als der Umweg und damit sinnlos. Ein Selbsttest hält genau das fest. Wer die
Karte **Ausschlachten** zieht (Abbau erstattet den vollen Preis), bekommt den Umweg
umsonst; dann ist Verschieben nur noch Bequemlichkeit.

Der Umzug ist kein Neubau: Das Bauwerk behält seine Identität, ein Saboteur, der es
angepeilt hat, läuft dem neuen Feld hinterher. Was am *Ort* hing, zählt dagegen neu —
die Leiterbahn unter einem Pylon und das Netz, das komplett neu gerechnet wird. Genau
das ist der Reiz: Ein Umzug formt den Versorgungsbaum um, und wer einen Pylon zu weit
zieht, hängt alles hinter ihm ab.

## Bauplan spiegeln

Das Feld ist 41 × 25 Zellen groß, mit dem Kern genau in der Mitte. Das ist kein Zufall:
Beide Kantenlängen sind ungerade, also hat **jede Zelle einen exakten Partner** auf der
anderen Seite — `x' = 40 − x`, `y' = 24 − y`, ohne Rundung und ohne Rest. Wer eine Seite
fertig hat, spiegelt sie mit `B` (oder dem Knopf **Bauplan** in der Taskleiste) auf eine
andere.

Der Zeiger wählt dabei die Seite, die gefüllt werden soll: Maus nach rechts, und die
linke Hälfte wird nach rechts gespiegelt; Maus nach oben, und die untere klappt nach
oben. Die Vorschau zeigt die Achse durch den Kern, ein Kästchen an jeder Stelle, an der
etwas entstünde, und die Rechnung dazu — „9 Bauten für 240 Materie". Was die Materie
nicht mehr trägt, steht blass daneben. Klick baut, `Esc` bricht ab.

Kopiert wird der **Grundriss, nicht der Bestand**: Jeder Bau entsteht auf Stufe 1 zum
normalen Neubaupreis. Die Ausbaustufen sind die Arbeit einer ganzen Partie, und sie in
einem Klick mitzukaufen wäre kein Bauplan mehr, sondern ein zweites Feld. Billiger als
von Hand ist das Spiegeln also nicht — es ist nur schneller und genauer.

Drei Regeln, die man beim Spielen sofort bemerkt:

- **Was auf der Achse steht, wird nicht kopiert.** Es ist sein eigener Spiegel und steht
  bereits richtig.
- **Belegte Zellen und Trümmer werden still übersprungen** — wie beim Ziehen einer
  Barrierenreihe. Ein Feld, das schon symmetrisch ist, meldet ehrlich „nichts zu
  spiegeln".
- **Reicht die Materie nicht, wächst der Plan von innen nach außen.** So entsteht ein
  zusammenhängender Anfang, der am Netz hängt, statt verstreuter Inseln am Rand.

## Vier späte Bauteile

Die ersten sieben Bauteile liegen alle auf derselben Achse: mehr Schaden, mehr
Reichweite, mehr Struktur. Die vier späten füllen vier Rollen, die es davor gar nicht
gab — und drei von ihnen machen nicht auf die übliche Art Schaden.

### Lichtbogen (55, Taste `8`)

Ein Strahl, der auf bis zu drei weitere Gegner überspringt; jeder Sprung trifft mit 72 %
des vorigen (14 → 10,1 → 7,3 → 5,2) und reicht 2,1 Zellen weit. Zwei Eigenschaften
folgen daraus:

- Er ist ein **Strahl**, kein Geschoss — gegen Schilde trifft er anderthalbfach statt halb.
- **Panzerung geht von jedem einzelnen Sprung ab.** Gegen einen Brute (6 Panzerung) bleibt
  vom dritten Sprung fast nichts übrig. Der Bogen ist gegen Pulks überlegen und gegen
  gepanzerte Einzelziele schwach. Das ist kein Versehen, das ist seine Rolle.

Stufe 5 **Kettenreaktion**: Wer am Bogen stirbt, entlädt sich in seine Nachbarn.

Zum Namen: „Kettenblitz" war schon vergeben — als Karte, die Geschosse überspringen lässt.

### Minenleger (40, Taste `9`)

Der einzige Bau, der Schaden macht, ohne zu zielen. Alle 3,2 s legt er eine Mine und hält
höchstens fünf davon. Er sucht dafür die Zelle, die **am wenigsten gedeckt** ist: je
weniger Türme sie erreichen, desto besser, bei Gleichstand die weiter außen und die mit
mehr Abstand zu den anderen Minen. So wandern die Minen von selbst in die toten Winkel,
die auf einem Feld ohne Wege zwangsläufig entstehen.

Eine Mine zündet unter Bodentruppen (62 Schaden, 1,45 Zellen Umkreis), nicht unter
Fliegern — bis Stufe 5, dann bekommt sie einen **Näherungszünder**. Gelegte Minen
überdauern die Welle, werden aber nicht mitgespeichert: Wer mitten im Gefecht schließt,
findet das Feld wieder ohne sie, genau wie bei Gegnern und Geschossen.

### Werkdrohne (45, Taste `0`)

Setzt den am schlimmsten beschädigten Bau in Reichweite instand: 14 Struktur je Sekunde,
0,3 Energie je Punkt, also 4,2 Energie/s Dauerlast — ungefähr so viel wie ein Blaster
verschießt. Reparieren von Hand kostet Materie und geht nur zwischen den Wellen; die
Drohne kostet Energie und arbeitet mitten im Gefecht.

Stufe 5 **Notfallschweißung**: Fällt ein Bau in Reichweite unter ein Viertel Struktur,
ist er einmal je Welle sofort wieder ganz.

### Schildfeld (60, Taste `G`)

Die erste Fassung zog ihre Energie in dem Augenblick, in dem der Treffer fiel — und
verlor jede Messung, auch mit halbiertem Preis und größerer Reichweite. Der Grund ist
strukturell: Dieselbe Energie verhindert als Feuerkraft mehr Schaden, als sie als
Absorption auffängt. Solange beides um denselben Puffer streitet, kann ein rein
defensiver Bau nicht gewinnen.

Deshalb **lädt es vor**. Es füllt einen Vorrat von 170 Punkten je Stufe mit 8 Punkten je
Sekunde, aber nur aus dem Überschuss oberhalb von 60 % Puffer — also vor allem in der
Bauphase, in der die Regeneration sonst am vollen Puffer verpufft. Im Gefecht gibt es aus
dem Vorrat aus und kostet dabei keinen einzigen Schuss.

Gedeckt sind alle Bauten in 3,2 Zellen — **außer dem Generator selbst**, der damit die
weiche Stelle im eigenen Feld bleibt — und der **Kern**, wenn er nah genug steht. Das ist
der eigentliche Grund, eines zu bauen: Es ist der einzige Bau, der Kernschaden abfängt,
ohne dem Puffer im selben Moment etwas wegzunehmen.

Stufe 5 **Rückkopplung**: Zwei Fünftel des Geschluckten treffen den Angreifer.

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
| **Druck der nächsten Welle** | wohin das Druckgedächtnis zieht — die einzige Zeile, die nach vorn schaut |

Angezeigt wird nur, was passiert ist: Wer keinen Bau verlor, liest dazu auch keine Null.
Gegner, verschossene Energie und Materie stehen immer, der Rest erscheint, wenn er etwas
zu sagen hat.

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
Überladung, Materie, Puffer, Kern, alle genommenen Karten, der Kernmodus, der Seed des
Geländes, das Druckgedächtnis, der Tag des Tagesfeldes und die bereits angekündigte
nächste Welle — die Vorschau hält also, was sie vor dem Schließen versprach.

Gegner, Geschosse und der laufende Sturm werden *nicht* gesichert. Das ist eine
Entscheidung, keine Sparmaßnahme: Wer mitten im Gefecht die Seite schließt, setzt bei
derselben Welle wieder an. Damit das kein Ausweg aus einer verlorenen Welle wird, zählt
für die Bestenliste `bestWave` — die höchste je *begonnene* Welle. Ein Neuladen kann eine
Wertung dadurch nie senken, nur das Weiterkommen kann sie heben.

**Bestenliste.** Die acht besten Läufe mit Welle, Datum (bei Tagesläufen: welches
Tagesfeld) und den drei häufigsten Bauteilen am Ende. Sie steht auf der Startanzeige und nach dem Kernverlust, dort mit dem eigenen
Lauf hervorgehoben. Ein Lauf wird eingetragen, wenn der Kern fällt — und derselbe Moment
löscht den Spielstand, weil die Partie zu Ende ist und nicht unterbrochen.

**Der eigene Name.** Nach dem Kernverlust trägt die eigene Zeile ein Feld — dort steht der
Name, höchstens 14 Zeichen lang. Es hat den Fokus, sobald es leer ist, und braucht kein
Speichern: Jeder Tastendruck geht sofort in die Liste. Der Name bleibt liegen und ist beim
nächsten Lauf schon eingetragen, die Zeile zum Weitergeben nennt ihn mit. Solange niemand
einen eingetragen hat, hat die Tabelle die Spalte gar nicht. Auch der Name bleibt auf
diesem Rechner — es gibt keinen Server, an den er ginge, und keine Liste außerhalb dieses
Browsers, in die er käme.

## Balance messen

Im Ordner `tools/` liegt ein Prüfstand, der das ganze Spiel ohne Browser in node lädt,
und ein simulierter Spieler, der damit Partien spielt. Beides braucht nichts außer node.

```bash
node tools/bot.js 100 40                 # 100 Partien bis Welle 40
node tools/bot.js 60 40 noflow,nomod     # dieselbe Messung ohne Leitungslast und Sturmwellen
node tools/bot.js 60 40 noakku          # ohne Akkus — der Bot lebt vom Kernpuffer allein
node tools/bot.js 200 40 nodruck        # Wellen gleichverteilt statt ins Druckgedächtnis
node tools/bot.js 300 40 nogelaende     # leeres Feld statt erzeugtem Gelände
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

Stand der Messung (Bot in dieser Fassung, Limit Welle 40):

| Konfiguration | Läufe | Median | Schnitt | am Limit |
|---|---|---|---|---|
| heutiger Stand | 600 | 19 | 18,8 | 6,8 % |
| ohne Akkubau (`noakku`) | 200 | 10 | 13,8 | 3,5 % |

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

### Was das Druckgedächtnis kostet

Die Änderung wurde in zwei Schritten gegen den vorherigen Stand gemessen, je 600 Läufe:

| Konfiguration | Median | Schnitt | am Limit |
|---|---|---|---|
| Stand davor (Richtungen reihum) | 20 | 20,0 | 12,0 % |
| neu, aber ohne Gewichtung (`nodruck`) | 19 | 19,4 | 9,3 % |
| neu, mit Druckgedächtnis | 19 | 18,8 | 6,8 % |

Zwei Dinge stehen da, und beide sind klein. Der erste Schritt ist gar nicht das Gedächtnis,
sondern eine Nebenwirkung: Die Richtung des nächsten Pulks wird jetzt **gezogen** statt
reihum vergeben, und schon das verteilt die Gegner ungleichmäßiger. Der zweite Schritt ist
die Gewichtung selbst. Zusammen rund **eine Welle im Schnitt** und knapp die Hälfte der
Läufe, die vorher das Limit erreichten.

Statistisch ist jeder einzelne dieser Schritte für sich **nicht** über der Streuung: Die
Läufe am Limit unterscheiden sich um etwa anderthalb Standardabweichungen. Belastbar ist
nur, dass beide Messungen in dieselbe Richtung zeigen — und dass die Größenordnung eine
halbe bis eine Welle ist und nicht fünf.

Interessanter ist, was **nicht** herauskam. Die Erwartung war, dass das Gedächtnis vor
allem einen einseitigen Aufbau bestraft. Dafür gibt es den Schalter `schief`: Der Bot
lässt den Norden absichtlich unbesetzt und spielt sonst wie immer (je 300 Läufe):

| Konfiguration | Median | Schnitt | am Limit |
|---|---|---|---|
| schief, ohne Gewichtung | 19 | 17,9 | 6,7 % |
| schief, mit Druckgedächtnis | 18 | 17,2 | 4,3 % |

Der Abstand ist derselbe wie beim gleichmäßigen Aufbau — die Lücke wird also *nicht*
härter bestraft als das gleichmäßige Feld. Entweder deckt die Reichweite der Nachbartürme
das Loch, oder es entscheidet ohnehin die Gesamtfeuerkraft und nicht ihre Verteilung.

Vor allem aber ist der Bot hier ein besonders schlechter Stellvertreter: Er **reagiert
nicht**. Der ganze Zweck des Gedächtnisses ist, dass man die genannte Seite in der
nächsten Bauphase verstärkt — und genau das kann der Bot nicht. Er misst deshalb immer nur
den Preis, nie den Gewinn.

### Was die vier späten Bauteile kosten

Gemessen wurde in drei Schritten, weil eine einzige Zahl hier drei verschiedene Fragen
verwischt hätte. Alle Bot-Läufe gegen den Stand direkt davor, je 200 Läufe:

| Konfiguration | Median | Schnitt | am Limit |
|---|---|---|---|
| vorher, ohne die vier Bauteile | 19 | 19,3 | 14/200 |
| nachher, Bot baut sie nicht | 17 | 17,2 | 8/200 |
| nachher, ohne die fünf neuen Karten | 18 | 18,0 | 13/200 |
| `stuetzen` — Werkdrohnen und Schildfelder dazu | 17 | 17,0 | 12/200 |

Die zweite Zeile war die Überraschung: Der Bot baut die neuen Bauteile gar nicht, und
trotzdem fällt der Median. Die dritte Zeile erklärt es — **der Kartenstapel wächst mit**.
Fünf neue Karten sind für ihn wertlos, weil er die zugehörigen Bauteile nie baut, und bei
vier Karten zur Wahl aus jetzt 62 verdünnt das jede Ziehung. Der Rest liegt im Rauschen
(dokumentiert: selbst bei 200 Läufen wandert der Median um ein bis zwei Wellen). Wer
künftig Bauteile ergänzt, sollte das mitrechnen: Jedes neue Bauteil bringt Karten mit, und
die kosten alle anderen ein Stück Trefferwahrscheinlichkeit.

Die vierte Zeile sagt, was die beiden Stützbauten den Bot kosten: nichts. Sie sagt aber
auch nichts über ihren Nutzen — der Bot repariert zwischen den Wellen ohnehin alles, was
kaputt ist, also bleibt der Werkdrohne genau das, was sie *während* der Welle hält.

**Die beiden neuen Türme einzeln**, je 150 Läufe, jeweils als vierter Typ in derselben
Rotation:

| Rotation | Median | Schnitt | am Limit |
|---|---|---|---|
| Blaster, Kanone, Frost (Grundstand) | 17–19 | ~18 | 4–7 % |
| + Lichtbogen | 16 | 18,0 | 12/150 |
| + Minenleger | 15 | 15,7 | 7/150 |
| + beide (`neu`) | **5** | 9,9 | 3/200 |

Die letzte Zeile sieht nach einer Katastrophe aus und ist eine über das Messgerät. Mit
beiden Türmen rotiert der Bot durch **fünf** Typen statt drei — und weil er stumpf
gleichmäßig verteilt, fällt der Anteil der **Kanonen** von einem Drittel auf ein Fünftel.
Nachgezählt über je zwölf Läufe bis Welle 10: 124 Kanonen im Grundstand, 30 mit `neu`.
Die Kanone ist die Antwort auf die gepanzerten Brutes ab Welle 4 — und genau dort enden
76 der 200 Läufe. Nicht die neuen Türme sind das Problem, sondern eine Bauregel, die
„alle Typen gleich oft" mit „richtig gemischt" verwechselt. Einzeln kommt jeder der beiden
im Rahmen des Rauschens durch.

**Die beiden Stützbauten** lassen sich mit dem Bot gar nicht messen, siehe oben. Dafür
gibt es eine eigene Messung (`node tools/stuetzen.js 120 8`) mit festem Aufbau: ein geschlossener Barrierenring, acht
Blaster dahinter, Netz und Nachschub fest, der Kern für die Dauer der Messung
unverwundbar — und dann viermal derselbe Platz, einmal mit einem weiteren Blaster, einmal
mit vier Werkdrohnen, einmal mit vier Schildfeldern. 120 **gepaarte** Läufe: Lauf *i*
bekommt für alle drei Varianten denselben Tagesseed und damit dieselbe Welle. Ohne diese
Paarung ist das Rauschen zwischen den Wellen größer als der Unterschied zwischen den
Bauten — der erste Anlauf ohne Paarung hat genau daran nichts gezeigt.

| Variante | verlorene Struktur (Welle 8) | gegen den Blaster | besser in |
|---|---|---|---|
| ein weiterer Blaster | 752 | — | — |
| vier Werkdrohnen | 702 | −50 | 81/120 |
| vier Schildfelder | 801 | +49 | 30/120 |

Die Werkdrohne ist ihren Platz also wert, das Schildfeld verliert knapp. Dabei ist die
Messung zugunsten der Feuerkraft verzerrt: Der Aufbau hat zu wenig davon, jeder weitere
Blaster wirkt dort überdurchschnittlich, und das Schildfeld deckt nur 26 der 46 Bauten.
Was die Zahl nicht sieht, ist der Kern — den fängt nur das Schildfeld ab, und der
entscheidet die Partie.

Der Weg dorthin ist der eigentliche Ertrag der Messung. Die erste Fassung des Schildfelds
zog die Energie im Augenblick des Treffers und verlor **jede** Variante: mit halbem Preis
je Punkt, mit größerer Reichweite, mit Energieüberschuss im Netz. Dieselbe Energie
verhindert als Feuerkraft mehr Schaden, als sie als Absorption auffängt — solange beides
um denselben Puffer streitet, kann ein rein defensiver Bau nicht gewinnen. Erst das
Vorladen aus Überschuss macht daraus einen Bau, der im Gefecht nichts wegnimmt.

### Die Wand bei Welle 10

Bis vor Kurzem endete dort gut jeder vierte Lauf (57 von 200). Die Ursache lag zur Hälfte
woanders als vermutet — die Untersuchung steht in `IDEAS.md` unter „Gefunden und behandelt".
Die Kurzfassung in Zahlen:

| Stand | Median | am Limit | Ende bei Welle 10 |
|---|---|---|---|
| vorher | 12 | 13 | 57 |
| nur mit der Schild-Untergrenze | 18 | 14 | 29 |
| dazu Titan 880 TP statt 1100, 55 Schaden statt 70 | 19 | 23 | 9 |

Die Wand ist damit weg. Vollständig glatt ist die Verteilung um Welle 10 aber nicht, das
zeigte erst die größere Stichprobe zum Druckgedächtnis: In 600 Läufen des heutigen Standes
enden dort 6,0 %, auf den Nachbarwellen 9 und 11 dagegen 2,2 % und 1,3 %. Der Titan ist
eine Stufe geblieben, nur keine Mauer mehr.

Deutlich größer ist der **Moloch auf Welle 20**: Dort enden 13,5 % aller Läufe, gegen 3,8 %
eine Welle davor und 1,0 % eine danach. Das ist der nächste Kandidat, wenn wieder
abgestimmt wird — und es lag nicht am Druckgedächtnis, der Stand davor zeigt denselben
Ausschlag. Eine frühere Notiz hier nannte für Welle 20 nur 9 %; das war ein Fenster von
200 Läufen.

### Zwei Messungen neben dem Bot

Für zwei Fragen ist der Bot das falsche Werkzeug, weil sein eigenes Verhalten die Antwort
überdeckt. Dafür liegen zwei kleine Messskripte daneben. Beide bauen selbst auf, spielen
eine einzelne Welle und geben eine Tabelle aus — sie brauchen weder Browser noch Bot.

```bash
node tools/stuetzen.js 120 8              # was Werkdrohne und Schildfeld gegen einen Blaster halten
node tools/stuetzen.js 120 8 ueberschuss  # dasselbe, wenn Energie nicht knapp ist
node tools/stuetzen.js 120 8 kern         # Prüfplätze am Kern, Kernschaden als Kennzahl
node tools/schaden.js 30 8                # Schaden je Turmtyp am selben Platz
node tools/schaden.js 30 16               # dasselbe später, wenn die Gegner zäher sind
```

`stuetzen.js` misst **gepaart**: Lauf *i* bekommt für alle drei Varianten denselben
Tagesseed und damit dieselbe Welle, sonst ist das Rauschen zwischen den Wellen größer als
der Unterschied zwischen den Bauten. Kennzahl ist „besser in *x*/*N*", nicht der
Mittelwert — einzelne Läufe mit einem verlorenen Bauteil ziehen den zu stark. Der Bot
taugt hier nicht, weil er zwischen den Wellen ohnehin alles repariert.

`schaden.js` stellt von jedem Turmtyp gleich viele Stück im Wechsel auf denselben Ring,
gibt Energie im Überfluss und zählt danach `b.schaden`. Der Bot taugt hier nicht, weil
seine Baureihenfolge mitentscheidet, wer wie oft schießt. Die aussagekräftige Spalte ist
„Schaden je Energie": Knapp ist im Spiel die Energie, nicht der Bauplatz. Und die Zahl
misst nur Feuerkraft — was ein Turm daneben leistet (verlangsamen, Pulks treffen, tote
Winkel decken), steht nicht drin.

### Selbsttest

Neben der Messung liegt eine Prüfdatei, die das nachrechnet, was sich nicht ansehen lässt:

```bash
node tools/pruefen.js
```

Sie läuft in einer fünftel Sekunde und deckt Leitungslast, die drei Kernbefehle, alle
sieben Sturmwellen, die getrennten Akkus, die drei Kernmodi samt Anlauf und Schild,
Spielstand und Bestenliste, das Druckgedächtnis, das erzeugte Gelände, das Tagesfeld,
Reparatur, Abbau, Verschieben, den gespiegelten Bauplan, die vier späten Bauteile und
die Sonderfähigkeiten der fünften Stufe ab — dazu die Texte: jede Karte gegen ihre eigene
Wirkung, die Landingpage und diese Datei gegen `config.js`. Der Prüfstand hat dafür einen flüchtigen `localStorage`, der ein erneutes Laden
des Spiels im selben Prozess übersteht — nur so lässt sich Sichern gegen Laden prüfen.
Die Prüfungen sind in vier Sorten aufgeteilt, und der Unterschied ist wichtig:

- **Verdrahtung.** Der Erwartungswert wird aus `js/config.js` abgeleitet. Diese Prüfungen
  fragen, ob eine Konstante überhaupt an der richtigen Stelle wirkt — sie schlagen bei
  einer bewussten Abstimmung *nicht* Alarm. Hängt jemand die Drosselung aus dem
  Feuerpfad aus oder rechnet der Netzstoß den Verbrauch nicht mehr, fallen sie um.
- **Balance-Anker.** Ein Block am Ende mit fest eingetragenen Zahlen, der den heutigen
  Stand festhält. Er fängt die versehentlich verschobene Zahl, die der Verdrahtungsteil
  bauartbedingt nicht sehen kann. Schlägt er fehl, ist beides eine gültige Antwort: das
  Versehen zurücknehmen — oder den Wert dort nachziehen, wenn die Änderung gewollt war.
- **Kartentexte.** Jede der 62 Karten wird auf eine Kopie der Grundwerte angewandt, der
  Unterschied ausgerechnet und nachgesehen, ob er im Kartentext steht — als Prozentsatz,
  als Summand oder als Prozentpunkt. Zur Zahl gehört ein Wort: „+40 % Feuerrate" und
  „+40 % Reichweite" unterscheiden sich in keiner Ziffer, deshalb muss zu `rate` auch
  *Feuerrate* im Text stehen und zu `type.cannon.*` das Wort *Kanone*. Karten, die ihre
  Zahl als Wort schreiben („doppelt so schnell"), stehen in einer kurzen Ausnahmeliste und
  werden einzeln geprüft.
- **README.** Derselbe Gedanke für diese Datei: Preise, Stufe-5-Tabelle, Kernbefehle,
  Kernmodi, Sturmnamen, Startwellen der Gegner, Gelände-, Netz- und Prioritätsschwellen
  werden als Zeichenkette aus `config.js` gebaut und hier gesucht. Prosa bleibt Prosa —
  geprüft wird nur, was sich ableiten lässt. Kleine Zahlen dürfen als Wort dastehen.
- **Landingpage.** Ein Block liest `index.html` und vergleicht jede Zahl, die die Seite
  behauptet, mit der, die gilt: Stückliste (Taste, Materie, Struktur, Schaden), Ausbau,
  Reparatur, Abbau, Verschieben, alle elf Stufe-5-Fähigkeiten, Leitungslast, Kern,
  Kartenzahl, Kernbefehle, Kernmodi und ab welcher Welle ein Gegnertyp kommt. Ohne ihn
  läuft die Erklärung still vom Spiel weg — genau das war passiert: Lichtbogen 12 statt 14
  Schaden, Minenleger 46 statt 62, ein Kartenstapel von 57 statt 62 und fünf fehlende
  Fähigkeiten.

Alle Sorten sind gegengeprüft: Vier verstellte Werte in `config.js` haben fünf Anker
umgeworfen, zwei ausgehängte Stellen im Feuerpfad zwei Verdrahtungsprüfungen, sechs
zurückgedrehte Zahlen auf der Landingpage sechs Seitenprüfungen, sieben verfälschte
Kartentexte sieben Kartenprüfungen und fünf verstellte Zahlen in dieser Datei fünf
README-Prüfungen.

Die Schalter `noflow`, `nomod`, `nopower`, `noakku`, `nomode`, `nodruck` und `nogelaende`
schalten Leitungslast, Sturmwellen, Kernbefehle, den Akkubau, den Moduswechsel des Bots,
die Gewichtung des Druckgedächtnisses und das erzeugte Gelände ab; `neu` nimmt Lichtbogen
und Minenleger in die Turmauswahl auf, `stuetzen` baut Werkdrohnen und Schildfelder dazu. So lässt sich messen, was ein einzelnes System zur Schwierigkeit
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
- `js/einfuehrung.js` — geführte erste Welle für neue Spieler
- `js/landing.js` — Einblendungen, Vollbild, Skalierung des Spielblocks
- `tools/harness.js` — lädt das Spiel ohne Browser in node
- `tools/bot.js` — simulierter Spieler für Balance-Messungen
- `tools/pruefen.js` — Selbsttest der Mechaniken (`node tools/pruefen.js`)
- `tools/stuetzen.js` — gepaarte Messung für Werkdrohne und Schildfeld
- `tools/schaden.js` — Schaden je Turmtyp bei gleichem Platz und freier Energie
- `tools/crazygames/` — Quelle für den Portal-Export (siehe unten)
- `tools/build-crazygames.sh` — baut daraus `dist-crazygames/` und das Upload-Zip

Balance-Änderungen brauchen fast immer nur `js/config.js`.

### Wie das Spiel in der Seite sitzt

Das HUD ist in festen Pixeln gebaut. Statt es umzurechnen, hängt der ganze
Spielblock (`#stage`, 1312 × 800) in `#fit` und wird per `transform: scale()`
auf die Containerbreite gebracht — Canvas und Bedienelemente bleiben dadurch im
Verhältnis. Mausklicks rechnet `getBoundingClientRect()` automatisch richtig um.

Tastatur und Spieltakt laufen nur, solange das Spielfeld zu mindestens 30 %
im Bild ist. Sonst würde die Leertaste beim Lesen eine Welle starten.

### Export für CrazyGames

`./tools/build-crazygames.sh` erzeugt `dist-crazygames/` (lokal testbar) und
`dist-crazygames.zip` (Upload) — ein eigenständiges HTML5-Paket ohne die
Landingpage drumherum, das Spielfeld füllt dort das ganze Fenster
(`tools/crazygames/crazygames.css` ersetzt `landing.css`s Fullscreen-Regel als
Normalzustand statt als Sonderfall). `tools/crazygames/sdk.js` bindet das
CrazyGames-SDK v3 ein: `loadingStart/Stop` beim Start, `gameplayStart/Stop`
über dieselbe Bedingung wie der eigene Render-Loop (`!paused && !over &&
Overlay verborgen`), ein Midgame-Ad-Aufruf einmal je Game-Over. Beide
Export-Dateien (`js/config.js` … `js/game.js`, `js/einfuehrung.js`, `style.css`) werden beim Bauen
aus den echten Quelldateien kopiert, nicht dupliziert gepflegt — Balance- oder
Spiellogik-Änderungen landen dort automatisch beim nächsten Lauf des Skripts.

`./tools/build-crazygames.sh web` baut aus denselben Schritten `dist-web-en/`, die
englische Fassung für dheits.de. Sie ist eingecheckt, und `node tools/pruefen.js` baut sie
zur Kontrolle frisch und schlägt an, wenn der eingecheckte Stand veraltet ist — nach jeder
Änderung am Spiel also neu bauen und mitcommitten. Sie kommt ohne CrazyGames-SDK und ohne
eingebettete Schriften aus, weil die Content-Security-Policy auf dheits.de Skripte und
Schriften nur von der eigenen Adresse zulässt. Alle Pfade sind relativ.

Lokal testen: `python3 -m http.server 8123 --directory dist-crazygames`.
`dist-crazygames/`, `dist-gamedistribution/` und die beiden Zips sind Build-Output und
absichtlich in `.gitignore`.

### Export für GameDistribution

`GD_GAME_ID=<Game ID> ./tools/build-crazygames.sh gamedistribution` baut
`dist-gamedistribution/` und `dist-gamedistribution.zip` (Upload im Entwicklerportal). Die
Game ID gibt das Portal beim Anlegen des Spiels vor; ohne sie steht ein Platzhalter in
`index.html`, und das Skript weist darauf hin. Englisch, ohne Landingpage, mit
`tools/gamedistribution/`:

- `sdk-snippet.html` steht im Kopf von `index.html` und lädt das GameDistribution-SDK vor
  dem Spiel — das Portal verlangt es so.
- `gd.js` ersetzt hinter dem Fenster-Teil von `sdk.js` den CrazyGames-Teil. Werbung läuft nur
  als Antwort auf einen Klick an den Knöpfen der Anzeige (Start, „Neu starten" nach dem
  Kernverlust); der Klick wird bis zum Ende der Anzeige gehalten und dann ausgelöst. Der
  zweite Knopf am Spielende kopiert nur das Ergebnis und bekommt keine. Zwischen zwei Anzeigen
  liegen mindestens 60 Sekunden, auch über ein Neuladen hinweg. `SDK_GAME_PAUSE` hält
  Spiel und Ton an, `SDK_GAME_START` stellt den vorherigen Zustand wieder her — eine eigene
  Pause oder ausgeschalteter Ton des Spielers bleiben also erhalten.

`node tools/pruefen.js` baut den Export in einen Temp-Ordner und prüft Kopf, Game ID, fehlende
CrazyGames-Reste und das Verhalten von `gd.js` in einer Attrappe. Fehlt das SDK
(Werbeblocker) oder scheitert die Anzeige, geht der Klick trotzdem durch.
