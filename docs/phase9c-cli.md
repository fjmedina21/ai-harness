# Phase 9C CLI

Version **0.8.0**. Repair commands use the existing trusted GitHub host configuration,
project capabilities and private journal. Credentials never enter argv. Status and
history are authenticated inspection and do not call a provider or execute code.

```sh
pnpm harness engineering repair-status --id EXECUTION_ID
pnpm harness engineering repair-history --id EXECUTION_ID
```

Start a finite repair session from verified failed evidence without calling a provider:

```sh
pnpm harness engineering repair --id EXECUTION_ID \
  --validation-id VALIDATION_ID --profile local-podman --action test \
  --request "Preserve the original objective and repair the failed test" \
  --max-iterations 3
```

If subsequent provider use may have unknown monetary cost, include
`--allow-uncertain-cost` when creating the session. This opt-in is immutable and
does not itself authorize a provider call. Omitting it permits only known-cost
requests under the stored ceiling; it cannot be enabled during continuation.

Advance with an explicitly selected provider. For OpenAI, additionally supply
`--provider openai --model HOST_SELECTED_MODEL --confirm-provider-call
--allow-uncertain-cost --max-provider-requests N --max-output-tokens N`.
Registered project ceilings still apply. `--max-total-tokens`, `--timeout-ms` and
`--request-timeout-ms` can narrow the initial finite policy. Optional trusted
`--rates` and `--max-cost-usd` must be supplied together. A fixture provider uses
`--provider fixture --fixture-file RELATIVE_FILE --fixture-content TEXT` and
never represents a paid or live provider integration.

Advance the same session with `engineering repair --id EXECUTION_ID`.
The initial request must identify the failed validation, registered action/profile,
original bounded objective and finite iteration ceiling. A real provider requires
explicit host model selection, provider-call consent and token/request/cost policy,
using the same engineering controls as proposal generation. Missing authorization
blocks before a paid call; existing sessions retain their immutable policy.

Repair stops at a pending patch. Use existing `engineering diff`, `approve` and
`continue` for exact Personal L2 review and isolated application. Then use existing
`engineering validate --id EXECUTION_ID --profile local-podman --action ACTION` for
a separately reviewed accepted sandbox execution. Invoke repair again to inspect
the new durable result or propose the next finite iteration.

Status reports project/owner, current iteration and state, profile/action,
validation and diagnostic references, pending proposal/approval, cumulative usage,
remaining budget and terminal classification. History preserves durable transitions.
No --auto-approve, --yes, --skip-review or automatic integration flag exists.
The real local path passed [scoped acceptance on 2026-11-27](phase9c1-live-acceptance.md). New executions still require fresh exact acceptance and authorization.
