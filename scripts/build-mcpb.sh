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
#
# We also --build-from-source=false (the default) so npm just drops whatever
# prebuild-install picks in place. That pick is based on the BUILDING node's
# ABI, which is usually NOT what we want — see the re-download below.
(
  cd "$STAGE"
  npm install --omit=dev --no-fund --no-audit --loglevel=error
)

# ---------------------------------------------------------------------------
# Smoke test the bootstrap BEFORE we swap in the Electron-ABI native binary.
#
# At this point the stage has the host-Node-ABI better-sqlite3 binary from
# `npm install` above, so we can actually run the compiled bootstrap on the
# build host's `node` and see it come up. This catches the classes of failure
# that bit us during the bisect:
#
#   - dist/mcpb-bootstrap.js missing or broken (tsc didn't emit it)
#   - a top-level import crash somewhere in the ./index.js module graph
#   - the server.connect(transport) path never resolving
#   - an async EPIPE-style crash with no stderr output
#
# It does NOT catch the Electron-ABI issue (that's what the post-download
# file-existence check below is for), and it does NOT catch Node-24-specific
# bugs when the host happens to be Node 20. For the bugs it does catch, it
# fails the build loudly instead of shipping a bundle that silently dies when
# a user installs it.
#
# How it works:
#   1. Run `node dist/mcpb-bootstrap.js serve` in the background with
#      MCDEV_MCP_DEBUG_LOG pointing at a temp file.
#   2. Poll that file for up to 5s for the "startServer: connected" breadcrumb.
#   3. Kill the process either way, and fail the build if the breadcrumb
#      never showed up.
#
# The server never gets a real `initialize` JSON-RPC message — we feed it
# /dev/null on stdin — so it sits forever on `await server.connect()`. That
# is exactly the "idle and waiting" state we want to observe; we kill it
# once we've seen it reach that state.
#
# Skippable via MCDEV_MCP_SKIP_SMOKE=1 for cases where the build host cannot
# run Node (e.g. cross-compiling on a CI arch that doesn't ship a node-v<abi>
# prebuild for better-sqlite3).
# ---------------------------------------------------------------------------
if [[ "${MCDEV_MCP_SKIP_SMOKE:-0}" == "1" ]]; then
  echo ">> Smoke test skipped (MCDEV_MCP_SKIP_SMOKE=1)"
else
  echo ">> Smoke test: booting dist/mcpb-bootstrap.js serve with host Node..."
  SMOKE_LOG="$(mktemp -t mcdev-mcp-smoke.XXXXXX)"
  SMOKE_PID=""
  SMOKE_OK=0

  # Start the bootstrap in the background. stdin=/dev/null means it gets EOF
  # immediately on the JSON-RPC stream, but `server.connect()` resolves before
  # any message is read, so we'll still see the success breadcrumb.
  (
    cd "$STAGE"
    MCDEV_MCP_DEBUG_LOG="$SMOKE_LOG" \
      node dist/mcpb-bootstrap.js serve < /dev/null > /dev/null 2>&1 &
    echo $! > "$SMOKE_LOG.pid"
    wait $! 2>/dev/null || true
  ) &
  SMOKE_RUNNER=$!

  # Poll the log for the success marker. 10 * 0.5s = 5s cap.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if grep -q "startServer: connected, ready for requests" "$SMOKE_LOG" 2>/dev/null; then
      SMOKE_OK=1
      break
    fi
    sleep 0.5
  done

  # Kill the bootstrap if it's still running.
  if [[ -f "$SMOKE_LOG.pid" ]]; then
    SMOKE_PID="$(cat "$SMOKE_LOG.pid")"
    if [[ -n "$SMOKE_PID" ]]; then
      kill "$SMOKE_PID" 2>/dev/null || true
      sleep 0.2
      kill -9 "$SMOKE_PID" 2>/dev/null || true
    fi
    rm -f "$SMOKE_LOG.pid"
  fi
  wait "$SMOKE_RUNNER" 2>/dev/null || true

  if [[ "$SMOKE_OK" != "1" ]]; then
    echo "!! FATAL: smoke test failed — bootstrap did not reach"
    echo "!!        'startServer: connected, ready for requests' within 5s."
    echo "!! Smoke log ($SMOKE_LOG):"
    if [[ -s "$SMOKE_LOG" ]]; then
      sed 's/^/!!   /' "$SMOKE_LOG"
    else
      echo "!!   (empty — the bootstrap died before any breadcrumb landed;"
      echo "!!    try re-running with MCDEV_MCP_DEBUG_LOG=/tmp/mcdev-debug.log"
      echo "!!    and running node dist/mcpb-bootstrap.js serve by hand.)"
    fi
    rm -f "$SMOKE_LOG"
    exit 1
  fi
  rm -f "$SMOKE_LOG"
  echo ">> Smoke test passed: bootstrap reached 'connected, ready for requests'"
fi

# ---------------------------------------------------------------------------
# Re-download better-sqlite3 for the Electron runtime that Claude Desktop
# uses.
#
# Why this matters: Claude Desktop runs MCP servers with its own bundled
# Node runtime (Electron's embedded Node, not the host's `node`). better-
# sqlite3 12.x is NOT NAPI-based — it uses V8 directly and is locked to a
# specific NODE_MODULE_VERSION. If the host dev machine has Node 20
# (ABI 115), `npm install` drops a binary built for ABI 115, and Claude
# Desktop (Electron 40 → ABI 143) will fail to load it with "NODE_MODULE_
# VERSION mismatch" — or, worse, silently exit before any stderr lands in
# the MCP client log.
#
# better-sqlite3 publishes per-runtime prebuilds on its GitHub releases:
#   better-sqlite3-v<ver>-electron-v<abi>-<platform>-<arch>.tar.gz
#   better-sqlite3-v<ver>-node-v<abi>-<platform>-<arch>.tar.gz
#
# prebuild-install knows how to fetch these when given --runtime and
# --target. We target the specific Electron version that Claude Desktop
# ships today so the MCPB is guaranteed to load. If Claude Desktop upgrades
# Electron, this script will need a matching bump (detection logic could
# be added later; keeping it explicit for now).
#
# MCDEV_MCP_ELECTRON_TARGET lets CI / contributors override the target
# without editing this script.
# ---------------------------------------------------------------------------
ELECTRON_TARGET="${MCDEV_MCP_ELECTRON_TARGET:-40.0.0}"
echo ">> Re-downloading better-sqlite3 binary for Electron ${ELECTRON_TARGET}..."
(
  cd "$STAGE/node_modules/better-sqlite3"
  # Wipe the existing build/Release so prebuild-install doesn't skip.
  rm -rf build/Release
  # prebuild-install exits non-zero if no prebuild matches; let that fail
  # loudly rather than silently shipping the wrong ABI.
  "$REPO_ROOT/node_modules/.bin/prebuild-install" \
    --runtime=electron \
    --target="$ELECTRON_TARGET" \
    --platform="$RAW_PLATFORM" \
    --arch="$ARCH" \
    --force \
    --verbose
)

# Sanity check: the native binding should exist after the re-download.
NATIVE="$STAGE/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [[ ! -f "$NATIVE" ]]; then
  echo "!! FATAL: $NATIVE not found after prebuild-install."
  echo "!! Check that an electron-v<ABI>-${RAW_PLATFORM}-${ARCH} prebuild exists"
  echo "!! for better-sqlite3 (see https://github.com/WiseLibs/better-sqlite3/releases)."
  exit 1
fi
echo ">> Native binding in place: $(file "$NATIVE" | sed 's|'"$STAGE"'/||')"

# Strip prebuilds for OTHER platforms from better-sqlite3 to keep the bundle
# small. Each prebuild is ~2MB and there are ~10 of them. (prebuild-install
# may also drop a prebuilds/ tree in some cases.)
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
