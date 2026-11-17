---
name: hl-converge-ready
description: Finish the current feature (收尾), commit its changes, and register its worktree for later integration and cleanup with hl-converge. Use for a feature handoff; merging into the target belongs to hl-converge-integrate.
---

# Prepare a worktree for integration

Use the bundled CLI: `node <this-skill-directory>/scripts/hl-converge.mjs ...`.
Resolve the directory from the actual SKILL.md location supplied by the host, not the current project directory. No global CLI installation is required. Below, `hl-converge` means this bundled invocation.

## Default execution scope

A user request to carry out this workflow, including "收尾当前功能" or "使用 $hl-converge-ready，收尾当前功能，任务 ID 为 feature-a", requests the following local actions: complete the feature checks, commit this feature's changes, stop this task's writers, and register the exact commit as ready and eligible for cleanup after successful integration. Do not ask again for permission to perform those included steps. Merely loading this skill, explaining it, or drafting example prompts is not an execution request.

An explicit narrower instruction takes precedence: "只检查", "不提交", "先别释放" or "保留 worktree" limits the corresponding actions. If the requested limit prevents readiness, report that stage as incomplete. Existing task or host approval requirements still apply. This workflow does not merge into the target, remove the source directory, push, deploy or archive the chat; push and deployment require a separate explicit request.

## Prepare and register

1. Check the current repository, worktree, branch and changes. Identify the feature's files and unrelated work. For a read-only status request, report status without committing or registering readiness.
2. Complete feature checks and fix failures within the feature's scope. For the default execution request, stage the feature's exact files and commit them without a separate commit approval. Reuse an existing suitable commit when no feature changes remain; do not create an empty commit. Preserve unrelated changes. Readiness requires the entire source worktree to be clean; report mixed worktree blockers rather than stashing or cleaning other work.
3. Reuse the task branch. In detached HEAD, create a task branch before registering; `ready --branch NEW_NAME` can create one after changes are committed. Never register the target branch as a feature.
4. Stop development services and other writers started for this task and finish outstanding writes before handing it off. Do not stop shared services or another task's processes. If stopping the task's writers cannot be confirmed, keep it unreleased and report why.
5. Pick a stable lowercase task ID, or reuse this task's ID from `hl-converge status`. Run `hl-converge ready --name ID --label "feature description" --json` from the source worktree, adding the confirmed owner and `--released` once the release conditions below are met.

Ownership describes who manages the directory, not which model is speaking. Add `--owner git` only for a confirmed ordinary Git worktree. Use `--owner codex`, `claude-code`, `opencode` or `oh-my-pi` for directories managed by that host; leave it unknown when uncertain.

The default execution request includes eligibility for later cleanup. Add `--released` after this task and its development services have stopped writing there, unless the user asked to keep it active or retain the worktree. This flag records the confirmed handoff; it does not detect processes automatically. When registering again, repeat the confirmed owner and release declaration only if those conditions still hold; a fresh registration without those flags is conservative.

The CLI records the source in the repository's shared Git administration directory. Other worktree sessions can read it with `status`; no chat-to-chat messaging or copied status file is needed.

Return the task ID, worktree path, branch, complete SHA, checks performed, outstanding acceptance items, ownership and release status. After releasing, do not resume writes to that directory without re-registering the new state. Leave integration and cleanup to the main-directory workflow.
