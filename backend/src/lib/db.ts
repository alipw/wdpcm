import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackDbPath = path.join(__dirname, '../../data.db');
const dbPath = env.WDPCM_DB_PATH
  ? path.resolve(env.WDPCM_DB_PATH)
  : fallbackDbPath;

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS processes (
    alias TEXT PRIMARY KEY,
    command TEXT NOT NULL
  )
`);

export interface ProcessEntry {
  alias: string;
  command: string;
}

export function getAllProcesses(): ProcessEntry[] {
  return db.prepare('SELECT alias, command FROM processes').all() as ProcessEntry[];
}

export function getProcessByAlias(alias: string): ProcessEntry | undefined {
  return db.prepare('SELECT alias, command FROM processes WHERE alias = ?').get(alias) as ProcessEntry | undefined;
}

export function createProcess(alias: string, command: string): ProcessEntry {
  db.prepare('INSERT INTO processes (alias, command) VALUES (?, ?)').run(alias, command);
  return { alias, command };
}

export function updateProcess(alias: string, command: string): boolean {
  const result = db.prepare('UPDATE processes SET command = ? WHERE alias = ?').run(command, alias);
  return result.changes > 0;
}

export function deleteProcess(alias: string): boolean {
  const result = db.prepare('DELETE FROM processes WHERE alias = ?').run(alias);
  return result.changes > 0;
}

export function searchProcesses(query: string): ProcessEntry[] {
  const pattern = `%${query}%`;
  return db.prepare(
    'SELECT alias, command FROM processes WHERE alias LIKE ? OR command LIKE ?'
  ).all(pattern, pattern) as ProcessEntry[];
}
