# Human-confirmed Personal L2

**Single Developer + Single GitHub Identity + Explicit Project Authorization +
Human-Confirmed Personal L2 + Durable Podman Validation.** Version **0.8.0**.
Personal is the only operational approval protocol. Configuration cannot choose
another mode. Authenticated owner, authorized resources and approved operation
are three separate controls.

The optional explicit host approval object is:

```json
{
  "version": 1,
  "mode": "personal",
  "requireHumanConfirmation": true,
  "allowRequesterApproval": true,
  "requireExactPatchReview": true,
  "requireSeparateSandboxApproval": true
}
```

Omitting it selects this exact Personal policy. Unknown/missing/contradictory
fields and Team policies are rejected. Project files and model text cannot set it.
The requester and approver must be the same stable installation owner; another
GitHub session or identity cannot inspect, approve or continue that operation.
A valid login never issues an approval.

## Exact review, confirmation and continuation

`engineering status|diff|approve|reject|revoke|continue --id EXECUTION_ID` verifies
current GitHub session, owner and project capabilities before private artifact
access. The CLI checks the current full project fingerprint. Approval reopens and
reconciles source/workspace, policy and immutable HMAC artifact; displays exact
patch/diff, files/operations, workspace, snapshot, policy digest, challenge and expiry;
requires exactly `APPROVE` plus fresh macOS device-owner authentication; then checks
identity and host policy again. Diff controls/bidi are JSON-escaped for exact review.

All review streams must be interactive. Pipelines, model claims, JSON receipts,
affirmative flags and a PTY alone cannot approve. HumanApprovalAuthority issues a
non-serializable in-process receipt only through a trusted human-presence verifier.
The native port is not a model tool. Test verifiers are synthetic, not live intent.

The same ApprovalBroker, DurableApprovalService, SQLite v3 and ToolDispatcher
remain authoritative. Exact artifact/patch/policy/workspace/snapshot/challenge,
expiry, owner, single-use confirmation ledger, CAS, leases and monotonic fencing
are retained. Continuation makes zero model calls and applies only to the isolated
workspace. Completed or uncertain operations never replay automatically.

## Separate sandbox decision

A code grant never authorizes Podman. ValidationCoordinator prepares another
operation and grant bound to the exact project, artifact, resulting snapshot,
transfer, action/profile, OCI image, resources, output/time limits and a distinct
challenge. The human review displays the complete sandbox action; another native
confirmation is mandatory. Approved sandbox operations can transfer to a new
process only while still effect-free, under the existing CAS lease and fencing.
Prepared/Running/Uncertain operations require reconciliation.

Current actual acceptance is limited to gatec-synthetic/local-podman fixed Node
profiles and passed the fresh CLI case with separate native decisions. Other scopes
remain validation_acceptance_pending. Signed private acceptance revalidates exact
project/code/runtime/probes/native durable evidence and expires conservatively.
See [runtime](phase9b-validation-runtime.md), [migration](single-developer-migration.md),
[security](phase9-security.md) and [current evidence](phase9-real-acceptance-report.md).
