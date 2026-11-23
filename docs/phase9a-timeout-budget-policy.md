# Phase 9A timeout and budget policy

Design recorded before implementation on feat/phase9a-stabilization, based on
082d46fa6d48267c96e92e7feba4f068396e2b4f, version 0.8.0. Implementation: 2ce871777b987bcbf262f9eca4f8787a328b4dec. A single stabilization
smoke was separately authorized; see [the live ledger](phase9-live-smoke.md).
Historical permissions never authorize retries.

## Finite host policy

| Layer | Default | Configurable ceiling | Scope |
| --- | --- | --- | --- |
| Engineering workflow | OpenAI CLI 120000 ms; fixture CLI 60000 ms; programmatic caller supplies budget.timeoutMs | 900000 ms | All inspection, context, role work and patch/approval operations |
| HTTP request | 30000 ms | 300000 ms | Existing transport, including response body; host must explicitly choose wider values |
| Role | min(120000 ms, workflow allowance) | 300000 ms | Includes context preparation, provider call and parsing; clipped by global/absolute deadline |
| Absolute deadline | Optional host epoch milliseconds | Cannot extend global allowance | Captured once against wall clock; elapsed enforcement uses monotonic time |
| Terminal persistence/final inspection | 1000 ms | 5000 ms | One shared finalization allowance after cancellation; no new provider or mutation work |

All durations are finite positive safe integers. Unknown role keys, zero, fractions,
Infinity, values above ceilings and malformed deadlines fail before effects. A past
absolute deadline stops before source/workspace creation or provider requests.
Explicit per-role overrides may lower or raise the role allowance within the same
ceiling. Global timeout always wins over a longer role or HTTP timeout. AbortSignal
combines user cancellation, global deadline and the current role; provider transport
adds its own HTTP timer. A wall-clock jump after admission never extends elapsed time.
Trusted synchronous JavaScript/filesystem callbacks cannot be preempted; deadline
checks gate subsequent work and reporting does not claim hard real-time execution.

The compatibility default is deliberately not 600 seconds. An experimental profile
for a host-selected slow model is 360000 ms global / 180000 ms HTTP / 180000 ms per
role, based on observed 240.77s total and 140.56s longest request. The 2ce8717 synthetic run passed with this explicit profile. It is not a latency
percentile, a guarantee for other tasks or authorization for another live run. It requires all normal
paid-call/scope/uncertain-cost opt-ins. Models are never selected automatically.

CLI: --timeout-ms, --request-timeout-ms and --role-timeout-ms are separate host
options. Absolute deadlines and role overrides are trusted programmatic timing
options; they never enter model prompts. Existing inspect behavior remains separate.

## Accounting and uncertainty

Requests, turns, input-context admission, output tokens, actual reported cumulative
tokens, iterations, paths, file count and changed bytes remain independently bounded.
Tariffs/reservations are host-owned estimates, not billing guarantees; absent rates
mean unknown, not zero. Missing/partial usage blocks subsequent roles. Reasoning
counts are subsets of output. Cancelled requests can have unknown upstream outcome
and billable usage. No retry, provider/model fallback or native-session resume occurs.

Terminal persistence has a separate bounded allowance, reported explicitly. Failed
or late persistence makes L2 Uncertain; it never authorizes replay. Checkpoint APIs
cannot cancel an already-started write, so late completion remains possible. A
returned result is a detached snapshot, not a mutable handle held by late callbacks.
No exactly-once or multi-file transaction guarantee follows. L3 stays disabled.

## Acceptance

Test minimum/maximum/above-maximum, expired absolute deadlines, HTTP/role/global
precedence, uncooperative provider cancellation, incomplete reviewer, final persistence
stall, unknown usage, malformed response, context limits and no new calls after stop.
The owner explicitly authorized one gpt-5.5-pro execution: 6 requests maximum,
512 output tokens/request, 360000 ms global, 180000 ms HTTP/role, unknown cost
accepted, synthetic value.ts only, no application/execution. It passed in 262437.172 ms with four HTTP 200s, valid expected patch/diff, completed Reviewer, unchanged source and confirmed cleanup.
No retry or new authorization is implied by its outcome.


Offline coverage: engineering-timing.test.ts validates policy boundaries, absolute
expiry, role/global/HTTP precedence, cancellation, late responses, checkpoint stalls,
SQLite reopen, expiry, stale workspace and per-role telemetry. Trusted synchronous
callbacks can delay timer dispatch; monotonic checks therefore also guard role entry,
request admission and acceptance. Telemetry uses existing bounded sinks and fixed
labels; unknown fields are discarded.


## Cancellation, cleanup and wall-time limits

Cancellation propagates immediately through AbortSignal and prevents new requests;
it cannot preempt synchronous host callbacks or prove upstream cancellation/billing.
The provider releases late responses/readers best-effort without awaiting an
uncooperative stream. That is bounded local waiting, not proof of remote cleanup.

L2 deliberately preserves its private workspace on uncertainty. Workspace cleanup
is a separate exact-snapshot host operation, not an automatic terminal delete.
The 1000ms default/5000ms maximum finalization allowance covers terminal checkpoints
and final read-only diff inspection only. The opt-in L1 smoke separately awaits
removal of its synthetic fixture and reports confirmed only after success; OS
filesystem cleanup is not preemptible or covered by a hard cleanup timer in this
phase. Its total outer duration includes this cleanup. Operator interruption/storage
failure leaves cleanup uncertain, never successful by inference. Real Podman cleanup
and its resource/time guarantees remain outside this phase.

The accepted live run completed all work and confirmed fixture cleanup within its
360s allowance; this single observation is not a general hard real-time guarantee.


CLI migration note: before stabilization, engineering --timeout-ms was also
forwarded as the HTTP timeout. It now governs only the global workflow deadline;
HTTP defaults independently to 30000 ms. An existing host invocation that relied
on the old coupling must explicitly supply --request-timeout-ms (and, for a slow
role, --role-timeout-ms). This is an intentional finite-policy separation, not an
automatic inference of larger budgets. Fixture CLI keeps its 60000ms default;
Phase 8 inspection retains its existing configuration and regression behavior.
