---
name: hl-converge-ready
description: Finish a feature in its existing Git worktree and register an exact committed version for later integration with hl-converge. Use for preparing a task handoff, not for merging into a target branch.
---

# Prepare a worktree for integration

Use the bundled CLI: `node <this-skill-directory>/scripts/hl-converge.mjs ...`.
Resolve the directory from the actual SKILL.md location supplied by the host, not the current project directory. No global CLI installation is required. Below, `hl-converge` means this bundled invocation.

1. Check the current repository, worktree, branch and changes. Identify the feature's files and unrelated work. For a read-only status request, report status without committing or registering readiness.
2. Complete feature checks within the user's scope. When commits are authorized, stage the feature's exact files and commit them. Preserve unrelated changes. Readiness requires the entire source worktree to be clean; report mixed worktree blockers rather than stashing or cleaning other work.
3. Reuse the task branch. In detached HEAD, create a task branch before registering; `ready --branch NEW_NAME` can create one after changes are committed. Never register the target branch as a feature.
4. Pick a stable lowercase task ID, or reuse this task's ID from `hl-converge status`. Run `hl-converge ready --name ID --label "feature description" --json` from the source worktree.

Ownership describes who manages the directory, not which model is speaking. Add `--owner git` only for a confirmed ordinary Git worktree. Use `--owner codex`, `claude-code`, `opencode` or `oh-my-pi` for directories managed by that host; leave it unknown when uncertain.

Add `--released` only after this task and its development services have stopped writing there and the user intends it to be eligible for later cleanup. This is an explicit declaration, not automatic process detection. When registering again, repeat the confirmed owner and release declaration; a fresh registration without those flags is conservative.

The CLI records the source in the repository's shared Git administration directory. Other worktree sessions can read it with `status`; no chat-to-chat messaging or copied status file is needed.

Return the task ID, worktree path, branch, complete SHA, checks performed, outstanding acceptance items, ownership and release status. Registration does not merge, push, deploy or delete the source.
