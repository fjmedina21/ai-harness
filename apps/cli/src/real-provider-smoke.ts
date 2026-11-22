import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeProject } from "@ai-harness/core";
import { InMemoryTelemetrySink } from "@ai-harness/observability";
import { runReadOnlyWorkflow } from "@ai-harness/application";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** Explicit manual smoke test; excluded from the default `pnpm test` suite. */
async function main(): Promise<number> {
  const provider = process.env.HARNESS_REAL_PROVIDER;
  if (provider !== "openai" && provider !== "anthropic") {
    console.log("Skipped: set HARNESS_REAL_PROVIDER=openai or anthropic to opt in.");
    return 2;
  }
  if (process.env.HARNESS_REAL_PROVIDER_CONFIRM !== "YES") {
    console.log("Skipped: set HARNESS_REAL_PROVIDER_CONFIRM=YES to authorize a potentially billable request.");
    return 2;
  }
  const model = required("HARNESS_REAL_MODEL");
  const maxOutputTokens = Number(required("HARNESS_REAL_OUTPUT_TOKEN_BUDGET"));
  const maxProviderRequests = Number(required("HARNESS_REAL_REQUEST_BUDGET"));
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 128)
    throw new Error("Real-provider smoke output token budget must be 1..128 per request");
  if (!Number.isSafeInteger(maxProviderRequests) || maxProviderRequests < 6 || maxProviderRequests > 9)
    throw new Error("Real-provider smoke request budget must be 6..9 total requests");
  const credential = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[credential]?.trim()) throw new Error(`Missing host credential: ${credential}`);

  const parent = await realpath(os.tmpdir());
  const root = await realpath(await mkdtemp(path.join(parent, "harness-provider-smoke-")));
  await chmod(root, 0o700);
  try {
    await initializeProject({ root, projectName: "provider-smoke-fixture" });
    await writeFile(path.join(root, "README.md"), "# Public smoke fixture\nOnly this fixed synthetic file is sent to the selected provider.\n", { mode: 0o600, flag: "wx" });
    let readCalls = 0;
    const result = await runReadOnlyWorkflow({
      projectRoot: root,
      request: "Summarize the synthetic smoke fixture and state its limitations.",
      provider: { id: provider, model, paidCallConfirmed: true, maxOutputTokens, maxProviderRequests },
      timeoutMs: 60_000,
      telemetrySink: new InMemoryTelemetrySink(512),
      onProgress: (event) => { if (event.kind === "tool" && event.toolId === "file.read" && event.toolStatus === "executed") readCalls++; },
    });
    const tokens = result.telemetry?.metrics?.tokens;
    console.log(JSON.stringify({
      provider: result.provider,
      model: result.model,
      executionId: result.executionId,
      state: result.state,
      completedTasks: result.completedTasks,
      totalTasks: result.totalTasks,
      providerRequests: result.providerRequests,
      readOnlyFileCalls: readCalls,
      reportedInputTokens: tokens?.availability === "reported" ? tokens.inputTokens : undefined,
      reportedOutputTokens: tokens?.availability === "reported" ? tokens.outputTokens : undefined,
      cost: result.telemetry?.metrics?.cost ?? { status: "unknown", reason: "no_host_tariff_supplied" },
      projectChanges: result.projectChanges,
      executedTests: result.executedTests,
    }, null, 2));
    return result.termination === "completed" && readCalls === 3 ? 0 : 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().then((code) => { process.exitCode = code; }).catch(() => {
  console.error("Real-provider smoke failed; verify host model, credential, budget and network access.");
  process.exitCode = 1;
});
