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

**Tagesseed.** Alle spielen dieselbe Wellenfolge, weil der Zufallsgenerator vom Datum
abhängt. Braucht nur einen seedbaren PRNG statt `Math.random()` — und macht das Teilen
von Ergebnissen erst sinnvoll. *Klein.*

**Dauerhafte Freischaltungen** (Türme, Startboni) über Partien hinweg. Ist der
Standard-Weg des Genres, lohnt aber erst, wenn oben genug Inhalt zum Freischalten da
ist. *Später.*

---

## 4 · Verständlichkeit — billig und sofort spürbar

**Wellenvorschau.** ✅ *umgesetzt*, weil das Kontersystem sonst unsichtbar bliebe.
In der Bauphase steht dran, was kommt: „Welle 7 — 12 Crawler,
4 Brutes, aus Nordost und Süd". Die Richtungspfeile gibt es schon, die Zusammensetzung
fehlt. *Sehr klein, `spawnQueue` ist bereits vorausberechnet.*

**Bilanz nach der Welle.** Verschossene Energie, Kern-Schaden, bester Turm.
Lehrt Spieler ihr eigenes System. *Klein.*

**Schadenszahlen und Reichweitenkreis beim Überfahren**, nicht erst nach Auswahl.
*Sehr klein.*

**Speicherstand.** ✅ *umgesetzt* — gesichert wird in der Bauphase, beim nächsten Öffnen
fragt die Startanzeige, ob fortgesetzt werden soll. Bewusst nicht mitgeschrieben werden
Gegner und Geschosse: Wer mitten im Gefecht schließt, setzt bei derselben Welle wieder an.
Das ist der Grund für die Wertung nach der höchsten begonnenen Welle.

---

## 5 · Bedienung, die nach kurzer Zeit fehlt

- Ziehen zum Bauen mehrerer Barrieren statt Einzelklicks
- ~~Reparieren (Materie gegen Struktur)~~ ✅ umgesetzt, Taste `R`
- Zielpriorität je Turm: nächster, stärkster, schnellster
- Turm auf leeres Feld verschieben, für halbe Kosten
- Bauplan kopieren und spiegeln — passt gut, weil das Feld radial symmetrisch ist

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

Bleibt aus der Liste: Tagesseed, Bilanz nach der Welle, das erzeugte Gelände, das
Druckgedächtnis der Gegner und die Bedienkomfort-Punkte.

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
