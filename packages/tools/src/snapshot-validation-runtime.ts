import type { ProcessRunner, ValidationActionProfile, ValidationClassification, ValidationSnapshot, ValidationSnapshotManifest } from "@ai-harness/contracts";
import { engineeringHash, engineeringPath } from "./engineering-workspace.js";
import { decodeValidationSnapshot } from "./validation-snapshot.js";
import { executeFixedContainer, ContainerExecutionError } from "./container-runtime.js";
import type { PodmanExecutionOptions } from "./podman-profile.js";

export class SandboxValidationRegistry {
  private readonly profiles = new Map<string, ValidationActionProfile>();
  register(profile: ValidationActionProfile): void {
    if (!profile || Object.keys(profile).sort().join() !== ["id", "runtimeProfile", "image", "executable", "args", "workingDirectory", "timeoutMs", "maxOutputBytes", "network", "resources"].sort().join() ||
      !/^[a-z][a-z0-9._-]{0,63}$/.test(profile.id) || this.profiles.has(profile.id) || profile.runtimeProfile !== "node-isolated-v1" ||
      !/^[a-z0-9][a-z0-9.:-]*\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(profile.image) || profile.executable !== "node" || profile.network !== "none" ||
      !Array.isArray(profile.args) || profile.args.length < 1 || profile.args.length > 32 || profile.args.some(v => typeof v !== "string" || !v || v.length > 256 || /[\0\r\n]/.test(v)) ||
      typeof profile.workingDirectory !== "string" || !Number.isSafeInteger(profile.timeoutMs) || profile.timeoutMs < 1 || profile.timeoutMs > 10000 ||
      !Number.isSafeInteger(profile.maxOutputBytes) || profile.maxOutputBytes < 1 || profile.maxOutputBytes > 1024 || !profile.resources ||
      Object.keys(profile.resources).sort().join() !== ["cpu", "memoryBytes", "pids"].sort().join() ||
      profile.resources.cpu !== 0.5 || profile.resources.memoryBytes !== 268435456 || profile.resources.pids !== 64) throw new Error("Invalid sandbox validation profile");
    if (profile.workingDirectory !== "") engineeringPath(profile.workingDirectory);
    this.profiles.set(profile.id, structuredClone(profile));
  }
  get(id: string): ValidationActionProfile {
    const p = this.profiles.get(id); if (!p) throw new Error("Sandbox validation action not authorized"); return structuredClone(p);
  }
}
export interface SnapshotRuntimeResult {
  classification: ValidationClassification;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  cleanup: "confirmed" | "uncertain" | "not_needed";
  output: string;
  diagnostics: readonly string[];
}
export interface SnapshotValidationRuntime {
  execute(snapshot: ValidationSnapshot, profile: ValidationActionProfile, signal?: AbortSignal): Promise<SnapshotRuntimeResult>;
}
export interface PodmanValidationAcceptance {
  /** Host verifier must resolve current, reviewed live acceptance, never repository configuration. */
  verify(manifest: Readonly<ValidationSnapshotManifest>, profile: Readonly<ValidationActionProfile>, runtime: Readonly<PodmanExecutionOptions>): Promise<void>;
}
/** Host-only port. Constructor does not grant acceptance; verifier runs for every effect. */
export class PodmanSnapshotValidationRuntime implements SnapshotValidationRuntime {
  constructor(private readonly options: PodmanExecutionOptions, private readonly runner: ProcessRunner,
    private readonly acceptance: PodmanValidationAcceptance) { this.options = structuredClone(options); }
  async execute(snapshot: ValidationSnapshot, profile: ValidationActionProfile, signal?: AbortSignal): Promise<SnapshotRuntimeResult> {
    const registry = new SandboxValidationRegistry(); registry.register(profile); const selected = registry.get(profile.id);
    const payload = decodeValidationSnapshot(snapshot.payload());
    if (JSON.stringify(payload.manifest) !== JSON.stringify(snapshot.manifest) || selected.image !== this.options.image || !this.acceptance?.verify) throw new Error("Sandbox validation binding mismatch");
    await this.acceptance.verify(Object.freeze(structuredClone(payload.manifest)), Object.freeze(structuredClone(selected)), Object.freeze(structuredClone(this.options)));
    signal?.throwIfAborted();
    const bytes = Buffer.from(JSON.stringify({ snapshot: payload, action: selected }));
    if (bytes.length > 6 * 1024 * 1024) throw new Error("Validation transfer limit");
    let result;
    try { result = await executeFixedContainer(this.options, this.runner, "engineering.validate", signal, bytes); }
    catch (error) {
      if (!(error instanceof ContainerExecutionError)) throw error;
      const timedOut = error.kind === "timeout", cancelled = error.kind === "cancelled";
      return { classification: error.cleanup === "uncertain" ? "uncertain" : timedOut ? "timeout" : cancelled ? "cancelled" : "blocked",
        exitCode: null, timedOut, cancelled, cleanup: error.cleanup, output: "", diagnostics: ["runtime." + error.kind] };
    }
    try {
      if (result.stderr.trim()) throw new Error();
      const data: unknown = JSON.parse(result.stdout);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
      const r = data as Record<string, unknown>;
      if (Object.keys(r).sort().join() !== ["version", "snapshotDigest", "transferDigest", "staging", "exitCode", "kind", "output"].sort().join() ||
        r.version !== 1 || r.snapshotDigest !== snapshot.manifest.snapshotDigest || r.transferDigest !== snapshot.manifest.transferDigest || r.staging !== "verified" ||
        !(r.exitCode === null || Number.isSafeInteger(r.exitCode) && (r.exitCode as number) >= 0 && (r.exitCode as number) <= 255) ||
        ![null, "timeout", "output_limit", "start_failed"].includes(r.kind as null) || typeof r.output !== "string" || r.output.length > 1368) throw new Error();
      const raw = Buffer.from(r.output, "base64");
      if (raw.toString("base64") !== r.output || raw.length > selected.maxOutputBytes || (r.kind === null && r.exitCode === null)) throw new Error();
      return { classification: r.kind === "timeout" ? "timeout" : r.kind !== null ? "failed" : r.exitCode === 0 ? "passed" : "failed",
        exitCode: r.exitCode as number | null, timedOut: r.kind === "timeout", cancelled: false, cleanup: result.cleanup,
        output: raw.toString("utf8"), diagnostics: [r.kind === null ? r.exitCode === 0 ? "action.passed" : "action.failed" : "action." + r.kind] };
    } catch {
      return { classification: "uncertain", exitCode: null, timedOut: false, cancelled: false, cleanup: result.cleanup,
        output: "", diagnostics: ["runtime.invalid_result"] };
    }
  }
}
export const validationOutputDigest = (output: string): string => engineeringHash(output);
