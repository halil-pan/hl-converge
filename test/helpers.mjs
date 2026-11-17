import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const cli = process.env.HL_CONVERGE_CLI_PATH ?? fileURLToPath(new URL('../dist/cli.js', import.meta.url));
export const root = fileURLToPath(new URL('../', import.meta.url));
export const env = { ...process.env, GIT_CONFIG_GLOBAL: path.join(tmpdir(), 'hl-converge-nonexistent-global-config'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
export function g(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding:'utf8', env });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
export function call(cwd, args, expected = 0, script = cli) {
  const r = spawnSync(process.execPath, [script, '--repo', cwd, ...args, '--json'], { encoding:'utf8', env, timeout:30_000 });
  assert.equal(r.status, expected, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.status === 0 ? r.stdout : r.stderr);
}
export const data = (cwd, ...args) => call(cwd, args).data;
export function fail(cwd, code, ...args) { const r = call(cwd, args, 2); assert.equal(r.error.code, code, JSON.stringify(r)); return r.error; }
export function fixture(t, count = 2, conflict = false) {
  const parent = process.env.HL_CONVERGE_TEST_TMP ?? tmpdir(); mkdirSync(parent, { recursive:true });
  const base = realpathSync(mkdtempSync(path.join(parent, 'hl-converge test-')));
  t.after(() => rmSync(base, { recursive:true, force:true }));
  const main = path.join(base, '主目录 with spaces'); mkdirSync(main);
  g(main, 'init', '-b', 'release/v0.2.0'); g(main, 'config', 'user.name', 'Worktree Flow Test'); g(main, 'config', 'user.email', 'test@example.invalid');
  g(main, 'config', 'commit.gpgsign', 'false'); g(main, 'config', 'core.hooksPath', path.join(base, 'no-hooks'));
  writeFileSync(path.join(main, 'base.txt'), 'base\n'); writeFileSync(path.join(main, '.gitignore'), 'cache/\n.env\n');
  g(main, 'add', '.'); g(main, 'commit', '-m', 'base');
  const initial = g(main, 'rev-parse', 'HEAD'); const tasks = [];
  for (let i = 1; i <= count; i++) {
    const task = path.join(base, `task ${i}`); const branch = `feature/task-${i}`;
    g(main, 'worktree', 'add', '-b', branch, task, 'release/v0.2.0');
    writeFileSync(path.join(task, conflict ? 'base.txt' : `feature-${i}.txt`), `feature ${i}\n`);
    g(task, 'add', '.'); g(task, 'commit', '-m', `feature ${i}`);
    tasks.push({ path:task, branch, id:`task-${i}`, commit:g(task, 'rev-parse','HEAD') });
  }
  const state = path.join(main, '.git', 'hl-converge');
  function settings(checks = [{name:'test',command:[process.execPath,'-e','process.exit(0)']}], manualChecks = []) {
    const file = path.join(base, 'checks.json'); writeFileSync(file, JSON.stringify({checks,manualChecks})); data(main,'config','set','checks',file);
  }
  function prepare({ owner='git', released=true, defaults=true } = {}) {
    if (defaults) data(main,'config','set','default-target','release/v0.2.0');
    for (const task of tasks) data(task.path,'ready','--name',task.id,'--owner',owner,...(released?['--released']:[]));
  }
  function plan(extra = []) { return data(main,'plan',...tasks.flatMap(x=>['--source',x.id]),...extra); }
  function integrated(options) { prepare(options); settings(); const r=plan(); data(main,'integrate',r.id); return r; }
  function finished(options) { const r=integrated(options); data(main,'verify',r.id); data(main,'finish',r.id); return r; }
  return {base,main,initial,tasks,state,settings,prepare,plan,integrated,finished,runFile: r=>path.join(state,'runs',`${r.id}.json`),readRun:r=>JSON.parse(readFileSync(path.join(state,'runs',`${r.id}.json`),'utf8'))};
}
