# Status and error codes

States belong to different layers. Do not equate a proposal state, dispatcher state and validation classification.

## CLI exits

| Context | Codes |
| --- | --- |
| Basic commands | `0` success, `1` rejected/failed |
| Inspection | `0` completed, `1` failed, `124` timeout, `130` cancelled |
| Implement | `0` proposed/completed/review_pending, `2` approval_required, `1` failure, `124` timeout, `130` cancelled |
| Validation | `0` passed, `2` non-passed evidence, `1` rejected |
| Repair | `0` Completed, `2` waiting/intermediate, `1` terminal failure/cancel or rejected |

## Validation classifications

Normalized status: `unsupported`, `blocked`, `passed`, `failed`, `timeout`, `cancelled`, `uncertain`. Failure kind: `none`, `code`, `infrastructure`, `authorization`, `uncertain`. Only verified code diagnostics are candidates for repair.

## Repair states

Normal path: `ValidationFailed`, `RepairRequested`, `AnalyzingDiagnostics`, `RepairProposed`, `AwaitingPatchApproval`, `RepairApproved`, `ApplyingRepair`, `RepairApplied`, `AwaitingSandboxApproval`, `Revalidating`, `NextIteration`.

Terminal states: `Completed`, `Cancelled`, `BudgetExhausted`, `NoProgress`, `Blocked`, `Failed`, `ReconciliationRequired`. Exact transition rules live in `assertRepairTransition`. A terminal repair result cannot authorize integration.

Engineering states separately include `Proposed`, `Authorized`, `Applying`, `Applied`, `Validating`, `ValidationFailed`, `Repairing`, `ReviewPending`, `Completed`, `Failed`, `Cancelled`, `Uncertain`.

## Error interpretation

`policy_changed` requires a fresh proposal; `validation_acceptance_pending` requires current exact acceptance. Provider failure categories include HTTP, timeout, cancelled, invalid_response/output, usage_unknown, limit, authorization and closed. Fixed HTTP diagnostics distinguish rate_limit, quota_or_billing, authentication, permission, model_access, invalid_request and unknown. Do not log raw upstream bodies.

This is a scoped operational reference, not a claim of one stable global error enum. The CLI often emits a sanitized error sentence. Inspect the relevant contract/parser and [troubleshooting](../getting-started/troubleshooting.md) instead of matching arbitrary provider text.

## Source and evidence

[apps/cli/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts), [apps/cli/src/engineering-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/engineering-cli.ts), [apps/cli/src/repair-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/repair-cli.ts), [packages/contracts/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/repair.ts), [packages/contracts/src/engineering.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/engineering.ts), [packages/providers/src/transport.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/providers/src/transport.ts).
