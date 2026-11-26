# Project discovery and validation profiles

Project Discovery reads an explicit bounded authorized selection without executing manifests, package hooks or project code. It reports signals, units, ambiguity, inspected counts and incomplete coverage. Unsafe paths, links and manifest limits cannot silently become successful complete discovery.

## Language-neutral core

Manifest signals can describe several ecosystems. A detected language is data, not a registered executable profile. The host selects a `ValidationProfile` from its trusted registry and resolves an authorized action. Missing, ambiguous, unknown or incompatible scope fails closed.

The profile binds version, fixed OCI image/executable/argv, working directory, environment allowlist, resources, network policy, dependencies, parser and output/time limits. A stable digest ties that selection to the action and human approval.

## Dependencies and normalized diagnostics

Dependencies are image-contained or preprovisioned. Assessment can report available, prepared, missing, incompatible, untrusted, requires-network or requires-approval. The registry does not install packages, pull images or enable network.

A host parser returns bounded normalized status/failure kind, sanitized relative diagnostic paths/messages, digests and truncation. Unsupported is explicit. Current closed Node parsing is coarse; a changed raw log alone need not represent diagnostic progress.

**The core is language-agnostic, but operational support for each toolchain depends on authorized and validated profiles.** The existing `nodeAction()` bridge remains fixed Node-only. See [Adding a Validation Profile](../development/validation-profile.md).

## Source and evidence

[packages/contracts/src/validation-profile.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/validation-profile.ts), [packages/tools/src/project-discovery.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/project-discovery.ts), [packages/tools/src/validation-profile-registry.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/validation-profile-registry.ts), [docs/phase9c-validation-profiles.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-validation-profiles.md).
