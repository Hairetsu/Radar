#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/resources/icon.svg"
SRC="$ROOT/resources/icon-1024.png"
ICONSET="$ROOT/resources/icon.iconset"
ICNS="$ROOT/resources/icon.icns"
PNG="$ROOT/resources/icon.png"

if [[ ! -f "$SVG" ]]; then
  echo "Missing source icon: $SVG" >&2
  exit 1
fi

magick -background none "$SVG" -resize 1024x1024 "$SRC"

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

declare -a SIZES=(
  "16:16"
  "32:16@2x"
  "32:32"
  "64:32@2x"
  "128:128"
  "256:128@2x"
  "256:256"
  "512:256@2x"
  "512:512"
  "1024:512@2x"
)

for entry in "${SIZES[@]}"; do
  IFS=":" read -r px name <<< "$entry"
  magick "$SRC" -resize "${px}x${px}" "$ICONSET/icon_${name}.png"
done

iconutil -c icns "$ICONSET" -o "$ICNS"
cp "$SRC" "$PNG"
mkdir -p "$ROOT/public"
cp "$SRC" "$ROOT/public/favicon.png"

echo "Wrote $ICNS"
