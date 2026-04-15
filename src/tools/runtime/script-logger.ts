import * as fs from 'fs';
import * as path from 'path';
import envPaths from 'env-paths';

const paths = envPaths('mcdev-mcp', { suffix: '' });

export interface ScriptLogEntry {
    timestamp: string;
    success: boolean;
    code: string;
    result?: unknown;
    output?: string;
    error?: string;
    duration_ms: number;
}

class ScriptLogger {
    private logDir: string;
    private allLogPath: string;
    private errorsLogPath: string;

    constructor() {
        this.logDir = path.join(paths.data, 'script-logs');
        this.allLogPath = path.join(this.logDir, 'all.jsonl');
        this.errorsLogPath = path.join(this.logDir, 'errors.jsonl');
    }

    private ensureLogDir(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    private appendLog(filePath: string, entry: ScriptLogEntry): void {
        try {
            this.ensureLogDir();
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(filePath, line, 'utf-8');
        } catch (e) {
            // Silently ignore logging errors - don't break execution
            console.error('[ScriptLogger] Failed to write log:', e);
        }
    }

    /**
     * Log a script execution result.
     * All executions go to all.jsonl, errors also go to errors.jsonl
     */
    log(entry: ScriptLogEntry): void {
        this.appendLog(this.allLogPath, entry);
        if (!entry.success) {
            this.appendLog(this.errorsLogPath, entry);
        }
    }

    /**
     * Get the path to the errors log file
     */
    getErrorsLogPath(): string {
        return this.errorsLogPath;
    }

    /**
     * Get the path to the full log file
     */
    getAllLogPath(): string {
        return this.allLogPath;
    }

    /**
     * Get the log directory path
     */
    getLogDir(): string {
        return this.logDir;
    }

    /**
     * Read recent error entries (last N)
     */
    getRecentErrors(limit: number = 50): ScriptLogEntry[] {
        try {
            if (!fs.existsSync(this.errorsLogPath)) {
                return [];
            }
            const content = fs.readFileSync(this.errorsLogPath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l);
            const entries = lines.map(line => {
                try {
                    return JSON.parse(line) as ScriptLogEntry;
                } catch {
                    return null;
                }
            }).filter((e): e is ScriptLogEntry => e !== null);

            return entries.slice(-limit);
        } catch {
            return [];
        }
    }

    /**
     * Get error statistics grouped by error type/message
     */
    getErrorStats(): { error: string; count: number; lastSeen: string; examples: string[] }[] {
        const errors = this.getRecentErrors(500);
        const statsMap = new Map<string, { count: number; lastSeen: string; examples: string[] }>();

        for (const entry of errors) {
            if (!entry.error) continue;

            // Normalize error message (strip line numbers, variable names)
            const normalizedError = this.normalizeError(entry.error);

            const existing = statsMap.get(normalizedError);
            if (existing) {
                existing.count++;
                existing.lastSeen = entry.timestamp;
                if (existing.examples.length < 3 && !existing.examples.includes(entry.code)) {
                    existing.examples.push(entry.code);
                }
            } else {
                statsMap.set(normalizedError, {
                    count: 1,
                    lastSeen: entry.timestamp,
                    examples: [entry.code]
                });
            }
        }

        return Array.from(statsMap.entries())
            .map(([error, stats]) => ({ error, ...stats }))
            .sort((a, b) => b.count - a.count);
    }

    private normalizeError(error: string): string {
        // Remove specific line/column numbers
        let normalized = error.replace(/line (\d+)/gi, 'line N');
        normalized = normalized.replace(/:\d+:/g, ':N:');
        // Remove specific variable names in quotes
        normalized = normalized.replace(/'[^']+'/g, "'...'");
        return normalized.slice(0, 200); // Truncate for grouping
    }

    /**
     * Rotate logs if they get too large (>10MB)
     */
    rotateIfNeeded(): void {
        const maxSize = 10 * 1024 * 1024; // 10MB

        for (const logPath of [this.allLogPath, this.errorsLogPath]) {
            try {
                if (!fs.existsSync(logPath)) continue;
                const stats = fs.statSync(logPath);
                if (stats.size > maxSize) {
                    const rotatedPath = logPath.replace('.jsonl', `.${Date.now()}.jsonl`);
                    fs.renameSync(logPath, rotatedPath);
                    // Keep only the rotated file, delete older rotations
                    this.cleanOldRotations(logPath);
                }
            } catch {
                // Ignore rotation errors
            }
        }
    }

    private cleanOldRotations(basePath: string): void {
        try {
            const dir = path.dirname(basePath);
            const baseName = path.basename(basePath, '.jsonl');
            const files = fs.readdirSync(dir)
                .filter(f => f.startsWith(baseName) && f.endsWith('.jsonl') && f !== path.basename(basePath))
                .sort()
                .reverse();

            // Keep only the 2 most recent rotations
            for (const file of files.slice(2)) {
                fs.unlinkSync(path.join(dir, file));
            }
        } catch {
            // Ignore cleanup errors
        }
    }
}

export const scriptLogger = new ScriptLogger();
