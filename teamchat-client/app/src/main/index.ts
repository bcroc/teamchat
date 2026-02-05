import { app, BrowserWindow, shell, ipcMain, dialog, session, safeStorage } from 'electron';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { isPathWithin } from './pathUtils';

// Security: Disable hardware acceleration if not needed (optional performance trade-off)
// app.disableHardwareAcceleration();

// Keep reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

/**
 * Check if an IP address is within the Tailscale CGNAT range (100.64.0.0/10)
 * Valid range: 100.64.0.0 - 100.127.255.255
 */
function isTailscaleIP(ip: string): boolean {
  const match = ip.match(/^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const secondOctet = parseInt(match[1], 10);
  const thirdOctet = parseInt(match[2], 10);
  const fourthOctet = parseInt(match[3], 10);

  if (thirdOctet > 255 || fourthOctet > 255) return false;

  return secondOctet >= 64 && secondOctet <= 127;
}

/**
 * Check if a URL points to a Tailscale IP address
 */
function isTailscaleUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return isTailscaleIP(urlObj.hostname);
  } catch {
    return false;
  }
}

// Allowed external origins for API/WebSocket connections
const ALLOWED_EXTERNAL_ORIGINS = isDev
  ? ['http://localhost:3001', 'ws://localhost:3001', 'http://localhost:5173']
  : ['https://api.teamchat.com', 'wss://api.teamchat.com'];

/**
 * Validate if a URL is safe to navigate to
 */
function isUrlSafe(url: string, appUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    // Allow internal app URLs
    if (url.startsWith(appUrl) || url.startsWith('file://')) {
      return true;
    }
    // Allow Tailscale IPs (100.64.x.x - 100.127.x.x)
    if (isTailscaleIP(urlObj.hostname)) {
      return true;
    }
    // In production, be more restrictive
    if (!isDev) {
      return false;
    }
    // In development, allow localhost
    return urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    backgroundColor: '#1a1a2e', // Prevent white flash on load
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security settings
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Disable experimental features that could be attack vectors
      experimentalFeatures: false,
      // Disable remote module (deprecated but still available)
      enableBlinkFeatures: '',
    },
  });

  // Content Security Policy - stricter and more comprehensive
  // Note: Tailscale IPs (100.64.x.x - 100.127.x.x) are allowed for tailnet communication
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Dev needs eval for HMR
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' ws://localhost:* http://localhost:* ws://100.* http://100.*",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob:",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'", // CSS-in-JS often needs this
          "connect-src 'self' wss://*.teamchat.com https://*.teamchat.com ws://100.* http://100.*",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob:",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
      },
    });
  });

  // Show window when ready to prevent white flash
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in browser (safely)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open http/https URLs externally
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // In production, could whitelist specific domains
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Prevent navigation to external URLs
  const appUrl = isDev ? 'http://localhost:5173' : `file://${join(__dirname, '../renderer/index.html')}`;
  
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isUrlSafe(url, appUrl)) {
      console.warn(`[Security] Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });

  // Block new window creation from renderer
  mainWindow.webContents.on('did-create-window', (window) => {
    // Close any windows the renderer tries to create
    window.close();
  });

  // Load the app
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set up IPC handlers
  setupIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

// Secure token storage path
const TOKEN_FILE = join(app.getPath('userData'), '.auth-token');
const E2EE_KEY_FILE = join(app.getPath('userData'), '.e2ee-private-key');

async function storeSecret(filePath: string, secret: string): Promise<void> {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(secret);
    await writeFile(filePath, encrypted);
  } else {
    console.warn('safeStorage not available, using fallback storage');
    await writeFile(filePath, Buffer.from(secret).toString('base64'));
  }
}

async function readSecret(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data);
    }
    return Buffer.from(data.toString(), 'base64').toString();
  } catch {
    return null;
  }
}

async function deleteSecret(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Securely store token using Electron's safeStorage
 * Falls back to file storage if safeStorage is not available
 */
async function storeTokenSecurely(token: string): Promise<void> {
  await storeSecret(TOKEN_FILE, token);
}

/**
 * Retrieve securely stored token
 */
async function getStoredToken(): Promise<string | null> {
  return await readSecret(TOKEN_FILE);
}

/**
 * Delete stored token
 */
async function deleteStoredToken(): Promise<void> {
  await deleteSecret(TOKEN_FILE);
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Get app version
  ipcMain.handle('app:version', () => app.getVersion());

  // Open file in folder (safe file handling)
  ipcMain.handle('file:showInFolder', async (_, filePath: string) => {
    // Validate path is within downloads or a safe directory
    const downloadsPath = app.getPath('downloads');
    if (!isPathWithin(downloadsPath, filePath)) {
      throw new Error('Access denied');
    }
    shell.showItemInFolder(filePath);
  });

  // Save file dialog
  ipcMain.handle(
    'file:saveDialog',
    async (_, options: { filename: string; data: ArrayBuffer }) => {
      const { filename, data } = options;

      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: join(app.getPath('downloads'), filename),
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      await writeFile(result.filePath, Buffer.from(data));
      return result.filePath;
    }
  );

  // Get display sources for screen sharing
  ipcMain.handle('media:getDisplaySources', async () => {
    const { desktopCapturer } = await import('electron');
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.toDataURL() || null,
    }));
  });

  // Get user data path
  ipcMain.handle('app:getPath', (_, name: 'userData' | 'downloads' | 'temp') => {
    return app.getPath(name);
  });

  // Secure Storage handlers
  ipcMain.handle('secureStorage:isAvailable', () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('secureStorage:setToken', async (_, token: string) => {
    await storeTokenSecurely(token);
  });

  ipcMain.handle('secureStorage:getToken', async () => {
    return await getStoredToken();
  });

  ipcMain.handle('secureStorage:deleteToken', async () => {
    await deleteStoredToken();
  });

  ipcMain.handle('secureStorage:setE2EEKey', async (_, key: string) => {
    await storeSecret(E2EE_KEY_FILE, key);
  });

  ipcMain.handle('secureStorage:getE2EEKey', async () => {
    return await readSecret(E2EE_KEY_FILE);
  });

  ipcMain.handle('secureStorage:deleteE2EEKey', async () => {
    await deleteSecret(E2EE_KEY_FILE);
  });

  // Auto-update handlers
  ipcMain.handle('app:checkForUpdates', async () => {
    // In production, use electron-updater
    // For now, return current version info
    if (isDev) {
      return { updateAvailable: false, currentVersion: app.getVersion() };
    }

    try {
      // Import electron-updater dynamically (only in production builds)
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = false;

      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        return {
          updateAvailable: true,
          currentVersion: app.getVersion(),
          latestVersion: result.updateInfo.version,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      }
      return { updateAvailable: false, currentVersion: app.getVersion() };
    } catch (error) {
      console.error('Update check failed:', error);
      return { updateAvailable: false, currentVersion: app.getVersion() };
    }
  });

  ipcMain.handle('app:installUpdate', async () => {
    if (isDev) return;

    try {
      const { autoUpdater } = await import('electron-updater');
      await autoUpdater.downloadUpdate();
      autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('Update installation failed:', error);
      throw error;
    }
  });
}
