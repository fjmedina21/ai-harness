# Provider, workflow and patch contracts

## Provider interface

```ts
interface ModelProviderAdapter {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
```

Requests carry system/prompt/correlation and optional signal/telemetry. Responses retain text/model and normalized reported usage; unavailable usage/cost must remain explicit. Tool-calling is an additive session contract, not a breaking replacement. Native IDs correlate to exact neutral results before continuation. Transport bounds response/request bytes and deadlines.

## Workflow contract

`TaskDefinition` contains ID/title/description, assigned role, dependencies, risk and acceptance criteria. `Agent.execute` receives host context. Orchestrator validates ordering and persists runtime checkpoints. `SupervisedEngineeringTask` explicitly leaves integration and deployment disabled.

## Patch contract

`StructuredPatch` binds execution, workspace, base revision, policy digest, patch digest and `Proposed` changes. `FileChange` carries path, create/replace/delete operation, base hash, content and result hash. Host policy separately constrains exact paths, operations, file count and bytes. No patch field can grant permission.

## Validation and repair

`ValidationProfileBinding` includes profile ID/version/digest and action ID. `NormalizedValidationResult` includes status/failure kind, sanitized diagnostics, snapshot/evidence/diagnostic digests and truncation. `RepairSession` persists immutable policy and cumulative consumed/reserved accounting. See [profile/policy reference](./validation.md) and [states](./status-codes.md).

All contracts live in `packages/contracts`. Preserve public exports and NodeNext `.js` relative imports; do not leak vendor-specific schemas into shared tool or agent interfaces.

## Source and evidence

[packages/contracts/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/index.ts), [packages/contracts/src/runtime.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/runtime.ts), [packages/contracts/src/tool-calling.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/tool-calling.ts), [packages/contracts/src/engineering.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/engineering.ts), [packages/contracts/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/repair.ts).
