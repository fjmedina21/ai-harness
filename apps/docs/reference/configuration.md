# Configuration reference

## Public project declarations

`harness init` creates managed `.ai/` declarations. `harness config --path DIR` prints validated public configuration. The schema is `HarnessConfig` with `schemaVersion: 1`:

| Field | Accepted value / meaning |
| --- | --- |
| `project` | Nonempty `name`, `kind: fullstack` |
| `autonomy.mode` | `supervised` or `manual`; not blanket execution authority |
| `security.defaultDeny` | Must be `true` |
| `security.grantedPermissions` | Unique typed permission names |
| `security.requireApprovalFor` | Unique typed permissions requiring approval |
| `agents.enabled` | Known unique roles from `AGENT_ROLES` |
| `workflows.default` | Nonempty workflow name |
| `storage.mode` | `files` for this public schema |

Permissions are `files:read`, `files:write`, `shell:execute`, `git:write`, `deployment:execute`. Their presence in a type or config never enables unrestricted handlers. Defaults grant read and require approval for privileged labels.

## Private operational host configuration

The separate trusted GitHub host file selects `ownerAccountId`, App authentication settings, private paths, exact Personal policy and registered projects/capabilities/limits/validation actions. Durable SQLite is selected through explicit host integration, not by changing public `storage.mode` to an invented value. Private config requires owner-only file/parent admission; see the original [host runbook](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/project-authorization.md).

Omitting the optional approval object selects Personal; Team policies and contradictory fields are rejected. Do not copy broad sample policies into a real registry. Host configuration never comes from a model response.

## Provider and runtime configuration

Provider model/keys, rates, request/output/context/time ceilings and allowed paths are explicit host/CLI settings. Isolated scope must match project registration. Podman selects an existing private accepted profile; no automatic image pull, machine setup or network exception exists. [CLI](./cli.md) lists actual knobs and combinations.

## Source and evidence

[packages/config/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/config/src/index.ts), [apps/cli/src/github-host.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/github-host.ts), [docs/project-authorization.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/project-authorization.md), [docs/phase9-personal-mode.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-personal-mode.md).
