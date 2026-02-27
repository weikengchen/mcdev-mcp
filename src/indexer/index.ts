import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { PackageIndex, IndexManifest, ClassInfo } from '../utils/types.js';
import { parseJavaFile, ParsedClass } from './parser.js';
import { 
  getIndexManifestPath, 
  getMinecraftIndexPath, 
  getFabricIndexPath, 
  getPackageIndexPath,
  ensureDir 
} from '../utils/paths.js';

export interface BuildIndexOptions {
  minecraftSourceDir: string;
  fabricApiSourceDir?: string | null;
  minecraftVersion: string;
  fabricApiVersion?: string | null;
  progressCb?: (stage: string, progress: number, message: string) => void;
}

export interface IndexBuildResult {
  minecraftPackages: string[];
  fabricPackages: string[];
  totalClasses: number;
}

export async function buildIndex(options: BuildIndexOptions): Promise<IndexBuildResult> {
  const { minecraftSourceDir, fabricApiSourceDir, minecraftVersion, fabricApiVersion, progressCb } = options;
  
  ensureDir(getMinecraftIndexPath());
  ensureDir(getFabricIndexPath());
  
  if (progressCb) progressCb('index', 0, 'Finding Java files...');
  
  const mcJavaFiles = await findJavaFiles(minecraftSourceDir);
  const fabricJavaFiles = fabricApiSourceDir ? await findJavaFiles(fabricApiSourceDir) : [];
  
  const totalFiles = mcJavaFiles.length + fabricJavaFiles.length;
  let processedFiles = 0;
  
  const minecraftPackages = new Map<string, Record<string, ClassInfo>>();
  const fabricPackages = new Map<string, Record<string, ClassInfo>>();
  
  if (progressCb) progressCb('index', 5, `Processing ${mcJavaFiles.length} Minecraft files...`);
  
  for (const file of mcJavaFiles) {
    const parsed = parseJavaFile(file);
    if (parsed) {
      addToPackageIndex(minecraftPackages, parsed);
    }
    processedFiles++;
    if (progressCb && processedFiles % 100 === 0) {
      const progress = Math.round(5 + (processedFiles / totalFiles) * 85);
      progressCb('index', progress, `Processed ${processedFiles}/${totalFiles} files...`);
    }
  }
  
  if (progressCb) progressCb('index', 50, `Processing ${fabricJavaFiles.length} Fabric API files...`);
  
  for (const file of fabricJavaFiles) {
    const parsed = parseJavaFile(file);
    if (parsed) {
      addToPackageIndex(fabricPackages, parsed);
    }
    processedFiles++;
    if (progressCb && processedFiles % 100 === 0) {
      const progress = Math.round(5 + (processedFiles / totalFiles) * 85);
      progressCb('index', progress, `Processed ${processedFiles}/${totalFiles} files...`);
    }
  }
  
  if (progressCb) progressCb('index', 90, 'Writing package indices...');
  
  await writePackageIndices('minecraft', minecraftPackages);
  await writePackageIndices('fabric', fabricPackages);
  
  const manifest: IndexManifest = {
    minecraftVersion,
    fabricApiVersion: fabricApiVersion || null,
    generated: new Date().toISOString(),
    packages: {
      minecraft: Array.from(minecraftPackages.keys()).sort(),
      fabric: Array.from(fabricPackages.keys()).sort(),
    },
  };
  
  fs.writeFileSync(getIndexManifestPath(), JSON.stringify(manifest, null, 2));
  
  let totalClasses = 0;
  for (const pkg of minecraftPackages.values()) {
    totalClasses += Object.keys(pkg).length;
  }
  for (const pkg of fabricPackages.values()) {
    totalClasses += Object.keys(pkg).length;
  }
  
  if (progressCb) progressCb('index', 100, `Indexed ${totalClasses} classes in ${minecraftPackages.size + fabricPackages.size} packages.`);
  
  return {
    minecraftPackages: Array.from(minecraftPackages.keys()),
    fabricPackages: Array.from(fabricPackages.keys()),
    totalClasses,
  };
}

async function findJavaFiles(dir: string): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];
  
  return glob('**/*.java', {
    cwd: dir,
    absolute: true,
    nodir: true,
  });
}

function addToPackageIndex(
  packages: Map<string, Record<string, ClassInfo>>,
  parsed: ParsedClass
): void {
  const packageName = parsed.packageName || 'default';
  
  if (!packages.has(packageName)) {
    packages.set(packageName, {});
  }
  
  const pkgIndex = packages.get(packageName)!;
  const relativeClassName = parsed.className;
  
  pkgIndex[relativeClassName] = {
    ...parsed.info,
    sourcePath: parsed.info.sourcePath,
  };
}

async function writePackageIndices(
  namespace: 'minecraft' | 'fabric',
  packages: Map<string, Record<string, ClassInfo>>
): Promise<void> {
  for (const [packageName, classes] of packages) {
    const packageIndex: PackageIndex = {
      package: packageName,
      classes,
    };
    
    const indexPath = getPackageIndexPath(namespace, packageName);
    ensureDir(path.dirname(indexPath));
    fs.writeFileSync(indexPath, JSON.stringify(packageIndex, null, 2));
  }
}

export function loadIndexManifest(): IndexManifest | null {
  const manifestPath = getIndexManifestPath();
  if (!fs.existsSync(manifestPath)) return null;
  
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadPackageIndex(namespace: 'minecraft' | 'fabric', packageName: string): PackageIndex | null {
  const indexPath = getPackageIndexPath(namespace, packageName);
  if (!fs.existsSync(indexPath)) return null;
  
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return null;
  }
}
