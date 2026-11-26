# CLI Reference

AI Harness **0.8.0 — experimental**. This reference describes the checked-in CLI,
not commands proposed for future phases. Build the repository before invoking
`pnpm harness`. Examples use placeholders; operational commands require the
owner's registered host policy and explicit approvals.

The reference checker reads TypeScript syntax without importing or running the
CLI. It compares the command inventory and option tables below with the parsers.
For host settings, see [Configuration Reference](./configuration.md).

## Invocation and common rules

```sh
pnpm harness --help
pnpm harness version
```

<!-- cli-command: help -->
<!-- cli-command: version -->

`help`, `--help` and `-h` display global help. `version`, `--version` and `-v`
display `ai-harness 0.8.0 (experimental)`. A subcommand containing `--help` or
`-h` also displays global help; there is no dedicated per-command help page.

Use separate option/value arguments, such as `--path DIR`. The parsers reject
unknown or duplicate options and missing values. Do not assume `--name=value`
or short aliases exist. Paths for basic commands resolve relative to the current
directory; lifecycle commands locate resources through trusted host registration.
Execution IDs for engineering lifecycle and repair must match
`[A-Za-z0-9-]{1,80}`. They are execution IDs, not operation or validation IDs.

**Authentication != Authorization != Approval.** GitHub proves the one owner's
identity. Host project capabilities authorize resources and actions. Personal L2
requires exact human review for a concrete patch. Sandbox execution requires a
separate approval. Provider consent and provider credentials are independent of
all four. No CLI option bypasses those boundaries.

## Project commands

<!-- cli-command: init -->
### init

```sh
pnpm harness init --path ./my-project --name my-project --dry-run
pnpm harness init --path ./my-project --name my-project
```

Initializes managed `.ai/` configuration, agents and workflow declarations without
overwriting existing managed files. Use the dry run to inspect the list first.
No GitHub authentication, provider call or sandbox approval is required. Output
reports `Would create` or `Created`, the count and relative managed filenames.
An existing managed file or invalid project configuration can reject initialization.

<!-- cli-options: init -->
| Option | Meaning |
| --- | --- |
| `--path` | Project directory; defaults to the current directory. |
| `--name` | Project name; defaults to the directory-derived name. |
| `--dry-run` | Report files without creating them. |
<!-- /cli-options -->

<!-- cli-command: doctor -->
### doctor

```sh
pnpm harness doctor --path ./my-project
```

Validates project configuration and declarations, then reports project name,
schema version, agent count and workflow names. It does not verify credentials,
GitHub authorization, live provider access or Podman isolation. Missing or invalid
managed files cause exit 1. It does not edit project files.

<!-- cli-options: doctor -->
| Option | Meaning |
| --- | --- |
| `--path` | Project directory; defaults to the current directory. |
<!-- /cli-options -->

<!-- cli-command: agents -->
### agents

```sh
pnpm harness agents --path ./my-project
```

Lists enabled role identifiers from validated project configuration. A declared
role does not establish an operational model-backed agent or authorize tools.
No authentication or approval; no files changed.

<!-- cli-options: agents -->
| Option | Meaning |
| --- | --- |
| `--path` | Project directory; defaults to the current directory. |
<!-- /cli-options -->

<!-- cli-command: config -->
### config

```sh
pnpm harness config --path ./my-project
```

Prints validated project configuration as JSON. This is the project's `.ai/`
configuration, not the trusted private GitHub/authorization profile. Treat your
own configuration output as project data before sharing it. No authentication or
approval; no files changed.

<!-- cli-options: config -->
| Option | Meaning |
| --- | --- |
| `--path` | Project directory; defaults to the current directory. |
<!-- /cli-options -->

## run: default SDD and read-only inspection

<!-- cli-command: run -->
### Default fixture workflow

```sh
pnpm harness run --path ./my-project --request "Describe the requested change"
```

With no workflow selected, the CLI uses the fixture provider and the declared SDD
workflow. It produces deterministic stage output and execution state. This is a
local demonstration, not a real implementation, test run or accepted repair.
It persists Harness execution state and stage documents. It requires valid `.ai/`
project declarations but no GitHub login or model credential.

### Inspection workflow

```sh
pnpm harness run --workflow inspect --path ./my-project \
  --request "Summarize the README" --provider fixture --fixture-file README.md --json
```

The fixture inspector uses controlled, host-selected read-only file access. It
can persist checkpoints under `.ai/state` and optional journal/telemetry evidence;
“read-only” refers to project source, not the absence of all Harness state writes.
It does not edit source files or execute tests.

A real provider requires explicitly selected model and finite request/output
budgets, explicit paid-call consent, and an environment credential supplied by
the host. OpenAI and Anthropic are supported here; this does not imply that both
support engineering or repair. Example syntax, **not part of docs generation**:

```sh
pnpm harness run --workflow inspect --path ./my-project \
  --request "Summarize the selected source context" --provider openai \
  --model HOST_SELECTED_MODEL --max-output-tokens 512 \
  --max-provider-requests 2 --confirm-provider-call --timeout-ms 30000 --json
```

<!-- cli-options: run -->
| Option | Meaning and restriction |
| --- | --- |
| `--path` | Project directory; defaults to the current directory. |
| `--request` | Required task text. |
| `--provider` | Default SDD: `fixture`; inspect: `fixture`, `openai` or `anthropic`. |
| `--workflow` | `inspect`, or `implement` with the separate parser below. |
| `--model` | Required for real providers; rejected in fixture mode. |
| `--fixture-file` | Relative read target for inspect fixture; defaults to `README.md`; rejected for real providers. |
| `--journal` | Optional private journal filename for inspect; use a host-controlled absolute file. |
| `--telemetry-dir` | Optional private telemetry directory for inspect. |
| `--timeout-ms` | Finite inspection workflow timeout. |
| `--rates` | Optional trusted private cost-rate JSON for estimates. |
| `--max-output-tokens` | Required explicit output-token budget for a real provider. |
| `--max-provider-requests` | Required explicit request budget for a real provider. |
| `--confirm-provider-call` | Explicit consent to potentially billable network requests. |
| `--json` | Structured inspection output; suppresses progress lines. |
<!-- /cli-options -->

Real-provider model/budget/consent options are rejected for inspect fixture mode.
The inspect-only options are rejected when no workflow is selected. Common errors
include a missing request, missing model/budget/consent, unavailable credential,
unsafe context path and provider response limits. Normal output includes execution
ID, termination, provider/model, task results and operation classifications.

## run: engineering proposals

```sh
pnpm harness run --workflow implement --autonomy propose --path ./my-project \
  --request "Propose a greeting update" --provider fixture --files hello.txt \
  --fixture-file hello.txt --fixture-content "Hello from AI Harness" --json
```

`propose` reads the explicit context and returns a structured patch, diff, plan,
validation result and risks. It does not create an isolated workspace or persist
engineering journal/checkpoints. Fixture content is a recipe for offline testing;
it is not evidence of a real model request.

`isolated` uses a private copy outside the original project. It requires an
existing host-registered project, exact source/private-directory bindings,
requester capability, authorized tools/policy/budgets and `--authorize-workspace`.
It stops for Personal L2 rather than applying a model claim as approval. The
original source is not integrated or modified by this workflow.

```sh
pnpm harness run --workflow implement --autonomy isolated --path PROJECT_ROOT \
  --request "Propose the authorized change" --provider fixture --files hello.txt \
  --fixture-file hello.txt --fixture-content "Reviewed replacement" \
  --workspace-dir PRIVATE_WORKSPACE_DIR --journal PRIVATE_JOURNAL_FILE \
  --checkpoint-dir PRIVATE_CHECKPOINT_DIR --authorize-workspace --json
```

The placeholder paths must match actual host registration. This example does not
register a project, grant a capability or approve a patch.

<!-- cli-options: implement -->
| Option | Meaning and restriction |
| --- | --- |
| `--workflow` | Must select `implement` to reach this parser. |
| `--path` | Existing canonical project root. |
| `--request` | Required nonempty objective, at most 8192 bytes. |
| `--provider` | `fixture` (default) or `openai`; Anthropic engineering is deferred. |
| `--autonomy` | Required `propose` or `isolated`. |
| `--files` | Required comma-separated explicit context file allowlist, at most 16 entries. |
| `--fixture-file` | Required fixture patch target; unavailable with OpenAI. |
| `--fixture-content` | Required fixture replacement text; unavailable with OpenAI. |
| `--workspace-dir` | Existing private external workspace directory for isolated mode. |
| `--journal` | Private SQLite journal file for isolated mode. |
| `--checkpoint-dir` | Existing private external checkpoint directory for isolated mode. |
| `--authorize-workspace` | Explicit isolated-copy creation consent; does not approve applying a patch. |
| `--max-iterations` | Finite workflow iteration ceiling, default 3, maximum 8. |
| `--timeout-ms` | Global workflow deadline; default fixture 60000 / OpenAI 120000; maximum 900000. |
| `--request-timeout-ms` | OpenAI per-request deadline; default min(global, 30000), maximum 300000. |
| `--role-timeout-ms` | Role deadline; default min(global, 120000), maximum 300000. |
| `--finalization-timeout-ms` | Bounded finalization allowance; default 1000, maximum 5000. |
| `--model` | Host-selected OpenAI model, required for real requests. |
| `--allowed-paths` | Comma-separated patch paths; defaults to context file list. |
| `--operations` | Comma-separated `create`, `replace`, `delete`; defaults to create/replace. |
| `--max-provider-requests` | Explicit OpenAI request ceiling, maximum 32. |
| `--max-output-tokens` | Explicit OpenAI per-request output ceiling, maximum 4096. |
| `--max-total-tokens` | Cumulative token ceiling, maximum 100000. |
| `--max-agent-turns` | Additional finite request/turn ceiling, maximum 32. |
| `--max-context-bytes` | OpenAI context ceiling; default 16384, maximum 32768. |
| `--max-context-tokens` | OpenAI context ceiling; default 8192, maximum 32768. |
| `--rates` | Trusted private rate JSON; pair with cost ceiling. |
| `--max-cost-usd` | Estimated cost ceiling from 0 to 10; pair with rates. |
| `--confirm-provider-call` | Required explicit potentially billable OpenAI consent. |
| `--allow-uncertain-cost` | Required OpenAI acknowledgement that exact charges cannot be guaranteed. |
| `--sensitive` | Marks the request sensitive for the engineering workflow's handling. |
| `--json` | Emit structured engineering result. |
<!-- /cli-options -->

Fixture rejects real-provider flags. OpenAI rejects fixture flags and requires
`OPENAI_API_KEY` from the host environment; repository `.env` files are not loaded
automatically. Keep credentials out of arguments, examples and project config.
`--rates` and `--max-cost-usd` must be supplied together. An estimate is not an
exact billing cap. Isolated budgets may narrow host ceilings. Explicit isolated
path/operation selections must match host policy; register a narrower host policy
instead of assuming a CLI flag changes authorization.

Text output reports plan, diff scope, state transitions, pending approvals, budget,
usage and risks. Proposed code has not been executed by this command. Separate
accepted validation is described below. Invalid arguments, disallowed paths,
missing workspace authorization, missing credential or GitHub verification failure
reject the workflow. SQLite/artifacts/checkpoints and workspace changes are private
and must not be committed or copied into portal assets.

## Execution inspection

<!-- cli-command: status -->
```sh
pnpm harness status --path ./my-project --id EXECUTION_ID
```

Reads a runtime execution checkpoint and optional operation journal; prints task
states and operation classifications. Missing execution state or malformed ID
causes failure. This command is distinct from authenticated engineering status.
It does not resume effects or execute code.

<!-- cli-options: status -->
| Option | Meaning |
| --- | --- |
| `--path` | Initialized project directory. |
| `--id` | Required runtime execution ID. |
| `--journal` | Optional operation journal file for additional inspection. |
<!-- /cli-options -->

## Authentication

<!-- cli-command: auth login -->
<!-- cli-command: auth whoami -->
<!-- cli-command: auth status -->
<!-- cli-command: auth refresh -->
<!-- cli-command: auth logout -->
```sh
pnpm harness auth login
pnpm harness auth whoami --json
pnpm harness auth status --json
pnpm harness auth refresh
pnpm harness auth logout
```

<!-- cli-options: auth -->
| Option | Meaning |
| --- | --- |
| `--json` | Accepted on each auth action; output is already JSON. |
<!-- /cli-options -->

All actions require a trusted private GitHub App profile and operational protected
credential storage. The supplied host adapter is macOS Keychain. Linux/Windows
operational credential adapters are not supplied. Login opens GitHub's browser
flow and refuses to overwrite an existing session; logout first if needed.
Whoami/status verify current owner identity online; they are not a substitute for
project authorization and should not be run as an offline docs build check.
Refresh rotates and verifies credentials. Logout clears local credentials and
reports `refreshCredential: removed_locally_remote_revocation_unverified`;
it does not prove remote refresh-token revocation.

Success JSON includes authentication state, username, stable account ID, issuer,
expiry and owner match. Error JSON contains a sanitized code/message. Failure exits
1. Common issues: invalid host profile, wrong owner, unavailable/locked Keychain,
callback-port conflict, expired/invalid credential and `github_unavailable`.
Credentials and session state belong outside source control. Login never grants
paid model access, project capabilities, Personal L2 intent or sandbox execution.

## Engineering review and continuation

<!-- cli-command: engineering status -->
<!-- cli-command: engineering diff -->
<!-- cli-command: engineering approve -->
<!-- cli-command: engineering reject -->
<!-- cli-command: engineering revoke -->
<!-- cli-command: engineering continue -->
```sh
pnpm harness engineering status --id EXECUTION_ID --json
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

<!-- cli-options: lifecycle -->
| Option | Meaning |
| --- | --- |
| `--id` | Required engineering execution ID, resolved through host registration. |
| `--json` | Accepted; lifecycle output is already JSON. |
<!-- /cli-options -->

| Action | Capability and behavior | State/files affected |
| --- | --- | --- |
| `status` | Reader; inspect pending proposal and continuation state. | Reads private journal/artifacts; no provider or code execution. |
| `diff` | Reader; inspect sanitized proposed diff. | Reads bound artifact; display is not a grant. |
| `approve` | Approver; exact review, typed `APPROVE`, fresh macOS LocalAuthentication. | Persists operation-bound, expiring one-time decision; does not apply source. |
| `reject` | Approver; explicitly rejects the proposal. | Persists rejection; no patch application. |
| `revoke` | Approver; revokes the outstanding grant. | Durable authorization state changes; no rollback of completed effects. |
| `continue` | Operator; checks current policy/artifact/snapshot and consumes valid approval. | Applies approved patch only in isolated workspace; no original-project integration. |

Each action verifies the single GitHub owner and current project capabilities
before accessing the private proposal body. A valid execution must resolve
unambiguously to one authorized proposal. Policy, root, owner, snapshot or artifact
changes invalidate prior bindings. Approval requires visible input/output/error
TTYs and native human authentication; piping `APPROVE` or supplying JSON cannot
approve. `--json` does not replace interactive review.

Reject/revoke examples:

```sh
pnpm harness engineering reject --id EXECUTION_ID
pnpm harness engineering revoke --id EXECUTION_ID
```

Output is JSON with execution ID and status/diff/decision/application result.
Common errors include `forbidden_scope`, `policy_changed`, `snapshot_changed`,
`artifact_missing`, `approval_expired`, `human_confirmation_required`,
`lease_conflict`, `reconciliation_required` and unavailable GitHub verification.
Do not retry a potentially effected uncertain operation as though it were a
fresh action. There is no general CLI reconciliation or rollback command.

## Accepted Podman validation

<!-- cli-command: engineering validate -->
```sh
pnpm harness engineering validate --id EXECUTION_ID \
  --profile local-podman --action HOST_REGISTERED_ACTION --json
```

<!-- cli-options: validate -->
| Option | Meaning |
| --- | --- |
| `--id` | Required engineering execution ID. |
| `--profile` | Required; operational CLI accepts only `local-podman`. |
| `--action` | Required exact host-registered action ID. |
| `--json` | Accepted; validation output is already JSON. |
<!-- /cli-options -->

Requires current owner/operator authorization, permitted `sandbox.validate`, an
applied isolated snapshot, exact project/profile/action Gate C acceptance and a
**separate** native human sandbox approval via approver capability. The action
is a fixed host-selected command/image/argv/resource/network policy; a repository
script or model instruction cannot define it. `local-podman` is a CLI acceptance
selection; the underlying fixed runtime profile is `node-isolated-v1`.

The runtime transfers a bounded authorized snapshot without host source mounts,
uses the accepted pinned OCI image and network disabled, records durable evidence
and attempts verified cleanup. Validation success does not integrate a change or
prove isolation against every hostile workload. It writes private evidence/journal
state and changes the isolated container/workspace lifecycle. Never run it during
portal generation. Missing or stale acceptance returns
`validation_acceptance_pending`; policy/evidence conflicts remain blocked.
JSON contains validation evidence/classification. A non-passing completed
classification exits 2; admission or other command rejection exits 1.

## Finite supervised repair

<!-- cli-command: engineering repair -->
```sh
pnpm harness engineering repair --id EXECUTION_ID \
  --validation-id VALIDATION_ID --profile local-podman --action HOST_REGISTERED_ACTION \
  --request "Repair the failed validation while preserving the original objective" \
  --max-iterations 3 --json
```

The first invocation binds a finite repair session to failed durable validation,
owner, project, snapshot, action/profile and objective. Without a selected provider,
it creates the session without a model request. It does not authorize future
requests. If later provider use needs unknown monetary cost, include
`--allow-uncertain-cost` at session creation; this policy cannot be widened later.

<!-- cli-options: repair -->
| Option | Meaning |
| --- | --- |
| `--id` | Required engineering execution ID. |
| `--validation-id` | Required failed durable validation ID for a new session. |
| `--request` | Required original repair objective for a new session. |
| `--profile` | Required `local-podman` for a new session. |
| `--action` | Required accepted host action for a new session. |
| `--max-iterations` | Initial finite ceiling; default min(3, host limit), maximum min(8, host limit). |
| `--provider` | Explicit `fixture` or `openai` when requesting a proposal; omitted for session start/inspection advancement. |
| `--model` | Required host-selected model for OpenAI. |
| `--max-provider-requests` | Initial cumulative request ceiling; OpenAI requires explicit value. |
| `--max-output-tokens` | Explicit OpenAI per-request output ceiling, bounded by remaining policy. |
| `--max-total-tokens` | Initial finite cumulative input/output token ceiling within host limit. |
| `--max-context-bytes` | Bounded OpenAI context bytes; maximum 32768. |
| `--max-context-tokens` | Bounded OpenAI context tokens; maximum 32768 and policy input ceiling. |
| `--timeout-ms` | Initial global repair deadline; maximum min(900000, host limit). |
| `--request-timeout-ms` | Initial provider deadline; maximum min(300000, global deadline). |
| `--rates` | Optional trusted private OpenAI rate JSON; requires paired cost ceiling. |
| `--max-cost-usd` | Initial estimated cost ceiling no greater than host limit. |
| `--fixture-file` | Required target for fixture repair proposal. |
| `--fixture-content` | Required text for fixture repair proposal. |
| `--confirm-provider-call` | Required explicit potentially billable OpenAI consent. |
| `--allow-uncertain-cost` | Immutable opt-in to unknown cost; also required for OpenAI invocation. |
| `--json` | Accepted; repair output is already JSON. |
<!-- /cli-options -->

An explicitly selected OpenAI provider also requires model, request/output
budgets, paid-call consent, uncertain-cost policy and host environment credential.
Fixture rejects real-provider options and proves only offline behavior. Existing
session policy is immutable: changing the objective, profile/action, initial
validation or budgets causes rejection. The remaining iteration/request/token/
validation/file/patch/cost/time budgets are reported; reservations count against
ceilings before effects. No-progress, cancellation, limits or uncertainty stop
progress instead of granting further authority.

Each proposal stops at `AwaitingPatchApproval`. Inspect and approve it, invoke
`engineering continue`, then separately invoke `engineering validate`. Run repair
again to consume the durable result and decide whether another iteration is needed:

```sh
pnpm harness engineering repair --id EXECUTION_ID --provider fixture \
  --fixture-file hello.txt --fixture-content "Proposed repair" --json
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
pnpm harness engineering validate --id EXECUTION_ID \
  --profile local-podman --action HOST_REGISTERED_ACTION
pnpm harness engineering repair --id EXECUTION_ID --json
```

This is a supervised sequence, not a script to bypass independent human review.
The real Phase 9C end-to-end repair path remains pending verifiable acceptance;
mocked coordinator/CLI tests are not live operational evidence. Language-neutral
contracts do not provide accepted toolchains for every detected language.
Output includes session/state, remaining budgets, last validation/diagnostics,
terminal classification, `originalSourceModified: false` and `integrated: false`.
Common failures: wrong owner/project, missing failed evidence, changed immutable
policy, missing accepted profile, depleted budget and `reconciliation_required`.

<!-- cli-command: engineering repair-status -->
<!-- cli-command: engineering repair-history -->
### Repair status and history

```sh
pnpm harness engineering repair-status --id EXECUTION_ID --json
pnpm harness engineering repair-history --id EXECUTION_ID --json
```

<!-- cli-options: repair-inspect -->
| Option | Meaning |
| --- | --- |
| `--id` | Required execution ID with an existing owner/project-bound repair session. |
| `--json` | Accepted; both actions emit JSON. |
<!-- /cli-options -->

Require current owner and reader capability before private state inspection.
Status reports session, budgets, last result and terminal classification. History
reports durable transitions. Neither invokes a model, approves a change or
executes code. Provider/execution flags are rejected for these two commands.
An unavailable session or ambiguous journal state fails closed.

## Offline evaluations and private diagnostics

<!-- cli-command: eval run -->
```sh
pnpm harness eval run --suite deterministic
pnpm harness eval run --suite phase9
```

<!-- cli-options: eval-run -->
| Option | Meaning |
| --- | --- |
| `--suite` | Required `deterministic` or `phase9` host-owned fixture suite. |
<!-- /cli-options -->

Runs local deterministic fixtures, prints a JSON report and exits 0 only if all
cases pass. No real provider, GitHub login or Podman daemon is required. Fixture
runners may create temporary test state and clean it; they do not authorize
production effects or prove live acceptance.

<!-- cli-command: eval report -->
```sh
pnpm harness eval report --input PRIVATE_REPORT_FILE --baseline PRIVATE_BASELINE_FILE
```

<!-- cli-options: eval-report -->
| Option | Meaning |
| --- | --- |
| `--input` | Required private evaluation report file. |
| `--baseline` | Optional compatible private report for regression comparison. |
<!-- /cli-options -->

Reads validated bounded reports. Input must be an OS-user-owned regular,
single-link, owner-only file. Output is report/comparison JSON; incompatible
baselines, failed cases or regressions exit 1. No report file is modified.

<!-- cli-command: trace -->
<!-- cli-command: metrics -->
```sh
pnpm harness trace --input PRIVATE_TELEMETRY_FILE --id EXECUTION_ID
pnpm harness metrics --input PRIVATE_TELEMETRY_FILE --id EXECUTION_ID
```

<!-- cli-options: diagnostics -->
| Option | Meaning |
| --- | --- |
| `--input` | Required bounded private telemetry JSONL file. |
| `--id` | Required execution ID present in the input. |
<!-- /cli-options -->

Trace prints the captured execution trace; metrics summarizes captured usage,
latency and cost availability. Unknown cost stays unknown. These commands read
private files, do not resume operations and have no authority/provider/network
side effects. Invalid input/schema/permissions or absent execution fail with the
sanitized message `diagnostic command failed` and exit 1. Do not publish raw
private telemetry to make a documentation example.

## Exit statuses and cancellation

| Context | Status |
| --- | --- |
| Help/version, successful project/status/auth/lifecycle action | `0` |
| Invalid arguments, admission rejection or failure | `1` |
| Inspect completed / failed | `0` / `1` |
| Inspect or engineering workflow timeout / cancellation | `124` / `130` |
| Engineering proposal pending human approval | `2` |
| Engineering proposal proposed/completed/review pending | `0` |
| Accepted validation passed / non-passing classification | `0` / `2` |
| Repair completed / terminal failure / waiting or intermediate | `0` / `1` / `2` |
| Evaluation suite/report pass / failure or regression | `0` / `1` |

SIGINT/SIGTERM propagate an `AbortSignal` through the CLI. Cancellation does not
undo already-started effects. Auth/lifecycle/repair may report cancellation in
sanitized JSON with exit 1; do not assume every cancelled command returns 130.
Uncertain in-flight durable effects require inspection and human reconciliation;
there is no automatic replay or exactly-once guarantee.

## Source and verification

The following links pin the product baseline used for this reference. The docs
checker reads the current checkout and fails if commands or option coverage drift.

- [CLI routing and basic commands](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts)
- [Engineering parser, budgets and lifecycle](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/engineering-cli.ts)
- [Repair parser and immutable policy](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/repair-cli.ts)
- [Authentication host and actions](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/github-host.ts)
- [Native exact human approval](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/human-approval.ts)
- [Offline diagnostic commands](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/diagnostics-cli.ts)
- [CLI repair contract tests](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/__tests__/repair-cli.test.ts)
- [Phase 9C acceptance distinction](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md)
