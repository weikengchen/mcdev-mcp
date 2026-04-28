import { bridgeSession } from "./session.js";

export const mcEntityDetailsTool = {
    name: "mc_entity_details",
    description: `Get full details for one entity by id (the id field returned by
mc_nearby_entities). Includes equipment slots with damage and custom names,
mounted vehicle, passengers, attributes, and frame contents where applicable.

Returns {gone: true} if the entity has despawned or its chunk has unloaded.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: { type: "number", description: "Entity id from mc_nearby_entities or mc_looked_at_entity." },
        },
        required: ["entityId"],
    },

    handler: async (args: { entityId: number }) => {
        try {
            const resp = await bridgeSession.send("entityDetails", { entityId: args.entityId });
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
