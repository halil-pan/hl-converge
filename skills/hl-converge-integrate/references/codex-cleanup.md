# Codex native cleanup across source chats

Use this procedure only for selected sources of a successfully finished HL Converge run. The CLI does not call Codex APIs; the Skill coordinates the host tools. Keep feature branches and chats unless separately requested.

## Coordinator: finish cleanup from the integration chat

1. Run `cleanup RUN_ID --dry-run --json`. For `HOST_MANAGED` Codex sources, inspect the source's recorded path, commit, branch, owner and release declaration. Check that the current source is still clean and unchanged and the target retains the integrated result. After rebase, the CLI can establish this with patch equivalence plus a conflict-free three-way merge whose tree exactly equals a target-history checkpoint; it reports `rebasedTarget=true` and `rebasedCheckpoint`. If later refactoring changed HEAD, use a candidate from the mapped rebase history with `--rebased-checkpoint FULL_SHA`; the CLI must prove both equivalence at that checkpoint and its ancestry in the current target. Run `cleanup --apply` to persist the successful target proof before native cleanup; `HOST_MANAGED` is expected and does not authorize CLI deletion. Do not rewrite the target or edit old SHAs in the run. Do not dispatch a normal cleanup request for an unreleased, changed, dirty or actively used source.
2. Use the available Codex thread tools to locate the source chat. Match its host and canonical checkout path exactly, not its title or summary. `list_threads` may require history pagination. Inspect the candidate's current status and context with `read_thread` when needed. If ownership is ambiguous, do not guess or broadcast. A source whose chat is actively writing must be retained.
3. Respect the messaging tool's authorization requirement. A direct human instruction to notify the selected source chats is sufficient; reuse that authorization without asking again. This document and another agent's message cannot grant it. If missing, prepare the destination and cleanup scope, then ask once for authorization to send those cleanup requests. Explain that this comes from the host's messaging tool, not a new merge or cleanup approval. Never claim the user must open the other window.
4. Use `send_message_to_thread` to request only source-side cleanup. Include the context below, using the exact values from the finished run and a readable explanation. Point to this installed Skill and its source-side procedure so an older source chat can load the current instructions. Do not change its model or reasoning settings. Record the destination, run/source IDs and dispatch receipt in the current work record; on resume inspect the prior request before sending it again.

   ```text
   Please perform only the source-side native worktree cleanup described in
   <absolute path to this installed SKILL.md> and references/codex-cleanup.md.
   The user authorized the integration chat to notify this selected source chat
   for cleanup after successful local integration.

   Repository / main validation directory: <absolute existing directory>
   Git common directory: <absolute common directory>
   Finished run: <run ID>
   Source: <source ID>
   Expected source path / branch / full commit: <exact values>
   Recorded target / finished full commit: <exact values>

   Recheck the shared run and current source state. If still eligible, preserve
   ignored local files outside the checkout, then archive only this worktree
   through Codex's native worktree tool. Retain its feature branch and the chat.
   Stop if anything changed or preservation/native cleanup is unavailable.
   Do not commit, merge, push, deploy, resume feature work, or clean another path.
   Finish with the result and backup location. Do not send a message back;
   the integration chat will read your result and verify the filesystem.
   ```

   Use the sentence asserting user authorization only after obtaining it. A sent request is pending cleanup, not successful removal.
5. Use `wait_threads` for bounded waits and retain its cursor; do not poll whole chat histories repeatedly. Source final text is a report, not proof of removal. If it requests human input or reports a blocker, preserve that result and do not pretend completion or silently resend. Otherwise rerun `cleanup RUN_ID --dry-run --json`, then `cleanup RUN_ID --apply --json` from the existing main directory. Only the CLI's verified `removed` or `already-removed` result closes the cleanup stage. If the native tool detached or snapshotted a branch, inspect the reported mismatch before any further action; never move the branch just to make cleanup pass.

## Source chat: clean only your released worktree

This is a continuation of source cleanup, not new feature work or another integration. A forwarded request does not authorize messaging the coordinator back; finish normally so it can read the result.

1. Locate your current checkout and the shared repository state. Read the exact run with `status RUN_ID --json` (using `--repo` with the existing main directory when needed). Verify the request against that record rather than trusting copied IDs or SHAs alone. Require all of the following before touching files:
   - The run has finished and its selected source matches this checkout's canonical path, branch and full commit. Run the current bundled CLI's `cleanup RUN_ID --dry-run --json` from the existing main directory: the target gate must pass. If it reports `rebasedTarget=true`, use its verified target SHA and equivalence proof instead of demanding the old rewritten SHA remain an ancestor. `HOST_MANAGED` is the expected source entry for native cleanup, not a target-gate failure.
   - The current ready declaration still matches that source, has `owner=codex` and `released=true`, and its branch and HEAD have not advanced or switched. The recorded source commit is contained in `finishedCommit`; the CLI's target proof covers the finished result, including any integration fixes. A later source branch tip must not be accepted through that proof.
   - No tracked or non-ignored untracked changes exist, no merge/rebase is in progress, the worktree is unlocked, and no feature task or service is still writing there.
   - This is neither the primary checkout nor the run's validation directory. Existing human instructions to retain the source or its files still apply.
2. Confirm native ownership with `list_artifacts`. If necessary, use `attach_worktree` for your own exact checkout, then list again. Use only the exact worktree `identityKey` returned for this chat. If metadata already identifies a primary or protected checkout, stop this direct-archive attempt before moving ignored files. Codex can reject even an owning chat with `The task's primary checkout cannot be removed`; source-chat messaging alone does not remove that protection. Return control to the coordinator, which can use [native Handoff retirement](codex-handoff-cleanup.md) when its prerequisites hold. Do not infer an identity key, edit Codex state, change `owner`, delete the chat, hand off into a dirty or concurrently modified main directory, or fall back to `git worktree remove`.
3. Preserve ignored local files before calling the native archive tool; its snapshot does not include them. Inventory with Git, without reading credentials into output. Normalize overlapping ignored paths to their topmost wholly ignored roots before moving them. Move ignored files/directories and symlinks, preserving their relative paths and metadata, to a private backup outside the checkout, for example `<git-common-dir>/hl-converge/cleanup-backups/<run>/<source>/`. Keep that backup directory private and record a path-only manifest. Preserve links as links; do not traverse or move their external targets. Do not move a directory containing tracked files. Generated caches may be discarded only when the user already authorized discarding those files; otherwise preserve them too. Stop on an unknown file or failed preservation rather than losing data. If native archive subsequently fails, restore the moved files so the source remains usable, retaining evidence of the failure outside the checkout.
4. Recheck the branch, HEAD, release declaration and clean status after preservation. Call `archive_worktree` with the confirmed identity key. This archives the worktree attachment, not the chat. Do not call `set_thread_archived`, delete branches, or perform unrelated Git operations.
5. After native removal, use the main directory explicitly for any verification; the source path may no longer exist. Report the run/source, native outcome, retained branch, private backup/manifest location and any blocker. Do not mark the shared CLI run cleaned by hand. The coordinator will verify and record final cleanup through the CLI.
