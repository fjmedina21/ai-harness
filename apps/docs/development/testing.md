# Testing, fixtures and deterministic evaluations

## Runtime checks

```sh
pnpm clean
pnpm build
pnpm test
pnpm test:github-auth
pnpm test:personal-approval
pnpm test:phase9b
pnpm test:phase9c
pnpm harness eval run --suite deterministic
pnpm harness eval run --suite phase9
pnpm harness --help
pnpm harness version
git diff --check
```

The full test script builds and runs `packages/*/dist/__tests__/*.test.js` plus `apps/*/dist/__tests__/*.test.js`. Focused scripts are subsets, not additional distinct acceptance counts. Inspect stdout/exit code; a mocked native verifier or Podman runner is not live authentication/isolation.

## Fixture discipline

Use host-authored harmless fixtures, mocked HTTP and synthetic identity/presence/runtime adapters. Temporary FS/SQLite and independent-process tests can verify integrity, CAS, fencing and crash handling without real credentials. Never capture a real user's token, private journal or source as a public fixture.

Generated manual fixtures/evidence stay under `harness-development/`. Product tests create bounded disposable fixtures at runtime and clean them according to existing test conventions.

## Evaluation scope

`deterministic` and `phase9` are separate offline suites. Reports describe known scenarios, not arbitrary language support or production correctness. Provider smokes and `test:phase9b-podman`/`test:isolation` are opt-in real operations requiring separate exact authorization; they do not run in docs CI.

## Documentation checks

`pnpm docs:check` builds, checks static routes/assets/anchors/source paths/navigation and CLI parser coverage, then runs negative checker tests. Browser review separately checks local search, themes, responsive behavior and keyboard access. Passing static checks alone is not visual or formal WCAG acceptance.

## Source and evidence

[package.json](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/package.json), [packages/evaluations/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/evaluations/src/index.ts), [docs/phase7-evaluations.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase7-evaluations.md), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md).
