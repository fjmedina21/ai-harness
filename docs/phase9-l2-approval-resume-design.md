# L2 approval and resume design

The implemented protocol is single-owner Personal L2. Authentication, current
project authorization and exact human approval are independent checks. See
[architecture](ARCHITECTURE.md), [operational lifecycle](phase9-operational-l2.md)
and [Personal review](phase9-personal-mode.md).

Proposal artifacts are bounded, private, HMAC authenticated and create-only. New
CLI artifacts include a digest of the complete host project authorization. SQLite
binds operation, artifact, exact review and a random expiring challenge before
publishing ApprovalPending. Human intent is a non-serializable in-process receipt;
its unique ID and durable decision commit together. Serialized claims cannot grant.

Continuation verifies the online owner/capability and current fingerprint, reopens
artifact/source/workspace, restores and validates the exact patch/policy/diff,
acquires the existing CAS lease with monotonic fencing, consumes the grant and
applies only to the private workspace. It has no provider/model port.

Approved effect-free sandbox operations use that same lease mechanism with a new
exact action grant. Prepared/Running/Uncertain/Completed effects never replay.
Evidence may be reopened without execution; unknown results/cleanup require
reconciliation. No exactly-once or filesystem/SQLite transactionality guarantee.
Historical Team records remain read-only audit evidence. [Migration](single-developer-migration.md)
requires fresh operational proposals rather than rewriting owner/scope/expiry.
The [earlier design](history/phase9-l2-original-design.md) is historical only.
