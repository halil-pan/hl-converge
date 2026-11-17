import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensure } from './errors.js';
import { read, write } from './store.js';
import { VERSION } from './version.js';

export const agents = ['claude-code', 'opencode', 'oh-my-pi', 'codex'] as const;
export type Agent = typeof agents[number];
const skillNames = ['hl-converge-ready', 'hl-converge-integrate'];
export function skillsRoot(agent: Agent, home: string, env: NodeJS.ProcessEnv): string {
  if (agent === 'claude-code') return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'skills');
  if (agent === 'opencode') return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode', 'skills');
  if (agent === 'codex') return path.join(home, '.agents', 'skills');
  const profile = (env.OMP_PROFILE ?? env.PI_PROFILE ?? '').trim();
  ensure(!profile || profile === 'default' || (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) && !profile.endsWith('.') && !/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i.test(profile)), 'INVALID_PROFILE', 'OMP profile 名称无效');
  const configRoot = path.join(home, env.PI_CONFIG_DIR || '.omp');
  if (profile && profile !== 'default') return path.join(configRoot, 'profiles', profile, 'agent', 'skills');
  return path.join(env.PI_CODING_AGENT_DIR ? path.resolve(env.PI_CODING_AGENT_DIR) : path.join(configRoot, 'agent'), 'skills');
}
function digest(dir: string): string {
  const h = createHash('sha256');
  const visit = (p: string) => {
    for (const entry of readdirSync(p, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.hl-converge-install.json') continue;
      const f = path.join(p, entry.name); h.update(path.relative(dir, f));
      if (entry.isDirectory()) visit(f); else h.update(readFileSync(f));
    }
  }; visit(dir); return h.digest('hex');
}
export function install(selected: string[], options: { home?: string; skillsDir?: string; force: boolean }): unknown {
  const chosen = selected.includes('all') ? [...agents] : [...new Set(selected)];
  ensure(chosen.length && chosen.every(a => agents.includes(a as Agent)), 'INVALID_AGENT', `支持的 Agent：${agents.join(', ')}，或 all`);
  ensure(!options.skillsDir || chosen.length === 1, 'AMBIGUOUS_INSTALL_ROOT', '--skills-dir 只能用于单个平台');
  const bundled = fileURLToPath(new URL('../skills/', import.meta.url));
  ensure(existsSync(path.join(bundled, skillNames[0]!, 'scripts', 'runtime', 'cli.js')), 'PACKAGE_INCOMPLETE', '请先 npm run build；安装请使用完整发行包的 CLI');
  const home = path.resolve(options.home ?? homedir()); const token = randomUUID();
  const jobs = chosen.flatMap(agent => skillNames.map(name => {
    const root = path.resolve(options.skillsDir ?? skillsRoot(agent as Agent, home, options.home ? {} : process.env));
    const dest = path.join(root, name); const from = path.join(bundled, name); const hash = digest(from);
    let unchanged = false;
    if (existsSync(dest)) {
      ensure(!lstatSync(dest).isSymbolicLink(), 'INSTALL_SYMLINK', '已有 Skill 是链接，请保留并选择其他安装目录', { dest });
      const marker = read<{ package: string; version: string; hash: string } | null>(path.join(dest, '.hl-converge-install.json'), null);
      ensure(marker?.package === 'hl-converge', 'INSTALL_FOREIGN_SKILL', '同名 Skill 不属于本工具，保留现有文件', { dest });
      unchanged = marker.version === VERSION && marker.hash === hash && digest(dest) === hash;
      ensure(unchanged || options.force, 'INSTALL_EXISTS', '已有本工具的不同版本；明确使用 --force 后再替换', { dest });
    }
    return { agent, name, dest, from, hash, unchanged, staged: `${dest}.staged-${token}`, backup: `${dest}.backup-${token}`, applied: false, backedUp: false };
  }));
  try {
    for (const job of jobs.filter(j => !j.unchanged)) {
      mkdirSync(path.dirname(job.dest), { recursive: true });
      cpSync(job.from, job.staged, { recursive: true, errorOnExist: true, force: false });
      write(path.join(job.staged, '.hl-converge-install.json'), { package: 'hl-converge', version: VERSION, agent: job.agent, hash: job.hash });
    }
    for (const job of jobs.filter(j => !j.unchanged)) {
      if (existsSync(job.dest)) { renameSync(job.dest, job.backup); job.backedUp = true; }
      renameSync(job.staged, job.dest); job.applied = true;
    }
  } catch (error) {
    for (const job of [...jobs].reverse()) {
      if (job.applied) rmSync(job.dest, { recursive: true });
      if (job.backedUp) renameSync(job.backup, job.dest);
    }
    throw error;
  } finally {
    for (const job of jobs) { rmSync(job.staged, { recursive: true, force: true }); if (job.applied) rmSync(job.backup, { recursive: true, force: true }); }
  }
  return { version: VERSION, skills: jobs.map(j => ({ agent: j.agent, name: j.name, path: j.dest, status: j.unchanged ? 'unchanged' : 'installed' })), note: 'Skill 自带独立运行文件；未修改 AGENTS.md、CLAUDE.md 或宿主权限。' };
}
