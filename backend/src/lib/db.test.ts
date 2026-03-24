import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProcess,
  getAllProcesses,
  getProcessByAlias,
  migrateProcessSchema,
  updateProcess
} from './db.js';

test('migrateProcessSchema adds worktree columns without losing rows', () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE processes (
      alias TEXT PRIMARY KEY,
      command TEXT NOT NULL
    );
    INSERT INTO processes (alias, command) VALUES ('dev', 'npm run dev');
  `);

  migrateProcessSchema(database);

  const columns = database
    .prepare("SELECT name FROM pragma_table_info('processes')")
    .all() as Array<{ name: string }>;
  const row = database
    .prepare(
      'SELECT alias, command, working_directory AS workingDirectory, selected_worktree_path AS selectedWorktreePath FROM processes WHERE alias = ?'
    )
    .get('dev') as {
    alias: string;
    command: string;
    workingDirectory: string | null;
    selectedWorktreePath: string | null;
  };

  assert.deepEqual(
    columns.map((column) => column.name),
    ['alias', 'command', 'working_directory', 'selected_worktree_path']
  );
  assert.equal(row.alias, 'dev');
  assert.equal(row.command, 'npm run dev');
  assert.equal(row.workingDirectory, null);
  assert.equal(row.selectedWorktreePath, null);
});

test('process persistence reads and updates working directory fields', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'wdpcm-db-'));
  const originalDbPath = process.env.WDPCM_DB_PATH;

  try {
    process.env.WDPCM_DB_PATH = path.join(tempDir, 'data.db');

    const created = createProcess('frontend', 'npm run dev', '/tmp/project');
    assert.deepEqual(created, {
      alias: 'frontend',
      command: 'npm run dev',
      workingDirectory: '/tmp/project',
      selectedWorktreePath: null
    });

    updateProcess('frontend', {
      command: 'pnpm dev',
      workingDirectory: '/tmp/project/apps/web',
      selectedWorktreePath: '/tmp/project-feature'
    });

    assert.deepEqual(getProcessByAlias('frontend'), {
      alias: 'frontend',
      command: 'pnpm dev',
      workingDirectory: '/tmp/project/apps/web',
      selectedWorktreePath: '/tmp/project-feature'
    });

    assert.equal(getAllProcesses().length, 1);
  } finally {
    if (originalDbPath === undefined) {
      delete process.env.WDPCM_DB_PATH;
    } else {
      process.env.WDPCM_DB_PATH = originalDbPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
