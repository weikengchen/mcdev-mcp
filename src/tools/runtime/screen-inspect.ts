import { bridgeSession } from "./session.js";

export const mcScreenInspectTool = {
    name: "mc_screen_inspect",
    description: `Snapshot the screen the player currently has open. Returns
{open: false} if no screen is displayed; otherwise {open, type, title, ...}.

For container screens (chests, anvils, brewing stands, etc.) also returns
{menuClass, slots: [{idx, container, item:{itemId, count, damage, maxDamage,
name}}]} in a single native pass — avoids the per-call Java<->Lua bridge
cost that times out when iterating slots from Lua.`,
    inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
    },

    handler: async () => {
        try {
            const resp = await bridgeSession.send("screenInspect", {});
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
