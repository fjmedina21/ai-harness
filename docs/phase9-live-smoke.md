# Phase 9A OpenAI live-smoke evidence and runbook

## Observed real evidence

On 2026-11-23 the owner authorized OpenAI only, selected gpt-5.5-pro and allowed
one repeated generation request with an outer 120-second budget and requested
512 output tokens. A temporary synthetic value.ts fixture was supplied through
the existing OpenAI text adapter and then checked by the real Phase 9 patch engine.
The exact requested result/hash was included in that narrow smoke prompt. It was
not a general natural-language task or the new multi-role CLI composition.

| Fact | Observed result |
| --- | --- |
| Endpoint | OpenAI Responses, HTTP 200 |
| Model | gpt-5.5-pro, explicitly selected by the owner |
| Generation calls / duration | 1 / 18739 ms |
| Reported input/output tokens | 288 / 269 |
| Reasoning tokens | 114, already included in output tokens |
| Host patch validation | Passed; one replace of synthetic value.ts |
| Diff | Generated, 129 bytes |
| Patch digest | 62ab783cd440abf61642839d5af1627a14c1191eb2f081ebe1c7ecf0520b25e9 |
| Source unchanged / fixture cleanup | Confirmed / confirmed |
| Patch application / generated-code execution | Neither occurred |
| Cost | Unknown; no host tariffs supplied |
| Anthropic / Podman | Neither used |

Important limitation discovered during 9A implementation: that baseline text
adapter did not serialize its configured output-token cap. The observed 269 output
tokens were below the requested 512, but provider enforcement of that cap was not
established by the historical smoke. The previous internal deadline was 30 seconds,
so the 18.7-second result did not validate a 120-second provider timeout either.
Both controls are now implemented and wire/deadline-tested offline. No new live
claim is made for the changed code or the full engineering workflow.

Earlier probes include a categorized HTTP 429 quota_or_billing result and a
30-second timeout. They are separate attempts, not successful tests or evidence
that later timeouts imply billing failure. Raw error bodies and credentials were
not recorded. Aborted/interrupted calls can have unknown upstream outcomes/costs;
no automatic retry/fallback is authorized by this runbook.

## New full-workflow smoke — implemented, offline tested, live unverified

`pnpm smoke:engineering-openai` builds and runs a separate opt-in script. It is
excluded from pnpm test and never loads a repository .env automatically.
Required host inputs:

- OPENAI_API_KEY in the process environment.
- HARNESS_ENGINEERING_REAL_CONFIRM=YES.
- HARNESS_ENGINEERING_ALLOW_UNCERTAIN_COST=YES.
- HARNESS_ENGINEERING_REAL_MODEL set to an available host-selected model.
- HARNESS_ENGINEERING_REAL_REQUEST_BUDGET from 4 to 6.
- HARNESS_ENGINEERING_REAL_OUTPUT_TOKEN_BUDGET from 1 to 512.
- HARNESS_ENGINEERING_REAL_TIMEOUT_MS from 1 to 120000.
- Optional HARNESS_ENGINEERING_REAL_RATES pointing to an existing private tariff
  file, using the established validation rules. Missing rates mean unknown cost.

The smoke creates only a private synthetic source, runs L1 requirements/planner/
implementer/reviewer through the new adapter and checks the exact harmless semantic
change, real schema/policy/digests/diff and original-file identity. It never applies
patches or executes generated code. Success requires exit 0, smokePassed=true,
valid expected proposal, unchanged source and confirmed cleanup; HTTP 200 alone
is insufficient. Reports contain bounded metadata/digests/usage/diagnostics only,
not prompts, source, patches, keys or raw provider responses.

Do not run this paid smoke merely because environment values exist. Obtain owner
approval of the selected model, request/output/timeout budget and cost uncertainty
for this full workflow. Existing one-call direct-smoke approval was consumed and
does not authorize four new model calls during offline closure. No model fallback
or retry is performed. Network and credit/model access errors use fixed safe labels.
For quota_or_billing inspect account credits/spend limits rather than assuming an
ordinary transient rate limit. Local HTTP cancellation cannot guarantee no upstream
billing. No monetary estimate is an invoice or exact upper bound.

Real new-workflow OpenAI validation: **pending separate authorization/execution**.
Anthropic engineering: **deferred by owner**. Real L3: **blocked** by snapshot
transfer and dedicated current isolation evidence, independently of this API smoke.
