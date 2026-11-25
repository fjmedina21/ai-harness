import type { ValidationSnapshot, ValidationSnapshotManifest, WorkspaceSnapshot } from "@ai-harness/contracts";
import { EngineeringWorkspace, engineeringHash, engineeringPath } from "./engineering-workspace.js";

const hex = /^[a-f0-9]{64}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const VALIDATION_TRANSFER_LIMIT = 6 * 1024 * 1024;
function invalid(): never { throw new Error("Invalid validation snapshot"); }
function exact(value: object, keys: string[]): void {
  if (Object.keys(value).sort().join() !== keys.sort().join()) invalid();
}
export function validationTransferDigest(manifest: Omit<ValidationSnapshotManifest, "transferDigest">): string {
  return engineeringHash(JSON.stringify({ manifestVersion: manifest.manifestVersion, snapshotId: manifest.snapshotId,
    executionId: manifest.executionId, workspaceId: manifest.workspaceId, sourceRevision: manifest.sourceRevision,
    policyVersion: manifest.policyVersion, policyDigest: manifest.policyDigest, snapshotDigest: manifest.snapshotDigest,
    files: manifest.files.map(f => ({ path: f.path, hash: f.hash, bytes: f.bytes })), totalBytes: manifest.totalBytes }));
}
export function validateSnapshotManifest(raw: unknown): ValidationSnapshotManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
  const m = raw as ValidationSnapshotManifest;
  exact(m, ["manifestVersion", "snapshotId", "executionId", "workspaceId", "sourceRevision", "policyVersion", "policyDigest", "snapshotDigest", "files", "totalBytes", "transferDigest"]);
  if (m.manifestVersion !== 1 || ![m.snapshotId, m.executionId, m.workspaceId, m.policyVersion].every(x => typeof x === "string" && id.test(x)) ||
    ![m.sourceRevision, m.policyDigest, m.snapshotDigest, m.transferDigest].every(x => typeof x === "string" && hex.test(x)) ||
    !Array.isArray(m.files) || m.files.length < 1 || m.files.length > 256 || !Number.isSafeInteger(m.totalBytes) || m.totalBytes < 0 || m.totalBytes > 4 * 1024 * 1024) invalid();
  let size = 0, previous = "";
  const aliases = new Set<string>();
  for (const f of m.files) {
    if (!f || typeof f !== "object") invalid();
    exact(f, ["path", "hash", "bytes"]);
    engineeringPath(f.path);
    const alias = f.path.toLowerCase();
    if (f.path <= previous || aliases.has(alias) || [...aliases].some(p => p.startsWith(alias + "/") || alias.startsWith(p + "/")) ||
      typeof f.hash !== "string" || !hex.test(f.hash) || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > 1024 * 1024) invalid();
    size += f.bytes; previous = f.path; aliases.add(f.path.toLowerCase());
  }
  if (size !== m.totalBytes || engineeringHash(JSON.stringify(m.files)) !== m.snapshotDigest || validationTransferDigest(m) !== m.transferDigest) invalid();
  return structuredClone(m);
}
export interface ValidationTransferPayload { manifest: ValidationSnapshotManifest; contents: readonly string[] }
export function decodeValidationSnapshot(bytes: Uint8Array): ValidationTransferPayload {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > VALIDATION_TRANSFER_LIMIT) invalid();
  const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
  exact(raw, ["manifest", "contents"]);
  const payload = raw as ValidationTransferPayload, manifest = validateSnapshotManifest(payload.manifest);
  if (!Array.isArray(payload.contents) || payload.contents.length !== manifest.files.length) invalid();
  for (let i = 0; i < manifest.files.length; i++) {
    const text = payload.contents[i], f = manifest.files[i]!;
    if (typeof text !== "string" || text.length > 1_398_104) invalid();
    const data = Buffer.from(text, "base64");
    if (data.toString("base64") !== text || data.length !== f.bytes || engineeringHash(data) !== f.hash) invalid();
  }
  return { manifest, contents: [...payload.contents] };
}
/** Captures only a reopened, host-authorized workspace; no repository path or archive input. */
export async function captureValidationSnapshot(workspace: EngineeringWorkspace, expected: WorkspaceSnapshot,
  binding: { sourceRevision: string; policyVersion: string; policyDigest: string; allowedPaths: readonly string[] }, signal?: AbortSignal): Promise<ValidationSnapshot> {
  const selected = [...binding.allowedPaths].map(engineeringPath).sort();
  if (selected.length < 1 || selected.length > 256 || new Set(selected.map(x => x.toLowerCase())).size !== selected.length) invalid();
  const before = await workspace.inspect(signal);
  if (before.digest !== expected.digest || JSON.stringify(before.files) !== JSON.stringify(expected.files) || before.files.some(f => !selected.includes(f.path))) invalid();
  const contents: string[] = [];
  for (const f of before.files) {
    signal?.throwIfAborted();
    const data = Buffer.from(await workspace.read(f.path, signal));
    if (data.length !== f.bytes || engineeringHash(data) !== f.hash) invalid();
    contents.push(data.toString("base64"));
  }
  if ((await workspace.inspect(signal)).digest !== before.digest) invalid();
  const snapshotId = engineeringHash(JSON.stringify([workspace.receipt.executionId, workspace.receipt.workspaceId, before.digest,
    binding.sourceRevision, binding.policyVersion, binding.policyDigest]));
  const unsigned = { manifestVersion: 1 as const, snapshotId, executionId: workspace.receipt.executionId,
    workspaceId: workspace.receipt.workspaceId, sourceRevision: binding.sourceRevision, policyVersion: binding.policyVersion,
    policyDigest: binding.policyDigest, snapshotDigest: before.digest, files: before.files, totalBytes: before.files.reduce((n, f) => n + f.bytes, 0) };
  const manifest = validateSnapshotManifest({ ...unsigned, transferDigest: validationTransferDigest(unsigned) });
  const data = Buffer.from(JSON.stringify({ manifest, contents }));
  decodeValidationSnapshot(data);
  const result: ValidationSnapshot = { manifest: structuredClone(manifest), payload: () => Uint8Array.from(data) };
  result.manifest.files.forEach(Object.freeze); Object.freeze(result.manifest.files); Object.freeze(result.manifest); return Object.freeze(result);
}
