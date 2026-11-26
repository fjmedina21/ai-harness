# Release process, migration and rollback

## Prepare a candidate

Freeze the intended source SHA. Review the [capability matrix](./capabilities.md), [known limitations](../security/limitations.md), [beta gate](./beta.md), dependency findings and all verification evidence. A green docs build cannot replace current real runtime/repair acceptance.

Run clean/build/full and focused offline suites, deterministic evaluations, CLI smokes and docs checks. Confirm current CI for the exact published candidate after separately authorized publication. Review tracked/ignored/private paths and generated artifacts before staging. No credentials, private acceptance records or journals may enter a package/artifact.

## Owner decision

The owner reviews the concrete checklist and draft notes. Only after required gates and explicit authorization should a separate change align manifests/CLI to `0.9.0-beta.1`, regenerate lock metadata if needed, rerun checks and prepare the reviewed tag/release. Phase 9D performs no push, merge, tag, package publication or release creation.

Pages is a separate decision. The dispatch-only workflow builds/checks/uploads and deploys the static artifact from main. Only the deploy job gets pages:write and id-token:write through the github-pages environment. No Pages settings are modified here.

## Migration

The existing single-developer migration is manual: stop all journal/session users; take verified consistent private backups; verify numeric owner; preserve App settings; register each exact project; remove Team policies; validate permissions/config; prepare fresh proposals for obsolete fingerprints. Never replace a private profile wholesale with a sample.

Repair v4 is opt-in and lazy. This documentation phase introduces no runtime schema migration. Read [the original migration runbook](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/single-developer-migration.md) for exact existing requirements.

## Rollback

For documentation, revert the reviewed source change and rebuild the previous static artifact. No product data migration is needed. For runtime rollback, stop users, reconcile any uncertain effects and restore a consistent verified private backup with compatible binaries/config. Never reset consumed confirmations or replay a potentially completed effect.

## Source and evidence

[docs/RELEASE-CHECKLIST.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/RELEASE-CHECKLIST.md), [docs/VERSIONING.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/VERSIONING.md), [docs/single-developer-migration.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/single-developer-migration.md), [docs/phase6-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase6-security.md).
