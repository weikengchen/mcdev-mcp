#!/usr/bin/env node
// ---------------------------------------------------------------------------
// MCPB entry point.
//
// Why this file exists: when the MCPB desktop extension spawns us, stderr
// from the child process does NOT reliably reach Claude Desktop's per-server
// log file. A crash during the hoisted `import` phase of `cli.ts` (or any
// other module) will silently kill the process with no breadcrumb the user
// can read.
//
// Workaround: we write a boot trace to a file on disk (/tmp/mcdev-debug.log)
// via fs.appendFileSync. This has been verified empirically with level-2
// debug MCPBs — the file shows up inside Claude Desktop while stderr stays
// dark. Controlled by MCDEV_MCP_DEBUG_LOG env var (set a custom path) or
// opt out by setting it to "off".
//
// This bootstrap does:
//   1. Install uncaughtException / unhandledRejection handlers that flush to
//      the debug log.
//   2. Log environment info (Node version, NODE_MODULE_VERSION, platform,
//      arch, argv, cwd).
//   3. Preflight sql.js as a non-fatal probe — log whether the
//      static-analysis tools will work, but don't kill the server if WASM
//      init fails. Runtime tools (mc_connect, mc_execute, ...) work fine
//      without it. sql.js works on Node 14+, so the preflight effectively
//      always succeeds; we keep it as a breadcrumb in the boot log.
//   4. Dynamically import ./cli.js so an error during its module evaluation
//      is caught here and logged with a stack.
//
// The manifest.json entry_point points at the compiled form of this file.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';

// Logging is file-only and OFF by default. Writing to stderr under the Claude
// Desktop MCPB host has been observed to raise an async EPIPE (no reader on
// the pipe) that surfaces as an uncaughtException and kills the process —
// debug MCPBs that wrote ONLY to a file worked fine in the same host, which
// is what tipped us off.
//
// Semantics of MCDEV_MCP_DEBUG_LOG:
//   unset / empty / "off" → disabled (default)
//   "on"                  → /tmp/mcdev-debug.log
//   any other value       → used as the log file path
//
// Users troubleshooting a silent startup can set MCDEV_MCP_DEBUG_LOG=on in
// the Claude Desktop extension settings (or any shell) to re-enable the
// breadcrumb file used during the Level 0/1/2 bisect.
const DEBUG_LOG_PATH = (() => {
  const override = process.env.MCDEV_MCP_DEBUG_LOG;
  if (!override || override === 'off') return null;
  if (override === 'on') return '/tmp/mcdev-debug.log';
  return override;
})();

// Swallow async errors from stderr (EPIPE in particular). An unhandled
// 'error' event on a Writable becomes an uncaughtException in Node. We never
// write to stderr ourselves from this file, but something downstream
// (console.error, process.exit's auto-flush, a dep's warning) might — and
// that must never kill us.
process.stderr.on('error', () => { /* intentional no-op */ });
process.stdout.on('error', () => { /* intentional no-op */ });

function writeDebugFile(line: string): void {
  if (!DEBUG_LOG_PATH) return;
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line.endsWith('\n') ? line : line + '\n');
  } catch {
    // Logging must never crash the process. Drop on the floor if we cannot
    // write (read-only fs, full disk, etc.).
  }
}

function boot(msg: string): void {
  writeDebugFile(`[${new Date().toISOString()}] [mcdev-mcp boot] ${msg}`);
}

// Install error handlers first so even a top-of-file import crash is logged.
process.on('uncaughtException', (err: Error) => {
  boot(`uncaughtException: ${err.stack ?? err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  boot(`unhandledRejection: ${msg}`);
  process.exit(1);
});
process.on('exit', (code: number) => {
  boot(`process exit code=${code}`);
});

boot('========== mcdev-mcp bootstrap ==========');
const vers = process.versions as Record<string, string | undefined>;
boot(`pid=${process.pid}`);
boot(`node=${process.version} platform=${process.platform} arch=${process.arch}`);
boot(
  `versions.modules=${vers.modules} versions.napi=${vers.napi ?? 'n/a'} ` +
  `versions.electron=${vers.electron ?? 'n/a'} versions.v8=${vers.v8}`
);
boot(`argv=${JSON.stringify(process.argv)}`);
boot(`cwd=${process.cwd()}`);
boot(`entry=${import.meta.url}`);
boot(`MCDEV_MCP_HOME=${process.env.MCDEV_MCP_HOME ?? '(unset)'}`);
boot(`MCDEV_MCP_DEBUG_LOG=${DEBUG_LOG_PATH ?? '(off)'}`);
boot(`env.ELECTRON_RUN_AS_NODE=${process.env.ELECTRON_RUN_AS_NODE ?? '(unset)'}`);

(async () => {
  // Preflight: probe sql.js (SQLite as WebAssembly). Non-fatal — the server
  // still comes up if WASM init fails, and runtime tools (mc_connect,
  // mc_execute, ...) keep working. Only the static-analysis tools that touch
  // the callgraph database surface a clear runtime error when invoked.
  //
  // History (why we keep arriving back at "is sqlite working?"):
  //   1. better-sqlite3 — native module, NODE_MODULE_VERSION-pinned. Claude
  //      Desktop bumps Electron on its own schedule and broke us every time;
  //      macOS Team ID checks made cross-host loads non-portable.
  //   2. node:sqlite (built-in) — only available on Node >= 22.5.0. Broke
  //      users running this server on Node 18 or 20 via npx.
  //   3. sql.js (current) — pure JS + WebAssembly, no native binding, no
  //      Electron coupling, works on Node 14+. The preflight effectively
  //      always succeeds; we keep it as a breadcrumb in the boot log.
  boot('preflight: probing sql.js (WASM)...');
  try {
    const { loadSqlJs } = await import('./callgraph/sqlite-loader.js');
    const SQL = await loadSqlJs();
    const probe = new SQL.Database();
    const row = probe.exec('select sqlite_version() as v')[0]?.values[0]?.[0];
    boot(`preflight: sql.js OK — sqlite_version=${row ?? '(null)'}`);
    probe.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    boot(`preflight: sql.js UNAVAILABLE — ${msg}`);
    boot(
      `Static-analysis tools (mc_find_refs, callgraph init) will fail with ` +
      `a clear error when invoked. Runtime tools (mc_connect, mc_execute, ` +
      `mc_snapshot, mc_screenshot, mc_run_command, mc_logger) will work ` +
      `normally.`
    );
  }

  // We bypass cli.ts (and commander) entirely for the `serve` case. Earlier
  // debugging showed commander's program.parse() calling process.exit(1)
  // synchronously under Claude Desktop's bundled Node 24 runtime (but not
  // under a local Node 20 test) — most likely because argv[0] is "node" with
  // no absolute path and parse() is interpreting args differently. The MCPB
  // only ever launches us with `serve` anyway, so there is no reason to
  // route through the CLI framework at all here.
  //
  // The non-serve subcommands (init, status, clean, ...) are only meaningful
  // when a human runs the tool locally via `node dist/cli.js <cmd>`, which
  // goes through cli.ts directly and is unaffected by this shortcut.
  const subcommand = process.argv[2];
  boot(`subcommand=${subcommand ?? '(none)'}`);

  if (subcommand === 'serve' || subcommand === undefined) {
    boot('loading ./index.js (server module) directly ...');
    let startServerFn: () => Promise<void>;
    try {
      const mod = await import('./index.js');
      startServerFn = mod.startServer;
      if (typeof startServerFn !== 'function') {
        throw new Error(`./index.js did not export startServer (got ${typeof startServerFn})`);
      }
      boot('./index.js loaded, startServer is a function');
    } catch (err) {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      boot(`FATAL loading ./index.js: ${msg}`);
      process.exit(1);
    }

    boot('calling startServer() ...');
    try {
      await startServerFn();
      boot('startServer() resolved — waiting for stdio messages');
    } catch (err) {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      boot(`FATAL in startServer: ${msg}`);
      process.exit(1);
    }
    // Don't fall through into cli.ts.
    return;
  }

  // Non-serve subcommand: delegate to cli.ts so `node mcpb-bootstrap.js init
  // -v 1.21.11` etc. still works for humans who extract the bundle manually.
  boot(`delegating to ./cli.js for subcommand=${subcommand}`);
  try {
    await import('./cli.js');
    boot('./cli.js imported — commander has processed argv');
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    boot(`FATAL during ./cli.js import: ${msg}`);
    process.exit(1);
  }
})();
