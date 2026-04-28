import { bridgeSession } from "./session.js";

export const mcGetEntityItemTextureTool = {
    name: "mc_get_entity_item_texture",
    description: `Render an item carried by another entity (slot is "mainhand",
"offhand", "head", "chest", "legs", or "feet") as a PNG you can see
directly. Pair with mc_nearby_entities to find ids.`,
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
            const r = resp.result as { base64Png: string; width: number; height: number; spriteName: string };
            return {
                content: [
                    { type: "image" as const, data: r.base64Png, mimeType: "image/png" },
                    { type: "text" as const, text: `${r.width}x${r.height} sprite=${r.spriteName}` },
                ],
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
