import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import { ensureDir, getHomeDir } from '../utils/paths.js';
import { getCallgraphDir, getCallgraphDbPath } from './query.js';

const SPECIAL_SOURCE_VERSION = '1.11.4';

export function getJavaCGDir(): string {
  return path.join(getHomeDir(), 'java-callgraph2');
}

export function getJavaCGJarPath(): string {
  // gen_run_jar creates jar_output_dir/jar/run_javacg2.jar
  return path.join(getJavaCGDir(), 'jar_output_dir', 'jar', 'run_javacg2.jar');
}

export function getJavaCGLibDir(): string {
  return path.join(getJavaCGDir(), 'jar_output_dir', 'lib');
}

export function getDecompilerMCDir(): string {
  return path.join(getHomeDir(), 'DecompilerMC');
}

export function getRemappedJarPath(version: string): string {
  return path.join(getCallgraphDir(version), 'client-remapped.jar');
}

export type ProgressCallback = (stage: string, progress: number, message: string) => void;

export async function ensureJavaCG(progressCb?: ProgressCallback): Promise<string> {
  const jarPath = getJavaCGJarPath();
  if (fs.existsSync(jarPath)) return jarPath;
  
  const jcDir = getJavaCGDir();
  
  if (progressCb) progressCb('javacg', 0, 'Cloning java-callgraph2...');
  
  if (!fs.existsSync(jcDir)) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('git', ['clone', 'https://github.com/Adrninistrator/java-callgraph2.git', jcDir], { stdio: 'inherit' });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`git clone failed: ${code}`)));
    });
  }
  
  // Update gradle wrapper to Gradle 9.3.1 (supports Java 25)
  const gradleWrapperProps = path.join(jcDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (fs.existsSync(gradleWrapperProps)) {
    fs.writeFileSync(gradleWrapperProps, 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip\n');
  }
  
  // Make gradlew executable
  const gradlewPath = path.join(jcDir, 'gradlew');
  if (fs.existsSync(gradlewPath)) {
    fs.chmodSync(gradlewPath, 0o755);
  }
  
  // Patch build.gradle for Gradle 9.x compatibility (remove deprecated properties)
  const buildGradlePath = path.join(jcDir, 'build.gradle');
  if (fs.existsSync(buildGradlePath)) {
    let buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
    buildGradle = buildGradle.replace(/sourceCompatibility\s*=\s*1\.8\s*\n?/g, '');
    buildGradle = buildGradle.replace(/targetCompatibility\s*=\s*1\.8\s*\n?/g, '');
    fs.writeFileSync(buildGradlePath, buildGradle);
  }
  
  if (progressCb) progressCb('javacg', 50, 'Building java-callgraph2 with Gradle 9.3...');
  
  // Use gen_run_jar task instead of shadowJar (creates run_javacg2.jar with lib/ folder)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('./gradlew', ['gen_run_jar'], { cwd: jcDir, stdio: 'inherit' });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`gradle build failed: ${code}`)));
  });
  
  if (progressCb) progressCb('javacg', 100, 'java-callgraph2 ready.');
  return jarPath;
}

export async function ensureRemappedJar(version: string, progressCb?: ProgressCallback): Promise<string> {
  const remappedJar = getRemappedJarPath(version);
  if (fs.existsSync(remappedJar)) return remappedJar;
  
  const dmcdDir = getDecompilerMCDir();
  const clientJar = path.join(dmcdDir, 'versions', version, 'client.jar');
  const tsrgMappings = path.join(dmcdDir, 'mappings', version, 'client.tsrg');
  const specialSource = path.join(dmcdDir, 'lib', `SpecialSource-${SPECIAL_SOURCE_VERSION}.jar`);
  
  if (progressCb) progressCb('remap', 0, 'Creating remapped jar...');
  ensureDir(path.dirname(remappedJar));
  
  return new Promise((resolve, reject) => {
    const proc = spawn('java', ['-Xmx2g', '-jar', specialSource, '--in-jar', clientJar, '--out-jar', remappedJar, '--srg-in', tsrgMappings, '--kill-lvt'], { stdio: 'inherit' });
    proc.on('close', (code) => code === 0 && fs.existsSync(remappedJar) ? (progressCb?.('remap', 100, 'Remapped jar created.'), resolve(remappedJar)) : reject(new Error(`SpecialSource failed: ${code}`)));
  });
}

export async function generateCallgraph(version: string, progressCb?: ProgressCallback): Promise<string> {
  const javacgPath = await ensureJavaCG(progressCb);
  const libDir = getJavaCGLibDir();
  const outputDir = getCallgraphDir(version);
  const remappedJar = await ensureRemappedJar(version, progressCb);
  // java-callgraph2 outputs to {jar}-output_javacg2/method_call.txt
  const expectedOutput = path.join(outputDir, `${path.basename(remappedJar)}-output_javacg2`, 'method_call.txt');
  
  if (fs.existsSync(expectedOutput)) return expectedOutput;
  
  ensureDir(outputDir);
  if (progressCb) progressCb('callgraph', 0, 'Generating callgraph...');
  
  // java-callgraph2 expects config in _javacg2_config/ directory
  const configDir = path.join(outputDir, '_javacg2_config');
  ensureDir(configDir);
  fs.writeFileSync(path.join(configDir, 'jar_dir.properties'), remappedJar);
  fs.writeFileSync(path.join(configDir, 'config.properties'), `output.dir=${outputDir}\nparse.method.call.info=1\n`);
  
  // Build classpath: jar + all libs
  const libJars = fs.existsSync(libDir) 
    ? fs.readdirSync(libDir).filter(f => f.endsWith('.jar')).map(f => path.join(libDir, f))
    : [];
  const classpath = [javacgPath, ...libJars].join(':');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('java', ['-Xmx4g', '-cp', classpath, 'com.adrninistrator.javacg2.entry.JavaCG2Entry', configDir], { cwd: outputDir, stdio: 'inherit' });
    proc.on('close', (code) => code === 0 || fs.existsSync(expectedOutput) ? (progressCb?.('callgraph', 100, 'Callgraph generated.'), resolve(expectedOutput)) : reject(new Error(`java-callgraph2 failed: ${code}`)));
  });
}

export function hasCallgraphDb(version: string): boolean {
  return fs.existsSync(getCallgraphDbPath(version));
}

export function parseCallgraphAndCreateDb(version: string, callgraphFile: string, progressCb?: ProgressCallback): number {
  if (progressCb) progressCb('index', 0, 'Parsing callgraph...');
  
  const content = fs.readFileSync(callgraphFile, 'utf-8');
  const lines = content.split('\n');
  const dbPath = getCallgraphDbPath(version);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE calls (id INTEGER PRIMARY KEY, caller_class TEXT, caller_method TEXT, caller_desc TEXT, callee_class TEXT, callee_method TEXT, callee_desc TEXT, line_number INTEGER); CREATE INDEX idx_callee ON calls(callee_class, callee_method); CREATE INDEX idx_caller ON calls(caller_class, caller_method);`);
  
  const insert = db.prepare('INSERT INTO calls VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)');
  const insertMany = db.transaction((items: any[][]) => { for (const item of items) insert.run(...item); });
  
  let count = 0;
  const batch: any[][] = [];
  
  // Format: seq	num	caller	callee	line	return_type	...
  // caller format: class:method(args)
  // callee format: (TYPE)class:method(args) where TYPE is VIR/STA/SPE
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    
    const callerRaw = parts[2] || '';
    const calleeRaw = parts[3] || '';
    const lineNumber = parts[4] ? parseInt(parts[4], 10) : null;
    
    // Parse caller: class:method(args)
    const callerMatch = callerRaw.match(/^(.+):(.+)(\([^)]*\))$/);
    // Parse callee: (TYPE)class:method(args)
    const calleeMatch = calleeRaw.match(/^\([A-Z]+\)(.+):(.+)(\([^)]*\))$/);
    
    if (callerMatch && calleeMatch) {
      batch.push([
        callerMatch[1], callerMatch[2], callerMatch[3],
        calleeMatch[1], calleeMatch[2], calleeMatch[3],
        lineNumber
      ]);
      if (batch.length >= 10000) {
        insertMany(batch);
        count += batch.length;
        batch.length = 0;
        if (progressCb && count % 100000 === 0) progressCb('index', 50, `Indexed ${count}...`);
      }
    }
  }
  if (batch.length > 0) { insertMany(batch); count += batch.length; }
  db.pragma('optimize');
  db.close();
  if (progressCb) progressCb('index', 100, `Indexed ${count} call references.`);
  return count;
}

export async function ensureCallgraph(version: string, progressCb?: ProgressCallback): Promise<void> {
  if (hasCallgraphDb(version)) { if (progressCb) progressCb('callgraph', 100, 'Callgraph database ready.'); return; }
  const callgraphFile = await generateCallgraph(version, progressCb);
  parseCallgraphAndCreateDb(version, callgraphFile, progressCb);
}

export { openDb, closeDb, findCallers, findCallees, searchMethods, getCallgraphStats } from './query.js';
