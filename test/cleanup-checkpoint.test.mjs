import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fixture, data, fail, g } from './helpers.mjs';

function rewritten(f) {
  const run = f.finished();
  g(f.main, 'switch', '-c', 'new-upstream', f.initial);
  writeFileSync(path.join(f.main, 'upstream.txt'), 'upstream\n');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'upstream');
  const upstream = g(f.main, 'rev-parse', 'HEAD');
  g(f.main, 'switch', 'release/v0.2.0');
  g(f.main, 'rebase', '--onto', upstream, f.initial);
  return { run, checkpoint: g(f.main, 'rev-parse', 'HEAD'), upstream };
}

test('a proven checkpoint permits later target refactoring without changing target or source refs', t => {
  const f = fixture(t, 1); const { run, checkpoint } = rewritten(f);
  writeFileSync(path.join(f.main, 'feature-1.txt'), 'later implementation\n');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'refactor');
  const target = g(f.main, 'rev-parse', 'HEAD');
  fail(f.main, 'TARGET_NO_LONGER_CONTAINS_RUN', 'cleanup', run.id);
  const result = data(f.main, 'cleanup', run.id, '--rebased-checkpoint', checkpoint, '--apply');
  assert.equal(result.rebasedCheckpoint, checkpoint);
  assert.equal(result.entries[0].status, 'removed');
  assert.equal(g(f.main, 'rev-parse', 'HEAD'), target);
  assert.equal(g(f.main, 'rev-parse', f.tasks[0].branch), f.tasks[0].commit);
  assert.equal(f.readRun(run).cleanupTarget.checkpoint, checkpoint);
  assert.equal(data(f.main, 'cleanup', run.id).entries[0].status, 'already-removed');
});

test('a checkpoint is captured before host cleanup and reused after later commits', t => {
  const f = fixture(t, 1); const { run, checkpoint } = rewritten(f);
  // Host deletion remains outside the CLI, but the successful target proof is durable.
  data(f.tasks[0].path, 'ready', '--name', f.tasks[0].id, '--owner', 'codex', '--released');
  const error = fail(f.main, 'CLEANUP_PARTIAL', 'cleanup', run.id, '--apply');
  assert.equal(error.details.entries[0].code, 'HOST_MANAGED');
  assert.equal(f.readRun(run).cleanupTarget.checkpoint, checkpoint);
  g(f.main, 'revert', '--no-edit', 'HEAD');
  const preview = data(f.main, 'cleanup', run.id);
  assert.equal(preview.rebasedCheckpoint, checkpoint);
  assert.equal(preview.entries[0].code, 'HOST_MANAGED');
  assert.ok(existsSync(f.tasks[0].path));
});

test('an ancestor without the integrated result cannot be supplied as a checkpoint', t => {
  const f = fixture(t, 1); const { run, upstream } = rewritten(f);
  fail(f.main, 'TARGET_NO_LONGER_CONTAINS_RUN', 'cleanup', run.id, '--rebased-checkpoint', upstream, '--apply');
  assert.ok(existsSync(f.tasks[0].path));
});

test('a checkpoint removed by another history rewrite does not authorize deletion', t => {
  const f = fixture(t, 1); const { run, checkpoint, upstream } = rewritten(f);
  g(f.main, 'reset', '--hard', upstream);
  fail(f.main, 'CHECKPOINT_NOT_IN_TARGET', 'cleanup', run.id, '--rebased-checkpoint', checkpoint, '--apply');
  assert.ok(existsSync(f.tasks[0].path));
});
