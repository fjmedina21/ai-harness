# Release readiness checklist — Phase 8

This checklist records Phase 8 acceptance evidence for source version 0.8.0 on
`main` at `d9ecbf49597c5c22784257d519a6a217c2c9e73f`. It is an experimental
source milestone, not a formal release announcement. The GitHub releases
endpoint has no release record; npm publication was not independently
verified. Evidence is split between local validation, standard hosted CI, and
separately authorized checks.

## Build and behavior

- [x] `pnpm clean`, `pnpm build` and complete `pnpm test` pass locally on the
  finalization branch; 421/421 tests passed. The integrated `main` baseline
  had 417/417 before the diagnostics follow-up.
- [x] `pnpm harness --help`, `pnpm harness version` and
  `pnpm harness eval run --suite deterministic` pass; 19 scenarios and 42
  assertions passed.
- [x] Offline CLI E2E covers initialization through execution, status, JSON/text
  output, repeated requests, policy denial, cancellation and timeout.
- [x] SQLite persistence/reopen and fail-closed invalid-store coverage pass
  against the real local backend.
- [x] Both provider adapters pass CLI integration with deterministic mocked
  HTTP. A live OpenAI smoke was attempted but failed with HTTP 429 before any
  read; live-provider validation is not achieved. See `docs/VERIFICATION.md`.
- [x] `git diff --check`, relative docs links, workspace package versions and
  local Git exclusions were verified.

## Security and operational limits

- [x] Confirm the inspection command exposes only `file.read` and fixed host
  permission `files:read`.
- [x] Confirm the default SDD CLI behavior remains compatible.
- [x] Confirm no provider credential, prompt, file content, tool argument or
  result is written to telemetry or committed artifacts.
- [x] Confirm request/output budgets and cancellation remain bounded.
- [x] Confirm SQLite path permissions and operation records are reviewed without
  resume/replay.
- [x] Record that no code writing, shell, Git mutation, deployment, automatic
  resume or privileged approval operation is enabled.

## Publication

- [x] Standard hosted CI for the exact source commit passed: run
  [45076334502](https://github.com/fjmedina21/ai-harness/actions/runs/45076334502),
  SHA `d9ecbf49597c5c22784257d519a6a217c2c9e73f`.
- [ ] Complete release review before creating any tag or publishing packages.
- [x] Treat `0.8.0` as a pre-1.0 source milestone, not production readiness.
- [x] Do not publish npm packages, create a GitHub release, merge or push without
  explicit owner authorization.

## Separate validation gates

- [ ] Live OpenAI smoke passed. An authorized attempt using `gpt-6-luna` and a
  synthetic fixture failed with HTTP 429 before any file read; the cause was
  not resolved and the smoke is not validated. See `docs/VERIFICATION.md`.
- [ ] Live Anthropic smoke: requires the same explicit authorization and
  host-supplied bounded inputs.
- [ ] Real Podman isolation: not rerun for Phase 8 because its controls were not
  changed; local prior-phase evidence does not establish remote isolation.
- [ ] Formal GitHub release: none found. npm publication: not independently
  verified. Neither is part of this source-validation task.

The checkboxes above record evidence on the integrated source commit. These
remaining gates are separate from standard CI and must not be represented as
passed by mocks or local deterministic tests.
