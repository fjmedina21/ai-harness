# Authentication setup

GitHub authentication verifies **one numeric installation owner**, using GitHub App OAuth and PKCE with online verification. It grants no project, file or execution permission.

## Host preparation

The host administrator prepares a private configuration with the intended `ownerAccountId`, App client settings, expected endpoints/callback and private storage. Tokens belong in macOS Keychain, never in project Markdown, CLI argv or committed JSON. Use the existing [GitHub App setup runbook](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-github-app-setup.md); do not replace a real host profile with a documentation example.

## Explicit identity commands

```sh
pnpm harness auth login
pnpm harness auth whoami
pnpm harness auth status
```

Login opens the configured browser flow and creates a protected session. `whoami` and `status` verify identity online and may maintain a session; they are not purely offline reads. `refresh` updates credentials. `logout` removes local credentials and reports remote refresh revocation limitations. These are deliberate user operations, never documentation-build steps.

## Fail-closed behavior

Missing/unsafe host configuration, offline identity verification, a different owner or denied Keychain access prevents protected operations. Do not supply `--token`, `--username` or a fake approval receipt to bypass verification. Read the returned fixed diagnostic and repair host configuration separately from project files. See [secrets](../security/secrets.md) and [troubleshooting](./troubleshooting.md).

## Source and evidence

[apps/cli/src/github-host.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/github-host.ts), [packages/security/src/github-auth.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/security/src/github-auth.ts), [docs/phase9-github-authentication.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-github-authentication.md).
