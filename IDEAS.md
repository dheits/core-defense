# Was man noch einbauen kann

Notizen aus einer Runde Recherche zum Genre (Mindustry, Rogue Tower, Infinitode 2,
Bloons TD 6, Kingdom Rush, Dome Keeper), sortiert nach dem, was diesem Spiel am
meisten bringt — nicht nach dem, was am meisten Arbeit macht. Quellen am Ende.

Die Leitfrage bei jedem Punkt: **Zahlt es auf die eigene Idee ein?** Das Energienetz
ist das, was CORE DEFENSE von tausend anderen TDs unterscheidet. Features, die das
Netz zur Nebensache machen, gehören nicht dazu, auch wenn das Genre sie kennt.

---

## 1 · Das Energienetz weiter auspressen

Der wertvollste Bereich: Hier ist das Spiel schon eigen, aber die Mechanik ist noch
nicht ausgereizt. Alles hier ist billig zu bauen, weil Netz und Energiebilanz bereits
existieren (`recomputeSupply()` in `js/game.js`).

**Überladung** ✅ *umgesetzt* — ein Schalter je Turm: doppelter Schaden, dreifacher Energieverbrauch.
Macht aus der Energiebilanz eine Entscheidung, die man mitten in der Welle trifft,
statt einer, die man beim Bauen einmal festlegt. *Klein: ein Flag pro Gebäude, zwei
Zeilen im Feuerpfad, ein Knopf im Inspektor.*

**Lastabwurf mit Priorität** ✅ *umgesetzt* — bei leerem Puffer feuern heute alle Türme nicht mehr.
Besser: Der Spieler legt fest, wer zuerst Strom bekommt. Aus einem Ärgernis wird eine
Planungsaufgabe. *Klein: Prioritätsfeld pro Turm, Sortierung im Feuerpfad.*

**Saboteure** ✅ *umgesetzt* — ein Gegnertyp, der nicht den Kern will, sondern den nächstgelegenen
Pylon. Trifft er, fällt ein ganzer Ast des Netzes aus, und die Türme dahinter werden
kalt. Das macht die Kettenstruktur zur Schwachstelle, die sie logisch schon ist.
*Mittel: eigene Zielsuche im Gegner-Update.*

**Leitungslast** ✅ *umgesetzt* — Versorgung ist nicht mehr binär. Jeder Knoten trägt nur
eine begrenzte Menge Energie pro Sekunde weiter (Kern 58/s, Pylon 15/s plus 6/s je Stufe);
was ein Ast anfordert, fließt durch alle Knoten davor, und ein überlasteter Ast drosselt
alles hinter sich. Damit wird die *Form* des Netzes zur Entscheidung — und Reaktoren
werden ortsgebunden wertvoll, weil sie genau den Ast entlasten, an dem sie stehen.
*Mittel: `recomputeSupply()` von Flag auf Fluss umgestellt, plus Anzeige.*

**Kernmodi** ✅ *umgesetzt* — der Kern verteilt seine feste Leistung auf drei Stellungen:
Einspeisung (+25 % Regeneration, −15 % Speicher), Speicher (+40 % / −15 %) und Schild
(60 % des Kernschadens zahlt der Puffer, 2,2 Energie je Punkt). Keine davon ist neutral,
und das Umschalten mit `K` kostet 3,5 Sekunden Anlauf, in denen gar kein Modus wirkt und
der Nachschub auf 60 % fällt — ein Wechsel gehört damit in die Bauphase.

**Akkus getrennt von Reaktoren** ✅ *umgesetzt* — der Reaktor liefert 6 Energie/s je Stufe
und entlastet seinen Ast, der Akku fasst 52 je Stufe und hebt die Kapazität seines Knotens
um 4/s. Keiner tut beides mehr. Damit ist „viele kurze Feuerstöße" gegen „langes
Dauerfeuer" eine Bauentscheidung geworden — und weil Kernbefehle einen *Anteil* des
Puffers kosten, macht ein großer Speicher die Entladung stärker. Auf Stufe 5 wirft der
Akku als **Spitzenlast** einmal je Welle seinen ganzen Inhalt nach, wenn der Puffer unter
15 % fällt. In der Messung über je 200 Läufe kostet der Verzicht auf Akkus den Bot rund
zwei Wellen im Median (12 gegen 10) und halb so viele Läufe, die bis zum Limit kommen.

---

## 2 · Was dem Genre-Standard nach fehlt

**Ein Konter-System.** ✅ *umgesetzt* — Panzerung, Schilde, Slow-Widerstand, Mender.
Ursprüngliche Notiz: Momentan ist jeder Turm gegen jeden Gegner gleich gut, nur
unterschiedlich effizient. Genre-Konsens ist, dass Gegner Eigenschaften mitbringen, die
bestimmte Türme erzwingen: gepanzert (Kanone ja, Blaster nein), schnell und leicht
(Blaster ja), fliegend (schon da), schildtragend (Energie-Schaden zuerst), heilend
(muss zuerst sterben), gepaart mit sichtbaren Symbolen am Gegner. Das ist der größte
Hebel für taktische Tiefe und in `ENEMIES`/`dealDamage()` gut unterzubringen.
*Mittel.*

**Aktive Fähigkeiten mit Abklingzeit.** ✅ *umgesetzt* als **Kernbefehle** (`Q`/`W`/`E`):
Entladung wirft den halben Puffer als Druckwelle nach außen, Netzstoß verdoppelt sechs
Sekunden lang den Schaden bei halbem Verbrauch, Notpuls setzt jeden versorgten Bau um ein
Drittel instand. Alle drei bezahlen aus demselben Puffer, aus dem die Türme schießen —
der Preis ist also nicht Materie, sondern das eigene Feuer danach.

**Bosse, die etwas verlangen.** ✅ *umgesetzt* — Moloch mit Wächter-Eskorte und Nexus mit
Anzapfung und Brut, dazu zweite Phase, Ankündigung, HP-Leiste und Bossbeute.
Ursprüngliche Notiz: Der Titan ist derzeit nur ein sehr dicker Crawler.
Interessanter wäre ein Boss mit Eigenschaft: zieht Energie aus dem Netz, während er
lebt; oder wirft eine Störzone, in der Türme nicht feuern. *Mittel.*

**Wellenmodifikatoren.** ✅ *umgesetzt* als **Sturmwellen**: Ab Welle 5 kann eine Welle
eine Eigenschaft mitbringen (Störnebel, EMP-Front, Magnetsturm, Schwarm, Kältefest,
Panzerkonvoi, Hetzjagd), angekündigt in der Vorschau und mit 50 % höherer Prämie belohnt.
Jeder Sturm zielt auf eine Einseitigkeit im Aufbau. *Klein, weil nur Multiplikatoren.*

**Druckgedächtnis der Gegner.** ✅ *umgesetzt* — das Feld merkt sich in acht Sektoren,
wie weit die letzte Welle gekommen ist (engste Annäherung als Höchstwert, dazu Kernschaden
und verlorene Bauten), mischt das zu 55 % ins Gedächtnis und zieht die nächste Welle
dorthin: Der Ring der Einfallsrichtungen wird verschoben, die Masse je Richtung gewichtet,
und der Boss sucht sich dieselbe Seite. Gedeckelt auf das Vierfache zwischen stärkstem und
schwächstem Sektor — ohne Deckel endet jede Partie an derselben Ecke. Die Bilanz nach der
Welle nennt die Richtung, in die es zieht.

**Mehr Turmtypen mit klarer Rolle** statt mehr Zahlen: Kettenblitz gegen Pulks,
Minenleger für tote Winkel, Reparaturdrohne, Schildgenerator für Nachbarbauten.
*Je Turm klein, weil das Turmgerüst steht.*

---

## 3 · Gründe, es ein zweites Mal zu starten

Genau hier hört das Spiel gerade auf. Endlose Wellen ohne Fortschritt zwischen den
Partien sind der Punkt, an dem die Recherche am deutlichsten war: Rogue Tower und
Infinitode 2 leben von dem, was zwischen den Runden passiert.

**Karten zwischen den Wellen.** ✅ *umgesetzt* (57 Karten, vier zur Wahl). Nach jeder abgewehrten Welle drei Optionen zur Auswahl:
+15 % Reichweite netzweit, Pylone kosten die Hälfte, Reaktoren geben Schaden statt
Energie. Das erzeugt bei jeder Partie einen anderen Aufbau — die günstigste Art,
Wiederspielwert einzubauen. *Mittel, und mit Abstand der beste Aufwand-Nutzen-Schnitt.*

**Bestenliste im `localStorage`.** ✅ *umgesetzt* — die acht besten Läufe mit Welle, Datum
und den drei häufigsten Bauteilen, sichtbar auf der Startanzeige und nach dem Kernverlust.
Gewertet wird die höchste je begonnene Welle, damit ein Neuladen keine verlorene Welle
schönrechnet.

**Tagesseed.** ✅ *umgesetzt* als **Tagesfeld** — beim Start stehen zwei Knöpfe, Tagesfeld
(mit Datum) oder freies Feld. Gleich sind Gelände, Wellenzusammensetzung und die Karten
zur Wahl; die Einfallsrichtungen folgen weiter dem Druckgedächtnis und damit dem eigenen
Spiel. Gewürfelt wird nicht aus einem laufenden Strom, sondern je Ziehung aus einem Seed
aus `Tag | Zweck | Nummer` — ein Strom wäre nach einer fortgesetzten Partie verschoben.
Am Ende kopiert ein Knopf die Ergebniszeile in die Zwischenablage.

**Erzeugtes Gelände.** ✅ *umgesetzt* — jede Partie bekommt aus einem Seed eine eigene
Karte: Trümmer, auf denen nicht gebaut werden kann, alte Leiterbahnen, auf denen ein Pylon
50 % mehr Last trägt, und Schneisen, in denen Bodentruppen 30 % schneller laufen. Der Ring
um den Kern bleibt frei, je Himmelsrichtung liegen höchstens zehn Trümmerzellen, und
gespeichert wird nur der Seed. Gemessen kostet es fast nichts (halbe Welle im Schnitt über
je 300 Läufe) — es macht die Partie anders, nicht schwerer. Der Vorteilsteil fehlt in der
Messung ohnehin: Der Bot weicht Trümmern aus, sucht aber keine Leiterbahn.

**Dauerhafte Freischaltungen** (Türme, Startboni) über Partien hinweg. Ist der
Standard-Weg des Genres, lohnt aber erst, wenn oben genug Inhalt zum Freischalten da
ist. *Später.*

---

## 4 · Verständlichkeit — billig und sofort spürbar

**Wellenvorschau.** ✅ *umgesetzt*, weil das Kontersystem sonst unsichtbar bliebe.
In der Bauphase steht dran, was kommt: „Welle 7 — 12 Crawler,
4 Brutes, aus Nordost und Süd". Die Richtungspfeile gibt es schon, die Zusammensetzung
fehlt. *Sehr klein, `spawnQueue` ist bereits vorausberechnet.*

**Bilanz nach der Welle.** ✅ *umgesetzt* — zwischen Wellenende und Kartenwahl stehen
Gegner, verschossene Energie, Materie, Kernschaden, verlorene Bauten, Sekunden mit leerem
Puffer, die mittlere Netzdrossel und der Turm, der den Schaden tatsächlich gemacht hat.
Angezeigt wird nur, was passiert ist — wer keinen Bau verlor, liest dazu auch keine Null.

**Schadenszahlen und Reichweitenkreis beim Überfahren**, nicht erst nach Auswahl.
*Sehr klein.*

**Speicherstand.** ✅ *umgesetzt* — gesichert wird in der Bauphase, beim nächsten Öffnen
fragt die Startanzeige, ob fortgesetzt werden soll. Bewusst nicht mitgeschrieben werden
Gegner und Geschosse: Wer mitten im Gefecht schließt, setzt bei derselben Welle wieder an.
Das ist der Grund für die Wertung nach der höchsten begonnenen Welle.

---

## 5 · Bedienung, die nach kurzer Zeit fehlt

- ~~Ziehen zum Bauen mehrerer Barrieren statt Einzelklicks~~ ✅ umgesetzt: mit gedrückter
  Maustaste ziehen. Zwischenzellen werden mitgenommen, damit schnelles Ziehen keine Lücken
  reißt; Belegtes und Unbezahlbares überspringt der Zug still. Nur Bauteile mit `drag` —
  bei einer Kanone je 65 Materie wäre ein verrutschter Zug teuer.
- ~~Reparieren (Materie gegen Struktur)~~ ✅ umgesetzt, Taste `R`
- ~~Zielpriorität je Turm: nächster, stärkster, schnellster~~ ✅ umgesetzt, Taste `Z` —
  dazu der Kernnächste als Voreinstellung, weil auf diesem Feld alles radial nach innen
  läuft. Kürzel links oben am Turm, Lastpriorität rechts oben.
- ~~Turm auf leeres Feld verschieben, für halbe Kosten~~ ✅ umgesetzt, Taste `V` — aber
  für ein **Viertel** des Bauwerts, nicht für die Hälfte. Beim Nachrechnen fiel auf, dass
  der Umweg über Abbau und Neubau netto nur 40 % kostet (60 % zurück, 100 % wieder hin):
  Bei halben Kosten wäre der Umzug teurer als das, was er ersetzen soll. Stufe, Struktur
  samt Schaden und alle Einstellungen ziehen mit um, die Leiterbahn unter einem Pylon
  zählt am neuen Feld neu.
- ~~Bauplan kopieren und spiegeln~~ ✅ umgesetzt, Taste `B` — und die Vermutung in dieser
  Zeile stimmte: 41 × 25 Zellen mit dem Kern in der Mitte heißt, dass jede Zelle einen
  exakten Partner hat (`x' = 40 − x`, `y' = 24 − y`), ohne Rundung. Der Zeiger wählt die
  Seite, die gefüllt wird, die Vorschau zeigt Achse, Kästchen und Rechnung. Kopiert wird
  der Grundriss auf Stufe 1 zum normalen Preis — die Ausbaustufen in einem Klick
  mitzukaufen wäre kein Bauplan mehr, sondern ein zweites Feld.

---

## Gefunden und behandelt: der Kern kann sich nicht wehren

Beim Balance-Testen aufgetaucht und wert, entschieden zu werden: Erreicht ein Gegner
eine Ecke des Kerns, die kein Turm abdeckt, hämmert er dort ungestört weiter — in einem
Testlauf zerlegte ein **einzelner** Crawler mit voller Lebensenergie den Kern in 60
Sekunden, während drei feuerbereite Türme 133 px entfernt standen und ihre Reichweite
bei 118 px endete. Das Spiel hat dagegen bisher nur die Karte *Kernstoß*, und die muss
man erst ziehen.

Drei Wege, je nach gewünschter Härte:
1. Der Kern bekommt eine schwache Nahverteidigung ab Werk (etwa 4 Schaden pro Sekunde
   im Umkreis von 2 Zellen) — verzeiht Deckungslücken, nimmt aber etwas Spannung.
2. Eine Warnung: „Kern wird angegriffen" samt Marker, wenn länger als 3 Sekunden
   ungestört Schaden ankommt — lässt die Lücke bestehen, macht sie aber sichtbar.
3. So lassen: Rundumdeckung ist die Aufgabe des Spiels, und *Kernstoß* ist die Antwort
   für alle, die sie ziehen.

Umgesetzt wurde **2**: Nach drei Sekunden ununterbrochenem Kernschaden erscheinen
Warnzeile, Fadenkreuze auf den Angreifern, ein Ring um den Kern und — der eigentliche
Punkt — alle Turmreichweiten, sodass die Deckungslücke sichtbar wird. Die Lücke selbst
bleibt: Rundumdeckung ist die Aufgabe des Spiels. Bleibt offen, falls es doch zu hart
wirkt: Variante 1, eine schwache Nahverteidigung des Kerns ab Werk.

## Gefunden und behandelt: die Wand bei Welle 10

In der Verteilung von 200 Bot-Läufen fiel eine Spitze auf: 57 Läufe — gut jeder vierte —
endeten genau bei Welle 10, dem ersten Boss. Die Nachbarwellen lagen bei zwei bis sechs.

Die erste Vermutung war der Titan selbst, und sie war zur Hälfte falsch. Derselbe Bot
ohne Moduswechsel endete nur 19-mal bei Welle 10, mit Moduswechsel 57-mal. Der Grund lag
im **Schildmodus**: Er zahlte 2,2 Energie je Schadenspunkt aus dem Puffer, ohne Untergrenze.
Ein Titan-Schlag über 70 kostete damit 92 Energie, der Puffer war nach zwei Treffern leer,
danach feuerte kein Turm mehr — und der Kern nahm wieder vollen Schaden. Der Schild löste
den Zusammenbruch aus, den er verhindern sollte. Eine kontrollierte Gegenprobe über je 60
Läufe: mit Moduswechsel 15 Tode bei Welle 10, ohne 1.

Behoben mit einer **Untergrenze von 35 %**: Der Schild greift nur oberhalb und zieht den
Puffer nie darunter. Damit fiel die Spitze von 57 auf 29 von 200.

Die zweite Hälfte war dann doch der Titan, aber anders als gedacht. Eine Aufschlüsselung
des Kernschadens in Welle 10 über 80 Läufe zeigte: **100 % kam vom Titan selbst**, die
Begleitwelle richtete nichts aus. Die gescheiterten Läufe hatten ihn noch bei 27 % — ihnen
fehlte Feuerkraft, nicht Deckung — und bei 70 Schaden je Schlag war der angeschlagene Kern
nach sechs Sekunden Kontakt weg, ohne Zeit zu reagieren. Gesenkt wurden deshalb
Trefferpunkte (1100 → 880, die Latte) und Schaden (70 → 55, das Zeitfenster). Die
Panzerung blieb: Sie ist die Lehre, dass Kanonen dazugehören.

Ergebnis: 9 von 200 Läufen enden bei Welle 10, die Verteilung ist dort glatt. Der erste
sichtbare Prüfstein ist jetzt Welle 20.

Nebenbei widerlegt: Der naheliegende Verdacht, die Selbstheilung des Titan (9/s) entscheide
die Kämpfe, ließ sich nicht halten. Mit 4/s starben genauso viele Läufe bei Welle 10
(30 gegen 29 von 200) — nur das Spätspiel wurde leichter. Die Änderung wurde
zurückgenommen.

## Erledigt

Karten zwischen den Wellen (48 Stück, vier zur Wahl, mit turmspezifischen Karten,
Zielkonflikten und Regeländerungen), Überladung mit Lastpriorität und die
Konter-Eigenschaften sind gebaut (Stand September 2026), zusammen mit der
Wellenvorschau, ohne die das Kontersystem nicht lesbar gewesen wäre. Dazu kamen vier Gegnertypen (Saboteur, Splitter, Zapfer, Wächter) und das
Boss-Ereignis mit drei Bossen im Wechsel.

Dazu kamen die drei Systeme aus der zweiten Runde: **Leitungslast** (das Netz hat
Kapazitäten statt nur Reichweite), **Kernbefehle** (drei aktive Fähigkeiten aus dem
Puffer) und **Sturmwellen** (Wellenmodifikatoren), zusammen mit sechs neuen Karten,
die genau darauf antworten — Hochspannung, Sammelschiene, Lastverteiler, Kondensatorbank,
Schwungrad und die seltene Abschirmung.

Die Grafik- und Sound-Runde ist danach vollständig abgearbeitet: additive Lichtschicht,
bleibende Brandspuren, Schadensbild mit Rauch und glühenden Sprüngen, Riss-Animation beim
Erscheinen und eine Vignette, die mit der Wellennummer wächst — beim Sound das dreischichtige
Klangbett, die Puffer-Drone, Entfernungsdämpfung, Ducking und größenabhängige Abschüsse.

Zum Messen liegt seither ein Prüfstand samt simuliertem Spieler in `tools/` — siehe
Abschnitt „Balance messen" in der README, besonders die drei Fallstricke beim Auswerten.

Danach kamen die **Kernmodi** und die **getrennten Akkus** dazu, mit drei weiteren Karten
— Zellenstapel, Schnellschaltung und dem seltenen Zwitterkern — sowie einem Prüfblock im
Selbsttest, der Anlauf, Schild und Akku-Entlastung nachrechnet.

Zuletzt kamen Speicherstand und Bestenliste dazu: Eine unterbrochene Partie wird beim
Öffnen zum Fortsetzen angeboten, eine beendete landet in einer Liste der acht besten Läufe.

Zuletzt kam das **Druckgedächtnis** dazu: Die Wellen kommen nicht mehr gleichverteilt,
sondern verstärkt von der Seite, an der die letzte Welle am weitesten kam. Gemessen kostet
das den Bot etwa eine Welle im Schnitt — und die Messung selbst brachte zwei Nebenbefunde:
Ein absichtlich einseitiger Aufbau (`schief`) wird *nicht* härter bestraft als ein
gleichmäßiger, und der Moloch auf Welle 20 beendet 13,5 % aller Läufe. Er ist damit die
nächste Wand, nicht mehr der Titan auf Welle 10.

Zuletzt kam das **Tagesfeld** dazu, das auf dem seedbaren Zufall des Geländes aufsetzt.
Nebenbei fiel dabei eine alte Ungereimtheit auf: Hinter der Startanzeige lief die erste
Bauphase bereits ab. Jetzt beginnt die Zeit mit dem Knopfdruck.

Zuletzt kam das **Verschieben** dazu. Der eigentliche Ertrag war eine Zahl: Der Punkt
stand mit „halben Kosten" in der Liste, und die wären teurer gewesen als der Umweg über
Abbau und Neubau, der netto 40 % kostet. Aus der Hälfte wurde ein Viertel, und ein
Selbsttest hält seither fest, dass der Umzug billiger bleiben muss als der Umweg.

Zuletzt kam der **Bauplan** dazu, und damit ist die Liste unter „Bedienung" leer. Die
Entscheidung, die dabei zu treffen war, betraf nicht die Spiegelung selbst — die ist auf
diesem Feld reine Arithmetik — sondern den Preis: Stufe 1 zum Neubaupreis, nicht der
volle Bauwert. Damit ist Spiegeln nie billiger als Bauen von Hand, nur schneller, und
kann die Bilanz gar nicht verschieben.

Aus den Abschnitten 1 bis 4 offen geblieben: mehr Turmtypen mit klarer Rolle
(Kettenblitz, Minenleger, Reparaturdrohne, Schildgenerator), Schadenszahlen beim
Überfahren und die dauerhaften Freischaltungen zwischen den Partien.

## Wenn ich drei Dinge auswählen müsste (ursprüngliche Empfehlung)

1. **Karten zwischen den Wellen** — macht aus einer Partie eine Runde mit eigenem Verlauf.
2. **Überladung plus Lastabwurf-Priorität** — holt aus der Energiemechanik das heraus,
   was sie verspricht, und kostet fast nichts.
3. **Konter-Eigenschaften bei Gegnern** — verwandelt „mehr Türme" in „die richtigen Türme".

Alles drei zusammen ist weniger Arbeit als ein ordentliches Meta-Progressionssystem und
verändert das Spielgefühl deutlich stärker.

---

## Quellen

- [Designing Engaging Tower Defense Games](https://monitoringmsp.sk/2025/07/06/designing-engaging-tower-defense-games-industry-insights-and-future-trends/)
- [Siege of Centauri Dev Journal: What Makes A Good Tower Defense Game?](https://www.stardock.com/games/article/495008/siege-of-centauri-dev-journal-what-makes-a-good-tower-defense-game)
- [Mindustry (GitHub)](https://github.com/Anuken/Mindustry) · [Diskussion zu Mindustrys Logistik](https://news.ycombinator.com/item?id=38732542)
- [Rogue Tower (Steam)](https://store.steampowered.com/app/1843760/Rogue_Tower/)
- [Infinitode 2 (Steam)](https://store.steampowered.com/app/937310/Infinitode_2__Infinite_Tower_Defense/)
- [Bloons TD 6 — Helden und aktive Fähigkeiten](https://www.bloonswiki.com/Hero)
- [Design Dive: Dome Keeper](https://joshanthony.info/2023/05/24/design-dive-dome-keeper/)
- [Tower Defense Game Genre: 6 Characteristics](https://www.masterclass.com/articles/tower-defense-game-video-game-guide)
