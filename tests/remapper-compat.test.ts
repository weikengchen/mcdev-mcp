import { needsRemapping } from '../src/decompiler/remapper.js';

describe('newer Minecraft version remapping compatibility', () => {
  test('treats dotted 26.x snapshots as unobfuscated', () => {
    expect(needsRemapping('26.2-snapshot-4')).toBe(false);
  });

  test('treats weekly 26w snapshots as unobfuscated', () => {
    expect(needsRemapping('26w14a')).toBe(false);
  });
});
