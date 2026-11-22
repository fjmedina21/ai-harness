import { appendFileSync, closeSync, fsyncSync, openSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openSqliteOperationJournal } from "../sqlite-journal.js";
import type { OperationRequest } from "@ai-harness/contracts";

const [filename, mode, requestId = "request", toolCallId = "call"] = process.argv.slice(2);
if (!filename || !mode) throw new Error("Worker requires explicit fixture parameters");
const store = await openSqliteOperationJournal(filename);
process.send?.({ type: "ready" });
process.on("message", () => {
  try {
    const request: OperationRequest = {
      executionId: "execution", taskId: "task", requestId, toolCallId,
      projectRoot: "/fixture", toolId: "file.read", argumentDigest: "a".repeat(64),
      permission: "files:read", risk: "low", safety: "side_effecting",
      requester: { issuer: "fixture", subject: "requester" }, requiresApproval: true,
    };
    const registered = store.register(request);
    let op = registered.operation;
    if (!registered.duplicate) {
      store.decide(op.approvalId!, { issuer: "fixture", subject: "approver" }, true);
      op = store.get(op.operationId)!;
    }
    if (mode === "transaction") {
      const db = new DatabaseSync(filename);
      db.exec("PRAGMA synchronous=EXTRA; BEGIN IMMEDIATE;");
      db.prepare("UPDATE approvals SET status='consumed' WHERE approval_id=?").run(op.approvalId!);
      process.send?.({ type: "paused", operationId: op.operationId });
      return; // Parent SIGKILLs an actual uncommitted transaction.
    }
    op = store.prepare(op.operationId, op.version, op.scopeDigest, op.approvalId)!;
    if (mode === "prepared") {
      process.send?.({ type: "paused", operationId: op.operationId }); return;
    }
    op = store.start(op.operationId, op.version);
    if (mode === "running") {
      process.send?.({ type: "paused", operationId: op.operationId }); return;
    }
    // Actual fixed local effect, flushed before the parent kills the worker.
    const effect = filename + ".effect";
    appendFileSync(effect, "effect\n", { mode: 0o600 });
    const fd = openSync(effect, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
    if (mode === "effect") {
      process.send?.({ type: "paused", operationId: op.operationId }); return;
    }
    op = store.finish(op.operationId, op.version, "Completed", "b".repeat(64));
    process.send?.({ type: "done", outcome: "completed", operationId: op.operationId });
  } catch {
    process.send?.({ type: "done", outcome: "blocked" });
  }
});
