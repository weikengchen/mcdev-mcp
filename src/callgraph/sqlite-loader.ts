// Load sql.js (SQLite compiled to WebAssembly).
//
// Why sql.js? Earlier iterations went through two failed approaches:
//   1. better-sqlite3 — native module, NODE_MODULE_VERSION pinned. Broke every
//      time Claude Desktop bumped Electron, and macOS Team ID enforcement on
//      dlopen made cross-host loads non-portable.
//   2. node:sqlite (Node built-in) — only available on Node >= 22.5.0. Broke
//      users running the CLI on Node 18 or 20.
//
// sql.js is pure JavaScript + WebAssembly: no native bindings, no Electron
// ABI coupling, no Team ID dance, works on Node 14+ without flags. The
// trade-offs are async init (WASM has to be instantiated), slightly higher
// memory use than a native build, and the whole DB is loaded into memory
// (sql.js doesn't do incremental disk I/O). For our callgraph workload — a
// few hundred MB queried at MCP-tool granularity — none of that matters.
//
// The on-disk file format is plain SQLite, so existing callgraph.db files
// from the better-sqlite3 / node:sqlite era load without any migration.

import type initSqlJsType from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const _require = createRequire(import.meta.url);

// Cache the singleton SQL module — one WASM instantiation per process. The
// promise itself is cached so concurrent first-callers all wait on the same
// init rather than spawning multiple WASM instances.
let _sqlJsPromise: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (_sqlJsPromise) return _sqlJsPromise;
  _sqlJsPromise = (async () => {
    // sql.js is a CommonJS module — go through createRequire so it resolves
    // cleanly under our "type": "module" package.
    const initSqlJs = _require('sql.js') as typeof initSqlJsType;

    // Locate sql-wasm.wasm next to sql-wasm.js. We can't resolve
    // 'sql.js/package.json' directly because the package's "exports" map
    // doesn't expose package.json (Node refuses with ERR_PACKAGE_PATH_NOT_EXPORTED
    // on >=20). Instead, resolve the main entry — which IS exported as "." —
    // and take its dirname; that's already the dist/ directory since main
    // points at dist/sql-wasm.js.
    const mainPath = _require.resolve('sql.js');
    const distDir = path.dirname(mainPath);

    return await initSqlJs({
      locateFile: (file: string) => path.join(distDir, file),
    });
  })().catch((err) => {
    // Reset the cached promise on failure so a retry can re-attempt rather
    // than serving the same rejection forever.
    _sqlJsPromise = null;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to initialize sql.js: ${msg}`);
  });
  return _sqlJsPromise;
}
