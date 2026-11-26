# Adding a Validation Profile

The core is language-agnostic, but operational support for each toolchain depends on authorized and validated profiles. This guide describes extension work; it does not install a new language profile or imply CLI runtime support.

## 1. Profile contract

Define a trusted `harness.dev/v1` `ValidationProfile`: metadata ID and positive version string, detection signals, toolchain versions, Podman runtime, fixed actions, resource/input/output/time limits, preprovisioned dependencies and parser ID. Register through `TrustedValidationProfileRegistry` using host-owned `authorizedProfileIds`, `executableAllowlist`, `parserIds` and `environmentAllowlist`.

## 2. Detection

Add bounded static detectors for manifest signals and validation units. Do not execute package hooks or trust a manifest as authorization. Report ambiguous/truncated discovery and require explicit host selection. Test unsafe paths, links, size limits, timeout and cancellation.

## 3. OCI image

Select a reviewed digest-pinned OCI image and provision it separately. `network: none` and `rootless: true` are contract requirements. No floating tag, implicit pull, host/socket mount or arbitrary runtime flag is admitted. Registry admission is not effective isolation acceptance.

## 4. Authorized actions

Choose recognized actions and fixed executable/argv/working-directory/environment vectors. Bind the exact profile/version/digest/action into approval. Unknown and unsupported actions remain explicit blocked/unsupported results. There is no model-supplied command string or shell expansion.

## 5. Dependencies

List image-contained or preprovisioned dependencies with versions. Assess missing, incompatible, untrusted, network-required and approval-required states before execution. No generic dependency installer or automatic network exception exists.

## 6. Security restrictions

Respect registry ceilings: CPU <=0.5, memory <=256 MiB, PIDs <=64, timeout <=10 seconds, input <=4 MiB, output <=1024 bytes and diagnostics <=32. The existing Node bridge has still narrower exact requirements. Extending a runtime bridge requires its own design/security review; a generic profile cannot invoke a new ecosystem automatically.

## 7. Result parsers

Implement a host-selected bounded parser producing normalized status/failure kind, sanitized relative paths/locations/messages, truncation and diagnostic/evidence digests. Treat raw logs as untrusted data. Distinguish code, infrastructure, authorization and uncertain failure. Repeated normalized diagnostics must support no-progress detection.

## 8. Tests

Test schema/digest stability, policy drift, detection ambiguity, missing dependencies, malformed/oversized output, parser sanitization, unsupported actions, cancellation, approval binding/replay and durable reopen/fencing. Use synthetic fixtures and mocked runtime/provider responses. Contract independence is not operational support.

## 9. Real acceptance

Obtain explicit authorization for the exact owner/project/code/runtime/image/actions and finite budgets. Verify effective restrictions and independently approved durable outcomes, including timeout/cancellation/cleanup. Exercise the real CLI path and reopen evidence in a new process. For repair, also verify failed validation, a separately approved repair patch and separately approved passing validation. Preserve private evidence and publish only a safe scoped summary.

No new operational toolchain is added in Phase 9D. .NET, Java, Python, Go, Rust and other detected ecosystems remain unaccepted unless separately implemented and verified.

## Source and evidence

[packages/contracts/src/validation-profile.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/validation-profile.ts), [packages/tools/src/project-discovery.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/project-discovery.ts), [packages/tools/src/validation-profile-registry.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/validation-profile-registry.ts), [docs/phase9c-validation-profiles.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-validation-profiles.md), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md).
