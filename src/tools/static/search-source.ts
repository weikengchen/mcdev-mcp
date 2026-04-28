import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';

export const mcSearchTool = {
  name: 'mc_search',
  description: `Search decompiled Minecraft or Fabric API source code for classes, methods, or fields by name pattern.

Each hit returns enough context to make follow-up mc_get_class / mc_get_method
calls unnecessary in trivial cases:
- class hits: kind (class/interface/record/enum), extends, implements, field/method counts
- method hits: full signature including modifiers (public/static/etc.) plus line number
- field hits: full declaration including modifiers and type

Pass type="class"/"method"/"field" to filter; defaults to all three.`,
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
        const ext = r.superClass ? ` extends ${r.superClass}` : '';
        const impl = r.interfaces && r.interfaces.length
          ? ` implements ${r.interfaces.slice(0, 3).join(', ')}${r.interfaces.length > 3 ? ` (+${r.interfaces.length - 3})` : ''}`
          : '';
        const counts = `(${r.fieldCount ?? 0} fields, ${r.methodCount ?? 0} methods)`;
        return `[${r.kind ?? 'class'}] ${r.className}${ext}${impl} ${counts}`;
      } else if (r.type === 'method') {
        const mods = r.modifiers?.length ? r.modifiers.join(' ') + ' ' : '';
        return `[method] ${r.className}#${r.name}: ${mods}${r.signature ?? r.name} (line ${r.lineStart})`;
      } else {
        const mods = r.modifiers?.length ? r.modifiers.join(' ') + ' ' : '';
        return `[field] ${r.className}#${r.name}: ${mods}${r.signature ?? r.name}`;
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
