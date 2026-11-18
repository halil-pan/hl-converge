---
name: hl-converge-integrate
description: Combine selected ready worktrees (汇总验证), verify them, finish into the recorded local target and clean eligible source worktrees with hl-converge. Wait for required human acceptance. Use for integration or resuming a run.
---

# Integrate ready worktrees

Use `node <this-skill-directory>/scripts/hl-converge.mjs ...`, resolving the path from this skill's actual location. Below, `hl-converge` means that invocation. Use `--json` for stable results and `--repo PATH` when the current directory is not the intended repository.

For a request to clean this chat's released source worktree for an already finished run, follow the source-side procedure in [Codex native cleanup](references/codex-cleanup.md). Do not create another integration run or move the target again.

## Default execution scope

A user request to carry out this workflow, including "汇总验证" or "使用 $hl-converge-integrate，将 feature-a 和 feature-b 汇总到当前目录统一验证", requests the complete local flow: integrate the selected sources, commit necessary integration fixes, verify, finish into the recorded target, then preview and apply cleanup of eligible sources from this run. Do not stop after successful verification to ask for permission to finish or clean up. Merely loading this skill, explaining it, or drafting example prompts is not an execution request.

Respect explicit limits such as "只预览", "先别合并", "保留 worktree", or "不提交". A preview is read-only; do not run integrate or other mutating stages for it. Existing task or host approval requirements still apply. Default cleanup removes eligible source worktrees; keep feature branches unless branch deletion is explicitly requested. Push, deployment and chat archival are outside this default flow and require a separate explicit request.

## Select or resume

Run `status --json`. For a continuation, reuse the recorded run ID and its target; the current branch may be the verification branch. For a new run, select the requested ready task IDs and validation directory. When the request omits source IDs and there is no unambiguous current run or selected task scope, ask which sources to include. Do not include every discovered task by default.

Target resolution is explicit `plan --target`, otherwise the project's `config set default-target BRANCH`. Once planned, every later command reads the recorded target. Never ask for it again merely because the directory switched branches. If neither a run nor a project default supplies the target, ask once. Set a project default only when requested; changing a default does not retarget an existing run.

Check source commits and feature scope. The CLI takes exact recorded SHAs, not future task branch tips. Preserve unrelated work in the validation directory; a dirty directory is a blocker, not permission to clean it.

## Integrate and verify

Create a plan: `plan --source ID [--source ID...] --workspace PATH [--target BRANCH] --json`. Keep the returned run ID. Run `integrate RUN_ID`; it creates a verification branch in that directory without moving source sessions.

If a merge blocks, inspect the preserved Git state. Resolve clear technical conflicts according to both features' intended behavior, commit the resolution within the execution scope, then run `continue RUN_ID`. A failed merge can be aborted with Git; `continue` will retry it. Ambiguous business behavior requires clarification rather than choosing one side wholesale.

Configure checks when absent: `config set checks FILE.json`. JSON contains `checks` with `name`, `command` (executable and argument array), relative `cwd`, optional `timeoutMs`, and optional `manualChecks` names. Consult actual project scripts; do not invent a passing check. Commands run in the validation directory. For Windows batch wrappers, use a Node script or executable instead of assuming shell expansion.

Determine required human acceptance from the task requirements, project acceptance criteria and gaps in actual validation; configure the corresponding `manualChecks` before treating the run as passed. Do not invent a mandatory human gate for every run. Automated-only runs can proceed directly to finish and cleanup.

Run `verify RUN_ID`. The default execution request includes committing necessary integration fixes in the verification branch and verifying again. Changed commits or check configuration invalidate prior results. Successful unchanged automated checks are reused unless `--rerun` is requested.

For required manual acceptance, report the pending items, practical steps and run ID, and wait before updating the target or cleaning sources. Record a passed item with `verify RUN_ID --confirm-manual "configured name"` only after the user confirms it. Test success alone is not evidence of physical-device or business acceptance. After confirmation, continue the same run through finish and cleanup without another approval loop. If code or checks changed, revalidate and obtain any newly required acceptance for that version.

## Finish and cleanup

Once all configured verification, including required human acceptance, passes, run `finish RUN_ID` as part of the default execution request, unless the user explicitly deferred the target update. It fast-forwards the recorded local target to the validated version. If the target advanced, run `refresh RUN_ID`, resolve conflicts and verify before retrying. No target re-entry or renewed merge permission is needed.

After a successful finish, inspect `cleanup RUN_ID --dry-run --json`, then use `cleanup RUN_ID --apply` for this run as part of the default execution request, unless the user asked to retain the worktrees. Do not ask for another cleanup approval merely because the preview is complete. The core removes confirmed ordinary Git worktrees with release declarations, unchanged merged commits and clean directories. It protects main and verification directories. Keep blocked sources and report the concrete reason. Ignored local files block removal; preserve them or obtain explicit authorization for `--discard-ignored`. Add `--delete-branches` only when branch deletion was explicitly requested.

Host-managed directories use the host's native worktree cleanup when available, after confirming the same release, merged-version and file-preservation conditions. On Codex, a worktree belonging to another chat can require that chat to perform the native cleanup. Read [Codex native cleanup](references/codex-cleanup.md): locate the exact source chat, obtain any required direct human authorization to message it, dispatch the limited cleanup request, wait for its result, then verify removal with the CLI. A permission denial on `attach_worktree` is not the end of the workflow when this authorized source-chat route is available. Do not ask the user to switch windows and relay an already authorized request.

Do not relabel host-managed directories as ordinary Git worktrees, forge attachment identities, or use Git deletion to bypass the host. If native cleanup or authorized source-chat coordination is unavailable, leave the directory intact and report the specific blocker. Cleanup does not archive chats or expand host permissions.

Existing authorization and explicit limits persist across stages and manual-acceptance replies. Report the recorded target, final SHA, evidence, remaining acceptance and removed or preserved sources. A blocked cleanup is not a completed cleanup, even if finish succeeded.
