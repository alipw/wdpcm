import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WorktreeDiscoveryState = 'ok' | 'unconfigured' | 'git_unavailable' | 'not_repo';

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  isCurrent: boolean;
}

export interface WorktreeDiscovery {
  state: WorktreeDiscoveryState;
  workingDirectory: string | null;
  repoRoot: string | null;
  relativeProjectPath: string | null;
  selectedWorktreePath: string | null;
  worktrees: WorktreeEntry[];
}

export interface GitCommandRunner {
  (args: string[]): Promise<string>;
}

export class GitUnavailableError extends Error {
  constructor() {
    super('Git is not available on this machine.');
  }
}

export class GitNotRepositoryError extends Error {
  constructor() {
    super('The configured working directory is not inside a Git repository.');
  }
}

export async function runGitCommand(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      encoding: 'utf8',
      windowsHide: true
    });
    return stdout;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        throw new GitUnavailableError();
      }
    }

    if (error && typeof error === 'object' && 'stderr' in error) {
      const stderr = typeof error.stderr === 'string' ? error.stderr : '';
      if (stderr.includes('not a git repository')) {
        throw new GitNotRepositoryError();
      }
    }

    throw error;
  }
}

export function parseWorktreeListPorcelain(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: {
    path: string | null;
    branch: string | null;
    isCurrent: boolean;
  } | null = null;

  const flush = () => {
    if (!current?.path) {
      return;
    }
    entries.push({
      path: current.path,
      branch: current.branch,
      isCurrent: current.isCurrent
    });
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      flush();
      current = null;
      continue;
    }

    if (line.startsWith('worktree ')) {
      flush();
      current = {
        path: line.slice('worktree '.length),
        branch: null,
        isCurrent: false
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length);
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      continue;
    }

    if (line === 'bare') {
      current.branch = null;
      continue;
    }
  }

  flush();
  return entries;
}

export async function discoverProcessWorktrees(
  workingDirectory: string | null,
  selectedWorktreePath: string | null,
  runner: GitCommandRunner = runGitCommand
): Promise<WorktreeDiscovery> {
  if (!workingDirectory) {
    return {
      state: 'unconfigured',
      workingDirectory: null,
      repoRoot: null,
      relativeProjectPath: null,
      selectedWorktreePath,
      worktrees: []
    };
  }

  const resolvedWorkingDirectory = path.resolve(workingDirectory);

  try {
    const repoRootOutput = await runner(['-C', resolvedWorkingDirectory, 'rev-parse', '--show-toplevel']);
    const repoRoot = repoRootOutput.trim();
    const relativeProjectPath = path.relative(repoRoot, resolvedWorkingDirectory) || '.';
    const worktreeOutput = await runner(['-C', repoRoot, 'worktree', 'list', '--porcelain']);
    const currentWorktreePath = path.resolve(repoRoot);
    const worktrees = parseWorktreeListPorcelain(worktreeOutput).map((worktree) => ({
      ...worktree,
      path: path.resolve(worktree.path),
      isCurrent: path.resolve(worktree.path) === currentWorktreePath
    }));

    return {
      state: 'ok',
      workingDirectory: resolvedWorkingDirectory,
      repoRoot,
      relativeProjectPath,
      selectedWorktreePath: selectedWorktreePath ? path.resolve(selectedWorktreePath) : null,
      worktrees
    };
  } catch (error) {
    if (error instanceof GitUnavailableError) {
      return {
        state: 'git_unavailable',
        workingDirectory: resolvedWorkingDirectory,
        repoRoot: null,
        relativeProjectPath: null,
        selectedWorktreePath: selectedWorktreePath ? path.resolve(selectedWorktreePath) : null,
        worktrees: []
      };
    }

    if (error instanceof GitNotRepositoryError) {
      return {
        state: 'not_repo',
        workingDirectory: resolvedWorkingDirectory,
        repoRoot: null,
        relativeProjectPath: null,
        selectedWorktreePath: selectedWorktreePath ? path.resolve(selectedWorktreePath) : null,
        worktrees: []
      };
    }

    throw error;
  }
}

export async function resolveProcessRuntimeCwd(processEntry: {
  workingDirectory: string | null;
  selectedWorktreePath: string | null;
}): Promise<string | null> {
  if (!processEntry.workingDirectory) {
    return null;
  }

  const resolvedWorkingDirectory = path.resolve(processEntry.workingDirectory);
  if (!processEntry.selectedWorktreePath) {
    return resolvedWorkingDirectory;
  }

  const discovery = await discoverProcessWorktrees(
    processEntry.workingDirectory,
    processEntry.selectedWorktreePath
  );

  if (discovery.state !== 'ok' || !discovery.relativeProjectPath) {
    throw new Error('Unable to resolve the selected worktree for this process.');
  }

  const selectedWorktreePath = path.resolve(processEntry.selectedWorktreePath);
  const matchingWorktree = discovery.worktrees.find(
    (worktree) => path.resolve(worktree.path) === selectedWorktreePath
  );

  if (!matchingWorktree) {
    throw new Error('The selected worktree is no longer available.');
  }

  const runtimeCwd =
    discovery.relativeProjectPath === '.'
      ? selectedWorktreePath
      : path.join(selectedWorktreePath, discovery.relativeProjectPath);

  await access(runtimeCwd);
  return runtimeCwd;
}
