import { sourceStore } from '../../storage/index.js';
import { getEffectiveVersion, ensureSourceStoreVersion } from './helpers.js';
import { ClassInfo, FieldInfo, MethodInfo } from '../../utils/types.js';

type View = 'summary' | 'methods' | 'fields' | 'full';

export const mcGetClassTool = {
  name: 'mc_get_class',
  description: `Get info about a Minecraft or Fabric API class.

Use the "view" parameter to control the response size:
- "summary" (default): hierarchy + counts + one-line method/field signatures.
  Always fits in the response budget; pick this first.
- "methods": hierarchy + every method signature (no bodies, no fields).
- "fields": hierarchy + every field declaration (no methods).
- "full": full decompiled source. Big classes (e.g. ClientPacketListener)
  may exceed the response budget — start with "summary" and only ask for
  "full" when you need the implementation.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      className: {
        type: 'string',
        description: 'Fully qualified class name (e.g., "net.minecraft.client.MinecraftClient")',
      },
      view: {
        type: 'string',
        enum: ['summary', 'methods', 'fields', 'full'],
        description: 'How much to return. Default "summary".',
      },
      version: {
        type: 'string',
        description: 'Optional: Minecraft version to use (e.g., "1.21.1"). If not provided, uses the active version set by mc_version.',
      },
    },
    required: ['className'],
  },

  handler: async (args: { className: string; view?: View; version?: string }) => {
    const { version, error } = getEffectiveVersion(args.version);
    if (error) {
      return { content: [{ type: 'text' as const, text: error }] };
    }

    ensureSourceStoreVersion(version);

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
    const view: View = args.view ?? 'summary';

    const header = renderHeader(args.className, info);
    let body: string;
    switch (view) {
      case 'full':
        body = source;
        break;
      case 'methods':
        body = renderMethods(info.methods);
        break;
      case 'fields':
        body = renderFields(info.fields);
        break;
      case 'summary':
      default:
        body = renderFields(info.fields) + '\n' + renderMethods(info.methods);
        break;
    }

    return {
      content: [{
        type: 'text' as const,
        text: header + body,
      }],
    };
  },
};

function renderHeader(className: string, info: ClassInfo): string {
  let header = `// ${info.kind} ${className}\n`;
  if (info.super) header += `// Extends: ${info.super}\n`;
  if (info.interfaces?.length) header += `// Implements: ${info.interfaces.join(', ')}\n`;
  header += `// Fields: ${info.fields.length}, Methods: ${info.methods.length}\n\n`;
  return header;
}

function renderFields(fields: FieldInfo[]): string {
  if (!fields.length) return '// (no fields)\n';
  const lines = fields.map(f => {
    const mods = f.modifiers.length ? f.modifiers.join(' ') + ' ' : '';
    return `${mods}${f.type} ${f.name};`;
  });
  return '// Fields:\n' + lines.join('\n') + '\n';
}

function renderMethods(methods: MethodInfo[]): string {
  if (!methods.length) return '// (no methods)\n';
  const lines = methods.map(m => {
    const mods = m.modifiers.length ? m.modifiers.join(' ') + ' ' : '';
    const params = m.params.map(p => `${p.type} ${p.name}`).join(', ');
    return `${mods}${m.returnType} ${m.name}(${params});`;
  });
  return '// Methods:\n' + lines.join('\n') + '\n';
}
