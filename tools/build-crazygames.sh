#!/usr/bin/env bash
# Baut den CrazyGames-Export aus den echten Quelldateien, statt sie doppelt
# im Repo zu pflegen. Ausgabe: dist-crazygames/ (Inhalt für den Upload) und
# dist-crazygames.zip (das Zip, das CrazyGames erwartet).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist-crazygames dist-crazygames.zip
mkdir -p dist-crazygames/js

cp tools/crazygames/index.html dist-crazygames/index.html
cp tools/crazygames/crazygames.css dist-crazygames/crazygames.css
cp tools/crazygames/sdk.js dist-crazygames/js/sdk.js

cp style.css dist-crazygames/style.css
cp js/config.js js/audio.js js/entities.js js/game.js dist-crazygames/js/

cd dist-crazygames
zip -rq ../dist-crazygames.zip .
cd ..

echo "Fertig: dist-crazygames/ (zum lokalen Testen) und dist-crazygames.zip (Upload auf CrazyGames)"
