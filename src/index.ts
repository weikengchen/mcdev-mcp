#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';

export async function startServer(): Promise<void> {
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

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
      return {
        content: [{
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcdev-mcp server started');
}

// Invoked directly (e.g. `node dist/index.js` from the MCPB desktop extension).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
