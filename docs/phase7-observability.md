# Phase 7 observability

Phase 7 adds host-opt-in telemetry contracts and bounded collection. The
Phase 6 SQLite journal remains authoritative for operation and approval state.
Telemetry is best-effort diagnostics and cannot authorize, resume, reconcile,
or mutate an operation.

## Architecture

~~~mermaid
flowchart LR
  O[Orchestrator] --> A[Agents]
  A --> P[Providers]
  A --> D[ToolDispatcher]
  D --> J[SQLite authorization journal]
  O -. opt-in .-> C[TelemetrySession]
  A -. opt-in .-> C
  P -. opt-in .-> C
  D -. opt-in .-> C
  C --> Q[Bounded queue]
  Q --> M[Memory ring]
  Q --> F[Private rotating JSONL]
  M --> R[Trace and metrics]
  F --> R
  R --> E[Deterministic evaluations]
~~~

Neutral version 1 contracts include `TelemetryEvent`, `TelemetrySink`,
`ExecutionTrace`, `TraceContext`, `SpanRecord`, `ExecutionMetrics`,
`TokenUsage` and `CostEstimate`. Correlation IDs have no authority.

| Layer | Captured spans/events |
|---|---|
| Orchestrator | execution, task lifecycle and blocked dependencies |
| Agents | invocation, model turns, requested/rejected calls, limits |
| Providers | request/HTTP latency, provider/model labels and reported usage |
| ToolDispatcher | validation, policy, authorization, dispatch and handler outcomes |

Only allowlisted bounded scalar attributes and fixed result/error classes are
accepted. Prompts, model output, file contents, tool arguments/results,
credentials, approval IDs and raw exception text are excluded. Unknown tool
names are redacted. Tokens are emitted once per provider request; unknown and
partial usage stays explicit. Prices are supplied by the host per provider/model,
currency and rate version; no live tariffs are fetched and estimates are not
billing.

Telemetry is constructed explicitly and has no network exporter:

```ts
const sink = new InMemoryTelemetrySink();
const telemetry = new TelemetrySession({ sink });
await orchestrator.run({ ...input, telemetry });
await telemetry.flush();
const events = sink.events();
const metrics = buildExecutionMetrics(events, executionId, hostRates);
```

The in-memory ring, active spans, traces, event count, queue events and queue
bytes have fixed configurable ceilings. Async sink failures/timeouts increment
diagnostics and disable the sink without changing execution results. A trusted
custom sink may still block synchronously. The JSONL sink requires an existing
owner-only private directory, bounds record/file/retention sizes and rotates a
single writer's files. It is not a transactional journal, multi-process store,
crash-durable log or exactly-once exporter.

The CLI provides explicit offline diagnostics:

```sh
pnpm harness trace --input ./private-telemetry.jsonl --id EXECUTION_ID
pnpm harness metrics --input ./private-telemetry.jsonl --id EXECUTION_ID
```

The reader validates schema, permissions, links, record count and total bytes.
No server, public endpoint or automatic export is enabled. Missing, duplicate,
or out-of-order events mark traces incomplete; metrics flag executions needing
human review. Wall-clock event timestamps and monotonic span durations are
distinct. Trace IDs are never accepted as tool permissions.

Performance was measured with a local microbenchmark (Node v24.18.0, macOS
arm64; 9 samples × 2,500 iterations, median and p95). Median per operation:
empty event-loop baseline 0.009 μs, span plus memory sink 3.47 μs, span plus
JSONL sink 141.31 μs, SQLite list of 100 records 787.77 μs, and unique SQLite
registration 31.29 μs. The registration p95 was 10.88 ms, showing filesystem
tail-latency variability. These are single-process local measurements, not
production or cross-machine guarantees. No optimization was justified by this
small benchmark, so security checks and serial dispatch remain unchanged.
Reproduction script and raw results are local under
`harness-development/phase7/benchmark.mjs` and
`harness-development/phase7/benchmark-results.json`.
