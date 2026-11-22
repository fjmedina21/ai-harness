import type { ProcessRunner } from "@ai-harness/contracts";
import { record, template, type ContainerPreflight } from "./container-profile.js";
import { preflightPodman, validatePodmanOptions, type PodmanExecutionOptions } from "./podman-profile.js";

/** Podman Machine is the only supported container runtime. No implicit backend. */
export type ExecutionRuntimeOptions = PodmanExecutionOptions;
export function validateRuntimeOptions(options: ExecutionRuntimeOptions): void {
  const data = record(options);
  if (data.backend !== "podman") throw new Error("Unsupported container backend: Podman required");
  if (Object.keys(data).some(key => !["backend", "podmanExecutable", "machineName", "image", "securityProfile"].includes(key)))
    throw new Error("Unsupported container runtime option");
  validatePodmanOptions(options);
}
export function runtimeExecutable(options: ExecutionRuntimeOptions): string {
  validateRuntimeOptions(options);
  return options.podmanExecutable;
}
export function runtimePrefix(options: ExecutionRuntimeOptions, profile: ContainerPreflight): string[] {
  validateRuntimeOptions(options);
  return ["--remote", "--url", profile.endpoint];
}
export function preflightRuntime(options: ExecutionRuntimeOptions, runner: ProcessRunner, signal?: AbortSignal): Promise<ContainerPreflight> {
  validateRuntimeOptions(options);
  return preflightPodman(options, runner, signal);
}

/** Normalize equivalent native fields only; missing evidence never becomes a grant. */
export function normalizeRuntimeConfiguration(options: ExecutionRuntimeOptions, raw: unknown): Record<string, unknown> {
  validateRuntimeOptions(options);
  const config = record(raw);
  const host = { ...record(config.host) };
  if (typeof host.CpuQuota !== "number" || typeof host.CpuPeriod !== "number" || !Number.isSafeInteger(host.CpuQuota) || !Number.isSafeInteger(host.CpuPeriod) || host.CpuQuota <= 0 || host.CpuPeriod <= 0) throw new Error("Missing native CPU limits");
  const cpu = host.CpuQuota / host.CpuPeriod * 1_000_000_000;
  if (host.NanoCpus !== undefined && host.NanoCpus !== 0 && host.NanoCpus !== cpu) throw new Error("Conflicting native CPU limits");
  host.NanoCpus = cpu;
  if (host.CgroupMode !== "private" || (host.CgroupnsMode !== undefined && host.CgroupnsMode !== host.CgroupMode)
    || !["default", "enabled"].includes(String(host.Cgroups))) throw new Error("Missing private cgroup namespace");
  host.CgroupnsMode = host.CgroupMode;
  for (const field of ["effectiveCaps", "boundingCaps"]) {
    if (!Object.hasOwn(config, field) || (config[field] !== null && (!Array.isArray(config[field]) || (config[field] as unknown[]).length !== 0))) throw new Error("Native capabilities are not empty");
  }
  const tmpfs = record(host.Tmpfs);
  if (Object.keys(tmpfs).length !== 1 || typeof tmpfs["/tmp"] !== "string") throw new Error("Missing native tmpfs policy");
  const tmpfsOptions = tmpfs["/tmp"].split(",");
  const expected = ["rw", "nosuid", "nodev", "noexec", "size=16m", "rprivate"];
  if (tmpfsOptions.length !== expected.length || !expected.every(flag => tmpfsOptions.includes(flag))) throw new Error("Unsafe native tmpfs policy");
  host.Tmpfs = { "/tmp": "rw,nosuid,nodev,noexec,size=16m" };
  // Verified empty effective/bounding sets establish the internal drop-all marker.
  host.CapDrop = ["ALL"];
  if (!Array.isArray(host.Devices) || host.Devices.length !== 0) throw new Error("Native devices are not empty");
  if (host.IpcMode === "") host.IpcMode = "private";
  const restart = record(host.RestartPolicy);
  if (restart.Name === "" && restart.MaximumRetryCount === 0) host.RestartPolicy = { ...restart, Name: "no" };
  if (host.PidMode === "private") host.PidMode = "";
  return { ...config, host };
}

/** Project only native policy evidence to keep inspection below the output cap. */
export function configurationTemplate(options: ExecutionRuntimeOptions): string {
  validateRuntimeOptions(options);
  const common = template({ id: ".ID", owner: '(index .Config.Labels "ai-harness.owner")', user: ".Config.User", mounts: ".Mounts" });
  const fields = ["RestartPolicy", "Privileged", "ReadonlyRootfs", "NetworkMode", "Memory", "MemorySwap", "NanoCpus", "PidsLimit", "CapAdd", "SecurityOpt", "PidMode", "IpcMode", "UsernsMode", "Binds", "Devices", "PublishAllPorts", "PortBindings", "Tmpfs", "CpuQuota", "CpuPeriod", "CgroupMode", "Cgroups"];
  const host = template(Object.fromEntries(fields.map(field => [field, ".HostConfig." + field])));
  return common.slice(0, -1) + ',"host":' + host + ',"effectiveCaps":{{json .EffectiveCaps}},"boundingCaps":{{json .BoundingCaps}}}';
}
