#!/bin/sh
# Build a Chrome Web Store upload: only the files the extension needs at runtime.
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/connectpilot-extension-$VERSION.zip"
mkdir -p dist
rm -f "$OUT"
zip -q -X "$OUT" manifest.json popup.html popup.js api.js config.js connect.js styles.css icon16.png icon48.png icon128.png
echo "Created $OUT"
unzip -l "$OUT"
