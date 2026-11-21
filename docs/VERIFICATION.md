# Verification report — 2026-11-21

## Executed successfully

- `tsc -b --pretty false` using TypeScript 5.8.3: exit code 0.
- `node --test packages/*/dist/*.test.js apps/*/dist/*.test.js`: **7 tests passed, 0 failed**.
- `node apps/cli/dist/index.js --help`: success.
- `node apps/cli/dist/index.js init --path /tmp/ai-harness-real-smoke --name smoke`: created 7 managed files.
- `node apps/cli/dist/index.js doctor --path /tmp/ai-harness-real-smoke`: success, 15 agents, SDD workflow present.

## Environmental limitation

The sandbox did not have pnpm installed and external npm registry access failed with `EAI_AGAIN`. For local verification, global TypeScript and a locally available Node type package were used, with temporary workspace symlinks created only inside the validation environment. These validation-only `node_modules` and generated `dist` directories are **not included** in the source ZIP.

After extracting, run `pnpm install && pnpm build && pnpm test` in your development machine. The pnpm install and remote GitHub Actions workflow have not been executed here.
