import { bridgeSession } from "./session.js";

export const mcBlockDetailsTool = {
    name: "mc_block_details",
    description: `Get details for the block-entity at (x, y, z): sign lines, chest
contents, banner patterns, skull profile, beacon level, etc.

Returns {gone: true} if there is no block-entity at that position (e.g.
plain terrain, or it was broken since the last mc_nearby_blocks call).`,
    inputSchema: {
        type: "object" as const,
        properties: {
            x: { type: "number" },
            y: { type: "number" },
            z: { type: "number" },
        },
        required: ["x", "y", "z"],
    },

    handler: async (args: { x: number; y: number; z: number }) => {
        try {
            const resp = await bridgeSession.send("blockDetails", { x: args.x, y: args.y, z: args.z });
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
