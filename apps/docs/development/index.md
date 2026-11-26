# Development setup, structure and conventions

Use Node 24 and the pinned pnpm 12.21.0. Install with `pnpm install --frozen-lockfile`; run `pnpm clean`, `pnpm build`, `pnpm test`. Root TypeScript project references build the runtime workspaces; VitePress is a separate static app and never becomes a runtime dependency.

## Repository structure

`packages/contracts` owns shared types; `config`/`core` own public project initialization; `agents`, `orchestrator`, `sdd` own roles/order; `providers` isolate vendor schemas; `tools`/`security` own effects and authority; `checkpointing` persists; `application` composes. `observability`/`evaluations` remain separate diagnostics. Apps are `cli` and `docs`.

## Coding conventions

Use TypeScript strict NodeNext ESM with `.js` relative imports. Source belongs in `src/*.ts`, runtime tests in `src/__tests__/*.test.ts`, compiled tests in `dist/__tests__/`. Use `node:test` and `node:assert/strict`. Preserve package `src/index.ts` exports and dependency direction. Never edit generated dist, declarations, maps or tsbuildinfo.

## Contributing

Inspect contracts, tests, policy and applicable agent instructions before changing behavior. Work on a focused feature branch, preserve local/private artifacts, and show changed files plus meaningful checks before committing. Do not use real credentials in mandatory tests. Security changes require updated threat documentation and negative tests.

Development-only notes/evidence belong in locally excluded `harness-development/`; published source/test/docs stay in their designated directories. No push, merge, release or deployment is implied by preparing a local contribution. See [documentation workflow](./documentation.md).

## Source and evidence

[tsconfig.json](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/tsconfig.json), [package.json](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/package.json), [docs/REPOSITORY.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/REPOSITORY.md), [docs/phase9c-security.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-security.md).
