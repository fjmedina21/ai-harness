import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { EngineeringPolicy, FileChange, StructuredPatch, ToolDispatchContext, ToolInvocation, ToolParameterSchema, WorkspaceSnapshot } from "@ai-harness/contracts";
import { ToolDispatcher } from "./dispatcher.js";
import { ToolRegistry } from "./index.js";
import { EngineeringWorkspace, engineeringCreateTargetAbsent, engineeringFile, engineeringHash, engineeringLimit, engineeringPath, writeEngineeringFile } from "./engineering-workspace.js";

export interface EngineeringView {
  readonly receipt: { executionId: string; workspaceId: string; root: string; baseRevision: string };
  checkCreate?(relative: string, signal?: AbortSignal): Promise<void>;
  inspect(signal?: AbortSignal): Promise<WorkspaceSnapshot>;
  read(relative: string, signal?: AbortSignal): Promise<string>;
}
/** L1 reads an explicit selection without creating any files or journal/checkpoint. */
export async function openEngineeringSource(root: string, executionId: string, selection: readonly string[]): Promise<EngineeringView> {
  if (!selection.length || selection.length > 256 || new Set(selection.map(p => engineeringPath(p).toLowerCase())).size !== selection.length) throw new Error("Invalid source selection");
  const files = [...selection].sort();
  const inspect = async (signal?: AbortSignal): Promise<WorkspaceSnapshot> => {
    let bytes = 0;
    const inventory = [];
    for (const file of files) {
      const data = await engineeringFile(root, file, signal);
      bytes += data.length;
      if (bytes > 4 * 1024 * 1024) throw new Error("Source selection exceeds byte limit");
      inventory.push({ path: file, hash: engineeringHash(data), bytes: data.length });
    }
    return { digest: engineeringHash(JSON.stringify(inventory)), files: inventory };
  };
  const base = await inspect();
  return { receipt: Object.freeze({ executionId, workspaceId: "proposal-" + randomUUID(), root, baseRevision: base.digest }), inspect,
    checkCreate: (relative, signal) => engineeringCreateTargetAbsent(root, relative, signal),
    async read(relative, signal) {
      if (!files.includes(engineeringPath(relative))) throw new Error("Read outside selection");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await engineeringFile(root, relative, signal));
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("Binary content rejected");
      return text;
    } };
}
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k))) throw new Error("Invalid patch schema");
}
const hashValue = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export class EngineeringPatchEngine {
  private readonly policy: EngineeringPolicy;
  private readonly proposals = new Map<string, StructuredPatch>();
  readonly policyDigest: string;
  constructor(readonly view: EngineeringView, policy: EngineeringPolicy) {
    engineeringLimit(policy.maxFiles, 16); engineeringLimit(policy.maxBytes, 8192);
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(policy.version) || !policy.allowedPaths.length || policy.allowedPaths.length > 256 ||
        new Set(policy.allowedPaths.map(p => engineeringPath(p).toLowerCase())).size !== policy.allowedPaths.length ||
        !policy.allowedOperations.length || policy.allowedOperations.some(op => !["create", "replace", "delete"].includes(op))) throw new Error("Invalid host patch policy");
    this.policy = structuredClone(policy);
    this.policyDigest = engineeringHash(JSON.stringify(this.policy));
  }
  async propose(input: unknown, signal?: AbortSignal): Promise<StructuredPatch> {
    if (this.proposals.size >= 32) throw new Error("Proposal budget exhausted");
    exact(input, ["baseRevision", "changes"]);
    const current = await this.view.inspect(signal);
    if (input.baseRevision !== current.digest || !Array.isArray(input.changes) || !input.changes.length || input.changes.length > this.policy.maxFiles) throw new Error("Patch base or count conflict");
    const changes: FileChange[] = []; const seen = new Set<string>(); let bytes = 0;
    for (const item of input.changes) {
      exact(item, ["path", "operation", "baseHash", "content", "resultHash"]);
      const relative = engineeringPath(item.path);
      if (seen.has(relative.toLowerCase()) || [...seen].some(p => p.startsWith(relative.toLowerCase() + "/") || relative.toLowerCase().startsWith(p + "/")) || !this.policy.allowedPaths.includes(relative) || !this.policy.allowedOperations.includes(item.operation as FileChange["operation"])) throw new Error("Patch outside host scope");
      seen.add(relative.toLowerCase());
      if (item.operation === "create") await this.view.checkCreate?.(relative, signal);
      const existing = current.files.find(f => f.path === relative);
      if (item.operation === "create" ? existing || item.baseHash !== null : !existing || item.baseHash !== existing.hash) throw new Error("Patch file base conflict");
      if (item.operation === "delete") {
        if (item.content !== null || item.resultHash !== null) throw new Error("Invalid deletion");
      } else {
        if (typeof item.content !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.content) || !hashValue(item.resultHash) || engineeringHash(item.content) !== item.resultHash ||
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(item.content)) !== item.content) throw new Error("Invalid patch result");
        bytes += Buffer.byteLength(item.content);
      }
      bytes += existing?.bytes ?? 0;
      if (bytes > this.policy.maxBytes) throw new Error("Patch byte budget exceeded");
      changes.push({ path: relative, operation: item.operation as FileChange["operation"], baseHash: item.baseHash as string | null, content: item.content as string | null, resultHash: item.resultHash as string | null });
    }
    const data = { executionId: this.view.receipt.executionId, workspaceId: this.view.receipt.workspaceId, baseRevision: current.digest, policyDigest: this.policyDigest, changes, status: "Proposed" as const };
    const patch = { ...data, digest: engineeringHash(JSON.stringify(data)) };
    if (Buffer.byteLength(JSON.stringify(patch)) > 12_000) throw new Error("Serialized patch budget exceeded");
    this.proposals.set(patch.digest, structuredClone(patch));
    return structuredClone(patch);
  }
  get(digest: string): StructuredPatch {
    const proposal = this.proposals.get(digest);
    if (!proposal) throw new Error("Unknown host proposal; resumption is disabled");
    return structuredClone(proposal);
  }
  async validate(digest: string, signal?: AbortSignal): Promise<StructuredPatch> {
    const patch = this.get(digest);
    const current = await this.view.inspect(signal);
    if (current.digest !== patch.baseRevision) throw new Error("Workspace revision changed");
    return patch;
  }
  async diff(digest: string, signal?: AbortSignal): Promise<string> {
    const patch = await this.validate(digest, signal);
    const parts: string[] = [];
    for (const change of patch.changes) {
      const before = change.operation === "create" ? "" : await this.view.read(change.path, signal);
      const after = change.content ?? "";
      // Full replacement unified hunks retain exact no-newline semantics.
      const lines = (text: string, prefix: string) => text ? text.replace(/\n$/, "").split("\n").map(line => prefix + line + "\n").join("") + (text.endsWith("\n") ? "" : "\\ No newline at end of file\n") : "";
      const count = (text: string) => text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
      const a = count(before), b = count(after);
      const header = `diff --git a/${change.path} b/${change.path}\n${change.operation === "create" ? "new file mode 100644\n" : change.operation === "delete" ? "deleted file mode 100644\n" : ""}`;
      if (!a && !b && change.operation !== "replace") {
        parts.push(header + (change.operation === "create" ? "index 0000000..e69de29\n" : "index e69de29..0000000\n")); continue;
      }
      parts.push(header + `--- ${change.operation === "create" ? "/dev/null" : "a/" + change.path}\n+++ ${change.operation === "delete" ? "/dev/null" : "b/" + change.path}\n@@ -${a ? 1 : 0},${a} +${b ? 1 : 0},${b} @@\n${lines(before, "-")}${lines(after, "+")}`);
    }
    const diff = parts.join("");
    if (Buffer.byteLength(JSON.stringify({ diff })) > 16_000) throw new Error("Diff output limit");
    return diff;
  }
  /** Trusted host dispatcher handler only; never expose directly to a provider. */
  async apply(digest: string, signal?: AbortSignal): Promise<{ snapshotDigest: string; patchDigest: string }> {
    if (!(this.view instanceof EngineeringWorkspace)) throw new Error("L1 cannot modify source");
    const workspace = this.view;
    const patch = await this.validate(digest, signal);
    return workspace.mutate(async () => {
      await this.validate(digest, signal);
      const before = await workspace.inspect(signal);
      if (before.digest !== patch.baseRevision) throw new Error("Workspace revision changed");
      const expected = new Map(before.files.map(f => [f.path, { ...f }]));
      for (const change of patch.changes) {
        if (change.operation === "delete") expected.delete(change.path);
        else expected.set(change.path, { path: change.path, hash: change.resultHash!, bytes: Buffer.byteLength(change.content!) });
      }
      const expectedDigest = engineeringHash(JSON.stringify([...expected.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
      for (const change of patch.changes) {
        signal?.throwIfAborted();
        const segments = change.path.split("/"); let directory = workspace.receipt.root;
        for (const segment of segments.slice(0, -1)) {
          directory = path.join(directory, segment);
          try { await mkdir(directory, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
          const st = await lstat(directory);
          if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== workspace.receipt.ownerUid) throw new Error("Unsafe patch parent");
        }
        await workspace.assertOwned(signal);
        const target = path.join(workspace.receipt.root, change.path);
        if (change.operation !== "create" && engineeringHash(await engineeringFile(workspace.receipt.root, change.path, signal)) !== change.baseHash) throw new Error("Patch target changed");
        if (change.operation === "delete") await unlink(target);
        else {
          const temporary = path.join(directory, ".patch-" + randomUUID());
          await writeEngineeringFile(temporary, change.content!);
          signal?.throwIfAborted();
          await workspace.assertOwned(signal);
          if (change.operation === "create") { await link(temporary, target); await unlink(temporary); }
          else {
            if (engineeringHash(await engineeringFile(workspace.receipt.root, change.path, signal)) !== change.baseHash) throw new Error("Patch target changed");
            await rename(temporary, target);
          }
          if (engineeringHash(await engineeringFile(workspace.receipt.root, change.path, signal)) !== change.resultHash) throw new Error("Patch verification failed");
        }
      }
      const current = await workspace.inspect(signal);
      if (current.digest !== expectedDigest) throw new Error("Unexpected workspace mutation");
      return { snapshotDigest: current.digest, patchDigest: patch.digest };
    }, signal);
  }
}

/** Fixed host binding. Patch content never contains permissions or approver data. */
export function createEngineeringTools(engine: EngineeringPatchEngine, binding: NonNullable<ToolDispatchContext["durableOperations"]>) {
  const registry = new ToolRegistry();
  const definitions = ["workspace.inspect", "workspace.list", "workspace.read", "patch.propose", "patch.validate", "patch.apply", "diff.inspect"] as const;
  for (const id of definitions) {
    const properties: Record<string, ToolParameterSchema> = id === "workspace.read" ? { path: { type: "string" as const, minLength: 1, maxLength: 240 } } :
      id === "patch.propose" ? { proposal: { type: "string" as const, minLength: 1, maxLength: 12_000 } } :
      id.startsWith("patch.") || id === "diff.inspect" ? { digest: { type: "string" as const, minLength: 64, maxLength: 64 }, workspace_id: { type: "string" as const, maxLength: 80 }, base_revision: { type: "string" as const, minLength: 64, maxLength: 64 }, policy_digest: { type: "string" as const, minLength: 64, maxLength: 64 } } : {};
    registry.register({ id, description: "Host-scoped engineering operation", permission: id === "patch.apply" ? "files:write" : "files:read", risk: id === "patch.apply" ? "medium" : "low", inputSchema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } });
  }
  const dispatcher = new ToolDispatcher(registry, undefined, { ...binding, safetyByTool: Object.fromEntries(definitions.map(id => [id, id === "patch.apply" ? "side_effecting" : "read_only"])) });
  for (const id of definitions) dispatcher.registerHandler(id, async (args, context) => {
    if (context.requireAtomicFilesystem) throw new Error("Atomic rooted filesystem unavailable");
    if (context.executionId !== engine.view.receipt.executionId || context.projectRoot !== engine.view.receipt.root) throw new Error("Engineering scope mismatch");
    const signal = context.signal;
    if (id === "workspace.inspect" || id === "workspace.list") {
      const snapshot = await engine.view.inspect(signal);
      return id === "workspace.inspect" ? { digest: snapshot.digest, fileCount: snapshot.files.length, bytes: snapshot.files.reduce((n, f) => n + f.bytes, 0) } :
        { digest: snapshot.digest, files: snapshot.files.slice(0, 16), truncated: snapshot.files.length > 16 };
    }
    if (id === "workspace.read") {
      const text = await engine.view.read(args.path as string, signal);
      if (Buffer.byteLength(JSON.stringify({ text })) > 12_000) throw new Error("Read output limit");
      return { text };
    }
    if (id === "patch.propose") {
      if (Buffer.byteLength(args.proposal as string) > 12_000) throw new Error("Proposal input limit");
      return engine.propose(JSON.parse(args.proposal as string), signal);
    }
    const patch = await engine.validate(args.digest as string, signal);
    if (args.workspace_id !== patch.workspaceId || args.base_revision !== patch.baseRevision || args.policy_digest !== patch.policyDigest) throw new Error("Patch approval scope mismatch");
    if (id === "patch.apply") return engine.apply(patch.digest, signal);
    if (id === "diff.inspect") return { diff: await engine.diff(patch.digest, signal) };
    return { digest: patch.digest, valid: true };
  });
  return { registry, dispatcher,
    dispatch(invocation: ToolInvocation, identity: { taskId: string; requestId: string }, approvalId?: string, signal?: AbortSignal, telemetry?: import("@ai-harness/contracts").TelemetryBinding) {
      return dispatcher.dispatch(invocation, { executionId: engine.view.receipt.executionId, projectRoot: engine.view.receipt.root, defaultDeny: true,
        grantedPermissions: engine.view instanceof EngineeringWorkspace ? ["files:read", "files:write"] : ["files:read"], requireApprovalFor: ["files:write"], operation: identity, signal, telemetry }, approvalId);
    } };
}
export function patchInvocation(patch: StructuredPatch): ToolInvocation {
  return { toolId: "patch.apply", arguments: { digest: patch.digest, workspace_id: patch.workspaceId, base_revision: patch.baseRevision, policy_digest: patch.policyDigest } };
}
