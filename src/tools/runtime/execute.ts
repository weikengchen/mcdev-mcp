import { bridgeSession } from "./session.js";
import { scriptLogger } from "./script-logger.js";

const scriptLogsEnabled = /^(1|true)$/i.test(process.env.MCDEV_SCRIPT_LOGS ?? '');

export const mcExecuteTool = {
    name: "mc_execute",
    description: `Execute Lua code in the Minecraft session. The Lua environment is persistent - variables and functions defined in earlier calls remain available.

PREFER NATIVE TOOLS WHERE POSSIBLE — they're 10x+ faster and don't time out:
- Player state (x/y/z/yaw/pitch/look/velocity/vehicle/raycast target/world): mc_snapshot
- Nearby entities or one entity's details: mc_nearby_entities / mc_entity_details
- Nearby block entities (signs, chests, etc.): mc_nearby_blocks / mc_block_details
- Open screen / inventory contents: mc_screen_inspect
- Recent chat: mc_chat_history
- Item textures: mc_get_item_texture (by slot or by id)
Reach for mc_execute when you need to explore the Java API or do something
the native tools don't cover. Iterating ~100+ entities or slots in Lua will
time out (per-call Java<->Lua bridge cost).

The "java" global table provides:
- java.import(className) - import a Minecraft class by Mojang name
- java.new(class, args...) - create an instance
- java.typeof(obj) - get the Mojang class name
- java.cast(obj, className) - view object as a different type
- java.iter(iterable) - iterate over Java collections (works on JPMS-private types like HashMap.keySet())
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
