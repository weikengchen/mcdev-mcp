import { bridgeSession } from "./session.js";

export const mcClearBlockGlowTool = {
    name: "mc_clear_block_glow",
    description: `Clear all block highlights set via mc_set_block_glow.`,
    inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
    },

    handler: async () => {
        try {
            const resp = await bridgeSession.send("clearBlockGlow", {});
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
