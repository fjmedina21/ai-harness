# Phase 6 — durable operations and conservative recovery

Implemented locally on the Phase 6 branch. Experimental, opt-in, single-host
execution support; no automatic workflow resume or external exactly-once claim.
The workspace remains at published version 0.5.0 pending release review.

## Architecture and persistence decision

Contracts define the domain and a synchronous trusted-host storage port.
Checkpointing implements SQLite and inspection-only recovery; security provides
bounded canonical digests and the identity-verifying approval service.
ToolDispatcher owns authorization and invokes the journal only after registry,
Default Deny, permission and handler checks. Agents supply task/call identity
from the host execution context. Providers never receive storage/approval APIs.

| Option | Benefits | Costs for this phase |
| --- | --- | --- |
| SQLite | Local transactions, unique constraints, interprocess locking, crash recovery | One writer; synchronous calls; filesystem/SQLite assumptions |
| Append-only JSONL | Simple audit/export, sequential writes | Custom transaction, locking, uniqueness and torn-record recovery protocol |
| Atomic JSON snapshots | Easy inspection and existing checkpoint compatibility | Lost concurrent updates without another locking protocol; no atomic multi-entity authorization |
| External SQL/service | Central coordination and remote clients | Infrastructure, credentials and operations unjustified for this single-host scope |

Selected: built-in node:sqlite, loaded only when the host opens the durable
store. No new external dependency. Durable mode requires Node 22.13+ or Node 24
(tested on 24.18.0); legacy CLI/text workflows retain Node >=22.
Short synchronous BEGIN IMMEDIATE transactions never contain network, model,
verifier or handler work. Opens/approval reads also use a consistent transaction
for cross-record validation.

Use a host-selected, already-created, canonical absolute directory with mode
0700, owned by the current user, outside untrusted repository-controlled data.
Database files must be regular, single-link and mode 0600. Symlink directories,
symlink/hardlink databases, unsafe sidecars and WAL files are rejected.
Supported profile: private local filesystem honoring SQLite locks/sync; do not
use network or cloud-synchronized storage. Filesystem-type detection is not
provided. Host-owned code and OS remain trusted.

Configuration: journal_mode=DELETE, synchronous=EXTRA, fullfsync=ON, foreign keys,
trusted_schema=OFF, 1-second busy timeout and maximum 64 MiB database.
DELETE avoids WAL checkpoint/sidecar growth complexity at the cost of writer
serialization. The host may lower the cap in 4096-byte multiples to at least
64 KiB. Limits: 10,000 operations, 32 events per operation, 8192 UTF-8 bytes per
record, 1000 records per query, 16,384 bytes of canonical tool JSON.
Opening validates schema/application versions, physical quick-check, foreign
keys, checksums, request hashes, approval coherence and contiguous event states.
Corruption/storage failure rejects work; no automatic deletion, repair or reset.

SQLite atomicity depends on storage and OS guarantees; process-kill tests
do not establish power-loss/hardware durability.
See [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html) and
[SQLite pragmas](https://www.sqlite.org/pragma.html).

## Schema version 1

PRAGMA user_version=1; application ID 1095321654.

| Table | Identity and constraints | Persisted domain data |
| --- | --- | --- |
| operations | PK operation_id; UNIQUE(execution_id, task_id, request_id); UNIQUE(execution_id, task_id, tool_call_id) | Scope, session, state, version, timestamps, result digest/evidence reference; checked JSON + checksum |
| approvals | PK approval_id; UNIQUE operation_id FK | Requester, approver, exact scope digest, expiry, status; checked JSON + checksum |
| events | Monotonic sequence PK; operation_id FK and index | State/version, event type, timestamp, actor/evidence reference; checked JSON + checksum |

Operation, approval and event mutations commit or roll back together.
No raw arguments, handler outputs, credentials or exception contents are saved.
Result digests permit correlation, not reconstruction or proof of external
execution. Identity/evidence references must be bounded opaque host metadata
without secrets. Checksums detect accidental corruption, not tampering by the
file owner. This is an authorization journal, not merely JSONL audit.

## States and authorization

~~~mermaid
stateDiagram-v2
  [*] --> Created
  Created --> PendingApproval
  Created --> Prepared: approval not required
  PendingApproval --> Approved: verified host decision
  Approved --> Prepared: consume approval atomically
  Prepared --> Running: persist before handler
  Running --> Completed: durable result digest
  Running --> Uncertain: failure / cancellation / lost result
  Prepared --> Uncertain: host interruption reconciliation
  Uncertain --> Completed: host confirmed completion evidence
  Uncertain --> Cancelled: host confirmed no-effect evidence
~~~

Created/PendingApproval/Approved/Prepared may terminate as Cancelled before
invocation. Denial/revocation/expiry transitions and their events are durable.
Completed/Failed/Cancelled are terminal; Uncertain is blocked and reconcilable.
Failed is reserved in the domain transition graph for a host-known pre-execution
failure; dispatcher handler failures always become Uncertain. A thrown handler
exception does not establish that side effects did not happen.

Preparation consumes a grant in the same transaction that records Prepared.
Execution requires matching operation, scope, version and store session, plus
normal policy. Expiry is checked on decision, preparation and before Running.
The grant remains consumed when cancellation/expiry occurs after preparation.
Durable mode never falls back to legacy in-memory approvals.
DurableApprovalService invokes a trusted ApproverIdentityVerifier and requires
harness:approver. This supplies a verifier integration, not a deployed IdP.
Low-level decision/reconciliation APIs are trusted host capabilities; do not
expose them as tools or untrusted endpoints.

Every open creates a new host session. An old Created/Approved/Prepared/Running
operation cannot continue through it; pending/approved grants cannot be
decided/consumed from a reopened store. Persisted decisions remain inspectable.
Another process cannot consume the original process grant. This deliberately
trades cross-process handoff availability for conservative authorization.
Opening does not revoke live peers or declare them dead.

## Identity, duplicates and failure windows

Operation ID is SHA-256 of the fixed encoding of execution/task/request identity.
The immutable scope hash additionally binds call ID, canonical project root,
tool, canonical argument digest, permission, risk, safety, requester and approval
requirement. Call IDs remain provider correlation data, never authority.

| Existing record | Dispatch behavior |
| --- | --- |
| Changed scope under same request, or same call under another request | Reject |
| PendingApproval | Return the same approval request, no handler |
| Approved in the original session | Require its exact grant; then atomic one-use preparation |
| Duplicate Created or Prepared/Running | Block; no automatic retry |
| Completed | Report existing completion and block; no result replay from storage |
| Failed/Cancelled | Require a separately reviewed new request |
| Uncertain | Block until trusted host reconciliation |

Distinct deliberate request/call IDs are new operations, not semantic duplicate
detection. The host must not mint a new ID merely to bypass uncertain effects.
Safety classifications are host metadata; even read-only work is never
automatically retried by recovery. A reviewed retry is a new request with normal
policy and fresh approval if required, after evidence establishes safety.

Before Prepared commits, no handler can start. After Prepared commits, approval
is consumed even if Running never starts. Running commits before the handler;
interruption can therefore mean no effect, a partial effect or a completed
effect. Handler failure/cancellation records Uncertain if storage is available.
A failed completion commit/acknowledgement never returns executed; inspection
can find Running, Uncertain or Completed. No transaction spans SQLite and an
external tool. Cancellation is not rollback.

## Host integration and migration

Existing signatures gain optional host bindings/signals; complete() and
provider-native protocols are unchanged. No repository-selected database,
automatic CLI command, approval issuer or privileged handler is added.

~~~ts
import { openSqliteOperationJournal, inspectPendingDurableRecovery } from "@ai-harness/checkpointing";
import { createReadOnlyToolCallingAgent } from "@ai-harness/agents";
import { Orchestrator } from "@ai-harness/orchestrator";

const store = await openSqliteOperationJournal(hostPrivateDatabasePath);
try {
  const durableOperations = {
    store,
    requester: hostVerifiedRequester,
    safetyByTool: { "file.read": "read_only" as const },
  };
  const agent = createReadOnlyToolCallingAgent({
    role: "software-architect",
    systemPrompt: "Review using verified tool data.",
    provider: hostSelectedProvider,
    requireApprovalFor: hostApprovalPolicy,
  });
  const orchestrator = new Orchestrator();
  orchestrator.register(agent);
  await orchestrator.run({
    request: hostRequest, tasks: hostTasks, projectRoot: hostProjectRoot,
    model: hostSelectedProvider, grantedPermissions: ["files:read"],
    checkpointStore: hostCheckpointStore, signal: hostSignal, durableOperations,
  });
  const inspection = inspectPendingDurableRecovery(store);
} finally {
  store.close();
}
~~~

All host-prefixed variables are supplied and secured by the host. Alternatively
bind durableOperations directly in the read-only factory or third ToolDispatcher
constructor argument. Conflicting context bindings are denied.
Direct dispatch also requires context.operation with trusted task and stable
request identity. ToolCallingAgent derives it from host task + parsed call ID;
ToolAugmentedAgent uses host task + context-file index.

Approvals stop/close the agent loop; no model-session or task resumption is
introduced. The host can inspect pending records and use DurableApprovalService,
then explicitly dispatch the original trusted request in its original store
session with the approval ID. Raw arguments are not recoverable from the
journal. After reopening, old grants cannot be used; quiesce/reconcile and review
a new request instead. Operation completion does not silently mark a previous
failed task successful.

With orchestrator durable opt-in, a supplied checkpoint store records task
Running before invoking its agent. A checkpoint failure blocks agent execution.
JSON runtime checkpoints remain separate from SQLite; cross-store atomicity
and durable provider transcripts are not provided. Default CLI/SDD remain
non-durable unless the programmatic host explicitly opts in.

## Recovery runbook

1. Open the private store; do not recreate it on errors.
2. Page through pending(after, limit) / inspectPendingDurableRecovery; retain
   the last operation ID as cursor. list(executionId, after, limit) scopes inspection.
3. Stop/fence all relevant dispatchers and external workers before claiming
   interruption. A restart or elapsed time alone does not prove this.
4. Call reconcile(id, version, actor, { kind: "host_quiesced", reference: hostEvidenceId })
   for abandoned nonterminal work. Unstarted records become Cancelled and grants
   revoked; Prepared/Running become Uncertain. Decisions are atomic and journaled.
5. Inspect external state. Only trusted completion evidence permits
   confirmed_completed; absence-of-effect evidence permits confirmed_no_effect.
   These resolve Uncertain to Completed/Cancelled.
6. Conflicting versions or unavailable storage require fresh inspection, never
   automatic retry. No model result/claim is reconciliation evidence.
7. Review any new request independently. There is no automatic resume/replay API.

The host authenticates/authorizes reconciliation actors. The port checks
identity shape and transitions; it cannot verify an external evidence ID,
stop a foreign process or provide distributed fencing.
See [security and residual risks](phase6-security.md) and [verification](VERIFICATION.md).

## Failure retirement

A native storage failure or ambiguous transaction acknowledgement permanently
retires that store instance for execution. The dispatcher also retires its
binding after an unavailable storage-port call or failed started operation.
Retired sessions cannot register, decide, prepare, start or finish execution;
inspection, revocation and host reconciliation remain possible if storage works.
A rolled-back consumption can remain recorded as approved, but cannot be used
by the retired instance or any reopened session. Invalid requests/policy/scope
rejections are not storage outages. There is no automatic session reset or retry.
