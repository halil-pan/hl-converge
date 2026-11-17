import { spawnSync } from 'node:child_process';
import { realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ensure, FlowError } from './errors.js';
export function gitEnv() {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_MERGE_AUTOEDIT: 'no' };
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_PREFIX'])
        delete env[key];
    return env;
}
export function git(cwd, args, optional = false) {
    const out = spawnSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8', shell: false, timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024,
        env: gitEnv(),
    });
    if (out.status !== 0 || out.error) {
        if (optional)
            return '';
        throw new FlowError('GIT_FAILED', out.error?.message || out.stderr.trim() || 'Git command failed', { args, exitCode: out.status });
    }
    return out.stdout;
}
export const canonical = (p) => realpathSync(path.resolve(p));
export function repository(cwd) {
    ensure(existsSync(cwd), 'DIRECTORY_MISSING', '目录不存在', { cwd });
    const root = canonical(git(cwd, ['rev-parse', '--show-toplevel']).trim());
    const common = canonical(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
    return { root, common, state: path.join(common, 'hl-converge') };
}
export const head = (cwd) => git(cwd, ['rev-parse', '--verify', 'HEAD']).trim();
export const branch = (cwd) => git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true).trim() || null;
export function localRef(cwd, name) {
    validateBranch(cwd, name);
    const ref = git(cwd, ['show-ref', '--verify', '--hash', `refs/heads/${name}`], true).trim();
    ensure(ref, 'BRANCH_MISSING', '本地分支不存在', { branch: name });
    return ref;
}
export function validateBranch(cwd, name) {
    ensure(name.length > 0 && !name.startsWith('-'), 'INVALID_BRANCH', '分支名无效');
    ensure(spawnSync('git', ['-C', cwd, 'check-ref-format', `refs/heads/${name}`], { timeout: 30_000, env: gitEnv() }).status === 0, 'INVALID_BRANCH', '分支名无效', { branch: name });
}
export function ancestor(cwd, older, newer) {
    const result = spawnSync('git', ['-C', cwd, 'merge-base', '--is-ancestor', older, newer], { encoding: 'utf8', timeout: 30_000, env: gitEnv() });
    if (result.status === 0)
        return true;
    if (result.status === 1)
        return false;
    throw new FlowError('GIT_FAILED', result.stderr?.trim() || '无法检查提交关系');
}
export const dirty = (cwd) => git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']);
export function clean(cwd) {
    ensure(!dirty(cwd), 'WORKSPACE_DIRTY', '目录有未提交改动，请保留并先处理；工具不会自动暂存或清空', { cwd });
    ensure(!merging(cwd), 'MERGE_IN_PROGRESS', '目录仍有未完成的合并', { cwd });
}
export function merging(cwd) {
    return !!git(cwd, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], true).trim();
}
export function worktrees(repo) {
    const items = [];
    let current;
    for (const field of git(repo.root, ['worktree', 'list', '--porcelain', '-z']).split('\0')) {
        if (field.startsWith('worktree ')) {
            current = { path: path.resolve(field.slice(9)), head: '', branch: null, locked: false, bare: false };
            items.push(current);
        }
        else if (current && field.startsWith('HEAD '))
            current.head = field.slice(5);
        else if (current && field.startsWith('branch refs/heads/'))
            current.branch = field.slice(18);
        else if (current && (field === 'locked' || field.startsWith('locked ')))
            current.locked = true;
        else if (current && field === 'bare')
            current.bare = true;
    }
    return items;
}
export const samePath = (a, b) => path.resolve(a) === path.resolve(b);
export function assertWorkspace(repo, cwd) {
    const dest = repository(cwd);
    ensure(dest.common === repo.common, 'DIFFERENT_REPOSITORY', '验证目录必须属于同一个 Git 仓库');
    ensure(worktrees(repo).some(w => samePath(w.path, dest.root) && !w.bare), 'WORKTREE_MISSING', '目录不是已登记的工作目录');
    return dest.root;
}
export function targetAvailable(repo, target, workspace) {
    const other = worktrees(repo).find(w => w.branch === target && !samePath(w.path, workspace));
    ensure(!other, 'TARGET_CHECKED_OUT_ELSEWHERE', '目标分支正在另一个目录使用，请把该目录作为验证目录', { path: other?.path });
}
