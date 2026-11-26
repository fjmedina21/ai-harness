# Validation profiles and repair policies

## ValidationProfile

The `harness.dev/v1` `ValidationProfile` contains metadata ID/version, detection signals, toolchains, pinned Podman runtime, fixed action vectors, environment, resource/transfer/output/time limits, dependencies and parser ID. `TrustedValidationProfileRegistry` takes trusted host authorization catalogs; repository manifests never register executables.

Actions are `syntax-check`, `lint`, `type-check`, `build`, `test`, `integration-test`, `static-analysis`. Being a recognized action name does not mean an operational profile implements it. `resolveAction` reports unsupported or blocked explicitly.

Dependency states are `available`, `prepared`, `missing`, `incompatible`, `untrusted`, `requires_network`, `requires_approval`. No universal installer exists. The current runtime bridge remains fixed `node-isolated-v1`, not every declaratively admitted profile.

## RepairPolicy

| Group | Host-selected fields |
| --- | --- |
| Iteration / provider | `maxIterations`, `maxProviderRequests`, `maxInputTokens`, `maxOutputTokens` |
| Deadlines | `maxGlobalMs`, `maxProviderMs`, `maxValidationMs` |
| Effects / bytes | `maxValidations`, `maxFiles`, `maxPatchBytes` |
| Cost | `maxEstimatedCostUsd`, explicit `allowUnknownCost` |
| Mandatory invariants | `requireHumanApprovalForEachPatch`, `requireSeparateSandboxApproval`, `stopOnUncertainState`, `stopOnNoProgress`: all `true` |

Policy version is 1 and enabled is explicit. Its digest is immutable during a session. Consumed/reserved counters survive restart and review delays. Unknown monetary accounting is `null`; explicit unknown-cost policy is not an exact money cap. CLI budgets can only narrow host limits.

See [Adding a Validation Profile](../development/validation-profile.md) for admission, parser tests and real acceptance requirements.

## Source and evidence

[packages/contracts/src/validation-profile.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/validation-profile.ts), [packages/contracts/src/repair.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/repair.ts), [packages/tools/src/validation-profile-registry.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/validation-profile-registry.ts), [docs/phase9c-repair-policy.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-repair-policy.md).
