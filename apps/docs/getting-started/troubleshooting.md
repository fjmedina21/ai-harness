# Troubleshooting

## Diagnose the boundary first

| Symptom | Likely boundary | Safe next action |
| --- | --- | --- |
| `doctor` rejects configuration | Public project schema/declarations | Inspect `.ai/` and compare validated schema; do not weaken host policy |
| GitHub verification unavailable | Identity/network/Keychain | Inspect `auth status` deliberately; restore configured identity verification |
| Unknown or unauthorized project | Host project registry | Ask the host owner to review canonical paths, capabilities and policy |
| `policy_changed` | Artifact fingerprint differs | Prepare a new proposal under reviewed current policy |
| `validation_acceptance_pending` | Exact Gate C binding absent, expired or changed | Stop; obtain separately authorized current acceptance |
| Pending patch approval | Expected human gate | Use `engineering diff`, then interactive `approve` if intended |
| Native review unavailable | Noninteractive streams or missing LocalAuthentication | Use the trusted local macOS review flow; never bypass with flags |
| Missing dependency/profile action | No preprovisioned accepted toolchain | Report unsupported/blocked; do not install from model output |
| Timeout/cancellation/uncertain cleanup | Effect may be unknown | Inspect durable evidence and reconcile through trusted host APIs |
| Repeated diagnostics / `NoProgress` | Finite repair stop | Inspect normalized results; change scope only in a fresh reviewed session |
| Provider 429 / unknown cost | Provider/account/budget | Inspect fixed error category and actual usage; no automatic retry |

## Preserve evidence

Record the command shape, exit code and execution/validation IDs privately. Use `engineering status`, `repair-status`, `repair-history` and appropriate evidence inspection. Do not paste tokens, full project content, host paths or private journals into an issue. A digest detects corruption; it does not certify a successful external effect.

There is no CLI `cancel` or `reconcile` subcommand. Signals bound ongoing execution; interrupted effects remain subject to the [recovery rules](../guide/results.md).

## Portal problems

Run `pnpm docs:check`; preview the built site under `/ai-harness/`, including a nested `.html` route. A root-only test misses GitHub Pages asset failures. Local search requires browser JavaScript and a built index. Build-time dependencies must already be installed; basic rendered content requires no remote service.

## Source and evidence

[docs/phase9b-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9b-e2e.md), [docs/phase9c-e2e.md](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/docs/phase9c-e2e.md), [apps/cli/src/engineering-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/engineering-cli.ts), [apps/cli/src/repair-cli.ts](https://github.com/fjmedina21/ai-harness/blob/def9a987ff8d449402a67d0dcb58a8420709f68e/apps/cli/src/repair-cli.ts).
