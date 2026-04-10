#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';

import * as fsForDbg from 'fs';

// Opt-in debug log file. See src/mcpb-bootstrap.ts for the full rationale.
// MCDEV_MCP_DEBUG_LOG:
//   unset / empty / "off" → disabled (default)
//   "on"                  → /tmp/mcdev-debug.log
//   any other value       → used as the log file path
const DBG_LOG_PATH = (() => {
  const override = process.env.MCDEV_MCP_DEBUG_LOG;
  if (!override || override === 'off') return null;
  if (override === 'on') return '/tmp/mcdev-debug.log';
  return override;
})();

function dbg(msg: string): void {
  if (!DBG_LOG_PATH) return;
  // File-only: stderr.write triggers EPIPE under the Claude Desktop MCPB host.
  const stamped = `[${new Date().toISOString()}] [mcdev-mcp server] ${msg}`;
  try { fsForDbg.appendFileSync(DBG_LOG_PATH, stamped + '\n'); } catch {}
}

export async function startServer(): Promise<void> {
  dbg('startServer: constructing Server');
  const server = new Server(
    {
      name: 'mcdev-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  dbg('startServer: registering ListTools handler');
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    dbg('ListTools request received');
    return {
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  dbg('startServer: registering CallTool handler');
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    dbg(`CallTool request: ${name}`);

    const tool = allTools.find(t => t.name === name);

    if (!tool) {
      return {
        content: [{
          type: 'text',
          text: `Unknown tool: ${name}`,
        }],
        isError: true,
      };
    }

    try {
      return await tool.handler(args as any || {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      dbg(`CallTool ${name} threw: ${errorMessage}`);
      return {
        content: [{
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        }],
        isError: true,
      };
    }
  });

  dbg('startServer: creating StdioServerTransport');
  const transport = new StdioServerTransport();
  dbg('startServer: awaiting server.connect(transport)');
  await server.connect(transport);
  dbg('startServer: connected, ready for requests');
}

// Invoked directly (e.g. `node dist/index.js` from the MCPB desktop extension).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
