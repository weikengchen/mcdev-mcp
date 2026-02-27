import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildIndex, loadPackageIndex } from '../src/indexer/index.js';
import { parseJavaContent } from '../src/indexer/parser.js';

describe('Index Builder', () => {
  const tempDir = path.join(os.tmpdir(), 'mcdev-mcp-test-' + Date.now());
  
  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  test('builds index from test sources', async () => {
    const testPackageDir = path.join(tempDir, 'net', 'minecraft', 'test');
    fs.mkdirSync(testPackageDir, { recursive: true });
    
    const javaCode = `
package net.minecraft.test;

public class TestClass extends BaseClass implements TestInterface {
    public static final int CONSTANT = 1;
    private String name;
    
    public void doSomething() {
    }
    
    public int calculate(int a, int b) {
        return a + b;
    }
}
`;
    
    fs.writeFileSync(path.join(testPackageDir, 'TestClass.java'), javaCode);
    
    const indexDir = path.join(tempDir, 'index');
    const manifestPath = path.join(indexDir, 'manifest.json');
    
    const result = await buildIndex({
      minecraftSourceDir: tempDir,
      fabricApiSourceDir: null,
      minecraftVersion: '1.0.0-test',
      fabricApiVersion: null,
    });
    
    expect(result.minecraftPackages).toContain('net.minecraft.test');
    expect(result.totalClasses).toBeGreaterThan(0);
  });
});

describe('Package Index Loader', () => {
  test('returns null for non-existent package', () => {
    const result = loadPackageIndex('minecraft', 'non.existent.package');
    expect(result).toBeNull();
  });
});
