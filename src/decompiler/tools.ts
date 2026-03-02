import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import { getVineflowerPath, ensureDir } from '../utils/paths.js';
import { VINEFLOWER_URL } from '../utils/config.js';

export type ProgressCallback = (stage: string, progress: number, message: string) => void;

async function downloadFile(url: string, dest: string, progressCb?: ProgressCallback, stage: string = 'download'): Promise<void> {
  ensureDir(path.dirname(dest));
  
  return new Promise((resolve, reject) => {
    let downloaded = 0;
    let total = 0;
    
    const request = (url: string, file: fs.WriteStream) => {
      https.get(url, { timeout: 60000 }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(dest);
            const newFile = fs.createWriteStream(dest);
            request(redirectUrl, newFile);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          return;
        }
        
        total = parseInt(response.headers['content-length'] || '0', 10);
        downloaded = 0;
        
        let lastPercent = 0;
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0 && progressCb) {
            const percent = Math.round((downloaded / total) * 100);
            if (percent >= lastPercent + 5 || percent === 100) {
              lastPercent = percent;
              const mb = (downloaded / 1024 / 1024).toFixed(1);
              const totalMb = (total / 1024 / 1024).toFixed(1);
              progressCb(stage, percent, `Downloading... ${mb}/${totalMb} MB`);
            }
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      }).on('timeout', () => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error('Download timeout'));
      });
    };
    
    request(url, fs.createWriteStream(dest));
  });
}

export async function ensureVineflower(progressCb?: ProgressCallback): Promise<string> {
  const vineflowerPath = getVineflowerPath();
  
  if (fs.existsSync(vineflowerPath)) {
    return vineflowerPath;
  }
  
  if (progressCb) {
    progressCb('tools', 0, 'Downloading Vineflower...');
  }
  
  await downloadFile(VINEFLOWER_URL, vineflowerPath, progressCb, 'tools');
  
  if (progressCb) {
    progressCb('tools', 100, 'Vineflower downloaded.');
  }
  
  return vineflowerPath;
}
