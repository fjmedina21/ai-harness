# Phase 9 — durable policy-bound approval and continuation

Phase 9A.4 adds explicit Personal/Team host policy to this protocol. Team is the
default and preserves independent accounts. Personal requires authenticated scoped
GitHub authority plus verified human intent after exact review. It reuses the same
decision transaction and continuation, not a second approval system. See
[Personal Mode](phase9-personal-mode.md) for UI, sandbox decisions and trust limits.

Core implementation baseline: `2746500e6787`; GitHub authentication development
starts at `fff4932f13f0` on `feat/phase9-github-auth-podman-validation`. Version
remains **0.8.0**. **Core L2 Resume** persists private exact proposals and resumes
independently approved patches across processes. Phase 9A.3 supplies GitHub App
OAuth + PKCE, macOS Keychain, online App/user verification and exact host role scope
to the existing broker/coordinator. Authenticated CLI composition is offline
verified; actual two-identity GitHub/native Keychain acceptance remains pending.
Current verification is recorded in [VERIFICATION](VERIFICATION.md#phase-9a3-and-phase-9b).
No production autonomy, L3, uncertain replay, external exactly-once effects, or
original-project integration is claimed.

## Components and dependency direction

| Component | Implementation / responsibility |
| --- | --- |
| Contracts | `packages/contracts/src/engineering-resume.ts`: artifact/reference, decision binding, identity challenge/verifier, lease, reconciliation/error types and bounded canonical JSON |
| ProposalArtifactStore | checkpointing: private authenticated canonical artifacts, exclusive publication, fsync, bounds and integrity checks |
| SQLite journal v2 | checkpointing: immutable proposal references, scoped decisions, exclusive leases, monotonic epochs, lease history, ownership transfer and atomic approval consumption |
| ApprovalBroker | security: independent per-action/resource authentication and role authorization; delegates decisions to existing `DurableApprovalService` |
| EngineeringRecoveryService | application: artifact/policy/operation/receipt/source/inventory/patch/diff reconciliation |
| ExecutionLeaseManager | application: sanitized wrapper over transactional journal lease operations |
| ContinuationCoordinator | application: authenticated apply-only orchestration through existing `ToolDispatcher` |
| GitHub authentication | security-owned protocol/identity/RBAC and CLI-owned protected host/session adapters |
| CLI | requires authenticated scoped requester, resolves execution IDs through trusted host journals and exposes authenticated lifecycle |

Application composes checkpointing, security and tools. Checkpointing depends only
on contracts. No provider-specific data appears in approval/resume contracts.
`ModelProviderAdapter.complete()` and the default inspect/SDD workflows are retained.
There is no model/provider/session port in the continuation coordinator.

## Private artifact format and persistence protocol

Artifact schema version 1 contains execution/requester/operation/workspace IDs;
workspace receipt and root device/inode; original selected-source revision; full
bounded base inventory/digest; exact structured patch and patch digest; exact diff
and diff digest; allowed paths/operations; policy/version/digest; original finite
budget and request/token/usage/cost accounting; creation/expiry and artifact digest.
`sourceRevision`/`baseRevision` are content inventory digests, **not Git commit SHAs**
and not an attestation over unselected repository files. Unknown billing remains
unknown after restart. Credentials, API keys and approver tokens are absent.

The host selects an already canonical 0700 state directory outside the source
project. `proposals/` is 0700; artifacts and the separate `proposal-host.key` are
0600, owned by the host UID. IDs are validated SHA-256 digests, never arbitrary
paths. The file envelope is at most 64 KiB; patches retain the engine's stricter
12,000-byte limit and diff output retains its 16,000-byte JSON limit. Canonical JSON
rejects unsupported values, excessive depth/nodes/bytes and reserved keys. Files
must be regular, single-linked, bounded, no-follow opened and identity rechecked.
Content hashes identify data; **HMAC-SHA256 with a private random host key**
authenticates the artifact. Hashes do not authenticate people. The host key is
outside the project, never a credential accepted by the approval broker. Missing
keys with retained artifacts fail closed instead of silently replacing authority.

Persistence order:

1. Host PatchEngine validates patch and computes exact diff.
2. Existing dispatcher registers the exact `patch.apply` operation pending approval.
3. Seal bounded canonical artifact; write an exclusive random temporary file and fsync.
4. Publish by exclusive hard link, unlink temporary name, fsync directory, reread and verify MAC/digest.
5. Commit immutable artifact reference, random decision challenge and expiry in SQLite.
6. Read back binding; only then publish the pending result to the requester.

Filesystem and SQLite do not share an atomic transaction. A crash after publication
but before the journal commit leaves a preserved orphan. Missing/partial/corrupt
artifacts or missing references block continuation. Failed or unknown persistence
acknowledgment retires the original execution session. No proposal is reconstructed
by a provider. The coordinator's explicit reconciliation checks are necessary even
when both stores appear valid.

Retention is bounded to 10,000 directory entries and per-file size, with finite
artifact admission expiry. The store never automatically evicts evidence. Orphans,
failed temporary files and expired proposals remain private for host review;
confidential deletion/backup/key rotation and a production retention procedure
remain host operational responsibilities. A full store rejects new proposals.

## Independent authentication and approval

`ResumeIdentityVerifier.verify(credential, challenge)` is an injected trusted host
port. An integration must independently validate issuer, signature, audience,
expiry, nonce/replay and exact resource/action entitlement, returning canonical
issuer/subject, roles, expiry and the verified challenge binding. The returned
identity is accepted for at most five minutes. Credential transport and any IdP or
OS-protected IPC implementation are **not supplied**. No boolean, OS username,
execution ID, model text, telemetry ID or production fixture can authenticate.
Issuer aliases must be normalized by the host's real identity integration.

The challenge binds action, execution, workspace, immutable artifact digest and
random approval challenge. The artifact transitively binds requester, operation,
base inventory, exact patch/diff, paths/operations, budgets and policy. SQLite also
binds the original tool argument digest, scope and approval expiry. Approver identity
and decision timestamp are in the existing durable approval/events audit.
`harness:reader` gates status/diff, `harness:approver` gates approve/reject/revoke,
and a separate `harness:operator` gates continuation. Approver authority alone does
not permit application. In Team Mode requester and approver must differ by canonical
issuer/subject. In Personal Mode, a live intent receipt from the trusted host UI is
required, bound to actor, exact review, challenge and expiration. Serialized receipts
cannot serve as approval credentials. Personal decisions recheck identity and files
after review; pending-state/CAS allows only one concurrent decision.

ApprovalBroker authenticates once before review and delegates the verified,
short-lived exact-scope actor to `DurableApprovalService`; the journal's
`decideScoped` transaction admits only a pending matching challenge/artifact.
Concurrent/replayed decisions cannot both succeed. Legacy decisions keep their
ownerSession restrictions; a bound proposal cannot use the unscoped decision path.
Preparation consumes approval and records Prepared in the existing transaction.
Revocation, expiry, altered scopes and previous consumption prevent application.
No raw approver credential is persisted or logged.

Default approval TTL remains 60 seconds; the existing host option can select at
most 300 seconds. Artifact expiry cannot exceed approval or workspace expiry.
Restart does not extend a deadline. Expired/denied/revoked/cancelled proposals cannot
be revived; automatic reapproval and child operation generations are not implemented.
Authenticated status reports effective expiry without writing durable state.

## Journal migration, lease and mutation fencing

SQLite `user_version` migrates transactionally from 1 to 2 by adding:

- `engineering_proposals`: one immutable checked reference per patch operation.
- `continuation_leases`: one current owner/lease per execution.
- `continuation_lease_events`: bounded immutable acquisition history indexed by epoch.

It then migrates 2 to 3 by adding `approval_reviews` (immutable, checksummed review
contexts) and `human_confirmation_ids` (unique receipt consumption per operation).
Review binds policy version/digest, purpose, scope, exact artifact/patch/snapshot,
workspace, challenge and expiry. Decision metadata records both actors, timestamp
and intent binding atomically. Existing rows without review contexts remain Team
operations; opening them under Personal fails closed. No old decision is upgraded.
Patch policy digest and approval policy digest remain separate bindings.

Existing operation/approval/event rows, scope digests and enums are unchanged.
Artifacts retain the original legacy policy JSON encoding as well as its canonical
semantic content, so a reordered equivalent host policy can still verify the exact
pre-existing policy/patch digests without changing the legacy engine contract.
Opening validates application ID, quick/foreign-key checks, all bounded checksummed
rows/events and lease history. Unsupported/corrupt stores are not recreated.
Older binaries reject unsupported v3; rollback requires a quiesced validated backup, never
lowering user_version or dropping active authorization data in place. Tests simulate
a genuine v1 layout and verify preserved rows and ownership restrictions after migration.

Lease acquisition uses `BEGIN IMMEDIATE` plus expected operation version CAS. Only
Approved, still-unconsumed, unexpired bound operations qualify. All other operations
in the execution must be Completed. An active lease conflicts; an expired lease can
be replaced only while the operation remains effect-free Approved. Each lease binds
ID, execution, operation, ownerSession, independently verified operator identity,
monotonic epoch/version, acquisition state version and finite expiry. History is
capped at 64 acquisitions per execution. Transfer updates ownerSession atomically.

`prepare`, `start` and `finish` enforce current ownership/lease. The patch engine
receives a synchronous fence/deadline/identity check immediately before each mkdir,
temporary write, link, unlink and rename boundary and after inventory verification.
The existing exclusive persistent workspace mutation lock remains mandatory.
A stale living worker cannot prepare after transfer. Once Prepared/Running/Uncertain,
**no lease transfer is allowed**, even after expiry. Thus an old in-flight filesystem
call cannot coexist with a newly authorized applicator. Stale locks/uncertain markers
block reopen and require separate trusted effect/quiescence reconciliation.

Fencing is cooperative admission, not an OS guarantee against hostile same-UID
writes or completion of an already submitted syscall. Multi-file changes remain
non-atomic. No claim of race-free sandboxing or exactly-once external effects follows.

## Apply-only continuation and reviewable result

A trusted host opens the private integrity-validated journal and constructs the
coordinator with host-selected artifact root, current policy and independent verifier.
No public endpoint opens user-selected journals or derives authority from a project.
Within that embedding:

1. Authenticate and authorize operator for exact challenge/workspace/execution.
2. Recover authenticated artifact/reference and unconsumed independent approval.
3. Reconcile operation states, original receipt/creation journal record, device/inode,
   workspace TTL/markers, selected-source revision and complete workspace inventory.
4. Compare current host policy, paths/operations and all patch/scope/diff digests.
5. Acquire exclusive lease by CAS; repeat reconciliation under that lease.
6. Reimport the exact structured patch through PatchEngine validation, never a model.
7. Dispatch the original tool/request identity; atomically consume authorization and
   record Prepared; verify lease/expiry and record Running.
8. Apply only in the private workspace, checking fence at mutation boundaries; verify
   complete expected resulting inventory; record Completed before claiming success.
9. Return `ReviewPending`, exact diff, patch/snapshot digests, `inventory_only` evidence
   and `integrated:false`. Human final review/promotion remains separate.

Continuation has a fresh finite host timeout of at most 300 seconds, bounded async
authentication and cancellation, with monotonic checks before effects. It does not
reset model accounting or run build/test/package scripts. Generated code is never
executed, original project files are only read, and no OpenAI/native session is reused.
The authenticated diff operation reads the exact private stored diff, including
after Completed while its admission scope remains valid; it does not regenerate it.

## Recovery and errors

Existing durable states remain Created, PendingApproval, Approved, Prepared, Running,
Completed, Failed, Cancelled and Uncertain. Approval statuses separately distinguish
pending, approved, expired, denied, revoked and consumed. No broad enum rewrite or
automatic retry is introduced. Completed is never reapplied. Prepared/Running/
Uncertain, partial mutation, stale lock and unknown commit outcomes preserve evidence
and block replay. An unknown final acknowledgment may leave Completed durably recorded;
the caller receives an error and later inspection can observe completion, never rerun it.

Fixed error codes include authentication_required, forbidden_scope, artifact_missing,
artifact_invalid, approval_expired, approval_mismatch, policy_changed, snapshot_changed,
lease_conflict, reconciliation_required, storage_uncertain, cancelled and timeout.
Errors omit private paths, SQL, source, raw verifier errors and credentials.

## CLI and operational gate

`run --workflow implement --autonomy isolated` persists proposals automatically in
the private external journal state directory. Programmatic callers explicitly supply
`proposalArtifacts`; legacy same-session flows remain compatible and cannot be mixed
with this deferred approval mode. Persisted mode is L2 only.

```bash
pnpm harness engineering status --id EXECUTION_ID
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering reject --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

Lifecycle commands require the fixed private GitHub host configuration and an online
verified session. They do not accept credentials/identities in arguments. Without a
valid session they return structured `authentication_required`; scoped role and
resource failures remain closed. The embedding API still uses exact operation IDs
after trusted execution-ID resolution. New proposals persist canonical GitHub IDs;
legacy `cli-host` records are never silently migrated or attributed to an account.
`engineering revoke` is also available to an authorized approver. See
[authentication](phase9-github-authentication.md) and [Operational L2](phase9-operational-l2.md).

## Acceptance and remaining gates

Core L2 tests use real files/SQLite, mocked native OpenAI HTTP and independent fixture
identity verification confined to `src/__tests__`. Three independent processes prove
initial generation, independent approval and exact continuation; resume HTTP count is
zero and original selected/unselected source is unchanged. Concurrency, old living
owners, SIGKILL at FS/journal and apply boundaries, corruption, missing artifacts,
invalid identities/scopes, changed policy/base/workspace, denial/revocation/expiry,
partial effects, ambiguous commit acknowledgment, cancellation, timeout, legacy
migration and bounded telemetry are covered. [Verification](VERIFICATION.md#phase-9a2-durable-l2-resume)
records exact commands/counts; fixtures do not prove real deployed authentication.

The new GitHub composition retains the same approval/lease/storage boundaries and
adds online app/account, role and resource checks. Operational acceptance still
requires the authorized actual GitHub/native Keychain smoke and two independent
accounts; fixture HTTP cannot satisfy it. Host backup/retention/key procedures and
same-UID filesystem limits remain. The existing default approval window is 60
seconds; login time never extends it. Phase 9B adds a separate approved validation
operation only after completed consumed patch application, without replaying the
patch or granting shell authority from its approval. Current live sandbox acceptance
is pending; Phase 9C repair, Anthropic engineering, publication and source integration
remain deferred.
