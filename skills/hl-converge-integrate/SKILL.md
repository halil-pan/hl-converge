---
name: hl-converge-integrate
description: Integrate selected ready worktree tasks into one directory, validate the combined version, and optionally finish and clean up with hl-converge. Use for multi-worktree integration or resuming an existing integration run.
---

# Integrate ready worktrees

Use `node <this-skill-directory>/scripts/hl-converge.mjs ...`, resolving the path from this skill's actual location. Below, `hl-converge` means that invocation. Use `--json` for stable results and `--repo PATH` when the current directory is not the intended repository.

## Select or resume

Run `status --json`. For a continuation, reuse the recorded run ID and its target; the current branch may be the verification branch. For a new run, select the requested ready task IDs and validation directory. Do not include every discovered task by default.

Target resolution is explicit `plan --target`, otherwise the project's `config set default-target BRANCH`. Once planned, every later command reads the recorded target. Never ask for it again merely because the directory switched branches. If neither a run nor a project default supplies the target, ask once. Set a project default only when requested; changing a default does not retarget an existing run.

Check source commits and feature scope. The CLI takes exact recorded SHAs, not future task branch tips. Preserve unrelated work in the validation directory; a dirty directory is a blocker, not permission to clean it.

## Integrate and verify

Create a plan: `plan --source ID [--source ID...] --workspace PATH [--target BRANCH] --json`. Keep the returned run ID. Run `integrate RUN_ID`; it creates a verification branch in that directory without moving source sessions.

If a merge blocks, inspect the preserved Git state. Resolve conflicts according to both features' intended behavior, commit the resolution when authorized, then run `continue RUN_ID`. A failed merge can be aborted with Git; `continue` will retry it. Ambiguous business behavior requires clarification rather than choosing one side wholesale.

Configure checks when absent: `config set checks FILE.json`. JSON contains `checks` with `name`, `command` (executable and argument array), relative `cwd`, optional `timeoutMs`, and optional `manualChecks` names. Consult actual project scripts; do not invent a passing check. Commands run in the validation directory. For Windows batch wrappers, use a Node script or executable instead of assuming shell expansion.

Run `verify RUN_ID`. Commit integration fixes in the verification branch and verify again. Changed commits or check configuration invalidate prior results. Successful unchanged automated checks are reused unless `--rerun` is requested.

For required manual acceptance, report steps and await actual results. Record a passed item with `verify RUN_ID --confirm-manual "configured name"` only after the user confirms it. Test success alone is not evidence of physical-device or business acceptance.

## Finish and cleanup

Run `finish RUN_ID` only when updating the target was authorized and configured verification passed. It fast-forwards the recorded local target to the validated version. If the target advanced, run `refresh RUN_ID`, resolve conflicts and verify before retrying. No target re-entry is needed.

If cleanup was authorized, inspect `cleanup RUN_ID --dry-run --json`, then use `cleanup RUN_ID --apply`. The core removes confirmed ordinary Git worktrees with release declarations, unchanged merged commits and clean directories. It protects main and verification directories. Ignored local files block removal; preserve them or obtain authorization for `--discard-ignored`. Add `--delete-branches` only when branch deletion was authorized.

Host-managed directories use the host's native worktree cleanup when available. Without that capability, leave them intact and report remaining cleanup. This skill does not create a universal chat archive API or expand host permissions.

Existing authorization persists across stages; do not repeatedly ask for approved local operations. Keep push, deployment and chat archival within their separately authorized scope. Report the recorded target, final SHA, evidence, remaining acceptance and cleanup results.
