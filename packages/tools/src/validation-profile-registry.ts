import { canonicalProposalJson, VALIDATION_ACTIONS, type DependencyAssessment, type DependencyRequirement, type DependencyState, type NormalizedDiagnostic, type NormalizedValidationResult, type ValidationActionProfile, type ValidationProfile, type ValidationProfileBinding, type ValidationUnit, type RepairValidationEvidence, type ValidationAction } from "@ai-harness/contracts";
import { engineeringHash, engineeringPath } from "./engineering-workspace.js";

export class ValidationProfileError extends Error {
  constructor(readonly code: "invalid_profile" | "unsupported_version" | "unauthorized_profile" | "unknown_profile" | "ambiguous_profile" | "unsupported_action" | "profile_changed" | "dependencies_blocked" | "invalid_result") { super("Validation profile rejected: " + code); }
}
function fail(code: ValidationProfileError["code"] = "invalid_profile"): never { throw new ValidationProfileError(code); }
const id = (s: unknown): s is string => typeof s === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(s);
const digest = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
function exact(o: unknown, keys: readonly string[]): void {
  if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).sort().join() !== [...keys].sort().join()) fail();
}
function int(n: unknown, max: number): void { if (!Number.isSafeInteger(n) || (n as number) < 1 || (n as number) > max) fail(); }
export interface TrustedProfileRegistryOptions {
  /** Supplied only by trusted host composition, never project/model content. */
  authorizedProfileIds: readonly string[];
  executableAllowlist: readonly string[];
  parserIds: readonly string[];
  environmentAllowlist?: readonly string[];
}
/** Registers immutable declarative descriptions; registration does not accept a live runtime. */
export class TrustedValidationProfileRegistry {
  private readonly profiles = new Map<string, { value: ValidationProfile; digest: string }>();
  private readonly host: TrustedProfileRegistryOptions;
  constructor(options: TrustedProfileRegistryOptions) {
    if (!options || !Array.isArray(options.authorizedProfileIds) || !Array.isArray(options.executableAllowlist) || !Array.isArray(options.parserIds) ||
      options.authorizedProfileIds.some(v => !id(v)) || options.parserIds.some(v => !id(v)) || options.executableAllowlist.some(v => typeof v !== "string" || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(v) || /(?:^|\/)(?:sh|bash|zsh|fish|dash|env|sudo|podman|docker)$/.test(v))) fail();
    this.host = structuredClone(options);
  }
  register(input: ValidationProfile): void {
    exact(input, ["apiVersion", "kind", "metadata", "detectionSignals", "toolchains", "runtime", "actions", "limits", "dependencies", "resultParser"]);
    if (input.apiVersion !== "harness.dev/v1") fail("unsupported_version");
    if (input.kind !== "ValidationProfile") fail();
    exact(input.metadata, ["id", "version"]);
    if (!id(input.metadata.id) || typeof input.metadata.version !== "string" || !/^[1-9][0-9]{0,5}$/.test(input.metadata.version) || this.profiles.has(input.metadata.id)) fail();
    if (!this.host.authorizedProfileIds.includes(input.metadata.id)) fail("unauthorized_profile");
    if (!Array.isArray(input.detectionSignals) || input.detectionSignals.length < 1 || input.detectionSignals.length > 32 || input.detectionSignals.some(v => !id(v)) || new Set(input.detectionSignals).size !== input.detectionSignals.length) fail();
    if (!Array.isArray(input.toolchains) || input.toolchains.length < 1 || input.toolchains.length > 16) fail();
    for (const tool of input.toolchains) { exact(tool, ["id", "version"]); if (!id(tool.id) || typeof tool.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,47}$/.test(tool.version)) fail(); }
    exact(input.runtime, ["type", "image", "network", "rootless"]);
    if (input.runtime.type !== "podman" || input.runtime.rootless !== true || input.runtime.network !== "none" || typeof input.runtime.image !== "string" || !/^[a-z0-9][a-z0-9.:-]*\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(input.runtime.image)) fail();
    exact(input.limits, ["cpu", "memoryBytes", "pids", "timeoutMs", "maxInputBytes", "maxOutputBytes", "maxDiagnostics"]);
    if (!Number.isFinite(input.limits.cpu) || input.limits.cpu <= 0 || input.limits.cpu > 0.5) fail();
    int(input.limits.memoryBytes, 268435456); int(input.limits.pids, 64); int(input.limits.timeoutMs, 10000); int(input.limits.maxInputBytes, 4 * 1024 * 1024); int(input.limits.maxOutputBytes, 1024); int(input.limits.maxDiagnostics, 32);
    if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 16) fail();
    const actionIds = new Set<string>();
    for (const action of input.actions) {
      exact(action, ["id", "action", "executable", "args", "workingDirectory", "environment"]);
      if (!id(action.id) || actionIds.has(action.id) || !VALIDATION_ACTIONS.includes(action.action) || !this.host.executableAllowlist.includes(action.executable)) fail();
      actionIds.add(action.id);
      if (!Array.isArray(action.args) || action.args.length > 32 || action.args.some((a: unknown) => typeof a !== "string" || a.length > 256 || /[\0\r\n]/.test(a))) fail();
      if (typeof action.workingDirectory !== "string") fail();
      if (action.workingDirectory !== "") try { engineeringPath(action.workingDirectory); } catch { fail(); }
      if (!action.environment || typeof action.environment !== "object" || Array.isArray(action.environment) || Object.keys(action.environment).length > 16) fail();
      for (const [key, value] of Object.entries(action.environment)) if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key) || !this.host.environmentAllowlist?.includes(key) || /(?:TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL|PROXY|PATH|HOME)/.test(key) || typeof value !== "string" || value.length > 256 || /[\0\r\n]/.test(value)) fail();
    }
    if (!Array.isArray(input.dependencies) || input.dependencies.length > 64) fail();
    const dependencies = new Set<string>();
    for (const dep of input.dependencies) { exact(dep, ["id", "version", "source"]); if (!id(dep.id) || dependencies.has(dep.id) || typeof dep.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,47}$/.test(dep.version) || !["image", "preprovisioned"].includes(dep.source)) fail(); dependencies.add(dep.id); }
    if (!id(input.resultParser) || !this.host.parserIds.includes(input.resultParser)) fail();
    let encoded: string; try { encoded = canonicalProposalJson(input); } catch { fail(); }
    this.profiles.set(input.metadata.id, { value: structuredClone(input), digest: engineeringHash(encoded) });
  }
  get(profileId: string): ValidationProfile { const p = this.profiles.get(profileId); if (!p) fail("unknown_profile"); return structuredClone(p.value); }
  digest(profileId: string): string { const p = this.profiles.get(profileId); if (!p) fail("unknown_profile"); return p.digest; }
  resolve(unit: ValidationUnit): ValidationProfile {
    if (unit.ambiguous) fail("ambiguous_profile");
    const signals = new Set(unit.signals.map(s => s.id));
    const matches = [...this.profiles.values()].filter(p => p.value.detectionSignals.every(s => signals.has(s)));
    if (!matches.length) fail("unknown_profile"); if (matches.length > 1) fail("ambiguous_profile");
    return structuredClone(matches[0]!.value);
  }
  bind(profileId: string, actionId: string): ValidationProfileBinding {
    const p = this.get(profileId); if (!p.actions.some(a => a.id === actionId)) fail("unsupported_action");
    return { profileId, profileVersion: p.metadata.version, profileDigest: this.digest(profileId), actionId };
  }
  verifyBinding(binding: ValidationProfileBinding): void {
    const actual = this.bind(binding.profileId, binding.actionId);
    if (canonicalProposalJson(actual) !== canonicalProposalJson(binding)) fail("profile_changed");
  }
  resolveAction(binding: ValidationProfileBinding, args?: readonly string[]) {
    this.verifyBinding(binding); const p = this.get(binding.profileId), action = p.actions.find(a => a.id === binding.actionId)!;
    if (args !== undefined && canonicalProposalJson(args) !== canonicalProposalJson(action.args)) fail("profile_changed");
    return structuredClone(action);
  }
  /** Explicit compatibility bridge; never widens the existing accepted Node runtime. */
  nodeAction(binding: ValidationProfileBinding, dependencyInventory: readonly ProvisionedDependency[] = []): ValidationActionProfile {
    const prepared = prepareValidationAction(this, binding, dependencyInventory);
    if (prepared.status === "blocked") fail("dependencies_blocked");
    const p = this.get(binding.profileId), a = prepared.action, l = p.limits;
    if (a.executable !== "/usr/local/bin/node" || Object.keys(a.environment).length || !a.args.length || l.cpu !== 0.5 || l.memoryBytes !== 268435456 || l.pids !== 64) fail("unsupported_action");
    return { id: a.id, runtimeProfile: "node-isolated-v1", image: p.runtime.image, executable: "node", args: a.args, workingDirectory: a.workingDirectory, timeoutMs: l.timeoutMs, maxOutputBytes: l.maxOutputBytes, network: "none", resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } };
  }
}
export interface ProvisionedDependency extends DependencyRequirement { state: DependencyState }
/** Pure inspection of trusted preprovisioned inventory; never installs or opens network. */
export function assessDependencies(requirements: readonly DependencyRequirement[], inventory: readonly ProvisionedDependency[]): DependencyAssessment {
  if (!Array.isArray(requirements) || !Array.isArray(inventory) || requirements.length > 64 || inventory.length > 256) fail();
  const states: DependencyState[] = [], missing: string[] = [];
  for (const required of requirements) {
    if (!id(required.id) || typeof required.version !== "string" || !["image", "preprovisioned"].includes(required.source)) fail();
    const matches = inventory.filter(i => i.id === required.id && i.source === required.source);
    const match = matches.find(i => i.version === required.version);
    if (matches.length > 1) { states.push("untrusted"); missing.push(required.id); }
    else if (!match) { states.push(matches.length ? "incompatible" : "missing"); missing.push(required.id); }
    else {
      if (!["available", "prepared", "missing", "incompatible", "untrusted", "requires_network", "requires_approval"].includes(match.state)) fail();
      states.push(match.state); if (!["available", "prepared"].includes(match.state)) missing.push(required.id);
    }
  }
  const priority: DependencyState[] = ["untrusted", "incompatible", "requires_approval", "requires_network", "missing", "prepared", "available"];
  const state = priority.find(s => states.includes(s)) ?? "available";
  return { state, missing, reason: "dependencies." + state };
}

/** Fixed action selection plus dependency readiness; no network or installation path exists. */
export function prepareValidationAction(registry: TrustedValidationProfileRegistry, binding: ValidationProfileBinding, dependencyInventory: readonly ProvisionedDependency[]) {
  const action = registry.resolveAction(binding);
  const dependencyAssessment = assessDependencies(registry.get(binding.profileId).dependencies, dependencyInventory);
  if (dependencyAssessment.state !== "available" && dependencyAssessment.state !== "prepared") return { status: "blocked" as const, dependencyAssessment };
  return { status: "ready" as const, action };
}

export interface DiagnosticParser { id: string; parse(output: string, exitCode: number | null): readonly NormalizedDiagnostic[] }
export const CLOSED_DIAGNOSTIC_PARSER: DiagnosticParser = Object.freeze({ id: "closed-v1", parse: (_output: string, exitCode: number | null) => exitCode === 0 ? [] : [{ severity: "error" as const, code: "ACTION_FAILED", message: "Validation action failed" }] });
/** Sanitization reduces accidental disclosure, not a guarantee against secrets embedded in arbitrary source. */
export function sanitizeDiagnostic(input: NormalizedDiagnostic, secrets: readonly string[] = []): NormalizedDiagnostic {
  if (!input || !["error", "warning", "info"].includes(input.severity) || typeof input.code !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(input.code) || typeof input.message !== "string" || Buffer.byteLength(input.message) > 4096 || secrets.length > 64) fail("invalid_result");
  let message = input.message;
  for (const secret of secrets) { if (typeof secret !== "string" || secret.length > 4096) fail("invalid_result"); if (secret) message = message.split(secret).join("[REDACTED]"); }
  message = message.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/\b(?:Bearer\s+\S+|(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S+)/gi, "[REDACTED]")
    .replace(/(?:[A-Za-z]:[\\/]|\/)[A-Za-z0-9_.~/-]+(?:[\\/][A-Za-z0-9_.~ -]+)*/g, "[PRIVATE_PATH]");
  const bytes = Buffer.from(message); if (bytes.length > 512) message = bytes.subarray(0, 512).toString("utf8").replace(/\uFFFD$/, "");
  const out: NormalizedDiagnostic = { severity: input.severity, code: input.code, message };
  if (input.file !== undefined) { try { out.file = engineeringPath(input.file); } catch { /* Absolute, linked-context and unsafe diagnostic paths are discarded. */ } }
  for (const key of ["line", "column"] as const) if (input[key] !== undefined) { if (!Number.isSafeInteger(input[key]) || input[key]! < 1 || input[key]! > 1_000_000) fail("invalid_result"); out[key] = input[key]; }
  return out;
}
export interface NormalizeValidationInput {
  validationId: string; executionId: string; workspaceId: string; snapshotDigest: string;
  status: NormalizedValidationResult["status"]; failureKind: NormalizedValidationResult["failureKind"];
  exitCode: number | null; output: string; outputTruncated: boolean; durationMs: number;
}
export function normalizeValidationResult(registry: TrustedValidationProfileRegistry, binding: ValidationProfileBinding, parser: DiagnosticParser, input: NormalizeValidationInput, secrets: readonly string[] = []): NormalizedValidationResult {
  registry.verifyBinding(binding); const p = registry.get(binding.profileId), a = registry.resolveAction(binding);
  if (!input || [input.validationId, input.executionId, input.workspaceId].some(v => typeof v !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(v)) || !digest(input.snapshotDigest) || parser.id !== p.resultParser || typeof input.output !== "string" || Buffer.byteLength(input.output) > p.limits.maxOutputBytes || typeof input.outputTruncated !== "boolean" || !Number.isSafeInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 900_000 || !["unsupported", "blocked", "passed", "failed", "timeout", "cancelled", "uncertain"].includes(input.status) || !["none", "code", "infrastructure", "authorization", "uncertain"].includes(input.failureKind) || !(input.exitCode === null || Number.isSafeInteger(input.exitCode) && input.exitCode >= 0 && input.exitCode <= 255)) fail("invalid_result");
  if (input.status === "passed" && (input.exitCode !== 0 || input.failureKind !== "none" || input.outputTruncated) || input.failureKind === "code" && (input.status !== "failed" || input.exitCode === null || input.exitCode === 0) || input.status === "uncertain" && input.failureKind !== "uncertain") fail("invalid_result");
  const raw = parser.parse(input.output, input.exitCode); if (!Array.isArray(raw) || raw.length > 256) fail("invalid_result");
  const diagnostics = raw.slice(0, p.limits.maxDiagnostics).map(d => sanitizeDiagnostic(d, secrets));
  const diagnosticDigest = engineeringHash(canonicalProposalJson(diagnostics));
  const base = { schemaVersion: 1 as const, validationId: input.validationId, executionId: input.executionId, workspaceId: input.workspaceId,
    profileId: binding.profileId, profileDigest: binding.profileDigest, actionId: a.id, action: a.action, status: input.status, failureKind: input.failureKind,
    snapshotDigest: input.snapshotDigest, exitCode: input.exitCode, diagnostics, diagnosticDigest, outputTruncated: input.outputTruncated || raw.length > diagnostics.length, durationMs: input.durationMs };
  return { ...base, evidenceDigest: engineeringHash(canonicalProposalJson(base)) };
}

/** Compatibility adapter for the existing bounded, closed-code Node evidence.
 * Only an ordinary nonzero action exit is a repairable code failure. Runtime,
 * authorization and incomplete evidence never become code diagnostics. */
export function normalizeRepairEvidence(evidence: RepairValidationEvidence, binding: { profileId: string; profileDigest: string; actionId: string; action?: ValidationAction }, diagnosticInput?: readonly NormalizedDiagnostic[]): NormalizedValidationResult {
  if (!evidence || evidence.schemaVersion !== 1 || !id(binding.profileId) || !digest(binding.profileDigest) || binding.actionId !== evidence.actionId || !id(binding.actionId) ||
    [evidence.validationId, evidence.executionId, evidence.workspaceId].some(v => typeof v !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(v)) || !digest(evidence.snapshotDigest) || !digest(evidence.outputDigest) ||
    !Number.isSafeInteger(evidence.durationMs) || evidence.durationMs < 0 || evidence.durationMs > 900_000 || !["unsupported", "passed", "failed", "timeout", "cancelled", "blocked", "uncertain"].includes(evidence.classification) ||
    !["confirmed", "not_needed", "uncertain"].includes(evidence.cleanup) || !Array.isArray(evidence.diagnostics) || evidence.diagnostics.length > 32 || evidence.diagnostics.some(d => typeof d !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(d)) ||
    !(evidence.exitCode === null || Number.isSafeInteger(evidence.exitCode) && evidence.exitCode >= 0 && evidence.exitCode <= 255)) fail("invalid_result");
  const action = binding.action ?? "test";
  if (!VALIDATION_ACTIONS.includes(action)) fail("invalid_result");
  const uncertain = evidence.classification === "uncertain" || evidence.cleanup === "uncertain";
  const status = uncertain ? "uncertain" : evidence.classification;
  const repairable = status === "failed" && evidence.exitCode !== null && evidence.exitCode !== 0 && evidence.cleanup === "confirmed" && evidence.diagnostics.length === 1 && evidence.diagnostics[0] === "action.failed";
  if (status === "passed" && (evidence.exitCode !== 0 || evidence.cleanup !== "confirmed" || evidence.timedOut || evidence.cancelled || evidence.diagnostics.length !== 1 || evidence.diagnostics[0] !== "action.passed")) fail("invalid_result");
  const failureKind: NormalizedValidationResult["failureKind"] = uncertain ? "uncertain" : repairable ? "code" : status === "passed" || status === "cancelled" ? "none" : "infrastructure";
  if (diagnosticInput && (!Array.isArray(diagnosticInput) || diagnosticInput.length > 32)) fail("invalid_result");
  const diagnostics = (diagnosticInput ?? (repairable ? [{ severity: "error" as const, code: "ACTION_FAILED", message: "Validation action failed" }] : [])).map(d => sanitizeDiagnostic(d));
  const base = { schemaVersion: 1 as const, validationId: evidence.validationId, executionId: evidence.executionId, workspaceId: evidence.workspaceId,
    profileId: binding.profileId, profileDigest: binding.profileDigest, actionId: binding.actionId, action, status, failureKind,
    snapshotDigest: evidence.snapshotDigest, exitCode: evidence.exitCode, diagnostics, diagnosticDigest: engineeringHash(canonicalProposalJson(diagnostics)),
    outputTruncated: evidence.diagnostics.includes("action.output_limit"), durationMs: evidence.durationMs };
  return { ...base, evidenceDigest: engineeringHash(canonicalProposalJson(base)) };
}
