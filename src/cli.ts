#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { ensureDecompiled } from './decompiler/index.js';
import { buildIndex, loadIndexManifest } from './indexer/index.js';
import { 
  getMinecraftSourceDir, 
  ensureHomeDirs, 
  getHomeDir, 
  getAvailableMinecraftVersions, 
  getCacheDir, 
  getIndexDir, 
  getMinecraftCacheDir,
  getIndexedVersions,
  isVersionIndexed,
  getTmpDir
} from './utils/paths.js';
import { ensureCallgraph, hasCallgraphDb, getCallgraphStats } from './callgraph/index.js';
import { startServer } from './index.js';

const program = new Command();

function isValidVersion(version: string): boolean {
  // Allow 26.x, 27.x, etc. (including snapshots like 26.1-snapshot-10)
  if (/^[2-9][0-9]*\./.test(version)) {
    return true;
  }
  
  // For 1.x.x versions, require >= 1.21.11
  const match = version.match(/^1\.(\d+)\.(\d+)/);
  if (match) {
    const minor = parseInt(match[1], 10);
    const patch = parseInt(match[2], 10);
    return minor > 21 || (minor === 21 && patch >= 11);
  }
  
  return false;
}

function validateVersion(version: string): void {
  if (!isValidVersion(version)) {
    console.error(`Error: Version ${version} is not supported.`);
    console.error('Supported versions:');
    console.error('  - 1.21.11 and later (1.21.11, 1.21.12, 1.22.x, etc.)');
    console.error('  - 26.x and later (26.1, 26.1-snapshot-10, etc.)');
    process.exit(1);
  }
}

program
  .name('mcdev-mcp')
  .description('MCP server for Minecraft mod development')
  .version('1.0.0');

program
  .command('serve')
  .description('Start the MCP server over stdio (used by MCP clients, not humans)')
  .action(async () => {
    try {
      await startServer();
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Download, decompile, index Minecraft sources, and generate callgraph')
  .requiredOption('-v, --version <version>', 'Minecraft version (e.g., 1.21.11, 26.1)')
  .option('--skip-callgraph', 'Skip callgraph generation', false)
  .action(async (options) => {
    validateVersion(options.version);
    console.log(`Initializing mcdev-mcp for Minecraft ${options.version}...`);
    
    const progressCb = (stage: string, progress: number, message: string) => {
      console.log(`[${stage}] ${progress}% - ${message}`);
    };
    
    try {
      const result = await ensureDecompiled(options.version, progressCb);
      
      console.log('\nBuilding symbol index...');
      await buildIndex({
        minecraftSourceDir: result.minecraftDir,
        fabricApiSourceDir: null,
        minecraftVersion: options.version,
        fabricApiVersion: null,
        progressCb,
      });
      
      if (!options.skipCallgraph) {
        console.log('\nGenerating callgraph...');
        await ensureCallgraph(options.version, progressCb);
      }
      
      console.log('\n✓ Initialization complete!');
      console.log(`  Minecraft: ${options.version}`);
      if (options.skipCallgraph) {
        console.log(`  Callgraph: skipped (run 'mcdev-mcp callgraph -v ${options.version}' to generate)`);
      } else {
        const stats = getCallgraphStats(options.version);
        if (stats) {
          console.log(`  Callgraph: ${stats.totalCalls} call references`);
        }
      }
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  });

program
  .command('callgraph')
  .description('Generate callgraph database for finding method references')
  .requiredOption('-v, --version <version>', 'Minecraft version (e.g., 1.21.11, 26.1)')
  .action(async (options) => {
    validateVersion(options.version);
    console.log(`Generating callgraph for Minecraft ${options.version}...`);
    
    const sourceDir = getMinecraftSourceDir(options.version);
    if (!fs.existsSync(sourceDir)) {
      console.error(`Minecraft ${options.version} not decompiled. Run 'init -v ${options.version}' first.`);
      process.exit(1);
    }
    
    if (!isVersionIndexed(options.version)) {
      console.error(`Minecraft ${options.version} not indexed. Run 'init -v ${options.version}' first.`);
      process.exit(1);
    }
    
    const progressCb = (stage: string, progress: number, message: string) => {
      console.log(`[${stage}] ${progress}% - ${message}`);
    };
    
    try {
      await ensureCallgraph(options.version, progressCb);
      
      const stats = getCallgraphStats(options.version);
      if (stats) {
        console.log('\n✓ Callgraph database ready!');
        console.log(`  Total call references: ${stats.totalCalls}`);
        console.log(`  Unique callers: ${stats.uniqueCallers}`);
        console.log(`  Unique callees: ${stats.uniqueCallees}`);
      }
    } catch (error) {
      console.error('Callgraph generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('rebuild')
  .description('Rebuild the symbol index from cached sources')
  .requiredOption('-v, --version <version>', 'Minecraft version (e.g., 1.21.11, 26.1)')
  .option('--with-callgraph', 'Also rebuild callgraph', false)
  .action(async (options) => {
    validateVersion(options.version);
    ensureHomeDirs();
    
    const minecraftVersion = options.version;
    const minecraftDir = getMinecraftSourceDir(minecraftVersion);
    
    if (!fs.existsSync(minecraftDir)) {
      console.error(`Source directory not found: ${minecraftDir}`);
      console.error('Run `init` first to download and decompile sources.');
      process.exit(1);
    }
    
    console.log(`Rebuilding index for Minecraft ${minecraftVersion}...`);
    
    const progressCb = (stage: string, progress: number, message: string) => {
      console.log(`[${stage}] ${progress}% - ${message}`);
    };
    
    await buildIndex({
      minecraftSourceDir: minecraftDir,
      fabricApiSourceDir: null,
      minecraftVersion: minecraftVersion,
      fabricApiVersion: null,
      progressCb,
    });
    
    if (options.withCallgraph) {
      console.log('\nRebuilding callgraph...');
      await ensureCallgraph(minecraftVersion, progressCb);
    }
    
    console.log('\n✓ Index rebuilt!');
  });

program
  .command('status')
  .description('Show current status of all cached Minecraft versions')
  .option('-v, --version <version>', 'Show status for specific version')
  .action((options) => {
    ensureHomeDirs();
    
    const indexedVersions = getIndexedVersions();
    const cachedVersions = getAvailableMinecraftVersions();
    
    if (options.version) {
      showVersionStatus(options.version, cachedVersions, indexedVersions);
      return;
    }
    
    if (cachedVersions.length === 0) {
      console.log('Status: Not initialized');
      console.log('Run `mcdev-mcp init -v <version>` to set up.');
      return;
    }
    
    console.log('Cached Minecraft versions:\n');
    
    for (const version of cachedVersions) {
      const manifest = loadIndexManifest(version);
      const hasCallgraph = hasCallgraphDb(version);
      const isIndexed = indexedVersions.includes(version);
      
      console.log(`  ${version}:`);
      console.log(`    Decompiled: ✓`);
      console.log(`    Indexed: ${isIndexed ? '✓' : '✗'}`);
      
      if (isIndexed && manifest) {
        console.log(`    Packages: ${manifest.packages.minecraft.length} Minecraft, ${manifest.packages.fabric.length} Fabric`);
      }
      
      console.log(`    Callgraph: ${hasCallgraph ? '✓' : '✗'}`);
      
      if (hasCallgraph) {
        const stats = getCallgraphStats(version);
        if (stats) {
          console.log(`    Call refs: ${stats.totalCalls}`);
        }
      }
      
      console.log();
    }
    
    console.log(`Total: ${cachedVersions.length} version(s) cached`);
  });

function showVersionStatus(version: string, cachedVersions: string[], indexedVersions: string[]): void {
  const isCached = cachedVersions.includes(version);
  const isIndexed = indexedVersions.includes(version);
  const hasCallgraph = hasCallgraphDb(version);
  
  console.log(`\nMinecraft ${version}:`);
  console.log(`  Decompiled: ${isCached ? '✓' : '✗'}`);
  console.log(`  Indexed: ${isIndexed ? '✓' : '✗'}`);
  console.log(`  Callgraph: ${hasCallgraph ? '✓' : '✗'}`);
  
  if (isIndexed) {
    const manifest = loadIndexManifest(version);
    if (manifest) {
      console.log(`  Packages: ${manifest.packages.minecraft.length} Minecraft, ${manifest.packages.fabric.length} Fabric`);
      console.log(`  Generated: ${manifest.generated}`);
    }
    
    if (hasCallgraph) {
      const stats = getCallgraphStats(version);
      if (stats) {
        console.log(`  Call refs: ${stats.totalCalls}`);
        console.log(`  Unique callers: ${stats.uniqueCallers}`);
        console.log(`  Unique callees: ${stats.uniqueCallees}`);
      }
    }
  } else if (!isCached) {
    console.log(`\n  Run 'mcdev-mcp init -v ${version}' to initialize.`);
  }
}

program
  .command('clean')
  .description('Remove cached data and index')
  .option('--callgraph', 'Only clean callgraph data')
  .option('--cache', 'Clean cache directory (decompiled sources)')
  .option('--index', 'Clean index directory (symbol index)')
  .option('--all', 'Clean everything (cache, index, DecompilerMC)')
  .option('-v, --version <version>', 'Clean data for specific version only')
  .action((options) => {
    const homeDir = getHomeDir();
    const cacheDir = getCacheDir();
    const indexDir = getIndexDir();
    
    if (options.callgraph && !options.version) {
      console.log('--callgraph requires -v <version>');
      process.exit(1);
    }
    
    if (options.callgraph && options.version) {
      const callgraphDir = path.join(getMinecraftCacheDir(options.version), 'callgraph');
      if (fs.existsSync(callgraphDir)) {
        fs.rmSync(callgraphDir, { recursive: true });
        console.log(`Removed callgraph data for ${options.version}`);
      } else {
        console.log(`No callgraph data found for ${options.version}`);
      }
      return;
    }
    
    if (options.version) {
      const versionCacheDir = path.join(cacheDir, options.version);
      const versionIndexDir = path.join(indexDir, options.version);
      
      if (options.all || (!options.cache && !options.index)) {
        options.cache = true;
        options.index = true;
      }
      
      if (options.cache && fs.existsSync(versionCacheDir)) {
        fs.rmSync(versionCacheDir, { recursive: true });
        console.log(`Removed cache for ${options.version}: ${versionCacheDir}`);
      }
      
      if (options.index && fs.existsSync(versionIndexDir)) {
        fs.rmSync(versionIndexDir, { recursive: true });
        console.log(`Removed index for ${options.version}: ${versionIndexDir}`);
      }
      
      console.log(`\nRun 'mcdev-mcp init -v ${options.version}' to reinitialize.`);
      return;
    }
    
    if (options.all) {
      options.cache = true;
      options.index = true;
    }
    
    if (!options.cache && !options.index) {
      console.log('Specify what to clean:');
      console.log('  --cache           Clean decompiled sources');
      console.log('  --index           Clean symbol index');
      console.log('  --callgraph       Clean callgraph database only (requires -v)');
      console.log('  --all             Clean everything (cache, index, tmp)');
      console.log('  -v <version>      Clean data for specific version only');
      return;
    }
    
    if (options.cache) {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true });
        console.log(`Removed cache: ${cacheDir}`);
      } else {
        console.log('Cache directory not found');
      }
    }
    
    if (options.index) {
      if (fs.existsSync(indexDir)) {
        fs.rmSync(indexDir, { recursive: true });
        console.log(`Removed index: ${indexDir}`);
      } else {
        console.log('Index directory not found');
      }
    }
    
    if (options.all) {
      const tmpDir = path.join(homeDir, 'tmp');
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
        console.log(`Removed tmp: ${tmpDir}`);
      } else {
        console.log('tmp directory not found');
      }
    }
    
    console.log('\nRun `mcdev-mcp init -v <version>` to reinitialize.');
  });

program.parse();
