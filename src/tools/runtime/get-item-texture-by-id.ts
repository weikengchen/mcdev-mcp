import { bridgeSession } from "./session.js";

export const mcGetItemTextureByIdTool = {
    name: "mc_get_item_texture_by_id",
    description: `Render the default texture for an item registry id (e.g.
"minecraft:diamond_pickaxe"). Returns {base64Png, width, height,
spriteName}. No inventory slot required.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            itemId: { type: "string", description: "Registry id like \"minecraft:diamond\"." },
        },
        required: ["itemId"],
    },

    handler: async (args: { itemId: string }) => {
        try {
            const resp = await bridgeSession.send("getItemTextureById", { itemId: args.itemId });
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
