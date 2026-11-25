import type { CleanupStatus, WorkspaceSnapshot } from "./index.js";

/** Initial source identity. This is not an execution authorization. */
export interface ValidationSnapshotManifest {
  manifestVersion: 1;
  snapshotId: string;
  executionId: string;
  workspaceId: string;
  sourceRevision: string;
  policyVersion: string;
  policyDigest: string;
  snapshotDigest: string;
  files: WorkspaceSnapshot["files"];
  totalBytes: number;
  transferDigest: string;
}
export interface ValidationSnapshot {
  manifest: ValidationSnapshotManifest;
  /** Copy-on-read encoded transport. Source bytes must never enter telemetry. */
  payload(): Uint8Array;
}
export interface ValidationActionProfile {
  id: string;
  runtimeProfile: "node-isolated-v1";
  image: string;
  executable: "node";
  args: readonly string[];
  /** Empty means the snapshot root; all other paths must be canonical relative directories. */
  workingDirectory: string;
  timeoutMs: number;
  maxOutputBytes: number;
  network: "none";
  resources: { cpu: 0.5; memoryBytes: 268435456; pids: 64 };
}
export type ValidationClassification = "passed" | "failed" | "timeout" | "cancelled" | "blocked" | "uncertain";
export interface ValidationRunEvidence {
  schemaVersion: 1;
  validationId: string;
  operationId: string;
  executionId: string;
  workspaceId: string;
  snapshotId: string;
  snapshotDigest: string;
  transferDigest: string;
  actionId: string;
  runtimeProfile: "node-isolated-v1";
  imageDigest: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number | null;
  classification: ValidationClassification;
  timedOut: boolean;
  cancelled: boolean;
  cleanup: CleanupStatus;
  outputDigest: string;
  /** Fixed host-generated diagnostic IDs only. Raw bounded output is private separate evidence. */
  diagnostics: readonly string[];
}
export interface ValidationEvidenceStore {
  /** Exclusive durable claim; collision or interrupted claim must block, never replay. */
  claim(workspaceId: string, validationId: string): Promise<void>;
  save(evidence: ValidationRunEvidence, rawOutput: string): Promise<void>;
  get(validationId: string): Promise<ValidationRunEvidence | null>;
  release(workspaceId: string, validationId: string): Promise<void>;
}
