# AI Harness

Local-first, provider-agnostic TypeScript harness for role-based software tasks.
Phases 1–4 are **experimental foundations**, not production-ready autonomous execution.

## Requirements and verification

- Node.js >= 22 (development and CI: Node 24).
- pnpm **12.21.0**, pinned in `package.json`.

```bash
pnpm install
pnpm build
pnpm test
pnpm harness --help
```

## Implemented

- Versioned project configuration, safe initialization, 15 agent roles.
- Sequential dependency-aware orchestration, five-stage SDD proposals, JSON checkpoints.
- Default Deny tool dispatch, argument validation and scoped in-memory approvals.
- Bounded tool-calling agent, conservative recovery inspection and restricted handlers.
- OpenAI Responses and Anthropic Messages tool-calling adapters with isolated,
  explicitly closed sessions, native ID correlation and bounded HTTP transport.
- Explicit host API `createReadOnlyToolCallingAgent()` exposing `file.read` and,
  only with a host-selected executable, `git.status`.

The default CLI `run` continues to use the fixture provider and text-only SDD;
it does not automatically execute model tools. Real-provider tool calling is
programmatic and opt-in. See [Phase 4 usage and security](docs/phase4-security.md).
No privileged handlers are registered by the read-only factory.

## Package layout

`packages/contracts`, `config`, `core`, `orchestrator`, `providers`, `agents`,
`sdd`, `security`, `checkpointing`, `tools`; executable commands in `apps/cli`.
TypeScript strict / NodeNext ESM, project references and `node:test`.

## Current limits

No automatic resume, durable exactly-once execution, arbitrary shell, Git-writing
or deployment integration. Filesystem guards have TOCTOU limitations; approvals
are in-memory; Docker isolation has only mock-runner verification. Tool outputs
and model content remain untrusted. Unit tests do not establish production safety.

[Roadmap](docs/ROADMAP.md) · [Verification](docs/VERIFICATION.md) ·
[Phase 2 security](docs/phase2-security.md) · [Phase 3 security](docs/phase3-security.md) ·
[Continuation contract](docs/phase4-security.md#continuation-contract)
