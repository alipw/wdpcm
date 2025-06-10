import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Server } from 'socket.io'
import { spawn } from 'node-pty';
import { parseProcessesFile } from './lib/parser.js';
import { env } from 'node:process';
import process from 'node:process';
import { cors } from 'hono/cors'

import type { ProcessEntry } from './lib/parser.js';
import type { IPty } from 'node-pty';

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
    let processes = parseProcessesFile('processes.tbl');
    const search = c.req.query('search');
    processes = processes.map((process: ProcessEntry) => {
      const pty = managedProcesses.get(process.alias);
      return {
        ...process,
        status: pty ? 'running' : 'stopped'
      }
    });

    if (search) {
      const searchLower = search.toLowerCase();
      const filtered = processes.filter((process: ProcessEntry) =>
        process.alias.toLowerCase().includes(searchLower) ||
        process.command.toLowerCase().includes(searchLower)
      );
      return c.json(filtered);
    }

    return c.json(processes);
  } catch (error) {
    return c.json({ error: 'Failed to parse processes file' }, 500);
  }
});

app.post('/processes/start/:alias', (c) => {
  const alias = c.req.param('alias');
  const processes = parseProcessesFile('processes.tbl');
  const process = processes.find((p: ProcessEntry) => p.alias === alias);
  if (!process) {
    return c.json({ error: 'Process not found' }, 404);
  }

  const pty = spawn(userShell, ['-c', process.command], {
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

app.post('/processes/stop/:alias', (c) => {
  const alias = c.req.param('alias');
  const pty = managedProcesses.get(alias);
  if (!pty) {
    return c.json({ error: 'Process not found' }, 404);
  }
  pty.kill('SIGTERM');
  managedProcesses.delete(alias);

  server.emit('process-stopped', {
    alias,
    pid: pty.pid
  });
  return c.json({ message: 'Process stopped', alias });
});

const server = new Server(3001, {
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
  port: 3000,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

process.on('beforeExit', () => {
  managedProcesses.forEach((pty) => {
    pty.kill('SIGTERM');
  });
  managedProcesses.clear();
});