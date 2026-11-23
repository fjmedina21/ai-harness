/** Trusted test worker. Never loads or executes files from the synthetic project. */
import path from "node:path";
import { openSqliteOperationJournal } from "@ai-harness/checkpointing";
import { EngineeringWorkspace, EngineeringPatchEngine, createEngineeringTools, engineeringHash, patchInvocation } from "../index.js";
const [source, directory, filename] = process.argv.slice(2) as [string, string, string];
const store = await openSqliteOperationJournal(filename);
const binding = { store, requester: { issuer: "fixture", subject: "requester" }, safetyByTool: {} };
const workspace = await EngineeringWorkspace.create({ directory, sourceRoot: source, executionId: "crash-execution", files: ["value.ts"], maxFiles: 16, maxBytes: 65536, ttlMs: 60000, binding, createAuthorized: true });
const engine = new EngineeringPatchEngine(workspace, { version: "crash", allowedPaths: ["value.ts"], allowedOperations: ["replace"], maxFiles: 1, maxBytes: 4096 });
const snapshot = await workspace.inspect(), content = "crash fixture replacement\n";
const patch = await engine.propose({ baseRevision: snapshot.digest, changes: [{ path: "value.ts", operation: "replace", baseHash: snapshot.files[0]!.hash, content, resultHash: engineeringHash(content) }] });
const mutate = workspace.mutate.bind(workspace);
workspace.mutate = async effect => mutate(async () => { await effect(); process.exit(86); });
const tools = createEngineeringTools(engine, binding), identity = { taskId: "apply", requestId: "crash" };
const pending = await tools.dispatch(patchInvocation(patch), identity);
store.decide(pending.approvalId!, { issuer: "fixture", subject: "human" }, true);
await tools.dispatch(patchInvocation(patch), identity, pending.approvalId);
throw new Error("Crash fixture did not exit");
