# Retire a primary source checkout with native Handoff

Use only after the user authorized removal of the selected source and direct native archive returned the primary-checkout protection. This moves the source chat out of the old checkout using the public `handoff_thread` lifecycle, then archives its old attachment. It is not chat archival, a merge, or permission to edit host state.

## Preconditions and recovery

- The source is an idle, released, clean linked worktree, not Git's primary checkout or the validation directory. Its original branch/SHA still match the selected source. The CLI's target proof passes, including a verified historical checkpoint if the target was rebased and later refactored.
- The main directory is clean, its branch and complete SHA are recorded, no other task is writing there, and it can be restored to the recorded target immediately after Handoff. If this cannot be established, do not move a source into it.
- Use one source at a time. No source agent may resume feature work during this operation. Leave original feature branches unchanged.
- Persist the original source branch/SHA, target SHA, backup paths, temporary branch, Handoff operation/receipt and each completed phase outside the source checkout. On resume inspect actual state and continue from that phase; do not dispatch duplicate Handoffs blindly.

## Prepare the source

Before Handoff, have the owning source chat confirm that `list_artifacts` contains its old worktree attachment. If missing, attach its own exact current checkout **in the source chat before migration**. An attachment can stage workspace/composer context: complete an authorized read-only confirmation turn and wait for idle before Handoff. Do not remove or send an unknown human draft to clear a pending-state error.

Have the owning source chat preserve **all** ignored files outside the checkout in a private directory under the shared Git administration directory, retaining relative paths, metadata and symlinks without following external targets. Preserve the original feature ref and target in a verified Git bundle as well. The source must remain clean after preservation. Keep the backup after successful removal.

Create a temporary `codex/cleanup-...` branch in the source at the **current main target SHA**, then switch only that source to it. This ensures Handoff will check out the same file tree in main rather than old feature code. Record this intentional HEAD transition; do not overwrite the original ready declaration or feature branch. If target or source changes unexpectedly, stop and restore the source branch and ignored files.

## Move the chat, then archive the old attachment

1. The coordinator rechecks main is clean and both main and the temporary source branch have the recorded target SHA. Call the public `handoff_thread` for that source chat with no follow-up prompt or host change. Wait with `get_handoff_status` and its revision until completion. Handoff can return a different `destinationThreadId` for the local continuation; record it and direct subsequent archive requests and waits to that returned chat. Do not create an unrelated replacement chat, interrupt a running feature task or call private application APIs.
2. Verify main still has the same commit and file tree; Handoff may have changed its checked-out branch to the temporary branch. When clean, switch main back to the recorded target branch immediately. Confirm that target and original source refs remain unchanged. If any unexpected change appears, preserve it and stop rather than resetting it.
3. Confirm the returned destination chat now uses main. Ask it to archive only the old source attachment, using a freshly listed exact `identityKey`. The old checkout is now a background worktree rather than that chat's current primary checkout. Do not attach it again in the final archive turn: attachment can make it primary again. If the attachment was not carried over, register it, finish a confirmation turn, and return to the coordinator for another controlled Handoff before archival. Recheck the expected transitional HEAD, clean status, complete external backup and retained original feature ref before calling `archive_worktree`. Do not run normal source-HEAD checks against the old SHA without accounting for the documented transition.
4. The coordinator verifies the old directory and Git worktree registration are gone, then runs normal CLI cleanup to record `already-removed`. Reuse the stored verified rebase checkpoint. Confirm the original feature ref, target SHA, main branch and main clean status. Retain source chats and backups. A temporary helper branch created only for this operation may be removed with ordinary `git branch -d` after it is no longer checked out and is fully merged; never delete the feature branch.

On Handoff or archive failure, keep complete backups and inspect the actual checkout locations first. Restore moved ignored files to the surviving original source when safe, and restore main's recorded branch only if it remains clean at the expected SHA. Do not force Git deletion, change ownership labels or invent host attachment IDs. Report a failure as failure, including which recoverable phase remains.
