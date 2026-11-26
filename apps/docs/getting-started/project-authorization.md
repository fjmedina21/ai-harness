# First project and authorization

Initializing `.ai/` prepares public project declarations. It does **not** register that project for protected engineering. Host configuration independently registers canonical source and private workspace trees.

## Review a project entry

The owner must choose a unique project ID; canonical source, workspace, journal and artifact paths; exact file/operation policies; capabilities and allowed tools; finite provider/time/size limits; and authorized validation actions. Unknown projects, home/root scopes, overlapping unsafe trees and mismatched paths fail closed. Start with `validationActions: []` until sandbox scope has been independently accepted.

A complete project authorization fingerprint binds the proposal, approval and continuation. Changing the source, workspace, file policy, limits, owner or validation action can invalidate existing artifacts. Narrowing a CLI budget never expands the host ceiling.

## No registration command

There is no `project register` or model-facing policy editor in this CLI. A trusted host edits and validates its private registry through the existing host interfaces. `harness config` prints the public `.ai/` schema and does not expose or modify this private registry.

## First protected workflow

After host setup and login, request an exact, bounded isolated proposal using the [engineering guide](../guide/proposals.md). It must stop at pending review. Review the actual project, artifact, snapshot, diff and operation before approving. Never convert successful login into blanket authority over every registered project.

Private profiles and historical grants are not automatically migrated. Follow [migration and rollback](../releases/process.md).

## Source and evidence

[docs/project-authorization.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/project-authorization.md), [apps/cli/src/github-host.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/github-host.ts), [docs/single-developer-migration.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/single-developer-migration.md).
