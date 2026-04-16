// Lazy-load the node:sqlite built-in.
//
// Why not a top-level `import { DatabaseSync } from 'node:sqlite'`? On Node
// runtimes older than 22.5.0 that import throws ERR_UNKNOWN_BUILTIN_MODULE
// during module evaluation, which kills the entire MCP server before any
// stdio handshake completes. Runtime tools (mc_connect, mc_execute,
// mc_snapshot, ...) talk to DebugBridge over WebSocket and don't need
// sqlite at all — they should keep working on Node 18+ even though the
// static-analysis tools (mc_find_refs, callgraph indexing) require >=22.5.
//
// We resolve sqlite synchronously via createRequire so the existing
// query/parser code stays sync. The loader caches both the resolved
// constructor and any load error, so repeated calls don't re-throw the
// underlying ERR_UNKNOWN_BUILTIN_MODULE noise.

import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
let _DatabaseSync: typeof DatabaseSyncType | null = null;
let _sqliteError: Error | null = null;

export function requireSqlite(): typeof DatabaseSyncType {
  if (_DatabaseSync) return _DatabaseSync;
  if (_sqliteError) throw _sqliteError;
  try {
    const mod = _require('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
    _DatabaseSync = mod.DatabaseSync;
    return _DatabaseSync;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _sqliteError = new Error(
      `node:sqlite is not available in this Node runtime (${process.version}). ` +
      `mcdev-mcp's static-analysis tools (mc_find_refs, callgraph init) require ` +
      `Node >= 22.5.0. Runtime tools (mc_connect, mc_execute, mc_snapshot, ` +
      `mc_screenshot, mc_run_command, mc_logger) work fine on older Node — they ` +
      `talk to DebugBridge over WebSocket and have no sqlite dependency. ` +
      `Original error: ${msg}`
    );
    throw _sqliteError;
  }
}

/**
 * Probe whether node:sqlite is loadable without throwing. Used by the MCPB
 * bootstrap preflight to log a non-fatal warning instead of crashing the
 * server when sqlite is missing.
 */
export function isSqliteAvailable(): { ok: true } | { ok: false; error: string } {
  try {
    requireSqlite();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
