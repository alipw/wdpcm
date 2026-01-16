import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Server } from 'socket.io'
import { spawn } from 'node-pty';
import { exec } from 'node:child_process';
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
import { cors } from 'hono/cors'

import type { IPty } from 'node-pty';
import kill from 'tree-kill';
import util from 'node:util';

const killPromise = util.promisify(kill);

const FRONTEND_URL = 'http://localhost:7591';

function openBrowser(url: string) {
  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
    linux: `xdg-open "${url}"`,
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

const app = new Hono()
const managedProcesses = new Map<string, IPty>();
const userShell = env?.SHELL ?? 'bash';

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: false,
}))

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

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
    
    const process = createProcess(alias, command);
    return c.json(process, 201);
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
    
    // Stop the process if it's running
    const pty = managedProcesses.get(alias);
    if (pty) {
      await killPromise(pty.pid);
      managedProcesses.delete(alias);
    }
    
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

  server.emit('process-started', {
    alias,
    pid: pty.pid
  });

  pty.onData((data) => {
    server.emit('process-data', {
      alias,
      data
    });
  });

  pty.onExit((e) => {
    server.emit('process-exited', {
      alias,
      code: e.exitCode,
      signal: e.signal
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
  } catch (err) {
    console.error(`Failed to kill process tree for PID ${pty.pid}`, err);
    return c.json({ error: 'Failed to stop process' }, 500);
  }
  
  managedProcesses.delete(alias);
  server.emit('process-stopped', {
    alias,
    pid: pty.pid
  });

  return c.json({ message: 'Process tree stopped', alias });
});

const server = new Server(7590, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

server.on('connection', (socket) => {
  socket.on('pty-resize', (data: { alias: string, cols: number, rows: number }) => {
    const pty = managedProcesses.get(data.alias);
    if (pty) {
      try {
        pty.resize(data.cols, data.rows);
      } catch(error) {
        console.error(error);
      }
    }
  });
});


serve({
  fetch: app.fetch,
  port: 7589,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  console.log(`Opening frontend at ${FRONTEND_URL}`);
  setTimeout(() => {
    openBrowser(FRONTEND_URL);
  }, 2000)
})

process.on('beforeExit', () => {
  managedProcesses.forEach((pty) => {
    pty.kill('SIGTERM');
  });
  managedProcesses.clear();
});