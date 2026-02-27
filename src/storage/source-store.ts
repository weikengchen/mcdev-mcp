import * as fs from 'fs';
import * as path from 'path';
import { loadIndexManifest, loadPackageIndex } from '../indexer/index.js';
import { 
  getMinecraftSourceDir, 
  getFabricApiCacheDir,
  getIndexManifestPath 
} from '../utils/paths.js';
import { SearchResult, PackageIndex, ClassInfo, MethodInfo, IndexManifest } from '../utils/types.js';

export class SourceStore {
  private manifest: IndexManifest | null = null;
  private packageCache: Map<string, PackageIndex> = new Map();
  
  private getManifest(): IndexManifest | null {
    if (!this.manifest) {
      this.manifest = loadIndexManifest();
    }
    return this.manifest;
  }
  
  isReady(): boolean {
    return fs.existsSync(getIndexManifestPath());
  }
  
  getMinecraftVersion(): string | null {
    return this.getManifest()?.minecraftVersion || null;
  }
  
  getFabricApiVersion(): string | null {
    return this.getManifest()?.fabricApiVersion || null;
  }
  
  listClasses(packagePath: string): { className: string; simpleName: string; sourcePath: string }[] {
    const manifest = this.getManifest();
    if (!manifest) return [];
    
    const results: { className: string; simpleName: string; sourcePath: string }[] = [];
    const packageLower = packagePath.toLowerCase();
    
    const namespaces: Array<'minecraft' | 'fabric'> = ['minecraft', 'fabric'];
    
    for (const namespace of namespaces) {
      const packages = namespace === 'minecraft' ? manifest.packages.minecraft : manifest.packages.fabric;
      
      for (const packageName of packages) {
        if (packageName.toLowerCase() === packageLower || packageName.toLowerCase().startsWith(packageLower + '.')) {
          const pkgIndex = this.getPackage(namespace, packageName);
          if (!pkgIndex) continue;
          
          for (const [simpleName, classInfo] of Object.entries(pkgIndex.classes)) {
            results.push({
              className: `${packageName}.${simpleName}`,
              simpleName,
              sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
            });
          }
        }
      }
    }
    
    return results;
  }
  
  listPackages(namespace?: 'minecraft' | 'fabric'): string[] {
    const manifest = this.getManifest();
    if (!manifest) return [];
    
    if (namespace) {
      return namespace === 'minecraft' ? manifest.packages.minecraft : manifest.packages.fabric;
    }
    
    return [...manifest.packages.minecraft, ...manifest.packages.fabric];
  }
  
  findHierarchy(
    className: string,
    direction: 'subclasses' | 'implementors'
  ): { className: string; sourcePath: string }[] {
    const manifest = this.getManifest();
    if (!manifest) return [];
    
    const results: { className: string; sourcePath: string }[] = [];
    
    const namespaces: Array<'minecraft' | 'fabric'> = ['minecraft', 'fabric'];
    
    for (const namespace of namespaces) {
      const packages = namespace === 'minecraft' ? manifest.packages.minecraft : manifest.packages.fabric;
      
      for (const packageName of packages) {
        const pkgIndex = this.getPackage(namespace, packageName);
        if (!pkgIndex) continue;
        
        for (const [simpleName, classInfo] of Object.entries(pkgIndex.classes)) {
          const fullName = `${packageName}.${simpleName}`;
          
          if (direction === 'subclasses') {
            if (classInfo.super === className) {
              results.push({
                className: fullName,
                sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
              });
            }
          } else if (direction === 'implementors') {
            if (classInfo.interfaces && classInfo.interfaces.includes(className)) {
              results.push({
                className: fullName,
                sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
              });
            }
          }
        }
      }
    }
    
    return results;
  }
  
  search(query: string, type?: 'class' | 'method' | 'field'): SearchResult[] {
    const manifest = this.getManifest();
    if (!manifest) return [];
    
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    
    for (const packageName of manifest.packages.minecraft) {
      const pkgIndex = this.getPackage('minecraft', packageName);
      if (!pkgIndex) continue;
      
      this.searchInPackage(pkgIndex, packageName, queryLower, type, 'minecraft', results);
    }
    
    for (const packageName of manifest.packages.fabric) {
      const pkgIndex = this.getPackage('fabric', packageName);
      if (!pkgIndex) continue;
      
      this.searchInPackage(pkgIndex, packageName, queryLower, type, 'fabric', results);
    }
    
    return results.slice(0, 50);
  }
  
  private searchInPackage(
    pkgIndex: PackageIndex,
    packageName: string,
    queryLower: string,
    type: 'class' | 'method' | 'field' | undefined,
    namespace: 'minecraft' | 'fabric',
    results: SearchResult[]
  ): void {
    for (const [className, classInfo] of Object.entries(pkgIndex.classes)) {
      const fullName = `${packageName}.${className}`;
      
      if (!type || type === 'class') {
        if (className.toLowerCase().includes(queryLower)) {
          results.push({
            type: 'class',
            className: fullName,
            name: className,
            sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
          });
        }
      }
      
      if (!type || type === 'field') {
        for (const field of classInfo.fields) {
          if (field.name.toLowerCase().includes(queryLower)) {
            results.push({
              type: 'field',
              className: fullName,
              name: field.name,
              signature: `${field.type} ${field.name}`,
              sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
            });
          }
        }
      }
      
      if (!type || type === 'method') {
        for (const method of classInfo.methods) {
          if (method.name.toLowerCase().includes(queryLower)) {
            results.push({
              type: 'method',
              className: fullName,
              name: method.name,
              signature: this.formatMethodSignature(method),
              sourcePath: this.resolveSourcePath(classInfo.sourcePath, namespace),
              lineStart: method.lineStart,
            });
          }
        }
      }
    }
  }
  
  getClass(className: string): { info: ClassInfo; source: string; sourcePath: string } | null {
    const manifest = this.getManifest();
    if (!manifest) return null;
    
    const { packageName, simpleClassName, namespace } = this.parseClassName(className);
    
    const pkgIndex = this.getPackage(namespace, packageName);
    if (!pkgIndex) return null;
    
    const classInfo = pkgIndex.classes[simpleClassName];
    if (!classInfo) return null;
    
    const sourcePath = this.resolveSourcePath(classInfo.sourcePath, namespace);
    const source = this.readSource(sourcePath);
    
    if (!source) return null;
    
    return { info: classInfo, source, sourcePath };
  }
  
  getMethod(
    className: string,
    methodName: string,
    signatureHint?: string
  ): { method: MethodInfo; source: string; classInfo: ClassInfo; sourcePath: string } | null {
    const classResult = this.getClass(className);
    if (!classResult) return null;
    
    const { info, source, sourcePath } = classResult;
    
    let method = info.methods.find(m => m.name === methodName);
    
    if (!method) {
      method = info.methods.find(m => 
        m.name.toLowerCase() === methodName.toLowerCase()
      );
    }
    
    if (!method) return null;
    
    const methodSource = this.extractMethodSource(source, method);
    
    return { 
      method, 
      source: methodSource, 
      classInfo: info, 
      sourcePath 
    };
  }
  
  private parseClassName(fullName: string): { packageName: string; simpleClassName: string; namespace: 'minecraft' | 'fabric' } {
    const parts = fullName.split('.');
    
    if (fullName.startsWith('net.fabricmc')) {
      const className = parts.pop() || '';
      return {
        packageName: parts.join('.'),
        simpleClassName: className,
        namespace: 'fabric',
      };
    }
    
    const className = parts.pop() || '';
    return {
      packageName: parts.join('.'),
      simpleClassName: className,
      namespace: 'minecraft',
    };
  }
  
  private getPackage(namespace: 'minecraft' | 'fabric', packageName: string): PackageIndex | null {
    const cacheKey = `${namespace}:${packageName}`;
    
    if (!this.packageCache.has(cacheKey)) {
      const pkg = loadPackageIndex(namespace, packageName);
      if (pkg) {
        this.packageCache.set(cacheKey, pkg);
      }
    }
    
    return this.packageCache.get(cacheKey) || null;
  }
  
  private resolveSourcePath(storedPath: string, namespace: 'minecraft' | 'fabric'): string {
    if (path.isAbsolute(storedPath)) {
      return storedPath;
    }
    
    const manifest = this.getManifest();
    if (!manifest) return storedPath;
    
    if (namespace === 'fabric' && manifest.fabricApiVersion) {
      return path.join(getFabricApiCacheDir(manifest.fabricApiVersion), storedPath);
    }
    
    return path.join(getMinecraftSourceDir(manifest.minecraftVersion), storedPath);
  }
  
  private readSource(sourcePath: string): string | null {
    if (!fs.existsSync(sourcePath)) return null;
    return fs.readFileSync(sourcePath, 'utf-8');
  }
  
  private formatMethodSignature(method: MethodInfo): string {
    const params = method.params.map(p => `${p.type} ${p.name}`).join(', ');
    return `${method.returnType} ${method.name}(${params})`;
  }
  
  private extractMethodSource(source: string, method: MethodInfo): string {
    const lines = source.split('\n');
    const startLine = Math.max(0, method.lineStart - 3);
    const endLine = Math.min(lines.length, method.lineEnd + 3);
    
    return lines.slice(startLine, endLine).join('\n');
  }
}

export const sourceStore = new SourceStore();
