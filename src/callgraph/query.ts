import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { getMinecraftCacheDir } from '../utils/paths.js';
import { requireSqlite, isSqliteAvailable } from './sqlite-loader.js';

export function getCallgraphDir(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'callgraph');
}

export function getCallgraphDbPath(version: string): string {
  return path.join(getCallgraphDir(version), 'callgraph.db');
}

let db: DatabaseSync | null = null;

export function openDb(version: string): DatabaseSync {
  if (db) return db;

  const dbPath = path.join(getCallgraphDir(version), 'callgraph.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error('Callgraph database not found. Run `mcdev-mcp callgraph` first.');
  }

  // Lazy-resolve so this module evaluates on Node <22.5 — see sqlite-loader.ts.
  const DatabaseSyncCtor = requireSqlite();
  db = new DatabaseSyncCtor(dbPath, { readOnly: true });

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export interface MethodRef {
  className: string;
  methodName: string;
  descriptor: string;
  fullName: string;
  lineNumber?: number;
}

export function findCallers(version: string, className: string, methodName: string): MethodRef[] {
  const database = openDb(version);
  
  const stmt = database.prepare(`
    SELECT caller_class, caller_method, caller_desc, line_number
    FROM calls
    WHERE callee_class = ? AND callee_method = ?
    LIMIT 100
  `);
  
  const rows = stmt.all(className, methodName) as any[];
  
  return rows.map(row => ({
    className: row.caller_class,
    methodName: row.caller_method,
    descriptor: row.caller_desc || '',
    fullName: `${row.caller_class}.${row.caller_method}`,
    lineNumber: row.line_number,
  }));
}

export function findCallees(version: string, className: string, methodName: string): MethodRef[] {
  const database = openDb(version);
  
  const stmt = database.prepare(`
    SELECT callee_class, callee_method, callee_desc, line_number
    FROM calls
    WHERE caller_class = ? AND caller_method = ?
    LIMIT 100
  `);
  
  const rows = stmt.all(className, methodName) as any[];
  
  return rows.map(row => ({
    className: row.callee_class,
    methodName: row.callee_method,
    descriptor: row.callee_desc || '',
    fullName: `${row.callee_class}.${row.callee_method}`,
    lineNumber: row.line_number,
  }));
}

export function searchMethods(version: string, query: string, limit: number = 50): MethodRef[] {
  const database = openDb(version);
  
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
  
  const rows = stmt.all(pattern, pattern, pattern, pattern, limit) as any[];
  
  return rows.map(row => ({
    className: row.class_name,
    methodName: row.method_name,
    descriptor: row.descriptor || '',
    fullName: `${row.class_name}.${row.method_name}`,
  }));
}

let _sqliteWarningShown = false;

export function getCallgraphStats(version: string): { totalCalls: number; uniqueCallers: number; uniqueCallees: number } | null {
  const dbPath = path.join(getCallgraphDir(version), 'callgraph.db');

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  // Degrade gracefully on Node <22.5: the DB file exists but we can't open
  // it. Show one stderr line so the user knows why stats are missing, then
  // return null so cli.js status keeps printing the rest of the version
  // info.
  const probe = isSqliteAvailable();
  if (!probe.ok) {
    if (!_sqliteWarningShown) {
      _sqliteWarningShown = true;
      console.error(`(callgraph stats unavailable: ${probe.error})`);
    }
    return null;
  }

  const database = openDb(version);

  const totalCalls = (database.prepare('SELECT COUNT(*) as count FROM calls').get() as any)?.count || 0;
  const uniqueCallers = (database.prepare('SELECT COUNT(DISTINCT caller_class || caller_method) as count FROM calls').get() as any)?.count || 0;
  const uniqueCallees = (database.prepare('SELECT COUNT(DISTINCT callee_class || callee_method) as count FROM calls').get() as any)?.count || 0;

  closeDb();

  return { totalCalls, uniqueCallers, uniqueCallees };
}
