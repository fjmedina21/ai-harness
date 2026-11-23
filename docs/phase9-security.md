# Phase 9 threat model

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

## Phase 9A OpenAI security review

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
with an explicit host-selected maximum of 120 seconds. OpenAI text requests now
include max_output_tokens; the omission in the previous adapter was corrected and
has wire-level regression coverage.

Optional telemetry reuses registered host-created bindings, fixed labels and
bounded attributes (including validated digest/state/iteration); no prompts, source,
patch bodies, raw errors or credentials are recorded. CLI JSON contains reviewable
code by explicit request and must be handled as sensitive local output, not telemetry.
The full new live workflow is unverified; direct API evidence does not validate
container isolation, semantic correctness or production safety. L3 remains blocked.
