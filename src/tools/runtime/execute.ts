import { bridgeSession } from "./session.js";
import { scriptLogger } from "./script-logger.js";

const scriptLogsEnabled = process.env.MCDEV_SCRIPT_LOGS === '1';

export const mcExecuteTool = {
    name: "mc_execute",
    description: `Execute Lua code in the Minecraft session. The Lua environment is persistent - variables and functions defined in earlier calls remain available.

The "java" global table provides:
- java.import(className) - import a Minecraft class by Mojang name
- java.new(class, args...) - create an instance
- java.typeof(obj) - get the Mojang class name
- java.cast(obj, className) - view object as a different type
- java.iter(iterable) - iterate over Java collections
- java.array(collection) - convert to a Lua table
- java.isNull(obj) - null check
- java.ref(refId) - retrieve a stored object reference

Reflection helpers for exploring API:
- java.describe(obj) - full dump: class, fields, methods, supers
- java.methods(obj, [filter]) - list methods (optional name filter)
- java.fields(obj, [filter]) - list fields (optional name filter)
- java.supers(obj) - class hierarchy and interfaces
- java.find(pattern, [scope]) - search mappings for classes/methods/fields

Java objects support field access (obj.fieldName) and method calls (obj:methodName(args)).
All names use Mojang-mapped names, regardless of Minecraft version.
Use "return <value>" to get a value back. Use print() for debug output.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            code: {
                type: "string",
                description: "Lua code to execute",
            },
        },
        required: ["code"],
    },

    handler: async (args: { code: string }) => {
        const startTime = Date.now();
        try {
            const resp = await bridgeSession.send("execute", { code: args.code });
            const duration_ms = Date.now() - startTime;

            // Log the execution (dev mode only)
            if (scriptLogsEnabled) {
                scriptLogger.log({
                    timestamp: new Date().toISOString(),
                    success: resp.success,
                    code: args.code,
                    result: resp.result,
                    output: resp.output,
                    error: resp.error,
                    duration_ms,
                });

                // Periodically rotate logs
                if (Math.random() < 0.01) {
                    scriptLogger.rotateIfNeeded();
                }
            }

            if (!resp.success) {
                return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
            }
            let text = "";
            if (resp.output) text += resp.output + "\n";
            if (resp.result) text += JSON.stringify(resp.result, null, 2);
            return { content: [{ type: "text" as const, text: text.trim() || "(no output)" }] };
        } catch (e: unknown) {
            const duration_ms = Date.now() - startTime;
            const msg = e instanceof Error ? e.message : String(e);

            // Log connection/timeout errors too (dev mode only)
            if (scriptLogsEnabled) {
                scriptLogger.log({
                    timestamp: new Date().toISOString(),
                    success: false,
                    code: args.code,
                    error: msg,
                    duration_ms,
                });
            }

            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
