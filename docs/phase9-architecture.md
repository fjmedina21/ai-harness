# Phase 9 architecture — experimental implementation boundary

Status: design defined before operational implementation; L1/L2 and fixture repair
subsequently implemented on the feature branch. Real L3 is blocked. Version 0.8.0.

## Contracts and ownership

Add autonomy levels 0–4 and engineering states without changing inspection contracts.
A host supplies an explicit file selection, a canonical private workspace directory,
request identity, policy version, path/operation scope, budgets and SQLite journal.
Repository configuration and model output never supply authority. Level 5 is excluded.

Use private copies rather than Git worktrees: worktrees share Git metadata and may
expose hooks/configuration and the original repository. Copy only bounded regular
single-link text files explicitly selected by the host; reject reserved names,
links and executable files. Do not traverse or copy .git, .ai, secrets or dependencies.
The original is opened for reading only. Snapshot identity is a deterministic digest
of sorted paths and content hashes; a host-provided Git label is provenance only.
Every execution gets a fresh exclusive directory and stable receipt. No automatic reuse.

Shared contracts live in contracts; filesystem, patch policy and dispatcher adapters
live in tools; the sequential engineering workflow lives in application; CLI is a
thin opt-in interface. Reuse existing agent roles, providers and durable authorization.
No dependency cycles or provider-native types enter the patch engine.

## Patch and authorization flow

L1 parses bounded structured create/replace/delete operations, checks normalized
paths, exact keys, base hashes and expected result hashes, and produces a digest
and a reviewable full replacement diff. Proposal does not mutate source files.
The host owns policy version and permitted paths/operations. L2 revalidates the
whole workspace inventory and current snapshot before applying a frozen proposal.
Only the ToolDispatcher path exposes application to the workflow. A durable
approval binds execution, requester, workspace root, base digest, exact patch
digest, paths/operations via that digest, policy and expiry. Changed content is a
new proposal and needs a new approval. Agents cannot decide approvals.

Before side effects the SQLite journal enters Running. Exclusive on-disk operation
locks serialize mutations and survive crashes. A patch is sequential, not a multi-file
transaction: failures after start poison the workspace and preserve evidence.
Write temporary single-link files with no-follow/exclusive opens, sync and replace
only after identity rechecks; new files use no-clobber publication. Never alter
executable permissions. Rooted traversal is not atomic against a malicious same-UID
host actor. L2 is limited to private host-owned local directories with no untrusted
host process; requireAtomicFilesystem must fail closed.

## Runtime, persistence and cancellation

A sequential coordinator requests proposals from a bounded host adapter, dispatches
application, validates only through a host port and produces review evidence.
Maximum iterations, calls, tokens, estimated spend, files, bytes, paths and wall time
are enforced. Unknown usage cannot authorize more spend. Repeated snapshots/errors,
regressions, no progress, permission requests and cleanup uncertainty stop the loop.
Approval is an external pause, never self-granted. Completion requires host-reviewed
evidence; workspace changes are never labelled integrated into the original.

SQLite is the durable operation authority. Workspace receipts/inventory and run
reports are separate evidence. On reopen inspect journal plus actual filesystem;
stale lock, Running, missing receipt, mismatched snapshot, partial patch, interrupted
validation or uncertain cleanup blocks execution pending host reconciliation.
No replay, model session resume or exactly-once guarantee. Cancellation before a
side effect prevents it; after start uncertainty is preserved, not rolled back.
Workspace expiry blocks mutation. Cleanup is explicit host-only and must not erase
uncertain evidence. Initial implementation may retain workspaces for manual review.

## Sandbox port and release gates

The current Podman profile supports fixed probes without workspace input. Preserve
it. A new snapshot-transfer design needs independent review: bounded manifest and
content digest, no symlink/device/archive traversal, no general bind mounts, private
container-internal staging, pinned host-selected environment and fixed argv registry.
Network denied, non-root, seccomp, capabilities dropped and resource limits remain.
Logs must be bounded/redacted; record snapshot, profile/environment, exit/duration,
resources and confirmed cleanup. No model command strings or host execution.

Until that transfer and current real local isolation/E2E are approved and tested,
the production sandbox port returns blocked. Mock validators exercise control flow
only; L3 is unavailable. L4 has contracts only; L5 has no implementation.

## Acceptance plan

1. Preserve L0 and pass current build/427-test baseline.
2. Gate A: parser, hashes, diff, unsafe paths, no source writes, deterministic CLI.
3. Gate B: private ownership, original unchanged, SQLite scoped single-use approvals,
   conflicts, concurrency, cancellation, partial writes and reopen reconciliation.
4. Implement bounded repair and sandbox port with simulated validation explicitly
   labelled fixture; no real generated-code execution or L3 claim.
5. Add deterministic E2E/security review and document all unpassed gates.
6. Run clean/build/test, CLI help/version, deterministic eval and diff checks.

No push, merge, publication, live paid APIs, infrastructure or isolation changes.

## 9A OpenAI composition

Implemented on feat/phase9-real-provider-engineering: reusable ModelProviderAdapter
bridge, fixed host-selected OpenAI factory, bounded read-only context, stateless
per-role identity, strict JSON response envelope, host result-hash computation,
actual usage/nullable cost, classified errors and CLI propose/isolated selection.
The existing patch engine and durable dispatcher remain independent authority.
The provider text output cap is now serialized on the wire and an explicit host
timeout can reach 120 seconds while the default stays 30 seconds.
No new paid calls or real sandbox runs occur in standard validation. Detailed
[contract/compatibility notes](phase9-provider-integration.md) separate the prior
one-call real smoke from the unexecuted new full-workflow smoke.
