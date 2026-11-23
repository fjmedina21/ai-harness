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
