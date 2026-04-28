import { bridgeSession } from "./session.js";

export const mcNearbyEntitiesTool = {
    name: "mc_nearby_entities",
    description: `Get nearby entities in the world (mobs, items, projectiles, players, etc.).
Returns id, type (Mojang class name), position, and distance for each.

Prefer this over iterating entities via mc_execute — the per-call Java<->Lua
bridge cost makes hand-rolled loops time out at ~100 entities. Use
mc_entity_details to drill into a specific entity by id.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            range: { type: "number", description: "Search radius in blocks. Default 64." },
            limit: { type: "number", description: "Max entries returned. Default 100." },
        },
        required: [],
    },

    handler: async (args: { range?: number; limit?: number }) => {
        try {
            const payload: Record<string, unknown> = {};
            if (args.range !== undefined) payload.range = args.range;
            if (args.limit !== undefined) payload.limit = args.limit;
            const resp = await bridgeSession.send("nearbyEntities", payload);
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
