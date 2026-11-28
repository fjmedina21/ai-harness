# Phase 9C.1 — live acceptance and beta gate

Assessment: **2026-11-27 America/Santo_Domingo**; live completion
**2026-11-28T03:20:47Z**. Source **779daab899c2ef9875dc198785ad7b33489763e9**;
branch `test/phase9c-live-acceptance-beta-gate`; version remains **0.8.0**.

**Phase 9C: LIVE VERIFIED for the exact local synthetic scope below.**
**Beta release readiness: BLOCKED.** No version, tag, release, push, merge or
new deployment was performed. Current documentation edits are local, uncommitted
changes and have no hosted CI of their own.

## Actual live result

| Requirement | Observed result |
| --- | --- |
| GitHub owner/session | LIVE VERIFIED through official refresh, status and whoami; same configured sole owner; Keychain adapter; online verification |
| Project authorization | Existing synthetic project; owner explicitly approved four budget ceiling changes and a separate fresh journal path; no additional tools, file operations, image or runtime profile |
| Gate C | LIVE VERIFIED for current executable digest, project fingerprint, pinned image and dedicated rootless Machine; fresh HMAC acceptance verified through existing host verifier |
| Runtime probes | Real UID 65534, no capabilities, seccomp 2, no-new-privileges, read-only root, denied network, 16 MiB tmpfs, 0.5 CPU, 256 MiB memory, zero swap, 64 PIDs; timeout/cancellation/cleanup confirmed |
| Initial validation | FAILED, exit 1, ordinary assertion failure from the intentionally incorrect sum; durable ValidationCoordinator evidence and confirmed cleanup |
| Model | Existing OpenAI Responses adapter, `gpt-6.1-sol`; account availability checked before generation; one actual repair request |
| Proposal | One repair iteration; only isolated `sum.js` changed, subtraction to addition; no test or original-source change |
| Personal L2 | Exact diff, typed APPROVE and real native macOS authentication; no synthetic verifier or automated confirmation |
| Sandbox approval | Fresh separate snapshot/action-bound native grant for the repaired workspace |
| Final validation | PASSED, exit 0, real Podman execution and durable coordinator evidence; confirmed cleanup |
| Recovery | Separate CLI processes for status/history and another verifier reopened HMAC artifacts, journal, history, approvals and evidence without runtime/provider replay |
| Source integrity | Original file hashes and artifact source revision unchanged; historical journal hash unchanged |
| Cleanup | Dedicated engine inspected after execution: zero containers; no unrelated cleanup action |

Nine distinct native confirmations were verified: three isolated patches and six
sandbox actions across the acceptance fixture and repair workspace. Grants were
consumed once; patch approval did not substitute for sandbox approval. The durable
repair history reached ValidationFailed → RepairRequested → AnalyzingDiagnostics →
RepairProposed → AwaitingPatchApproval → RepairApproved → ApplyingRepair →
RepairApplied → AwaitingSandboxApproval → Revalidating → Completed.

The repair used **1,082 input tokens and 161 output tokens**, with recorded estimated
cost **USD 0.007011** and zero remaining reservations. Authorization allowed at most
two repair requests/iterations, 1,024 output tokens and 8,192 context allowance per
request, 32,768 cumulative token ceiling, 30-second provider timeout, 600-second
global deadline and **USD 0.15 estimated ceiling**. This estimate includes the
configured cache pricing and is not an exact charge or an external billing guarantee.
Initial proposal generation used a deterministic host fixture, without model calls;
validation, human presence and repair generation were real.

## Stabilization and retained blockers

The first current-code attempt stopped before generating a proposal: the registered
historical journal contained **14 mismatched proposal/review expiry bindings**.
SQLite integrity and row checksums passed, but the current journal verifier correctly
rejected the authorization relationships. A private-copy diagnostic reproduced the
failure. The origin of these historical differences was not established.

No dates, grants, HMACs, journal states or claims were repaired manually. With explicit
owner approval, the synthetic project selected a separate new journal and fresh
proposals/grants. The invalid historical journal remains intact and **BLOCKED** for
recovery. Its SQLite/checksum validity must never be presented as valid authorization.
The subsequent [owner-authorized archive and exclusion](phase9c1-historical-journal-exclusion.md)
removes recovery of this inactive historical fixture from the fresh-journal release
scope; it does not repair or certify the old authorization bindings.

The previous 2,048-token project ceiling split repair input to 1,024; even minimal
context was deterministically rejected before provider transport. The owner approved
bounded higher ceilings. Existing private acceptance support also referenced a
nonexistent renewal method; local support now archives the expired signed record
unchanged and uses existing create-only publication after full verification.
No product source, public contract, security check or provider implementation changed.

Four older cancellation operations and one new Gate C cancellation retain Uncertain
states. Their evidence reports cancellation and confirmed cleanup, and the exact
current dedicated engine had no containers. The new cancellation belongs only to
the Gate C workspace, whose claim remains retained; the successful repair used a
separate workspace. None was replayed or converted to Completed. The invalid
historical journal and its pending recovery are not certified by the fresh repair.
The owner subsequently requested archival and exclusion of the obsolete journal.
[Verified inactive scopes and preserved evidence](phase9c1-historical-journal-exclusion.md)
justify that narrow exclusion. Historical recovery remains blocked independently;
these records are not marked reconciled or Completed.

## Offline regression and security evidence

Baseline on the stated source: frozen-lockfile install, clean/build, **993/993**
full tests, GitHub **150/150**, Personal **43/43**, Phase 9B **76/76**, Phase 9C
**120/120**, docs build/check and CLI help/version passed. Deterministic evaluation:
**19/19 scenarios, 42/42 assertions**; Phase 9 evaluation: **10/10**. Engineering
benchmark passed with mocked transport and real filesystem/SQLite; it is offline.

Existing deterministic tests cover wrong/expired identities, changed patch/policy/
workspace/profile, invalid evidence, consumed/replayed grants, unauthorized actions,
budget/no-progress, cancellation/timeout/in-flight uncertainty and diagnostic prompt
injection. These negative tests use fixtures; the live result above does not imply
new real negative-action executions. Dependency audit returned zero listed
vulnerabilities across 198 dependency entries; this is a bounded advisory lookup,
not a security certification.

Final post-documentation regressions passed with the same counts: all 16 requested
commands exited 0, including clean/build, every test suite, docs, CLI, both evaluations,
benchmark and Git checks. Measured command time: **103.958 seconds**. Full results are
recorded in [verification](VERIFICATION.md).

## Release decision

| Gate | Classification |
| --- | --- |
| Implementation | IMPLEMENTED; no product source change in this acceptance |
| Baseline / deterministic suites | OFFLINE VERIFIED |
| Current scoped GitHub / Personal / Gate C / repair / durable inspection | LIVE VERIFIED |
| Historical journal release scope | OUT OF SCOPE — owner-authorized archive; inactivity verified; recovery remains BLOCKED |
| Ordinary hosted CI on source 779daab | PASS — [build-test and docs-check](https://github.com/fjmedina21/ai-harness/actions/runs/45900226919) |
| Hosted CI for new local documentation candidate | BLOCKED — no publication authorized |
| Portal tablet/desktop visual review | PASS — subsequent sampled review; [candidate record](phase9c1-release-candidate.md) |
| Dedicated remote Podman | DEFERRED |
| Release approval / version / tag / publication | PENDING; no authorization requested or assumed |
| v0.9.0-beta.1 readiness | BLOCKED |

The earlier manual Pages workflow passed on 779daab ([run](https://github.com/fjmedina21/ai-harness/actions/runs/45900829096));
this acceptance did not redeploy it. Raw profiles, account/session data, journals,
source/diffs and native approval records remain private under locally excluded
support storage. This report publishes only bounded outcome summaries.
