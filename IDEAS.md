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

**Kernmodi** — der Kern verteilt seine Leistung: mehr Regeneration, mehr Speicher oder
ein Schild, das Schaden absorbiert. Ein Umschalten kostet ein paar Sekunden Anlauf.
*Klein bis mittel, rein in `game.js`.*

**Akkus getrennt von Reaktoren** — Reaktoren geben Nachschub, Akkus nur Puffer.
Dann ist „viele kurze Feuerstöße" gegen „langes Dauerfeuer" eine echte Bauentscheidung.
*Sehr klein: ein weiterer Eintrag in `BUILDINGS`.*

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

**Aktive Fähigkeiten mit Abklingzeit.** Kingdom Rush und Bloons hängen ihre gesamte
Spannungskurve daran: zwei, drei Knöpfe, die der Spieler im richtigen Moment drückt —
Not-Entladung des Puffers als Schockwelle, kurzzeitiger Netz-Überschuss, Reparaturpuls.
Hier besonders passend, weil sie Energie kosten können. *Mittel.*

**Bosse, die etwas verlangen.** ✅ *umgesetzt* — Moloch mit Wächter-Eskorte und Nexus mit
Anzapfung und Brut, dazu zweite Phase, Ankündigung, HP-Leiste und Bossbeute.
Ursprüngliche Notiz: Der Titan ist derzeit nur ein sehr dicker Crawler.
Interessanter wäre ein Boss mit Eigenschaft: zieht Energie aus dem Netz, während er
lebt; oder wirft eine Störzone, in der Türme nicht feuern. *Mittel.*

**Mehr Turmtypen mit klarer Rolle** statt mehr Zahlen: Kettenblitz gegen Pulks,
Minenleger für tote Winkel, Reparaturdrohne, Schildgenerator für Nachbarbauten.
*Je Turm klein, weil das Turmgerüst steht.*

---

## 3 · Gründe, es ein zweites Mal zu starten

Genau hier hört das Spiel gerade auf. Endlose Wellen ohne Fortschritt zwischen den
Partien sind der Punkt, an dem die Recherche am deutlichsten war: Rogue Tower und
Infinitode 2 leben von dem, was zwischen den Runden passiert.

**Karten zwischen den Wellen.** ✅ *umgesetzt* (48 Karten, vier zur Wahl). Nach jeder abgewehrten Welle drei Optionen zur Auswahl:
+15 % Reichweite netzweit, Pylone kosten die Hälfte, Reaktoren geben Schaden statt
Energie. Das erzeugt bei jeder Partie einen anderen Aufbau — die günstigste Art,
Wiederspielwert einzubauen. *Mittel, und mit Abstand der beste Aufwand-Nutzen-Schnitt.*

**Bestenliste im `localStorage`.** Höchste Welle, Datum, benutzte Bauteile. Zwei
Dutzend Zeilen, und plötzlich hat das Ende einer Partie eine Bedeutung.
*Sehr klein.*

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

**Speicherstand.** Eine laufende Partie beim Verlassen der Seite sichern. Bei einem
Endlosspiel im Browser fast Pflicht. *Klein: Zustand ist bereits reine Daten.*

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

Bleibt aus der Liste: Kernmodi, getrennte Akkus, aktive Fähigkeiten, Bestenliste,
Tagesseed, Bilanz nach der Welle, Speicherstand und die Bedienkomfort-Punkte.

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
