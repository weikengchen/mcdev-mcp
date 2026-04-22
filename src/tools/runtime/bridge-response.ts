import { BridgeResponse } from "./types.js";

export type McpTextResponse = {
    content: Array<{ type: "text"; text: string }>;
    isError?: true;
};

export function errorText(message: string): McpTextResponse {
    return { content: [{ type: "text", text: message }], isError: true };
}

export function bridgeError(resp: BridgeResponse): McpTextResponse {
    return errorText(`Error: ${resp.error ?? "Unknown DebugBridge error"}`);
}

export function exceptionText(error: unknown): McpTextResponse {
    const msg = error instanceof Error ? error.message : String(error);
    return errorText(msg);
}

export function jsonText(value: unknown): McpTextResponse {
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
