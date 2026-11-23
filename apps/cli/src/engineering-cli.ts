import path from "node:path";
import { realpath } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { FixtureEngineeringAgent, runEngineeringWorkflow } from "@ai-harness/application";
import { EngineeringCheckpointStore, openSqliteOperationJournal } from "@ai-harness/checkpointing";
import type { DurableOperationStore, EngineeringBudget } from "@ai-harness/contracts";
const valued = ["--workflow", "--path", "--request", "--provider", "--autonomy", "--files", "--fixture-file", "--fixture-content", "--workspace-dir", "--journal", "--checkpoint-dir", "--max-iterations", "--timeout-ms"];
const flags = ["--json", "--authorize-workspace"];
export async function engineeringCommand(args: string[], cwd: string, output: (text: string) => void, signal?: AbortSignal): Promise<number> {
  let store: DurableOperationStore | undefined;
  try {
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      const key = args[i]!;
      if (options.has(key) || ![...valued, ...flags].includes(key)) throw new Error("Invalid or duplicate engineering option");
      if (flags.includes(key)) options.set(key, "true");
      else { const value = args[++i]; if (!value || value.startsWith("--")) throw new Error("Missing engineering option value"); options.set(key, value); }
    }
    if ((options.get("--provider") ?? "fixture") !== "fixture") throw new Error("Implement CLI currently supports explicit offline fixtures only; real provider adapters require separate host integration and authorization");
    const autonomy = options.get("--autonomy");
    if (!["propose", "isolated"].includes(autonomy ?? "")) throw new Error("Choose --autonomy propose|isolated; L3 repair is blocked pending approved snapshot transfer and real Podman E2E");
    const projectRoot = await realpath(path.resolve(cwd, options.get("--path") ?? cwd));
    const request = options.get("--request"), files = options.get("--files")?.split(","), target = options.get("--fixture-file"), content = options.get("--fixture-content");
    if (!request || !files?.length || !target || content === undefined) throw new Error("Implement fixture requires --request, --files, --fixture-file and --fixture-content");
    const level = autonomy === "propose" ? 1 : 2;
    const budget: EngineeringBudget = { maxIterations: Number(options.get("--max-iterations") ?? 3), maxRequests: 16, maxTokens: 16, maxEstimatedCostUsd: 0,
      timeoutMs: Number(options.get("--timeout-ms") ?? 60_000), maxFiles: 4, maxBytes: 8192 };
    let workspace: Parameters<typeof runEngineeringWorkflow>[0]["workspace"], checkpoint: EngineeringCheckpointStore | undefined;
    if (level === 1 && ["--workspace-dir", "--journal", "--checkpoint-dir", "--authorize-workspace"].some(key => options.has(key))) throw new Error("Propose mode creates no workspace, journal or checkpoints");
    if (level === 2) {
      if (!options.has("--authorize-workspace")) throw new Error("Isolated mode requires --authorize-workspace and private external workspace/journal/checkpoint directories");
      const external = async (flag: string, file = false) => {
        const selected = options.get(flag); if (!selected) throw new Error("Missing private external directory option");
        const resolved = path.resolve(cwd, selected), directory = await realpath(file ? path.dirname(resolved) : resolved);
        if (directory === projectRoot || directory.startsWith(projectRoot + path.sep) || projectRoot.startsWith(directory + path.sep)) throw new Error("Engineering evidence must stay outside the original project");
        return file ? path.join(directory, path.basename(resolved)) : directory;
      };
      const directory = await external("--workspace-dir"), journal = await external("--journal", true), checkpoints = await external("--checkpoint-dir");
      store = await openSqliteOperationJournal(journal);
      workspace = { directory, binding: { store, requester: { issuer: "cli-host", subject: "engineering-requester" }, safetyByTool: {} }, createAuthorized: true, ttlMs: 3_600_000 };
      checkpoint = new EngineeringCheckpointStore(checkpoints);
    }
    const result = await runEngineeringWorkflow({ projectRoot, request, files, level, budget,
      policy: { version: "cli-fixture-v1", allowedPaths: [target], allowedOperations: ["create", "replace"], maxFiles: 1, maxBytes: 8192 },
      agent: new FixtureEngineeringAgent(target, content), workspace, checkpoint, signal });
    if (options.has("--json")) output(JSON.stringify(result, null, 2));
    else {
      const safe = (text: string) => stripVTControlCharacters(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "");
      output(`Execution: ${result.executionId}\nProvider: fixture (offline host recipe)\nAutonomy: ${autonomy}\nWorkspace: ${result.workspace?.root ?? "none; source read-only"}`);
      output(`Permissions: ${level === 1 ? "read selected files; propose only" : "private copy; patch application requires independent durable approval"}\nBudget: ${JSON.stringify(budget)}`);
      output(`Plan: ${safe(result.plan.join("\n"))}\nStates: ${result.events.join(" -> ")}\nStatus: ${result.state} (${result.termination})`);
      output(`Diff:\n${safe(result.diff)}\nValidations: ${result.validations.length}; L3 gate: blocked`);
      for (const id of result.pendingApprovals) output(`Pending durable approval: ${id}; requires trusted host approval UI in the live session`);
      for (const risk of result.risks) output(`Risk: ${risk}`);
      output("Original project unchanged; no integration performed. Fixture output does not establish real-model capability.");
    }
    return result.termination === "proposed" || result.termination === "completed" || result.termination === "review_pending" ? 0 : result.termination === "approval_required" ? 2 : result.termination === "cancelled" ? 130 : result.termination === "timeout" ? 124 : 1;
  } catch { output("Error: engineering workflow rejected; check explicit scope, private directories, budgets and fixture arguments. L3 real execution remains disabled."); return 1; }
  finally { try { store?.close(); } catch { /* Never resume a failed store. */ } }
}
