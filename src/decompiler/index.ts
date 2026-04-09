import * as fs from 'fs';
import * as path from 'path';
import { ensureVineflower, type ProgressCallback } from './tools.js';
import { downloadClientJar, fetchVersionInfo, downloadMappings } from './download.js';
import { decompile } from './vineflower.js';
import {
  needsRemapping,
  ensureTinyRemapper,
  convertProguardToTiny,
  remapJar,
  getMappingsPath,
  getTinyMappingsPath,
} from './remapper.js';
import {
  getMinecraftSourceDir,
  getMinecraftJarPath,
  getObfuscatedJarPath,
  getIndexDir,
  ensureHomeDirs,
  ensureDir,
} from '../utils/paths.js';

export interface DecompilerStatus {
  hasMinecraftSources: boolean;
  hasFabricApiSources: boolean;
  hasIndex: boolean;
  minecraftVersion: string | null;
  fabricApiVersion: string | null;
}

export function isDecompiled(version: string): boolean {
  const sourceDir = getMinecraftSourceDir(version);
  if (!fs.existsSync(sourceDir)) return false;
  const files = fs.readdirSync(sourceDir, { recursive: true }) as string[];
  const javaFiles = files.filter(f => f.endsWith('.java'));
  return javaFiles.length > 100;
}

export async function ensureDecompiled(
  version: string,
  progressCb?: ProgressCallback
): Promise<{ minecraftDir: string; fabricDir: string | null; fabricVersion: string | null }> {
  ensureHomeDirs();

  const minecraftDir = getMinecraftSourceDir(version);

  if (!isDecompiled(version)) {
    const vineflowerJar = await ensureVineflower(progressCb);
    const finalJarPath = getMinecraftJarPath(version);
    ensureDir(path.dirname(finalJarPath));

    if (needsRemapping(version)) {
      // Obfuscated version: download, remap, then decompile
      const obfuscatedJarPath = getObfuscatedJarPath(version);

      if (!fs.existsSync(finalJarPath)) {
        await downloadClientJar(version, obfuscatedJarPath, progressCb);

        const versionInfo = await fetchVersionInfo(version);
        const mappingsPath = getMappingsPath(version);
        await downloadMappings(versionInfo, path.dirname(mappingsPath), progressCb);

        await ensureTinyRemapper(progressCb);

        const tinyPath = getTinyMappingsPath(version);
        if (progressCb) progressCb('convert', 0, 'Converting ProGuard mappings to Tiny format...');
        convertProguardToTiny(mappingsPath, tinyPath);
        if (progressCb) progressCb('convert', 100, 'Mappings converted.');

        await remapJar(obfuscatedJarPath, tinyPath, finalJarPath, progressCb);
      }

      await decompile(vineflowerJar, finalJarPath, minecraftDir, progressCb);
    } else {
      // Unobfuscated version: download directly and decompile
      await downloadClientJar(version, finalJarPath, progressCb);
      await decompile(vineflowerJar, finalJarPath, minecraftDir, progressCb);
    }
  }

  return { minecraftDir, fabricDir: null, fabricVersion: null };
}

export function getStatus(): DecompilerStatus {
  ensureHomeDirs();

  const indexManifestPath = path.join(getIndexDir(), 'manifest.json');
  let minecraftVersion: string | null = null;
  let fabricApiVersion: string | null = null;

  if (fs.existsSync(indexManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(indexManifestPath, 'utf-8'));
      minecraftVersion = manifest.minecraftVersion;
      fabricApiVersion = manifest.fabricApiVersion;
    } catch {
      // Ignore parse errors
    }
  }

  const hasMinecraftSources = minecraftVersion ? isDecompiled(minecraftVersion) : false;

  return {
    hasMinecraftSources,
    hasFabricApiSources: false,
    hasIndex: fs.existsSync(indexManifestPath),
    minecraftVersion,
    fabricApiVersion,
  };
}
