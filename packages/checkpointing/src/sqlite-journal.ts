import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  assertOperationTransition, OPERATION_STATES, DurableStoreError,
  type DurableOperationStore, type DurableOperation, type OperationRequest,
  type DurableApproval, type HostIdentity, type OperationEvent,
  type OperationState, type ReconciliationEvidence,
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

export interface SqliteJournalOptions {
  now?: () => number;
  approvalTtlMs?: number;
  /** Host may lower, never raise, the 64 MiB database cap. */
  maxDatabaseBytes?: number;
}

/** Private local filesystem only. Host directory must already exist, mode 0700.
 * Lazy loading preserves non-durable operation on older Node 22 installations.
 */
export async function openSqliteOperationJournal(
  filename: string, options: SqliteJournalOptions = {},
): Promise<DurableOperationStore> {
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

class SqliteOperationJournal implements DurableOperationStore {
  private readonly session = randomUUID();
  private inTransaction = false;
  private executionHealthy = true;
  private readonly now: () => number;
  private readonly ttl: number;
  constructor(private readonly db: DatabaseSync, options: SqliteJournalOptions) {
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
      check(db.prepare("PRAGMA user_version").get()?.user_version === 1);
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
    check(op && op.version === version && (!own || (this.executionHealthy && op.ownerSession === this.session))); return op;
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
    actor = identity(actor); check(typeof approved === "boolean");
    return this.transaction(() => {
      const grant = this.approval(id); check(grant && grant.status === "pending");
      const op = this.get(grant.operationId)!;
      check(this.executionHealthy && op.ownerSession === this.session && Date.parse(this.time()) < Date.parse(grant.expiresAt));
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
      if (op.requiresApproval) {
        check(op.state === "Approved" && approvalId === op.approvalId);
        const grant = this.approval(approvalId!)!; check(grant.status === "approved");
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
  retireSession(): void { this.executionHealthy = false; }
  close(): void { this.retireSession(); this.db.close(); }
}
