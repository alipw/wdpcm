import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Server } from 'socket.io';
import { spawn } from 'node-pty';
import { exec } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  getAllProcesses,
  getProcessByAlias,
  createProcess,
  updateProcess,
  deleteProcess,
  searchProcesses,
  type ProcessEntry
} from './lib/db.js';
import { env, platform } from 'node:process';
import process from 'node:process';
import { cors } from 'hono/cors';

import type { IPty } from 'node-pty';
import kill from 'tree-kill';
import util from 'node:util';

const killPromise = util.promisify(kill);

const DEFAULT_FRONTEND_URL = 'http://localhost:7591';
const DEFAULT_API_PORT = 7589;
const DEFAULT_SOCKET_PORT = 7590;
const DEFAULT_OPEN_BROWSER = true;

export interface StartBackendOptions {
  apiPort?: number;
  socketPort?: number;
  frontendUrl?: string;
  openBrowser?: boolean;
}

export interface BackendRuntime {
  apiPort: number;
  socketPort: number;
  frontendUrl: string;
  openBrowser: boolean;
}

const app = new Hono();
const managedProcesses = new Map<string, IPty>();
const userShell = env?.SHELL ?? 'bash';

let socketServer: Server | null = null;
let httpServer: ReturnType<typeof serve> | null = null;
let runtime: BackendRuntime | null = null;
let signalHandlersRegistered = false;

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }
  const lowered = value.toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(lowered)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(lowered)) {
    return false;
  }
  return fallback;
}

function openBrowser(url: string) {
  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
    linux: `xdg-open "${url}"`
  };

  const command = commands[platform];
  if (command) {
    exec(command, (err) => {
      if (err) {
        console.log(`Could not open browser automatically. Please visit: ${url}`);
      }
    });
  }
}

async function stopManagedProcess(alias: string): Promise<void> {
  const pty = managedProcesses.get(alias);
  if (!pty) {
    return;
  }

  try {
    await killPromise(pty.pid);
  } catch (error) {
    console.error(`Failed to kill process tree for PID ${pty.pid}`, error);
  } finally {
    managedProcesses.delete(alias);
  }
}

async function stopAllManagedProcesses(): Promise<void> {
  const aliases = Array.from(managedProcesses.keys());
  await Promise.allSettled(aliases.map((alias) => stopManagedProcess(alias)));
}

function wireSocketHandlers(server: Server): void {
  server.on('connection', (socket) => {
    socket.on('pty-resize', (data: { alias: string; cols: number; rows: number }) => {
      const pty = managedProcesses.get(data.alias);
      if (!pty) {
        return;
      }
      try {
        pty.resize(data.cols, data.rows);
      } catch (error) {
        console.error(error);
      }
    });
  });
}

async function closeHttpServer(): Promise<void> {
  if (!httpServer) {
    return;
  }
  const serverToClose = httpServer;
  httpServer = null;

  await new Promise<void>((resolve) => {
    serverToClose.close(() => resolve());
  });
}

async function closeSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  const serverToClose = socketServer;
  socketServer = null;

  await new Promise<void>((resolve) => {
    serverToClose.close(() => resolve());
  });
}

function registerSignalHandlers(): void {
  if (signalHandlersRegistered) {
    return;
  }
  signalHandlersRegistered = true;

  const shutdown = async (signal: string) => {
    try {
      await stopBackend();
    } catch (error) {
      console.error(`Failed to shut down cleanly on ${signal}`, error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('beforeExit', () => {
    managedProcesses.forEach((pty) => {
      pty.kill('SIGTERM');
    });
    managedProcesses.clear();
  });
}

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false
  })
);

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/processes', (c) => {
  try {
    const search = c.req.query('search');
    const processes = search ? searchProcesses(search) : getAllProcesses();

    const withStatus = processes.map((proc: ProcessEntry) => ({
      ...proc,
      status: managedProcesses.has(proc.alias) ? 'running' : 'stopped'
    }));

    return c.json(withStatus);
  } catch (error) {
    return c.json({ error: 'Failed to fetch processes' }, 500);
  }
});

app.post('/processes', async (c) => {
  try {
    const { alias, command } = await c.req.json();

    if (!alias || !command) {
      return c.json({ error: 'Alias and command are required' }, 400);
    }

    if (alias.includes(' ')) {
      return c.json({ error: 'Alias cannot contain spaces' }, 400);
    }

    if (getProcessByAlias(alias)) {
      return c.json({ error: 'Process with this alias already exists' }, 409);
    }

    const created = createProcess(alias, command);
    return c.json(created, 201);
  } catch (error) {
    return c.json({ error: 'Failed to create process' }, 500);
  }
});

app.put('/processes/:alias', async (c) => {
  try {
    const alias = c.req.param('alias');
    const { command } = await c.req.json();

    if (!command) {
      return c.json({ error: 'Command is required' }, 400);
    }

    if (!getProcessByAlias(alias)) {
      return c.json({ error: 'Process not found' }, 404);
    }

    updateProcess(alias, command);
    return c.json({ alias, command });
  } catch (error) {
    return c.json({ error: 'Failed to update process' }, 500);
  }
});

app.delete('/processes/:alias', async (c) => {
  try {
    const alias = c.req.param('alias');

    await stopManagedProcess(alias);

    if (!deleteProcess(alias)) {
      return c.json({ error: 'Process not found' }, 404);
    }

    return c.json({ message: 'Process deleted', alias });
  } catch (error) {
    return c.json({ error: 'Failed to delete process' }, 500);
  }
});

app.post('/processes/start/:alias', (c) => {
  const alias = c.req.param('alias');
  const proc = getProcessByAlias(alias);
  if (!proc) {
    return c.json({ error: 'Process not found' }, 404);
  }

  const pty = spawn(userShell, ['-c', proc.command], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    env: {
      ...env
    }
  });

  managedProcesses.set(alias, pty);

  socketServer?.emit('process-started', {
    alias,
    pid: pty.pid
  });

  pty.onData((data) => {
    socketServer?.emit('process-data', {
      alias,
      data
    });
  });

  pty.onExit((event) => {
    socketServer?.emit('process-exited', {
      alias,
      code: event.exitCode,
      signal: event.signal
    });
    managedProcesses.delete(alias);
  });

  return c.json({ message: 'Process started', pid: pty.pid, alias });
});

app.post('/processes/stop/:alias', async (c) => {
  const alias = c.req.param('alias');
  const pty = managedProcesses.get(alias);
  if (!pty) {
    return c.json({ message: 'Process was not running or already stopped', alias }, 200);
  }

  try {
    await killPromise(pty.pid);
  } catch (error) {
    console.error(`Failed to kill process tree for PID ${pty.pid}`, error);
    return c.json({ error: 'Failed to stop process' }, 500);
  }

  managedProcesses.delete(alias);
  socketServer?.emit('process-stopped', {
    alias,
    pid: pty.pid
  });

  return c.json({ message: 'Process tree stopped', alias });
});

export function startBackend(options: StartBackendOptions = {}): BackendRuntime {
  if (runtime) {
    return runtime;
  }

  const apiPort = options.apiPort ?? parsePort(env.WDPCM_API_PORT, DEFAULT_API_PORT);
  const socketPort = options.socketPort ?? parsePort(env.WDPCM_SOCKET_PORT, DEFAULT_SOCKET_PORT);
  const frontendUrl = options.frontendUrl ?? env.WDPCM_FRONTEND_URL ?? DEFAULT_FRONTEND_URL;
  const shouldOpenBrowser =
    options.openBrowser ?? parseBoolean(env.WDPCM_OPEN_BROWSER, DEFAULT_OPEN_BROWSER);

  socketServer = new Server(socketPort, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  wireSocketHandlers(socketServer);

  httpServer = serve(
    {
      fetch: app.fetch,
      port: apiPort
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
      if (shouldOpenBrowser) {
        console.log(`Opening frontend at ${frontendUrl}`);
        openBrowser(frontendUrl);
      }
    }
  );

  runtime = {
    apiPort,
    socketPort,
    frontendUrl,
    openBrowser: shouldOpenBrowser
  };

  registerSignalHandlers();
  return runtime;
}

export async function stopBackend(): Promise<void> {
  if (!runtime) {
    return;
  }

  runtime = null;
  await Promise.allSettled([stopAllManagedProcesses(), closeSocketServer(), closeHttpServer()]);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === import.meta.url;
}

if (isDirectRun()) {
  startBackend();
}
