# Prerequisites and installation

## Runtime requirements

Use Node.js **24** for the verified development/CI path and pnpm **12.21.0**, pinned in root `packageManager`. Package engines declare Node >=22; durable `node:sqlite` needs **22.13+** or Node 24. A successful build on one Node release is not a compatibility test for every allowed version.

The offline workflow needs Git, dependencies and a writable disposable project. Protected Personal L2 additionally requires macOS, native LocalAuthentication, Keychain, a configured GitHub App and the registered installation owner. Podman validation additionally needs an independently provisioned rootless Machine, a pre-pulled digest-pinned image and exact accepted host profile. Installation does not provision those capabilities.

## Install from a reviewed checkout

```sh
git clone https://github.com/fjmedina21/ai-harness.git
cd ai-harness
pnpm install --frozen-lockfile
pnpm build
pnpm harness version
pnpm harness --help
```

The current version output is `ai-harness 0.8.0 (experimental)`. This repository has no published beta package installation procedure. Pin a reviewed commit for reproducible use rather than treating the moving default branch as a release.

Dependencies need network access during initial installation. Subsequent code/docs builds use local dependencies and do not contact an AI provider or require runtime credentials. Only esbuild's installation script is explicitly admitted for VitePress; do not approve all dependency scripts.

## Documentation locally

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm docs:check
```

Open the printed URL under `/ai-harness/`. The output is static HTML/CSS/JS in `apps/docs/.vitepress/dist/`. Reading it needs no backend or account. Preview binds to loopback by default.

## Source and evidence

[package.json](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/package.json), [pnpm-workspace.yaml](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/pnpm-workspace.yaml), [docs/VERSIONING.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/VERSIONING.md).
