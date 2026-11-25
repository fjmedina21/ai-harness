# Single-developer engineering E2E

Version **0.8.0**. Register each local project in the protected host profile before
isolated mutation. Authentication supplies one GitHub owner; project capabilities,
file policies, tools and budgets supply authorization; Personal supplies human intent.
See [setup](phase9-github-app-setup.md) and [project policy](project-authorization.md).

Use the existing `run --workflow implement` with explicit provider/fixture, selected
files and finite options. L1 proposes only. L2 additionally requires authorize-workspace
and exact registered external workspace/journal/checkpoint directories. Fixture
replacement still passes the trusted host file/operation policy; it cannot grant
new paths or create/delete authority. OpenAI needs separate explicit paid-call
consent and host credentials; no project .env is loaded automatically.

```sh
pnpm harness auth whoami
pnpm harness engineering status --id EXECUTION_ID
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
pnpm harness engineering validate --id EXECUTION_ID --profile local-podman --action test
```

Patch approval requires exact diff review, APPROVE and native macOS authentication.
Validation requires accepted exact project/runtime/profile evidence plus another
native sandbox review. Unaccepted profiles retain validation_acceptance_pending.
A completed validation command returns verified existing evidence; it does not run
again. Uncertain operations remain blocked from execution and require reconciliation.
Original project integration, Git writes, arbitrary commands, Phase 9C/9D and
publication are outside this workflow.

The current [real report](phase9-real-acceptance-report.md) records actual fixture
patches, four separate sandbox outcomes and a fresh complete CLI case. [Verification](VERIFICATION.md)
separates offline fixtures from real observations. [Older E2E notes](history/phase9-e2e-before-single-developer.md)
remain historical only.
