#!/usr/bin/env bash
# Baut den englischen Export aus den echten Quelldateien, statt sie doppelt
# im Repo zu pflegen. Zwei Varianten aus denselben Schritten:
#
#   tools/build-crazygames.sh        → dist-crazygames/ und dist-crazygames.zip
#                                      (Upload auf CrazyGames, mit SDK)
#   tools/build-crazygames.sh web    → dist-web-en/
#                                      (englische Fassung für dheits.de, ohne SDK)
#   tools/build-crazygames.sh gamedistribution
#                                    → dist-gamedistribution/ und .zip
#                                      (Upload auf GameDistribution; die Game ID
#                                      aus dem Entwicklerportal kommt aus GD_GAME_ID)
#
# Ein zweites Argument setzt den Zielordner — pruefen.js baut so in einen
# Temp-Ordner und vergleicht mit dem eingecheckten dist-web-en/.
#
# Die web-Variante unterscheidet sich in drei Punkten: kein CrazyGames-SDK
# (die CSP auf dheits.de erlaubt Skripte nur von 'self'), keine eingebetteten
# Schriften (das Spiel nutzt die Systemschrift, Saira und Plex braucht nur die
# Landingpage — und data:-Schriften blockiert die CSP ohnehin), und der Titel
# bleibt CORE DEFENSE. „TD“ gibt es nur, weil der Name auf CrazyGames durch die
# abgelehnte erste Einreichung belegt ist.
set -euo pipefail
cd "$(dirname "$0")/.."

VARIANTE="${1:-crazygames}"
case "$VARIANTE" in
  crazygames) ZIEL=dist-crazygames ;;
  web)        ZIEL=dist-web-en ;;
  gamedistribution) ZIEL=dist-gamedistribution ;;
  *) echo "Unbekannte Variante: $VARIANTE (crazygames, web oder gamedistribution)" >&2; exit 2 ;;
esac
ZIEL="${2:-$ZIEL}"

rm -rf "$ZIEL" "$ZIEL.zip"
mkdir -p "$ZIEL/js"

# Schriften: Bei CrazyGames direkt in die index.html (der Upload-Assistent
# blieb bei einer zusätzlichen 170-KB-fonts.css hängen), für dheits.de gar nicht.
VARIANTE="$VARIANTE" ZIEL="$ZIEL" GD_GAME_ID="${GD_GAME_ID:-}" python3 - <<'PY'
import os
variante, ziel = os.environ['VARIANTE'], os.environ['ZIEL']
src = open('tools/crazygames/index.html').read()
fonts = open('tools/crazygames/fonts.css').read()
tag = '<link rel="stylesheet" href="fonts.css">'
sdk = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n'
assert tag in src and sdk in src
if variante == 'crazygames':
    src = src.replace(tag, '<style>\n' + fonts + '</style>')
elif variante == 'gamedistribution':
    snippet = open('tools/gamedistribution/sdk-snippet.html').read()
    gid = os.environ['GD_GAME_ID'] or 'GAME_ID_AUS_DEM_PORTAL'
    src = src.replace(sdk, snippet.replace('__GD_GAME_ID__', gid)).replace(tag + '\n', '')
else:
    src = src.replace(sdk, '').replace(tag + '\n', '')
open(ziel + '/index.html', 'w').write(src)
PY
cp tools/crazygames/crazygames.css "$ZIEL/crazygames.css"
cp tools/crazygames/sdk.js "$ZIEL/js/sdk.js"   # ohne SDK bleibt davon die Skalierung
if [ "$VARIANTE" = gamedistribution ]; then
  # Fenster-Teil von sdk.js behalten, den CrazyGames-Teil dahinter gegen gd.js tauschen.
  ZIEL="$ZIEL" python3 - <<'PY'
import os
ziel = os.environ['ZIEL']
s = open('tools/crazygames/sdk.js').read()
marke = '(async function crazygames() {'
assert s.count(marke) == 1
open(ziel + '/js/sdk.js', 'w').write(s[:s.index(marke)].rstrip() + '\n' + open('tools/gamedistribution/gd.js').read())
PY
fi

cp style.css "$ZIEL/style.css"
cp js/config.js js/audio.js js/entities.js js/game.js js/einfuehrung.js "$ZIEL/js/"

# Englisch für das internationale Publikum. Die Quellen bleiben deutsch,
# übersetzt wird nur die Kopie; das Skript bricht bei jedem fehlenden Text ab.
node tools/crazygames/uebersetzen.js "$ZIEL"
node tools/crazygames/lesbarkeit.js "$ZIEL"

if [ "$VARIANTE" != crazygames ]; then
  ZIEL="$ZIEL" python3 - <<'PY'
import os
ziel = os.environ['ZIEL']
for datei, soll in [('index.html', 2), ('js/game.js', 2)]:
    p = ziel + '/' + datei
    s = open(p).read()
    n = s.count('CORE DEFENSE TD') + s.count('Core Defense TD')
    assert n == soll, (datei, n)
    open(p, 'w').write(s.replace('CORE DEFENSE TD', 'CORE DEFENSE').replace('Core Defense TD', 'Core Defense'))
s = open(ziel + '/index.html').read()
assert 'crazygames.com' not in s and 'fonts.css' not in s
PY
fi

if [ "$VARIANTE" = web ]; then
  # dheits.de liefert js/ und css mit 30 Tagen Cache aus. Ohne Versionszusatz
  # bekäme, wer schon da war, die neue index.html mit altem game.js aus dem
  # Browser-Cache. Der Zusatz ist der Anfang des Datei-Hashes: ändert sich die
  # Datei, ändert sich die Adresse.
  ZIEL="$ZIEL" python3 - <<'PY'
import hashlib, os, re
ziel = os.environ['ZIEL']
p = ziel + '/index.html'
s = open(p).read()
def version(m):
    datei = m.group(2)
    h = hashlib.sha256(open(ziel + '/' + datei, 'rb').read()).hexdigest()[:10]
    return m.group(1) + '="' + datei + '?v=' + h + '"'
s, n = re.subn(r'(href|src)="((?:js/)?[\w-]+\.(?:js|css))"', version, s)
assert n == 8, n
open(p, 'w').write(s)
PY
fi

for f in "$ZIEL"/js/*.js; do node --check "$f"; done

if [ "$VARIANTE" = crazygames ]; then
  (cd "$ZIEL" && zip -rqD "$(cd .. && pwd)/$(basename "$ZIEL").zip" .)
  echo "Fertig: $ZIEL/ (zum lokalen Testen) und $ZIEL.zip (Upload auf CrazyGames)"
elif [ "$VARIANTE" = gamedistribution ]; then
  (cd "$ZIEL" && zip -rqD "$(cd .. && pwd)/$(basename "$ZIEL").zip" .)
  echo "Fertig: $ZIEL/ (zum lokalen Testen) und $ZIEL.zip (Upload auf GameDistribution)"
  [ -n "${GD_GAME_ID:-}" ] || echo "Achtung: GD_GAME_ID fehlt, in index.html steht ein Platzhalter. Game ID aus dem Portal setzen und neu bauen." >&2
else
  echo "Fertig: $ZIEL/ (englische Fassung für dheits.de, alle Pfade relativ)"
fi
