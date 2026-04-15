import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcListClassesTool = {
  name: 'mc_list_classes',
  description: 'List all classes under a specific package path. Returns class names and their source locations. Use this to discover classes in a package hierarchy.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      packagePath: {
        type: 'string',
        description: 'Package path to list classes from (e.g., "net.minecraft.client", "net.minecraft.world.entity"). Matches exact package and all subpackages.',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['packagePath'],
  },

  handler: async (args: { packagePath: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const results = sourceStore.listClasses(args.packagePath);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No classes found under package "${args.packagePath}"`,
        }],
      };
    }

    const summary = results.length > 200
      ? `\n... and ${results.length - 200} more (total: ${results.length})`
      : `\nTotal: ${results.length} class(es)`;

    return {
      content: [{
        type: 'text' as const,
        text: `Classes under "${args.packagePath}":\n${results.slice(0, 200).map(r => r.className).join('\n')}${summary}`,
      }],
    };
  },
};
