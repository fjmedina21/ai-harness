# Explicit project authorization

Version **0.8.0**, experimental. **Authenticated != Authorized != Approved**.
The installation has one GitHub owner and may register up to 32 local projects.
The existing private `github-auth.json.workspaces` array is the project registry;
there is no repository-selected registry, discovery or model registration tool.

Each entry requires `id`, `sourceRoot`, `workspaceDirectory`, `journalFile`,
`checkpointDirectory`, `capabilities`, `allowedToolIds`, `limits`, `policy` and
`validationActions`. OAuth configuration has no resource assignments.
All directories must exist and have canonical absolute paths. Source cannot be
HOME or a filesystem root. Private workspace/state/checkpoint trees are outside
source and use mode 0700. Profile mode is 0600, regular, single-link, owned by the
OS user, inside a canonical 0700 directory. Workspace trees cannot contain state.
Registered project trees cannot alias or nest another project's source/private trees.

`policy` reuses EngineeringPatchEngine admission, with exact relative paths
rather than new glob semantics. Its unchanged ceilings are 16 modified files and
8192 bytes, counting existing plus replacement bytes; serialized patch and diff
caps still apply. A policy can be stricter. `..`, absolute paths, reserved paths,
symlinks, hardlinks, executable inputs, secrets/dependencies and path collisions
are rejected by the existing path/file/snapshot checks. No `*` or global HOME scope
is interpreted as filesystem permission. Parent-path TOCTOU against a hostile
same-UID process remains outside the experimental boundary.

`limits` uses EngineeringBudget: maxIterations, maxRequests, maxTokens,
maxEstimatedCostUsd, timeoutMs, maxFiles and maxBytes. It reuses the workflow's
finite ceilings. Isolated CLI requests cannot exceed these host limits, select
files outside policy, introduce disallowed operations or require unlisted tools.
Explicit isolated --allowed-paths/--operations must match the registered host policy;
a narrower request is rejected rather than silently widened. Register a narrower
project policy first. Provider CLI confirmations and credential setup remain independent; login cannot
supply a model key or accept uncertain charges. Model responses cannot increase limits.

Capabilities retain the functional checks `harness:reader`, `harness:requester`,
`harness:approver` and `harness:operator`, now directly on the project. They are
capabilities of the local host, never roles assigned to another account. Reader
permits status/diff; requester permits a new proposal; approver permits a human
review/decision; operator permits continuation or requesting separately approved
validation. A capability is not an operation approval.

`allowedToolIds` lists explicit engineering tool IDs. No all-tools wildcard exists.
`validationActions` is an explicit array of SandboxValidationRegistry profiles;
empty means no sandbox action. Exact profile/image/argv/network/resource/timeout
and output bounds are validated with the existing registry. Registration does not
accept Gate C or enable the CLI. See [Podman](phase9b-validation-runtime.md).

New operational proposals carry `projectAuthorizationDigest`, included in the
HMAC-authenticated artifact and therefore the approval's artifact binding. It
covers project id, canonical roots, private directories, policy, limits, tools,
capabilities, actions and effective Personal approval policy. Lifecycle checks it
against the current private registry. A changed policy, resource, patch or owner
cannot reuse that grant. Legacy artifacts remain inspectable via storage APIs;
the CLI rejects missing fingerprints as `policy_changed`, requiring a new proposal.
It never silently enriches old approvals. See [manual migration](single-developer-migration.md).
