import { bridgeSession } from "./session.js";
import { bridgeError, exceptionText, jsonText, McpTextResponse } from "./bridge-response.js";

type TextureResult = {
    base64Png: string;
    width: number;
    height: number;
    spriteName: string;
};

function formatTexture(result: unknown): McpTextResponse {
    const texture = result as TextureResult | undefined;
    if (!texture || typeof texture.base64Png !== "string") {
        return { content: [{ type: "text", text: "Texture endpoint returned no PNG data." }], isError: true };
    }

    return jsonText({
        ...texture,
        dataUri: `data:image/png;base64,${texture.base64Png}`,
    });
}

export const mcGetItemTextureTool = {
    name: "mc_get_item_texture",
    description: `Render an inventory slot item through DebugBridge and return PNG data.
Use this for visual inspection of the player's inventory. The returned
base64Png field is raw PNG bytes; dataUri is ready to embed in HTML.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            slot: {
                type: "number",
                description: "Inventory slot index to render.",
            },
        },
        required: ["slot"],
    },

    handler: async (args: { slot: number }) => {
        try {
            const resp = await bridgeSession.send("getItemTexture", { slot: args.slot });
            if (!resp.success) return bridgeError(resp);
            return formatTexture(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};

export const mcGetItemTextureByIdTool = {
    name: "mc_get_item_texture_by_id",
    description: `Render an item by registry id through DebugBridge and return PNG data.
Useful when an entity or inventory payload contains an item id but no slot.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            itemId: {
                type: "string",
                description: "Item registry id, e.g. minecraft:diamond_sword.",
            },
        },
        required: ["itemId"],
    },

    handler: async (args: { itemId: string }) => {
        try {
            const resp = await bridgeSession.send("getItemTextureById", { itemId: args.itemId });
            if (!resp.success) return bridgeError(resp);
            return formatTexture(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};

export const mcGetEntityItemTextureTool = {
    name: "mc_get_entity_item_texture",
    description: `Render an equipped item from an entity by runtime entity id and equipment slot.
Typical slots are mainhand, offhand, head, chest, legs, and feet.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: {
                type: "number",
                description: "Runtime entity id from mc_nearby_entities or mc_looked_at_entity.",
            },
            slot: {
                type: "string",
                description: "Equipment slot name: mainhand, offhand, head, chest, legs, or feet.",
            },
        },
        required: ["entityId", "slot"],
    },

    handler: async (args: { entityId: number; slot: string }) => {
        try {
            const resp = await bridgeSession.send("getEntityItemTexture", {
                entityId: args.entityId,
                slot: args.slot,
            });
            if (!resp.success) return bridgeError(resp);
            return formatTexture(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};
