import { bridgeSession } from "./session.js";

export const mcLookedAtEntityTool = {
    name: "mc_looked_at_entity",
    description: `Returns the entity id the player is currently aiming at, or null if
none is within range. Useful for "what is that thing?" questions where the
user gestures at an entity in the world. Pair with mc_entity_details.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            range: { type: "number", description: "Raycast distance in blocks. Default 64." },
        },
        required: [],
    },

    handler: async (args: { range?: number }) => {
        try {
            const payload: Record<string, unknown> = {};
            if (args.range !== undefined) payload.range = args.range;
            const resp = await bridgeSession.send("lookedAtEntity", payload);
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
