import { app, BrowserWindow, dialog } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PORT = Number(process.env.WDPCM_API_PORT ?? 7589);
const SOCKET_PORT = Number(process.env.WDPCM_SOCKET_PORT ?? 7590);

let mainWindow = null;
let stopBackendRef = async () => {};
let backendStopped = false;
let quitting = false;
let frontendServer = null;
let frontendServerUrl = '';

function resolveBackendEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
  }
  return path.join(__dirname, '..', 'backend', 'dist', 'index.js');
}

function resolveFrontendBuildPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'build');
  }
  return path.join(__dirname, '..', 'frontend', 'build');
}

function resolveWindowIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'wdpcm-logo.png');
  }
  return path.join(__dirname, '..', 'wdpcm-logo.png');
}

function configureDesktopEnvironment() {
  process.env.WDPCM_DB_PATH = path.join(app.getPath('userData'), 'data.db');
  process.env.WDPCM_OPEN_BROWSER = '0';
  process.env.WDPCM_API_PORT = String(API_PORT);
  process.env.WDPCM_SOCKET_PORT = String(SOCKET_PORT);
  process.env.WDPCM_RENDERER_API_URL = `http://127.0.0.1:${API_PORT}`;
  process.env.WDPCM_RENDERER_SOCKET_URL = `http://127.0.0.1:${SOCKET_PORT}`;
}

async function startBackendRuntime() {
  const backendEntryPath = resolveBackendEntryPath();
  if (!existsSync(backendEntryPath)) {
    throw new Error(
      `Backend build not found at ${backendEntryPath}. Run "npm --prefix backend run build" first.`
    );
  }

  const backendModule = await import(pathToFileURL(backendEntryPath).href);
  if (typeof backendModule.startBackend !== 'function') {
    throw new Error('backend/dist/index.js does not export startBackend()');
  }
  if (typeof backendModule.stopBackend !== 'function') {
    throw new Error('backend/dist/index.js does not export stopBackend()');
  }

  backendModule.startBackend({
    apiPort: API_PORT,
    socketPort: SOCKET_PORT,
    openBrowser: false
  });

  stopBackendRef = async () => {
    await backendModule.stopBackend();
  };
}

async function stopBackendRuntime() {
  if (backendStopped) {
    return;
  }
  backendStopped = true;
  await stopBackendRef();
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8'
  };
  return types[extension] ?? 'application/octet-stream';
}

function resolveStaticPath(frontendRoot, pathname) {
  const relativePath = pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(frontendRoot, relativePath);
  if (resolvedPath === frontendRoot || resolvedPath.startsWith(`${frontendRoot}${path.sep}`)) {
    return resolvedPath;
  }
  return null;
}

function sendFile(filePath, response) {
  response.writeHead(200, {
    'Content-Type': getContentType(filePath)
  });
  createReadStream(filePath)
    .on('error', () => {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      response.end('Internal server error');
    })
    .pipe(response);
}

async function startFrontendServer() {
  if (frontendServer && frontendServerUrl) {
    return frontendServerUrl;
  }

  const frontendRoot = resolveFrontendBuildPath();
  const indexPath = path.join(frontendRoot, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(
      `Frontend build not found at ${indexPath}. Run "npm --prefix frontend run build" first.`
    );
  }

  frontendServer = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const staticPath = resolveStaticPath(frontendRoot, decodeURIComponent(requestUrl.pathname));
      if (!staticPath) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      if (existsSync(staticPath) && statSync(staticPath).isFile()) {
        sendFile(staticPath, response);
        return;
      }

      if (path.extname(staticPath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      sendFile(indexPath, response);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    frontendServer.once('error', reject);
    frontendServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = frontendServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine frontend server address');
  }

  frontendServerUrl = `http://127.0.0.1:${address.port}`;
  return frontendServerUrl;
}

async function stopFrontendServer() {
  if (!frontendServer) {
    return;
  }

  const serverToClose = frontendServer;
  frontendServer = null;
  frontendServerUrl = '';

  await new Promise((resolve) => {
    serverToClose.close(() => resolve());
  });
}

async function stopDesktopRuntime() {
  await Promise.allSettled([stopBackendRuntime(), stopFrontendServer()]);
}

async function createMainWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const frontendUrl = await startFrontendServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    console.error(`Renderer load failed (${code}) for ${validatedUrl}: ${description}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  await mainWindow.loadURL(frontendUrl);
}

async function bootstrap() {
  configureDesktopEnvironment();
  await startBackendRuntime();
  await createMainWindow();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);
    dialog.showErrorBox('WDPCM failed to start', details);
    await stopDesktopRuntime();
    app.quit();
    return;
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        await createMainWindow();
      } catch (error) {
        const details = error instanceof Error ? error.stack ?? error.message : String(error);
        dialog.showErrorBox('WDPCM window failed to open', details);
      }
    }
  });
});

app.on('before-quit', async (event) => {
  if (quitting) {
    return;
  }
  quitting = true;
  event.preventDefault();
  try {
    await stopDesktopRuntime();
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
