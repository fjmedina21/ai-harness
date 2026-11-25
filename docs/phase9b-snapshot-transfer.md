# Phase 9B — bounded snapshot transfer

The implemented transport captures an exact approved L2 workspace into a closed
manifest and immutable in-memory payload, then streams it through bounded stdin to
a fixed trusted Node receiver inside Podman. It uses neither archive extraction,
`podman cp`, generated Dockerfiles nor host bind mounts. Real Podman transfer
acceptance is pending; deterministic tests cannot establish runtime isolation.

## Snapshot identity and bounds

`ValidationSnapshotManifest` version 1 binds snapshot/execution/workspace IDs,
selected-source revision, policy version/digest, ordered file paths/sizes/hashes,
aggregate inventory digest, total bytes and transfer digest. Source revision is a
selected-content digest, not a Git commit or attestation over unselected files.
The resulting inventory is derived from the exact approved patch and original
base inventory; the journal's completed result digest must agree.

`captureValidationSnapshot` accepts an owned EngineeringWorkspace and explicit
host scope. It compares complete inventory before capture, verifies every file's
size/hash while reading and checks the inventory again afterward. Only regular
single-link files are admitted; existing workspace guards reject symlinks,
hardlinks, devices and executable source files. Paths use canonical relative ASCII
components, reject traversal, case aliases, reserved metadata/secrets/dependency
paths and unsupported names. There is no arbitrary directory scan or model path
authority. The same private-host TOCTOU limitations as EngineeringWorkspace remain.

| Limit | Implemented ceiling |
| --- | --- |
| Files | 256 |
| Individual file | 1 MiB |
| Total source bytes | 4 MiB |
| Encoded transport | 6 MiB |
| Container writable tmpfs | 16 MiB, `nosuid,nodev,noexec`, private |

Existing engineering policy limits can be much smaller; the transport ceiling
does not expand authorization. Payload base64 is canonical and each decoded byte
array must match manifest size/hash. Manifest keys, versions, aggregate inventory
and transfer digest are revalidated at both host and receiver boundaries.
`payload()` returns a copy; the captured manifest is frozen. Source bytes do not
enter telemetry or CLI arguments.

## Receiver and staging

The host sends one bounded JSON envelope containing the snapshot and selected
host command profile to a fixed receiver. The trusted image/executable is pinned
and the receiver is supplied by the host runtime, never by source/model content.
The receiver creates a fresh private container-internal staging directory and
regular files with exclusive no-follow writes, verifies staging inventory and
hashes, then exposes it to the selected action. No original source or workspace is
mounted into the workload. Files are sealed to 0400 and directories to 0500 after
verification, but this is not a kernel immutability boundary against the same
sandbox UID. The guarantee is pre-execution integrity and an immutable host input
capture; stronger guest immutability remains unresolved and Gate C is unpassed.

An action may modify its disposable container copy as untrusted execution. Those
effects are never copied back. Result evidence preserves the original snapshot
and transfer identities. Partial transfer, malformed data or changed inventory
fails closed. There is no automatic retry, restoration from model output or
cleanup of unrelated host resources.

See [runtime](phase9b-validation-runtime.md), [security](phase9b-security.md) and
[acceptance](phase9b-e2e.md). This transport is implemented as an experimental
restricted slice; it does not alone enable the L3 CLI or general dependency builds.
