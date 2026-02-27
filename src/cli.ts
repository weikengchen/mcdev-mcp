#!/usr/bin/env node

import * as fs from 'fs';
import { Command } from 'commander';
import { ensureDecompiled } from './decompiler/index.js';
import { buildIndex, loadIndexManifest } from './indexer/index.js';
import { getMinecraftSourceDir, ensureHomeDirs, getHomeDir, getAvailableMinecraftVersions } from './utils/paths.js';
import { ensureCallgraph, hasCallgraphDb, getCallgraphStats } from './callgraph/index.js';

const DEFAULT_MC_VERSION = '1.21.11';

const program = new Command();

program
  .name('mcdev-mcp')
  .description('MCP server for Minecraft mod development')
  .version('1.0.0');

program
  .command('init')
  .description('Download and decompile Minecraft sources, build index')
  .option('-v, --version <version>', 'Minecraft version', DEFAULT_MC_VERSION)
  .action(async (options) => {
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
      
      console.log('\n✓ Initialization complete!');
      console.log(`  Minecraft: ${options.version}`);
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  });

program
  .command('callgraph')
  .description('Generate callgraph database for finding method references')
  .option('-v, --version <version>', 'Minecraft version', DEFAULT_MC_VERSION)
  .action(async (options) => {
    console.log(`Generating callgraph for Minecraft ${options.version}...`);
    
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
  .option('-v, --version <version>', 'Minecraft version (auto-detected if not specified)')
  .action(async (options) => {
    ensureHomeDirs();
    
    let minecraftVersion = options.version;
    
    if (!minecraftVersion) {
      const manifest = loadIndexManifest();
      const availableVersions = getAvailableMinecraftVersions();
      
      if (manifest && availableVersions.includes(manifest.minecraftVersion)) {
        minecraftVersion = manifest.minecraftVersion;
      } else if (availableVersions.length === 1) {
        minecraftVersion = availableVersions[0];
        console.log(`Auto-detected Minecraft version: ${minecraftVersion}`);
      } else if (availableVersions.length > 1) {
        console.log('Available Minecraft versions:', availableVersions.join(', '));
        console.error('Please specify a version with -v');
        process.exit(1);
      } else {
        console.error('No cached Minecraft sources found. Run `init` first.');
        process.exit(1);
      }
    }
    
    console.log(`Rebuilding index for Minecraft ${minecraftVersion}...`);
    
    const minecraftDir = getMinecraftSourceDir(minecraftVersion);
    
    if (!fs.existsSync(minecraftDir)) {
      console.error(`Source directory not found: ${minecraftDir}`);
      console.error('Run `init` first to download and decompile sources.');
      process.exit(1);
    }
    
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
    
    console.log('\n✓ Index rebuilt!');
  });

program
  .command('status')
  .description('Show current status')
  .action(() => {
    ensureHomeDirs();
    
    const manifest = loadIndexManifest();
    
    if (!manifest) {
      console.log('Status: Not initialized');
      console.log('Run `mcdev-mcp init` to set up.');
      return;
    }
    
    console.log('Status: Initialized');
    console.log(`  Minecraft version: ${manifest.minecraftVersion}`);
    if (manifest.fabricApiVersion) {
      console.log(`  Fabric API version: ${manifest.fabricApiVersion}`);
    }
    console.log(`  Minecraft packages: ${manifest.packages.minecraft.length}`);
    console.log(`  Fabric packages: ${manifest.packages.fabric.length}`);
    console.log(`  Index generated: ${manifest.generated}`);
    
    const callgraphStats = getCallgraphStats(manifest.minecraftVersion);
    if (callgraphStats) {
      console.log(`\n  Callgraph: ${callgraphStats.totalCalls} call references`);
    } else {
      console.log(`\n  Callgraph: not generated (run 'mcdev-mcp callgraph')`);
    }
  });

program
  .command('clean')
  .description('Remove cached data and index')
  .option('--callgraph', 'Only clean callgraph data')
  .action((options) => {
    console.log('Clean command not yet implemented.');
  });

program.parse();
