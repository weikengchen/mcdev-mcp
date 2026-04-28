import { bridgeSession } from "./session.js";

export const mcSetBlockGlowTool = {
    name: "mc_set_block_glow",
    description: `Highlight a block in-world (yellow outline on 1.19, vanilla
test-highlight on 1.21.11) or remove the highlight. Useful for pointing a
specific sign / chest / etc. out to the user. Pair with mc_nearby_blocks
to find positions; use mc_clear_block_glow to clear all highlights at once.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
            glow: { type: "boolean", description: "true to highlight, false to remove this position." },
        },
        required: ["x", "y", "z", "glow"],
    },

    handler: async (args: { x: number; y: number; z: number; glow: boolean }) => {
        try {
            const resp = await bridgeSession.send("setBlockGlow", { x: args.x, y: args.y, z: args.z, glow: args.glow });
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
