import { contextBridge, ipcRenderer } from 'electron';

/**
 * Validate that a string doesn't contain path traversal attempts
 */
function validatePath(path: string): boolean {
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('\0')) {
    return false;
  }
  // Ensure absolute paths on Unix or Windows
  if (!path.startsWith('/') && !path.match(/^[A-Z]:\\/i)) {
    return false;
  }
  return true;
}

/**
 * Sanitize filename to prevent injection
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  return filename.replace(/[/\\:\0]/g, '_').trim();
}

// Exposed API types
export interface ElectronAPI {
  // App
  getVersion: () => Promise<string>;
  getPath: (name: 'userData' | 'downloads' | 'temp') => Promise<string>;
  checkForUpdates: () => Promise<{ updateAvailable: boolean; currentVersion: string; downloadUrl?: string }>;
  installUpdate: () => Promise<void>;
  onUpdateDownloaded: (callback: () => void) => void;

  // Secure Storage (for auth tokens)
  secureStorage: {
    isAvailable: () => Promise<boolean>;
    setToken: (token: string) => Promise<void>;
    getToken: () => Promise<string | null>;
    deleteToken: () => Promise<void>;
    setE2EEKey: (key: string) => Promise<void>;
    getE2EEKey: () => Promise<string | null>;
    deleteE2EEKey: () => Promise<void>;
  };

  // Files
  showInFolder: (filePath: string) => Promise<void>;
  saveFile: (options: { filename: string; data: ArrayBuffer }) => Promise<string | null>;

  // Media
  getDisplaySources: () => Promise<DisplaySource[]>;

  // Platform info
  platform: NodeJS.Platform;
}

export interface DisplaySource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

// Type-safe IPC bridge with input validation
const electronAPI: ElectronAPI = {
  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPath: (name) => {
    // Validate the path name is one of the allowed values
    const allowedPaths = ['userData', 'downloads', 'temp'] as const;
    if (!allowedPaths.includes(name)) {
      return Promise.reject(new Error('Invalid path name'));
    }
    return ipcRenderer.invoke('app:getPath', name);
  },
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('app:updateDownloaded', callback);
  },

  // Secure Storage - uses Electron's safeStorage for encrypted token storage
  secureStorage: {
    isAvailable: () => ipcRenderer.invoke('secureStorage:isAvailable'),
    setToken: (token: string) => {
      if (!token || typeof token !== 'string') {
        return Promise.reject(new Error('Invalid token'));
      }
      // Basic JWT format validation
      if (!token.match(/^[\w-]+\.[\w-]+\.[\w-]+$/)) {
        return Promise.reject(new Error('Invalid token format'));
      }
      return ipcRenderer.invoke('secureStorage:setToken', token);
    },
    getToken: () => ipcRenderer.invoke('secureStorage:getToken'),
    deleteToken: () => ipcRenderer.invoke('secureStorage:deleteToken'),
    setE2EEKey: (key: string) => {
      if (!key || typeof key !== 'string') {
        return Promise.reject(new Error('Invalid key'));
      }
      return ipcRenderer.invoke('secureStorage:setE2EEKey', key);
    },
    getE2EEKey: () => ipcRenderer.invoke('secureStorage:getE2EEKey'),
    deleteE2EEKey: () => ipcRenderer.invoke('secureStorage:deleteE2EEKey'),
  },

  // Files
  showInFolder: (filePath) => {
    // Validate the file path
    if (!filePath || typeof filePath !== 'string') {
      return Promise.reject(new Error('Invalid file path'));
    }
    if (!validatePath(filePath)) {
      return Promise.reject(new Error('Path validation failed'));
    }
    return ipcRenderer.invoke('file:showInFolder', filePath);
  },
  saveFile: (options) => {
    // Validate options
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('Invalid options'));
    }
    if (!options.filename || typeof options.filename !== 'string') {
      return Promise.reject(new Error('Invalid filename'));
    }
    if (!(options.data instanceof ArrayBuffer)) {
      return Promise.reject(new Error('Invalid data'));
    }
    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(options.filename);
    return ipcRenderer.invoke('file:saveDialog', {
      filename: sanitizedFilename,
      data: options.data,
    });
  },

  // Media
  getDisplaySources: () => ipcRenderer.invoke('media:getDisplaySources'),

  // Platform info (useful for OS-specific UI adjustments)
  platform: process.platform,
};

// Expose in main world
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript type declaration for renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
