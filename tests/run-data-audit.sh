#!/usr/bin/env sh
set -u

TEMP_DIR="$(mktemp -d)"
STATUS=0

if [ -d node_modules ]; then
  mv node_modules "$TEMP_DIR/node_modules"
fi

node tests/data-audit.mjs || STATUS=$?
node tests/scene-contract-audit.mjs || STATUS=$?
node tests/actor-entity-contract-audit.mjs || STATUS=$?

if [ -d "$TEMP_DIR/node_modules" ]; then
  mv "$TEMP_DIR/node_modules" node_modules
fi

rmdir "$TEMP_DIR"
exit "$STATUS"
