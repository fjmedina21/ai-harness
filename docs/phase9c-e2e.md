# Phase 9C acceptance

Version **0.8.0**. Keep implementation, deterministic verification and actual live
acceptance separate. The required offline suite is `pnpm test:phase9c`; run it with
the existing authentication, Personal approval, Phase 9B and deterministic evaluation
regressions. Final counts and observed outcomes belong in [verification](VERIFICATION.md).

## Observed offline acceptance

**IMPLEMENTED; OFFLINE VERIFIED.** The full local suite passed **993/993**;
`test:phase9c` passed **120/120**, GitHub authentication **150/150**, Personal approval
**43/43** and Phase 9B **76/76**. Clean/build, CLI help/version 0.8.0, existing
deterministic evaluations and diff whitespace validation passed. Functional CLI
coverage includes start, proposal, pending review, existing approve/continue,
separate sandbox approval/evidence, completion, status/history, premature execution,
terminal-state rejection and insufficient remaining global time.

These results use synthetic identity, presence, provider and Podman adapters, with
real isolated files, SQLite, durable artifacts/evidence and subprocess boundaries.
They establish deterministic coordination behavior only. Private command logs and
source binding are under `harness-development/phase9c/`; no private acceptance data
is copied into this report.

The final verification kept product sources frozen. The recorded source digest was
`086a6badbdb875657041f5ca808a4dd1d618b88a8a6461027d44201d33b1581c`
at both start and finish. This is reproducibility/corruption evidence, not an
external security attestation or a substitute for actual live acceptance.

## Implementation and evidence map

| Requested report item | Implemented component or observed boundary |
| --- | --- |
| 1. HEAD and branch | Base HEAD `0ac0bd486134a3a5924bea8c4cad8086b7a7e642`; work branch `feat/phase9c-language-agnostic-repair` |
| 2. Architecture | Local single owner; language-neutral validation contracts; existing provider-neutral engineering agent port |
| 3. Added components | Project discovery, trusted profile registry, normalized diagnostics, RepairAgent/RepairCoordinator and journal repair state |
| 4. Reused components | EngineeringWorkspace/PatchEngine, ProposalArtifactStore, ApprovalBroker/DurableApprovalService/HumanApprovalAuthority, ToolDispatcher, ValidationCoordinator and Podman runtime |
| 5. Project discovery | Static bounded host scope, no code execution, links/unsafe paths rejected, units and ambiguity/truncation reported |
| 6. Validation profiles | Versioned host-only registration, fixed actions, pinned images, limits/dependencies, stable digest and approval binding |
| 7. Diagnostics | Bounded normalized result/failure kind, sanitized relative paths/messages, evidence/diagnostic digests and truncation |
| 8. RepairCoordinator | Finite proposal/observation loop; no self-approval, automatic application, integration or privileged runtime selection |
| 9. RepairAgent | Existing EngineeringAgentPort/ModelProviderAdapter specialization returning existing StructuredPatch proposals |
| 10. State machine | Durable iteration/state transitions; terminal and uncertain stages stop progression |
| 11. Budgets | Cumulative session counters/reservations, immutable policy, global/per-operation deadlines and explicit unknown-cost treatment |
| 12. Persistence | Same private SQLite connection; opt-in lazy schema v4; bounded append-only repair history and artifact references |
| 13. Recovery/fencing | CAS before provider dispatch, existing approval/continuation leases and per-write fences; independent process coverage; no uncertain replay |
| 14. No progress | Repeated normalized diagnostics despite noisy output, repeated patches/content, unchanged/reversed snapshots and cycles stop deterministically |
| 15. Personal L2 | Fresh exact patch review/grant per iteration; production native confirmation preserved, tests use synthetic verifiers |
| 16. Sandbox approval | Separate fresh action/profile/image/snapshot/iteration-bound grant; no validation before reservation or after terminal state |
| 17. CLI | `engineering repair`, `repair-status`, `repair-history` reuse protected host registration and existing lifecycle gates |
| 18. Unit tests | Discovery/profile/diagnostic, policy/budget/state, provider failure/cancellation, path/identity/profile/grant denial coverage |
| 19. Integration tests | Real temporary filesystem, SQLite, artifacts/evidence, CAS/concurrency, integrity and process restarts with simulated external authorities |
| 20. Deterministic E2E | Initial failed patch/validation, different repair patch, independent patch/sandbox grants, verified pass; persistent failure terminates |
| 21. Real E2E | **BLOCKED**; no new real GitHub/native/Podman/provider repair run authorized or executed |
| 22. Regressions | Full local suite and dedicated GitHub/Personal/Phase 9B suites pass; existing deterministic evaluations pass |
| 23. Limits | Coarse closed Node diagnostics, no universal toolchain support, same-UID/runtime trust and cross-store uncertainty remain |
| 24. Documentation | README, architecture/roadmap/verification, existing Phase 9/9B boundaries and eight Phase 9C documents updated |
| 25. Local commits | Local implementation commit identity belongs to the delivery report; this acceptance records the verified source digest, not publication |
| 26. Git/publication | Local feature work only; no push, merge, tag or release; baseline CI does not certify unpublished changes |
| 27. Before Phase 9D | Obtain authorized real repair acceptance; review exact current isolation/model/project scope and residual risks; Phase 9D remains outside scope |

## Deterministic scenario

Use a harmless temporary original project, real isolated workspace and SQLite,
real proposal/evidence artifacts, synthetic provider adapters, synthetic human
verifiers and simulated Podman. Generate and approve the initial patch, apply it
only to the private workspace, independently approve validation and persist its
failure. Repair then proposes a different patch, waits for another Personal grant,
applies once, waits for another sandbox grant and records a verified passing result.
Reopen in a separate process and inspect without replay. Verify original source,
independent grants, finite cumulative reservations, replay rejection and history.
A persistent failure must stop at NoProgress or BudgetExhausted. Two synthetic
profile/provider compositions use the same coordinator; they do not establish live
support for their ecosystems.

## Real local procedure — BLOCKED pending explicit authorization

1. Select an innocuous registered synthetic project and exact accepted fixed profile.
   Authorize this new project/execution, current runtime and owner separately.
2. Confirm current GitHub owner/session, private configuration, preprovisioned pinned
   image and effective Podman controls. Do not provision or pull automatically.
3. If using a real model, obtain explicit provider/model/request/token/time/cost consent.
4. Generate the initial erroneous proposal; require exact diff, typed APPROVE and
   fresh native presence. Apply only to the isolated workspace.
5. Review and approve the exact sandbox action separately, run through the existing
   accepted Podman path and verify failed durable evidence with confirmed cleanup.
6. Request repair; review its new diff and issue a new Personal approval. Apply once.
7. Require a new sandbox approval and verify passing evidence, snapshot, journal,
   grants, finite budget and unchanged original in a new process.
8. Preserve private evidence and report actual classifications. Uncertainty or missing
   cleanup stops reconciliation; no automatic retry or acceptance substitution.

No live Phase 9C GitHub/native/Podman/provider run is authorized by the implementation
request. Previous Gate C records do not extend to this changed code. Dedicated remote
Podman is DEFERRED. Phase 9D, release 0.9.0, commits to source projects, merges,
pushes and deployments are outside scope.
