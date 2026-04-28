import { bridgeSession } from "./session.js";

export const mcGetItemTextureTool = {
    name: "mc_get_item_texture",
    description: `Render the item in the player's inventory slot N to a base64 PNG.
Honors damage / CustomModelData resource-pack overrides on 1.21.11; falls
back to the baked sprite on 1.19. Returns {base64Png, width, height,
spriteName}. Useful for showing the user what an unfamiliar item looks like.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            slot: { type: "number", description: "Inventory slot index (0-35 main inv, 36-39 armor, 40 offhand)." },
        },
        required: ["slot"],
    },

    handler: async (args: { slot: number }) => {
        try {
            const resp = await bridgeSession.send("getItemTexture", { slot: args.slot });
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
