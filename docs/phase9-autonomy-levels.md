# Phase 9 autonomy levels and release gates

Version **0.8.0**, experimental. Current development starts at `fff4932f13f0` on
`feat/phase9-github-auth-podman-validation`. Phase 9 remains partial; new native
identity/storage and Podman acceptance gates are pending, with validation CLI
disabled. Historical provider smokes are separate evidence for their exact
models/budgets/commits, not authorization for another run.

| Level | Implemented capability | Evidence / remaining gate |
| --- | --- | --- |
| L0 Inspect | Existing read-only SDD/inspection retained | Existing deterministic regressions; no new live inspection claim |
| L1 Propose | Fixture/OpenAI structured patches, policy/hashes, reviewed bounded diff | Mocked native Responses adapter and filesystem/CLI; historical synthetic OpenAI smoke retained separately |
| L2 Isolated apply | Private copies, GitHub-authenticated requester/reviewer/operator, scoped independent durable approval, fenced cross-process continuation | Offline GitHub HTTP + real SQLite/filesystem/process tests; actual two-account GitHub/native Keychain acceptance pending |
| L3 Validate | Closed snapshot stdin transfer, fixed host Node profiles, separate action approval, Podman-only runtime, private durable evidence | Deterministic component/integration tests; actual isolation/transfer/resources/cancellation/cleanup pending; CLI blocked |
| L3 Repair | Existing bounded fixture-only coordination | Real autonomous repair is Phase 9C and deferred; failed real validation never calls a model |
| L4 Supervised broader task | Contracts only | No additional privileges enabled |
| L5 Integration/deployment | Out of scope | No automatic merge/push/deployment or production access |

## Authentication and L2 boundary

GitHub App Authorization Code + PKCE S256 and protected macOS sessions are the only
implemented developer login. AI model selection remains independent. Verified
numeric account IDs map to explicit host roles/resources; login grants no default
roles. New isolated requests require `harness:requester`. Status/diff require
reader, approve/reject/revoke require approver and continue requires operator.
No credentials enter argv, proposals, checkpoints, journal or telemetry.

The requester cannot approve their own patch even with another OAuth session or
username. An authorized second stable account is required. Approval remains bound
to exact execution/workspace/requester/approver/source/snapshot/patch/policy/
challenge/expiry. Continuation reopens the persisted artifact, reconciles actual
state, acquires the fenced lease and applies through ToolDispatcher with zero
provider calls. Prepared/Running/Uncertain operations cannot automatically transfer
or replay. Success is `ReviewPending`, inventory-only validation and
`integrated: false`; the original project is unchanged.

## Sandbox boundary

The first `node-isolated-v1` action profile retains rootless Podman Machine,
read-only root, UID/GID 65534, dropped capabilities, seccomp, no-new-privileges,
network none, no host mounts/sockets/shares and fixed CPU/memory/PID/tmpfs limits.
It is restricted to bounded host-defined Node argv and does not establish general
`pnpm`/native builds. Snapshot transfer is closed/hashed and never mounts original
source. Validation additionally requires its own independent durable action
approval and current host live-acceptance verification. An uncertain cleanup is
never a pass and never authorizes automatic replay.

`engineering validate --id ID --profile local-podman --action test` recognizes the
target interface but returns `validation_acceptance_pending`. The host API is
implemented for reviewed composition; its verifier interface is not a deployed
attestation authority. No self-granted acceptance or hidden privileged fallback is
included. See [runtime](phase9b-validation-runtime.md) and [security](phase9b-security.md).

## Acceptance and version policy

| Gate | Current state |
| --- | --- |
| A — GitHub authentication | Offline verified, live GitHub/native Keychain pending |
| B — Operational L2 | Offline authenticated cross-process composition verified; actual two-identity operational smoke pending |
| C — Podman validation | Offline restricted components implemented; actual current-code local suite pending; CLI disabled |
| Dedicated remote Podman | Deferred; separate remote risk/runner acceptance |
| Phase 9C autonomous repair | Not implemented; requires its own design after these gates |
| Phase 9D documentation portal | Deferred |
| Release candidate / 0.9.0 | Not published; review after 9A.3, 9B, 9C and 9D |

Current commands/counts are in [verification](VERIFICATION.md#phase-9a3-and-phase-9b).
Historical OpenAI timings/model evidence remain in the [live ledger](phase9-live-smoke.md)
and [deadline policy](phase9a-timeout-budget-policy.md); they do not verify current
GitHub or Podman behavior. No production readiness, race-free host confinement,
transactional multi-file writes, semantic correctness or exactly-once external
effects are established. No new paid calls, real OAuth/Podman run, push, merge,
tag, release or package publication is included in offline delivery.
