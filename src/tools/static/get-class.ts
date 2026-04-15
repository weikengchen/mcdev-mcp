import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcGetClassTool = {
  name: 'mc_get_class',
  description: 'Get the full decompiled source code for a Minecraft or Fabric API class. Also returns class hierarchy (extends, implements) and field/method signatures.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class name (e.g., "net.minecraft.client.MinecraftClient")',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['className'],
  },

  handler: async (args: { className: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const result = sourceStore.getClass(args.className);

    if (!result) {
      return {
        content: [{
          type: 'text' as const,
          text: `Class not found: ${args.className}`,
        }],
      };
    }

    const { info, source } = result;

    let header = `// Class: ${args.className}\n`;
    if (info.super) {
      header += `// Extends: ${info.super}\n`;
    }
    if (info.interfaces && info.interfaces.length > 0) {
      header += `// Implements: ${info.interfaces.join(', ')}\n`;
    }
    header += `// Fields: ${info.fields.length}\n`;
    header += `// Methods: ${info.methods.length}\n\n`;

    return {
      content: [{
        type: 'text' as const,
        text: header + source,
      }],
    };
  },
};
