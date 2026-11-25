import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, realpath, open, mkdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { ValidationEvidenceStore, ValidationRunEvidence } from "@ai-harness/contracts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const digest = /^[a-f0-9]{64}$/;
function assert(value: unknown): asserts value { if (!value) throw new Error("Validation evidence unavailable or invalid"); }
function id(value: string): string { assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)); return value; }
function evidence(value: ValidationRunEvidence): void {
  assert(value && Object.keys(value).sort().join() === ["schemaVersion", "validationId", "operationId", "executionId", "workspaceId", "snapshotId", "snapshotDigest", "transferDigest", "actionId", "runtimeProfile", "imageDigest", "startedAt", "completedAt", "durationMs", "exitCode", "classification", "timedOut", "cancelled", "cleanup", "outputDigest", "diagnostics"].sort().join());
  assert(value.schemaVersion === 1 && value.runtimeProfile === "node-isolated-v1");
  [value.validationId, value.operationId, value.snapshotDigest, value.transferDigest, value.outputDigest, value.imageDigest].forEach(v => assert(typeof v === "string" && digest.test(v)));
  [value.executionId, value.workspaceId, value.snapshotId, value.actionId].forEach(id);
  assert(["passed", "failed", "timeout", "cancelled", "blocked", "uncertain"].includes(value.classification));
  assert(["confirmed", "uncertain", "not_needed"].includes(value.cleanup) && (value.classification !== "passed" || value.cleanup === "confirmed" && value.exitCode === 0));
  assert(typeof value.timedOut === "boolean" && typeof value.cancelled === "boolean" && (value.exitCode === null || Number.isSafeInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255));
  assert(Number.isSafeInteger(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 120000);
  for (const t of [value.startedAt, value.completedAt]) assert(typeof t === "string" && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t);
  assert(Date.parse(value.completedAt) >= Date.parse(value.startedAt));
  assert(Array.isArray(value.diagnostics) && value.diagnostics.length <= 8 && value.diagnostics.every(x => typeof x === "string" && /^[a-z][a-z._]{0,79}$/.test(x)));
}

/** Private create-only evidence. The authoritative lifecycle/replay gate remains SQLite journal v2. */
export class FileValidationEvidenceStore implements ValidationEvidenceStore {
  private identity?: { dev: bigint; ino: bigint };
  constructor(private readonly directory: string) {}
  private async assertRoot(): Promise<void> {
    const st = await lstat(this.directory, { bigint: true });
    assert(path.isAbsolute(this.directory) && await realpath(this.directory) === this.directory && st.isDirectory() && st.uid === BigInt(process.getuid!()) && (st.mode & 0o777n) === 0o700n);
    if (this.identity) assert(st.dev === this.identity.dev && st.ino === this.identity.ino);
    else this.identity = { dev: st.dev, ino: st.ino };
  }
  private async syncDirectory(directory: string): Promise<void> {
    const h = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await h.sync(); } finally { await h.close(); }
  }
  private async put(filename: string, value: string): Promise<void> {
    assert(Buffer.byteLength(value) <= 16384);
    const h = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await h.writeFile(value); await h.sync(); } finally { await h.close(); }
    await this.syncDirectory(path.dirname(filename));
  }
  private async read(filename: string): Promise<string> {
    const h = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await h.stat({ bigint: true });
      assert(before.isFile() && before.nlink === 1n && before.uid === BigInt(process.getuid!()) && (before.mode & 0o777n) === 0o600n && before.size <= 16384n);
      const buffer = Buffer.alloc(16385); const { bytesRead } = await h.read(buffer, 0, buffer.length, 0);
      const after = await h.stat({ bigint: true });
      assert(bytesRead <= 16384 && BigInt(bytesRead) === before.size && before.size === after.size && before.ctimeNs === after.ctimeNs && before.mtimeNs === after.mtimeNs && after.nlink === 1n);
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally { await h.close(); }
  }
  async claim(workspaceId: string, validationId: string): Promise<void> {
    await this.assertRoot(); assert(digest.test(validationId));
    const lock = path.join(this.directory, id(workspaceId) + ".lock");
    await mkdir(lock, { mode: 0o700 }); await this.put(path.join(lock, "owner"), validationId); await this.syncDirectory(this.directory);
  }
  async release(workspaceId: string, validationId: string): Promise<void> {
    await this.assertRoot(); assert(digest.test(validationId));
    const lock = path.join(this.directory, id(workspaceId) + ".lock"), st = await lstat(lock);
    assert(st.isDirectory() && st.uid === process.getuid!() && (st.mode & 0o777) === 0o700 && await realpath(lock) === lock);
    assert(await this.read(path.join(lock, "owner")) === validationId);
    await unlink(path.join(lock, "owner")); await rmdir(lock); await this.syncDirectory(this.directory);
  }
  async save(value: ValidationRunEvidence, rawOutput: string): Promise<void> {
    await this.assertRoot(); evidence(value);
    assert(typeof rawOutput === "string" && Buffer.byteLength(rawOutput) <= 4096 && hash(rawOutput) === value.outputDigest);
    const text = JSON.stringify({ evidence: value, output: rawOutput });
    await this.put(path.join(this.directory, value.validationId + ".json"), JSON.stringify({ payload: text, digest: hash(text) }));
  }
  async get(validationId: string): Promise<ValidationRunEvidence | null> {
    await this.assertRoot(); assert(digest.test(validationId));
    let text: string; try { text = await this.read(path.join(this.directory, validationId + ".json")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
    const envelope = JSON.parse(text) as { payload: string; digest: string };
    assert(typeof envelope.payload === "string" && hash(envelope.payload) === envelope.digest);
    const data = JSON.parse(envelope.payload) as { evidence: ValidationRunEvidence; output: string };
    evidence(data.evidence); assert(data.evidence.validationId === validationId && typeof data.output === "string" && Buffer.byteLength(data.output) <= 4096 && hash(data.output) === data.evidence.outputDigest);
    return structuredClone(data.evidence);
  }
}
