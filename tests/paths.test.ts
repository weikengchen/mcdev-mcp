import { getHomeDir, getCacheDir, getIndexDir, getToolsDir, ensureDir } from '../src/utils/paths.js';
import * as path from 'path';
import * as fs from 'fs';

describe('Paths utilities', () => {
  test('getHomeDir returns correct path', () => {
    const home = getHomeDir();
    expect(home).toContain('.mcdev-mcp');
  });
  
  test('getCacheDir returns correct path', () => {
    const cache = getCacheDir();
    expect(cache).toContain('cache');
  });
  
  test('getIndexDir returns correct path', () => {
    const index = getIndexDir();
    expect(index).toContain('index');
  });
  
  test('getToolsDir returns correct path', () => {
    const tools = getToolsDir();
    expect(tools).toContain('tools');
  });
});

describe('ensureDir', () => {
  const testDir = path.join('/tmp', 'mcdev-test-' + Date.now());
  
  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  test('creates directory if it does not exist', () => {
    ensureDir(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
  });
  
  test('does not fail if directory already exists', () => {
    fs.mkdirSync(testDir, { recursive: true });
    expect(() => ensureDir(testDir)).not.toThrow();
  });
  
  test('creates nested directories', () => {
    const nestedDir = path.join(testDir, 'a', 'b', 'c');
    ensureDir(nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });
});
