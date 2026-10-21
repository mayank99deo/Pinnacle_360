#!/bin/bash
# Generates slide thumbnails for a deck so the hub can show previews.
#
#   tools/snap-thumbs.sh library/decks/<deck-folder>
#
# Writes <deck-folder>/thumbs/01.jpg, 02.jpg, … (960×540). Needs Google Chrome.
# Re-run it whenever you edit a deck's slides.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at: $CHROME" >&2; exit 1; }

DECK_DIR="${1:?Usage: tools/snap-thumbs.sh library/decks/<deck-folder>}"
DECK_DIR="$(cd "$DECK_DIR" && pwd)"
PAGE="$DECK_DIR/index.html"
[ -f "$PAGE" ] || { echo "No index.html in $DECK_DIR" >&2; exit 1; }

# Slides are the <section> children of <deck-stage>.
COUNT=$(grep -c '^<section' "$PAGE" || true)
[ "$COUNT" -gt 0 ] || { echo "No <section> slides found in $PAGE" >&2; exit 1; }

mkdir -p "$DECK_DIR/thumbs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for i in $(seq 1 "$COUNT"); do
  n=$(printf '%02d' "$i")
  # _snthumb hides deck chrome, _snap turns off transitions; 10s of virtual time
  # lets timed slide animations reach a finished state.
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --mute-audio \
    --window-size=1920,1080 --virtual-time-budget=10000 \
    --user-data-dir="$TMP/profile" \
    --screenshot="$TMP/$n.png" "file://$PAGE?_snthumb=1&_snap=1#$i" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 80 -Z 960 "$TMP/$n.png" --out "$DECK_DIR/thumbs/$n.jpg" >/dev/null
  echo "thumbs/$n.jpg"
done
