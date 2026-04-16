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
# typescript, etc.), src/, tests/, docs/, and .github/. Staging gives us a
# clean, prod-only tree.
#
# Note: we use the built-in node:sqlite module, so there are no native
# dependencies to ship. Earlier versions of this script pinned better-sqlite3
# prebuilds to a specific Electron ABI; that whole mechanism is gone now.

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
# No native deps remain — node:sqlite is a built-in. This is now a
# pure-JavaScript install.
(
  cd "$STAGE"
  npm install --omit=dev --no-fund --no-audit --loglevel=error
)

# ---------------------------------------------------------------------------
# Smoke test the bootstrap.
#
# We run the compiled bootstrap on the build host's `node` and watch for the
# success breadcrumb. This catches the classes of failure that bit us during
# the bisect:
#
#   - dist/mcpb-bootstrap.js missing or broken (tsc didn't emit it)
#   - a top-level import crash somewhere in the ./index.js module graph
#   - the server.connect(transport) path never resolving
#   - an async EPIPE-style crash with no stderr output
#
# It does NOT catch Node-version-specific bugs when the host happens to run a
# different Node than Claude Desktop's embedded Electron. For the bugs it
# does catch, it fails the build loudly instead of shipping a bundle that
# silently dies when a user installs it.
#
# node:sqlite requires Node >= 22.5.0; the build host must meet that too or
# the preflight will fail here.
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
# run Node 22.5+.
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

# Native-binary re-download and prebuild-pruning blocks used to live here.
# They're gone now that we use the built-in node:sqlite — there is no .node
# file to ship, and therefore no ABI mismatch or Team-ID dlopen failure to
# worry about. The whole class of "Claude Desktop bumped Electron, our MCPB
# silently died on load" bugs disappears.

echo ">> Packing $OUTPUT..."
"$MCPB" pack "$STAGE" "$OUTPUT"

echo
echo ">> Bundle info:"
"$MCPB" info "$OUTPUT" || true

echo
echo "✓ Built $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
