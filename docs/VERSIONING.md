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

The Phase 8 source milestone uses workspace version `0.8.0`, a pre-1.0 capability
milestone for the bounded read-only application workflow and CLI integration.
This aligns the root, CLI and all private workspace manifests under the policy
above; it is not a claim of production readiness. The source on `main` is now
`0.8.0`. The GitHub releases endpoint returned no release; npm publication was
not independently verified. Both remain separate release actions.

The current code requires Node.js `>=22.0.0`; the local durable SQLite path
requires Node.js 22.13 or newer (or Node 24). CI uses Node 24. The repository
pins pnpm 12.21.0. The root scripts are `build`, `clean`, `check`, `test`,
`test:isolation`, `smoke:real-provider`, `harness` and `dev`; the default test
script builds before running Node's test runner. The real-provider smoke script
is opt-in and may incur charges.

The final Phase 8 closure deliberately retains **0.8.0** across every manifest
and the CLI; it is not a new release or an automatic patch/minor bump. The
integrated starting point is `c87d22f` (PR #3); closure checks on
`chore/phase8-final-closure` remain local until separately authorized publication.
No npm publication, tag or GitHub Release is created. External provider and
remote infrastructure gates are deferred, not approved. At that closure Phase 9 remained design pending; current feature-branch status is
[partial experimental implementation](phase9-autonomy-levels.md), retaining 0.8.0.


Phase 9 development retains **0.8.0** across all manifests and CLI. Do not bump
0.9.0 based solely on patch generation, fixture repair or passing offline tests.
Reassess a coherent milestone only after explicit release acceptance, truthful
level gates and required current real isolation/evidence. No tag, push, merge,
GitHub Release or 1.0.0 is authorized by this source work.


Phase 9A OpenAI-only integration closure retains 0.8.0. Its new opt-in
smoke:engineering-openai script does not run in standard tests. Null real cost
and normalized usage are documented compatibility additions. No 0.9.0, tag,
publication, GitHub Release, push or merge is included; full Phase 9/L3 and
Anthropic engineering remain outside this owner-approved closure.
