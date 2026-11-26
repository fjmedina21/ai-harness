# Gate C acceptance and E2E

Version **0.8.0**. Current classification: **LIVE VERIFIED for gatec-synthetic/local-podman fixed
Node profiles**, including a fresh actual CLI case. Other scope remains BLOCKED.
Historical fixed-runtime probes alone do not accept current code.

## Offline verification

`pnpm test:phase9b` uses synthetic GitHub/presence verifiers and mocked Podman plus
real private filesystem, SQLite and processes. It checks bounded snapshot transport,
path/link/digest corruption, exact profiles, separate human confirmation, owner/project
policy rejection, replay, CAS/fencing, concurrent workers, process death after Running,
timeout/output classification, uncertain claims and evidence inspection across
processes. Original source remains unchanged. Default tests make no live requests
and never execute generated code on macOS.

## Owner-authorized real procedure

1. Review/backup/migrate private configuration manually. Register a disposable
   synthetic source project, external private workspace/state/evidence, explicit
   finite budgets and exact action profiles. Verify original source inventory.
2. Authorize online GitHub verification/native prompts and exact Podman actions.
   No provider call is needed; use a fixture-generated harmless patch. Authentication
   and native confirmations must be performed by the actual owner, not an agent.
3. Verify the already-running dedicated rootless Machine and pre-pulled pinned image
   using current fixed isolation probes. If unavailable, stop. Do not start or
   reconfigure a Machine, install packages or pull an image without new authorization.
4. Generate the isolated patch, review exact diff, type APPROVE and complete native
   authentication. Continue the exact patch in another process. Verify original source.
5. Prepare sandbox validation, review project/workspace/snapshot/profile/action/image/
   resources/timeout/output, then provide another APPROVE/native confirmation. The
   patch grant must be rejected as sandbox authority.
6. Execute through ValidationCoordinator/ToolDispatcher/current runtime and consume
   the exact durable sandbox grant with a fenced lease. Require actual exit/result,
   bounded output, effective CPU/memory/PID/network/mount/root/seccomp checks and
   independently confirmed cleanup. Reopen evidence/journal from a new process.
7. Exercise separately approved real output cap, timeout and observed-running
   cancellation; verify cleanup and durable evidence/recovery. Reject replay, changed
   workspace/policy/project, expired grants and second identities without effects.
8. Persist private durable reports; publish only sanitized non-secret metadata and
   exact accepted source/runtime/profile scope. Preserve uncertain operations for
   reconciliation. Never infer pass from absence of visible errors.

`pnpm test:isolation` and `pnpm test:phase9b-podman` are existing real fixed-runtime
entrypoints. They require explicit owner opt-in and a private reviewed profile;
these two suites alone do not supply authenticated durable coordinator acceptance.
Full Gate C and profile-specific CLI activation require all applicable evidence.
Until then retain validation_acceptance_pending; no test/mock/verifier can waive it.
See [current report](phase9-real-acceptance-report.md).

## Phase 9C acceptance boundary

This historical real Node Gate C acceptance does not accept the new repair lifecycle
or changed runtime code. [Phase 9C E2E](phase9c-e2e.md) defines an independent finite
repair scenario with two patch and two sandbox decisions. Offline fixtures remain
separate from live verification; a new real run requires explicit authorization.
