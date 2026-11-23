import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { DurableOperationStore, WorkspaceReceipt } from "@ai-harness/contracts";
import { engineeringFile, engineeringHash, engineeringPath } from "./engineering-workspace.js";
import { readVerifiedFile } from "./bounded-file.js";
/** Inspection only. A matching snapshot never grants permission to resume. */
export async function inspectEngineeringRecovery(receipt: WorkspaceReceipt, expectedDigest: string, store: DurableOperationStore): Promise<{
  action: "blocked" | "host_review"; retryAllowed: false; snapshotDigest?: string; reason: "uncertain" | "snapshot_changed" | "inspection_only";
}> {
  try {
    if (!/^[a-f0-9]{64}$/.test(expectedDigest) || await realpath(receipt.root) !== receipt.root) throw new Error();
    const control = path.dirname(receipt.root), st = await lstat(control), root = await lstat(receipt.root);
    if (path.basename(receipt.root) !== "files" || path.basename(control) !== receipt.workspaceId || !st.isDirectory() || st.uid !== receipt.ownerUid ||
        (st.mode & 0o777) !== 0o700 || !root.isDirectory() || root.uid !== receipt.ownerUid || (root.mode & 0o777) !== 0o700) throw new Error();
    const metadata = path.join(control, "receipt.json");
    const stored = await readVerifiedFile(metadata, await lstat(metadata, { bigint: true }));
    if (stored.length > 4096 || JSON.stringify(JSON.parse(stored.toString("utf8"))) !== JSON.stringify(receipt)) throw new Error();
    const markers = await readdir(control);
    if (markers.includes("mutation.lock") || markers.includes("uncertain")) throw new Error();
    const operations = store.list(receipt.executionId, undefined, 200);
    if (!operations.some(op => op.toolId === "workspace.create" && op.argumentDigest === engineeringHash(JSON.stringify(receipt)) && op.projectRoot === path.dirname(control)) || operations.length === 200 || operations.some(op => op.state !== "Completed")) throw new Error();
    const files: { path: string; bytes: number; hash: string }[] = []; let bytes = 0, entries = 0;
    const walk = async (prefix: string): Promise<void> => {
      for (const name of await readdir(path.join(receipt.root, prefix))) {
        if (++entries > 4096) throw new Error();
        const relative = engineeringPath(prefix ? prefix + "/" + name : name), stat = await lstat(path.join(receipt.root, relative));
        if (stat.isDirectory() && !stat.isSymbolicLink()) await walk(relative);
        else { const data = await engineeringFile(receipt.root, relative); bytes += data.length; files.push({ path: relative, bytes: data.length, hash: engineeringHash(data) });
          if (files.length > 256 || bytes > 4 * 1024 * 1024) throw new Error(); }
      }
    };
    await walk("");
    const inventory = files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(f => ({ path: f.path, hash: f.hash, bytes: f.bytes }));
    const snapshotDigest = engineeringHash(JSON.stringify(inventory));
    return { action: snapshotDigest === expectedDigest ? "host_review" : "blocked", retryAllowed: false, snapshotDigest,
      reason: snapshotDigest === expectedDigest ? "inspection_only" : "snapshot_changed" };
  } catch { return { action: "blocked", retryAllowed: false, reason: "uncertain" }; }
}
