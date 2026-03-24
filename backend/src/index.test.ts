import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startBackend, stopBackend } from './index.js';

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for condition');
}

function createRepoFixture() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'wdpcm-api-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const featureWorktree = path.join(tempRoot, 'repo-feature');
  const nestedProjectPath = path.join(repoRoot, 'apps', 'web');

  execFileSync('git', ['init', '-b', 'main', repoRoot], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoRoot, 'config', 'user.name', 'WDPCM Tests'], {
    encoding: 'utf8'
  });
  execFileSync('git', ['-C', repoRoot, 'config', 'user.email', 'tests@example.com'], {
    encoding: 'utf8'
  });
  writeFileSync(path.join(repoRoot, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(repoRoot, 'README.md'), '# test\n');
  mkdirSync(nestedProjectPath, { recursive: true });
  writeFileSync(path.join(nestedProjectPath, 'package.json'), '{"name":"fixture"}\n');
  execFileSync('git', ['-C', repoRoot, 'add', '.'], { encoding: 'utf8' });
  execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'Initial commit'], {
    encoding: 'utf8'
  });
  execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', 'feature', featureWorktree], {
    encoding: 'utf8'
  });

  return {
    tempRoot,
    repoRoot,
    featureWorktree,
    nestedProjectPath
  };
}

async function startTestBackend(dbPath: string) {
  const apiPort = await getFreePort();
  const socketPort = await getFreePort();
  const originalDbPath = process.env.WDPCM_DB_PATH;
  process.env.WDPCM_DB_PATH = dbPath;
  startBackend({
    apiPort,
    socketPort,
    openBrowser: false
  });

  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/`);
      return response.ok;
    } catch (error) {
      return false;
    }
  });

  return {
    apiPort,
    restoreEnv() {
      if (originalDbPath === undefined) {
        delete process.env.WDPCM_DB_PATH;
      } else {
        process.env.WDPCM_DB_PATH = originalDbPath;
      }
    }
  };
}

test.afterEach(async () => {
  await stopBackend();
});

test('process API persists worktree fields and runs commands in the selected worktree subdirectory', async () => {
  const fixture = createRepoFixture();
  const outputFile = path.join(fixture.featureWorktree, 'apps', 'web', 'wdpcm-output.txt');
  const dbPath = path.join(fixture.tempRoot, 'data.db');
  const runtime = await startTestBackend(dbPath);

  try {
    let response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: 'frontend',
        command: 'pwd > wdpcm-output.txt',
        workingDirectory: fixture.nestedProjectPath
      })
    });
    assert.equal(response.status, 201);

    response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes/frontend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedWorktreePath: fixture.featureWorktree
      })
    });
    assert.equal(response.status, 200);

    response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes`);
    const processes = (await response.json()) as Array<{
      alias: string;
      workingDirectory: string | null;
      selectedWorktreePath: string | null;
    }>;
    assert.equal(processes[0]?.workingDirectory, fixture.nestedProjectPath);
    assert.equal(processes[0]?.selectedWorktreePath, fixture.featureWorktree);

    response = await fetch(
      `http://127.0.0.1:${runtime.apiPort}/processes/frontend/worktrees`
    );
    const discovery = (await response.json()) as {
      state: string;
      relativeProjectPath: string | null;
      worktrees: Array<{ path: string }>;
    };
    assert.equal(discovery.state, 'ok');
    assert.equal(discovery.relativeProjectPath, path.join('apps', 'web'));
    assert.equal(
      discovery.worktrees.some((worktree) => worktree.path === fixture.featureWorktree),
      true
    );

    response = await fetch(
      `http://127.0.0.1:${runtime.apiPort}/processes/start/frontend`,
      { method: 'POST' }
    );
    assert.equal(response.status, 200);

    await waitFor(async () => {
      try {
        await access(outputFile);
        return true;
      } catch (error) {
        return false;
      }
    });

    const cwd = readFileSync(outputFile, 'utf8').trim();
    assert.equal(cwd, path.join(fixture.featureWorktree, 'apps', 'web'));
  } finally {
    runtime.restoreEnv();
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('process start fails cleanly when the selected worktree does not contain the project subdirectory', async () => {
  const fixture = createRepoFixture();
  const dbPath = path.join(fixture.tempRoot, 'data.db');
  const runtime = await startTestBackend(dbPath);

  try {
    rmSync(path.join(fixture.featureWorktree, 'apps'), {
      recursive: true,
      force: true
    });

    let response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: 'frontend',
        command: 'pwd',
        workingDirectory: fixture.nestedProjectPath
      })
    });
    assert.equal(response.status, 201);

    response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes/frontend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedWorktreePath: fixture.featureWorktree
      })
    });
    assert.equal(response.status, 200);

    response = await fetch(
      `http://127.0.0.1:${runtime.apiPort}/processes/start/frontend`,
      { method: 'POST' }
    );
    const body = (await response.json()) as { error: string };
    assert.equal(response.status, 400);
    assert.match(body.error, /worktree|directory/i);
  } finally {
    runtime.restoreEnv();
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('changing worktree selection is rejected while the process is running', async () => {
  const fixture = createRepoFixture();
  const dbPath = path.join(fixture.tempRoot, 'data.db');
  const runtime = await startTestBackend(dbPath);

  try {
    let response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: 'frontend',
        command: 'sleep 5',
        workingDirectory: fixture.nestedProjectPath
      })
    });
    assert.equal(response.status, 201);

    response = await fetch(
      `http://127.0.0.1:${runtime.apiPort}/processes/start/frontend`,
      { method: 'POST' }
    );
    assert.equal(response.status, 200);

    response = await fetch(`http://127.0.0.1:${runtime.apiPort}/processes/frontend`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedWorktreePath: fixture.featureWorktree
      })
    });
    const body = (await response.json()) as { error: string };
    assert.equal(response.status, 409);
    assert.match(body.error, /stop the process/i);
  } finally {
    runtime.restoreEnv();
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});
