# Quick Start and first workflow

Use a new disposable directory outside this repository. Replace `/ABSOLUTE/DEMO` with that directory; examples never select your home or filesystem root as a project.

## Initialize and inspect

```sh
pnpm harness init --path /ABSOLUTE/DEMO --name offline-demo --dry-run
pnpm harness init --path /ABSOLUTE/DEMO --name offline-demo
pnpm harness doctor --path /ABSOLUTE/DEMO
pnpm harness agents --path /ABSOLUTE/DEMO
```

`init` creates managed `.ai/` declarations without overwriting existing files. Dry-run prints the intended creations. `doctor` checks declarations and schema; it does not certify authentication, compiler health or isolation.

## Run the default fixture SDD

```sh
pnpm harness run --path /ABSOLUTE/DEMO --request "Review the project"
pnpm harness status --path /ABSOLUTE/DEMO --id EXECUTION_ID
```

Copy the actual execution ID from stdout. The five dependent SDD stages persist Harness execution state and produce proposal content. Stage completion does not establish real code implementation or test execution.

## Run explicit read-only inspection

Create a harmless `README.md` in the demo first, then:

```sh
pnpm harness run --workflow inspect --path /ABSOLUTE/DEMO   --request "Review API validation" --provider fixture --fixture-file README.md --json
```

Planner, code-reviewer and validator use bounded read-only file access. Fixture makes no network calls. Check `termination`, task states and operations; the `.ai/state` checkpoint is an intentional write even though project source is read-only. No tests run. A missing or disallowed fixture file must fail, never become a successful inspection.

## Next

Review the [CLI reference](../reference/cli.md) before selecting `implement`. It has different flags and effects. A fixture result is deterministic test data, not live provider acceptance.

## Source and evidence

[apps/cli/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts), [apps/cli/src/runtime-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/runtime-cli.ts), [packages/core/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/core/src/index.ts), [packages/sdd/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/sdd/src/index.ts).
