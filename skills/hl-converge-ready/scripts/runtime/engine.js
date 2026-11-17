import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ensure, FlowError, now } from './errors.js';
import { branch, head, git, localRef, validateBranch, clean, canonical, ancestor, assertWorkspace, targetAvailable, worktrees, samePath, merging } from './git.js';
import { config, id, source, sourcePath, write, run, saveRun } from './store.js';
export function ready(repo, name, label, owner, released, createBranch) {
    id(name);
    clean(repo.root);
    if (createBranch) {
        ensure(!branch(repo.root), 'ALREADY_ON_BRANCH', '已有任务分支，请沿用现有分支');
        validateBranch(repo.root, createBranch);
        git(repo.root, ['switch', '-c', createBranch]);
    }
    const b = branch(repo.root);
    ensure(b, 'TASK_BRANCH_REQUIRED', '请先创建任务分支，或通过 ready --branch NAME 给当前无分支状态创建分支');
    ensure(b !== config(repo).defaultTarget, 'SOURCE_IS_DEFAULT_TARGET', '请在独立任务分支登记功能，不在默认目标分支登记');
    const existing = existsSync(sourcePath(repo, name)) ? source(repo, name) : null;
    ensure(!existing || samePath(existing.path, repo.root), 'SOURCE_ID_COLLISION', '该任务 ID 已被另一个目录使用', { path: existing?.path });
    const s = { id: name, label: label ?? name, path: repo.root, branch: b, commit: head(repo.root), owner, released, updatedAt: now() };
    git(repo.root, ['update-ref', `refs/hl-converge/sources/${name}`, s.commit]);
    write(sourcePath(repo, name), s);
    return s;
}
export function plan(repo, names, workspace, target) {
    ensure(names.length > 0 && new Set(names).size === names.length, 'SOURCES_REQUIRED', '请选择一个或多个不同的就绪任务 ID');
    const selectedTarget = target ?? config(repo).defaultTarget;
    ensure(selectedTarget, 'TARGET_REQUIRED', '尚未设置目标：先 config set default-target BRANCH，或本次 plan --target BRANCH');
    const targetCommit = localRef(repo.root, selectedTarget);
    const dest = assertWorkspace(repo, workspace);
    clean(dest);
    targetAvailable(repo, selectedTarget, dest);
    const sources = names.map(name => source(repo, name));
    ensure(new Set(sources.map(s => s.path)).size === sources.length, 'DUPLICATE_WORKTREE', '同一个 worktree 不能在同一计划中重复纳入');
    for (const s of sources) {
        ensure(s.branch !== selectedTarget && !samePath(s.path, dest), 'SOURCE_TARGET_OVERLAP', '来源任务不能是目标分支或验证目录本身', { source: s.id });
        ensure(/^[0-9a-f]{40,64}$/.test(s.commit) && !!git(repo.root, ['cat-file', '-t', s.commit], true).trim(), 'SOURCE_COMMIT_MISSING', '来源记录中的提交不存在', { source: s.id });
        if (existsSync(s.path))
            ensure(canonical(git(s.path, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim()) === repo.common, 'DIFFERENT_REPOSITORY', '来源目录已不属于当前仓库', { source: s.id });
    }
    const runId = `run-${randomUUID().slice(0, 12)}`;
    const r = {
        version: 1, id: runId, target: selectedTarget, targetExpected: targetCommit, targetOrigin: target ? 'explicit' : 'project-default',
        workspace: dest, originalBranch: branch(dest), originalHead: head(dest), branch: `hl-converge/integrate/${runId}`,
        sources, steps: sources.map(s => ({ kind: 'source', id: s.id, commit: s.commit, status: 'pending' })),
        status: 'planned', createdAt: now(), updatedAt: now(),
    };
    for (const s of sources)
        git(repo.root, ['update-ref', `refs/hl-converge/runs/${runId}/sources/${s.id}`, s.commit]);
    git(repo.root, ['update-ref', `refs/hl-converge/runs/${runId}/base`, targetCommit]);
    saveRun(repo, r);
    return r;
}
export function candidate(repo, r) {
    assertWorkspace(repo, r.workspace);
    ensure(branch(r.workspace) === r.branch, 'WRONG_BRANCH', '验证目录未处于本次验证分支，请先检查并切回；工具不会覆盖现有工作', { expected: r.branch, current: branch(r.workspace), workspace: r.workspace });
}
function completeStep(repo, r, s) {
    const current = head(r.workspace);
    ensure(s.before && ancestor(r.workspace, s.before, current) && ancestor(r.workspace, s.commit, current), 'UNEXPECTED_HEAD', '当前提交不能证明本次合并已完成，请检查状态', { step: s.id });
    clean(r.workspace);
    s.status = 'done';
    s.after = current;
    r.expectedHead = current;
    if (s.kind === 'target')
        r.targetExpected = s.commit;
    saveRun(repo, r);
}
export function integrate(repo, runId) {
    const r = run(repo, runId);
    if (r.finishedCommit)
        return r;
    assertWorkspace(repo, r.workspace);
    if (r.status === 'planned') {
        clean(r.workspace);
        ensure(localRef(repo.root, r.target) === r.targetExpected, 'TARGET_MOVED', '目标分支在计划后变化，请重新建立计划');
        if (branch(r.workspace) !== r.branch) {
            ensure(branch(r.workspace) === r.originalBranch && head(r.workspace) === r.originalHead, 'WORKSPACE_CHANGED', '计划后验证目录的分支或提交发生变化，请重新建立计划');
            ensure(!git(repo.root, ['show-ref', '--verify', '--hash', `refs/heads/${r.branch}`], true).trim(), 'BRANCH_COLLISION', '验证分支已存在但未处于预期目录');
            git(r.workspace, ['switch', '-c', r.branch, r.targetExpected]);
        }
        ensure(head(r.workspace) === r.targetExpected, 'UNEXPECTED_HEAD', '新验证分支不在计划起点');
        r.expectedHead = head(r.workspace);
        r.status = 'integrating';
        saveRun(repo, r);
    }
    candidate(repo, r);
    for (const s of r.steps) {
        if (s.status === 'done')
            continue;
        if (s.status === 'merging' || s.status === 'conflict') {
            ensure(!merging(r.workspace), 'MERGE_RESOLUTION_REQUIRED', '请先解决冲突并提交，再执行 continue；也可用 git merge --abort 取消本次合并', { run: r.id, source: s.id });
            if (head(r.workspace) !== s.before || ancestor(r.workspace, s.commit, head(r.workspace))) {
                completeStep(repo, r, s);
                continue;
            }
            clean(r.workspace);
            s.status = 'pending';
        }
        clean(r.workspace);
        ensure(head(r.workspace) === r.expectedHead, 'UNEXPECTED_HEAD', '验证分支出现未记录的提交，请检查后使用 verify 验证修复，或恢复预期分支');
        s.before = head(r.workspace);
        s.status = 'merging';
        r.status = 'integrating';
        delete r.verification;
        saveRun(repo, r);
        try {
            git(r.workspace, ['merge', '--no-ff', '--no-edit', s.commit]);
        }
        catch (error) {
            s.status = merging(r.workspace) ? 'conflict' : 'merging';
            r.status = 'conflict';
            saveRun(repo, r);
            throw new FlowError('MERGE_BLOCKED', '合并未完成，现场已保留；处理后执行 continue', { run: r.id, source: s.id, cause: error.message });
        }
        completeStep(repo, r, s);
    }
    clean(r.workspace);
    ensure(head(r.workspace) === r.expectedHead, 'UNEXPECTED_HEAD', '验证分支已变化，请执行 verify 核对修复');
    if (!['verified', 'awaiting-manual', 'verification-failed'].includes(r.status))
        r.status = 'integrated';
    saveRun(repo, r);
    return r;
}
export function refresh(repo, runId) {
    const r = run(repo, runId);
    ensure(!r.finishedCommit && r.steps.every(s => s.status === 'done'), 'RUN_NOT_INTEGRATED', '请先完成来源合并');
    candidate(repo, r);
    clean(r.workspace);
    ensure(head(r.workspace) === r.expectedHead, 'UNEXPECTED_HEAD', '先使用 verify 记录并验证当前修复');
    const latest = localRef(repo.root, r.target);
    if (latest === r.targetExpected)
        return r;
    r.steps.push({ kind: 'target', id: r.target, commit: latest, status: 'pending' });
    r.status = 'integrating';
    delete r.verification;
    saveRun(repo, r);
    return integrate(repo, runId);
}
export function inventory(repo) {
    const sourceDir = path.join(repo.state, 'sources');
    const runDir = path.join(repo.state, 'runs');
    return {
        repository: repo.root, config: config(repo), worktrees: worktrees(repo),
        sources: existsSync(sourceDir) ? readdirSync(sourceDir).filter(f => f.endsWith('.json')).map(f => source(repo, f.slice(0, -5))) : [],
        runs: existsSync(runDir) ? readdirSync(runDir).filter(f => f.endsWith('.json')).map(f => { const r = run(repo, f.slice(0, -5)); return { id: r.id, target: r.target, status: r.status, workspace: r.workspace, updatedAt: r.updatedAt }; }) : [],
    };
}
