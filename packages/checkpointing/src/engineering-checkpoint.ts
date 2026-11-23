import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { ENGINEERING_STATES, type EngineeringCheckpoint } from "@ai-harness/contracts";
/** Append-only snapshots. Partial files are evidence; no overwrite or automatic resume. */
export class EngineeringCheckpointStore {
  private sequence = 0;
  constructor(private readonly directory: string) {}
  async save(checkpoint: EngineeringCheckpoint): Promise<void> {
    const copy = structuredClone(checkpoint);
    if (++this.sequence > 256 || Object.keys(copy).length !== 8 || !Object.keys(copy).every(k => ["executionId", "workspaceId", "state", "snapshotDigest", "iteration", "requests", "tokens", "estimatedCostUsd"].includes(k))) throw new Error("Invalid engineering checkpoint");
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(copy.executionId) || !/^[a-zA-Z0-9-]{1,80}$/.test(copy.workspaceId) ||
        !ENGINEERING_STATES.includes(copy.state) || !/^[a-f0-9]{64}$/.test(copy.snapshotDigest) ||
        [copy.iteration, copy.requests, copy.tokens].some(n => !Number.isSafeInteger(n) || n < 0) ||
        !Number.isFinite(copy.estimatedCostUsd) || copy.estimatedCostUsd < 0) throw new Error("Invalid engineering checkpoint");
    const st = await lstat(this.directory);
    if (await realpath(this.directory) !== this.directory || !st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) throw new Error("Private canonical checkpoint directory required");
    const filename = path.join(this.directory, copy.executionId + "-" + String(this.sequence).padStart(6, "0") + ".json");
    const file = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(JSON.stringify(copy)); await file.sync(); } finally { await file.close(); }
  }
}
