# Phase 7 agent evaluations

The private `@ai-harness/evaluations` package provides host-authored,
deterministic scenarios, typed scalar observations, assertions, reports and
regression comparisons. Four categories are represented: functional, security,
reliability and efficiency. The bundled offline suite has 19 scenarios and 42
assertions. Scenarios exercise fixture tool calling, dependencies, default deny,
allowlists, malformed inputs, approval boundaries, real SQLite one-use grants
and conservative recovery, cancellation, bounded turns and provider failures.

Run the deterministic suite with:

```sh
pnpm harness eval run --suite deterministic
```

The command executes only local fixtures and prints a versioned JSON report.
Private reports may be inspected or compared with an explicit baseline:

```sh
pnpm harness eval report --input ./private-report.json
pnpm harness eval report --input ./private-report.json --baseline ./private-baseline.json
```

Inputs must be private bounded files. Comparisons report missing scenarios,
incomparable suite versions, failed outcomes and metric regressions. Numeric
assertions require explicit absolute tolerances; metric comparisons support
host supplied absolute/relative tolerances. Missing observations stay missing.
No model judges its own safety assertions.

Reports omit timestamps and generated IDs when timing is disabled, making the
fixture suite reproducible. Explicit duration measurement is environment
dependent. The fixed suite passing demonstrates only these known scenarios; it
does not establish general agent quality, objective evaluation, live provider
compatibility or production safety. There is no paid API or network dependency.
