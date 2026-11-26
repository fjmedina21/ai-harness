# Secrets management, audit and evidence

## Secret handling

Read provider keys from the host-secured environment/configuration. GitHub tokens belong in Keychain. Host profiles, HMAC keys, SQLite journals, proposal/evidence stores and telemetry remain private with restrictive file/directory permissions. Never put credentials in argv, project Markdown, examples or committed fixtures.

The CLI does not implicitly load a project's `.env`. Documentation and mandatory tests use no real credentials, auth sessions, Podman or model requests. Test verifiers/HTTP responses are synthetic; placeholders are not usable secrets.

## Audit is private by default

Durable evidence binds operation, workspace, snapshot, action/image, output digest, timings and cleanup. The journal records authority consumption and state transitions. Optional JSONL telemetry is bounded metadata and best-effort diagnostics; it cannot grant authority.

Before sharing an issue, retain the fixed error classification and a minimal sanitized reproduction. Remove source/patch content, absolute host paths, usernames, tokens and private configuration. Do not upload real journals or search indexes containing private material.

## Portal publication boundary

Only `apps/docs` content and its explicit public documentation includes enter the static site/search index. `harness-development/`, private config and evidence are not copied. The docs checker rejects private path/credential patterns and validates published source links against local files. This is a bounded review aid, not a complete secret scanner or formal attestation.

## Source and evidence

[docs/phase9-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-security.md), [docs/phase7-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase7-security.md), [docs/phase9b-snapshot-transfer.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-snapshot-transfer.md), [apps/cli/src/github-host.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/github-host.ts).
