import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ensure, FlowError, now } from './errors.js';
import { candidate } from './engine.js';
import { ancestor, branch, clean, head, localRef, git, targetAvailable, assertWorkspace, gitEnv } from './git.js';
import { run, saveRun, config, checksHash } from './store.js';
async function runCheck(check, workspace, log) {
    const cwd = realpathSync(path.resolve(workspace, check.cwd));
    const relative = path.relative(realpathSync(workspace), cwd);
    ensure(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'CHECK_CWD_ESCAPE', '检查目录通过链接指向验证目录外部');
    const start = Date.now();
    let timedOut = false;
    let interrupted = false;
    let bytes = 0;
    writeFileSync(log, `check: ${check.name}\ncommand: ${JSON.stringify(check.command)}\ncwd: ${cwd}\n`, { mode: 0o600 });
    return await new Promise(resolve => {
        const child = spawn(check.command[0], check.command.slice(1), {
            cwd, env: gitEnv(), shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        });
        let force;
        const kill = (signal) => {
            if (!child.pid)
                return;
            try {
                if (process.platform === 'win32')
                    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { timeout: 3000, windowsHide: true });
                else
                    process.kill(-child.pid, signal);
            }
            catch {
                try {
                    child.kill(signal);
                }
                catch { }
            }
        };
        const stop = () => { kill('SIGTERM'); force = setTimeout(() => kill('SIGKILL'), 250); };
        const onSignal = () => { interrupted = true; stop(); };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
        const timeout = setTimeout(() => { timedOut = true; stop(); }, check.timeoutMs);
        const append = (chunk) => {
            const available = Math.max(0, 4 * 1024 * 1024 - bytes);
            if (available)
                appendFileSync(log, chunk.subarray(0, available));
            bytes += chunk.length;
        };
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        child.on('error', error => append(Buffer.from(`\nspawn error: ${error.message}\n`)));
        child.once('close', exitCode => {
            clearTimeout(timeout);
            if (force)
                clearTimeout(force);
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
            if (bytes > 4 * 1024 * 1024)
                appendFileSync(log, '\n[output truncated after 4 MiB]\n');
            resolve({ name: check.name, passed: exitCode === 0 && !timedOut && !interrupted, exitCode, timedOut, interrupted, durationMs: Date.now() - start, log });
        });
    });
}
export async function verify(repo, runId, confirmations, rerun) {
    const r = run(repo, runId);
    ensure(!r.finishedCommit, 'RUN_ALREADY_FINISHED', '本次集成已经合入；请建立新计划验证后续版本');
    ensure(r.steps.every(s => s.status === 'done'), 'RUN_NOT_INTEGRATED', '请先完成全部合并和冲突处理');
    candidate(repo, r);
    clean(r.workspace);
    const current = head(r.workspace);
    const c = config(repo);
    const hash = checksHash(c);
    ensure(r.expectedHead && ancestor(r.workspace, r.expectedHead, current) && r.sources.every(s => ancestor(r.workspace, s.commit, current)), 'UNEXPECTED_HEAD', '验证分支改写了已集成的历史，不能沿用本次计划');
    ensure(c.checks.length + c.manualChecks.length > 0, 'NO_CHECKS_CONFIGURED', '尚未配置验证项：请用 config set checks FILE 配置检查或人工验收项');
    ensure(confirmations.every(name => c.manualChecks.includes(name)), 'UNKNOWN_MANUAL_CHECK', '人工验收名称不在配置中', { configured: c.manualChecks });
    const sameVersion = r.verification?.commit === current && r.verification.checksHash === hash;
    const prior = sameVersion ? r.verification : undefined;
    const reuse = !rerun && ['verified', 'awaiting-manual'].includes(r.status) && prior && prior.checks.length === c.checks.length && prior.checks.every(x => x.passed);
    const previous = reuse ? prior : undefined;
    r.expectedHead = current;
    delete r.verification;
    r.status = 'integrated';
    saveRun(repo, r);
    const dir = path.join(repo.state, 'logs', r.id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const results = [];
    let interrupted = false;
    let treeChanged = false;
    if (previous)
        results.push(...previous.checks);
    else {
        for (let index = 0; index < c.checks.length; index++) {
            const check = c.checks[index];
            const result = await runCheck(check, r.workspace, path.join(dir, `${Date.now()}-${index}.log`));
            results.push(result);
            interrupted ||= result.interrupted;
            try {
                candidate(repo, r);
                clean(r.workspace);
                treeChanged = head(r.workspace) !== current;
            }
            catch {
                treeChanged = true;
            }
            if (treeChanged || interrupted)
                break;
        }
    }
    const manualConfirmed = [...new Set([...(prior?.manualConfirmed ?? []), ...confirmations])];
    const automated = results.length === c.checks.length && results.every(result => result.passed) && !treeChanged;
    const manual = c.manualChecks.every(name => manualConfirmed.includes(name));
    r.verification = { commit: current, checksHash: hash, checks: results, manualConfirmed, passed: automated && manual, at: now() };
    r.status = !automated ? 'verification-failed' : manual ? 'verified' : 'awaiting-manual';
    saveRun(repo, r);
    if (treeChanged)
        throw new FlowError('VERIFICATION_TREE_CHANGED', '检查修改了代码、分支或提交；修复并提交后重新验证', { run: r.id, checks: results });
    if (!automated)
        throw new FlowError(interrupted ? 'CHECK_INTERRUPTED' : 'CHECK_FAILED', '检查未全部通过，目标分支未更新', { run: r.id, checks: results });
    if (!manual)
        throw new FlowError('MANUAL_CHECK_REQUIRED', '自动检查已通过，仍需人工验收结果', { run: r.id, pending: c.manualChecks.filter(name => !manualConfirmed.includes(name)) });
    return r;
}
export function finish(repo, runId) {
    const r = run(repo, runId);
    if (r.finishedCommit)
        return r;
    assertWorkspace(repo, r.workspace);
    const v = r.verification;
    ensure(v?.passed && v.checksHash === checksHash(config(repo)), 'VERIFICATION_REQUIRED', '缺少当前检查配置下通过的验证结果，请先 verify');
    ensure(r.expectedHead === v.commit && localRef(repo.root, r.branch) === v.commit, 'VERIFICATION_STALE', '验证分支在验收后变化，请重新 verify');
    clean(r.workspace);
    targetAvailable(repo, r.target, r.workspace);
    const currentTarget = localRef(repo.root, r.target);
    if (r.finishIntent && currentTarget === v.commit && branch(r.workspace) === r.target && head(r.workspace) === v.commit) {
        r.finishedCommit = v.commit;
        r.status = 'finished';
        saveRun(repo, r);
        return r;
    }
    ensure(currentTarget === r.targetExpected, 'TARGET_MOVED', '目标分支已变化；执行 refresh，再 verify，最后重试 finish', { expected: r.targetExpected, current: currentTarget, target: r.target });
    ensure(ancestor(repo.root, currentTarget, v.commit), 'NOT_FAST_FORWARD', '验证版本无法快进合入目标');
    if (r.finishIntent)
        ensure(r.finishIntent.commit === v.commit && [r.branch, r.target].includes(branch(r.workspace) ?? ''), 'FINISH_STATE_CHANGED', '合入中断后的目录状态发生变化，请核对');
    else {
        candidate(repo, r);
        ensure(head(r.workspace) === v.commit, 'VERIFICATION_STALE', '当前代码不是已验证版本');
    }
    r.finishIntent = { commit: v.commit, targetBefore: currentTarget };
    saveRun(repo, r);
    if (branch(r.workspace) !== r.target)
        git(r.workspace, ['switch', r.target]);
    clean(r.workspace);
    ensure(localRef(repo.root, r.target) === r.targetExpected, 'TARGET_MOVED', '目标在合入准备期间变化，请检查记录');
    git(r.workspace, ['merge', '--ff-only', '--no-edit', v.commit]);
    ensure(head(r.workspace) === v.commit && localRef(repo.root, r.target) === v.commit, 'TARGET_CHANGED_DURING_FINISH', '合入期间分支变化，请检查实际状态');
    clean(r.workspace);
    r.finishedCommit = v.commit;
    r.status = 'finished';
    saveRun(repo, r);
    return r;
}
