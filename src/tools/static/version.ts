import { versionManager } from '../../version-manager.js';
import { sourceStore } from '../../storage/index.js';
import { hasCallgraphDb } from '../../callgraph/index.js';
import {
  getAvailableMinecraftVersions,
  getIndexedVersions,
  isVersionIndexed,
  getMinecraftSourceDir
} from '../../utils/paths.js';
import * as fs from 'fs';

export const mcVersionTool = {
  name: 'mc_version',
  description: `Manage Minecraft versions for static analysis tools.

Actions:
- "set": Set the active version (required before using other static tools)
- "list": Show all initialized versions and their status`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['set', 'list'],
        description: 'Action to perform',
      },
      version: {
        type: 'string',
        description: '(set) Minecraft version to activate (e.g., "1.21.11")',
      },
    },
    required: ['action'],
  },

  handler: async (args: { action: 'set' | 'list'; version?: string }) => {
    if (args.action === 'set') {
      if (!args.version) {
        return {
          content: [{
            type: 'text' as const,
            text: "Error: 'version' is required for set action",
          }],
          isError: true,
        };
      }

      const sourceDir = getMinecraftSourceDir(args.version);
      if (!fs.existsSync(sourceDir)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Version ${args.version} not initialized.

STOP and ask the USER to run this command in their terminal:
  npx mcdev-mcp init -v ${args.version}

This will download, decompile, and index Minecraft ${args.version} sources.`,
          }],
        };
      }

      if (!isVersionIndexed(args.version)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Version ${args.version} not indexed.

STOP and ask the USER to run this command in their terminal:
  npx mcdev-mcp init -v ${args.version}

This will index Minecraft ${args.version} sources.`,
          }],
        };
      }

      versionManager.setVersion(args.version);
      sourceStore.setVersion(args.version);

      const hasCallgraph = hasCallgraphDb(args.version);

      return {
        content: [{
          type: 'text' as const,
          text: `Active version set to ${args.version}.\nIndexed: yes\nCallgraph: ${hasCallgraph ? 'yes' : 'no'}`,
        }],
      };
    }

    if (args.action === 'list') {
      const cachedVersions = getAvailableMinecraftVersions();
      const indexedVersions = getIndexedVersions();

      if (cachedVersions.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No Minecraft versions found.

Run this command to initialize a version:
  npx mcdev-mcp init -v <version>

Example:
  npx mcdev-mcp init -v 1.21.11`,
          }],
        };
      }

      const versions = cachedVersions.map(v => ({
        version: v,
        decompiled: true,
        indexed: indexedVersions.includes(v),
        callgraph: hasCallgraphDb(v),
      }));

      const output = versions.map(v => {
        const status = [];
        status.push(v.decompiled ? 'decompiled' : 'not decompiled');
        status.push(v.indexed ? 'indexed' : 'not indexed');
        status.push(v.callgraph ? 'callgraph' : 'no callgraph');
        return `${v.version}: ${status.join(', ')}`;
      }).join('\n');

      const activeVersion = versionManager.getVersion();

      return {
        content: [{
          type: 'text' as const,
          text: `Available Minecraft versions:\n${output}${activeVersion ? `\n\nActive version: ${activeVersion}` : '\n\nNo active version set. Use mc_version with action="set".'}`,
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `Unknown action: ${args.action}`,
      }],
      isError: true,
    };
  },
};
