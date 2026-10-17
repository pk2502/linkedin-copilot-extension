#!/bin/sh
# Build an installable zip with only the files the extension needs at runtime.
#   sh scripts/package.sh          -> dist/connectpilot-extension-<version>.zip (dev hosts kept)
#   sh scripts/package.sh --store  -> dist/connectpilot-extension-<version>-store.zip (no localhost)
set -eu
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
FILES="popup.html popup.js api.js config.js connect.js styles.css icon16.png icon48.png icon128.png"
mkdir -p dist

if [ "${1:-}" = "--store" ]; then
  OUT="dist/connectpilot-extension-$VERSION-store.zip"
  STAGE=$(mktemp -d)
  trap 'rm -rf "$STAGE"' EXIT
  # shellcheck disable=SC2086
  cp $FILES "$STAGE/"
  node scripts/store-manifest.mjs manifest.json "$STAGE/manifest.json"
  rm -f "$OUT"
  (cd "$STAGE" && zip -q -X "$OLDPWD/$OUT" manifest.json $FILES)
else
  OUT="dist/connectpilot-extension-$VERSION.zip"
  rm -f "$OUT"
  # shellcheck disable=SC2086
  zip -q -X "$OUT" manifest.json $FILES
fi

echo "Created $OUT"
unzip -l "$OUT"
