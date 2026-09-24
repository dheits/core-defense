#!/usr/bin/env bash
# Baut den CrazyGames-Export aus den echten Quelldateien, statt sie doppelt
# im Repo zu pflegen. Ausgabe: dist-crazygames/ (Inhalt für den Upload) und
# dist-crazygames.zip (das Zip, das CrazyGames erwartet).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist-crazygames dist-crazygames.zip
mkdir -p dist-crazygames/js

# Schriften direkt in die index.html einbetten: Der Upload-Assistent bei
# CrazyGames blieb bei einer zusätzlichen 170-KB-fonts.css hängen.
python3 - <<'PY'
src = open('tools/crazygames/index.html').read()
fonts = open('tools/crazygames/fonts.css').read()
tag = '<link rel="stylesheet" href="fonts.css">'
assert tag in src
open('dist-crazygames/index.html', 'w').write(src.replace(tag, '<style>\n' + fonts + '</style>'))
PY
cp tools/crazygames/crazygames.css dist-crazygames/crazygames.css
cp tools/crazygames/sdk.js dist-crazygames/js/sdk.js

cp style.css dist-crazygames/style.css
cp js/config.js js/audio.js js/entities.js js/game.js js/einfuehrung.js dist-crazygames/js/

# Englisch für das internationale Publikum. Die Quellen bleiben deutsch,
# übersetzt wird nur die Kopie; das Skript bricht bei jedem fehlenden Text ab.
node tools/crazygames/uebersetzen.js dist-crazygames
node tools/crazygames/lesbarkeit.js dist-crazygames
for f in dist-crazygames/js/*.js; do node --check "$f"; done

cd dist-crazygames
zip -rqD ../dist-crazygames.zip .
cd ..

echo "Fertig: dist-crazygames/ (zum lokalen Testen) und dist-crazygames.zip (Upload auf CrazyGames)"
