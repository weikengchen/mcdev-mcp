import { bridgeSession } from "./session.js";

export const mcRunCommandTool = {
    name: "mc_run_command",
    description: `Execute a Minecraft slash command (e.g., "/give @s minecraft:diamond 64").
The leading "/" is optional.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            command: {
                type: "string",
                description: "The command to run",
            },
        },
        required: ["command"],
    },

    handler: async (args: { command: string }) => {
        try {
            const cmd = args.command.startsWith("/") ? args.command.substring(1) : args.command;
            const resp = await bridgeSession.send("runCommand", { command: cmd });
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
