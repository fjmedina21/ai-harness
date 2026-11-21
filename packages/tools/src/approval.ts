import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type {
  ToolApprovalRecord,
  ToolApprovalScope,
} from "@ai-harness/contracts";

const DEFAULT_TTL_MS = 60_000;

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }

  throw new Error("Unsupported approval argument");
}

function digestArguments(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

/**
 * In-memory approval state machine.
 *
 * Only trusted host code may call decide().
 * This component does not authenticate human identities.
 */
export class ToolApprovalManager {
  private readonly records = new Map<string, ToolApprovalRecord>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error("Invalid approval TTL");
    }
  }

  request(scope: ToolApprovalScope): ToolApprovalRecord {
    if (
      !scope.executionId.trim() ||
      !scope.toolId.trim() ||
      !scope.projectRoot.trim()
    ) {
      throw new Error("Invalid approval scope");
    }

    const timestamp = this.now();

    const record: ToolApprovalRecord = {
      id: randomUUID(),
      executionId: scope.executionId,
      projectRoot: path.resolve(scope.projectRoot),
      toolId: scope.toolId,
      argumentDigest: digestArguments(scope.arguments),
      permission: scope.permission,
      risk: scope.risk,
      status: "pending",
      requestedAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + this.ttlMs).toISOString(),
    };

    this.records.set(record.id, record);
    return structuredClone(record);
  }

  get(id: string): ToolApprovalRecord | null {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  /**
   * TRUSTED HOST ONLY.
   * The actor must come from an authenticated host layer,
   * never from the model's output.
   */
  decide(id: string, actor: string, approved: boolean): ToolApprovalRecord {
    const record = this.records.get(id);

    if (!record) {
      throw new Error("Approval request not found");
    }

    if (!actor.trim()) {
      throw new Error("Approver identity is required");
    }

    if (record.status !== "pending") {
      throw new Error("Approval is no longer pending");
    }

    if (this.now() >= Date.parse(record.expiresAt)) {
      throw new Error("Approval request expired");
    }

    record.status = approved ? "approved" : "denied";
    record.decidedBy = actor;
    record.decidedAt = new Date(this.now()).toISOString();

    return structuredClone(record);
  }

  /**
   * Atomically consumes one approval within this process.
   * Returns false if anything about the operation differs.
   */
  consume(id: string, scope: ToolApprovalScope): boolean {
    const record = this.records.get(id);

    if (!record || record.status !== "approved") {
      return false;
    }

    if (this.now() >= Date.parse(record.expiresAt)) {
      return false;
    }

    if (
      record.executionId !== scope.executionId ||
      record.projectRoot !== path.resolve(scope.projectRoot) ||
      record.toolId !== scope.toolId ||
      record.permission !== scope.permission ||
      record.risk !== scope.risk
    ) {
      return false;
    }

    if (record.argumentDigest !== digestArguments(scope.arguments)) {
      return false;
    }

    // No await occurs between validation and consumption.
    // Concurrent calls in the same JS process cannot both
    // consume this record.
    record.status = "consumed";
    record.consumedAt = new Date(this.now()).toISOString();

    return true;
  }
}
