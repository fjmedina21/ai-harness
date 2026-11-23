# Phase 9A performance audit

Baseline: 082d46fa6d48267c96e92e7feba4f068396e2b4f, version 0.8.0.
Historical evidence is distinguished from the separately authorized stabilization
smoke on 2ce8717. That execution passed in 262437.172 ms under 360s global / 180s HTTP and role.
Older results remain separate; see the live ledger.

## Historical real latency

Milliseconds below are native-fetch observations through headers/error, not server
compute timings. Role attribution follows the verified sequential task order.

| Profile/source | Requirements | Planner | Implementer | Reviewer | Total / outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| 120s / 9ce59e8b4b6b | 113363 | 6621 cancelled | Not reached | Not reached | 120046, timeout |
| 160s / 11c3738e42cc | 45776 | 14247 | 19428 | 80535 cancelled | 160058, timeout; proposal validated |
| 600s / 1c3755a49489 | 43254 | 140559 | 29227 | 27613 | 240770, passed |

In the passing trace, summed HTTP observations are 240653 ms, leaving 117 ms outside
those intervals. That remainder includes body reads, local work and observation
boundaries: it is not an isolated orchestration benchmark. Only three heterogeneous
runs exist; no percentile, stable speedup or causal model/context comparison is known.
Planner latency varied from 14.247s to 140.559s in the two completed planner calls.
The 120s/160s profiles exhausted the shared global budget; they were not schema failures.

Reported run-level input/output/reasoning totals: 489/177/139 (120s), 1548/763/527
(160s), 2132/874/598 (passing long run). Reasoning is included in output. Cancelled
requests have unknown usage/cost. Per-role usage, local context, serialization,
parsing, patch and checkpoint timing were not captured historically. Do not derive
them from totals. Exact timestamps/digests/cleanup are in [the live ledger](phase9-live-smoke.md).

## Measurement and optimization decisions

Extend the existing bounded telemetry with role index, remaining time, fixed phase
labels and terminal/timeout scope. Existing provider.request spans carry usage and
provider.http carries duration/status. Add phase spans for context reads/serialization,
response parsing, patch validation, dispatcher, checkpoint persistence and reporting.
No prompt, file content, patch body or credential is diagnostic metadata.

Keep Requirements, Planner, Implementer and Reviewer. Sensitive tasks retain the
existing Architect path; no model chooses controls or role omissions. No automatic
model switching, shared provider sessions or parallel writes are introduced. Snapshot
rehashing and independent approval checks remain mandatory; redundant security reads
are not removed merely because they cost time. Benchmark first; do not claim a
percentage improvement from a single live trace.

## Reproducible offline benchmark

The bounded synthetic benchmark exercises real filesystem/patch/dispatcher/SQLite
and checkpoint code using the real OpenAI adapter with mocked HTTP. It separates
configured simulated latency from measured provider duration and application time,
varies selected file count/content bytes, repeats samples and reports phase medians.
No generated code runs and no repository credentials are loaded. Results are local
microbenchmarks, not OpenAI performance or hosted CI evidence. Machine load and timer scheduling affect measurements.


Captured on 2026-11-23, Node v24.18.0, macOS arm64, source
2ce871777b987bcbf262f9eca4f8787a328b4dec. Reproduce after build with
pnpm bench:engineering. Five samples per case, 12 cases / 60 runs.
L1 performs four role requests. L2 performs five requests (existing post-apply
Validator included), actual SQLite approval/dispatch and checkpoints using trusted
fixture identities, not deployed authentication. All synthetic source checks and
cleanup passed. Bounded JSON samples are emitted on stdout.

| Level | Files / selected bytes | Configured delay/request ms | Median total ms | Median provider ms | Median application ms |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 / 128 | 0 | 4.574 | 0.729 | 3.845 |
| 1 | 4 / 2048 | 0 | 7.446 | 0.459 | 6.987 |
| 1 | 8 / 4096 | 0 | 12.067 | 0.511 | 11.620 |
| 1 | 1 / 128 | 5 | 24.820 | 22.284 | 2.589 |
| 1 | 4 / 2048 | 5 | 35.561 | 23.495 | 12.711 |
| 1 | 8 / 4096 | 5 | 39.141 | 23.335 | 16.824 |
| 2 | 1 / 128 | 0 | 176.990 | 1.004 | 175.986 |
| 2 | 4 / 2048 | 0 | 175.879 | 1.051 | 175.016 |
| 2 | 8 / 4096 | 0 | 333.143 | 1.391 | 331.908 |
| 2 | 1 / 128 | 5 | 254.513 | 34.940 | 221.328 |
| 2 | 4 / 2048 | 5 | 296.450 | 30.909 | 264.883 |
| 2 | 8 / 4096 | 5 | 277.091 | 30.258 | 247.911 |

Application time is computed per sample as total minus provider.request duration.
Columns are independent medians and need not add up. Configured simulated waits
are 0/20 ms per L1 run and 0/25 ms per L2 run; measured provider time also contains
HTTP/JSON/adapter overhead and scheduling. No value is a real OpenAI latency.

Phase medians sum each phase within a run before taking the median, with zero
simulated delay. Dispatcher/checkpoint columns do not apply to L1 (shown 0).
Role/provider/HTTP/parse spans overlap; do not add them as disjoint time.

| Level | Files | Context read ms | Context serialize ms | HTTP serialize ms | HTTP parse ms | Proposal parse ms | Patch validation ms | Dispatcher ms | Checkpoints ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1.578 | 0.035 | 0.024 | 0.030 | 0.048 | 0.449 | 0.000 | 0.000 |
| 1 | 4 | 3.268 | 0.031 | 0.032 | 0.023 | 0.029 | 0.847 | 0.000 | 0.000 |
| 1 | 8 | 5.546 | 0.044 | 0.041 | 0.022 | 0.030 | 1.464 | 0.000 | 0.000 |
| 2 | 1 | 3.897 | 0.037 | 0.044 | 0.045 | 0.069 | 0.821 | 49.646 | 22.451 |
| 2 | 4 | 9.486 | 0.054 | 0.049 | 0.069 | 0.052 | 1.558 | 51.845 | 22.355 |
| 2 | 8 | 29.506 | 0.081 | 0.058 | 0.041 | 0.073 | 4.244 | 82.027 | 28.665 |

The filesystem/SQLite path has material local cost relative to a zero-delay mock,
but these data do not explain 14–140 second real provider waits. Variation between
batches/cases prevents a monotonic scaling or improvement claim. No safety rehash,
mandatory role or independent approval was removed. Different models per role,
reduced role modes and context caching remain deferred pending host selection and
comparative evidence. This work improves measurement and bounded termination,
not demonstrated model speed.

See [timeout policy](phase9a-timeout-budget-policy.md), [live evidence](phase9-live-smoke.md)
and [L2 continuation design](phase9-l2-approval-resume-design.md).


## Definitive-profile real acceptance

One owner-authorized run passed on 2ce8717 at 2026-11-23T17:32:15.183Z,
finishing 17:36:37.618Z. Four HTTP 200s; reported 2136 input / 826 output / 565
reasoning (subset of output), usageComplete=true, unknown cost without host rates.

| Request | Role | Role ms | HTTP ms | Provider request ms | Input / output / reasoning | HTTP / role outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | requirements-analyst | 29027.789 | 29024.846 | 29025.607 | 487 / 155 / 119 | 200 / ok |
| 2 | planner | 100149.839 | 100145.715 | 100146.188 | 507 / 227 / 182 | 200 / ok |
| 3 | backend-developer | 51585.865 | 51567.271 | 51567.970 | 546 / 306 / 163 | 200 / ok |
| 4 | code-reviewer | 81638.988 | 81633.545 | 81634.178 | 596 / 138 / 101 | 200 / ok |

HTTP durations now include body processing. Role/provider/HTTP spans overlap, so
their totals must not be added. Smoke elapsed includes fixture setup and cleanup;
workflow elapsed was 262423.642 ms. Context/serialization/parsing/patch phase spans
are available to host telemetry and measured in the offline benchmark; their
individual live totals are not exported by this smoke report and are not inferred
from residual time. The model/provider still dominates this synthetic trace.
This is not a demonstrated optimization speedup: the older 240.77s pass used a
different temporary profile and varied responses. The explicit 360s/180s/180s
profile is now live-verified for this fixture; default deadlines remain unchanged.
