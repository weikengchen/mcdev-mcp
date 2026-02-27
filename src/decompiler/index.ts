import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { getHomeDir, getMinecraftSourceDir, ensureHomeDirs, ensureDir } from '../utils/paths.js';

const DECOMPILER_MC_DIR = path.join(getHomeDir(), 'DecompilerMC');

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

async function checkDecompilerMC(): Promise<boolean> {
  if (fs.existsSync(path.join(DECOMPILER_MC_DIR, 'main.py'))) {
    return true;
  }
  return false;
}

async function cloneDecompilerMC(progressCb?: (stage: string, progress: number, message: string) => void): Promise<void> {
  if (await checkDecompilerMC()) return;
  
  if (progressCb) {
    progressCb('decompiler-mc', 0, 'Cloning DecompilerMC...');
  }
  
  ensureDir(getHomeDir());
  
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', 'https://github.com/hube12/DecompilerMC.git', DECOMPILER_MC_DIR], {
      stdio: 'inherit',
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        if (progressCb) progressCb('decompiler-mc', 100, 'DecompilerMC cloned.');
        resolve();
      } else {
        reject(new Error(`Failed to clone DecompilerMC (exit code ${code})`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to clone DecompilerMC: ${err.message}`));
    });
  });
}

async function runDecompilerMC(
  version: string,
  progressCb?: (stage: string, progress: number, message: string) => void
): Promise<string> {
  const outputDir = path.join(DECOMPILER_MC_DIR, 'src', version, 'client');
  
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
    if (progressCb) progressCb('decompile', 100, 'Already decompiled.');
    return outputDir;
  }
  
  if (progressCb) {
    progressCb('decompile', 0, `Decompiling Minecraft ${version} (this takes 1-3 minutes)...`);
  }
  
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['main.py', '--mcversion', version, '--side', 'client', '-q'], {
      cwd: DECOMPILER_MC_DIR,
      stdio: 'inherit',
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        if (progressCb) progressCb('decompile', 100, 'Decompilation complete.');
        resolve(outputDir);
      } else {
        reject(new Error(`DecompilerMC failed (exit code ${code})`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to run DecompilerMC: ${err.message}`));
    });
  });
}

export async function ensureDecompiled(
  version: string,
  progressCb?: (stage: string, progress: number, message: string) => void
): Promise<{ minecraftDir: string; fabricDir: string | null; fabricVersion: string | null }> {
  ensureHomeDirs();
  
  const minecraftDir = getMinecraftSourceDir(version);
  
  if (!isDecompiled(version)) {
    await cloneDecompilerMC(progressCb);
    
    const decompiledDir = await runDecompilerMC(version, progressCb);
    
    ensureDir(minecraftDir);
    
    if (progressCb) {
      progressCb('copy', 0, 'Copying decompiled sources...');
    }
    
    await copyDir(decompiledDir, minecraftDir);
    
    if (progressCb) {
      progressCb('copy', 100, 'Sources copied.');
    }
  }
  
  return { minecraftDir, fabricDir: null, fabricVersion: null };
}

async function copyDir(src: string, dest: string): Promise<void> {
  ensureDir(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function getStatus(): DecompilerStatus {
  ensureHomeDirs();
  
  const indexManifestPath = path.join(getHomeDir(), 'index', 'manifest.json');
  
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
