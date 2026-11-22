# Verification report — Phase 4, 2026-11-21

## Local environment and baseline

Node 24.18.0; pnpm 12.21.0; TypeScript 5.8.3. Working branch:
`feat/phase4-provider-tool-calling`, based on `main` at `a43fd47` after fetching
and fast-forward synchronization with origin. The original 128 tests passed
before implementation; no existing tests were removed or rewritten.

## Executed checks

- `pnpm build`: exit 0.
- `pnpm test`: **198 passed, 0 failed, 0 cancelled, 0 skipped**.
- `pnpm harness --help` and `pnpm harness version`: smoke checks.
- `git diff --check`: no whitespace errors.
- `git status --short`: only intended source/test/documentation changes.
- `git diff --cached --name-only`: empty; no generated files staged.
- Local development documents remain outside the Git index and locally excluded.

## Added coverage: 70 tests

- 22 neutral continuation/session tests: identity isolation, exact result-batch
  correlation, invalid/duplicate/foreign/missing IDs, lifecycle, cancellation,
  memory/turn/call ceilings, immutable snapshots and backward compatibility.
- 24 native adapter conformance tests (12 per provider): wire schemas/names,
  multi-call/multi-turn native continuation, opaque OpenAI reasoning replay,
  Anthropic assistant/result grouping, rejection of malformed/truncated/refused
  responses, fixed configuration, memory limits, concurrency, cancellation and
  isolated simultaneous tasks.
- 10 HTTP transport tests: request/streamed response limits, deceptive lengths,
  UTF-8/JSON failures, sanitized HTTP/network errors, no retries, deadlines during
  fetch/body reads, abort and cleanup of late responses.
- 14 agent integration tests (7 per provider): real temporary file reads and Git
  status through the dispatcher, denied/pending policy, invalid schemas,
  restricted files, unavailable privileged tools and cancellation after a tool
  has already run. Sessions close on success and error paths.

Provider HTTP is mocked; fixtures use only explicit `test-only` credentials.
Integration filesystem/Git operations use temporary directories. The CLI/SDD
fixture workflow remains covered by the original regression suite.

## Evidence boundaries

No live OpenAI or Anthropic call was executed, and no real credential was used
for tests. Protocol fixtures and official documentation review do not prove
live API/model compatibility. CI was not run remotely because these changes
have not been committed/pushed or published. No new dependency was introduced.

No production filesystem sandbox, real Docker isolation, durable native session,
authenticated result provenance, transactional approval/audit, automatic resume
or exactly-once guarantee was established. See [Phase 4 security](phase4-security.md).
