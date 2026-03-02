import { spawn } from 'child_process';
import type { ProgressCallback } from './tools.js';
import { ensureDir } from '../utils/paths.js';

export async function decompile(
  vineflowerJar: string,
  inputJar: string,
  outputDir: string,
  progressCb?: ProgressCallback
): Promise<void> {
  ensureDir(outputDir);

  if (progressCb) {
    progressCb('decompile', 0, 'Decompiling with Vineflower (8 threads)...');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-jar', vineflowerJar,
      '-j=8',
      '--decompile-generics=1',
      '--bytecode-source-mapping=1',
      '--remove-synthetic=1',
      '--log-level=error',
      inputJar,
      outputDir
    ];

    const proc = spawn('java', args, {
      stdio: ['inherit', 'ignore', 'ignore'],
    });

    proc.on('close', (code) => {
      if (code === 0) {
        if (progressCb) progressCb('decompile', 100, 'Decompilation complete.');
        resolve();
      } else {
        reject(new Error(`Vineflower failed (exit code ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run Vineflower: ${err.message}`));
    });
  });
}
