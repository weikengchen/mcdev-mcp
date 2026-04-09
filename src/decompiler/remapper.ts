import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { downloadFile, hasUnobfuscatedJar } from './download.js';
import { ensureDir, getToolsDir, getMinecraftCacheDir } from '../utils/paths.js';

export type ProgressCallback = (stage: string, progress: number, message: string) => void;

const TINY_REMAPPER_VERSION = '0.10.4';
const TINY_REMAPPER_URL = `https://maven.fabricmc.net/net/fabricmc/tiny-remapper/${TINY_REMAPPER_VERSION}/tiny-remapper-${TINY_REMAPPER_VERSION}-fat.jar`;

export function getTinyRemapperPath(): string {
  return path.join(getToolsDir(), 'tiny-remapper-fat.jar');
}

export function getMappingsPath(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'jars', 'client.txt');
}

export function getTinyMappingsPath(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'jars', 'client_mappings.tiny');
}

export function needsRemapping(version: string): boolean {
  // Dev snapshots (26.x+) are already unobfuscated
  if (/^[2-9][0-9]*\./.test(version)) return false;
  // Versions with known unobfuscated JARs
  if (hasUnobfuscatedJar(version)) return false;
  // Everything else needs remapping
  return true;
}

export async function ensureTinyRemapper(progressCb?: ProgressCallback): Promise<string> {
  const trPath = getTinyRemapperPath();
  if (fs.existsSync(trPath)) return trPath;

  if (progressCb) progressCb('tiny-remapper', 0, 'Downloading Tiny Remapper...');
  await downloadFile(TINY_REMAPPER_URL, trPath, progressCb, 'tiny-remapper');
  if (progressCb) progressCb('tiny-remapper', 100, 'Tiny Remapper downloaded.');

  return trPath;
}

export function convertProguardToTiny(proguardPath: string, tinyPath: string): void {
  if (fs.existsSync(tinyPath)) return;

  const proguardContent = fs.readFileSync(proguardPath, 'utf-8');
  const lines = proguardContent.split('\n');

  // Maps: obfuscated class name -> { obf, named }
  const classMappings = new Map<string, { obf: string; named: string }>();
  // Maps: named class -> Map<fieldKey, { obf, named, desc }>
  const fieldMappings = new Map<string, Map<string, { obf: string; named: string; desc: string }>>();
  // Maps: named class -> Map<methodKey, { obf, named, desc }>
  const methodMappings = new Map<string, Map<string, { obf: string; named: string; desc: string }>>();

  let currentClass: string | null = null;
  let currentClassObf: string | null = null;

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    // Class line: "net.minecraft.Foo$Bar -> abc$a:"
    const classMatch = line.match(/^([\w.$]+) -> ([\w$]+):$/);
    if (classMatch) {
      const named = classMatch[1].replace(/\./g, '/');
      const obf = classMatch[2];
      currentClass = named;
      currentClassObf = obf;
      classMappings.set(obf, { obf, named });
      methodMappings.set(named, new Map());
      fieldMappings.set(named, new Map());
      continue;
    }

    if (!currentClass || !currentClassObf) continue;

    // Field line: "    boolean isClientSide -> f"
    const fieldMatch = line.match(/^\s+([\w.$<>\[\]]+) ([\w$]+) -> ([\w$]+)$/);
    if (fieldMatch) {
      const desc = convertTypeToDesc(fieldMatch[1]);
      const named = fieldMatch[2];
      const obf = fieldMatch[3];
      fieldMappings.get(currentClass)?.set(named, { obf, named, desc });
      continue;
    }

    // Method line: "    1:1:void <init>(net.minecraft.Foo) -> <init>"
    const methodMatch = line.match(/^\s+(?:\d+:\d+:)?([\w.$<>\[\]]+) ([\w$<>]+)\(([^)]*)\) -> ([\w$<>]+)$/);
    if (methodMatch) {
      const returnType = convertTypeToDesc(methodMatch[1]);
      const named = methodMatch[2];
      const params = methodMatch[3]
        ? methodMatch[3].split(',').map(t => convertTypeToDesc(t.trim())).join('')
        : '';
      const desc = `(${params})${returnType}`;
      const obf = methodMatch[4];
      // Use name+desc as key to handle overloads
      methodMappings.get(currentClass)?.set(`${named}${desc}`, { obf, named, desc });
    }
  }

  // Write Tiny v2 format
  const tinyLines: string[] = ['tiny\t2\t0\tobf\tnamed'];

  for (const [obf, { named }] of classMappings) {
    tinyLines.push(`c\t${obf}\t${named}`);

    const classFields = fieldMappings.get(named);
    if (classFields) {
      for (const [, { obf: fObf, named: fNamed, desc: fDesc }] of classFields) {
        tinyLines.push(`\tf\t${fDesc}\t${fObf}\t${fNamed}`);
      }
    }

    const classMethods = methodMappings.get(named);
    if (classMethods) {
      for (const [, { obf: mObf, named: mNamed, desc: mDesc }] of classMethods) {
        tinyLines.push(`\tm\t${mDesc}\t${mObf}\t${mNamed}`);
      }
    }
  }

  ensureDir(path.dirname(tinyPath));
  fs.writeFileSync(tinyPath, tinyLines.join('\n'));
}

function convertTypeToDesc(type: string): string {
  type = type.trim();
  if (type.endsWith('[]')) {
    return '[' + convertTypeToDesc(type.slice(0, -2));
  }
  const primitives: Record<string, string> = {
    'void': 'V',
    'boolean': 'Z',
    'byte': 'B',
    'char': 'C',
    'short': 'S',
    'int': 'I',
    'long': 'J',
    'float': 'F',
    'double': 'D',
  };
  if (primitives[type]) return primitives[type];
  return `L${type.replace(/\./g, '/')};`;
}

export async function remapJar(
  inputJar: string,
  tinyMappings: string,
  outputJar: string,
  progressCb?: ProgressCallback
): Promise<string> {
  if (fs.existsSync(outputJar)) return outputJar;

  const trPath = getTinyRemapperPath();
  if (!fs.existsSync(trPath)) {
    throw new Error('Tiny Remapper not found. Call ensureTinyRemapper() first.');
  }

  if (progressCb) progressCb('remap', 0, 'Remapping jar with official mappings...');
  ensureDir(path.dirname(outputJar));

  return new Promise((resolve, reject) => {
    const args = [
      '-Xmx4g',
      '-jar', trPath,
      inputJar,
      outputJar,
      tinyMappings,
      'obf',
      'named',
      '--ignoreConflicts',
    ];

    const proc = spawn('java', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        if (progressCb) progressCb('remap', 100, 'Jar remapped successfully.');
        resolve(outputJar);
      } else {
        reject(new Error(`Tiny Remapper failed with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run Tiny Remapper: ${err.message}`));
    });
  });
}
