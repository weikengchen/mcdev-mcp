import { ensureDecompiled } from '../decompiler/index.js';
import { buildIndex } from '../indexer/index.js';
import { sourceStore } from '../storage/index.js';
import { findCallers, findCallees } from '../callgraph/query.js';
import { hasCallgraphDb } from '../callgraph/index.js';

const DEFAULT_MC_VERSION = '1.21.11';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (isInitialized && sourceStore.isReady()) return;
  
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const progressCb = (stage: string, progress: number, message: string) => {
      console.error(`[${stage}] ${progress}% - ${message}`);
    };
    
    const result = await ensureDecompiled(DEFAULT_MC_VERSION, progressCb);
    
    if (!sourceStore.isReady()) {
      await buildIndex({
        minecraftSourceDir: result.minecraftDir,
        fabricApiSourceDir: result.fabricDir,
        minecraftVersion: DEFAULT_MC_VERSION,
        fabricApiVersion: result.fabricVersion,
        progressCb,
      });
    }
    
    isInitialized = true;
  })();
  
  return initPromise;
}

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
    },
    required: ['query'],
  },
  
  handler: async (args: { query: string; type?: 'class' | 'method' | 'field' }) => {
    await ensureInitialized();
    
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
    },
    required: ['className'],
  },
  
  handler: async (args: { className: string }) => {
    await ensureInitialized();
    
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
    },
    required: ['className', 'methodName'],
  },
  
  handler: async (args: { className: string; methodName: string }) => {
    await ensureInitialized();
    
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
    },
    required: ['className', 'methodName', 'direction'],
  },
  
  handler: async (args: { className: string; methodName: string; direction: 'callers' | 'callees' }) => {
    await ensureInitialized();
    
    if (!hasCallgraphDb(DEFAULT_MC_VERSION)) {
      return {
        content: [{
          type: 'text' as const,
          text: 'Callgraph database not found. Run `node dist/cli.js callgraph` first to generate it.',
        }],
      };
    }
    
    const results = args.direction === 'callers'
      ? findCallers(DEFAULT_MC_VERSION, args.className, args.methodName)
      : findCallees(DEFAULT_MC_VERSION, args.className, args.methodName);
    
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

export const allTools = [mcSearchTool, mcGetClassTool, mcGetMethodTool, mcFindRefsTool];
