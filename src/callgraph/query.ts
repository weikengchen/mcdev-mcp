import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'sql.js';
import { getMinecraftCacheDir } from '../utils/paths.js';
import { loadSqlJs } from './sqlite-loader.js';

export function getCallgraphDir(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'callgraph');
}

export function getCallgraphDbPath(version: string): string {
  return path.join(getCallgraphDir(version), 'callgraph.db');
}

// Cache the open Database keyed by version. sql.js loads the entire DB into
// memory, so opening multiple versions at once would waste hundreds of MB —
// we close the previous one whenever a different version is requested.
let _db: Database | null = null;
let _dbVersion: string | null = null;

export async function openDb(version: string): Promise<Database> {
  if (_db && _dbVersion === version) return _db;
  if (_db) {
    _db.close();
    _db = null;
    _dbVersion = null;
  }

  const dbPath = path.join(getCallgraphDir(version), 'callgraph.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error('Callgraph database not found. Run `mcdev-mcp callgraph` first.');
  }

  const SQL = await loadSqlJs();
  // sql.js reads the whole file into memory; the on-disk format is plain
  // SQLite so DBs built by any prior driver (better-sqlite3, node:sqlite)
  // load without migration.
  const fileBuffer = fs.readFileSync(dbPath);
  _db = new SQL.Database(fileBuffer);
  _dbVersion = version;

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbVersion = null;
  }
}

export interface MethodRef {
  className: string;
  methodName: string;
  descriptor: string;
  fullName: string;
  lineNumber?: number;
}

export async function findCallers(version: string, className: string, methodName: string): Promise<MethodRef[]> {
  const database = await openDb(version);

  const stmt = database.prepare(`
    SELECT caller_class, caller_method, caller_desc, line_number
    FROM calls
    WHERE callee_class = ? AND callee_method = ?
    LIMIT 100
  `);
  stmt.bind([className, methodName]);

  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map(row => ({
    className: row.caller_class,
    methodName: row.caller_method,
    descriptor: row.caller_desc || '',
    fullName: `${row.caller_class}.${row.caller_method}`,
    lineNumber: row.line_number,
  }));
}

export async function findCallees(version: string, className: string, methodName: string): Promise<MethodRef[]> {
  const database = await openDb(version);

  const stmt = database.prepare(`
    SELECT callee_class, callee_method, callee_desc, line_number
    FROM calls
    WHERE caller_class = ? AND caller_method = ?
    LIMIT 100
  `);
  stmt.bind([className, methodName]);

  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map(row => ({
    className: row.callee_class,
    methodName: row.callee_method,
    descriptor: row.callee_desc || '',
    fullName: `${row.callee_class}.${row.callee_method}`,
    lineNumber: row.line_number,
  }));
}

export async function searchMethods(version: string, query: string, limit: number = 50): Promise<MethodRef[]> {
  const database = await openDb(version);

  const pattern = `%${query}%`;

  const stmt = database.prepare(`
    SELECT DISTINCT callee_class as class_name, callee_method as method_name, callee_desc as descriptor
    FROM calls
    WHERE callee_class LIKE ? OR callee_method LIKE ?
    UNION
    SELECT DISTINCT caller_class as class_name, caller_method as method_name, caller_desc as descriptor
    FROM calls
    WHERE caller_class LIKE ? OR caller_method LIKE ?
    LIMIT ?
  `);
  stmt.bind([pattern, pattern, pattern, pattern, limit]);

  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows.map(row => ({
    className: row.class_name,
    methodName: row.method_name,
    descriptor: row.descriptor || '',
    fullName: `${row.class_name}.${row.method_name}`,
  }));
}

export async function getCallgraphStats(version: string): Promise<{ totalCalls: number; uniqueCallers: number; uniqueCallees: number } | null> {
  const dbPath = path.join(getCallgraphDir(version), 'callgraph.db');

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  // sql.js works on every Node version we support, so the older
  // node:sqlite probe-and-degrade dance is gone — any failure here is a
  // real error worth surfacing.
  const database = await openDb(version);

  const totalCalls = (database.exec('SELECT COUNT(*) as count FROM calls')[0]?.values[0]?.[0] as number) ?? 0;
  const uniqueCallers = (database.exec('SELECT COUNT(DISTINCT caller_class || caller_method) as count FROM calls')[0]?.values[0]?.[0] as number) ?? 0;
  const uniqueCallees = (database.exec('SELECT COUNT(DISTINCT callee_class || callee_method) as count FROM calls')[0]?.values[0]?.[0] as number) ?? 0;

  // status loops over every cached version — close after stats so we don't
  // hold N copies of the DB in memory at once.
  closeDb();

  return { totalCalls, uniqueCallers, uniqueCallees };
}
