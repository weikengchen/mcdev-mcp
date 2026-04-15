import { bridgeSession } from "./session.js";

export const mcScreenshotTool = {
    name: "mc_screenshot",
    description: `Capture the current Minecraft client framebuffer as a JPEG file on the
machine running the mod, and return its absolute path. Use the Read tool
to view the image.

The capture runs on the render thread and pauses for at most one frame;
the game otherwise continues. Works while the game is paused (returns the
last rendered frame).

Defaults are tuned for low-bandwidth visual inspection: downscale=2,
quality=0.75. Override only if you specifically need higher fidelity.

The mod and the MCP server must run on the same machine for the returned
path to be readable here.`,
    inputSchema: {
        type: "object" as const,
        properties: {
            downscale: {
                type: "number",
                description: "Integer downscale factor. 1 = full window resolution. 2 = half each axis (default).",
            },
            quality: {
                type: "number",
                description: "JPEG quality in [0.05, 1.0]. Default: 0.75.",
            },
        },
        required: [],
    },

    handler: async (args: { downscale?: number; quality?: number }) => {
        try {
            const payload: Record<string, unknown> = {};
            if (args.downscale !== undefined) payload.downscale = args.downscale;
            if (args.quality !== undefined) payload.quality = args.quality;
            const resp = await bridgeSession.send("screenshot", payload);
            if (!resp.success) {
                return { content: [{ type: "text" as const, text: `Error: ${resp.error}` }], isError: true };
            }
            const result = resp.result as
                | { path: string; width: number; height: number; sizeBytes: number; mimeType: string }
                | undefined;
            if (!result || typeof result.path !== "string") {
                return { content: [{ type: "text" as const, text: "Screenshot returned no path." }], isError: true };
            }
            const kb = (result.sizeBytes / 1024).toFixed(1);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `${result.path}\n(${result.width}x${result.height} JPEG, ${kb} KB)`,
                    },
                ],
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text" as const, text: msg }], isError: true };
        }
    }
};
