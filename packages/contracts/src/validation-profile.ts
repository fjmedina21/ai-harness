import type { ValidationRunEvidence } from "./phase9-validation.js";

/** Language-independent host descriptions. Repository manifests never grant execution authority. */
export const VALIDATION_ACTIONS = ["syntax-check", "lint", "type-check", "build", "test", "integration-test", "static-analysis"] as const;
export type ValidationAction = typeof VALIDATION_ACTIONS[number];
export type NormalizedValidationStatus = "unsupported" | "blocked" | "passed" | "failed" | "timeout" | "cancelled" | "uncertain";
export type ValidationFailureKind = "none" | "code" | "infrastructure" | "authorization" | "uncertain";
export type DependencyState = "available" | "prepared" | "missing" | "incompatible" | "untrusted" | "requires_network" | "requires_approval";
export interface DependencyRequirement { id: string; version: string; source: "image" | "preprovisioned" }
export interface DependencyAssessment { state: DependencyState; missing: readonly string[]; reason: string }
export interface ValidationProfile {
  apiVersion: "harness.dev/v1";
  kind: "ValidationProfile";
  metadata: { id: string; version: string };
  detectionSignals: readonly string[];
  toolchains: readonly { id: string; version: string }[];
  runtime: { type: "podman"; image: string; network: "none"; rootless: true };
  actions: readonly {
    id: string; action: ValidationAction; executable: string; args: readonly string[];
    workingDirectory: string; environment: Readonly<Record<string, string>>;
  }[];
  limits: { cpu: number; memoryBytes: number; pids: number; timeoutMs: number; maxInputBytes: number; maxOutputBytes: number; maxDiagnostics: number };
  dependencies: readonly DependencyRequirement[];
  resultParser: string;
}
export interface ValidationProfileBinding {
  profileId: string; profileVersion: string; profileDigest: string; actionId: string;
}
export interface NormalizedDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
}
export interface NormalizedValidationResult {
  schemaVersion: 1;
  validationId: string;
  executionId: string;
  workspaceId: string;
  profileId: string;
  profileDigest: string;
  actionId: string;
  action: ValidationAction;
  status: NormalizedValidationStatus;
  failureKind: ValidationFailureKind;
  snapshotDigest: string;
  exitCode: number | null;
  diagnostics: readonly NormalizedDiagnostic[];
  diagnosticDigest: string;
  evidenceDigest: string;
  outputTruncated: boolean;
  durationMs: number;
}
export interface DiscoverySignal {
  id: string; path: string; language?: string; toolchain?: string; framework?: string; version?: string;
}
export interface ValidationUnit {
  id: string; root: string; signals: readonly DiscoverySignal[]; ambiguous: boolean;
}
export interface ProjectDiscoveryResult {
  schemaVersion: 1;
  units: readonly ValidationUnit[];
  inspectedFiles: number;
  inspectedBytes: number;
  truncated: boolean;
  limitsReached: readonly ("depth" | "files" | "bytes")[];
}

/** Generic durable result consumed by repair. Existing fixed-runtime evidence is a subtype. */
export interface RepairValidationEvidence extends Omit<ValidationRunEvidence, "runtimeProfile" | "classification"> {
  runtimeProfile: string;
  classification: NormalizedValidationStatus;
}
