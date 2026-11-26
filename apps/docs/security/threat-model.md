# Threat model

| Threat | Existing control | Residual boundary |
| --- | --- | --- |
| Prompt injection expands execution | Host-only policies, registry, schema, Default Deny and dispatcher | Compromised trusted host remains outside model isolation |
| Stolen/other identity accesses project | One verified numeric owner, online checks and independent project capabilities | Keychain/OS/verifier compromise remains possible |
| Approval replay or scope substitution | Exact artifact/diff/snapshot/policy/challenge binding, expiry, single-use ledger | Human may approve a harmful change after review |
| Competing or stale process writes | SQLite CAS, leases and monotonic per-write fences | Filesystem and external effects are not one transaction |
| Malicious filesystem tree | Restricted canonical paths, link/file/size checks | Same-UID hostile parent-path races / TOCTOU |
| Untrusted code escapes restrictions | Fixed pinned rootless Podman, no mounts/network, resources, real probes | Runtime/VM/kernel vulnerabilities; no absolute isolation |
| Output/log becomes authority | Bounded sanitized diagnostics, exact IDs/digests, no model policy | Coarse parsers can lose useful diagnostic detail |
| Crash after an effect | Uncertain/reconciliation stop, no automatic replay | Availability/manual reconciliation cost; no exactly-once claim |
| Documentation leaks private evidence | Explicit public source set, local search, output checks, manual review | Pattern checks cannot prove absence of every secret |

## Review rules

Reassess this model and tests before expanding executable profiles, mounting host paths, enabling network, adding providers/tools or changing approval authority. This phase changes documentation infrastructure only. It does not weaken Personal L2, Project Authorization, Podman or RepairCoordinator.

The [capability matrix](../releases/capabilities.md) identifies evidence scope. A passing unit suite does not replace real acceptance or a security audit.

## Source and evidence

[docs/phase2-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase2-security.md), [docs/phase3-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase3-security.md), [docs/phase6-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase6-security.md), [docs/phase9c-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-security.md).
