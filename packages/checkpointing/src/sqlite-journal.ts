import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  assertOperationTransition, OPERATION_STATES, DurableStoreError, normalizeApprovalPolicy, approvalPolicyJson, canonicalProposalJson,
  type ApprovalPolicy, type ApprovalReviewInput, type ApprovalReviewContext, type HumanIntentReceipt,
  type DurableOperation, type OperationRequest,
  type DurableApproval, type HostIdentity, type OperationEvent,
  type OperationState, type ReconciliationEvidence, type EngineeringResumeStore, type ProposalReference, type ApprovalDecisionBinding, type ContinuationLease,
} from "@ai-harness/contracts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
function check(condition: unknown): asserts condition {
  if (!condition) throw new DurableStoreError("invalid");
}
function identity(value: HostIdentity): HostIdentity {
  check(value && typeof value.issuer === "string" && typeof value.subject === "string");
  check(idPattern.test(value.issuer) && idPattern.test(value.subject));
  return { issuer: value.issuer, subject: value.subject };
}
function requestOf(raw: OperationRequest): OperationRequest {
  check(raw && typeof raw === "object");
  check(Object.keys(raw).every(k => [
    "executionId", "taskId", "requestId", "toolCallId", "projectRoot", "toolId",
    "argumentDigest", "permission", "risk", "safety", "requester", "requiresApproval",
  ].includes(k)));
  for (const key of ["executionId", "taskId", "requestId"] as const)
    check(typeof raw[key] === "string" && idPattern.test(raw[key]));
  check(raw.toolCallId === undefined || (typeof raw.toolCallId === "string" && idPattern.test(raw.toolCallId)));
  check(typeof raw.projectRoot === "string" && path.isAbsolute(raw.projectRoot) && raw.projectRoot.length <= 1024);
  check(typeof raw.toolId === "string" && /^[a-z][a-z0-9._-]{0,127}$/.test(raw.toolId));
  check(typeof raw.argumentDigest === "string" && digestPattern.test(raw.argumentDigest));
  check(["files:read", "files:write", "shell:execute", "git:write", "deployment:execute"].includes(raw.permission));
  check(["low", "medium", "high", "critical"].includes(raw.risk));
  check(["read_only", "side_effecting"].includes(raw.safety));
  check(typeof raw.requiresApproval === "boolean");
  // Fixed property order is part of schema version 1 scope hashing.
  return {
    executionId: raw.executionId, taskId: raw.taskId, requestId: raw.requestId,
    ...(raw.toolCallId === undefined ? {} : { toolCallId: raw.toolCallId }),
    projectRoot: path.resolve(raw.projectRoot), toolId: raw.toolId,
    argumentDigest: raw.argumentDigest, permission: raw.permission, risk: raw.risk,
    safety: raw.safety, requester: identity(raw.requester), requiresApproval: raw.requiresApproval,
  };
}
function requestFromOperation(op: DurableOperation): OperationRequest {
  return requestOf({
    executionId: op.executionId, taskId: op.taskId, requestId: op.requestId,
    ...(op.toolCallId === undefined ? {} : { toolCallId: op.toolCallId }),
    projectRoot: op.projectRoot, toolId: op.toolId, argumentDigest: op.argumentDigest,
    permission: op.permission, risk: op.risk, safety: op.safety,
    requester: op.requester, requiresApproval: op.requiresApproval,
  });
}
function operationId(req: OperationRequest): string {
  return hash(JSON.stringify([req.executionId, req.taskId, req.requestId]));
}
function timestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function encode(value: unknown): [string, string] {
  const text = JSON.stringify(value);
  check(Buffer.byteLength(text) <= 8192);
  return [text, hash(text)];
}
function decode<T>(row: Record<string, unknown>): T {
  check(typeof row.data === "string" && typeof row.checksum === "string");
  check(Buffer.byteLength(row.data) <= 8192 && hash(row.data) === row.checksum);
  const result: unknown = JSON.parse(row.data);
  check(result && typeof result === "object" && !Array.isArray(result));
  return result as T;
}

/** Historical policy decoding only. New requests always use normalizeApprovalPolicy. */
function archivedApprovalPolicyJson(raw: unknown): string {
  const p = raw as Record<string, unknown>;
  if (p?.mode === "team") {
    check(Object.keys(p).sort().join() === ["version", "mode", "requireHumanConfirmation", "allowRequesterApproval", "requireExactPatchReview", "requireSeparateSandboxApproval"].sort().join() &&
      p.version === 1 && p.requireHumanConfirmation === true && p.allowRequesterApproval === false && p.requireExactPatchReview === true && p.requireSeparateSandboxApproval === true);
    return JSON.stringify({ version: 1, mode: "team", requireHumanConfirmation: true, allowRequesterApproval: false, requireExactPatchReview: true, requireSeparateSandboxApproval: true });
  }
  return approvalPolicyJson(raw);
}

export interface SqliteJournalOptions {
  now?: () => number;
  approvalTtlMs?: number;
  /** Host may lower, never raise, the 64 MiB database cap. */
  maxDatabaseBytes?: number;
  approvalPolicy?: ApprovalPolicy;
}

/** Private local filesystem only. Host directory must already exist, mode 0700.
 * Lazy loading preserves non-durable operation on older Node 22 installations.
 */
export async function openSqliteOperationJournal(
  filename: string, options: SqliteJournalOptions = {},
): Promise<EngineeringResumeStore> {
  let db: DatabaseSync | undefined;
  try {
    check(path.isAbsolute(filename));
    const directory = path.dirname(filename);
    check(realpathSync(directory) === directory);
    const dir = lstatSync(directory);
    check(dir.isDirectory() && (dir.mode & 0o777) === 0o700 && dir.uid === process.getuid?.());
    let created = false;
    try {
      const fd = openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { fsyncSync(fd); } finally { closeSync(fd); }
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stat = lstatSync(filename);
    check(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600 && stat.uid === dir.uid);
    check(stat.size <= (options.maxDatabaseBytes ?? 64 * 1024 * 1024));
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      try {
        const side = lstatSync(filename + suffix);
        check(side.isFile() && side.nlink === 1 && side.uid === dir.uid && (side.mode & 0o077) === 0);
        check(suffix === "-journal"); // Preserve hot journals; WAL is unsupported.
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const native = await import("node:sqlite");
    db = new native.DatabaseSync(filename, { enableForeignKeyConstraints: true, allowExtension: false });
    const store = new SqliteOperationJournal(db, options);
    if (created) {
      const fd = openSync(directory, constants.O_RDONLY);
      try { fsyncSync(fd); } finally { closeSync(fd); }
    }
    return store;
  } catch {
    try { db?.close(); } catch { /* Never discard/recreate failed authorization state. */ }
    throw new Error("Durable journal unavailable or invalid");
  }
}

class SqliteOperationJournal implements EngineeringResumeStore {
  private readonly session = randomUUID();
  private inTransaction = false;
  private executionHealthy = true;
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly approvalPolicy: ApprovalPolicy;
  constructor(private readonly db: DatabaseSync, options: SqliteJournalOptions) {
    this.approvalPolicy = normalizeApprovalPolicy(options.approvalPolicy);
    this.now = options.now ?? Date.now; this.ttl = options.approvalTtlMs ?? 60_000;
    check(Number.isSafeInteger(this.ttl) && this.ttl > 0 && this.ttl <= 300_000);
    db.exec("PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON;");
    check(db.prepare("PRAGMA journal_mode=DELETE").get()?.journal_mode === "delete");
    check(db.prepare("PRAGMA synchronous").get()?.synchronous === 3);
    check(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys === 1);
    check(db.prepare("PRAGMA page_size").get()?.page_size === 4096);
    const bytes = options.maxDatabaseBytes ?? 64 * 1024 * 1024;
    check(Number.isSafeInteger(bytes) && bytes >= 65_536 && bytes <= 64 * 1024 * 1024 && bytes % 4096 === 0);
    db.exec("PRAGMA max_page_count=" + bytes / 4096);
    this.transaction(() => {
      const version = db.prepare("PRAGMA user_version").get()?.user_version;
      if (version === 0) {
        check(db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get() === undefined);
        db.exec([
          "CREATE TABLE operations (operation_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, task_id TEXT NOT NULL,",
          "request_id TEXT NOT NULL, tool_call_id TEXT, state TEXT NOT NULL CHECK(state IN",
          "('Created','PendingApproval','Approved','Prepared','Running','Completed','Failed','Cancelled','Uncertain')),",
          "version INTEGER NOT NULL CHECK(version>=0), data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL,",
          "UNIQUE(execution_id,task_id,request_id), UNIQUE(execution_id,task_id,tool_call_id)) STRICT;",
          "CREATE TABLE approvals (approval_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES operations(operation_id),",
          "status TEXT NOT NULL CHECK(status IN ('pending','approved','denied','revoked','expired','consumed')),",
          "data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL) STRICT;",
          "CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL REFERENCES operations(operation_id),",
          "data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL) STRICT;",
          "CREATE INDEX execution_operations ON operations(execution_id,operation_id);",
          "CREATE INDEX operation_events ON events(operation_id,sequence);",
          "PRAGMA application_id=1095321654; PRAGMA user_version=1;",
        ].join("\n"));
      }
      if (db.prepare("PRAGMA user_version").get()?.user_version === 1) {
        db.exec(`CREATE TABLE engineering_proposals (operation_id TEXT PRIMARY KEY REFERENCES operations(operation_id), data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL) STRICT, WITHOUT ROWID;
          CREATE TABLE continuation_leases (execution_id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL) STRICT, WITHOUT ROWID;
          CREATE TABLE continuation_lease_events (execution_id TEXT NOT NULL, epoch INTEGER NOT NULL, data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL, PRIMARY KEY(execution_id,epoch)) STRICT, WITHOUT ROWID;
          PRAGMA user_version=2;`);
      }
      if (db.prepare("PRAGMA user_version").get()?.user_version === 2) {
        db.exec(`CREATE TABLE approval_reviews (operation_id TEXT PRIMARY KEY REFERENCES operations(operation_id), data TEXT NOT NULL CHECK(length(data)<=8192), checksum TEXT NOT NULL) STRICT, WITHOUT ROWID;
          CREATE TABLE human_confirmation_ids (confirmation_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES operations(operation_id)) STRICT, WITHOUT ROWID;
          PRAGMA user_version=3;`);
      }
      check(db.prepare("PRAGMA user_version").get()?.user_version === 3);
      check(db.prepare("PRAGMA application_id").get()?.application_id === 1095321654);
    });
    this.transaction(() => {
    check(db.prepare("PRAGMA quick_check(1)").get()?.quick_check === "ok");
    check(db.prepare("PRAGMA foreign_key_check").get() === undefined);
    check(Number(db.prepare("SELECT COUNT(*) AS count FROM operations").get()?.count) <= 10_000);
    for (const row of db.prepare("SELECT * FROM operations").iterate()) {
      const op = this.readOperation(row);
      if (op.requiresApproval) check(this.approval(op.approvalId!) !== null);
      const events = this.events(op.operationId);
      check(events.length === op.version + 1 && events[0]?.state === "Created");
      for (let i = 0; i < events.length; i++) {
        check(events[i]!.version === i);
        if (i > 0) assertOperationTransition(events[i - 1]!.state, events[i]!.state);
      }
      check(events.at(-1)?.state === op.state && events.at(-1)?.timestamp === op.updatedAt);
    }
    for (const row of db.prepare("SELECT * FROM approvals").iterate()) this.readApproval(row);
    for (const row of db.prepare("SELECT * FROM events").iterate()) this.readEvent(row);
    for (const row of db.prepare("SELECT * FROM engineering_proposals").iterate()) this.proposal(String(row.operation_id));
    for (const row of db.prepare("SELECT * FROM approval_reviews").iterate()) this.approvalReview(String(row.operation_id));
    for (const row of db.prepare("SELECT * FROM human_confirmation_ids").iterate()) {
      const op = this.get(String(row.operation_id)), grant = op?.approvalId && this.approval(op.approvalId);
      check(grant && grant.decision?.intent?.id === row.confirmation_id);
    }
    for (const row of db.prepare("SELECT * FROM continuation_leases").iterate()) {
      const lease = this.lease(String(row.execution_id))!;
      const history = db.prepare("SELECT * FROM continuation_lease_events WHERE execution_id=? ORDER BY epoch LIMIT 65").all(lease.executionId);
      check(history.length === lease.epoch && history.length <= 64);
      history.forEach((event, index) => {
        const previous = decode<ContinuationLease>(event);
        check(previous.executionId === lease.executionId && previous.epoch === index + 1 && event.epoch === index + 1);
        this.validateLease(previous, lease.executionId);
      });
      check(JSON.stringify(decode(history.at(-1)!)) === JSON.stringify(lease));
    }
    check(db.prepare("SELECT execution_id FROM continuation_lease_events WHERE execution_id NOT IN (SELECT execution_id FROM continuation_leases) LIMIT 1").get() === undefined);
    });
  }
  private transaction<T>(fn: () => T): T {
    let began = false;
    try {
      this.db.exec("BEGIN IMMEDIATE"); began = true; this.inTransaction = true;
      const result = fn(); this.db.exec("COMMIT"); return result;
    } catch (error) {
      if (began) { try { this.db.exec("ROLLBACK"); } catch { /* Ambiguous commit: never replay. */ } }
      if (error instanceof DurableStoreError && error.code === "invalid") throw error;
      this.retireSession();
      throw new DurableStoreError("unavailable");
    } finally { if (began) this.inTransaction = false; }
  }
  private time(): string {
    const value = this.now(); check(Number.isSafeInteger(value) && value >= 0);
    return new Date(value).toISOString();
  }
  private readOperation(row: Record<string, unknown>): DurableOperation {
    const op = decode<DurableOperation>(row); const req = requestFromOperation(op);
    check(op.operationId === row.operation_id && op.operationId === operationId(req));
    check(op.executionId === row.execution_id && op.taskId === row.task_id && op.requestId === row.request_id);
    check((op.toolCallId ?? null) === row.tool_call_id);
    check(op.state === row.state && OPERATION_STATES.includes(op.state));
    check(op.version === row.version && Number.isSafeInteger(op.version) && op.version >= 0);
    check(op.scopeDigest === hash(JSON.stringify(req)));
    check(typeof op.ownerSession === "string" && /^[a-f0-9-]{36}$/.test(op.ownerSession));
    check(timestamp(op.createdAt) && timestamp(op.updatedAt));
    check(op.approvalId === (op.requiresApproval ? "approval:" + op.operationId : undefined));
    check(op.resultDigest === undefined || (typeof op.resultDigest === "string" && digestPattern.test(op.resultDigest)));
    check(op.evidenceRef === undefined || (typeof op.evidenceRef === "string" && idPattern.test(op.evidenceRef)));
    return op;
  }
  private readApproval(row: Record<string, unknown>): DurableApproval {
    const grant = decode<DurableApproval>(row);
    check(grant.approvalId === row.approval_id && grant.operationId === row.operation_id && grant.status === row.status);
    check(["pending", "approved", "denied", "revoked", "expired", "consumed"].includes(grant.status));
    identity(grant.requester); if (grant.approver) identity(grant.approver);
    check(timestamp(grant.expiresAt) && timestamp(grant.updatedAt));
    const op = this.get(grant.operationId);
    check(op && op.approvalId === grant.approvalId && op.scopeDigest === grant.scopeDigest);
    check(JSON.stringify(op.requester) === JSON.stringify(grant.requester));
    check(!["approved", "consumed", "denied", "revoked"].includes(grant.status) || grant.approver);
    check(
      (grant.status === "pending" && op.state === "PendingApproval") ||
      (grant.status === "approved" && op.state === "Approved") ||
      (["denied", "revoked", "expired"].includes(grant.status) && op.state === "Cancelled") ||
      (grant.status === "consumed" && ["Prepared", "Running", "Completed", "Cancelled", "Uncertain"].includes(op.state))
    );
    if (grant.decision) {
      const c = this.approvalReview(grant.operationId), d = grant.decision;
      check(Object.keys(d).sort().join() === ["mode", "policyVersion", "policyDigest", "challengeDigest", "patchDigest", "snapshotDigest", "workspaceId", "authorizationScope", "approvedAt", "requester", "approver", ...(d.intent ? ["intent"] : [])].sort().join());
      check(c && grant.approver && d.mode === c.policy.mode && d.policyVersion === c.policy.version && d.policyDigest === c.policyDigest && d.challengeDigest === hash(c.challenge) &&
        d.patchDigest === c.patchDigest && d.snapshotDigest === c.snapshotDigest && d.workspaceId === c.workspaceId && d.authorizationScope === c.scopeDigest && timestamp(d.approvedAt) &&
        JSON.stringify(d.requester) === JSON.stringify(grant.requester) && (grant.status === "revoked" || JSON.stringify(d.approver) === JSON.stringify(grant.approver)));
      if (d.mode === "personal") {
        check(d.intent && Object.keys(d.intent).sort().join() === ["id", "bindingDigest", "issuedAt", "expiresAt", "method"].sort().join() && digestPattern.test(d.intent.id) && d.intent.bindingDigest === this.intentDigest(c, d.approver) &&
          ["macos-local-auth-and-tty-v1", "reviewed-external-v1"].includes(d.intent.method) && Number.isSafeInteger(d.intent.issuedAt) && Number.isSafeInteger(d.intent.expiresAt) &&
          d.intent.issuedAt <= Date.parse(d.approvedAt) && Date.parse(d.approvedAt) < d.intent.expiresAt && d.intent.expiresAt <= d.intent.issuedAt + 60000 && d.intent.expiresAt <= Date.parse(c.expiresAt));
        check(this.db.prepare("SELECT operation_id FROM human_confirmation_ids WHERE confirmation_id=?").get(d.intent.id)?.operation_id === op.operationId);
      }
    }
    if (this.approvalReview(grant.operationId)?.policy.mode === "personal" && ["approved", "consumed"].includes(grant.status)) check(grant.decision?.intent);
    return grant;
  }
  private readEvent(row: Record<string, unknown>): OperationEvent {
    const event = decode<OperationEvent>(row);
    check(event.operationId === row.operation_id && OPERATION_STATES.includes(event.state));
    check(Number.isSafeInteger(event.version) && event.version >= 0 && timestamp(event.timestamp));
    check(typeof event.type === "string" && /^[a-z_.]{1,64}$/.test(event.type));
    if (event.actor) identity(event.actor);
    check(event.evidenceRef === undefined || (typeof event.evidenceRef === "string" && idPattern.test(event.evidenceRef)));
    return { ...event, sequence: Number(row.sequence) };
  }
  get(id: string): DurableOperation | null {
    try {
      const row = this.db.prepare("SELECT * FROM operations WHERE operation_id=?").get(id);
      return row ? this.readOperation(row) : null;
    } catch { throw new DurableStoreError("unavailable"); }
  }
  approval(id: string): DurableApproval | null {
    try {
      const read = () => {
        const row = this.db.prepare("SELECT * FROM approvals WHERE approval_id=?").get(id);
        return row ? this.readApproval(row) : null;
      };
      return this.inTransaction ? read() : this.transaction(read);
    } catch { throw new DurableStoreError("unavailable"); }
  }
  list(executionId: string, after = "", limit = 100): DurableOperation[] {
    check(idPattern.test(executionId) && Number.isSafeInteger(limit) && limit > 0 && limit <= 1000);
    try {
      return this.db.prepare("SELECT * FROM operations WHERE execution_id=? AND operation_id>? ORDER BY operation_id LIMIT ?")
        .all(executionId, after, limit).map(row => this.readOperation(row));
    } catch { throw new Error("Durable operation listing unavailable"); }
  }
  pending(after = "", limit = 100): DurableOperation[] {
    check(Number.isSafeInteger(limit) && limit > 0 && limit <= 1000);
    try {
      return this.db.prepare("SELECT * FROM operations WHERE state NOT IN ('Completed','Failed','Cancelled') AND operation_id>? ORDER BY operation_id LIMIT ?")
        .all(after, limit).map(row => this.readOperation(row));
    } catch { throw new Error("Durable pending listing unavailable"); }
  }
  events(id: string): OperationEvent[] {
    try {
      const rows = this.db.prepare("SELECT * FROM events WHERE operation_id=? ORDER BY sequence LIMIT 33").all(id);
      check(rows.length <= 32); return rows.map(row => this.readEvent(row));
    } catch { throw new Error("Durable events unavailable"); }
  }
  private event(op: DurableOperation, type: string, actor?: HostIdentity, evidenceRef?: string): void {
    check(Number(this.db.prepare("SELECT COUNT(*) AS count FROM events WHERE operation_id=?").get(op.operationId)?.count) < 32);
    const data: Omit<OperationEvent, "sequence"> = {
      operationId: op.operationId, type, state: op.state, version: op.version, timestamp: op.updatedAt,
      ...(actor ? { actor: identity(actor) } : {}), ...(evidenceRef ? { evidenceRef } : {}),
    };
    this.db.prepare("INSERT INTO events(operation_id,data,checksum) VALUES(?,?,?)").run(op.operationId, ...encode(data));
  }
  private saveApproval(grant: DurableApproval): void {
    this.db.prepare("UPDATE approvals SET status=?, data=?, checksum=? WHERE approval_id=?").run(grant.status, ...encode(grant), grant.approvalId);
  }
  private move(op: DurableOperation, state: OperationState, type: string, actor?: HostIdentity, evidenceRef?: string): DurableOperation {
    assertOperationTransition(op.state, state);
    const oldVersion = op.version;
    op = { ...op, state, version: oldVersion + 1, updatedAt: this.time(), ...(evidenceRef ? { evidenceRef } : {}) };
    const result = this.db.prepare("UPDATE operations SET state=?, version=?, data=?, checksum=? WHERE operation_id=? AND version=?")
      .run(op.state, op.version, ...encode(op), op.operationId, oldVersion);
    check(result.changes === 1); this.event(op, type, actor, evidenceRef); return op;
  }
  private current(id: string, version: number, own = true): DurableOperation {
    const op = this.get(id);
    check(op && op.version === version && (!own || (this.executionHealthy && op.ownerSession === this.session)));
    if (own && this.lease(op.executionId)) {
      const lease = this.lease(op.executionId)!;
      if (lease.operationId === op.operationId) this.assertLease(lease);
      else if (!(op.safety === "read_only" && !op.requiresApproval && op.toolId !== "sandbox.validate" && this.get(lease.operationId)?.state === "Completed")) {
        // A historical completed patch lease is never transferred to validation.
        // Only a new independently approved, session-owned sandbox operation may follow it.
        const patch = this.get(lease.operationId), grant = patch?.approvalId && this.approval(patch.approvalId);
        check(op.toolId === "sandbox.validate" && op.taskId === "sandbox-validation" && op.permission === "shell:execute" &&
          op.risk === "high" && op.safety === "side_effecting" && op.requiresApproval &&
          patch?.executionId === op.executionId && patch.toolId === "patch.apply" && patch.state === "Completed" &&
          grant && grant.status === "consumed" && grant.approver);
        this.assertReviewedGrant(grant, false);
      }
    }
    return op;
  }
  register(input: OperationRequest) {
    check(this.executionHealthy);
    const req = requestOf(input);
    return this.transaction(() => {
      const id = operationId(req); const previous = this.get(id); const scopeDigest = hash(JSON.stringify(req));
      if (previous) { check(previous.scopeDigest === scopeDigest); return { operation: previous, duplicate: true }; }
      check(Number(this.db.prepare("SELECT COUNT(*) AS count FROM operations").get()?.count) < 10_000);
      if (req.toolCallId !== undefined) {
        check(this.db.prepare("SELECT operation_id FROM operations WHERE execution_id=? AND task_id=? AND tool_call_id=?")
          .get(req.executionId, req.taskId, req.toolCallId) === undefined);
      }
      const now = this.time();
      let op: DurableOperation = {
        ...req, operationId: id, ownerSession: this.session, scopeDigest,
        state: "Created", version: 0, createdAt: now, updatedAt: now,
        ...(req.requiresApproval ? { approvalId: "approval:" + id } : {}),
      };
      this.db.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?)")
        .run(id, req.executionId, req.taskId, req.requestId, req.toolCallId ?? null, op.state, op.version, ...encode(op));
      this.event(op, "operation.created");
      if (req.requiresApproval) {
        op = this.move(op, "PendingApproval", "approval.requested");
        const grant: DurableApproval = {
          approvalId: op.approvalId!, operationId: id, requester: req.requester, scopeDigest,
          status: "pending", expiresAt: new Date(Date.parse(now) + this.ttl).toISOString(), updatedAt: now,
        };
        this.db.prepare("INSERT INTO approvals VALUES(?,?,?,?,?)").run(grant.approvalId, id, grant.status, ...encode(grant));
      }
      return { operation: op, duplicate: false };
    });
  }
  decide(id: string, actor: HostIdentity, approved: boolean): DurableApproval {
    return this.decision(id, actor, approved);
  }
  decideScoped(id: string, actor: HostIdentity, approved: boolean, binding: ApprovalDecisionBinding): DurableApproval {
    return this.decision(id, actor, approved, binding);
  }
  decideReviewed(id: string, actor: HostIdentity, approved: boolean, intent?: HumanIntentReceipt): DurableApproval {
    const op = this.get(this.approval(id)?.operationId ?? ""); check(op);
    const ref = this.proposal(op.operationId);
    return this.decision(id, actor, approved, ref ? { artifactDigest: ref.artifactDigest, challenge: ref.challenge } : undefined, intent, true);
  }
  private decision(id: string, actor: HostIdentity, approved: boolean, binding?: ApprovalDecisionBinding, intent?: HumanIntentReceipt, reviewed = false): DurableApproval {
    actor = identity(actor); check(typeof approved === "boolean");
    return this.transaction(() => {
      const grant = this.approval(id); check(grant && grant.status === "pending");
      const op = this.get(grant.operationId)!;
      check(this.executionHealthy && Date.parse(this.time()) < Date.parse(grant.expiresAt));
      const reference = this.proposal(op.operationId);
      const context = this.approvalReview(op.operationId);
      if (context) check(context.policy.mode === "personal" && context.policyDigest === hash(approvalPolicyJson(this.approvalPolicy)) && reviewed && actor.issuer === op.requester.issuer && actor.subject === op.requester.subject);
      else check(!["patch.apply", "sandbox.validate"].includes(op.toolId));
      if (reference) {
        check(binding && binding.artifactDigest === reference.artifactDigest && binding.challenge === reference.challenge);
        check(Date.parse(this.time()) < Date.parse(reference.expiresAt));
      } else check(!binding && (op.ownerSession === this.session || reviewed && context?.purpose === "sandbox.validate"));
      if (approved && context?.policy.mode === "personal") {
        check(actor.issuer === "github.com" && /^[1-9][0-9]{0,19}$/.test(actor.subject));
        const t = Date.parse(this.time());
        check(intent && Object.keys(intent).sort().join() === ["id", "bindingDigest", "issuedAt", "expiresAt", "method"].sort().join() && digestPattern.test(intent.id) && intent.bindingDigest === this.intentDigest(context, actor) &&
          ["macos-local-auth-and-tty-v1", "reviewed-external-v1"].includes(intent.method) && Number.isSafeInteger(intent.issuedAt) && Number.isSafeInteger(intent.expiresAt) && intent.issuedAt <= t && intent.issuedAt >= t - 60000 &&
          intent.expiresAt > t && intent.expiresAt <= intent.issuedAt + 60000 && intent.expiresAt <= Date.parse(context.expiresAt));
        this.db.prepare("INSERT INTO human_confirmation_ids VALUES(?,?)").run(intent.id, op.operationId);
      }
      if (approved && context) grant.decision = { mode: context.policy.mode, policyVersion: context.policy.version, policyDigest: context.policyDigest, challengeDigest: hash(context.challenge),
        patchDigest: context.patchDigest, snapshotDigest: context.snapshotDigest, workspaceId: context.workspaceId, authorizationScope: context.scopeDigest, approvedAt: this.time(),
        requester: op.requester, approver: actor, ...(intent ? { intent: structuredClone(intent) } : {}) };
      grant.approver = actor; grant.status = approved ? "approved" : "denied"; grant.updatedAt = this.time();
      this.move(op, approved ? "Approved" : "Cancelled", approved ? "approval.approved" : "approval.denied", actor);
      this.saveApproval(grant); return grant;
    });
  }
  revoke(id: string, actor: HostIdentity): DurableApproval {
    actor = identity(actor);
    return this.transaction(() => {
      const grant = this.approval(id); check(grant && ["pending", "approved"].includes(grant.status));
      const op = this.get(grant.operationId)!;
      grant.approver = actor; grant.status = "revoked"; grant.updatedAt = this.time();
      this.move(op, "Cancelled", "approval.revoked", actor); this.saveApproval(grant); return grant;
    });
  }
  prepare(id: string, version: number, scopeDigest: string, approvalId?: string): DurableOperation | null {
    return this.transaction(() => {
      const op = this.current(id, version); check(op.scopeDigest === scopeDigest);
      if (this.proposal(id)) check(this.lease(op.executionId)?.ownerSession === this.session);
      if (op.requiresApproval) {
        check(op.state === "Approved" && approvalId === op.approvalId);
        const grant = this.approval(approvalId!)!; check(grant.status === "approved");
        if (["patch.apply", "sandbox.validate"].includes(op.toolId)) this.assertReviewedGrant(grant);
        if (Date.parse(this.time()) >= Date.parse(grant.expiresAt)) {
          grant.status = "expired"; grant.updatedAt = this.time();
          this.move(op, "Cancelled", "approval.expired"); this.saveApproval(grant); return null;
        }
        grant.status = "consumed"; grant.updatedAt = this.time();
        const prepared = this.move(op, "Prepared", "approval.consumed"); this.saveApproval(grant); return prepared;
      }
      check(op.state === "Created" && approvalId === undefined);
      return this.move(op, "Prepared", "operation.prepared");
    });
  }
  start(id: string, version: number): DurableOperation {
    const result = this.transaction(() => {
      const op = this.current(id, version); check(op.state === "Prepared");
      if (op.approvalId) {
        const grant = this.approval(op.approvalId);
        check(grant?.status === "consumed");
        if (["patch.apply", "sandbox.validate"].includes(op.toolId)) this.assertReviewedGrant(grant);
        if (Date.parse(this.time()) >= Date.parse(grant.expiresAt))
          return this.move(op, "Cancelled", "operation.authorization_expired");
      }
      return this.move(op, "Running", "operation.running");
    });
    check(result.state === "Running");
    return result;
  }
  finish(id: string, version: number, state: "Completed" | "Uncertain" | "Cancelled", resultDigest?: string): DurableOperation {
    return this.transaction(() => {
      let op = this.current(id, version);
      check(state === "Cancelled" ? op.state === "Prepared" : op.state === "Running");
      check(resultDigest === undefined || (state === "Completed" && digestPattern.test(resultDigest)));
      if (resultDigest) op = { ...op, resultDigest };
      return this.move(op, state, "operation." + state.toLowerCase());
    });
  }
  reconcile(id: string, version: number, actor: HostIdentity, evidence: ReconciliationEvidence): DurableOperation {
    actor = identity(actor); check(evidence && typeof evidence.reference === "string" && idPattern.test(evidence.reference));
    return this.transaction(() => {
      const op = this.current(id, version, false);
      if (evidence.kind === "host_quiesced") {
        check(["Created", "PendingApproval", "Approved", "Prepared", "Running"].includes(op.state));
        if (op.approvalId && ["PendingApproval", "Approved"].includes(op.state)) {
          const grant = this.approval(op.approvalId)!;
          grant.status = "revoked"; grant.approver = actor; grant.updatedAt = this.time(); this.saveApproval(grant);
        }
        return this.move(op, ["Prepared", "Running"].includes(op.state) ? "Uncertain" : "Cancelled", "recovery.quiesced", actor, evidence.reference);
      }
      check(op.state === "Uncertain" && ["confirmed_completed", "confirmed_no_effect"].includes(evidence.kind));
      return this.move(op, evidence.kind === "confirmed_completed" ? "Completed" : "Cancelled", "recovery.resolved", actor, evidence.reference);
    });
  }
  bindProposal(reference: ProposalReference, review?: ApprovalReviewInput): void {
    this.transaction(() => {
      check(Object.keys(reference).sort().join() === ["operationId", "executionId", "workspaceId", "artifactDigest", "challenge", "expiresAt"].sort().join());
      const op = this.get(reference.operationId);
      check(this.executionHealthy && op?.ownerSession === this.session && op.toolId === "patch.apply" && op.state === "PendingApproval");
      check(op.executionId === reference.executionId && idPattern.test(reference.workspaceId));
      check(digestPattern.test(reference.artifactDigest) && /^[a-f0-9]{64}$/.test(reference.challenge));
      check(timestamp(reference.expiresAt) && Date.parse(reference.expiresAt) > Date.parse(this.time()));
      check(!this.proposal(op.operationId));
      this.db.prepare("INSERT INTO engineering_proposals VALUES(?,?,?)").run(op.operationId, ...encode(reference));
      if (review) this.bindReview(op.operationId, review, reference.challenge, reference.expiresAt);
      else check(false);
    });
  }
  private intentDigest(context: ApprovalReviewContext, actor: HostIdentity): string { return hash(canonicalProposalJson({ review: context, actor: identity(actor) })); }
  approvalReview(operationId: string): ApprovalReviewContext | null {
    const row = this.db.prepare("SELECT * FROM approval_reviews WHERE operation_id=?").get(operationId);
    if (!row) return null;
    const c = decode<ApprovalReviewContext>(row), op = this.get(operationId);
    check(op && c.schemaVersion === 1 && c.operationId === operationId && c.executionId === op.executionId && c.scopeDigest === op.scopeDigest && c.purpose === op.toolId && ["patch.apply", "sandbox.validate"].includes(c.purpose));
    check(Object.keys(c).sort().join() === ["schemaVersion", "operationId", "executionId", "scopeDigest", "purpose", "policyDigest", "challenge", "expiresAt", "policy", "workspaceId", "artifactDigest", "patchDigest", "snapshotDigest", "contentDigest", ...(c.actionDigest === undefined ? [] : ["actionDigest"])].sort().join());
    check(c.policyDigest === hash(archivedApprovalPolicyJson(c.policy)));
    check(idPattern.test(c.workspaceId) && [c.artifactDigest, c.patchDigest, c.snapshotDigest, c.contentDigest, c.challenge].every(x => typeof x === "string" && digestPattern.test(x)) && timestamp(c.expiresAt));
    check(c.purpose === "sandbox.validate" ? typeof c.actionDigest === "string" && digestPattern.test(c.actionDigest) : c.actionDigest === undefined);
    if (c.purpose === "patch.apply") { const ref = this.proposal(operationId); check(ref && c.artifactDigest === ref.artifactDigest && c.workspaceId === ref.workspaceId && c.challenge === ref.challenge && c.expiresAt === ref.expiresAt); }
    return c;
  }
  private bindReview(operationId: string, raw: ApprovalReviewInput, challenge: string, expiresAt: string): void {
    const op = this.get(operationId), policy = normalizeApprovalPolicy(raw.policy);
    check(op?.ownerSession === this.session && op.state === "PendingApproval" && op.requiresApproval && !this.approvalReview(operationId));
    check(Object.keys(raw).sort().join() === ["policy", "workspaceId", "artifactDigest", "patchDigest", "snapshotDigest", "contentDigest", ...(raw.actionDigest === undefined ? [] : ["actionDigest"])].sort().join());
    check(approvalPolicyJson(policy) === approvalPolicyJson(this.approvalPolicy));
    const c: ApprovalReviewContext = { ...structuredClone(raw), policy, schemaVersion: 1, operationId, executionId: op.executionId, scopeDigest: op.scopeDigest,
      purpose: op.toolId as ApprovalReviewContext["purpose"], policyDigest: hash(approvalPolicyJson(policy)), challenge, expiresAt };
    this.db.prepare("INSERT INTO approval_reviews VALUES(?,?,?)").run(operationId, ...encode(c)); this.approvalReview(operationId);
  }
  bindValidationReview(operationId: string, review: ApprovalReviewInput): void {
    this.transaction(() => {
      const op = this.get(operationId); check(op?.toolId === "sandbox.validate" && !this.proposal(operationId));
      const grant = op.approvalId && this.approval(op.approvalId); check(grant && grant.status === "pending");
      this.bindReview(operationId, review, hash(randomUUID()), grant.expiresAt);
    });
  }
  private assertReviewedGrant(grant: DurableApproval, current = true): void {
    const c = this.approvalReview(grant.operationId);
    const op = this.get(grant.operationId);
    if (!["patch.apply", "sandbox.validate"].includes(op?.toolId ?? "")) return;
    if (!current) return; // Historical decoding only; never grants execution authority.
    check(c && c.policy.mode === "personal" && c.policyDigest === hash(approvalPolicyJson(this.approvalPolicy)));
    check(grant.decision?.policyDigest === c.policyDigest && grant.decision.mode === "personal" && grant.decision.authorizationScope === c.scopeDigest);
    check(grant.decision.intent && grant.approver && grant.approver.issuer === grant.requester.issuer && grant.approver.subject === grant.requester.subject && grant.decision.intent.bindingDigest === this.intentDigest(c, grant.approver));
  }

  proposal(id: string): ProposalReference | null {
    const row = this.db.prepare("SELECT * FROM engineering_proposals WHERE operation_id=?").get(id);
    if (!row) return null;
    const ref = decode<ProposalReference>(row), op = this.get(id);
    check(Object.keys(ref).sort().join() === ["operationId", "executionId", "workspaceId", "artifactDigest", "challenge", "expiresAt"].sort().join());
    check(op && ref.operationId === id && ref.executionId === op.executionId && op.toolId === "patch.apply");
    check(idPattern.test(ref.workspaceId) && digestPattern.test(ref.artifactDigest) && digestPattern.test(ref.challenge) && timestamp(ref.expiresAt));
    return ref;
  }
  private lease(executionId: string): ContinuationLease | null {
    const row = this.db.prepare("SELECT * FROM continuation_leases WHERE execution_id=?").get(executionId);
    if (!row) return null;
    const lease = decode<ContinuationLease>(row);
    return this.validateLease(lease, executionId);
  }
  private validateLease(lease: ContinuationLease, executionId: string): ContinuationLease {
    check(Object.keys(lease).sort().join() === ["leaseId", "executionId", "operationId", "ownerSession", "epoch", "version", "stateVersion", "operator", "expiresAt"].sort().join());
    check(lease.executionId === executionId && idPattern.test(lease.leaseId) && /^[a-f0-9-]{36}$/.test(lease.ownerSession));
    check(Number.isSafeInteger(lease.epoch) && lease.epoch > 0 && Number.isSafeInteger(lease.version) && lease.version > 0 && timestamp(lease.expiresAt));
    check(Number.isSafeInteger(lease.stateVersion) && lease.stateVersion >= 0); identity(lease.operator);
    check(this.get(lease.operationId)?.executionId === executionId);
    return lease;
  }
  acquireLease(id: string, version: number, ttlMs: number, operator: HostIdentity): ContinuationLease {
    operator = identity(operator);
    check(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= 300_000 && this.executionHealthy);
    return this.transaction(() => {
      let op = this.current(id, version, false);
      const ref = this.proposal(id), review = this.approvalReview(id);
      check(op.state === "Approved" && operator.issuer === op.requester.issuer && operator.subject === op.requester.subject);
      check(ref || op.toolId === "sandbox.validate" && op.taskId === "sandbox-validation" && op.permission === "shell:execute" && op.risk === "high" && op.safety === "side_effecting" && review?.purpose === "sandbox.validate");
      const grant = this.approval(op.approvalId!);
      check(grant?.status === "approved" && Date.parse(grant.expiresAt) > Date.parse(this.time()) && Date.parse((ref ?? review)!.expiresAt) > Date.parse(this.time()));
      this.assertReviewedGrant(grant);
      const previous = this.lease(op.executionId);
      check(!previous || this.get(previous.operationId)?.state === "Completed" || Date.parse(previous.expiresAt) <= Date.parse(this.time()));
      // No incomplete operation other than this exact still-effect-free proposal may be transferred.
      const others = this.list(op.executionId, undefined, 1000);
      check(others.length < 1000 && others.every(x => x.operationId === id || x.state === "Completed"));
      const lease: ContinuationLease = { leaseId: randomUUID(), executionId: op.executionId, operationId: id, ownerSession: this.session,
        epoch: (previous?.epoch ?? 0) + 1, stateVersion: op.version, operator, version: (previous?.version ?? 0) + 1, expiresAt: new Date(Date.parse(this.time()) + ttlMs).toISOString() };
      check(Number.isSafeInteger(lease.epoch) && lease.epoch <= 64);
      this.db.prepare("INSERT INTO continuation_lease_events VALUES(?,?,?,?)").run(lease.executionId, lease.epoch, ...encode(lease));
      this.db.prepare("INSERT INTO continuation_leases VALUES(?,?,?) ON CONFLICT(execution_id) DO UPDATE SET data=excluded.data,checksum=excluded.checksum")
        .run(op.executionId, ...encode(lease));
      op = { ...op, ownerSession: this.session };
      check(this.db.prepare("UPDATE operations SET data=?,checksum=? WHERE operation_id=? AND version=?").run(...encode(op), id, version).changes === 1);
      return lease;
    });
  }
  assertLease(expected: ContinuationLease): void {
    check(this.executionHealthy);
    const current = this.lease(expected.executionId), op = this.get(expected.operationId);
    check(current && JSON.stringify(current) === JSON.stringify(expected) && current.ownerSession === this.session &&
      op?.ownerSession === this.session && ["Approved", "Prepared", "Running"].includes(op.state) && op.version >= current.stateVersion && Date.parse(this.time()) < Date.parse(current.expiresAt));
    const ref = this.proposal(expected.operationId) ?? this.approvalReview(expected.operationId);
    check(ref && Date.parse(this.time()) < Date.parse(ref.expiresAt));
    const grant = op.approvalId && this.approval(op.approvalId);
    check(grant && ["approved", "consumed"].includes(grant.status) && Date.parse(this.time()) < Date.parse(grant.expiresAt));
    this.assertReviewedGrant(grant);
  }
  retireSession(): void { this.executionHealthy = false; }
  close(): void { this.retireSession(); this.db.close(); }
}
