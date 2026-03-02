import { sourceStore } from '../storage/index.js';
import { versionManager } from '../version-manager.js';
import { findCallers, findCallees } from '../callgraph/query.js';
import { hasCallgraphDb } from '../callgraph/index.js';
import {
  getAvailableMinecraftVersions,
  getIndexedVersions,
  isVersionIndexed,
  getMinecraftSourceDir
} from '../utils/paths.js';
import * as fs from 'fs';

function getEffectiveVersion(explicitVersion?: string): { version: string; error?: string } {
  if (explicitVersion) {
    const sourceDir = getMinecraftSourceDir(explicitVersion);
    if (!fs.existsSync(sourceDir)) {
      return {
        version: '',
        error: `Version ${explicitVersion} not initialized. STOP and ask the USER to run this command in their terminal:\n  node dist/cli.js init -v ${explicitVersion}\n\nThis will download, decompile, and index Minecraft ${explicitVersion} sources (including callgraph).`
      };
    }
    if (!isVersionIndexed(explicitVersion)) {
      return {
        version: '',
        error: `Version ${explicitVersion} not indexed. STOP and ask the USER to run this command in their terminal:\n  node dist/cli.js init -v ${explicitVersion}\n\nThis will index Minecraft ${explicitVersion} sources (including callgraph).`
      };
    }
    return { version: explicitVersion };
  }

  const activeVersion = versionManager.getVersion();
  if (!activeVersion) {
    return {
      version: '',
      error: `No Minecraft version is currently set.

STOP and ask the USER which version they want to use, then call mc_set_version.
Or, provide a 'version' parameter in your tool call.

To see available versions, use mc_list_versions.`
    };
  }

  return { version: activeVersion };
}

function ensureVersionSet(): string | null {
  const activeVersion = versionManager.getVersion();
  if (!activeVersion) {
    return null;
  }
  if (!sourceStore.getVersion() || sourceStore.getVersion() !== activeVersion) {
    sourceStore.setVersion(activeVersion);
  }
  return activeVersion;
}

export const mcSetVersionTool = {
  name: 'mc_set_version',
  description: 'Set the active Minecraft version for subsequent operations. Must be called before using other tools, or provide a version parameter to each tool call.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      version: {
        type: 'string',
        description: 'Minecraft version (e.g., "1.21.1")',
      },
    },
    required: ['version'],
  },

  handler: async (args: { version: string }) => {
    const sourceDir = getMinecraftSourceDir(args.version);
    if (!fs.existsSync(sourceDir)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Version ${args.version} not initialized.

STOP and ask the USER to run this command in their terminal:
  node dist/cli.js init -v ${args.version}

This will download, decompile, and index Minecraft ${args.version} sources (including callgraph).`,
        }],
      };
    }

    if (!isVersionIndexed(args.version)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Version ${args.version} not indexed.

STOP and ask the USER to run this command in their terminal:
  node dist/cli.js init -v ${args.version}

This will index Minecraft ${args.version} sources (including callgraph).`,
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
  },
};

export const mcListVersionsTool = {
  name: 'mc_list_versions',
  description: 'List all available Minecraft versions and their initialization status. Use this to see which versions are ready to use.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },

  handler: async () => {
    const cachedVersions = getAvailableMinecraftVersions();
    const indexedVersions = getIndexedVersions();

    if (cachedVersions.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No Minecraft versions found.

Run this command to initialize a version:
  node dist/cli.js init -v <version>

Example:
  node dist/cli.js init -v 1.21.1`,
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
        text: `Available Minecraft versions:\n${output}${activeVersion ? `\n\nActive version: ${activeVersion}` : '\n\nNo active version set. Use mc_set_version to set one.'}`,
      }],
    };
  },
};

export const mcSearchTool = {
  name: 'mc_search',
  description: 'Search for Minecraft or Fabric API classes, methods, or fields by name pattern. Returns matching results with their full names and source locations.',
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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: ['query'],
  },

  handler: async (args: { query: string; type?: 'class' | 'method' | 'field'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

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

export const mcGetClassTool = {
  name: 'mc_get_class',
  description: 'Get the full decompiled source code for a Minecraft or Fabric API class. Also returns class hierarchy (extends, implements) and field/method signatures.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class name (e.g., "net.minecraft.client.MinecraftClient")',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: ['className'],
  },

  handler: async (args: { className: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

    const result = sourceStore.getClass(args.className);

    if (!result) {
      return {
        content: [{
          type: 'text' as const,
          text: `Class not found: ${args.className}`,
        }],
      };
    }

    const { info, source } = result;

    let header = `// Class: ${args.className}\n`;
    if (info.super) {
      header += `// Extends: ${info.super}\n`;
    }
    if (info.interfaces && info.interfaces.length > 0) {
      header += `// Implements: ${info.interfaces.join(', ')}\n`;
    }
    header += `// Fields: ${info.fields.length}\n`;
    header += `// Methods: ${info.methods.length}\n\n`;

    return {
      content: [{
        type: 'text' as const,
        text: header + source,
      }],
    };
  },
};

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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: ['className', 'methodName'],
  },

  handler: async (args: { className: string; methodName: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: ['packagePath'],
  },

  handler: async (args: { packagePath: string; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: [],
  },

  handler: async (args: { namespace?: 'minecraft' | 'fabric'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
      },
    },
    required: ['className', 'direction'],
  },

  handler: async (args: { className: string; direction: 'subclasses' | 'implementors'; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
      sourceStore.setVersion(version);
    }

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
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_set_version.',
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

export const allTools = [
  mcSetVersionTool,
  mcListVersionsTool,
  mcSearchTool,
  mcGetClassTool,
  mcGetMethodTool,
  mcFindRefsTool,
  mcListClassesTool,
  mcListPackagesTool,
  mcFindHierarchyTool,
];
