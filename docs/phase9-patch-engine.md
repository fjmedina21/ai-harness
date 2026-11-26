# Phase 9 structured patches and approvals

> **Status clarification (Phase 9D):** Historical approval description. The current Personal protocol requires the same verified owner as requester and approver with exact native human review. See [current architecture](ARCHITECTURE.md), [verification](VERIFICATION.md) and [repair acceptance](phase9c-e2e.md).


Implemented in tools: `EngineeringPatchEngine`, `createEngineeringTools()` and
`openEngineeringSource()`. L1 reads only an explicit source selection and creates
no workspace, source file, journal or checkpoint. L2 operates on a private copy.

Patch input has exactly baseRevision and changes. Each change has exactly path,
operation (create/replace/delete), baseHash, content and resultHash. Full text
replacement is deliberate: no arbitrary patch parser or command execution. Paths,
file count, before+after bytes, UTF-8, controls, result hashes, target existence,
case/path conflicts and policy scope are checked. Policy version, allowed paths,
operations and budgets are copied from host input. Serialized proposals are also
bounded, proposals are defensively copied, and at most 32 are retained per engine.

The host creates execution/workspace/base/policy identities and a patch digest.
Diffs are full replacement unified hunks with no-final-newline markers and empty
file metadata. Before L2 application the application constructs the net diff from
the original snapshot and proposed result to check reportability. Result diffScope
states whether that diff is proposed or applied; corrections produce a net final
diff rather than concatenating incompatible intermediate hunks.

Tools: workspace.inspect (bounded summary), workspace.list (16-entry bounded page),
workspace.read, patch.propose, patch.validate, patch.apply and diff.inspect.
Schemas have no extra fields. Tool arguments use existing lowercase snake_case
conventions. Each handler checks execution and root against the frozen host engine.
The returned dispatcher is bound to SQLite; modifications require files:write and
an independent expiring one-use approval. L1 receives files:read only. No shell,
Git-writing, cleanup, integration, provider credential or approval-decision tool is
registered. requireAtomicFilesystem is rejected.

patch.apply arguments bind patch digest, workspace_id, base_revision and
policy_digest. The patch digest commits exact paths, operations, before/after
hashes and content. SQLite additionally binds requester/execution/root/tool/risk/
permission/argument digest, session, version and expiry. Changing content, base,
policy or scope invalidates approval. patch.apply rejects the same requester as
approver inside SQLite's decision transaction. Production identity verification
still belongs to the host's DurableApprovalService and configured verifier; test
identities are fixtures, not a deployed IdP.

Application stages each result into an exclusive 0600 temporary regular file.
Create uses no-clobber link publication followed by unlink; replace uses rename
with base rechecks; delete uses verified unlink. Full expected resulting inventory
is checked before durable completion. No executable mode edits exist. Multiple
files are sequential, not atomic. Interruption may leave changed files, staging
files or a temporary two-link file; stale locks/journal Running/Uncertain block
replay. No automatic rollback or model-session resume is implemented.
