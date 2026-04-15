import { versionManager } from '../../version-manager.js';
import { sourceStore } from '../../storage/index.js';
import {
  isVersionIndexed,
  getMinecraftSourceDir
} from '../../utils/paths.js';
import * as fs from 'fs';

export function getEffectiveVersion(explicitVersion?: string): { version: string; error?: string } {
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

STOP and ask the USER which version they want to use, then call mc_version with action="set".
Or, provide a 'version' parameter in your tool call.

To see available versions, call mc_version with action="list".`
    };
  }

  return { version: activeVersion };
}

export function ensureSourceStoreVersion(version: string): void {
  if (!sourceStore.getVersion() || sourceStore.getVersion() !== version) {
    sourceStore.setVersion(version);
  }
}
