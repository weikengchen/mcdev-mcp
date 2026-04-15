import { findCallers, findCallees } from '../../callgraph/query.js';
import { hasCallgraphDb } from '../../callgraph/index.js';
import { getEffectiveVersion } from './helpers.js';

export const mcFindRefsTool = {
  name: 'mc_find_refs',
  description: 'Find callers (who calls this method) or callees (what this method calls) using the callgraph database. Useful for understanding code dependencies.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class name (e.g., "net.minecraft.client.MinecraftClient")',
      },
      methodName: {
        type: 'string',
        description: 'Method name to find references for',
      },
      direction: {
        type: 'string',
        enum: ['callers', 'callees'],
        description: 'callers = who calls this method, callees = what this method calls',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['className', 'methodName', 'direction'],
  },

  handler: async (args: { className: string; methodName: string; direction: 'callers' | 'callees'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!hasCallgraphDb(version)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Version ${version} does not have callgraph data.

STOP and ask the USER to run this command in their terminal:
  node dist/cli.js callgraph -v ${version}

Or for full reinitialization:
  node dist/cli.js init -v ${version}`,
        }],
      };
    }

    const results = args.direction === 'callers'
      ? findCallers(version, args.className, args.methodName)
      : findCallees(version, args.className, args.methodName);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No ${args.direction} found for ${args.className}#${args.methodName}`,
        }],
      };
    }

    const output = results
      .slice(0, 100)
      .map(r => `${r.fullName}${r.lineNumber ? ` (line ${r.lineNumber})` : ''}`)
      .join('\n');

    const summary = results.length > 100
      ? `\n... and ${results.length - 100} more`
      : '';

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} ${args.direction}:\n${output}${summary}`,
      }],
    };
  },
};
