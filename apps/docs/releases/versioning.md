# Versioning and compatibility

The local candidate version is **0.9.0-beta.1** across workspace manifests and CLI. No tag or release has been created. The live acceptance baseline was **0.8.0**; candidate tests, unchanged runtime fingerprints and exact candidate CI are tracked separately. Publication remains a separate owner decision.

## Semantic Versioning

MAJOR communicates incompatible stable public API changes; MINOR adds compatible functionality after 1.0; PATCH fixes compatible behavior. Before 1.0, this repository uses reviewed minor capability/contract milestones and patch fixes, documenting every breaking migration. `0.x` remains experimental and does not promise stable production contracts.

A prerelease suffix such as `-beta.1` marks an unstable candidate below the corresponding normal `0.9.0`. Increment it only for an intentionally reviewed subsequent candidate. Never infer a release from a changelog heading or a merged milestone.

## Compatibility matrix

| Area | Current boundary |
| --- | --- |
| Runtime | Node >=22 declared; SQLite needs 22.13+; Node 24 verified path |
| Package manager | pnpm 12.21.0 pinned |
| Public project schema | Version 1, file storage declarations |
| Durable journal | v3 operations; explicit repair lazily adds v4 |
| Operational identity | One GitHub App owner; Personal native review requires macOS |
| Runtime validation | Exact accepted rootless local Podman fixed Node actions |
| Providers | Fixture/OpenAI engineering; Anthropic inspection; no universal provider parity |

## Breaking changes and migration

The earlier Docker removal and single-owner/Personal host-policy migration are internal milestones, not new changes introduced by the docs portal. Old Team grants are archival, not executable. New fingerprint-bearing artifacts fail strict admission in older binaries. Use the [migration/rollback process](./process.md) and keep consistent private backups; never downgrade a live journal in place.

## Source and evidence

[docs/VERSIONING.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/VERSIONING.md), [docs/single-developer-migration.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/single-developer-migration.md), [docs/phase5-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase5-security.md), [docs/phase9c-state-machine.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-state-machine.md).
