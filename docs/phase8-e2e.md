# Phase 8 E2E strategy

Phase 8 separates deterministic offline integration, mocked provider protocol
coverage and optional live-provider smoke testing. The source commit `d9ecbf4`
has a successful standard hosted CI run; that does not imply live provider
validation.

## Deterministic offline E2E

`packages/application/src/__tests__/workflow.test.ts` exercises project
initialization, the three sequential roles, actual bounded filesystem reads,
Default Deny, project-config permission non-escalation, file checkpoints,
private SQLite operation persistence/reopen, malformed-journal fail-closed
behavior, telemetry and host-rate cost estimation, provider error sanitization,
cancellation before and after a read, timeout, and path validation. These cases
use real temporary directories and the actual SQLite backend.

`apps/cli/src/__tests__/phase8-cli.test.ts` initializes a project through the
CLI, runs inspection in JSON and text modes, queries checkpoint/journal status,
repeats a request under a distinct execution identity, checks read-path
traversal rejection, validates paid-call confirmation and missing credentials,
and exercises cancellation exit status.

The OpenAI and Anthropic CLI cases use mocked HTTP responses, but run the actual
provider adapters, native response translation, application service,
orchestrator, dispatcher, filesystem handler and CLI result path. They assert
the total call budget is enforced. They do not establish live API compatibility.

Run the focused integration suites after building:

```sh
pnpm build
node --test packages/application/dist/__tests__/workflow.test.js apps/cli/dist/__tests__/phase8-cli.test.js
```

The existing deterministic evaluation suite remains separate:

```sh
pnpm harness eval run --suite deterministic
```

It evaluates its known host-authored fixtures only; passing does not establish
general quality of real models.

## Optional live-provider smoke

`pnpm smoke:real-provider` is not part of `pnpm test` or standard CI. It requires
all of the following host inputs:

- `HARNESS_REAL_PROVIDER=openai` or `anthropic`.
- `HARNESS_REAL_PROVIDER_CONFIRM=YES` as explicit authorization.
- `HARNESS_REAL_MODEL` selected by the host.
- `HARNESS_REAL_OUTPUT_TOKEN_BUDGET` from 1 to 128 tokens per request.
- `HARNESS_REAL_REQUEST_BUDGET` from 6 to 9 total requests.
- Corresponding provider credential in the host environment.

The smoke creates a private temporary project with one synthetic README, sends
no private repository, prints metadata and reported token usage without model
response text, and removes its temporary fixture afterward. A successful run
requires three completed tasks and three successful `file.read` calls. The
maximum generated output budget is the output-token ceiling multiplied by the
request count; input-token spend still depends on each model and request. No
exact dollar cap is promised. An authorized `gpt-6-luna` smoke using this
synthetic fixture failed on the first request; a one-request diagnostic
returned HTTP 429. No file read, token usage or cost estimate was recorded, and
the smoke is not validated. The response body was not inspected, so the cause
is unresolved. See [VERIFICATION.md](VERIFICATION.md).

## Isolation and hosted CI

Phase 8 does not change Podman, the isolation profile, or container execution;
the real Podman suite is not required for Phase 8. Local deterministic tests do
not establish hosted isolation. The standard hosted CI run is recorded in
[VERIFICATION.md](VERIFICATION.md); the dedicated real Podman isolation
workflow remains a separate gate and was not run for Phase 8 because its
controls were unchanged.
