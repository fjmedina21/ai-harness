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

The current workspace version is `0.5.0`, the pre-1.0 milestone following
Phase 5. The package manifests are private; this number identifies the source
tree and CLI build, not an npm publication.
