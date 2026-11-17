import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { ensure, FlowError } from './errors.js';
export function id(value) {
    ensure(/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value) && value !== '.' && value !== '..', 'INVALID_ID', 'ID 只能使用小写字母、数字、点、下划线和短横线');
    return value;
}
export function read(file, fallback) {
    if (!existsSync(file) && fallback !== undefined)
        return fallback;
    ensure(existsSync(file), 'RECORD_MISSING', '记录不存在', { file });
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        throw new FlowError('INVALID_RECORD', '无法读取 JSON 记录', { file });
    }
}
export function write(file, value) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, file);
}
export const configPath = (repo) => path.join(repo.state, 'config.json');
export const config = (repo) => read(configPath(repo), { version: 1, checks: [], manualChecks: [] });
export const sourcePath = (repo, name) => path.join(repo.state, 'sources', `${id(name)}.json`);
export const source = (repo, name) => read(sourcePath(repo, name));
export const runPath = (repo, name) => path.join(repo.state, 'runs', `${id(name)}.json`);
export const run = (repo, name) => read(runPath(repo, name));
export const saveRun = (repo, value) => { value.updatedAt = new Date().toISOString(); write(runPath(repo, value.id), value); };
export const checksHash = (c) => createHash('sha256').update(JSON.stringify({ checks: c.checks, manualChecks: c.manualChecks })).digest('hex');
export async function locked(repo, fn) {
    mkdirSync(repo.state, { recursive: true, mode: 0o700 });
    const dir = path.join(repo.state, 'lock');
    const token = randomUUID();
    const recovery = path.join(repo.state, 'lock-recovery');
    ensure(!existsSync(recovery), 'REPOSITORY_BUSY', '仓库锁正在恢复；若恢复进程也已中断，请先检查其 owner.json', { recovery });
    const take = () => mkdirSync(dir);
    try {
        take();
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        const owner = read(path.join(dir, 'owner.json'), null);
        let alive = true;
        if (owner?.host === hostname()) {
            try {
                process.kill(owner.pid, 0);
            }
            catch (e) {
                alive = e.code !== 'ESRCH';
            }
        }
        ensure(owner && !alive, 'REPOSITORY_BUSY', '另一个操作正在使用仓库锁；不会强制解锁', owner);
        let acquired = false;
        try {
            mkdirSync(recovery);
            acquired = true;
            write(path.join(recovery, 'owner.json'), { pid: process.pid, host: hostname(), token });
            const latest = read(path.join(dir, 'owner.json'), null);
            ensure(latest?.token === owner.token, 'REPOSITORY_BUSY', '仓库锁已变化，请重试');
            const stale = `${dir}.stale-${token}`;
            renameSync(dir, stale);
            rmSync(stale, { recursive: true });
            take();
        }
        catch {
            throw new FlowError('REPOSITORY_BUSY', '仓库锁已变化或正在恢复，请重试');
        }
        finally {
            if (acquired)
                rmSync(recovery, { recursive: true });
        }
    }
    write(path.join(dir, 'owner.json'), { pid: process.pid, host: hostname(), token });
    try {
        return await fn();
    }
    finally {
        const owner = read(path.join(dir, 'owner.json'), null);
        if (owner?.token === token)
            rmSync(dir, { recursive: true });
    }
}
