import { InMemoryTelemetrySink, TelemetrySession } from "@ai-harness/observability";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createOpenAIEngineeringAgent, runEngineeringWorkflow } from "@ai-harness/application";
import { readPrivateCostRates } from "./rates.js";
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error("Missing explicit smoke configuration"); return value; }
function integer(name: string, max: number): number { const text = required(name); const n = Number(text); if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("Invalid smoke budget"); return n; }
/** Separate opt-in only. A valid provider response alone is not a successful smoke. */
export async function runEngineeringProviderSmoke(output = console.log): Promise<number> {
  if (process.env.HARNESS_ENGINEERING_REAL_CONFIRM !== "YES" || process.env.HARNESS_ENGINEERING_ALLOW_UNCERTAIN_COST !== "YES") {
    output("Skipped: explicit engineering smoke confirmation and uncertain-cost policy are required"); return 2;
  }
  const startedAt = new Date().toISOString(), started = performance.now();
  const sink = new InMemoryTelemetrySink(1024), observer = new TelemetrySession({ sink });
  let expectedChangeValid = false;
  let root: string | undefined;
  let result: Awaited<ReturnType<typeof runEngineeringWorkflow>> | undefined;
  let unchanged = false, cleanup = "not_needed", exitCode = 1, accepted = false;
  try {
    const model = required("HARNESS_ENGINEERING_REAL_MODEL");
    const maxRequests = integer("HARNESS_ENGINEERING_REAL_REQUEST_BUDGET", 6);
    if (maxRequests < 4) throw new Error("Smoke requires four role turns");
    const maxOutputTokens = integer("HARNESS_ENGINEERING_REAL_OUTPUT_TOKEN_BUDGET", 512);
    const timeoutMs = integer("HARNESS_ENGINEERING_REAL_TIMEOUT_MS", 900000);
    const requestTimeoutMs = integer("HARNESS_ENGINEERING_REAL_REQUEST_TIMEOUT_MS", 300000);
    const roleTimeoutMs = integer("HARNESS_ENGINEERING_REAL_ROLE_TIMEOUT_MS", 300000);
    const rates = process.env.HARNESS_ENGINEERING_REAL_RATES ? await readPrivateCostRates(path.resolve(required("HARNESS_ENGINEERING_REAL_RATES"))) : undefined;
    root = await realpath(await mkdtemp(path.join(await realpath(tmpdir()), "harness-live-engineering-")));
    const before = "export const value = 1;\n";
    await writeFile(path.join(root, "value.ts"), before, { mode: 0o600, flag: "wx" });
    const agent = createOpenAIEngineeringAgent({ model, maxRequests, maxOutputTokens, maxContextBytes: 16384, maxContextTokens: 8192,
      paidCallConfirmed: true, allowUncertainCost: true, timeoutMs: requestTimeoutMs, ...(rates ? { rates } : {}) });
    result = await runEngineeringWorkflow({ projectRoot: root, request: "Change the exported value constant from 1 to 2. Preserve the single-line module interface and formatting.", files: ["value.ts"], level: 1,
      agent, timing: { roleTimeoutMs }, telemetry: observer.trace("live-synthetic-diagnostic"), modelAdapterAuthorized: true, allowUncertainCost: true, policy: { version: "live-synthetic-v1", allowedPaths: ["value.ts"], allowedOperations: ["replace"], maxFiles: 1, maxBytes: 2048 },
      budget: { maxIterations: 1, maxRequests, maxTokens: maxRequests * (8192 + maxOutputTokens), maxEstimatedCostUsd: rates ? 10 : 0, timeoutMs, maxFiles: 1, maxBytes: 2048 } });
    unchanged = await readFile(path.join(root, "value.ts"), "utf8") === before;
    const change = result.proposals[0]?.changes[0];
    expectedChangeValid = result.proposals.length === 1 && result.proposals[0]?.changes.length === 1 && change?.path === "value.ts" && change.operation === "replace" && change.content?.trim() === "export const value = 2;";
    accepted = result.termination === "proposed" && result.proposalValidation === "passed" && expectedChangeValid &&
      result.reviews.some(r => r.role === "code-reviewer") && Boolean(result.diff) && unchanged;
    exitCode = accepted ? 0 : 1;
  } catch { exitCode = 1; }
  finally {
    if (root) { try { await rm(root, { recursive: true, force: true }); cleanup = "confirmed"; } catch { cleanup = "uncertain"; } }
    await observer.close();
    const roles = sink.events().filter(e => e.type === "span.end" && e.attributes.phase === "role").map(e => ({ role: e.context.agentRole, requestIndex: e.attributes.requestIndex, durationMs: e.durationMs, status: e.status }));
    const events = sink.events();
    const observations = (name: "provider.request" | "provider.http") => events.filter(e => e.type === "span.start" && e.name === name).map((start, index) => {
      const end = events.find(e => e.type === "span.end" && e.context.spanId === start.context.spanId);
      return { requestIndex: index + 1, role: start.context.agentRole, durationMs: end?.durationMs ?? null, status: end?.status ?? "unobserved",
        ...(name === "provider.http" ? { httpStatus: end?.attributes.providerHttpStatus ?? null } : { usage: end?.usage ?? { availability: "unavailable" } }) };
    });
    const requests = observations("provider.request"), httpRequests = observations("provider.http");
    output(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), durationMs: performance.now() - started, executionId: result?.executionId, roles, providerRequests: requests, httpRequests,
      timing: result?.timing, usageComplete: result?.usageComplete, expectedChangeValid, reviewerCompleted: result?.reviews.some(r => r.role === "code-reviewer") ?? false,
      diffBytes: result ? Buffer.byteLength(result.diff) : 0, diffDigest: result?.diff ? createHash("sha256").update(result.diff).digest("hex") : null, provider: "openai", model: result?.model, smokePassed: accepted && cleanup === "confirmed", status: result?.termination ?? "configuration_or_runtime_failure", proposalValidated: result?.proposalValidation === "passed",
      patchDigests: result?.proposals.map(p => p.digest) ?? [], providerFailure: result?.providerFailure, requests: result?.usage.requests ?? 0, usage: result?.reportedUsage ?? { availability: "unavailable" },
      cost: result?.cost ?? { status: "unknown", reason: "missing_usage" }, sourceUnchanged: unchanged, patchApplied: false, executedGeneratedCode: false, realL3: "blocked", cleanup }, null, 2));
  }
  return cleanup === "confirmed" ? exitCode : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runEngineeringProviderSmoke().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
