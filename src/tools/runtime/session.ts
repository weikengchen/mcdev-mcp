import WebSocket from "ws";
import { BridgeRequest, BridgeResponse, SessionInfo } from "./types.js";

const DEFAULT_PORT = (() => {
    const raw = process.env.DEBUGBRIDGE_PORT;
    if (!raw) return 9876;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 65535 ? n : 9876;
})();

export class BridgeSession {
    private ws: WebSocket | null = null;
    private requestCounter = 0;
    private pendingRequests = new Map<string, {
        resolve: (resp: BridgeResponse) => void;
        reject: (err: Error) => void;
    }>();
    private configuredPort: number;
    private connectedPort: number | null = null;
    private autoScan: boolean = true;

    // Tracked session info for reconnect verification
    private expectedGameDir: string | null = null;
    private lastSessionInfo: SessionInfo | null = null;

    constructor(defaultPort: number = DEFAULT_PORT) {
        this.configuredPort = defaultPort;
    }

    /** Set port without connecting. Resets expected game instance. */
    setPort(port: number) {
        this.configuredPort = port;
        this.autoScan = false;
        this.expectedGameDir = null;
    }

    /** Get the currently connected port, or null if not connected */
    getConnectedPort(): number | null {
        return this.connectedPort;
    }

    /** Get last session info (version, paths, etc.) */
    getSessionInfo(): SessionInfo | null {
        return this.lastSessionInfo;
    }

    async connect(port?: number): Promise<SessionInfo> {
        if (port !== undefined) {
            this.configuredPort = port;
            this.autoScan = false;
            this.expectedGameDir = null;
        }

        let info: SessionInfo;
        if (this.autoScan) {
            info = await this.connectWithScan();
        } else {
            info = await this.connectToPort(this.configuredPort);
        }

        // Verify same game instance on reconnect
        if (this.expectedGameDir && info.gameDir && info.gameDir !== this.expectedGameDir) {
            console.error(
                `[DebugBridge] Warning: Connected to different game instance.\n` +
                `  Expected: ${this.expectedGameDir}\n` +
                `  Got: ${info.gameDir}`
            );
        }

        if (info.gameDir) {
            this.expectedGameDir = info.gameDir;
        }
        this.lastSessionInfo = info;

        return info;
    }

    private async connectWithScan(): Promise<SessionInfo> {
        const portsToTry = Array.from({ length: 10 }, (_, i) => this.configuredPort + i);
        let lastError: Error | null = null;

        for (const port of portsToTry) {
            try {
                return await this.connectToPort(port);
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
            }
        }

        throw new Error(
            `Could not connect to DebugBridge on ports ${this.configuredPort}-${this.configuredPort + 9}. ` +
            `Is Minecraft running with the mod? Last error: ${lastError?.message}`
        );
    }

    private async connectToPort(targetPort: number): Promise<SessionInfo> {
        return new Promise((resolve, reject) => {
            const wsUrl = `ws://127.0.0.1:${targetPort}`;
            const ws = new WebSocket(wsUrl);

            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error(`Connection timed out connecting to ${wsUrl}`));
            }, 2000);

            ws.on("open", async () => {
                clearTimeout(timeout);
                this.ws = ws;
                this.connectedPort = targetPort;
                this.setupWebSocketHandlers(ws);
                try {
                    const status = await this.send("status", {});
                    resolve(status.result as SessionInfo);
                } catch (e) {
                    reject(e);
                }
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${err.message}`));
            });
        });
    }

    private setupWebSocketHandlers(ws: WebSocket) {
        ws.on("message", (data: WebSocket.RawData) => {
            try {
                const resp: BridgeResponse = JSON.parse(data.toString());
                const pending = this.pendingRequests.get(resp.id);
                if (pending) {
                    this.pendingRequests.delete(resp.id);
                    pending.resolve(resp);
                }
            } catch (e) {
                // Ignore malformed messages
            }
        });

        ws.on("close", () => {
            this.ws = null;
            this.connectedPort = null;
            for (const [, pending] of this.pendingRequests) {
                pending.reject(new Error("Connection closed"));
            }
            this.pendingRequests.clear();
        });
    }

    async send(type: string, payload: Record<string, unknown>): Promise<BridgeResponse> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            await this.connect();
        }

        const id = `req_${++this.requestCounter}`;
        const req: BridgeRequest = { id, type: type as BridgeRequest["type"], payload };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error("Request timed out (10s). The game may be frozen or the Lua script may be in an infinite loop."));
            }, 10000);

            this.pendingRequests.set(id, {
                resolve: (resp) => { clearTimeout(timeout); resolve(resp); },
                reject: (err) => { clearTimeout(timeout); reject(err); }
            });

            this.ws!.send(JSON.stringify(req));
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectedPort = null;
        this.pendingRequests.clear();
    }

    /** Full reset - clears all state including expected instance */
    reset() {
        this.disconnect();
        this.expectedGameDir = null;
        this.lastSessionInfo = null;
        this.autoScan = true;
    }

    get isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}

// Singleton session instance
export const bridgeSession = new BridgeSession();
