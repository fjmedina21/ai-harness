# Versioning policy

AI Harness is experimental and remains before `1.0.0`. The repository uses a
single aligned version for the root CLI and all private workspace packages;
milestones do not promise production stability or independent package releases.

The workspace follows a pre-1.0 SemVer policy:

- `0.MINOR.PATCH` is the version shape until the `1.0.0` acceptance criteria
  are met.
- Increment `MINOR` for a reviewed capability or contract milestone. Breaking
  changes are allowed before `1.0.0` but must be documented as migrations.
- Increment `PATCH` for compatible fixes and documentation corrections that
  are released without a new capability milestone.
- Keep every workspace `package.json` version aligned with the root version;
  update the CLI version output in the same change.
- Do not create a release tag or publish packages until the corresponding
  changes are reviewed and their required validation has passed.
- Use `1.0.0` only after the project has approved stable public contracts,
  supported runtime profiles, security acceptance and release procedures.

The Phase 8 candidate uses workspace version `0.8.0`, a pre-1.0 capability
milestone for the bounded read-only application workflow and CLI integration.
This aligns the root, CLI and all private workspace manifests under the policy
above; it is not an npm publication or a claim of production readiness. The
published baseline remains `0.7.0` until this branch is reviewed and released.

The current code requires Node.js `>=22.0.0`; the local durable SQLite path
requires Node.js 22.13 or newer (or Node 24). CI uses Node 24. The repository
pins pnpm 12.21.0. The root scripts are `build`, `clean`, `check`, `test`,
`test:isolation`, `smoke:real-provider`, `harness` and `dev`; the default test
script builds before running Node's test runner. The real-provider smoke script
is opt-in and may incur charges.
