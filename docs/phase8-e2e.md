# Phase 8 E2E strategy

Phase 8 separates deterministic offline integration, mocked provider protocol
coverage and optional live-provider smoke testing. The integrated baseline
`c87d22f` (PR #3) passed standard hosted CI run
[45095776893](https://github.com/fjmedina21/ai-harness/actions/runs/45095776893).
The final closure on `chore/phase8-final-closure` passed **427/427** full-suite
tests and **18/18** focused application/CLI E2E tests locally. The focused tests
are included in the full count. The closure branch has no CI run and is not
merged or published; baseline CI does not certify its new changes.

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
Additional CLI cases verify HTTP errors through both adapters stop at one
request without fallback or sensitive telemetry, plus in-flight timeout/abort,
exit code 124 and cancelled checkpoint status. Application cases assert stable
execution/task/call identity and rejection of writes even when project config
requests privileged grants. These CLI cases call the actual `main()` handler;
a separate subprocess smoke ran the compiled executable for init, doctor,
fixture inspect JSON/text, status/reopened SQLite and telemetry. Each subprocess
exited successfully; temporary resources were removed and the README was unchanged.

Provider transport tests also exercise bounded, allowlisted HTTP error
classification with mocked responses, including inherited property names;
they never send requests to a real API. The focused transport/application/CLI
regression run passed 31/31 tests. See [verification](VERIFICATION.md) for
candidate evidence, residual limitations and preserved historical counts.

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
for that attempt is unresolved. The follow-up now reports a bounded allowlisted
HTTP error category without logging upstream text; the previous failed response
cannot be reclassified. See [VERIFICATION.md](VERIFICATION.md).

## Isolation and hosted CI

PR #3's dedicated Podman preparation and hardened probe/profile controls are
integrated at `c87d22f`; they are retained without execution or configuration in
this closure. The remote gate is **Deferred — dedicated remote infrastructure validation**.
Historical local Podman evidence is preserved and does not certify those
changes remotely. Phase 8 inspection executes no agent code in containers, so
that unpassed gate does not block offline closure. It remains required, with a
separate risk review, before future untrusted-code execution.

Both real providers are **Deferred — live provider interoperability validation**.
The historical HTTP 429 attempt is not a successful smoke. No live call, model
switch, retry-policy change or use of existing credentials occurred here.
Package publication and a formal GitHub Release are also pending, outside this
closure. Phase 9 remains **Not started — design pending**.
