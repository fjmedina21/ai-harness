# Trusted validation profiles

A versioned host-owned declarative profile describes detection signals, toolchains,
pinned OCI image, fixed executable and argument vector, working directory,
environment allowlist, resources, network policy, dependencies, transfer/output
limits, timeout and a host-selected result parser. A stable configuration digest
binds selection and approval; changing a relevant field invalidates the binding.

The registry validates schema/version, image digest, actions and ceilings. Unknown,
unauthorized and ambiguous profiles fail closed. Actions are abstract: syntax-check,
lint, type-check, build, test, integration-test and static-analysis. Unsupported is
an explicit result and never a pass. Parsers belong to adapters, not the repair
coordinator. Diagnostics contain bounded sanitized messages, relative paths,
severity/location/code, evidence digest and truncation metadata.

Dependency preparation reports Available, Prepared, Missing, Incompatible,
Untrusted, RequiresNetwork or RequiresApproval. Missing preprovisioned dependencies
block execution with a concrete cause. There is no universal installer, automatic
image pull, host toolchain installation or implicit network exception.

The accepted `node-isolated-v1` implementation remains restricted to its exact fixed
Node runtime. Generic profile admission is not live acceptance for another language.
Synthetic profiles demonstrate reusable contracts only. No shell, host/socket mount,
privileged runtime or free-form model argv is introduced. Real native toolchains
need their own authorized integration and isolation acceptance.


## Contract example — non-executable documentation

The following uses placeholders and is deliberately not registered:

```yaml
apiVersion: harness.dev/v1
kind: ValidationProfile
metadata: { id: example-toolchain, version: "1" }
detectionSignals: [example-manifest]
toolchains: [{ id: example-tool, version: "1" }]
runtime:
  type: podman
  image: registry.example/toolchain@sha256:VERIFIED_DIGEST_REQUIRED
  network: none
  rootless: true
actions:
  - id: test
    action: test
    executable: /usr/local/bin/example-test
    args: [test]
    workingDirectory: ""
    environment: {}
limits:
  cpu: 0.5
  memoryBytes: 268435456
  pids: 64
  timeoutMs: 10000
  maxInputBytes: 4194304
  maxOutputBytes: 1024
  maxDiagnostics: 16
dependencies: []
resultParser: example-parser-v1
```

`TrustedValidationProfileRegistry.register` admits only trusted host input;
`resolve` detects compatibility/ambiguity, `bind` records the stable profile/action
binding and `verifyBinding` rejects drift. `resolveAction` distinguishes unsupported
and blocked actions. `nodeAction` bridges only the existing fixed Node profile;
other executable ecosystems remain unaccepted. `normalizeValidationResult` calls
only a registered host parser and returns bounded language-neutral diagnostics.


The default closed parser and current accepted-runtime bridge deliberately produce
a coarse generic diagnostic. Repair never interprets raw logs as instructions.
A repeated normalized diagnostic digest terminates as NoProgress even when unrelated
raw output changes. Rich compiler/test diagnostics require a separately trusted,
bounded parser adapter and its own validation; no universal parser or language
support is claimed by the generic contracts. The core evidence contract permits
host-defined runtime profile names and explicit unsupported outcomes without changing
the accepted fixed Node runtime.
