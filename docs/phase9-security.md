# Single-developer engineering security

Version **0.8.0**, experimental. **Authenticated != Authorized != Approved**.
The GitHub owner is not a superuser. Only current host-authorized project resources,
capabilities, tools, profiles and finite budgets may be used. Unknown projects,
global HOME/filesystem roots, path escapes, links, altered snapshots, disallowed
operations and unbounded patches fail closed. Models/project files are untrusted
policy input and cannot register projects, edit credentials/private SQLite, raise
limits or issue approvals. No arbitrary model commands are exposed.

Personal is the sole operational approval protocol. Every code effect requires
exact diff review, `APPROVE`, native macOS authentication, challenge/expiry and a
verified in-process receipt. The broker rechecks online owner/capabilities and
current full project fingerprint. A different identity cannot inspect, approve
or continue another owner's operation. Revocation, replay ledger, CAS and fencing
remain mandatory. Storage APIs are trusted-host capabilities, not authenticators.

Approval scopes bind owner, operation, authenticated artifact, workspace, source/
resulting snapshot, patch, policy and human challenge. Artifact HMAC binds the full
project authorization fingerprint. Resource/config changes require a fresh
proposal. Historical records remain readable without becoming executable authority.
There is no automatic grant conversion, expiry extension or account reassignment.

A patch grant never authorizes sandbox execution. Validation uses the same
ToolDispatcher, journal, expiring single-use grants, native human authority and
CAS/fenced leases with an independent action/profile/image/resource/snapshot binding.
Only Approved effect-free operations can transfer sessions. Prepared, Running,
Completed and Uncertain effects cannot replay. Evidence is bounded, private,
create-only and checked against its journal result when reopened.

The existing rootless dedicated Podman backend retains network none, no host or
socket mounts, read-only root, non-root UID, dropped capabilities, seccomp,
no-new-privileges, CPU/memory/PID/tmpfs bounds, finite time/output and independent
cleanup verification. No machine provisioning, automatic pulls or host execution
of generated code is enabled. See [Podman threats](phase9b-security.md).

Residual boundaries: same-UID hostile parent-path races, root/OS/runtime compromise,
trusted-verifier compromise, missing cross-store transactionality and uncertain
cleanup remain unresolved. Digests are corruption detection, not external
attestation; mocked runtime tests do not establish actual cgroup or VM isolation.
Current real native/durable/Podman acceptance enables only gatec-synthetic/local-podman
fixed Node profiles. The private signed record must revalidate actual native grants,
all four durable outcomes, current project/code/runtime and effective probes; expiry
or mismatch keeps validation_acceptance_pending. All other scope remains blocked.
Phase 9C adds bounded repair with independent per-effect approvals; real repair
acceptance is BLOCKED. No exactly-once, integration/deployment or production claim.
See [repair security](phase9c-security.md).
[Phase 2](phase2-security.md) and [Phase 3](phase3-security.md) security reviews remain
preserved. [Migration](single-developer-migration.md) requires consistent private
backups and explicit reconciliation before rollback.
