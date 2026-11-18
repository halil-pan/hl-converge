import { existsSync } from 'node:fs';
import { run, saveRun, source, sourcePath } from './store.js';
import { ancestor, branch, canonical, dirty, git, head, localRef, samePath, worktrees } from './git.js';
import { ensure } from './errors.js';
export function cleanup(repo, runId, apply, discardIgnored, deleteBranches, checkpoint) {
    const r = run(repo, runId);
    ensure(r.finishedCommit, 'RUN_NOT_FINISHED', '目标尚未接收本次验证版本，不能清理来源');
    const targetHead = localRef(repo.root, r.target);
    const rebasedTarget = !ancestor(repo.root, r.finishedCommit, targetHead);
    const rebasedCheckpoint = rebasedTarget ? checkpoint ?? r.cleanupTarget?.checkpoint ?? targetHead : undefined;
    if (rebasedCheckpoint) {
        ensure(/^[a-f0-9]{40}([a-f0-9]{24})?$/i.test(rebasedCheckpoint), 'INVALID_CHECKPOINT', '检查点必须是完整提交 SHA');
        ensure(ancestor(repo.root, rebasedCheckpoint, targetHead), 'CHECKPOINT_NOT_IN_TARGET', '目标已不包含该重写历史检查点，保留全部来源');
        ensure(equivalentTarget(repo, r.finishedCommit, rebasedCheckpoint), 'TARGET_NO_LONGER_CONTAINS_RUN', '无法证明检查点保留原集成补丁与最终文件树，保留全部来源');
    }
    const primary = worktrees(repo)[0]?.path;
    const entries = [];
    for (const s of r.sources) {
        const entry = { id: s.id, path: s.path, status: 'blocked' };
        try {
            const current = existsSync(sourcePath(repo, s.id)) ? source(repo, s.id) : null;
            ensure(current && current.commit === s.commit && current.path === s.path && current.branch === s.branch, 'SOURCE_RECORD_CHANGED', '就绪记录已变化，请保留后续工作');
            ensure(s.path !== primary && !samePath(s.path, r.workspace), 'PROTECTED_WORKSPACE', '不能删除主目录或本次验证目录');
            const sourceMerged = ancestor(repo.root, s.commit, targetHead) || (rebasedTarget && ancestor(repo.root, s.commit, r.finishedCommit));
            ensure(sourceMerged, 'NOT_MERGED', '来源提交尚未合入目标');
            const registered = worktrees(repo).find(w => samePath(w.path, s.path));
            const b = git(repo.root, ['show-ref', '--verify', '--hash', `refs/heads/${s.branch}`], true).trim();
            const previouslyDeleted = r.cleanup?.find(e => e.id === s.id)?.branchDeleted;
            ensure((b === s.commit && sourceMerged) || (!b && previouslyDeleted && !registered && !existsSync(s.path)), 'SOURCE_BRANCH_CHANGED', '任务分支出现新提交或已由其他操作删除');
            if (!b && previouslyDeleted)
                entry.branchDeleted = true;
            if (!registered && !existsSync(s.path))
                entry.status = 'already-removed';
            else {
                ensure(registered && existsSync(s.path), 'WORKTREE_STATE_CHANGED', '目录和 Git 登记状态不一致，请通过原管理工具处理');
                ensure(current.owner === 'git', 'HOST_MANAGED', '该目录的管理方式未确认为普通 Git worktree，请通过宿主原生方式清理');
                ensure(current.released, 'SOURCE_NOT_RELEASED', '任务未声明停止写入；结束任务和服务后，在该目录重新 ready --released');
                ensure(!registered.locked && canonical(s.path) === s.path, 'WORKTREE_LOCKED', '目录被锁定或路径身份变化');
                ensure(head(s.path) === s.commit && branch(s.path) === s.branch, 'SOURCE_HEAD_CHANGED', '来源目录已经切换到其他版本');
                ensure(!dirty(s.path), 'SOURCE_DIRTY', '来源目录仍有未提交改动');
                const ignored = git(s.path, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']);
                ensure(discardIgnored || !ignored, 'IGNORED_FILES_PRESENT', '目录包含本地忽略文件，先保留或备份；确认可丢弃后使用 --discard-ignored', { paths: ignored.split('\0').filter(Boolean).slice(0, 30) });
                entry.status = 'eligible';
                if (apply) {
                    git(repo.root, ['worktree', 'remove', s.path]);
                    entry.status = 'removed';
                }
            }
            if (apply && deleteBranches && !entry.branchDeleted && ['removed', 'already-removed'].includes(entry.status)) {
                git(repo.root, ['branch', '-d', s.branch]);
                entry.branchDeleted = true;
            }
        }
        catch (error) {
            entry.reason = error.message;
            entry.code = error.code ?? 'CLEANUP_FAILED';
            entry.details = error.details;
            // A branch deletion failure must not claim its worktree still exists.
            if (!['removed', 'already-removed'].includes(entry.status))
                entry.status = 'blocked';
        }
        entries.push(entry);
    }
    if (apply) {
        r.cleanup = entries;
        r.cleanupTarget = { commit: targetHead, rebased: rebasedTarget, ...(rebasedCheckpoint ? { checkpoint: rebasedCheckpoint } : {}) };
        if (entries.every(e => ['removed', 'already-removed'].includes(e.status)))
            r.status = 'cleaned';
        saveRun(repo, r);
    }
    return { run: r.id, apply, targetCommit: targetHead, rebasedTarget, rebasedCheckpoint, entries, integrationBranch: r.branch, note: '保留验证分支和操作记录；本命令不会归档聊天、推送或部署。' };
}
function equivalentTarget(repo, finishedCommit, targetHead) {
    // rebase 会改写 SHA；仅补丁曾出现还不够，撤销或后续冲突也必须阻止清理。
    const unmatched = git(repo.root, ['log', '--cherry-pick', '--right-only', '--no-merges', '--format=%H', `${targetHead}...${finishedCommit}`]);
    if (unmatched.trim())
        return false;
    const mergedTree = git(repo.root, ['merge-tree', '--write-tree', finishedCommit, targetHead], true).trim();
    const targetTree = git(repo.root, ['rev-parse', `${targetHead}^{tree}`]).trim();
    return mergedTree === targetTree;
}
