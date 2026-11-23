# Release readiness checklist — Phase 8 offline closure

Version **0.8.0**. Integrated baseline: `c87d22f2de3a09eed85938c4d955a54f4f00cd7c`
(PR #3). Closure evidence below belongs to **`chore/phase8-final-closure`**, not a
published or merged result. This is a technical closure of the experimental
offline scope, not production acceptance or a formal release.

## A. Mandatory offline Phase 8 closure criteria

- [x] Inspect the actual CLI/application/orchestrator/agents/providers/dispatcher,
  security, checkpoints, observability, evaluations, exports and project references.
- [x] `pnpm clean`, `pnpm build`, `pnpm test`: **427/427** local tests passed;
  no failed, cancelled or skipped tests. The integrated baseline passed 424/424.
- [x] Focused application/CLI E2E: **18/18** passed, included in the 427 total.
  Real temporary files and local SQLite; OpenAI/Anthropic HTTP is simulated.
- [x] CLI executable smoke: init, doctor, fixture inspect JSON/text, status with
  reopened SQLite and optional telemetry passed; three sequential roles and
  three completed reads; synthetic README unchanged; temporary project removed.
- [x] CLI help/version and existing default fixture/SDD compatibility passed.
- [x] Deterministic evaluation: **19/19 scenarios, 42/42 assertions** passed.
- [x] Host-fixed `file.read` / `files:read`, Default Deny, input/response budgets,
  cancellation, timeout, HTTP errors without retry/fallback and config
  non-escalation verified. No shell, source writes, Git writes or deployment
  is exposed by inspection; no model grants or automatic recovery/replay.
- [x] Sensitive-data handling reviewed: telemetry excludes payloads/credentials;
  HTTP bodies are sanitized; task results and checkpoints remain sensitive.
- [x] Documentation, roadmap, architecture limits and Phase 9 design handoff
  updated; relative links, aligned 0.8.0 manifests and `git diff --check` verified.
- [x] Private files preserved; local exclusions retained; no generated output,
  credentials or support artifacts included in the index.
- [x] Previously integrated baseline CI verified live: `build-test` and CLI smoke
  passed for `c87d22f`, run
  [45095776893](https://github.com/fjmedina21/ai-harness/actions/runs/45095776893).

The current closure branch is locally validated. Its own CI is **not run**;
review, owner-authorized publication and standard CI for the resulting commit
remain necessary before reporting these changes as integrated.

## B. External validations and publication pending

- [ ] OpenAI: **Deferred — live provider interoperability validation**.
  Historical authorized smoke failed with HTTP 429; no successful full workflow.
- [ ] Anthropic: **Deferred — live provider interoperability validation**.
  No successful real-provider full workflow is evidenced.
- [ ] Remote Podman: **Deferred — dedicated remote infrastructure validation**.
  PR #3 preparation is integrated; no remote workflow run is recorded. Keep
  the workflow, profile checks, Podman-only backend and local isolation history.
- [ ] Package publication: not performed here; all manifests remain private;
  external npm publication status has not been independently verified.
- [ ] Formal GitHub Release/tag: not created; the release API returned no releases
  during this audit. No production release is claimed.

Deferred is not passed. Live calls, infrastructure and real isolation require
separate authorization. Their absence does not block offline Phase 8 inspection,
which executes no agent code in containers. Dedicated remote isolation and its
own risk review remain prerequisites before enabling future untrusted code.

## Closure boundary

**Implemented — offline E2E validated; external validation gates deferred**.
No API charges, real isolation, infrastructure setup, push, merge, tag, release
or package publication is part of this closure. Phase 9 remains
**Not started — design pending**. Version remains **0.8.0**.
