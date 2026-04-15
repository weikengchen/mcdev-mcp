import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcGetMethodTool = {
  name: 'mc_get_method',
  description: 'Get the source code for a specific method in a class, with surrounding context. Useful for understanding method implementation details.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class name (e.g., "net.minecraft.client.MinecraftClient")',
      },
      methodName: {
        type: 'string',
        description: 'Method name (e.g., "tick", "render", "onUse")',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['className', 'methodName'],
  },

  handler: async (args: { className: string; methodName: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const result = sourceStore.getMethod(args.className, args.methodName);

    if (!result) {
      return {
        content: [{
          type: 'text' as const,
          text: `Method "${args.methodName}" not found in class ${args.className}`,
        }],
      };
    }

    const { method, source, classInfo } = result;

    let header = `// Method: ${args.className}#${method.name}\n`;
    header += `// Signature: ${method.returnType} ${method.name}(${method.params.map(p => `${p.type} ${p.name}`).join(', ')})\n`;
    header += `// Modifiers: ${method.modifiers.join(' ')}\n`;
    header += `// Lines: ${method.lineStart}-${method.lineEnd}\n\n`;

    if (classInfo.super) {
      header += `// Class extends: ${classInfo.super}\n\n`;
    }

    return {
      content: [{
        type: 'text' as const,
        text: header + source,
      }],
    };
  },
};
