# Phase 9 threat model

## Phase 9A.3 authentication and Phase 9B boundary

Core L2 Resume adds private authenticated artifacts, SQLite v2 immutable proposal
bindings, scoped decisions through the existing approval service, and leased
apply-only continuation. Host state stays outside the source project. HMAC keys are
0600 host-owned random material; no identity is authenticated with a content hash.
GitHub App OAuth + PKCE now supplies per-action/resource identity verification.
The host verifies app-bound OAuth credentials and `/user` online; no JWT claim is
an authenticated identity. Numeric account IDs, current scoped role assignments and
expiration are rechecked. macOS Keychain protects access/refresh tokens and the App
secret outside the project; other OS adapters fail closed. CLI lifecycle access
requires that verified session and does not accept credentials in argv. Live
GitHub/native Keychain acceptance remains pending. See [authentication](phase9-github-authentication.md).
Requester self-approval, challenge/patch/policy/snapshot substitution and consumption
replay fail closed. Reader, approver and operator entitlements are separate.

Lease acquisition atomically CAS-checks the Approved operation version and transfers
ownerSession with increasing epoch, operator identity, state version and bounded
history. No transfer from Prepared/Running/Uncertain is allowed, including expired
leases. Synchronous fence checks guard each patch mutation boundary; the persistent
workspace lock and uncertainty markers remain. Multi-file writes are not atomic,
same-UID malicious races are outside the private-host boundary, and no exactly-once
external effects are promised. Unknown persistence acknowledgments retire the owner;
orphan artifacts and uncertain effects are retained, never reconstructed or replayed.

Artifacts include sensitive patch/diff only in private files, never telemetry. The
new engineering.resume observer event admits closed labels/operation IDs only;
observer failure cannot authorize or alter durable state. No credentials, private
paths, SQL, source or patch bodies enter error/telemetry messages. Original source is
read-only. Ordinary tests do not execute generated code. Phase 9B supplies a bounded
stdin snapshot transport and fixed host Node validation profiles through the
existing Podman-only restrictions, separate independent shell action approval and
durable evidence. The CLI remains gated pending actual isolation/transfer/workload
acceptance. Fixtures validate composition, not live identity/storage or VM safety.
Key rotation/backup/retention and independent review remain operational duties.
See [implemented threat/protocol details](phase9-l2-approval-resume-design.md) and
[Phase 9B threat model](phase9b-security.md).


Experimental local engineering, trusted host and private same-user filesystem.
Model prompts, repository text, proposed code, dependencies and test configuration
are untrusted. Workspace receipts, policies, approvals and executable registries
are host authority. Diagnostic identifiers are never authority.

| Threat | Required mitigation / remaining boundary |
| --- | --- |
| Prompt injection | Repository text is data; fixed host scope, roles and tools; no policy from .ai |
| Malicious generated code / exfiltration | Never execute on host; real L3 disabled; no credentials copied; filename filters cannot discover every secret |
| Traversal / reserved paths | Canonical relative ASCII paths, explicit host selection, deny metadata/secrets/dependency directories |
| Symlinks / hardlinks / devices | lstat each component, regular files only, nlink=1, no-follow opens, identity rechecks |
| TOCTOU | Private root, exclusive locks, before/after identity and digest checks; no atomic rooted filesystem claim; hostile same-UID races out of supported boundary |
| Dependency confusion / install scripts | No dependency installation or package scripts on host; offline pinned sandbox dependency provisioning remains blocked |
| Hostile build / container escape | Retain Podman-only restrictions; no generated-code runtime until snapshot-transfer gate and real dedicated-machine tests |
| Resource abuse | Bounded selection/files/bytes, patch budgets, calls/tokens/cost/iterations/time and logs; cancellation cannot preempt synchronous trusted host callbacks |
| Approval substitution / replay | Existing transactional SQLite single-use scopes plus patch/base/policy digest; exact identity; no agent self-approval |
| Partial modifications | No multi-file atomic claim; persistent lock/uncertain evidence; fail closed and retain files |
| Workspace/checkpoint/journal divergence | Rehash actual inventory; inspect durable states on reopen; no replay or automatic continuation |
| Cleanup failure / interrupted validation | Stop with Uncertain, retain evidence, independent host reconciliation |

No production safety, race-free sandbox, exactly-once, live model interoperability,
remote isolation or complete semantic correctness is established by fixture tests.
L1/L2 local tests cannot establish L3 container security. A successful build only
reports the selected validation result. Human review is required before delivery;
promotion into the source repository is out of scope.

## Implementation review

The implementation bounds serialized tool results as well as raw bytes, checks
prospective net diff before effects, verifies the expected whole resulting inventory,
and distinguishes unknown provider usage. SQLite patch self-approval is denied in
the existing decision transaction. Validation fixture calls enter the journal before
invocation; cancellation/malformed evidence leaves Uncertain. Recovery verifies the
receipt against the durable creation digest and never grants retry. Cleanup is a
separate exact-snapshot host-only operation and preserves uncertain workspaces.
Current evidence and unpassed gates are listed in [verification](phase9-e2e.md).

## Historical Phase 9A OpenAI security review

The model receives only explicitly selected source text/hashes, bounded advisory
history, diagnostic identity and relative-path/operation policy. It receives no
keys, original absolute roots, journal handles or approval callbacks. The host
clones authority-bearing options and rechecks file content against snapshot hashes.
The generic role bridge binds one execution, disallows concurrent/reused/closed
instances, sends one stateless provider request per turn and has no model tools.
Unexpected native calls/refusals/JSON fail closed; no text extraction, fallback,
retry or model-requested command execution exists. A project file can still contain
secrets: filename restrictions are not comprehensive detection, so the host must
review its explicit selection before external transmission.

Existing Phase 9 operations and schemas remain the enforcement boundary. A null
model resultHash is materialized by the host; a supplied wrong hash, bad base,
unsafe path/operation or extra authority field is rejected. Code review is advisory.
Every L2 application still needs a different authenticated approver and the exact
SQLite-bound digest/base/policy/expiry. No approval/resume CLI is added. Test IdP
identities are fixtures, not deployed authentication. Original roots remain read-only.

Budget policy is explicit: max requests/turns/context/output/total reported tokens,
finite wall time and host-rate reservations. Exact billing cannot be promised;
--allow-uncertain-cost is required even with tariffs. Missing usage stops calls;
unknown cost is null/unknown. Cancellation can leave upstream spend unknown and
never authorizes automatic retry. The default provider deadline remains 30 seconds,
with an explicit host-selected HTTP ceiling of 300 seconds after stabilization;
global/role/absolute deadlines independently shorten it. OpenAI CLI global default
is 120 seconds. The old shared 120-second ceiling is a historical snapshot. OpenAI text requests now
include max_output_tokens; the omission in the previous adapter was corrected and
has wire-level regression coverage.

Optional telemetry reuses registered host-created bindings, fixed labels and
bounded attributes (including validated digest/state/iteration); no prompts, source,
patch bodies, raw errors or credentials are recorded. CLI JSON contains reviewable
code by explicit request and must be handled as sensitive local output, not telemetry.
The older synthetic full workflow passed under a temporary 600-second profile.
The stabilization policy passed its separately authorized synthetic acceptance run
on 2ce8717 in 262.44s with a 360s/180s/180s profile;
neither establishes general semantic correctness, container isolation or production
safety. L3 remains blocked.


## Stabilization security review

Longer time allowances remain finite trusted-host settings. Models/project files
cannot choose deadlines, roles, budgets or approvals. One monotonic global deadline
clips role signals and HTTP cancellation. Explicit checks stop synchronous callbacks
from silently clearing expired timers; trusted JavaScript callbacks cannot be
preempted. Terminal persistence has one separate finite allowance, not an extension
for provider/mutation work. Delivered results are detached snapshots, so late
callbacks cannot mutate them. Cancellation does not establish upstream billing.

No security rehash or required role was removed. Telemetry adds only closed labels
and bounded counts/durations; observer failure cannot authorize work. No keys,
source or patches enter metrics. Benchmarks use actual temporary files/SQLite with
HTTP mocked and trusted fixture identities, not a deployed authenticator. Existing
ownerSession checks and recovery blocks stay in place.
The [L2 design](phase9-l2-approval-resume-design.md) requires private durable artifacts,
independent authentication, fenced leases/CAS and reconciliation before continuation.
No insecure approve flag, uncertain replay, native-session resume or real L3 is added.
