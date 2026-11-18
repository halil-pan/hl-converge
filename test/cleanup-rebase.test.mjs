import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fixture, data, fail, g } from './helpers.mjs';

function rebaseTarget(f) {
  g(f.main, 'switch', '-c', 'new-upstream', f.initial);
  writeFileSync(path.join(f.main, 'upstream.txt'), 'unrelated upstream change\n');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'upstream');
  const upstream = g(f.main, 'rev-parse', 'HEAD');
  g(f.main, 'switch', 'release/v0.2.0');
  g(f.main, 'rebase', '--onto', upstream, f.initial);
  return g(f.main, 'rev-parse', 'HEAD');
}

test('cleanup accepts an equivalent rebase with integration fixes, preserving branches and unrelated local edits', t => {
  const f = fixture(t, 2); const r = f.integrated();
  writeFileSync(path.join(f.main, 'feature-1.txt'), 'feature 1\nintegration fix\n');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'integration fix');
  data(f.main, 'verify', r.id); const finished = data(f.main, 'finish', r.id);
  const target = rebaseTarget(f);
  writeFileSync(path.join(f.main, 'local.txt'), 'keep concurrent work');
  const preview = data(f.main, 'cleanup', r.id);
  assert.equal(preview.rebasedTarget, true);
  assert.equal(preview.targetCommit, target);
  assert.ok(preview.entries.every(e => e.status === 'eligible'));
  data(f.main, 'cleanup', r.id, '--apply');
  assert.ok(f.tasks.every(s => !existsSync(s.path)));
  for (const s of f.tasks) assert.equal(g(f.main, 'rev-parse', s.branch), s.commit);
  assert.equal(g(f.main, 'rev-parse', 'HEAD'), target);
  assert.equal(readFileSync(path.join(f.main, 'local.txt'), 'utf8'), 'keep concurrent work');
  assert.equal(f.readRun(r).finishedCommit, finished.finishedCommit);
  assert.deepEqual(f.readRun(r).cleanupTarget, { commit: target, rebased: true, checkpoint: target });
  assert.equal(data(f.main, 'cleanup', r.id, '--apply').entries[0].status, 'already-removed');
});

test('cleanup retains sources when rewritten target omits their changes', t => {
  const f = fixture(t, 1); const r = f.finished();
  g(f.main, 'reset', '--hard', f.initial);
  writeFileSync(path.join(f.main, 'other.txt'), 'other');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'different history');
  fail(f.main, 'TARGET_NO_LONGER_CONTAINS_RUN', 'cleanup', r.id, '--apply');
  assert.ok(existsSync(f.tasks[0].path));
});

test('patch equivalence in history cannot authorize cleanup after a revert', t => {
  const f = fixture(t, 1); const r = f.finished(); rebaseTarget(f);
  g(f.main, 'revert', '--no-edit', 'HEAD');
  fail(f.main, 'TARGET_NO_LONGER_CONTAINS_RUN', 'cleanup', r.id, '--apply');
  assert.ok(existsSync(f.tasks[0].path));
});

test('an equivalent commit followed by conflicting content does not pass the tree proof', t => {
  const f = fixture(t, 1); const r = f.finished(); rebaseTarget(f);
  writeFileSync(path.join(f.main, 'feature-1.txt'), 'replacement content\n');
  g(f.main, 'add', '.'); g(f.main, 'commit', '-m', 'replace feature');
  fail(f.main, 'TARGET_NO_LONGER_CONTAINS_RUN', 'cleanup', r.id, '--apply');
  assert.ok(existsSync(f.tasks[0].path));
});

test('equivalent target history still preserves a source branch that advanced', t => {
  const f = fixture(t, 1); const r = f.finished(); rebaseTarget(f);
  const source = f.tasks[0]; writeFileSync(path.join(source.path, 'later.txt'), 'later work');
  g(source.path, 'add', '.'); g(source.path, 'commit', '-m', 'later source');
  const error = fail(f.main, 'CLEANUP_PARTIAL', 'cleanup', r.id, '--apply');
  assert.equal(error.details.entries[0].code, 'SOURCE_BRANCH_CHANGED');
  assert.ok(existsSync(source.path));
});
