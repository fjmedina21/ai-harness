import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openSqliteOperationJournal, EngineeringCheckpointStore, ProposalArtifactStore } from "@ai-harness/checkpointing";
import { InMemoryTelemetrySink, TelemetrySession } from "@ai-harness/observability";
import { createOpenAIEngineeringAgent } from "./engineering-provider.js";
import { ContinuationCoordinator } from "./engineering-resume.js";
import { HumanApprovalAuthority } from "@ai-harness/security";
import { runEngineeringWorkflow } from "./engineering.js";
export interface EngineeringBenchmarkCase { files: number; fileBytes: number; level: 1 | 2; simulatedLatencyMs: number }
const defaults: EngineeringBenchmarkCase[] = ([1, 2] as const).flatMap(level => [0, 5].flatMap(simulatedLatencyMs =>
  [{ files: 1, fileBytes: 128 }, { files: 4, fileBytes: 512 }, { files: 8, fileBytes: 512 }].map(c => ({ ...c, level, simulatedLatencyMs }))));
const median = (numbers: number[]) => { const n = [...numbers].sort((a, b) => a - b); return n.length % 2 ? n[Math.floor(n.length / 2)]! : (n[n.length / 2 - 1]! + n[n.length / 2]!) / 2; };
/** Trusted harness code only: synthetic text, mocked HTTP, real private FS/SQLite. */
export async function runEngineeringBenchmarks(samples = 5, cases: readonly EngineeringBenchmarkCase[] = defaults) {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 10 || !cases.length || cases.length > 12 || cases.some(c =>
    ![1, 2].includes(c.level) || !Number.isSafeInteger(c.files) || c.files < 1 || c.files > 8 || !Number.isSafeInteger(c.fileBytes) || c.fileBytes < 64 || c.fileBytes > 512 ||
    !Number.isSafeInteger(c.simulatedLatencyMs) || c.simulatedLatencyMs < 0 || c.simulatedLatencyMs > 25)) throw new Error("Invalid benchmark configuration");
  const results = [];
  for (const scenario of cases) {
    const runs: { totalMs: number; providerMs: number; applicationMs: number; requests: number; configuredSimulatedMs: number; phases: Record<string, number> }[] = [];
    for (let sample = 0; sample < samples; sample++) {
      const root = await realpath(await mkdtemp(path.join(tmpdir(), "harness-engineering-bench-")));
      let store: Awaited<ReturnType<typeof openSqliteOperationJournal>> | undefined;
      try {
        const source = path.join(root, "source"), workspace = path.join(root, "workspace"), state = path.join(root, "state");
        for (const dir of [source, workspace, state]) await mkdir(dir, { mode: 0o700 });
        const files = Array.from({ length: scenario.files }, (_, i) => i ? `file${i}.ts` : "value.ts");
        const before = "export const value = 1;\n" + " ".repeat(scenario.fileBytes - 23);
        for (const file of files) await writeFile(path.join(source, file), before, { mode: 0o600 });
        store = scenario.level === 2 ? await openSqliteOperationJournal(path.join(state, "bench.sqlite")) : undefined;
        const sink = new InMemoryTelemetrySink(), telemetry = new TelemetrySession({ sink });
        const agent = createOpenAIEngineeringAgent({ model: "benchmark-fixture", paidCallConfirmed: true, allowUncertainCost: true,
          maxRequests: 6, maxOutputTokens: 512, maxContextBytes: 32768, maxContextTokens: 32768, timeoutMs: 1000,
          providerOptions: { apiKey: "fixture-not-real", fetcher: async (_url, init) => {
            if (scenario.simulatedLatencyMs) await new Promise(resolve => setTimeout(resolve, scenario.simulatedLatencyMs));
            const input = JSON.parse(JSON.parse(String(init?.body)).input);
            const output = input.role === "backend-developer" ? { summary: "Synthetic proposal", proposal: { baseRevision: input.snapshot.digest,
              changes: [{ path: "value.ts", operation: "replace", baseHash: input.snapshot.files.find((f: { path: string }) => f.path === "value.ts").hash, content: "export const value = 2;\n", resultHash: null }] } } : { summary: "Synthetic advisory" };
            return Response.json({ status: "completed", output_text: JSON.stringify(output), usage: { input_tokens: 50, output_tokens: 20 } });
          } } });
        const start = performance.now();
        const result = await runEngineeringWorkflow({ projectRoot: source, request: "Synthetic bounded benchmark replacement", files, level: scenario.level,
          agent, modelAdapterAuthorized: true, allowUncertainCost: true, telemetry: telemetry.trace("benchmark-diagnostic"),
          policy: { version: "benchmark", allowedPaths: files, allowedOperations: ["replace"], maxFiles: 8, maxBytes: 8192 },
          budget: { maxIterations: 1, maxRequests: 6, maxTokens: 100000, maxEstimatedCostUsd: 0, timeoutMs: 5000, maxFiles: 8, maxBytes: 8192 },
          ...(store ? { workspace: { directory: workspace, binding: { store, requester: { issuer: "github.com", subject: "101" }, safetyByTool: {} }, createAuthorized: true as const, ttlMs: 60000 },
            checkpoint: new EngineeringCheckpointStore(state), proposalArtifacts: new ProposalArtifactStore(state) } : {}) });
        if (store) {
          const operation = store.list(result.executionId).find(op => op.toolId === "patch.apply")!;
          const coordinator = new ContinuationCoordinator({ store, artifacts: new ProposalArtifactStore(state), policy: { version: "benchmark", allowedPaths: files, allowedOperations: ["replace"], maxFiles: 8, maxBytes: 8192 },
            verifier: { verify: async (_credential, binding) => ({ issuer: "github.com", subject: "101", roles: ["harness:reader", "harness:approver", "harness:operator"], expiresAt: Date.now() + 60000, binding }) } });
          await coordinator.decide(operation.operationId, "synthetic-benchmark", true, new HumanApprovalAuthority({ method: "reviewed-external-v1", verify: async () => true }));
          await coordinator.continue(operation.operationId, "synthetic-benchmark", 5000);
        }
        const totalMs = performance.now() - start; await telemetry.flush();
        if (result.termination !== (scenario.level === 1 ? "proposed" : "approval_required") || await readFile(path.join(source, "value.ts"), "utf8") !== before) throw new Error("Benchmark acceptance failed");
        const events = sink.events().filter(e => e.type === "span.end"), phases: Record<string, number> = {};
        for (const e of events) {
          const key = e.attributes.phase ?? (e.name === "tool.dispatch" ? "dispatcher" : undefined);
          if (key) phases[key] = (phases[key] ?? 0) + (e.durationMs ?? 0);
        }
        const providerMs = events.filter(e => e.name === "provider.request").reduce((n, e) => n + (e.durationMs ?? 0), 0);
        runs.push({ totalMs, providerMs, applicationMs: Math.max(0, totalMs - providerMs), requests: result.usage.requests,
          configuredSimulatedMs: scenario.simulatedLatencyMs * result.usage.requests, phases });
        await telemetry.close();
      } finally { store?.close(); await rm(root, { recursive: true, force: true }); }
    }
    const phaseNames = [...new Set(runs.flatMap(r => Object.keys(r.phases)))];
    results.push({ ...scenario, selectedBytes: scenario.files * scenario.fileBytes, samples,
      medianTotalMs: median(runs.map(r => r.totalMs)), medianProviderMs: median(runs.map(r => r.providerMs)), medianApplicationMs: median(runs.map(r => r.applicationMs)),
      medianConfiguredSimulatedMs: median(runs.map(r => r.configuredSimulatedMs)), requests: runs[0]!.requests,
      phaseMedianMs: Object.fromEntries(phaseNames.map(p => [p, median(runs.map(r => r.phases[p] ?? 0))])), runs });
  }
  return { scope: "mocked_http_real_filesystem_sqlite", samplesPerCase: samples, node: process.version, results };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runEngineeringBenchmarks().then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Engineering benchmark failed"); process.exitCode = 1; });
