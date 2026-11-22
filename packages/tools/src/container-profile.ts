import path from "node:path";
import type { ProcessRunner } from "@ai-harness/contracts";

export interface ContainerSecurityProfile {
  /** Host attestation, not proof of exclusive daemon ownership. */
  dedicated: true;
  disposable: true;
  endpoint: string;
  daemonId: string;
  platform: "linux/amd64" | "linux/arm64";
}
export interface ContainerExecutionOptions {
  dockerExecutable: string;
  dockerContext: string;
  image: string;
  securityProfile?: ContainerSecurityProfile;
}
export interface ContainerPreflight {
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
export function validateContainerOptions(options: ContainerExecutionOptions): void {
  if (!path.isAbsolute(options.dockerExecutable) || !options.dockerExecutable.trim()) throw new Error("Docker executable must be absolute");
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(options.dockerContext)) throw new Error("Invalid Docker context");
  if (!/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(options.image)) throw new Error("Container image must use SHA-256 digest");
}
export async function query(runner: ProcessRunner, executable: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const result = await runner.run(executable, args, 3000, { signal });
  signal?.throwIfAborted();
  if (result.exitCode !== 0 || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 4096) throw new Error("Runtime query failed");
  return result.stdout.trim();
}
export async function preflightContainer(options: ContainerExecutionOptions, runner: ProcessRunner, signal?: AbortSignal): Promise<ContainerPreflight> {
  validateContainerOptions(options);
  const p = options.securityProfile;
  if (!p || p.dedicated !== true || p.disposable !== true
    || !/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(p.endpoint) || p.endpoint.split("/").includes("..")
    || !/^[A-Za-z0-9:_-]{1,128}$/.test(p.daemonId) || !["linux/amd64", "linux/arm64"].includes(p.platform)) {
    throw new Error("Dedicated runtime profile required");
  }
  const context = JSON.parse(await query(runner, options.dockerExecutable,
    ["context", "inspect", options.dockerContext, "--format", "{{json .Endpoints.docker.Host}}"], signal));
  if (context !== p.endpoint) throw new Error("Runtime endpoint mismatch");
  // Pin the endpoint after resolving the context; ambient context/env cannot redirect commands.
  const docker = ["--host", p.endpoint];
  const info = record(JSON.parse(await query(runner, options.dockerExecutable, [...docker, "info", "--format", template({
    id: ".ID", os: ".OSType", arch: ".Architecture", cgroup: ".CgroupVersion", driver: ".CgroupDriver",
    security: ".SecurityOptions", memory: ".MemoryLimit", swap: ".SwapLimit", cpu: ".CPUCfsQuota", pids: ".PidsLimit",
  })], signal)));
  const arch = info.arch === "x86_64" ? "amd64" : info.arch === "aarch64" ? "arm64" : info.arch;
  if (info.id !== p.daemonId || info.os !== "linux" || `linux/${arch}` !== p.platform
    || info.cgroup !== "2" || info.driver !== "systemd" || info.memory !== true || info.swap !== true || info.cpu !== true || info.pids !== true
    || !Array.isArray(info.security) || !info.security.includes("name=rootless")
    || !info.security.some((s) => typeof s === "string" && s.startsWith("name=seccomp,"))) {
    throw new Error("Runtime capabilities do not match profile");
  }
  const image = record(JSON.parse(await query(runner, options.dockerExecutable, [...docker, "image", "inspect", options.image, "--format", template({
    id: ".Id", os: ".Os", arch: ".Architecture", digests: ".RepoDigests", volumes: ".Config.Volumes",
  })], signal)));
  if (typeof image.id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(image.id)
    || image.os !== "linux" || `linux/${image.arch}` !== p.platform || !Array.isArray(image.digests) || !image.digests.includes(options.image)
    || (image.volumes !== null && Object.keys(record(image.volumes)).length !== 0)) throw new Error("Image does not match profile");
  return { daemonId: p.daemonId, platform: p.platform, imageId: image.id, endpoint: p.endpoint };
}
