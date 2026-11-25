# Phase 9A.4 — Personal and Team approval

Version **0.8.0**, experimental. The host can select Personal Mode for a single
GitHub developer or retain Team Mode with separate requester and approver accounts.
Personal Mode is explicit human authorization by one account, **not separation of
functions between two people**. Authentication, policy, review and execution remain
different decisions. Neither a logged-in session nor possession of an execution ID
approves anything. No model tool exposes the approval/UI/store capabilities.

## Host policy and roles

An absent `approval` field means Team Mode and retains the legacy protocol. The
private host `github-auth.json` accepts an optional top-level policy; a workspace
may explicitly override it with its own complete `approval` object. Project `.ai`
files, source text, prompts and model output cannot configure this policy.

```json
{
  "approval": {
    "version": 1,
    "mode": "personal",
    "requireHumanConfirmation": true,
    "allowRequesterApproval": true,
    "requireExactPatchReview": true,
    "requireSeparateSandboxApproval": true
  }
}
```

This is a fragment to merge into an existing validated host profile, not a complete
replacement. Team uses `mode: "team"` and `allowRequesterApproval: false`, with
the remaining checks true. Unknown keys, unsupported versions, missing fields and
contradictory values fail closed. The implementation never edits the owner's
private profile or grants new roles automatically.

The single stable GitHub account ID must explicitly receive `harness:reader`,
`harness:requester`, `harness:approver` and `harness:operator` over the selected
source/workspace resources. Roles do not constitute an approval. In Team Mode,
the approver must still have a different canonical issuer/account ID. Usernames
and OAuth session IDs do not determine independence.

## Request, review, confirm, continue

Generation retains the existing fixture/OpenAI opt-in workflow. A new proposal
stores the exact policy together with its immutable review context in the same
transaction as its proposal reference. The source artifact/HMAC format remains
unchanged. Existing proposals with no context remain Team proposals.

```sh
pnpm harness engineering status --id EXECUTION_ID
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

For Personal approval, the CLI authenticates GitHub, checks scoped approver role,
reopens the durable artifact and reconciles source/workspace/policy. It displays
execution, exact patch digest, files/operations, workspace, risk, policy digest,
challenge binding and expiry. Every diff line is JSON-quoted so control sequences,
backslashes and bidi characters remain visible rather than silently disappearing.
The UI then requires **exactly `APPROVE`** and a fresh macOS device-owner
authentication dialog. There is no affirmative default or bypass flag.

A TTY on input, output and the review/prompt error stream is necessary but insufficient.
Redirected input/output, hidden review output, pipelines and a PTY
without successful OS authentication cannot approve. The fixed LocalAuthentication
bridge uses an OS-owned prompt, with the operation's binding digest as its reason;
it never accepts a password/token argument. See Apple's
[device-owner policy](https://developer.apple.com/documentation/localauthentication/lapolicy/deviceownerauthentication).
The CLI does not assert that the OS user and GitHub username are the same identity;
GitHub account verification and local presence are bound to one pending action.

After confirmation, GitHub identity/roles, host configuration and actual artifact/
workspace are checked again. A changed diff, context, policy, session identity or
expired challenge rejects the decision. Cancellation leaves PendingApproval.
`--json` changes result output only; it does not skip interactive review. `continue`
never grants approval and has no model/provider port.

## Verified intent and durable state

`HumanApprovalAuthority` accepts a trusted host presence-verifier capability and
issues an immutable, in-process verified receipt. Plain JSON, serialized receipts,
model claims and `humanConfirmed: true` cannot pass `DurableApprovalService`.
The native UI capability is not registered as an agent tool. Non-interactive hosts
must supply an independently reviewed external identity/presence/intent verifier;
no external server or permissive default verifier is provided.

The existing ApprovalBroker/DurableApprovalService and SQLite approval transaction
are extended, not replaced. A decision records mode, policy version/digest,
requester/approver, timestamp, challenge digest, patch/snapshot/workspace and scope,
plus non-secret intent metadata. A unique confirmation-ID ledger commits atomically
with the decision. Pending-state/CAS, expiry, revocation, single consumption and
lease epochs/fencing continue to apply. Receipt IDs are not bearer credentials.
On resume, persisted journal state supplies the decision; no live receipt or model
regeneration is needed. Uncertain effects cannot replay.

## Separate sandbox decision

An approved/applied patch never authorizes `sandbox.validate`. The coordinator
creates another operation/grant and random challenge, binding its complete action
profile/image/resources and exact resulting snapshot. `ValidationCoordinator.approve`
requires a scoped GitHub approver verifier and, in Personal Mode, a new human
confirmation through the same authority. `prepare` only requests approval; `execute`
consumes the separate grant through ToolDispatcher. Patch receipts cannot be reused.

The host API supports both modes; the validation CLI remains blocked at
`validation_acceptance_pending`. Gate C has not passed, and this phase does not
enable real workloads, broaden Node profiles, relax isolation or add repair.
Validation prepare/execute retain the existing same journal-owner-session boundary;
interrupted validation requires reconciliation, not automatic cross-process replay.

## Migration and rollback

Journal v3 adds review-context and confirmation-ID tables transactionally. New code
reads legacy v1/v2 records without rewriting their request scopes or granting
Personal authority. Switching policy invalidates existing pending approvals; it
does not reactivate expired operations. Create a fresh proposal under the chosen
policy. Older binaries cannot open schema v3.

Before migration, quiesce all journal users and preserve a private consistent copy
of the journal, artifacts and host key. Preserve the existing host profile with
restrictive permissions before manually editing it; it must contain no secrets.
Validate the complete resulting profile with the actual host reader. Keep account
and resource assignments intact. Never copy the example over a real configuration.
Default database ceiling remains 64 MiB; very small custom ceilings may not fit
the additional tables and must fail closed, without silently increasing limits.

Rollback requires a consistent pre-migration backup and confirmation that no
later side effects would be replayed. Otherwise stop for reconciliation. Do not
drop review tables, lower `user_version`, delete a consumed confirmation or restore
an old grant to pending. No automatic downgrade or destructive migration exists.

## Verification and limits

Run `pnpm test:personal-approval`, the full suite and existing GitHub/9B suites.
Deterministic tests use mocked GitHub/native/external verifiers, real temporary
filesystem/SQLite, separate processes and a mocked sandbox. They do not prove a
real human clicked an OS dialog or effective Podman isolation.

In the explicitly authorized live follow-up, the owner enabled Personal only for
the synthetic project with a private backup and scoped approver role. After two
failed-closed attempts and a bounded online-verification correction, **actual
Personal review, typed confirmation, macOS authentication and cross-process
continuation passed** on 2026-11-25. Independent journal/artifact inspection
confirmed the consumed exact grant, same stable GitHub account and original source
unchanged. No model was called on resume and no generated code executed.

This certifies only that synthetic local Personal workflow. Team's real second
account remains unavailable. Actual GitHub login/Keychain recovery, refresh and
logout, one separately authorized OpenAI L1 smoke and both fixed Podman runtime
suites also passed. Full durable authenticated Gate C remains pending and its CLI
stays blocked. See [actual scope and evidence](phase9-real-acceptance-report.md).

The trusted host, OS, same-UID process environment and presence-verifier adapters
remain trusted. The CLI is not an attestation system against host malware, root,
UI automation controlling OS credentials, compromised verifiers or journal editors.
The in-memory authority prevents untrusted serialized content from authorizing an
operation; low-level storage APIs remain host capabilities, not authentication.
No production readiness, semantic correctness, exactly-once effects, Phase 9C,
Phase 9D or original-project integration is claimed.
