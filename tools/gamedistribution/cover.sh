#!/usr/bin/env bash
# Rendert die Vorschaubilder für GameDistribution aus cover.html (Chrome headless)
# und wandelt sie in JPG um, wie das Portal es verlangt. Ergebnis in medien/.
# Chrome beendet sich nach --screenshot nicht von selbst; deshalb wird auf die
# fertige Datei gewartet und der Prozess dann beendet.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFIL="$(mktemp -d)"
trap 'rm -rf "$PROFIL"' EXIT
mkdir -p medien
for f in 1280x720 1280x550 512x512 512x384 200x120; do
  png="$PROFIL/$f.png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFIL/p$f" \
    --force-device-scale-factor=1 --window-size="${f%x*},${f#*x}" --virtual-time-budget=4000 \
    --screenshot="$png" "file://$PWD/cover.html#g$f" >/dev/null 2>&1 &
  pid=$!
  for _ in $(seq 1 150); do [ -s "$png" ] && break; sleep 0.2; done
  [ -s "$png" ] || { kill "$pid" 2>/dev/null || true; echo "Kein Bild für $f" >&2; exit 1; }
  sleep 1
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  sips -s format jpeg -s formatOptions 92 "$png" --out "medien/cover_$f.jpg" >/dev/null
done
ls -l medien
