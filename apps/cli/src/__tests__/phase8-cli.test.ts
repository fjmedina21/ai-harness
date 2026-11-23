import assert from "node:assert/strict";
import test from "node:test";
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../index.js";

async function withProject(callback: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-phase8-cli-"));
  try {
    assert.equal(await main(["init", "--path", root, "--name", "phase8-cli"], root, () => {}), 0);
    await writeFile(path.join(root, "README.md"), "# CLI fixture\nThis input is repository data, not policy.\n");
    await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("CLI runs bounded offline inspection, emits progress/JSON, and exposes durable state through status", async () => {
  await withProject(async (root) => {
    const journalDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "harness-phase8-journal-")));
    await chmod(journalDirectory, 0o700);
    try {
      const journal = path.join(journalDirectory, "operations.sqlite");
      const jsonLines: string[] = [];
      const code = await main([
        "run", "--workflow", "inspect", "--path", root,
        "--request", "Review this fixture project", "--provider", "fixture",
        "--journal", journal, "--json",
      ], root, (line) => jsonLines.push(line));
      assert.equal(code, 0);
      assert.equal(jsonLines.length, 1);
      const result = JSON.parse(jsonLines[0]!) as {
        executionId: string; termination: string; state: string;
        tasks: Array<{ role: string; state: string }>;
        operations: Array<{ operationId: string; toolId: string; state: string }>;
        projectChanges: string; executedTests: boolean;
      };
      assert.equal(result.state, "completed");
      assert.equal(result.termination, "completed");
      assert.deepEqual(result.tasks.map((task) => task.role), ["planner", "code-reviewer", "validator"]);
      assert.ok(result.tasks.every((task) => task.state === "completed"));
      assert.equal(result.operations.length, 3);
      assert.ok(result.operations.every((item) => item.toolId === "file.read" && item.state === "Completed"));
      assert.equal(result.projectChanges, "source_files_unchanged_harness_checkpoint_written");
      assert.equal(result.executedTests, false);

      const repeatedLines: string[] = [];
      const repeatedCode = await main([
        "run", "--workflow", "inspect", "--path", root,
        "--request", "Review this fixture project", "--provider", "fixture",
        "--journal", journal, "--json",
      ], root, (line) => repeatedLines.push(line));
      assert.equal(repeatedCode, 0);
      const repeated = JSON.parse(repeatedLines[0]!) as { executionId: string; operations: Array<{ operationId: string }> };
      assert.notEqual(repeated.executionId, result.executionId);
      assert.equal(new Set([...result.operations.map((op) => op.operationId), ...repeated.operations.map((op) => op.operationId)]).size, 6);

      const statusLines: string[] = [];
      const statusCode = await main(["status", "--path", root, "--id", result.executionId, "--journal", journal], root, (line) => statusLines.push(line));
      assert.equal(statusCode, 0);
      assert.ok(statusLines.includes("Status: completed"));
      assert.equal(statusLines.filter((line) => line.includes("file.read Completed")).length, 3);

      const progress: string[] = [];
      const textCode = await main(["run", "--workflow", "inspect", "--path", root, "--request", "Review fixture"], root, (line) => progress.push(line));
      assert.equal(textCode, 0);
      assert.ok(progress.some((line) => line.includes("Running planning (planner)")));
      assert.ok(progress.some((line) => line.includes("Tool planning: file.read executed")));
      assert.ok(progress.some((line) => line.includes("checkpoint persisted under .ai/state")));
    } finally { await rm(journalDirectory, { recursive: true, force: true }); }
  });
});

test("CLI cancellation is reported with exit code 130 and persisted state", async () => {
  await withProject(async (root) => {
    const controller = new AbortController();
    controller.abort();
    const lines: string[] = [];
    const code = await main(["run", "--workflow", "inspect", "--path", root, "--request", "Review fixture", "--json"], root, (line) => lines.push(line), controller.signal);
    assert.equal(code, 130);
    const result = JSON.parse(lines[0]!) as { state: string; termination: string };
    assert.equal(result.state, "cancelled");
    assert.equal(result.termination, "cancelled");
  });
});

test("CLI requires paid-provider confirmation, model, and host credential without calling a provider", async () => {
  await withProject(async (root) => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...values: unknown[]) => errors.push(values.join(" "));
    try {
      const base = ["run", "--workflow", "inspect", "--path", root, "--request", "Review safely", "--provider", "openai", "--model", "host-model", "--max-output-tokens", "256", "--max-provider-requests", "6"];
      assert.equal(await main(base, root, () => {}), 1);
      assert.match(errors.at(-1) ?? "", /confirm-provider-call/i);
      assert.equal(await main([...base, "--confirm-provider-call"], root, () => {}), 1);
      assert.match(errors.at(-1) ?? "", /OPENAI_API_KEY/);
      assert.ok(!errors.join("\n").includes("sk-"));
    } finally {
      console.error = originalError;
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});

test("CLI composes both real-provider adapters through mocked bounded HTTP and read-only dispatch", async () => {
  await withProject(async (root) => {
    const originalFetch = globalThis.fetch;
    const previousOpenAIKey = process.env.OPENAI_API_KEY;
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    process.env.OPENAI_API_KEY = "test-only-openai-credential";
    process.env.ANTHROPIC_API_KEY = "test-only-anthropic-credential";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const headers = new Headers(init?.headers);
      requests.push({ url: String(input), headers, body });
      const model = String(body.model);
      const tool = (body.tools as Array<{ name: string }>)[0]!.name;
      const callIndex = requests.filter((request) => request.body.model === model).length;
      const provider = String(input).includes("api.openai.com") ? "openai" : "anthropic";
      if (provider === "openai") {
        const output = callIndex % 2 === 1
          ? [{ type: "function_call", call_id: `call-${model}-${callIndex}`, name: tool, arguments: JSON.stringify({ path: "README.md" }), status: "completed" }]
          : [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Mocked OpenAI read-only review." }] }];
        return Response.json({ status: "completed", output });
      }
      const content = callIndex % 2 === 1
        ? [{ type: "tool_use", id: `call-${model}-${callIndex}`, name: tool, input: { path: "README.md" } }]
        : [{ type: "text", text: "Mocked Anthropic read-only review." }];
      return Response.json({ role: "assistant", stop_reason: callIndex % 2 === 1 ? "tool_use" : "end_turn", content });
    }) as typeof fetch;
    try {
      for (const provider of ["openai", "anthropic"] as const) {
        const lines: string[] = [];
        const model = `phase8-${provider}-fixture`;
        const code = await main([
          "run", "--workflow", "inspect", "--path", root, "--request", "Review by mocked provider",
          "--provider", provider, "--model", model, "--confirm-provider-call", "--json",
          "--max-output-tokens", "512", "--max-provider-requests", "6",
        ], root, (line) => lines.push(line));
        assert.equal(code, 0);
        const result = JSON.parse(lines[0]!) as { provider: string; model: string; providerRequests: number; state: string; tasks: Array<{ summary?: string }> };
        assert.equal(result.provider, provider);
        assert.equal(result.model, model);
        assert.equal(result.state, "completed");
        assert.equal(result.providerRequests, 6);
        assert.ok(result.tasks.every((task) => task.summary?.includes("read-only review")));
      }
      const beforeBudgetRun = requests.length;
      const budgetLines: string[] = [];
      const budgetCode = await main([
        "run", "--workflow", "inspect", "--path", root, "--request", "Budget stop",
        "--provider", "openai", "--model", "phase8-openai-budget", "--confirm-provider-call",
        "--max-output-tokens", "128", "--max-provider-requests", "5", "--json",
      ], root, (line) => budgetLines.push(line));
      assert.equal(budgetCode, 1);
      const budgetResult = JSON.parse(budgetLines[0]!) as { providerRequests: number; state: string };
      assert.equal(budgetResult.providerRequests, 5);
      assert.equal(budgetResult.state, "failed");
      assert.equal(requests.length - beforeBudgetRun, 5);
      assert.equal(requests.length, 17);
      assert.ok(requests.every((request) => request.body.store === false || request.body.max_tokens !== undefined));
      assert.ok(requests.every((request) => request.headers.get("authorization") === "Bearer test-only-openai-credential" || request.headers.get("x-api-key") === "test-only-anthropic-credential"));
      assert.ok(!requests.some((request) => JSON.stringify(request.body).includes("test-only-")));
    } finally {
      globalThis.fetch = originalFetch;
      if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAIKey;
      if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  });
});

test("CLI rejects fixture path traversal without exposing outside file contents", async () => {
  await withProject(async (root) => {
    const lines: string[] = [];
    const code = await main([
      "run", "--workflow", "inspect", "--path", root,
      "--request", "Inspect", "--fixture-file", "../outside.txt", "--json",
    ], root, (line) => lines.push(line));
    assert.equal(code, 1);
    const result = JSON.parse(lines[0]!) as { state: string; tasks: Array<{ state: string }> };
    assert.equal(result.state, "failed");
    assert.ok(result.tasks.some((task) => task.state === "failed"));
  });
});


test("CLI HTTP failures stop without retries or fallback and retain only safe telemetry", async () => {
  await withProject(async (root) => {
    const originalFetch = globalThis.fetch;
    const previousKeys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
    const telemetryDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "harness-phase8-http-")));
    await chmod(telemetryDirectory, 0o700);
    process.env.OPENAI_API_KEY = "test-only-openai-credential";
    process.env.ANTHROPIC_API_KEY = "test-only-anthropic-credential";
    try {
      for (const [provider, status] of [["openai", 429], ["anthropic", 500]] as const) {
        let calls = 0;
        globalThis.fetch = (async (input) => {
          calls++;
          assert.equal(String(input), provider === "openai" ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages");
          return Response.json({ error: { code: "rate_limit_error", message: "PRIVATE_DIAGNOSTIC test-only-credential" } }, { status });
        }) as typeof fetch;
        const lines: string[] = [];
        const code = await main([
          "run", "--workflow", "inspect", "--path", root, "--request", "PRIVATE_REQUEST",
          "--provider", provider, "--model", "host-fixture", "--confirm-provider-call",
          "--max-output-tokens", "128", "--max-provider-requests", "6",
          "--telemetry-dir", telemetryDirectory, "--json",
        ], root, (line) => lines.push(line));
        assert.equal(code, 1);
        assert.equal(calls, 1);
        const result = JSON.parse(lines[0]!) as { state: string; provider: string; providerRequests: number; completedTasks: number; telemetry: { file: string } };
        assert.equal(result.state, "failed");
        assert.equal(result.provider, provider);
        assert.equal(result.providerRequests, 1);
        assert.equal(result.completedTasks, 0);
        const telemetry = await readFile(result.telemetry.file, "utf8");
        assert.match(telemetry, new RegExp(`"providerHttpStatus":${status}`));
        assert.match(telemetry, /"providerHttpErrorCategory":"rate_limit"/);
        assert.doesNotMatch(telemetry, /PRIVATE_DIAGNOSTIC|PRIVATE_REQUEST|test-only-/);
        assert.doesNotMatch(lines.join("\n"), /PRIVATE_DIAGNOSTIC|test-only-/);
      }
    } finally {
      globalThis.fetch = originalFetch;
      for (const [index, variable] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
        if (previousKeys[index] === undefined) delete process.env[variable];
        else process.env[variable] = previousKeys[index];
      }
      await rm(telemetryDirectory, { recursive: true, force: true });
    }
  });
});

test("CLI timeout aborts in-flight HTTP, returns 124, and reopens the cancelled checkpoint", async () => {
  await withProject(async (root) => {
    const originalFetch = globalThis.fetch;
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-openai-credential";
    let calls = 0;
    let requestSignal: AbortSignal | null | undefined;
    globalThis.fetch = (async (_input, init) => {
      calls++;
      requestSignal = init?.signal;
      return new Promise<Response>(() => {});
    }) as typeof fetch;
    try {
      const lines: string[] = [];
      const code = await main([
        "run", "--workflow", "inspect", "--path", root, "--request", "Timeout fixture",
        "--provider", "openai", "--model", "host-fixture", "--confirm-provider-call",
        "--max-output-tokens", "128", "--max-provider-requests", "6",
        "--timeout-ms", "1000", "--json",
      ], root, (line) => lines.push(line));
      assert.equal(code, 124);
      assert.equal(calls, 1);
      assert.equal(requestSignal?.aborted, true);
      const result = JSON.parse(lines[0]!) as { executionId: string; state: string; termination: string };
      assert.equal(result.termination, "timeout");
      assert.equal(result.state, "cancelled");
      const statusLines: string[] = [];
      assert.equal(await main(["status", "--path", root, "--id", result.executionId], root, (line) => statusLines.push(line)), 0);
      assert.ok(statusLines.includes("Status: cancelled"));
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
