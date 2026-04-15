import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcListPackagesTool = {
  name: 'mc_list_packages',
  description: 'List all available packages. Optionally filter by namespace (minecraft or fabric). Use this to discover package structure.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      namespace: {
        type: 'string',
        enum: ['minecraft', 'fabric'],
        description: 'Optional: filter by namespace (minecraft or fabric)',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: [],
  },

  handler: async (args: { namespace?: 'minecraft' | 'fabric'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const results = sourceStore.listPackages(args.namespace);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No packages found',
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} package(s):\n${results.join('\n')}`,
      }],
    };
  },
};
