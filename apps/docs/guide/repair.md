# Autonomous Repair — supervised finite iterations

::: warning Acceptance boundary
Repair is IMPLEMENTED and OFFLINE VERIFIED. Real end-to-end repair acceptance remains BLOCKED. Later isolation probes alone do not prove an approved failed-validation → repair → passing-validation cycle.
:::

The coordinator can analyze verified code diagnostics and propose another patch. It cannot consent, apply changes or execute validation on your behalf. The core is language-agnostic; each operational toolchain still requires an authorized validated profile.

## Start from verified failed evidence

```sh
pnpm harness engineering repair --id EXECUTION_ID   --validation-id VALIDATION_ID --profile local-podman --action ACTION   --request "Repair the failed test while preserving the objective" --max-iterations 3
```

Without a provider, this starts a finite session without a model call. If unknown-cost provider work will be needed, acknowledge it at initial creation with `--allow-uncertain-cost`; policy is immutable afterward. Real provider work additionally needs explicit OpenAI selection, model, token/request budgets and call confirmation. Those choices cannot expand host limits.

## Advance explicitly

Select fixture or OpenAI using the [actual repair options](../reference/cli.md). A new proposal stops at `AwaitingPatchApproval`. Use `engineering diff`, `approve`, then `continue`. At `AwaitingSandboxApproval`, call `engineering validate` for another independent grant. Invoke `engineering repair --id ID` to consume the resulting durable evidence and, within budget, propose the next iteration.

```sh
pnpm harness engineering repair-status --id EXECUTION_ID
pnpm harness engineering repair-history --id EXECUTION_ID
```

## Finite limits and stops

Iteration, request, token, cost, time, file/patch and validation reservations are cumulative across restarts and review delays. Unknown cost remains `null`. A reservation is made before an effect; uncertainty cannot free it for reuse. Repeated diagnostic/patch/snapshot fingerprints, reverted snapshots and cycles terminate as `NoProgress`. `BudgetExhausted` prevents another request.

Only verified code failure reaches the repair agent. Infrastructure, authorization and uncertain evidence stop progression. Restarted in-flight provider/patch/runtime effects require reconciliation. `Completed` means the verified session reached its result, not integration or deployment.

## Source and evidence

[docs/phase9c-cli.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-cli.md), [docs/phase9c-repair-policy.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-repair-policy.md), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md), [packages/application/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/application/src/repair.ts).
