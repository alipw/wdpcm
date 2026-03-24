import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GitNotRepositoryError,
  GitUnavailableError,
  discoverProcessWorktrees,
  parseWorktreeListPorcelain,
  resolveProcessRuntimeCwd,
  runGitCommand
} from './git.js';

function createRepoFixture() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'wdpcm-git-'));
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

test('parseWorktreeListPorcelain reads branch names and paths', () => {
  const output = `worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def\nbranch refs/heads/feature\n`;

  assert.deepEqual(parseWorktreeListPorcelain(output), [
    { path: '/repo', branch: 'main', isCurrent: false },
    { path: '/repo-feature', branch: 'feature', isCurrent: false }
  ]);
});

test('discoverProcessWorktrees resolves nested project path and available worktrees', async () => {
  const fixture = createRepoFixture();

  try {
    const discovery = await discoverProcessWorktrees(
      fixture.nestedProjectPath,
      fixture.featureWorktree
    );

    assert.equal(discovery.state, 'ok');
    assert.equal(discovery.repoRoot, fixture.repoRoot);
    assert.equal(discovery.relativeProjectPath, path.join('apps', 'web'));
    assert.equal(discovery.selectedWorktreePath, fixture.featureWorktree);
    assert.equal(discovery.worktrees.length, 2);
    assert.equal(
      discovery.worktrees.some(
        (worktree) => worktree.path === fixture.featureWorktree && worktree.branch === 'feature'
      ),
      true
    );
  } finally {
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('discoverProcessWorktrees returns git_unavailable when git cannot be invoked', async () => {
  const discovery = await discoverProcessWorktrees('/tmp/project', null, async () => {
    throw new GitUnavailableError();
  });

  assert.equal(discovery.state, 'git_unavailable');
});

test('discoverProcessWorktrees returns not_repo for directories outside git repos', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'wdpcm-not-repo-'));

  try {
    const discovery = await discoverProcessWorktrees(tempDir, null, runGitCommand);
    assert.equal(discovery.state, 'not_repo');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveProcessRuntimeCwd preserves the project subdirectory inside the selected worktree', async () => {
  const fixture = createRepoFixture();

  try {
    const runtimeCwd = await resolveProcessRuntimeCwd({
      workingDirectory: fixture.nestedProjectPath,
      selectedWorktreePath: fixture.featureWorktree
    });

    assert.equal(runtimeCwd, path.join(fixture.featureWorktree, 'apps', 'web'));
  } finally {
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('resolveProcessRuntimeCwd fails when the selected worktree is missing the nested project path', async () => {
  const fixture = createRepoFixture();

  try {
    rmSync(path.join(fixture.featureWorktree, 'apps'), {
      recursive: true,
      force: true
    });

    await assert.rejects(
      () =>
        resolveProcessRuntimeCwd({
          workingDirectory: fixture.nestedProjectPath,
          selectedWorktreePath: fixture.featureWorktree
        })
    );
  } finally {
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('discoverProcessWorktrees can classify non-repo errors from a custom runner', async () => {
  const discovery = await discoverProcessWorktrees('/tmp/project', null, async () => {
    throw new GitNotRepositoryError();
  });

  assert.equal(discovery.state, 'not_repo');
});
