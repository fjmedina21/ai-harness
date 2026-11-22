# Release readiness checklist — Phase 8

This checklist defines the evidence needed before a 0.8.0 source milestone is
considered ready. The successful local checks for the current branch are
recorded in VERIFICATION.md; remaining unchecked items require release review
or evidence tied to the final published candidate.

## Build and behavior

- [ ] `pnpm clean`, `pnpm build` and complete `pnpm test` pass on the release
  candidate commit.
- [ ] `pnpm harness --help`, `pnpm harness version` and
  `pnpm harness eval run --suite deterministic` pass.
- [ ] Offline CLI E2E covers initialization through execution, status, JSON/text
  output, repeated requests, policy denial, cancellation and timeout.
- [ ] SQLite persistence/reopen and fail-closed invalid-store coverage pass.
- [ ] Both provider adapters pass CLI integration with deterministic mocked
  HTTP; live provider smoke status is recorded separately.
- [ ] `git diff --check`, docs links, package versions and Git exclusions are
  verified.

## Security and operational limits

- [ ] Confirm the inspection command exposes only `file.read` and fixed host
  permission `files:read`.
- [ ] Confirm the default SDD CLI behavior remains compatible.
- [ ] Confirm no provider credential, prompt, file content, tool argument or
  result is written to telemetry or committed artifacts.
- [ ] Confirm request/output budgets and cancellation remain bounded.
- [ ] Confirm SQLite path permissions and operation records are reviewed without
  resume/replay.
- [ ] Record that no code writing, shell, Git mutation, deployment, automatic
  resume or privileged approval operation is enabled.

## Publication

- [ ] Hosted CI for the exact final commit passes and its URL/SHA is recorded.
- [ ] Review the candidate and known limitations before creating any tag or
  publishing packages.
- [ ] Treat `0.8.0` as a pre-1.0 source milestone, not production readiness.
- [ ] Do not publish npm packages, create a GitHub release, merge or push without
  explicit owner authorization.

This branch's checklist is a set of release gates, not evidence that those gates
have passed.
