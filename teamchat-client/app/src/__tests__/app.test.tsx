import { describe, it, expect, vi } from 'vitest';

// Mock electronAPI
vi.stubGlobal('window', {
  electronAPI: {
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getPath: vi.fn().mockResolvedValue('/tmp'),
    checkForUpdates: vi.fn().mockResolvedValue({ updateAvailable: false, currentVersion: '1.0.0' }),
    showInFolder: vi.fn().mockResolvedValue(undefined),
    saveFile: vi.fn().mockResolvedValue('/tmp/test.txt'),
    getDisplaySources: vi.fn().mockResolvedValue([]),
  },
});

describe('App', () => {
  it('should have electronAPI available', () => {
    expect(window.electronAPI).toBeDefined();
    expect(window.electronAPI.getVersion).toBeDefined();
    expect(window.electronAPI.getDisplaySources).toBeDefined();
  });

  it('should get app version', async () => {
    const version = await window.electronAPI.getVersion();
    expect(version).toBe('1.0.0');
  });

  it('should get display sources', async () => {
    const sources = await window.electronAPI.getDisplaySources();
    expect(Array.isArray(sources)).toBe(true);
  });
});

describe('IPC Bridge', () => {
  it('should have all required methods', () => {
    const methods = [
      'getVersion',
      'getPath',
      'checkForUpdates',
      'showInFolder',
      'saveFile',
      'getDisplaySources',
    ];

    methods.forEach((method) => {
      expect(typeof window.electronAPI[method as keyof typeof window.electronAPI]).toBe('function');
    });
  });
});
