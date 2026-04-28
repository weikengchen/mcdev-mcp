import { bridgeSession } from "./session.js";

export const mcSetEntityGlowTool = {
    name: "mc_set_entity_glow",
    description: `Make an entity render with the team-color outline so the user can
spot it in-world (or remove the outline). Client-side only — no server
authority needed. Pair with mc_nearby_entities to find ids.

Glow may "stick" to a stale id if the entity's chunk unloads; harmless.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            entityId: { type: "number", description: "Entity id from mc_nearby_entities." },
            glow: { type: "boolean", description: "true to outline, false to remove." },
        },
        required: ["entityId", "glow"],
    },

    handler: async (args: { entityId: number; glow: boolean }) => {
        try {
            const resp = await bridgeSession.send("setEntityGlow", { entityId: args.entityId, glow: args.glow });
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
