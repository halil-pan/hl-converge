#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { FlowError, ensure } from './errors.js';
import { repository } from './git.js';
import { config, locked, run } from './store.js';
import { setConfig } from './config.js';
import { ready, plan, integrate, refresh, inventory } from './engine.js';
import { verify, finish } from './verify.js';
import { cleanup } from './cleanup.js';
import { install } from './install.js';
import { VERSION } from './version.js';
import type { Owner } from './types.js';

const help = `hl-converge ${VERSION} — worktree 就绪、集成验证和本地收尾

hl-converge config show
hl-converge config set default-target BRANCH
hl-converge config set checks FILE.json
hl-converge ready --name ID [--label TEXT] [--branch NEW_BRANCH] [--owner git|claude-code|opencode|oh-my-pi|codex|unknown] [--released]
hl-converge plan --source ID [--source ID...] [--target BRANCH] [--workspace PATH]
hl-converge integrate RUN_ID
hl-converge continue RUN_ID
hl-converge refresh RUN_ID
hl-converge verify RUN_ID [--confirm-manual NAME...] [--rerun]
hl-converge finish RUN_ID
hl-converge cleanup RUN_ID [--dry-run | --apply] [--discard-ignored] [--delete-branches]
hl-converge status [RUN_ID]
hl-converge install --agent claude-code|opencode|oh-my-pi|codex|all [--home PATH | --skills-dir PATH] [--force]

通用选项：--repo PATH  --json  --help  --version
目标仅在 plan 时确定：显式 --target 优先，否则使用项目默认值。
后续命令读取 RUN_ID 的目标记录，不受当前分支或默认值变化影响。
检查配置：{"checks":[{"name":"test","command":["npm","test"],"cwd":".","timeoutMs":120000}],"manualChecks":[]}
清理默认只预览；普通 Git worktree 需要 --owner git 与 --released。
`;
let json = process.argv.includes('--json');
try {
  const { values: v, positionals: p } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, repo: { type: 'string' },
    name: { type: 'string' }, label: { type: 'string' }, branch: { type: 'string' }, owner: { type: 'string' }, released: { type: 'boolean' },
    source: { type: 'string', multiple: true }, target: { type: 'string' }, workspace: { type: 'string' },
    'confirm-manual': { type: 'string', multiple: true }, rerun: { type: 'boolean' },
    apply: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'discard-ignored': { type: 'boolean' }, 'delete-branches': { type: 'boolean' },
    agent: { type: 'string', multiple: true }, home: { type: 'string' }, 'skills-dir': { type: 'string' }, force: { type: 'boolean' },
  } });
  json = !!v.json;
  if (v.version) console.log(VERSION);
  else if (v.help || !p.length) console.log(help);
  else {
    const command = p[0]!;
    const allowed: Record<string, string[]> = {
      config: [], ready: ['name','label','branch','owner','released'], plan: ['source','target','workspace'],
      integrate: [], continue: [], refresh: [], verify: ['confirm-manual','rerun'], finish: [],
      cleanup: ['apply','dry-run','discard-ignored','delete-branches'], status: [],
      install: ['agent','home','skills-dir','force'],
    };
    ensure(command in allowed, 'UNKNOWN_COMMAND', '未知命令，请运行 hl-converge --help');
    for (const key of Object.keys(v)) ensure(['repo','json','help','version',...allowed[command]!].includes(key), 'UNEXPECTED_OPTION', `命令 ${command} 不支持 --${key}`);
    let data: unknown;
    if (command === 'install') {
      ensure(p.length === 1, 'INVALID_ARGUMENTS', 'install 不接受额外位置参数');
      data = install(v.agent ?? [], { home: v.home, skillsDir: v['skills-dir'], force: !!v.force });
    } else {
      const repo = repository(v.repo ?? process.cwd());
      const execute = async () => {
        if (command === 'config') {
          if (p[1] === 'show' && p.length === 2) return config(repo);
          ensure(p[1] === 'set' && p.length === 4, 'INVALID_ARGUMENTS', '用法：config show，或 config set KEY VALUE'); return setConfig(repo, p[2]!, p[3]!);
        }
        if (command === 'ready') {
          ensure(p.length === 1 && v.name, 'INVALID_ARGUMENTS', 'ready 需要 --name ID');
          const owner = v.owner ?? 'unknown';
          ensure(['git','claude-code','opencode','oh-my-pi','codex','unknown'].includes(owner), 'INVALID_OWNER', 'owner 无效');
          return ready(repo, v.name, v.label, owner as Owner, !!v.released, v.branch);
        }
        if (command === 'plan') { ensure(p.length === 1, 'INVALID_ARGUMENTS', 'plan 不接受额外位置参数'); return plan(repo, v.source ?? [], v.workspace ?? repo.root, v.target); }
        if (command === 'status') { ensure(p.length <= 2, 'INVALID_ARGUMENTS', 'status 最多接受一个运行 ID'); return p[1] ? run(repo, p[1]) : inventory(repo); }
        ensure(p.length === 2, 'INVALID_ARGUMENTS', `${command} 需要一个运行 ID`);
        if (command === 'integrate' || command === 'continue') return integrate(repo, p[1]!);
        if (command === 'refresh') return refresh(repo, p[1]!);
        if (command === 'verify') return await verify(repo, p[1]!, v['confirm-manual'] ?? [], !!v.rerun);
        if (command === 'finish') return finish(repo, p[1]!);
        ensure(!(v.apply && v['dry-run']), 'INVALID_ARGUMENTS', '--apply 与 --dry-run 不能一起使用');
        const result = cleanup(repo, p[1]!, !!v.apply, !!v['discard-ignored'], !!v['delete-branches']) as { entries: { reason?: string; status: string }[] };
        if (v.apply && result.entries.some(e => e.status === 'blocked' || e.reason)) throw new FlowError('CLEANUP_PARTIAL', '部分清理被保留，请查看每个目录的原因', result);
        return result;
      };
      data = command === 'status' || (command === 'config' && p[1] === 'show') || (command === 'cleanup' && !v.apply) ? await execute() : await locked(repo, execute);
    }
    console.log(JSON.stringify(json ? { ok: true, data } : data, null, json ? 0 : 2));
  }
} catch (error) {
  const e = error instanceof FlowError ? error : new FlowError('COMMAND_FAILED', (error as Error).message);
  const result = { ok: false, error: { code: e.code, message: e.message, details: e.details } };
  console.error(json ? JSON.stringify(result) : `${e.code}: ${e.message}${e.details ? '\n' + JSON.stringify(e.details, null, 2) : ''}`);
  process.exitCode = 2;
}
