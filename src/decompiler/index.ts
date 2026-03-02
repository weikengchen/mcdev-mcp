import * as fs from 'fs';
import * as path from 'path';
import { ensureVineflower, type ProgressCallback } from './tools.js';
import { downloadClientJar } from './download.js';
import { decompile } from './vineflower.js';
import {
  getMinecraftSourceDir,
  getMinecraftJarPath,
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

    const jarPath = getMinecraftJarPath(version);
    ensureDir(path.dirname(jarPath));
    
    await downloadClientJar(version, jarPath, progressCb);

    await decompile(vineflowerJar, jarPath, minecraftDir, progressCb);
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
