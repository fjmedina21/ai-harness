# CLI and working with projects

The CLI is the trusted local composition entry point. Read [the full command reference](../reference/cli.md) for exact options; `--help` displays global help even when supplied to a subcommand.

## Public versus protected state

`init`, `doctor`, `agents`, `config`, default `run` and `status` operate on initialized project declarations and checkpoints. Public schema permission labels do not enable privileged handlers.

`auth` manages the protected GitHub session. `run --workflow implement --autonomy isolated` and `engineering` use host-owned project registration, private artifacts and durable state. Engineering output is JSON even when `--json` is omitted. Authentication errors must be resolved before private artifact inspection.

## Keep scopes explicit

Use `--path` on project commands and the actual `--id` on lifecycle commands. Never reuse a sample ID as authority. Protected commands derive paths from host registration instead of trusting arbitrary per-command filesystem flags.

`status` inspects normal workflow checkpoints. `engineering status` inspects protected proposal operations. `engineering repair-status` inspects the repair session. They are different objects and cannot substitute for one another.

No command integrates a change into the original repository, commits Git changes or deploys software. An applied isolated patch still needs a separate manual integration decision outside the current runtime.

## Source and evidence

[apps/cli/src/index.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/index.ts), [apps/cli/src/engineering-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/engineering-cli.ts), [apps/cli/src/repair-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/repair-cli.ts).
