import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Config, DEFAULT_CONFIG } from './config.js';

const MCDEV_DIR = '.mcdev-mcp';

export function getHomeDir(): string {
  return path.join(os.homedir(), MCDEV_DIR);
}

export function getCacheDir(): string {
  return path.join(getHomeDir(), 'cache');
}

export function getIndexDir(): string {
  return path.join(getHomeDir(), 'index');
}

export function getToolsDir(): string {
  return path.join(getHomeDir(), 'tools');
}

export function getMinecraftCacheDir(version: string): string {
  return path.join(getCacheDir(), version);
}

export function getMinecraftSourceDir(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'client');
}

export function getMinecraftJarPath(version: string): string {
  return path.join(getMinecraftCacheDir(version), 'jars', `${version}_unobfuscated.jar`);
}

export function getFabricApiCacheDir(version: string): string {
  return path.join(getCacheDir(), `fabric-api-${version}`);
}

export function getVineflowerPath(): string {
  return path.join(getToolsDir(), 'vineflower.jar');
}

export function getIndexManifestPath(): string {
  return path.join(getIndexDir(), 'manifest.json');
}

export function getMinecraftIndexPath(): string {
  return path.join(getIndexDir(), 'minecraft');
}

export function getFabricIndexPath(): string {
  return path.join(getIndexDir(), 'fabric');
}

export function getPackageIndexPath(namespace: 'minecraft' | 'fabric', packageName: string): string {
  const baseDir = namespace === 'minecraft' ? getMinecraftIndexPath() : getFabricIndexPath();
  return path.join(baseDir, `${packageName}.json`);
}

export function getConfig(): Config {
  return {
    ...DEFAULT_CONFIG,
    cacheDir: getCacheDir(),
    indexDir: getIndexDir(),
    toolsDir: getToolsDir(),
  };
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureHomeDirs(): void {
  ensureDir(getHomeDir());
  ensureDir(getCacheDir());
  ensureDir(getIndexDir());
  ensureDir(getToolsDir());
  ensureDir(getMinecraftIndexPath());
  ensureDir(getFabricIndexPath());
}

export function getAvailableMinecraftVersions(): string[] {
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) return [];
  
  const versions: string[] = [];
  for (const entry of fs.readdirSync(cacheDir)) {
    const sourceDir = getMinecraftSourceDir(entry);
    if (fs.existsSync(sourceDir)) {
      versions.push(entry);
    }
  }
  
  return versions.sort();
}
