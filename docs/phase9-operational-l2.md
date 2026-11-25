# Phase 9A.3 — authenticated Operational L2

The CLI now composes GitHub authentication with the existing durable L2 protocol.
Version **0.8.0** remains experimental. Offline multiprocess tests exercise real
SQLite/filesystem plus mocked GitHub HTTP. Live Operational L2 Personal passed for
the owner-confirmed synthetic local workflow. Team's real two-account acceptance
remains pending. Team requires two identities;
explicit host-configured Personal Mode uses one authenticated GitHub account and
a separate human decision. See [policy, review and migration](phase9-personal-mode.md).

## Request and authorize

`run --workflow implement --autonomy isolated` requires a verified GitHub session
and `harness:requester` for the exact trusted source/workspace profile before any
provider call or workspace creation. The selected journal, checkpoint directory,
source, workspace directory and patch policy must exactly match the private host
profile. See [setup](phase9-github-app-setup.md).

The requester stored in the proposal/journal is the canonical GitHub account ID.
Legacy `cli-host` proposals are not reinterpreted as GitHub identities. They remain
subject to their original trusted embedding/reconciliation policy; create a new
authenticated proposal when appropriate, without replaying uncertain effects.

For an explicitly authorized synthetic fixture, after login:

```sh
pnpm harness run --workflow implement --path /ABSOLUTE/SYNTHETIC/PROJECT \
  --request "Fixture replacement for review" --provider fixture --autonomy isolated \
  --files value.ts --fixture-file value.ts --fixture-content "fixture replacement" \
  --authorize-workspace --workspace-dir /PRIVATE/workspaces \
  --journal /PRIVATE/state/operations.sqlite --checkpoint-dir /PRIVATE/checkpoints --json
```

Exit 2 indicates the exact durable proposal is awaiting policy-bound human approval;
it is not applied yet. OpenAI generation retains its separate model, credentials,
request/token/time bounds and explicit paid-call confirmation. Continuation has
no provider port and never regenerates the proposal.

## Review and continue

```sh
pnpm harness engineering status --id EXECUTION_ID
pnpm harness engineering diff --id EXECUTION_ID
pnpm harness engineering approve --id EXECUTION_ID
pnpm harness engineering reject --id EXECUTION_ID
pnpm harness engineering revoke --id EXECUTION_ID
pnpm harness engineering continue --id EXECUTION_ID
```

Commands accept `--json`. They reject credential/token/username arguments. Trusted
host configuration selects journals; `--id` resolves exactly one durable proposal
for the execution, rejecting ambiguous/truncated results. Reader permission is
required for status/diff, approver for approve/reject/revoke and operator for
continue. Online GitHub verification and exact resource scope are rechecked;
unavailable authentication fails closed, including private diff access.

Transient server errors during read-only identity verification have at most three
bounded attempts within the existing per-endpoint deadline. The broker reports
`authentication_unavailable` after exhaustion, rather than presenting a server
failure as a missing session. It still denies the action and preserves pending
approval. No token exchange, refresh, patch application, approval decision or
continuation is automatically replayed. See
[verification transport](phase9-github-authentication.md#authorization-code--pkce).

In default Team Mode, the requester cannot approve their own patch, even through a
different session or username. Independent approval requires a second authorized
GitHub account. In explicit Personal Mode, the same account may approve only after
exact review, typed `APPROVE` on a TTY and fresh macOS device-owner authentication.
All four roles must be explicitly assigned; no role or session implies approval.
The CLI revalidates identity, permissions, host configuration and artifact after
confirmation. Non-interactive approval requires an independently reviewed external
host verifier; no default one or bypass flag is provided. Cancelling preserves the
pending request. Sessions belong to an OS-user Keychain; arrange
reviewed access to the same protected journal/artifacts rather than copying tokens.
Login/logout when changing accounts on one OS user must fit the existing approval
window, or use pre-authenticated reviewed host integrations. The default approval
TTL is 60 seconds, bounded by existing journal policy; resume never extends it.

ApprovalBroker binds the verified actor to action, execution, workspace, artifact
digest and challenge, then delegates to DurableApprovalService. The existing
transaction binds requester, approver, source/base snapshot, patch, policy and
expiry and rejects replay. Reject/revoke remain terminal decisions. No parallel
grant store or model-controlled approval endpoint is added.

Continuation retrieves the private authenticated ProposalArtifact, reconciles
policy, source, receipt/root identity and complete workspace inventory, acquires
the fenced execution lease and applies exactly the approved patch through
ToolDispatcher. It returns `ReviewPending` with inventory-only verification.
It does not execute project code, mutate the original source, integrate Git or
claim the patch has passed build/tests.

## Recovery and acceptance

Inspect status and private durable evidence after interruption. A consumed grant,
Completed operation or Prepared/Running/Uncertain operation cannot be blindly
replayed. Preserve locks, uncertain markers and orphan artifacts until an operator
reconciles the exact operation. Do not delete the journal/key to bypass a conflict.
The [L2 protocol](phase9-l2-approval-resume-design.md) retains schema migration,
HMAC, lease/fencing and host key/retention limits.

Gate B's offline evidence covers cross-process artifact retrieval, independent
GitHub identity mapping, self-approval rejection, scoped roles, exact application,
replay rejection, original unchanged and zero provider calls on resume. This is
separate from actual two-account GitHub interoperability and native storage
acceptance, which remain pending. No Phase 9C repair or publication is enabled.

Personal fixtures additionally prove same-account durable decisions, exact review
binding, rejection of serialized/fake intent, policy-change rejection and continuation
in a new process with no provider calls and original source intact. The native
Personal dialog and live single-account workflow are not verified by those fixtures.
They were subsequently verified in a separate owner-authorized real workflow,
execution `9850ba04-d5d9-4204-9322-ebf99ef6c5f9`, with independent journal/artifact
inspection after the human confirmed. See the [actual report](phase9-real-acceptance-report.md).
An applied patch never grants `sandbox.validate`: the host coordinator requests and
records a separate approval, while the CLI stays gated pending real Gate C evidence.
