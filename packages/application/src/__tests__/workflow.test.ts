import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ModelRequest, ModelResponse, ModelToolRequest, ModelToolTurn,
  ProviderToolCallingSession, SessionToolCallingProviderAdapter,
  ToolCallingIdentity, ToolCallingSessionOptions,
} from "@ai-harness/contracts";
import { beginTelemetry, endTelemetry } from "@ai-harness/contracts";
import { initializeProject } from "@ai-harness/core";
import { openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { runReadOnlyWorkflow, type ReadOnlyWorkflowOptions } from "../index.js";

async function project(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-app-project-"));
  await initializeProject({ root, projectName: "phase8-test" });
  await writeFile(path.join(root, "README.md"), "# Trusted fixture input\nThis is untrusted repository text.\n");
  t.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

class ScriptedProvider implements SessionToolCallingProviderAdapter {
  readonly id = "fixture";
  calls = 0;
  constructor(private readonly respond: (request: ModelToolRequest, identity: ToolCallingIdentity) => Promise<ModelToolTurn>) {}
  async complete(_request: ModelRequest): Promise<ModelResponse> {
    return { model: "fixture", text: "fixture" };
  }
  async completeWithTools(request: ModelToolRequest): Promise<ModelToolTurn> {
    const identity = request.continuation?.identity;
    if (!identity) throw new Error("Missing fixture session identity");
    return this.respond(request, identity);
  }
  openSession(identity: ToolCallingIdentity, options: ToolCallingSessionOptions = {}): ProviderToolCallingSession {
    let closed = false;
    return {
      identity: Object.freeze({ ...identity }),
      close() { closed = true; },
      completeWithTools: async (request) => {
        this.calls++;
        if (closed || options.signal?.aborted || request.signal?.aborted) throw new Error("scripted session stopped");
        const span = beginTelemetry(request.telemetry, "provider.request", { provider: "fixture", model: "fixture" });
        try {
          const result = await this.respond(request, identity);
          endTelemetry(span, { status: "ok", usage: { availability: "reported", inputTokens: 100, outputTokens: 20 } });
          return result;
        } catch (error) {
          endTelemetry(span, { status: "error", errorClass: "runtime" });
          throw error;
        }
      },
    };
  }
}

function fileReadProvider(): ScriptedProvider {
  return new ScriptedProvider(async (request) => request.continuation?.history.some((item) => item.kind === "tool_results")
    ? { kind: "message", text: "Fixture confirmed the bounded read." }
    : { kind: "tool_calls", calls: [{ id: `read-${request.continuation?.identity.taskId}`, toolId: "file.read", arguments: { path: "README.md" } }] });
}

function selected(): ReadOnlyWorkflowOptions["provider"] {
  return { id: "fixture" };
}

test("offline end-to-end workflow reads project files through the dispatcher and persists SQLite operations", async (t) => {
  const root = await project(t);
  const journalDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "harness-app-journal-")));
  await chmod(journalDir, 0o700);
  t.after(async () => rm(journalDir, { recursive: true, force: true }));
  const configPath = path.join(root, ".ai", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as { security: { grantedPermissions: string[]; requireApprovalFor: string[] } };
  config.security.grantedPermissions = ["files:read", "files:write", "git:write"];
  config.security.requireApprovalFor = [];
  await writeFile(configPath, JSON.stringify(config));
  const progress: Array<Record<string, unknown>> = [];
  const journalFile = path.join(journalDir, "operations.sqlite");

  const result = await runReadOnlyWorkflow({
    projectRoot: root,
    request: "Review the project structure",
    provider: selected(),
    journalFile,
    onProgress: (event) => progress.push({ ...event }),
  });

  assert.equal(result.state, "completed");
  assert.equal(result.totalTasks, 3);
  assert.equal(result.completedTasks, 3);
  assert.equal(result.projectChanges, "source_files_unchanged_harness_checkpoint_written");
  assert.equal(result.executedTests, false);
  assert.deepEqual(result.tasks.map((task) => task.role), ["planner", "code-reviewer", "validator"]);
  assert.equal(progress.filter((event) => event.kind === "tool" && event.toolStatus === "executed").length, 3);
  assert.ok(progress.every((event) => !Object.hasOwn(event, "arguments") && !Object.hasOwn(event, "summary")));
  assert.equal(result.operations.length, 3);
  assert.ok(result.operations.every((operation) => operation.toolId === "file.read" && operation.state === "Completed"));
  const reopened = await openSqliteOperationJournal(journalFile);
  try {
    const persisted = reopened.list(result.executionId);
    assert.equal(persisted.length, 3);
    assert.ok(persisted.every((operation) => operation.state === "Completed" && operation.safety === "read_only"));
  } finally { reopened.close(); }
});

test("offline workflow checkpoints a complete execution and reports only safe summaries", async (t) => {
  const root = await project(t);
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Review the project", provider: selected() });
  const file = path.join(root, ".ai", "state", "executions", `${result.executionId}.json`);
  const saved = JSON.parse(await readFile(file, "utf8")) as { state: string; tasks: Array<{ state: string }> };
  assert.equal(saved.state, "completed");
  assert.equal(saved.tasks.length, 3);
  assert.ok(saved.tasks.every((task) => task.state === "completed"));
  assert.ok(result.tasks.every((task) => task.summary?.includes("No source files were changed")));
});

test("project configuration cannot grant tools and the model cannot request a write", async (t) => {
  const root = await project(t);
  const provider = new ScriptedProvider(async () => ({ kind: "tool_calls", calls: [{ id: "write-attempt", toolId: "file.write", arguments: { path: "created.txt", content: "blocked" } }] }));
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect safely", provider: selected(), providerAdapter: provider });
  assert.equal(result.state, "failed");
  assert.equal(result.failedTasks, 1);
  await assert.rejects(readFile(path.join(root, "created.txt")), { code: "ENOENT" });
});

test("provider failures are sanitized and do not report successful inspection", async (t) => {
  const root = await project(t);
  const provider = new ScriptedProvider(async () => { throw new Error("private-api-key-value"); });
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), providerAdapter: provider });
  assert.equal(result.state, "failed");
  assert.equal(result.termination, "failed");
  assert.ok(result.tasks.every((task) => !task.summary?.includes("private-api-key-value")));
});

test("pre-cancelled workflow stops without contacting the provider and persists cancellation", async (t) => {
  const root = await project(t);
  const provider = new ScriptedProvider(async () => { throw new Error("must not be called"); });
  const controller = new AbortController();
  controller.abort();
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), providerAdapter: provider, signal: controller.signal });
  assert.equal(result.termination, "cancelled");
  assert.equal(result.state, "cancelled");
  assert.equal(provider.calls, 0);
  const saved = JSON.parse(await readFile(path.join(root, ".ai", "state", "executions", `${result.executionId}.json`), "utf8")) as { state: string };
  assert.equal(saved.state, "cancelled");
});

test("cancellation after a read stops the next provider turn and records cancelled execution", async (t) => {
  const root = await project(t);
  const provider = fileReadProvider();
  const controller = new AbortController();
  const result = await runReadOnlyWorkflow({
    projectRoot: root,
    request: "Inspect and cancel after the read",
    provider: selected(),
    providerAdapter: provider,
    signal: controller.signal,
    onProgress: (event) => {
      if (event.kind === "tool" && event.toolStatus === "executed") controller.abort();
    },
  });
  assert.equal(result.termination, "cancelled");
  assert.equal(result.state, "cancelled");
  assert.equal(provider.calls, 1);
  assert.equal(result.completedTasks, 0);
});

test("workflow timeout aborts the model session and is classified separately", async (t) => {
  const root = await project(t);
  const provider = new ScriptedProvider(async (_request) => new Promise<ModelToolTurn>((_resolve, reject) => {
    _request.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  }));
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), providerAdapter: provider, timeoutMs: 1_000 });
  assert.equal(result.state, "cancelled");
  assert.equal(result.termination, "timeout");
});

test("telemetry is optional, private, and a sink failure cannot change execution", async (t) => {
  const root = await project(t);
  const brokenSink = { write() { throw new Error("private-sink-path"); } };
  const result = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), telemetrySink: brokenSink });
  assert.equal(result.state, "completed");
  assert.ok((result.telemetry?.diagnostics.sinkErrors ?? 0) > 0);
  assert.ok(!JSON.stringify(result).includes("private-sink-path"));

  const telemetryDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "harness-app-telemetry-")));
  await chmod(telemetryDirectory, 0o700);
  t.after(async () => rm(telemetryDirectory, { recursive: true, force: true }));
  const captured = await runReadOnlyWorkflow({ projectRoot: root, request: "Inspect again", provider: selected(), telemetryDirectory });
  assert.ok(captured.telemetry?.metrics);
  assert.ok(captured.telemetry.metrics.toolCalls >= 3);
  assert.equal((await stat(captured.telemetry.file!)).mode & 0o077, 0);
});

test("host-supplied tariff rates produce reproducible estimates from reported fixture usage", async (t) => {
  const root = await project(t);
  const provider = fileReadProvider();
  const result = await runReadOnlyWorkflow({
    projectRoot: root,
    request: "Review with metering",
    provider: selected(),
    providerAdapter: provider,
    rates: [{
      provider: "fixture", model: "fixture", currency: "USD", version: "test-rate-v1",
      effectiveDate: "2026-01-01", inputPerMillion: 1, outputPerMillion: 2,
    }],
  });
  assert.equal(result.state, "completed");
  const metrics = result.telemetry?.metrics;
  assert.ok(metrics);
  assert.equal(metrics.tokens.inputTokens, 600);
  assert.equal(metrics.tokens.outputTokens, 120);
  assert.equal(metrics.cost.status, "estimated");
  if (metrics.cost.status === "estimated") {
    assert.ok(Math.abs(metrics.cost.amount - 0.00084) < 1e-12);
    assert.equal(metrics.cost.currency, "USD");
    assert.deepEqual(metrics.cost.rateVersions, ["test-rate-v1"]);
  }
});

test("durable and telemetry paths must be explicit absolute paths", async (t) => {
  const root = await project(t);
  await assert.rejects(runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), journalFile: "relative.sqlite" }), /absolute/);
  await assert.rejects(runReadOnlyWorkflow({ projectRoot: root, request: "Inspect", provider: selected(), telemetryDirectory: "relative" }), /absolute/);
});

test("an invalid durable journal fails closed and is not replaced", async (t) => {
  const root = await project(t);
  const journalDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "harness-app-invalid-journal-")));
  await chmod(journalDir, 0o700);
  t.after(async () => rm(journalDir, { recursive: true, force: true }));
  const filename = path.join(journalDir, "operations.sqlite");
  await writeFile(filename, "not a sqlite journal", { mode: 0o600 });
  const provider = fileReadProvider();
  await assert.rejects(runReadOnlyWorkflow({
    projectRoot: root, request: "Inspect", provider: selected(), providerAdapter: provider, journalFile: filename,
  }), /journal unavailable or invalid/i);
  assert.equal(provider.calls, 0);
  assert.equal(await readFile(filename, "utf8"), "not a sqlite journal");
});
