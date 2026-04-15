import { bridgeSession } from "./session.js";

export const mcLoggerTool = {
    name: "mc_logger",
    description: `Manage runtime method loggers for tracing Minecraft method calls.

Actions:
- "inject": Install a logger on a method (uses Java Agent instrumentation)
- "cancel": Remove an active logger by ID
- "list": Show all active loggers

For "inject", the logger captures method entry/exit, arguments, return values, and timing.
The output_file will be created on the machine running Minecraft.
Use the Read tool to view the log file.

Filter types (for inject):
- throttle: { "type": "throttle", "interval_ms": 200 }
- arg_contains: { "type": "arg_contains", "index": 0, "substring": "Player" }
- arg_instanceof: { "type": "arg_instanceof", "index": 0, "class_name": "Entity" }
- sample: { "type": "sample", "n": 10 }

IMPORTANT: This modifies bytecode at runtime. Avoid targeting hot-path methods.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            action: {
                type: "string",
                enum: ["inject", "cancel", "list"],
                description: "Action to perform",
            },
            // For inject
            method: {
                type: "string",
                description: "(inject) Fully qualified method name, e.g. 'net.minecraft.client.Minecraft.tick'",
            },
            duration_seconds: {
                type: "number",
                description: "(inject) How long the logger stays active. Default: 60s. Max: 1 hour.",
            },
            output_file: {
                type: "string",
                description: "(inject) Path to log file. Default: auto-generated in /tmp",
            },
            log_args: {
                type: "boolean",
                description: "(inject) Log method arguments. Default: true",
            },
            log_return: {
                type: "boolean",
                description: "(inject) Log return value. Default: false",
            },
            log_timing: {
                type: "boolean",
                description: "(inject) Log elapsed time. Default: true",
            },
            arg_depth: {
                type: "number",
                description: "(inject) Depth of argument inspection. 0=class@hash, 1+=toString(). Default: 1",
            },
            filter: {
                type: "object",
                description: "(inject) Optional filter to reduce log volume",
                properties: {
                    type: { type: "string", enum: ["throttle", "arg_contains", "arg_instanceof", "sample"] },
                    interval_ms: { type: "number" },
                    index: { type: "number" },
                    substring: { type: "string" },
                    class_name: { type: "string" },
                    n: { type: "number" },
                },
            },
            // For cancel
            id: {
                type: "number",
                description: "(cancel) Logger ID to cancel",
            },
        },
        required: ["action"],
    },

    handler: async (args: {
        action: "inject" | "cancel" | "list";
        method?: string;
        duration_seconds?: number;
        output_file?: string;
        log_args?: boolean;
        log_return?: boolean;
        log_timing?: boolean;
        arg_depth?: number;
        filter?: {
            type: "throttle" | "arg_contains" | "arg_instanceof" | "sample";
            interval_ms?: number;
            index?: number;
            substring?: string;
            class_name?: string;
            n?: number;
        };
        id?: number;
    }) => {
        try {
            if (args.action === "inject") {
                if (!args.method) {
                    return { content: [{ type: "text" as const, text: "Error: 'method' is required for inject action" }], isError: true };
                }
                const resp = await bridgeSession.send("injectLogger", {
                    method: args.method,
                    duration_seconds: args.duration_seconds ?? 60,
                    output_file: args.output_file ?? null,
                    log_args: args.log_args ?? true,
                    log_return: args.log_return ?? false,
                    log_timing: args.log_timing ?? true,
                    arg_depth: args.arg_depth ?? 1,
                    filter: args.filter ?? null,
                });
                if (!resp.success) {
                    return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
                }
                const result = resp.result as { logger_id: number; output_file: string; message?: string };
                let text = `Logger #${result.logger_id} installed on ${args.method}\n`;
                text += `Output: ${result.output_file}\n`;
                text += `Duration: ${args.duration_seconds ?? 60} seconds`;
                if (result.message) text += `\n${result.message}`;
                return { content: [{ type: "text" as const, text }] };
            }

            if (args.action === "cancel") {
                if (args.id === undefined) {
                    return { content: [{ type: "text" as const, text: "Error: 'id' is required for cancel action" }], isError: true };
                }
                const resp = await bridgeSession.send("cancelLogger", { id: args.id });
                if (!resp.success) {
                    return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
                }
                const result = resp.result as { cancelled: boolean };
                if (result.cancelled) {
                    return { content: [{ type: "text" as const, text: `Logger #${args.id} cancelled.` }] };
                } else {
                    return { content: [{ type: "text" as const, text: `Logger #${args.id} not found (may have already expired).` }] };
                }
            }

            if (args.action === "list") {
                const resp = await bridgeSession.send("listLoggers", {});
                if (!resp.success) {
                    return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
                }
                const result = resp.result as {
                    loggers: Array<{ id: number; method: string; remaining_ms: number; has_filter: boolean }>;
                    injected_methods: string[];
                };
                if (result.loggers.length === 0) {
                    let text = "No active loggers.";
                    if (result.injected_methods.length > 0) {
                        text += `\n\nMethods with advice installed (inactive): ${result.injected_methods.length}`;
                    }
                    return { content: [{ type: "text" as const, text }] };
                }
                let text = "Active loggers:\n";
                for (const logger of result.loggers) {
                    const remainingSec = Math.round(logger.remaining_ms / 1000);
                    text += `  #${logger.id}: ${logger.method} (${remainingSec}s remaining`;
                    if (logger.has_filter) text += ", filtered";
                    text += ")\n";
                }
                if (result.injected_methods.length > result.loggers.length) {
                    text += `\nMethods with advice installed: ${result.injected_methods.length}`;
                }
                return { content: [{ type: "text" as const, text: text.trim() }] };
            }

            return { content: [{ type: "text" as const, text: `Unknown action: ${args.action}` }], isError: true };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
