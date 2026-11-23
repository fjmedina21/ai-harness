# Phase 9A OpenAI live-smoke evidence and runbook

## Audit scope and current acceptance state

Audited on **2026-11-23** against integrated `main` at
**9ce59e8b4b6b97757a3104aaed4684c91cbbeef5**, version **0.8.0**.
The owner subsequently authorized a real full-workflow run, explicitly accepted
uncertain cost, then authorized a bounded 160-second deadline change and one
reattempt. The temporary profiles were local commits **11c3738e42ccb9603cc198a434e3ce635c2efda1**
(160 seconds) and **1c3755a494895d071937c8f12f9c1da6e8cf2fb0** (600 seconds).
The maximum was restored to **120 seconds** after the successful long run. These
local changes are not published/integrated to main. No other provider,
generated-code execution or L3 operation was run.

**Verified — real OpenAI engineering workflow on the synthetic 600-second profile.**
It completed in **240770 ms**, with four HTTP 200 responses and a valid reviewed
proposal. The 120-second and 160-second attempts timed out. Successful full-workflow
validation with the restored **120-second** profile remains pending; the passing
trace exceeded both its global deadline and, on request 2, its per-request ceiling.

## Independent evidence categories

| Validation | Evidence | Result | Limitations |
| --- | --- | --- | --- |
| A. Offline / mocked HTTP | Real adapters, actual CLI subprocesses, real temporary filesystems and SQLite; 568/568 in exact-SHA baseline CI; 570/570 locally after the deadline change | Verified in those offline scopes | HTTP simulated; CI CLI smoke only runs version/init/doctor; no real provider or generated-code isolation proof |
| B. Direct OpenAI | Historical one-call gpt-5.5-pro result transcribed in 9ce59e8b4b6b; metrics below | Historical pass recorded | Exact target content/hash supplied; no full role sequence; no independent local JSON artifact found; old token/deadline controls differ |
| C. OpenAI implement E2E | Real four-role smoke on 1c3755a49489; four HTTP 200s, accepted expected patch/diff, unchanged source and confirmed cleanup | Passed with temporary 600-second profile | Took 240770 ms; not a pass under the restored 120-second profile or a live interactive CLI subprocess test |
| L2 independent approval | Actual filesystem/SQLite integration and mocked provider HTTP | Offline verified, exact host approval still required | No live-provider approved application demonstrated; CLI cannot authenticate/resume independent approver |
| L3 Podman | No current generated-code snapshot-transfer/build/test evidence | Pending / blocked | Historical fixed-command Podman probes are not L3; no Podman run during this audit |

Baseline CI [45205140383](https://github.com/fjmedina21/ai-harness/actions/runs/45205140383)
completed successfully at 2026-11-23T15:26:36Z for the full 9ce59e8b4b6b SHA above;
job 137798700393 logs confirm 568 tests and 568 passes. It does not certify the
later local changes. Their 63/63 focused runtime/CLI/transport checks are
included in the 570 local total, not additional tests. Earlier Phase 9 CI
[45174956424](https://github.com/fjmedina21/ai-harness/actions/runs/45174956424)
belongs to 463b3255390eab90cdb06d6f07adb9a35e3575f8 and also succeeded.

## Historical direct OpenAI smoke — category B

The 2026-11-23 implementation-closure record reports one successful direct call
through the existing OpenAI text adapter, followed by the real Phase 9 patch engine.
It used a temporary synthetic value.ts and supplied the exact requested result/hash.
It was not a general natural-language task or the new four-role composition.

| Field | Historical recorded observation |
| --- | --- |
| Date / exact UTC start | 2026-11-23 / not retained |
| Source association | Earlier Phase 9 baseline 463b3255390eab90cdb06d6f07adb9a35e3575f8; the retained documentary result does not itself embed an execution SHA |
| Documentary record | docs/phase9-live-smoke.md in 9ce59e8b4b6b97757a3104aaed4684c91cbbeef5 |
| Provider / model / endpoint | OpenAI / owner-selected gpt-5.5-pro / Responses |
| Generation requests / HTTP / elapsed | 1 / 200 / 18739 ms |
| Reported input / output tokens | 288 / 269 |
| Reasoning tokens | 114, included in the output total; do not add again |
| Host patch validation | Passed; one replace of synthetic value.ts |
| Diff | Generated, 129 bytes |
| Patch digest | 62ab783cd440abf61642839d5af1627a14c1191eb2f081ebe1c7ecf0520b25e9 |
| Source unchanged / fixture cleanup | Both reported confirmed |
| Application / generated-code execution | Neither occurred |
| Cost | Unknown; no host tariffs supplied |
| Anthropic / Podman | Neither used |

Provenance limitation: the audit inspected existing non-secret local reports and
logs under the excluded development directory, including the Phase 8 acceptance
report. No independent retained Phase 9A direct-success JSON/log was located.
The historical values above are preserved documentary evidence, not independently
replayed or reconstructed telemetry. The exact live-source SHA cannot be attested
from a missing per-run artifact. No private report, path, prompt or raw response
is published to compensate for that gap.

The baseline text adapter accepted an output-cap option but did not serialize
max_output_tokens. Observed output was below the requested 512; provider enforcement
of that cap was not established by this run. Its internal deadline was 30 seconds,
so the 18.7-second result also did not validate a 120-second provider timeout.
The 9A implementation corrected the wire cap and tested deadlines offline. Those
changes and the new four-role workflow cannot inherit the direct smoke's pass.

## Earlier failures — separate historical attempts

| Attempt | Date / source association | Provider / model | Requests / HTTP | Duration / usage | Outcome and gaps |
| --- | --- | --- | --- | --- | --- |
| Phase 8 inspection smoke | 2026-11-22 acceptance report audits d9ecbf49597c5c22784257d519a6a217c2c9e73f; per-call SHA not embedded | OpenAI / gpt-6-luna | 1 / HTTP-class failure; exact status not retained for this call | Not retained / unavailable | Failed before file read/task completion; patch/diff not applicable; source-hash and cleanup assertions not retained |
| Phase 8 first single-call diagnostic | Same report; exact execution time/SHA not retained | OpenAI / gpt-6-luna context; per-call model record absent | 1 / HTTP-class failure, status not retained | Not retained / unavailable | Not workflow validation; no patch/diff; per-call source/cleanup evidence absent |
| Phase 8 final single-call diagnostic | Same report; exact execution time/SHA not retained | OpenAI / gpt-6-luna context; per-call model record absent | 1 / 429 | Not retained / unavailable | Body was not read; cause unknown; no patch/diff or independent cleanup evidence |
| Later categorized 429 probe | Mentioned in 9ce59e8b4b6b documentation; execution date/SHA not embedded | OpenAI / per-attempt model not retained in that record | Count not retained / 429 quota_or_billing | Not retained / unavailable | Failed; no successful patch validation; source/cleanup/diff evidence not retained per attempt |
| Later 30-second timeout | Mentioned in the same documentation; execution date/SHA not embedded | OpenAI / per-attempt model not retained | Count / response status not retained | Approximate 30-second timeout only / unavailable | Failed; no successful patch validation; no per-attempt source/cleanup/diff evidence retained |

The Phase 8 acceptance report records three network requests total, no usage/cost,
no further retries and no Anthropic call. Its unidentified 429 must not be relabelled
as the later quota_or_billing diagnosis. The later probe summaries do not establish
billing state, complete request counts or successful cleanup. Interrupted attempts
without a terminal report retain unknown upstream outcome, usage and cost.

## Full engineering workflow — category C, 120-second real attempt

The existing exported runEngineeringProviderSmoke entry point was invoked through
a trusted observation wrapper, with real native fetch and only the host-selected
credential loaded into the process. The wrapper recorded UTC times, the clean
source commit, HTTP statuses and elapsed time; it did not substitute responses or
change the runtime's decisions. The smoke itself uses only its synthetic fixture.

| Field | Observed result |
| --- | --- |
| Source commit | 9ce59e8b4b6b97757a3104aaed4684c91cbbeef5 |
| UTC start / finish | 2026-11-23T15:51:22.484Z / 2026-11-23T15:53:22.534Z |
| Provider / model | OpenAI / gpt-5.5-pro |
| Host budgets | At most 6 requests; 512 output tokens/request; 120000 ms global deadline; uncertain cost explicitly accepted |
| Actual requests / total elapsed | 2 / 120046 ms, including terminal reporting/cleanup overhead |
| Request 1 | Started 15:51:22.495Z; HTTP 200 observed after 113363 ms |
| Request 2 | Started 15:53:15.883Z; no HTTP response observed; fetch aborted after 6621 ms |
| Reported usage subtotal | 489 input / 177 output / 139 reasoning tokens; reasoning is included in output |
| Usage / cost limitation | Second request usage unavailable; the reported subtotal is not complete billable consumption. Cost unknown, missing host rates |
| Terminal status / exit | timeout / 1 from the smoke entry point |
| Patch validation / digest / diff | Not reached; proposalValidated=false, patchDigests empty, no proposal/diff produced |
| Source unchanged / cleanup | true / confirmed |
| Patch applied / code executed / L3 | false / false / blocked |

HTTP durations are host fetch observations through response headers or error, not
provider server timing. The global deadline cancels local work; cancellation does
not establish whether the provider completed/billed the second request. No raw
response or authorization identifier was retained. No automatic retry/fallback
occurred. This attempt confirms real connectivity and bounded termination only.

## Full workflow — authorized 160-second reattempt

Same exported smoke entry point and real-fetch observation wrapper as the first
attempt; no response substitution, automatic retry or provider/model fallback.

| Field | Observed result |
| --- | --- |
| Source commit | 11c3738e42ccb9603cc198a434e3ce635c2efda1 |
| UTC start / finish | 2026-11-23T15:58:04.992Z / 2026-11-23T16:00:45.046Z |
| Provider / model | OpenAI / gpt-5.5-pro |
| Host budgets | At most 6 requests; 512 output tokens/request; 160000 ms global deadline; uncertain cost accepted |
| Actual requests / elapsed | 4 / 160058 ms, including terminal reporting/cleanup overhead |
| Request 1 | 15:58:04.998Z; HTTP 200 after 45776 ms |
| Request 2 | 15:58:50.783Z; HTTP 200 after 14247 ms |
| Request 3 | 15:59:05.036Z; HTTP 200 after 19428 ms |
| Request 4 | 15:59:24.477Z; no HTTP response observed; fetch aborted after 80535 ms |
| Reported usage subtotal | 1548 input / 763 output; 0 cache-read / 0 cache-write; 527 reasoning included in output |
| Usage / cost gaps | Cancelled reviewer usage unavailable; subtotal is not the complete bill. Cost unknown, missing host rates |
| Host validation | proposalValidated=true; one proposal digest retained |
| Patch digest | 7c27db653f453419072968903b529b4e0de6843a3159f0fdfb11a8accdad2837 |
| Diff evidence | Runtime constructs the diff before marking proposal validation passed; actual diff, byte count and nonempty assertion are not emitted by this smoke report |
| Expected semantics | Not attested: the acceptance expression stops at the failed terminal-state condition |
| Review / status / exit | Fourth role code-reviewer cancelled; timeout / 1; smokePassed=false |
| Source unchanged / cleanup | true / confirmed |
| Patch applied / code executed / L3 | false / false / blocked |

The first three requests cover requirements, planning and implementation. A real
proposal passed host schema/policy validation, but the requested role sequence did
not complete. Output allowance is per request, not a cap on the 763-token subtotal.
Local cancellation cannot determine the reviewer's upstream outcome or charges.
No source-project code was executed. Repository source changes were limited to the
owner-authorized deadline adjustment; the smoke separately attests its unchanged
synthetic input.

## Longer bounded attempt and restoration

The owner requested a long execution followed by restoration to 120 seconds.
A finite 600-second window was selected and disclosed, preserving at most six
requests and 512 output tokens per request. One attempt completed; no unbounded
loop, response substitution, model fallback or automatic retry was introduced.

| Field | Observed result |
| --- | --- |
| Source commit | 1c3755a494895d071937c8f12f9c1da6e8cf2fb0; runtime source clean; only documentary edits pending |
| UTC start / finish | 2026-11-23T16:07:36.021Z / 2026-11-23T16:11:36.796Z |
| Provider / model | OpenAI / gpt-5.5-pro |
| Host budgets | At most 6 requests; 512 output tokens/request; 600000 ms global/per-request ceiling; uncertain cost accepted |
| Actual requests / total elapsed | 4 / 240770 ms |
| Request 1 | 16:07:36.034Z; HTTP 200 after 43254 ms |
| Request 2 | 16:08:19.305Z; HTTP 200 after 140559 ms |
| Request 3 | 16:10:39.885Z; HTTP 200 after 29227 ms |
| Request 4 | 16:11:09.139Z; HTTP 200 after 27613 ms |
| Reported usage | 2132 input / 874 output; 0 cache-read / 0 cache-write; 598 reasoning included in output |
| Cost | Unknown: missing host rates; no monetary estimate reconstructed |
| Terminal status / exit | proposed / 0; smokePassed=true |
| Host proposal validation | Passed; one accepted structured proposal |
| Patch digest | 751d90fdfbff69e0f446dfe34048bfb8a17b07eb072a2a3ec76fd91742e664c7 |
| Semantic/diff acceptance | Expected single synthetic replacement and nonempty diff confirmed by smoke acceptance; diff bytes/content are not emitted by its report |
| Review | Four-role sequence completed; advisory code review returned; not human approval |
| Source unchanged / cleanup | true / confirmed |
| Patch applied / code executed / L3 | false / false / blocked |

This is live validation of the synthetic application workflow through the real
adapter and patch engine. It does not establish arbitrary task correctness,
production safety, approved L2 application or L3. The per-request 512-token limit
is not a cap on the 874-token aggregate across four responses. Provider-reported
usage is not a billing invoice. Earlier cancelled calls retain unknown usage.

After completion, the configurable maximum in transport, engineering runtime,
CLI and smoke was restored to **120000 ms**; provider default remains **30000 ms**.
Tests accept 120000 and reject 120001 before new provider work. Production runtime
files match the audited 9ce59e8b4b6b baseline again; additional boundary regression
tests remain. The final restoration/audit commit contains this record. No real
120-second re-run was made after restoration, and this 240.77-second success must
not be presented as proof that the restored configuration completes this model/task.

## Opt-in runbook and acceptance

`pnpm smoke:engineering-openai` is a separate opt-in entry point, not a live action
in pnpm test. The normal suite runs its subprocess cases only with mocked HTTP.
It never automatically loads a repository .env. Required trusted host inputs:

- OPENAI_API_KEY in the process environment; never publish or pass key values in arguments.
- HARNESS_ENGINEERING_REAL_CONFIRM=YES and HARNESS_ENGINEERING_ALLOW_UNCERTAIN_COST=YES.
- HARNESS_ENGINEERING_REAL_MODEL set to a host-selected available model.
- HARNESS_ENGINEERING_REAL_REQUEST_BUDGET from 4 to 6.
- HARNESS_ENGINEERING_REAL_OUTPUT_TOKEN_BUDGET from 1 to 512.
- HARNESS_ENGINEERING_REAL_TIMEOUT_MS from 1 to 120000 in the restored code. The historical 600000 setting is rejected; it describes evidence, not current usage.
- Optional HARNESS_ENGINEERING_REAL_RATES referencing an existing private host tariff file. Missing rates mean unknown cost.

The script runs L1 requirements/planner/implementer/reviewer and requires a valid
single replace of value.ts to the expected harmless value, host schema/policy/hash
checks, a nonempty diff, unchanged original content and confirmed cleanup. Exit 0,
smokePassed=true and all acceptance checks are required; HTTP 200 alone is insufficient.
No patch application or generated-code execution occurs. This is programmatic
workflow smoke evidence, not a live subprocess run of the interactive CLI command.

The script's own JSON omits execution date, commit, duration and HTTP observations.
A future authorized run should retain a sanitized observation envelope binding those
fields to the exact clean source, with separate reported/unknown usage. Preserve
only bounded metadata/digests, not prompts, source, patches, keys, private paths,
raw responses or authorization IDs. Unknown usage must never be reconstructed.

Existing credentials do not authorize another run. Obtain fresh owner authorization
for future execution and any change of model, finite budgets or uncertain-cost
policy; the three specifically authorized attempts do not grant unlimited retries.
No provider/model fallback occurs. Safe quota_or_billing diagnostics do not identify
a precise billing cause. Cost estimates are not invoices or guaranteed billing caps.
Anthropic engineering remains deferred; L3 remains blocked independently of OpenAI.
