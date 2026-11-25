# Phase 9B acceptance and E2E procedure

**Current state: deterministic tests and both authorized real runtime suites passed;
full durable authenticated Gate C pending.** Version
remains **0.8.0**. Missing opt-in prerequisites are blocked/pending, never passed.
The current exact test counts and commands belong to
[verification](VERIFICATION.md#phase-9a3-and-phase-9b).

## Offline verification

Standard tests use synthetic private projects, real filesystem/SQLite and mocked
GitHub/Podman transports. Focused validation coverage checks manifest/schema/path/
digest bounds, corrupt/mutated snapshots, fixed profiles, command rejection,
completed-approved workspace scope, independent action approval, concurrent
claims, uncertain persistence/cleanup, output caps, cancellation and timeout.
No fixture should read real host secrets, install project dependencies on the
host or execute project-generated code there.

The separate `pnpm test:phase9b-podman` entrypoint is opt-in. Its absence of a real approved
profile must return blocked rather than silently skipping. Ordinary `pnpm test`
must not start a Machine, pull an image, make paid calls or authenticate GitHub.
Existing `pnpm test:isolation` verifies the fixed Phase 5 probes; passing it alone
does not verify the Phase 9B snapshot/action flow.

```sh
pnpm test:phase9b
```

That focused command is deterministic. The distinct real command, only after
explicit owner authorization and preparation, is:

```sh
HARNESS_AUTHORIZE_PHASE9B_SMOKE=1 \
HARNESS_ISOLATION_PROFILE=/PRIVATE/approved-profile.json \
pnpm test:phase9b-podman
```

Those values express owner opt-in and host profile selection, not developer
identity or a durable action approval. On 2026-11-25 both this suite and
`test:isolation` passed on the explicitly approved dedicated local machine/image.
The direct runtime suite does not persist/reopen coordinator evidence and has no
explicit real output-limit fixture; those full-gate requirements remain pending.
See the [actual observations](phase9-real-acceptance-report.md).

## Real local gate — explicit owner authorization required

1. First satisfy [GitHub authentication](phase9-github-authentication.md) and
   [Operational L2](phase9-operational-l2.md) under the selected host policy:
   a second authorized identity for Team, or explicit native human-confirmed
   single-account approval for Personal. Neither live L2 variant is verified yet.
   Record stable account IDs and exact test execution/workspace privately, without
   storing credentials in the report.
2. Approve this exact current-code suite and harmless fixtures. Prepare a dedicated
   disposable rootless Podman Machine and reviewed pre-pulled digest-pinned image
   using [runner prerequisites](DEDICATED-PODMAN-RUNNER.md). Do not bootstrap or
   start it as a side effect of an ordinary test command. Inspect absent host
   shares, intended Unix endpoint/fingerprint, guest architecture and cgroup
   support. Keep private profile at `0600` in a `0700` directory.
3. Run current fixed isolation probes and require effective UID/GID, capabilities,
   seccomp, no-new-privileges, read-only root, no host mounts/sockets/shares,
   network denial and CPU/memory/PID limits. Connection refusal or timeout is not
   evidence of explicit network denial. Retain sanitized results for the exact SHA.
4. Exercise safe snapshot transfer with known file hashes, nested regular files,
   empty files, allowed byte limits and verified staging. Check rejected symlink,
   hardlink, traversal, corrupt manifest and mutated-after-approval fixtures without
   exposing unrelated files. Confirm no writable original-source mount.
5. Separately approve each validation action under that policy and run harmless Node success,
   failure, timeout, output/resource exhaustion and cancellation fixtures through
   the host runtime. A general TypeScript/`pnpm` build is outside the initial fixed
   profile; do not claim it passed from the Node probes.
6. Observe the container running before cancelling, verify the action stops and
   independently confirm exact owner/ID cleanup. Test interrupted cleanup and
   uncertain evidence handling without broad prune. Require no automatic replay.
7. Reopen durable evidence/journal in another process and compare exact snapshot,
   transfer, image and action identities. Verify output remains bounded/private,
   no provider call occurs and original source remains unchanged.
8. Record pass/fail/blocked for each probe, date, SHA, runtime/image/platform,
   start/completion, duration, exit/classification and cleanup. Review logs for
   secrets and reset/destroy the disposable environment. Only then review whether
   to enable a concrete CLI validation profile and its action-approval flow.

## Acceptance ledger

| Gate | Current classification | Evidence needed to pass |
| --- | --- | --- |
| A — GitHub authentication | Passed for the tested local lifecycle | Actual login/Keychain recovery, refresh, logout and fresh official login/logout smoke; grant-wide remote revocation unverified |
| B — Operational L2 | Personal real local workflow passed; Team real two-account pending | Actual native human decision and exact cross-process Personal application recorded; Team still needs a second real authorized account |
| C — Podman validation | Both real fixed runtime suites passed; complete durable authenticated gate pending; CLI disabled | Separate real sandbox decision, coordinator evidence/reopen and explicit real output-limit acceptance still required |
| Remote dedicated Podman | Deferred | Separately authorized dedicated runner/evidence; not required to claim the narrower experimental local scope |

No successful test run certifies generated code as secure. Failed validation does
not invoke a model or start Phase 9C repair. Gate failures require review and
reconciliation, never an automatic security-policy relaxation.
