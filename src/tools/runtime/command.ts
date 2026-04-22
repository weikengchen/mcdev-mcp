import { bridgeSession } from "./session.js";

function luaString(value: string): string {
    return JSON.stringify(value)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function commandFallbackLua(command: string): string {
    const quoted = luaString(command);
    return [
        "local mc = java.import('net.minecraft.client.Minecraft'):getInstance()",
        "local player = mc.player",
        "if player == nil then error('Player not available') end",
        "local ok, connection = pcall(function() return player.connection end)",
        "if (not ok) or connection == nil then",
        "  ok, connection = pcall(function() return player:connection() end)",
        "end",
        "if (not ok) or connection == nil then error('Player connection not available') end",
        `connection:sendCommand(${quoted})`,
        `return 'Command sent: ' .. ${quoted}`,
    ].join("\n");
}

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
                const fallback = await bridgeSession.send("execute", { code: commandFallbackLua(cmd) });
                if (!fallback.success) {
                    const first = resp.error ?? "unknown runCommand error";
                    const second = fallback.error ?? "unknown execute fallback error";
                    return {
                        content: [{ type: "text" as const, text: `Error: ${first}; fallback failed: ${second}` }],
                        isError: true,
                    };
                }
                return { content: [{ type: "text" as const, text: JSON.stringify(fallback.result, null, 2) }] };
            }
            return { content: [{ type: "text" as const, text: JSON.stringify(resp.result, null, 2) }] };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
