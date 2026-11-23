import { lstat, mkdir, readdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { DurableDispatchBinding, WorkspaceReceipt } from "@ai-harness/contracts";
import { inspectEngineeringRecovery } from "./engineering-recovery.js";
import { engineeringFile, engineeringHash, engineeringPath, EngineeringWorkspaceUncertain } from "./engineering-workspace.js";
/** Explicit host lifecycle API; never registered as a model tool. No recursive rm.
 * Uncertain/pending executions are always retained. Authorization is exact-snapshot.
 */
export async function cleanupEngineeringWorkspace(receipt: WorkspaceReceipt, expectedDigest: string, binding: DurableDispatchBinding,
  authorized: true, signal?: AbortSignal): Promise<{ workspaceId: string; cleanup: "confirmed" }> {
  if (authorized !== true) throw new Error("Explicit host cleanup authorization required");
  signal?.throwIfAborted();
  const recovery = await inspectEngineeringRecovery(receipt, expectedDigest, binding.store);
  if (recovery.action !== "host_review") throw new Error("Cleanup blocked; retain workspace evidence");
  const control = path.dirname(receipt.root), rootIdentity = await lstat(receipt.root, { bigint: true });
  let op = binding.store.register({ executionId: receipt.executionId, taskId: "workspace", requestId: "cleanup", projectRoot: control,
    toolId: "workspace.cleanup", argumentDigest: engineeringHash(JSON.stringify([receipt, expectedDigest])), permission: "files:write", risk: "medium",
    safety: "side_effecting", requester: binding.requester, requiresApproval: false }).operation;
  const prepared = binding.store.prepare(op.operationId, op.version, op.scopeDigest);
  if (!prepared) throw new Error("Cleanup blocked"); op = binding.store.start(prepared.operationId, prepared.version);
  try {
    await mkdir(path.join(control, "mutation.lock"), { mode: 0o700 });
    const current = await lstat(receipt.root, { bigint: true });
    if (current.dev !== rootIdentity.dev || current.ino !== rootIdentity.ino) throw new Error("Root changed");
    const entries = await readdir(control);
    if (entries.length !== 3 || entries.some(p => !["files", "receipt.json", "mutation.lock"].includes(p))) throw new Error("Unexpected workspace evidence");
    const files: { path: string; hash: string; bytes: number }[] = [], directories: string[] = []; let count = 0, bytes = 0;
    const walk = async (prefix: string): Promise<void> => {
      for (const name of await readdir(path.join(receipt.root, prefix))) {
        signal?.throwIfAborted(); if (++count > 4096) throw new Error("Cleanup limit");
        const relative = engineeringPath(prefix ? prefix + "/" + name : name), stat = await lstat(path.join(receipt.root, relative));
        if (stat.isDirectory() && !stat.isSymbolicLink()) { if (stat.uid !== receipt.ownerUid || (stat.mode & 0o777) !== 0o700) throw new Error("Unsafe directory"); directories.push(relative); await walk(relative); }
        else { const data = await engineeringFile(receipt.root, relative, signal); bytes += data.length;
          files.push({ path: relative, hash: engineeringHash(data), bytes: data.length }); if (files.length > 256 || bytes > 4 * 1024 * 1024) throw new Error("Cleanup limit"); }
      }
    };
    await walk(""); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (engineeringHash(JSON.stringify(files)) !== expectedDigest) throw new Error("Cleanup snapshot changed");
    for (const file of files) {
      signal?.throwIfAborted();
      if (engineeringHash(await engineeringFile(receipt.root, file.path, signal)) !== file.hash) throw new Error("Cleanup file changed");
      await unlink(path.join(receipt.root, file.path));
    }
    for (const relative of directories.sort((a, b) => b.length - a.length)) { signal?.throwIfAborted(); await rmdir(path.join(receipt.root, relative)); }
    signal?.throwIfAborted(); await rmdir(receipt.root);
    await unlink(path.join(control, "receipt.json")); await rmdir(path.join(control, "mutation.lock")); await rmdir(control);
    binding.store.finish(op.operationId, op.version, "Completed", expectedDigest);
    return { workspaceId: receipt.workspaceId, cleanup: "confirmed" };
  } catch {
    try { binding.store.finish(op.operationId, op.version, "Uncertain"); } catch { binding.store.retireSession(); }
    throw new EngineeringWorkspaceUncertain();
  }
}
