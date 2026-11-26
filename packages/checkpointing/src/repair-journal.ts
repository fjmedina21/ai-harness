import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assertRepairTransition, canonicalProposalJson, DurableStoreError, REPAIR_STATES, type RepairSession, type RepairJournal, type RepairAccounting, type RepairPolicy } from "@ai-harness/contracts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const digest = /^[a-f0-9]{64}$/;
function check(value: unknown): asserts value { if (!value) throw new DurableStoreError("invalid"); }
const exact = (value: object, keys: string[]) => check(Object.keys(value).sort().join() === keys.sort().join());
const numeric = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const policyMaxima = { maxIterations: 16, maxProviderRequests: 32, maxInputTokens: 100_000, maxOutputTokens: 100_000, maxGlobalMs: 900_000, maxProviderMs: 300_000, maxValidationMs: 10_000, maxValidations: 32, maxFiles: 256, maxPatchBytes: 131_072 };
const accountingKeys = ["iterations", "providerRequests", "inputTokens", "outputTokens", "validations", "patchBytes", "files", "estimatedCostUsd"];
export function validateRepairPolicy(p: RepairPolicy): void {
  check(p && typeof p === "object");
  exact(p, ["version", "enabled", ...Object.keys(policyMaxima), "maxEstimatedCostUsd", "allowUnknownCost", "requireHumanApprovalForEachPatch", "requireSeparateSandboxApproval", "stopOnUncertainState", "stopOnNoProgress"]);
  check(p.version === 1 && p.enabled === true && p.requireHumanApprovalForEachPatch === true && p.requireSeparateSandboxApproval === true && p.stopOnUncertainState === true && p.stopOnNoProgress === true && typeof p.allowUnknownCost === "boolean");
  for (const [key, max] of Object.entries(policyMaxima)) check(numeric(p[key as keyof typeof policyMaxima], max) && p[key as keyof typeof policyMaxima] > 0);
  check(typeof p.maxEstimatedCostUsd === "number" && Number.isFinite(p.maxEstimatedCostUsd) && p.maxEstimatedCostUsd >= 0 && p.maxEstimatedCostUsd <= 10);
  check(p.maxProviderMs <= p.maxGlobalMs && p.maxValidationMs <= p.maxGlobalMs);
}
function validateAccounting(a: RepairAccounting): void {
  check(a && typeof a === "object"); exact(a, [...accountingKeys]);
  for (const key of accountingKeys.filter(k => k !== "estimatedCostUsd")) check(numeric(a[key as keyof RepairAccounting]));
  check(a.estimatedCostUsd === null || typeof a.estimatedCostUsd === "number" && Number.isFinite(a.estimatedCostUsd) && a.estimatedCostUsd >= 0 && a.estimatedCostUsd <= 10);
}
function validateSession(s: RepairSession): void {
  check(s && typeof s === "object");
  exact(s, ["schemaVersion", "sessionId", "executionId", "projectId", "ownerId", "policyDigest", "profileDigest", "profileId", "actionId", "originalObjective", "sourceRevision", "initialOperationId", "currentOperationId", "workspaceId", "baseSnapshotDigest", "state", "iteration", "version", "createdAt", "updatedAt", "deadlineAt", "policy", "consumed", "reserved", "iterations", "lastValidation", "diagnosticDigest", ...(s.lastNormalized === undefined ? [] : ["lastNormalized"]), ...(s.terminalReason === undefined ? [] : ["terminalReason"])]);
  check(s.schemaVersion === 1 && REPAIR_STATES.includes(s.state));
  for (const key of ["sessionId", "executionId", "projectId", "profileId", "actionId", "initialOperationId", "currentOperationId", "workspaceId"] as const) check(typeof s[key] === "string" && id.test(s[key]));
  check(typeof s.ownerId === "string" && /^[1-9][0-9]{0,19}$/.test(s.ownerId));
  for (const key of ["policyDigest", "profileDigest", "sourceRevision", "baseSnapshotDigest", "diagnosticDigest"] as const) check(typeof s[key] === "string" && digest.test(s[key]));
  check(typeof s.originalObjective === "string" && s.originalObjective.length > 0 && Buffer.byteLength(s.originalObjective) <= 4096);
  check(numeric(s.version, 256) && numeric(s.iteration, 16));
  check(timestamp(s.createdAt) && timestamp(s.updatedAt) && timestamp(s.deadlineAt) && Date.parse(s.updatedAt) >= Date.parse(s.createdAt) && Date.parse(s.deadlineAt) > Date.parse(s.createdAt));
  check(s.terminalReason === undefined || typeof s.terminalReason === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(s.terminalReason));
  validateRepairPolicy(s.policy); validateAccounting(s.consumed); validateAccounting(s.reserved);
  check(Date.parse(s.deadlineAt) - Date.parse(s.createdAt) <= s.policy.maxGlobalMs && s.iteration <= s.policy.maxIterations);
  const ceilings: Record<string, number> = { iterations: s.policy.maxIterations, providerRequests: s.policy.maxProviderRequests, inputTokens: s.policy.maxInputTokens, outputTokens: s.policy.maxOutputTokens, validations: s.policy.maxValidations, patchBytes: s.policy.maxPatchBytes, files: s.policy.maxFiles };
  for (const [key, maximum] of Object.entries(ceilings)) {
    const total = s.consumed[key as keyof RepairAccounting]! + s.reserved[key as keyof RepairAccounting]!;
    check(numeric(total) && total <= maximum);
  }
  check(s.policy.allowUnknownCost || s.consumed.estimatedCostUsd !== null && s.reserved.estimatedCostUsd !== null);
  if (s.consumed.estimatedCostUsd !== null && s.reserved.estimatedCostUsd !== null) check(s.consumed.estimatedCostUsd + s.reserved.estimatedCostUsd <= s.policy.maxEstimatedCostUsd);
  check(Array.isArray(s.iterations) && s.iterations.length <= s.policy.maxIterations);
  for (let index = 0; index < s.iterations.length; index++) {
    const iteration = s.iterations[index]!;
    exact(iteration, ["id", "index", "baseSnapshotDigest", "diagnosticDigest", ...["resultingSnapshotDigest", "patchDigest", "changeDigest", "operationId", "artifactDigest", "approvalId", "validationId", "normalizedResult", "providerUsage"].filter(k => Object.hasOwn(iteration, k))]);
    if (iteration.providerUsage) {
      const u = iteration.providerUsage;
      exact(u, ["providerId", "model", "inputTokens", "outputTokens", "estimatedCostUsd"]);
      check(typeof u.providerId === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(u.providerId) && (u.model === null || typeof u.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(u.model)));
      check(numeric(u.inputTokens, s.policy.maxInputTokens) && numeric(u.outputTokens, s.policy.maxOutputTokens) && (u.estimatedCostUsd === null || typeof u.estimatedCostUsd === "number" && Number.isFinite(u.estimatedCostUsd) && u.estimatedCostUsd >= 0 && u.estimatedCostUsd <= s.policy.maxEstimatedCostUsd));
    }
    check(id.test(iteration.id) && numeric(iteration.index, s.policy.maxIterations) && iteration.index === index + 1 && digest.test(iteration.baseSnapshotDigest) && digest.test(iteration.diagnosticDigest));
    for (const key of ["resultingSnapshotDigest", "patchDigest", "changeDigest", "artifactDigest"] as const) check(iteration[key] === undefined || digest.test(iteration[key]!));
    for (const key of ["operationId", "approvalId", "validationId"] as const) check(iteration[key] === undefined || id.test(iteration[key]!));
  }
  const v = s.lastValidation;
  check(v && v.schemaVersion === 1 && typeof v.runtimeProfile === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(v.runtimeProfile) && v.executionId === s.executionId && v.workspaceId === s.workspaceId && digest.test(v.snapshotDigest) && digest.test(v.outputDigest) && ["unsupported", "passed", "failed", "timeout", "cancelled", "blocked", "uncertain"].includes(v.classification));
  check(typeof v.validationId === "string" && id.test(v.validationId) && typeof v.operationId === "string" && id.test(v.operationId));
  check(Array.isArray(v.diagnostics) && v.diagnostics.length <= 64 && v.diagnostics.every(d => typeof d === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(d)));
  if (s.lastNormalized !== undefined) {
    const n = s.lastNormalized;
    exact(n, ["schemaVersion", "validationId", "executionId", "workspaceId", "profileId", "profileDigest", "actionId", "action", "status", "failureKind", "snapshotDigest", "exitCode", "diagnostics", "diagnosticDigest", "evidenceDigest", "outputTruncated", "durationMs"]);
    check(n.schemaVersion === 1 && n.validationId === v.validationId && n.executionId === s.executionId && n.workspaceId === s.workspaceId && n.profileId === s.profileId && n.profileDigest === s.profileDigest && n.actionId === s.actionId && n.snapshotDigest === v.snapshotDigest);
    check(["syntax-check", "lint", "type-check", "build", "test", "integration-test", "static-analysis"].includes(n.action) && ["unsupported", "blocked", "passed", "failed", "timeout", "cancelled", "uncertain"].includes(n.status) && ["none", "code", "infrastructure", "authorization", "uncertain"].includes(n.failureKind));
    check([n.diagnosticDigest, n.evidenceDigest].every(x => digest.test(x)) && typeof n.outputTruncated === "boolean" && numeric(n.durationMs) && (n.exitCode === null || numeric(n.exitCode, 255)));
    check(Array.isArray(n.diagnostics) && n.diagnostics.length <= 64);
    for (const item of n.diagnostics) {
      exact(item, ["severity", "code", "message", ...["file", "line", "column"].filter(k => Object.hasOwn(item, k))]);
      check(["error", "warning", "info"].includes(item.severity) && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(item.code) && typeof item.message === "string" && Buffer.byteLength(item.message) <= 512 && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(item.message));
      check(item.file === undefined || typeof item.file === "string" && item.file.length <= 256 && !item.file.startsWith("/") && !item.file.includes("\\") && !item.file.split("/").some((x: string) => x === ".." || x === "." || !x) && !item.file.includes(":"));
      check(item.line === undefined || numeric(item.line, 10000000) && item.line > 0); check(item.column === undefined || numeric(item.column, 10000000) && item.column > 0);
    }
  }
  if (s.state === "Completed") check(v.classification === "passed" && v.cleanup === "confirmed" && v.exitCode === 0 && v.timedOut === false && v.cancelled === false && (!s.lastNormalized || s.lastNormalized.status === "passed" && s.lastNormalized.failureKind === "none"));
  check(Buffer.byteLength(canonicalProposalJson(s)) <= 32768);
}
function encode(s: RepairSession): [string, string] { validateSession(s); const text = canonicalProposalJson(s); return [text, hash(text)]; }
function decode(row: Record<string, unknown>): RepairSession {
  check(typeof row.data === "string" && Buffer.byteLength(row.data) <= 32768 && hash(row.data) === row.checksum);
  const s = JSON.parse(row.data) as RepairSession; validateSession(s);
  check(s.sessionId === row.session_id && s.version === row.version); return s;
}

/** Same private SQLite connection and transaction wrapper as operation approvals. Tables are opt-in on first create. */
export class SqliteRepairJournal implements RepairJournal {
  constructor(private readonly db: DatabaseSync, private readonly transaction: <T>(fn: () => T) => T, private readonly assertHealthy: () => void) {}
  private installed(): boolean { return this.db.prepare("PRAGMA user_version").get()?.user_version === 4; }
  private migrate(): void {
    if (this.installed()) return;
    check(this.db.prepare("PRAGMA user_version").get()?.user_version === 3);
    this.db.exec(`CREATE TABLE repair_sessions (session_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL UNIQUE, version INTEGER NOT NULL CHECK(version>=0), data TEXT NOT NULL CHECK(length(data)<=32768), checksum TEXT NOT NULL) STRICT, WITHOUT ROWID;
      CREATE TABLE repair_history (session_id TEXT NOT NULL REFERENCES repair_sessions(session_id), version INTEGER NOT NULL CHECK(version>=0), data TEXT NOT NULL CHECK(length(data)<=32768), checksum TEXT NOT NULL, PRIMARY KEY(session_id,version)) STRICT, WITHOUT ROWID;
      PRAGMA user_version=4;`);
  }
  get(sessionId: string): RepairSession | null {
    check(id.test(sessionId));
    if (!this.installed()) return null;
    const row = this.db.prepare("SELECT * FROM repair_sessions WHERE session_id=?").get(sessionId);
    if (!row) return null;
    const s = decode(row); check(s.executionId === row.execution_id); return s;
  }
  history(sessionId: string): RepairSession[] {
    check(id.test(sessionId)); if (!this.installed()) return [];
    const rows = this.db.prepare("SELECT * FROM repair_history WHERE session_id=? ORDER BY version LIMIT 258").all(sessionId);
    check(rows.length <= 257);
    return rows.map((row, index) => { const s = decode(row); check(s.version === index); return s; });
  }
  verify(): void {
    if (!this.installed()) return;
    check(Number(this.db.prepare("SELECT COUNT(*) AS n FROM repair_sessions").get()?.n) <= 1000);
    for (const row of this.db.prepare("SELECT * FROM repair_sessions").iterate()) {
      const s = decode(row), history = this.history(s.sessionId);
      check(history.length === s.version + 1 && canonicalProposalJson(history.at(-1)) === canonicalProposalJson(s));
      for (let i = 1; i < history.length; i++) this.validateUpdate(history[i - 1]!, history[i]!);
    }
  }
  create(session: RepairSession): RepairSession {
    this.assertHealthy(); const s = structuredClone(session), encoded = encode(s);
    check(s.version === 0 && ["ValidationFailed", "RepairRequested"].includes(s.state) && s.iteration === 0 && s.iterations.length === 0);
    return this.transaction(() => {
      this.migrate(); check(!this.get(s.sessionId));
      check(Number(this.db.prepare("SELECT COUNT(*) AS n FROM repair_sessions").get()?.n) < 1000);
      this.db.prepare("INSERT INTO repair_sessions VALUES(?,?,?,?,?)").run(s.sessionId, s.executionId, 0, ...encoded);
      this.db.prepare("INSERT INTO repair_history VALUES(?,?,?,?)").run(s.sessionId, 0, ...encoded);
      return structuredClone(s);
    });
  }
  private validateUpdate(previous: RepairSession, next: RepairSession): void {
    validateSession(next); check(next.version === previous.version + 1);
    const immutable = ["schemaVersion", "sessionId", "executionId", "projectId", "ownerId", "policyDigest", "profileDigest", "profileId", "actionId", "originalObjective", "sourceRevision", "initialOperationId", "workspaceId", "baseSnapshotDigest", "createdAt", "deadlineAt", "policy"] as const;
    for (const key of immutable) check(canonicalProposalJson(previous[key]) === canonicalProposalJson(next[key]));
    assertRepairTransition(previous.state, next.state);
    check(Date.parse(next.updatedAt) >= Date.parse(previous.updatedAt));
    check(next.iteration >= previous.iteration && next.iteration <= previous.iteration + 1 && next.iterations.length >= previous.iterations.length);
    for (const key of accountingKeys.filter(k => k !== "estimatedCostUsd")) check(next.consumed[key as keyof RepairAccounting]! >= previous.consumed[key as keyof RepairAccounting]!);
    check(previous.consumed.estimatedCostUsd === null ? next.consumed.estimatedCostUsd === null : next.consumed.estimatedCostUsd === null || next.consumed.estimatedCostUsd >= previous.consumed.estimatedCostUsd);
    if (!(previous.state === "AnalyzingDiagnostics" && next.state === "RepairProposed")) {
      for (const key of accountingKeys.filter(k => k !== "estimatedCostUsd")) check(next.reserved[key as keyof RepairAccounting]! >= previous.reserved[key as keyof RepairAccounting]!);
      check(previous.reserved.estimatedCostUsd === null ? next.reserved.estimatedCostUsd === null : next.reserved.estimatedCostUsd === null || next.reserved.estimatedCostUsd >= previous.reserved.estimatedCostUsd);
    }
    // Published per-iteration identities/evidence are append-only; unfinished fields may be filled once.
    previous.iterations.forEach((iteration, index) => {
      const after = next.iterations[index]!;
      for (const key of Object.keys(iteration) as (keyof typeof iteration)[]) check(canonicalProposalJson(after[key]) === canonicalProposalJson(iteration[key]));
    });
  }
  compareAndSwap(sessionId: string, expectedVersion: number, next: RepairSession): RepairSession {
    this.assertHealthy(); check(id.test(sessionId) && numeric(expectedVersion, 255));
    const s = structuredClone(next); check(s.sessionId === sessionId);
    return this.transaction(() => {
      const previous = this.get(sessionId); check(previous && previous.version === expectedVersion);
      this.validateUpdate(previous, s); const encoded = encode(s);
      check(this.db.prepare("UPDATE repair_sessions SET version=?,data=?,checksum=? WHERE session_id=? AND version=?").run(s.version, ...encoded, sessionId, expectedVersion).changes === 1);
      this.db.prepare("INSERT INTO repair_history VALUES(?,?,?,?)").run(sessionId, s.version, ...encoded);
      return structuredClone(s);
    });
  }
}
