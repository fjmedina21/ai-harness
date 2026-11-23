# Phase 8 security boundaries

The integrated Phase 8 workflow is a bounded read-only project inspection.
Existing Default Deny, provider separation, SQLite journal, checkpoint and
telemetry controls remain in force.

## Authority boundaries

- CLI flags and programmatic application options are host inputs. Repository
  files and model responses are untrusted.
- `@ai-harness/application` assigns a fixed permission profile containing only
  `files:read`, and uses `createReadOnlyToolCallingAgent()` with only
  `file.read` registered. Project declarations cannot expand this profile.
- The complete tool batch is parsed, checked against the host allowlist and
  schema-validated before `ToolDispatcher` dispatch. A `file.write` request is
  rejected by the agent allowlist; no write handler is registered.
- There is no shell, Git status/write, deployment, container or approval tool in
  this workflow. No model response can create or approve a grant.
- Provider adapters receive bounded prompts, tool specs, continuation and tool
  results. They receive no journal handle or authorization identity.
- Progress and telemetry identifiers are diagnostic metadata, never permits.

## Provider and data controls

- Fixture is the offline default. OpenAI and Anthropic require explicit
  `--workflow inspect`, provider, model, confirmation, output-token ceiling,
  total request ceiling and a host environment credential.
- Credentials are never read from `.ai/`, logged, checkpointed or placed in the
  telemetry attributes. A selected live provider never silently falls back.
- Output tokens are capped per request and provider calls are capped per
  execution. This limits exposure but is not a dollar-denominated ceiling:
  input usage and current provider rates vary. A private host rate file can
  produce a reproducible estimate after usage is reported.
- A provider can receive the explicit user request and file contents returned
  by `file.read`. The tool rejects restricted/sensitive paths and bounded reads,
  but source files may still contain information the host does not want sent to
  a provider. Review the selected project and provider before confirming.
- Model summaries are bounded in CLI output. Checkpoints intentionally retain
  execution/task data and summaries in `.ai/state`; they are distinct from
  telemetry and the SQLite operation journal.

## Persistence and recovery

- File checkpoints are created by the existing `FileRuntimeCheckpointStore`
  under the initialized project. They are snapshots, not an authorization log.
- SQLite is opened only when the host supplies an absolute journal path. The
  existing backend validates owner, canonical `0700` parent, `0600` database,
  size, schema, integrity and transaction invariants. The application does not
  create or repair an invalid journal and has no fallback if opening fails.
- The integrated tool set is read-only, so no approval is generated or reused.
  Journal records are completed read operations; state inspection does not
  resume provider sessions or replay calls.
- New CLI invocations receive new execution IDs. The journal's uniqueness scope
  does not deduplicate semantically identical tasks across separate executions.
- Cancellation stops subsequent model/tool work but does not imply rollback of
  an already-started external effect. No automatic retry or recovery is added.

## Telemetry and residual risks

- Telemetry is optional and uses existing bounded/sanitized sinks. It excludes
  prompts, tool arguments/results, file contents, provider responses, secrets
  and authorization identifiers. Telemetry failure is best effort and cannot
  change tool permission decisions.
- Provider HTTP diagnostics retain only the numeric status and a fixed error
  category from a bounded error envelope. Raw provider error bodies, messages
  and unrecognized codes are discarded.
- Private JSONL output and tariff files must be host-selected and private.
  Telemetry is not durable execution state and does not replace SQLite.
- Existing local file-read TOCTOU limitations, trusted-host/filesystem
  assumptions, provider data handling and lack of session resume remain.
- The real-provider smoke is opt-in and may incur charges. It uses a synthetic
  temporary fixture and reports no response text. Its explicit output/request
  budget is not a guaranteed dollar cap.

## Final closure review

The integrated baseline `c87d22f` includes PR #3's runner guard, pinned actions,
private profile validation, stricter network-denial evidence and redaction.
Those controls and the Podman-only backend are retained. This closure changes
no container privileges, SQLite transition rules, approval issuance or runtime
selection and runs no isolation workload.

The closure fixes inherited-property lookup in bounded HTTP error classification;
only own allowlisted codes map to categories, and unknown codes stay `unknown`.
Regression coverage exercises hostile inherited names, HTTP errors through both
adapters without retries/fallback or telemetry payload disclosure, and CLI timeout
with HTTP cancellation and persisted cancelled status. No public contract changes.

Checkpoints and task results remain potentially sensitive. Existing checkpoint
state and directory ancestry must be host-controlled; snapshot persistence is
not a race-free rooted sandbox or authenticated state. Common filename filters
cannot guarantee secret detection, and telemetry label allowlists do not remove
the host's duty to keep secrets out of diagnostic identifiers. Tests are bounded
local evidence, not a proof against a compromised host or all filesystem races.

OpenAI/Anthropic: **Deferred — live provider interoperability validation**.
Remote Podman: **Deferred — dedicated remote infrastructure validation**.
These are unpassed external gates, not offline blockers for the inspection-only
scope. Dedicated remote validation and a separate risk review remain required
before future untrusted-code execution. Phase 9 writes, workspace mounts and
validation commands remain **Not started — design pending**; see the
[design handoff](ROADMAP.md#phase-9-readiness--design-handoff-only).
