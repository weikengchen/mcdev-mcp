import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcSearchTool = {
  name: 'mc_search',
  description: 'Search decompiled Minecraft or Fabric API source code for classes, methods, or fields by name pattern. Returns matching results with their full names and source locations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query - class, method, or field name (or partial name)',
      },
      type: {
        type: 'string',
        enum: ['class', 'method', 'field'],
        description: 'Optional: filter by type (class, method, or field)',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['query'],
  },

  handler: async (args: { query: string; type?: 'class' | 'method' | 'field'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

    const results = sourceStore.search(args.query, args.type);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No results found for "${args.query}"${args.type ? ` (type: ${args.type})` : ''}`,
        }],
      };
    }

    const output = results.map(r => {
      if (r.type === 'class') {
        return `[class] ${r.className}`;
      } else if (r.type === 'method') {
        return `[method] ${r.className}#${r.name}${r.signature ? `: ${r.signature}` : ''} (line ${r.lineStart})`;
      } else {
        return `[field] ${r.className}#${r.name}${r.signature ? `: ${r.signature}` : ''}`;
      }
    }).join('\n');

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} result(s):\n${output}`,
      }],
    };
  },
};
