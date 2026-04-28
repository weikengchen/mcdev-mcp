import { bridgeSession } from "./session.js";

export const mcNearbyBlocksTool = {
    name: "mc_nearby_blocks",
    description: `Get nearby block-entities (signs, chests, banners, beacons, hoppers,
furnaces, skulls, etc.) — the blocks worth browsing for debugging. Plain
terrain (dirt, stone) is intentionally excluded.

Returns x, y, z, blockId (e.g. "minecraft:oak_sign"), type (Mojang class
name), and distance for each. Use mc_block_details to drill in.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            range: { type: "number", description: "Search radius in blocks. Default 16." },
            limit: { type: "number", description: "Max entries returned. Default 100." },
        },
        required: [],
    },

    handler: async (args: { range?: number; limit?: number }) => {
        try {
            const payload: Record<string, unknown> = {};
            if (args.range !== undefined) payload.range = args.range;
            if (args.limit !== undefined) payload.limit = args.limit;
            const resp = await bridgeSession.send("nearbyBlocks", payload);
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
