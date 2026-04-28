import { bridgeSession } from "./session.js";

export const mcChatHistoryTool = {
    name: "mc_chat_history",
    description: `Get the most recent client-side chat messages — what the user has
seen in the chat overlay, including system messages and command output.

Prefer this over walking gui:getChat().allMessages from Lua (which costs
one bridge round-trip per field on each message). Returns {plain, addedTime}
per message, newest-first.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            limit: { type: "number", description: "Max messages returned. Default 50." },
        },
        required: [],
    },

    handler: async (args: { limit?: number }) => {
        try {
            const payload: Record<string, unknown> = {};
            if (args.limit !== undefined) payload.limit = args.limit;
            const resp = await bridgeSession.send("chatHistory", payload);
            if (!resp.success) {
                return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
            }
            return { content: [{ type: "text" as const, text: JSON.stringify(resp.result, null, 2) }] };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
