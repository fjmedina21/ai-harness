# Phase 9 — real acceptance report

## Environment

Date: 2026-11-25. Base SHA: `6dbdc98797d3b53eacc387cd861f565cbeddb15e`.
Current branch: `feat/phase9-personal-approval-mode`, uncommitted local changes.
OS: Darwin 27.0.0 arm64. Node: 24.18.0. pnpm: 12.21.0.
Podman client/server 6.1.4; dedicated linux/arm64 guest kernel
7.2.7-200.fc44.aarch64; container Node 24.22.3.
No remote CI or release evidence is claimed for this working tree.

## Gate A — GitHub OAuth and Keychain

**Classification: PASSED for the explicitly tested local GitHub/Keychain lifecycle.**

During preceding setup on this base source plus local host-adapter formatting, the
owner authorized one actual CLI OAuth login. It succeeded for the real GitHub
account `fjmedina21`, stable account ID `70180651`. The App client ID was configured
privately (public identifier abbreviated `Iv23…L2Ar`), with the fixed loopback
callback `http://127.0.0.1:53682/oauth/github/callback`. The Keychain client-secret
item's existence was checked without revealing its value. A session was stored,
then recovered and verified by `whoami` and `status` in new CLI processes. No token
was included in terminal results or this report.

In the explicitly authorized follow-up, online session verification and actual
refresh succeeded at approximately 15:40:54 UTC, preserving the stable account ID.
After the real Personal workflow, the authorized logout succeeded and a new CLI
process rejected access as `authentication_required`. The single newly authorized
`pnpm smoke:github-auth --authorize-live-github-oauth` then passed: actual browser
login, verified stable account 70180651, Keychain session write/read, `whoami` and
logout. Its new local session had expiry 17:32:36.816 UTC and was cleared by the
smoke at completion. Actual refresh had already succeeded in the earlier follow-up;
code exchange/refresh/revoke were not retried by the resilience change. This is
cumulative local lifecycle evidence, not grant-wide remote revocation. The output
explicitly states that refresh credentials were removed locally and their remote
revocation is unverified. No fresh authenticated session is left after the smoke.

## Gate B — Operational L2

**Classification: PASSED for the explicitly tested Personal local workflow;
Team's real two-account acceptance remains BLOCKED.**

Real temporary filesystem/SQLite and mocked GitHub/native/external verifiers test
the exact durable artifact, patch/policy/challenge/snapshot binding, scoped roles,
single consumption, replay rejection and fenced continuation across processes.
Personal fixtures use one synthetic stable GitHub identity; Team fixtures retain
independent identities. Resume performs zero provider calls and leaves the original
synthetic source unchanged. These identities are test fixtures, not real approvals.

No actual two-account Team lifecycle was executed. The owner explicitly authorized
Personal only for the synthetic project and a scoped approver assignment to account
70180651. The private configuration was validated, backed up privately and atomically
updated; other assignments were preserved. This was an owner-authorized setup
action, not an automatic role grant by the product.

One actual Personal attempt generated durable execution
`e26e4cb8-6e90-4f30-859d-9fe64f66f012`, then stopped with
`authentication_required` before a decision committed. No patch was applied. The
artifact remains pending/expired and is not reused. Subsequent read-only online
identity, scoped verifier and broker diagnostics passed with the four explicit roles;
the earlier rejection has no confirmed persistent cause. LocalAuthentication loaded
and reported availability without starting a prompt. Neither result establishes a
successful native approval. A new fixture/manual review was separately authorized;
it stopped during generation at 15:56:15 UTC. No new operation appeared in SQLite.
The original launcher did not preserve the failing child CLI error, so its exact
cause cannot be recovered from that attempt. A subsequent online status check
reproduced `github_unavailable`, while a bounded diagnostic identity check then
returned HTTP 200 for both App-token and user verification with ample rate capacity.
This indicates intermittent verification availability, not confirmed revocation or
expired local session; the precise earlier transport/service failure remains unknown.

A new private diagnostic launcher preserves the child exit/error code and only
allowlisted HTTP/network metadata, never request headers, tokens or response bodies.
Offline synthetic checks verified forwarding behavior, redaction and 0600 logging.
The launcher also pauses its parent stdin before handing the TTY to the approval
CLI. No new proposal or automatic approval retry was performed during diagnosis.
A diagnostic CLI status call at **2026-11-25T16:00:30.348Z** captured HTTP **500**
from the App-token verification endpoint (1,785 ms); it returned
`github_unavailable`. No user-identity request followed that rejection. This is
direct evidence of a failing online verification response, rather than evidence
that the local credential was revoked. Earlier checks in the same diagnosis
returned 200/200 with remaining limits 9,999/10,000 and 4,988/5,000. No general
GitHub outage is asserted and no automatic retry, token refresh or new login was
attempted to bypass the failure. At that checkpoint live L2 remained blocked pending
successful online verification and a new explicit human decision.
A second authorized account is still required for Team.

### Authorized correction and repetition

The owner requested correction of online verification and a new attempt. The
client now retries only fixed read-only identity checks on 500/502/503/504, at most
three attempts with 250/500 ms backoffs inside the original 10-second deadline per
endpoint. Server cooldown/quota, credential/policy rejection, malformed responses
and transport errors stop without retry. Code exchange, refresh and revocation are
not replayed. The broker distinguishes unavailable verification without granting
authority or changing pending state. No credential, permission or transport
security fallback was introduced.

Clean/build/full tests initially passed **829/829**; focused GitHub/Personal passed
**130/130**. Final regression passed **830/830** after adding the CLI generation
case: exhausted unavailable verification creates no workspace/journal and makes
zero model calls. The final smoke-summary text also describes policy-specific
human approval rather than incorrectly requiring independent accounts for Personal.
Tests include transient recovery, exhaustion, cancellation, quota/cooldown, revoked
credentials, rejection of account switching and proof that credential-mutating
operations are single-attempt. On **2026-11-25T16:26:42 UTC**, corrected real CLI
status passed for account 70180651 with HTTP 200 for both endpoints. No 5xx was
observed in that particular successful invocation; recovery branches remain offline
evidence. A new host fixture with the existing bounded 300-second approval option
was generated with the real account at **16:27:24 UTC**, execution
`9850ba04-d5d9-4204-9322-ebf99ef6c5f9`, awaiting a separate manual CLI decision.
No paid provider call or Podman workload was included in this repetition.

The owner completed the terminal review and macOS authentication. The private
result reports success from **16:27:57.823Z to 16:28:22.082Z**. Independent read-only
inspection of SQLite and the authenticated artifact confirmed:

- Operation `Completed`, approval `consumed`, mode `personal`.
- Requester and approver both stable GitHub account 70180651 under explicit scope.
- Recorded native intent method `macos-local-auth-and-tty-v1`, approved at
  **2026-11-25T16:28:20.189Z**.
- Patch digest `01e7cf06c4535e3d8430e1ab2d663a9f815f82d8747d5bf9b0cd7347c0253950`.
- Generation, approval and continuation in distinct processes (71767, 72241, 72374).
- Exact harmless patch present only in the isolated workspace; original hash unchanged.
- Zero new model calls on resume; no generated code executed or integrated.

All real verification requests observed during this successful workflow returned
200. It verifies native Personal review/approval/continuation for this synthetic
scope, not Team separation between two people, arbitrary projects or sandbox
execution. The patch decision does not authorize `sandbox.validate`.

## Gate C — Podman

**Classification: BLOCKED for full Gate C; real fixed runtime suites PASSED.**

Read-only inspection observed running `ai-harness-isolation`, rootless mode,
linux/arm64, cgroup v2/systemd, cpu/io/memory/pids controllers and seccomp support.
Guest mount inspection reported no virtiofs/9p host shares. The owner confirmed
the machine was dedicated/disposable, then reviewed and authorized the exact
private profile, pinned image and both fixed suites. Profile creation used observed
machine metadata and the existing fingerprint function, without machine changes.

The locally available image observed was
`docker.io/library/node@sha256:b4955566e9320d2b70ddbd933053c216ae4b1d83f6bf947184e4d7de504059c2`.
`pnpm test:isolation` passed at **2026-11-25T15:41:02.976Z**. Effective probes
reported UID 65534, no capabilities, seccomp mode 2, no-new-privileges, read-only
root, 16 MiB tmpfs, explicit network denial, 256 MiB memory, zero swap, 64 PIDs and
0.5 CPU. A running container was observed before cancellation. Timeout, cancellation
and cleanup were confirmed.

`pnpm test:phase9b-podman` passed at **2026-11-25T15:43:28.648Z** for snapshot
`82a33d75ed95ae0668586aea185b3bfe8d9069f4f33315ddd15f9d7ff4304896`.
Snapshot transfer/staging, Node syntax check and test, harmless denial fixtures,
expected test failure, timeout and observed-running cancellation passed with cleanup
confirmed. A recorded `failure: failed` is the expected negative fixture outcome.
No machine was started, destroyed or reconfigured; no image was pulled.

The direct runtime smoke does not persist/reopen coordinator evidence or exercise
the separate authenticated Personal sandbox decision. Those steps, an explicit
real output-limit case and the separate live Personal sandbox decision remain pending.
Do not close the whole gate from the runtime summary alone.
The CLI remains `validation_acceptance_pending`. `node-isolated-v1` remains a
restricted Node action profile, not general pnpm/TypeScript/native toolchain support.

## Remaining risks

Native LocalAuthentication and session lifecycle were observed only in the
explicitly tested local workflow; broader host/platform coverage remains unverified.
Same-UID hostile processes, compromised host/verifier/OS, UI automation controlling
OS credentials, and malicious journal editors remain outside the trusted-host model.
In-memory receipt branding does not attest against host compromise. Journal v3
requires conservative backup/reconciliation for rollback; old approvals stay Team.
Guest source modes do not establish kernel immutability against the sandbox UID.
No generated-code security, production readiness, exactly-once effects, remote runner
acceptance or autonomous repair follows from the deterministic tests.

## Final status matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| A — GitHub OAuth | PASSED, tested local scope | Real login, Keychain recovery, refresh, logout and fresh official login/logout smoke; grant-wide refresh-token revocation unverified |
| B — Operational L2 Personal | PASSED, tested local scope | Real GitHub identity, manual native confirmation, consumed exact approval, separate-process continuation, original unchanged |
| B — Operational L2 Team | BLOCKED, real acceptance | Offline independence regressions pass; second real authorized account unavailable |
| C — Podman | BLOCKED | Both real runtime suites passed; durable authenticated evidence/reopen and explicit real output-limit acceptance pending |

Current automated counts and commands are in [verification](VERIFICATION.md).
## Authorized real OpenAI smoke

A single separately authorized `gpt-5.5-pro` smoke passed from
**15:39:09.821Z to 15:40:25.377Z** (75.553 s), execution
`b0c970ba-ecbd-423f-8ad4-7ffc560dac9c`. Exactly four HTTP 200 requests covered
requirements, planning, development and advisory review under limits of four
requests, 512 output tokens per request, 360 s global and 180 s request/role.
Reported usage: 2,160 input tokens, 824 output tokens including 536 reasoning
tokens. Cost remains unknown because no reviewed rate was supplied; that uncertainty
was explicitly accepted. Expected proposal/diff/review passed, source was unchanged,
no patch was applied or generated code executed, and temporary cleanup was confirmed.
Patch digest: `0bea8b95269a84c4bda7d7fa0a288eff9f006538d6fd9b3aa46ae5ab2ab598db`.
This L1 result does not substitute for live L2 approval or Podman evidence.

No further paid call is authorized by this result. Version remains 0.8.0;
Phase 9C/9D and publication remain deferred.
