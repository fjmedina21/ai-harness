# Engineering proposals and reviewing changes

An engineering request becomes a bounded `StructuredPatch`, never executable model policy. Select exact files and operations, then inspect the generated diff and advisory review.

## Fixture proposal example

Use an initialized disposable project containing `README.md`:

```sh
pnpm harness run --workflow implement --autonomy propose   --path /ABSOLUTE/DEMO --request "Update the demo readme" --provider fixture   --files README.md --fixture-file README.md --fixture-content "Demo content" --json
```

The fixture recipe proposes the selected change without real model calls. Propose mode does not create an isolated workspace/journal. It is useful for learning the envelope, not proving an AI-generated repair.

## Isolated proposals

`--autonomy isolated` additionally needs explicit `--authorize-workspace`, private workspace/journal/checkpoint paths outside the source project and a matching host registry. Use the [reference](../reference/cli.md) and [configuration](../reference/configuration.md) to prepare these deliberately. Do not run isolated operations against arbitrary projects while generating documentation.

## Review checklist

Read the exact owner/project, source revision, file operations, base/result hashes, patch and policy digests, workspace snapshot, limits, challenge and expiry. Check scope and meaning of every change. Advisory reviewer output does not replace your own review or executed tests.

A changed source, snapshot or policy invalidates the proposal binding. Prepare fresh artifacts rather than editing a durable proposal or reactivating an old grant. Review output escapes control/bidirectional characters to preserve exactness.

## Source and evidence

[apps/cli/src/engineering-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/engineering-cli.ts), [packages/contracts/src/engineering.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/contracts/src/engineering.ts), [packages/tools/src/engineering-patches.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/packages/tools/src/engineering-patches.ts), [docs/phase9-patch-engine.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9-patch-engine.md).
