import type { ProcessRunner } from "@ai-harness/contracts";

export interface ContainerSecurityProfile {
  /** Host attestation, not proof of exclusive daemon ownership. */
  dedicated: true;
  disposable: true;
  endpoint: string;
  daemonId: string;
  platform: "linux/amd64" | "linux/arm64";
}
/** Generic executor options now require explicit Podman configuration. */
export type ContainerExecutionOptions = import("./podman-profile.js").PodmanExecutionOptions;
export interface ContainerPreflight {
  backend: "podman";
  serverVersion: string;
  kernel: string;
  daemonId: string;
  platform: string;
  imageId: string;
  endpoint: string;
}
export const OWNER_LABEL = "ai-harness.owner";
export const ID_PATTERN = /^[a-f0-9]{64}$/;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid runtime metadata");
  return value as Record<string, unknown>;
}
export function template(fields: Record<string, string>): string {
  return "{" + Object.entries(fields).map(([key, expr]) => `"${key}":{{json ${expr}}}`).join(",") + "}";
}
export async function query(runner: ProcessRunner, executable: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const result = await runner.run(executable, args, 3000, { signal });
  signal?.throwIfAborted();
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 4096) throw new Error("Runtime query failed");
  return result.stdout.trim();
}
