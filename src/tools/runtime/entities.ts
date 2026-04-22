import { bridgeSession } from "./session.js";
import { bridgeError, exceptionText, jsonText } from "./bridge-response.js";

export const mcNearbyEntitiesTool = {
    name: "mc_nearby_entities",
    description: `List nearby entities from the running Minecraft client through DebugBridge.
Returns entity ids, names, types, distance, position, and equipment summaries when available.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            range: {
                type: "number",
                description: "Search radius in blocks. Default: 64.",
            },
            limit: {
                type: "number",
                description: "Maximum number of entities to return. Default: 100.",
            },
        },
        required: [],
    },

    handler: async (args: { range?: number; limit?: number }) => {
        try {
            const resp = await bridgeSession.send("nearbyEntities", {
                range: args.range ?? 64,
                limit: args.limit ?? 100,
            });
            if (!resp.success) return bridgeError(resp);
            return jsonText(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};

export const mcEntityDetailsTool = {
    name: "mc_entity_details",
    description: `Fetch detailed DebugBridge data for one runtime entity id.
Use entity ids returned by mc_nearby_entities or mc_looked_at_entity.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: {
                type: "number",
                description: "Runtime entity id.",
            },
        },
        required: ["entityId"],
    },

    handler: async (args: { entityId: number }) => {
        try {
            const resp = await bridgeSession.send("entityDetails", { entityId: args.entityId });
            if (!resp.success) return bridgeError(resp);
            return jsonText(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};

export const mcLookedAtEntityTool = {
    name: "mc_looked_at_entity",
    description: `Return the runtime entity id currently under the player's crosshair, if any.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            range: {
                type: "number",
                description: "Maximum raycast/search range in blocks. Default: 64.",
            },
        },
        required: [],
    },

    handler: async (args: { range?: number }) => {
        try {
            const resp = await bridgeSession.send("lookedAtEntity", { range: args.range ?? 64 });
            if (!resp.success) return bridgeError(resp);
            return jsonText(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};

export const mcSetEntityGlowTool = {
    name: "mc_set_entity_glow",
    description: `Enable or disable the client-side glow outline for a runtime entity id.
This is visual-only and local to the client running DebugBridge.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: {
                type: "number",
                description: "Runtime entity id.",
            },
            glow: {
                type: "boolean",
                description: "true to enable glow, false to disable it.",
            },
        },
        required: ["entityId", "glow"],
    },

    handler: async (args: { entityId: number; glow: boolean }) => {
        try {
            const resp = await bridgeSession.send("setEntityGlow", {
                entityId: args.entityId,
                glow: args.glow,
            });
            if (!resp.success) return bridgeError(resp);
            return jsonText(resp.result);
        } catch (e: unknown) {
            return exceptionText(e);
        }
    },
};
