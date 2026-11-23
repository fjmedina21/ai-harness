# Phase 8 — integrated workflow and CLI

Phase 8 adds a host-owned composition boundary for a deliberately narrow
engineering workflow. This is experimental read-only inspection, not autonomous
implementation.

Status: **Implemented — offline E2E validated; external validation gates deferred**.
Baseline `c87d22f` includes PR #3. The final closure is on
`chore/phase8-final-closure` with local evidence only, not a merged/CI result.
Version stays 0.8.0. See [verification](VERIFICATION.md) and the
[offline acceptance checklist](RELEASE-CHECKLIST.md).

## Architecture

```mermaid
flowchart LR
  CLI[CLI host inputs] --> App[@ai-harness/application]
  App --> Core[Project config validation]
  App --> Orch[Sequential Orchestrator]
  Orch --> Agents[Planner / Code Reviewer / Validator]
  Agents --> Provider[Fixture / OpenAI / Anthropic]
  Agents --> Dispatcher[ToolDispatcher: Default Deny]
  Dispatcher --> Read[file.read only]
  App --> Checkpoint[.ai/state execution checkpoint]
  App -. optional .-> Journal[SQLite operation journal]
  App -. optional .-> Telemetry[Bounded telemetry sink]
```

`@ai-harness/application` composes existing packages and owns host settings.
Dependencies point from application to contracts, core, agents, orchestrator,
providers, tools, checkpointing and observability; these components do not
depend back on application. The CLI parses trusted flags and formats outputs;
it does not make policy decisions.

The inspect workflow assigns three sequential tasks (`planner`, `code-reviewer`,
`validator`). Every task must execute at least one successful `file.read` before
it can complete. The host fixes the only granted permission to `files:read` and
registers only the `file.read` tool. The project `.ai/config.json` is validated
to confirm initialization, but it cannot add permissions or tools.

## Commands

The legacy command remains the fixture-backed SDD proposal workflow:

```sh
pnpm harness run --path ./my-project --request "Review the project"
```

The explicit inspection mode uses the deterministic provider by default:

```sh
pnpm harness run --workflow inspect --path ./my-project \
  --request "Review API validation" --provider fixture --fixture-file README.md
```

The fixture reads the host-selected file and makes no network call. For an
explicit live provider call, set its credential in the host environment, then
provide model, request and output budgets and confirmation:

```sh
pnpm harness run --workflow inspect --path ./my-project \
  --request "Review API validation" --provider openai --model HOST_SELECTED_MODEL \
  --max-output-tokens 256 --max-provider-requests 6 --confirm-provider-call
```

Anthropic uses `ANTHROPIC_API_KEY` and `--provider anthropic`. Provider/model
selection never comes from repository content. Missing credentials fail closed;
the CLI has no fallback to fixture after a live selection error.

Additional options:

- `--fixture-file RELATIVE_PATH`: fixture-only; default `README.md`.
- `--journal ABSOLUTE_FILE`: opt into the SQLite operation journal. Its parent
  must already be a canonical private directory with mode `0700`; the database
  is created as `0600` by the journal.
- `--telemetry-dir PRIVATE_DIR`: opt into bounded private JSONL telemetry. The
  directory must exist and be private.
- `--rates PRIVATE_JSON`: use an explicit host-supplied tariff table for the
  run summary. The file must be private, bounded and valid. Without reported
  usage or a matching rate, costs remain unknown.
- `--timeout-ms N`: overall workflow deadline, 1,000–120,000 ms.
- `--json`: emit one bounded structured result, without progress lines.
- `status --path DIR --id EXECUTION_ID [--journal ABSOLUTE_FILE]`: inspect the
  checkpoint and, optionally, safe operation metadata.

Live provider output tokens are limited to 1,024 per request and total provider
requests to at most 9. The host must supply a stricter output/request budget on
the CLI. These ceilings do not form an exact dollar cap; input token billing and
provider rates depend on the selected model and request. Tariff calculations are
estimates, not invoices.

## Lifecycle, persistence and output

Each invocation gets a generated UUID execution identity. Provider tool-call IDs
are scoped to the execution/task and used as durable request identities when a
journal is enabled. Repeating a CLI command creates a new execution by design;
it is not a deduplication guarantee for a real-world task.

File checkpoints are written under `.ai/state/executions/`. This Harness-owned
state is separate from project source files and from the SQLite operation
journal. The journal is opt-in, records operation metadata/digests through the
existing dispatcher boundary, and is not used to resume model sessions.
Operations in this workflow are read-only; it cannot issue or consume approvals.
The host may inspect journal states, but no automatic replay/reconciliation is
performed.

Text output reports progress using only lifecycle states, task IDs, roles and
tool IDs. JSON output includes task results (bounded per task), operation
metadata, whether source files changed, and that tests were not run. Exit codes
are 0 for a completed inspection, 1 for failure, 124 for timeout and 130 for
cancellation. A generated plan or completed review does not mean code was
implemented or validated by tests.

## Compatibility and limits

- Default CLI/SDD behavior remains fixture-backed and does not dispatch tools.
- No shell, write, Git mutation, deployment, approval action, Podman execution,
  automatic retry, resume or provider-session persistence is exposed.
- A live provider receives the engineering request and the contents of files
  selected by its read-only tool calls. Sensitive file/path filters are
  inherited from `file.read`, but this is not a guarantee that all private source
  data is excluded.
- Local checkpoints may contain request text and model summaries; protect the
  project state directory accordingly.
- Provider errors are sanitized at the adapter/agent boundary. Telemetry is
  optional and separate from the durable journal.
- The workflow is sequential. It does not write source files or run project
  validation commands.

## External gates and next-phase boundary

OpenAI and Anthropic are **Deferred — live provider interoperability validation**;
both adapters have deterministic HTTP coverage, not successful live workflow
acceptance. The failed OpenAI HTTP 429 attempt remains historical evidence.
Remote Podman is **Deferred — dedicated remote infrastructure validation**;
its preparation is integrated, its local isolation history is preserved, and
its remote workflow is not run. This does not block read-only offline closure;
real remote isolation plus a new risk review is required before future execution
of untrusted code. No new execution capability is included here.

Phase 9 is **Not started — design pending**. Its
[design handoff](ROADMAP.md#phase-9-readiness--design-handoff-only) identifies
dependencies without implementing workspaces, patch tools or container validation.

See [Phase 8 security](phase8-security.md), [E2E evidence](phase8-e2e.md) and
[release checklist](RELEASE-CHECKLIST.md).
