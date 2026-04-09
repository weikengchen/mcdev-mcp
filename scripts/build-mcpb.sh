#!/usr/bin/env bash
#
# Build the MCPB (Model Context Protocol Bundle) for the current platform.
#
# Usage:
#   scripts/build-mcpb.sh                       # default output path
#   scripts/build-mcpb.sh path/to/output.mcpb   # custom output path
#
# Output: dist-mcpb/mcdev-mcp-<version>-<platform>-<arch>.mcpb
#
# Requires: node >= 18, npm. The @anthropic-ai/mcpb CLI is a devDependency,
# so a fresh `npm install` in the repo root is enough to make this script work.
#
# Why a staging dir? mcpb pack zips the directory you point it at. If we
# pointed it at the repo root, we'd ship dev dependencies (jest, ts-jest,
# typescript, etc.), src/, tests/, docs/, .github/, and the host's
# better-sqlite3 build cache. Staging gives us a clean, prod-only tree.

set -euo pipefail

# Move to repo root regardless of where the script is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Pull version + platform info from Node so it matches what the runtime sees.
VERSION="$(node -p 'require("./package.json").version')"
RAW_PLATFORM="$(node -p 'process.platform')"
ARCH="$(node -p 'process.arch')"

# Friendlier platform names than node's process.platform values.
case "$RAW_PLATFORM" in
  darwin) PLATFORM=macos ;;
  win32)  PLATFORM=windows ;;
  linux)  PLATFORM=linux ;;
  *)      PLATFORM="$RAW_PLATFORM" ;;
esac

OUTPUT="${1:-dist-mcpb/mcdev-mcp-${VERSION}-${PLATFORM}-${ARCH}.mcpb}"
mkdir -p "$(dirname "$OUTPUT")"

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

MCPB="$REPO_ROOT/node_modules/.bin/mcpb"
if [[ ! -x "$MCPB" ]]; then
  echo ">> mcpb CLI not found at $MCPB — running 'npm install' to install devDependencies..."
  npm install --no-fund --no-audit --loglevel=error
fi

echo ">> Building TypeScript..."
npm run build

echo ">> Validating manifest.json..."
"$MCPB" validate manifest.json

echo ">> Staging files in $STAGE..."
cp manifest.json package.json "$STAGE/"
[[ -f README.md ]]   && cp README.md   "$STAGE/"
[[ -f LICENSE ]]     && cp LICENSE     "$STAGE/"
[[ -f .mcpbignore ]] && cp .mcpbignore "$STAGE/"
cp -R dist "$STAGE/dist"

echo ">> Installing production dependencies into staging dir..."
# --ignore-scripts=false is the default — we WANT prebuild-install to fetch
# the better-sqlite3 native binary for this platform.
(
  cd "$STAGE"
  npm install --omit=dev --no-fund --no-audit --loglevel=error
)

# Strip prebuilds for OTHER platforms from better-sqlite3 to keep the bundle
# small. Each prebuild is ~2MB and there are ~10 of them.
PREBUILDS_DIR="$STAGE/node_modules/better-sqlite3/prebuilds"
if [[ -d "$PREBUILDS_DIR" ]]; then
  KEEP_DIR="${RAW_PLATFORM}-${ARCH}"
  echo ">> Pruning prebuilds in $PREBUILDS_DIR (keeping $KEEP_DIR)..."
  find "$PREBUILDS_DIR" -mindepth 1 -maxdepth 1 -type d \
    ! -name "$KEEP_DIR" -exec rm -rf {} +
fi

echo ">> Packing $OUTPUT..."
"$MCPB" pack "$STAGE" "$OUTPUT"

echo
echo ">> Bundle info:"
"$MCPB" info "$OUTPUT" || true

echo
echo "✓ Built $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
