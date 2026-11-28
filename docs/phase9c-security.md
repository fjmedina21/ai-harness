# Phase 9C security

The model, project manifests, diagnostics and compiler/test logs are untrusted.
Repair context is bounded data. Instructions embedded in diagnostics cannot select
privileges, profiles, executables, roots, models, budgets, journals or credentials.
StructuredPatch admission and exact host policy remain mandatory.

Every repair patch uses existing artifact integrity, ApprovalBroker,
DurableApprovalService, HumanApprovalAuthority and ToolDispatcher controls. Fresh
human review requires typed APPROVE and native macOS LocalAuthentication; fixtures
do not prove real presence. Login is not consent. Each validation needs another
single-use scoped grant bound to owner/execution/iteration/workspace/snapshot,
profile/action/image/resources/timeout/policy/challenge/expiry.

Untrusted generated code executes only through the existing Podman runtime.
No host execution, arbitrary shell, implicit network, image pull, package install,
socket exposure, host mount, approval bypass or automatic original-source change
is introduced. `node-isolated-v1` and Gate C remain restricted. Changed runtime
code or policy invalidates a previously signed acceptance as designed.

Durable reservations, CAS and fences prevent reset or overlapping repair owners.
Prepared/Running/Uncertain work cannot replay automatically; interrupted provider
requests retain usage uncertainty and need reconciliation. A published pending
proposal artifact can be reopened through existing verified continuation without
another provider call. An in-flight request or response not durably published as a
verified proposal is not automatically retried, cached or replayed.

Diagnostics redact secret-like values, host paths and control characters and have
strict bounds. This is defense in depth, not complete detection of every secret in
arbitrary source. Existing same-UID filesystem races, trusted host/verifier compromise,
container/runtime vulnerabilities, cross-store commit uncertainty and guest staging
mutability remain limitations. Unit mocks cannot certify native authentication,
effective VM/cgroup isolation or toolchain support. Initial real repair acceptance was **BLOCKED** at offline delivery. The
[2026-11-27 current acceptance](phase9c1-live-acceptance.md) is **LIVE VERIFIED**
only for its exact authorized local scope; it includes real native confirmations,
provider repair and separately approved Podman revalidation. Historical journal
expiry-binding inconsistencies remain preserved and blocked for operational recovery,
while the inactive synthetic journal is [archived outside release scope](phase9c1-historical-journal-exclusion.md). No dates/grants/claims
were altered to bypass verification. Remote Podman remains **DEFERRED**.
