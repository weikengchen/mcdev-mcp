import { bridgeSession } from "./session.js";

export const mcGetEntityItemTextureTool = {
    name: "mc_get_entity_item_texture",
    description: `Render an item carried by another entity (slot is "mainhand",
"offhand", "head", "chest", "legs", or "feet"). Returns {base64Png, width,
height, spriteName}. Pair with mc_nearby_entities to find ids.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: { type: "number" },
            slot: {
                type: "string",
                enum: ["mainhand", "offhand", "head", "chest", "legs", "feet"],
            },
        },
        required: ["entityId", "slot"],
    },

    handler: async (args: { entityId: number; slot: string }) => {
        try {
            const resp = await bridgeSession.send("getEntityItemTexture", { entityId: args.entityId, slot: args.slot });
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
