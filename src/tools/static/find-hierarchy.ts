import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcFindHierarchyTool = {
  name: 'mc_find_hierarchy',
  description: 'Find classes that extend (subclasses) or implement (implementors) a given class or interface. Useful for understanding class inheritance relationships.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class or interface name (e.g., "net.minecraft.world.entity.Entity", "net.minecraft.world.item.Item")',
      },
      direction: {
        type: 'string',
        enum: ['subclasses', 'implementors'],
        description: 'subclasses = classes that extend this class, implementors = classes that implement this interface',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['className', 'direction'],
  },

  handler: async (args: { className: string; direction: 'subclasses' | 'implementors'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const results = sourceStore.findHierarchy(args.className, args.direction);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No ${args.direction} found for ${args.className}`,
        }],
      };
    }

    const output = results
      .slice(0, 200)
      .map(r => r.className)
      .join('\n');

    const summary = results.length > 200
      ? `\n... and ${results.length - 200} more (total: ${results.length})`
      : `\nTotal: ${results.length} ${args.direction}`;

    return {
      content: [{
        type: 'text' as const,
        text: `${args.direction === 'subclasses' ? 'Subclasses' : 'Implementors'} of ${args.className}:\n${output}${summary}`,
      }],
    };
  },
};
