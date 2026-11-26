# AI Harness

**Local-First AI Software Engineering Harness** — **0.8.0**, experimental.
Single developer, one GitHub identity, explicit project authorization and mandatory
human-confirmed Personal L2. Not production-ready autonomous execution.

## Documentation

The VitePress portal lives in [`apps/docs`](apps/docs/). Start locally:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm docs:dev
```

Open the printed `/ai-harness/` URL. [Getting Started](apps/docs/getting-started/index.md),
[User Guide](apps/docs/guide/cli.md), [Architecture](apps/docs/architecture/index.md),
[Security](apps/docs/security/index.md), [CLI Reference](apps/docs/reference/cli.md),
[Development](apps/docs/development/index.md) and
[Capability Status](apps/docs/releases/capabilities.md) cover current behavior.
The portal is prepared for project GitHub Pages but **has not been deployed**.

## Try the offline workflow

Requirements: Node >=22; SQLite needs 22.13+; Node 24 is the verified path.
pnpm **12.21.0** is pinned. Use a disposable project:

```sh
pnpm harness --help
pnpm harness init --path /ABSOLUTE/DEMO --name offline-demo
pnpm harness run --path /ABSOLUTE/DEMO --request "Review the project"
pnpm harness status --path /ABSOLUTE/DEMO --id EXECUTION_ID
pnpm test
pnpm docs:check
```

Default `run` uses fixture-backed SDD proposals. Explicit inspection is source-read-only
but persists Harness checkpoints; role completion does not prove executed tests.
Real provider calls require host credentials, model, finite budgets and explicit consent.
No project `.env` is implicitly loaded.

## Capability boundaries

- Role-based sequential orchestration and provider-neutral contracts; OpenAI/Anthropic
  adapter wire formats stay separate from agents/tools. Engineering CLI selects
  fixture/OpenAI; Anthropic engineering remains deferred.
- Host registry/dispatcher, Default Deny, exact native Personal patch approval,
  isolated private-copy application and independent sandbox intent.
- Durable SQLite CAS/fencing, single-use grants and conservative recovery; no
  automatic replay of unknown effects or exactly-once promise.
- Restricted local fixed-Node Podman Gate C has historical scoped live evidence;
  current code/project/runtime acceptance must revalidate and expires. Dedicated
  remote isolation remains deferred.
- Language-neutral discovery/profiles/diagnostics and finite repair are implemented
  and offline verified. **Real Phase 9C repair E2E remains BLOCKED.** Manifest detection
  does not promise operational support for every toolchain.
- No automatic original-source integration, Git writes, deployment or multiuser mode.

## Evidence and release preparation

[Verification](docs/VERIFICATION.md), [Phase 9D results](docs/phase9d-verification.md),
[roadmap](docs/ROADMAP.md), [security limitations](apps/docs/security/limitations.md),
[changelog](CHANGELOG.md), [beta checklist](docs/releases/beta-release-checklist.md)
and [draft notes](docs/releases/v0.9.0-beta.1-draft.md) separate implementation,
offline tests and scoped real acceptance. **Beta is BLOCKED**; no version bump,
tag, release or publication is included.

Historical technical/evidence documents remain in [`docs/`](docs/), indexed and
classified in the [source audit](apps/docs/releases/sources.md). Existing runbooks:
[GitHub setup](docs/phase9-github-app-setup.md),
[project policy](docs/project-authorization.md), [Personal L2](docs/phase9-personal-mode.md),
[Podman](docs/phase9b-validation-runtime.md), [repair acceptance](docs/phase9c-e2e.md),
[migration](docs/single-developer-migration.md),
[dedicated remote runner](docs/DEDICATED-PODMAN-RUNNER.md).
