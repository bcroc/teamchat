import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { isPathWithin } from '../main/pathUtils';

describe('isPathWithin', () => {
  it('allows paths within the base directory', () => {
    const base = join('/Users', 'test', 'Downloads');
    const target = join(base, 'file.txt');
    expect(isPathWithin(base, target)).toBe(true);
  });

  it('rejects traversal outside the base directory', () => {
    const base = join('/Users', 'test', 'Downloads');
    const target = join(base, '..', 'Secrets', 'file.txt');
    expect(isPathWithin(base, target)).toBe(false);
  });

  it('rejects sibling directories with common prefixes', () => {
    const base = join('/Users', 'test', 'Downloads');
    const target = join('/Users', 'test', 'DownloadsBackup', 'file.txt');
    expect(isPathWithin(base, target)).toBe(false);
  });
});
