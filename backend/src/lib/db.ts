import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackDbPath = path.join(__dirname, '../../data.db');
let db: Database.Database | null = null;
let activeDbPath: string | null = null;

export interface ProcessEntry {
  alias: string;
  command: string;
  workingDirectory: string | null;
  selectedWorktreePath: string | null;
}

export interface ProcessUpdate {
  command: string;
  workingDirectory: string | null;
  selectedWorktreePath: string | null;
}

function resolveDbPath(): string {
  return env.WDPCM_DB_PATH ? path.resolve(env.WDPCM_DB_PATH) : fallbackDbPath;
}

export function migrateProcessSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS processes (
      alias TEXT PRIMARY KEY,
      command TEXT NOT NULL
    )
  `);

  const columns = database
    .prepare("SELECT name FROM pragma_table_info('processes')")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('working_directory')) {
    database.exec('ALTER TABLE processes ADD COLUMN working_directory TEXT');
  }
  if (!columnNames.has('selected_worktree_path')) {
    database.exec('ALTER TABLE processes ADD COLUMN selected_worktree_path TEXT');
  }
}

function getDb(): Database.Database {
  const dbPath = resolveDbPath();
  if (db && activeDbPath === dbPath) {
    return db;
  }

  db?.close();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  activeDbPath = dbPath;
  migrateProcessSchema(db);
  return db;
}

function mapProcessEntry(row: {
  alias: string;
  command: string;
  workingDirectory: string | null;
  selectedWorktreePath: string | null;
}): ProcessEntry {
  return {
    alias: row.alias,
    command: row.command,
    workingDirectory: row.workingDirectory ?? null,
    selectedWorktreePath: row.selectedWorktreePath ?? null
  };
}

const processSelectColumns = `
  alias,
  command,
  working_directory AS workingDirectory,
  selected_worktree_path AS selectedWorktreePath
`;

export function getAllProcesses(): ProcessEntry[] {
  const database = getDb();
  return database
    .prepare(`SELECT ${processSelectColumns} FROM processes`)
    .all()
    .map((row) => mapProcessEntry(row as ProcessEntry));
}

export function getProcessByAlias(alias: string): ProcessEntry | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT ${processSelectColumns} FROM processes WHERE alias = ?`)
    .get(alias) as ProcessEntry | undefined;
  return row ? mapProcessEntry(row) : undefined;
}

export function createProcess(
  alias: string,
  command: string,
  workingDirectory: string | null
): ProcessEntry {
  const database = getDb();
  database
    .prepare(
      `
        INSERT INTO processes (alias, command, working_directory, selected_worktree_path)
        VALUES (?, ?, ?, NULL)
      `
    )
    .run(alias, command, workingDirectory);
  return { alias, command, workingDirectory, selectedWorktreePath: null };
}

export function updateProcess(alias: string, updates: ProcessUpdate): boolean {
  const database = getDb();
  const result = database
    .prepare(
      `
        UPDATE processes
        SET command = ?, working_directory = ?, selected_worktree_path = ?
        WHERE alias = ?
      `
    )
    .run(updates.command, updates.workingDirectory, updates.selectedWorktreePath, alias);
  return result.changes > 0;
}

export function deleteProcess(alias: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM processes WHERE alias = ?').run(alias);
  return result.changes > 0;
}

export function searchProcesses(query: string): ProcessEntry[] {
  const database = getDb();
  const pattern = `%${query}%`;
  return database
    .prepare(
      `
        SELECT ${processSelectColumns}
        FROM processes
        WHERE alias LIKE ? OR command LIKE ? OR COALESCE(working_directory, '') LIKE ?
      `
    )
    .all(pattern, pattern, pattern)
    .map((row) => mapProcessEntry(row as ProcessEntry));
}
