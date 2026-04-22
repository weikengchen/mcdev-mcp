import { bridgeSession } from "./session.js";
import { bridgeError, exceptionText, jsonText } from "./bridge-response.js";

type RuntimeSearchScope = "all" | "class" | "method" | "field";

export const mcSearchRuntimeTool = {
    name: "mc_search_runtime",
    description: `Search DebugBridge's live runtime mapping resolver for classes, methods, or fields.
This is useful while connected to a running client, especially for passthrough
unobfuscated snapshots where runtime Mojang names are available directly.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            pattern: {
                type: "string",
                description: "Case-insensitive regular expression to search for.",
            },
            scope: {
                type: "string",
                enum: ["all", "class", "method", "field"],
                description: "Symbol scope to search. Default: all.",
            },
        },
        required: ["pattern"],
    },

    handler: async (args: { pattern: string; scope?: RuntimeSearchScope }) => {
        try {
            const payload: Record<string, unknown> = { pattern: args.pattern };
            if (args.scope !== undefined) payload.scope = args.scope;
            const resp = await bridgeSession.send("search", payload);
            if (!resp.success) return bridgeError(resp);
            return jsonText(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};
