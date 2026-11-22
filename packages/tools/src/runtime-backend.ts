import type { ProcessRunner } from "@ai-harness/contracts";
import { preflightContainer, validateContainerOptions, record, template, type ContainerExecutionOptions, type ContainerPreflight } from "./container-profile.js";
import { preflightPodman, validatePodmanOptions, type PodmanExecutionOptions } from "./podman-profile.js";
export type ExecutionRuntimeOptions = ContainerExecutionOptions | PodmanExecutionOptions;
export function validateRuntimeOptions(options: ExecutionRuntimeOptions): void {
  if (options.backend === "podman") validatePodmanOptions(options);
  else if (options.backend === undefined || options.backend === "docker") validateContainerOptions(options);
  else throw new Error("Unsupported container backend");
}
export function runtimeExecutable(options: ExecutionRuntimeOptions): string {
  return options.backend === "podman" ? options.podmanExecutable : options.dockerExecutable;
}
export function runtimePrefix(options: ExecutionRuntimeOptions, profile: ContainerPreflight): string[] {
  return options.backend === "podman" ? ["--remote", "--url", profile.endpoint] : ["--host", profile.endpoint];
}
export function preflightRuntime(options: ExecutionRuntimeOptions, runner: ProcessRunner, signal?: AbortSignal): Promise<ContainerPreflight> {
  validateRuntimeOptions(options);
  return options.backend === "podman" ? preflightPodman(options, runner, signal) : preflightContainer(options, runner, signal);
}
/** Normalize only equivalent native fields; missing evidence never becomes a grant. */
export function normalizeRuntimeConfiguration(options: ExecutionRuntimeOptions, raw: unknown): Record<string, unknown> {
  const config = record(raw);
  if (options.backend !== "podman") return config;
  const host = { ...record(config.host) };
  if (typeof host.CpuQuota !== "number" || typeof host.CpuPeriod !== "number" || !Number.isSafeInteger(host.CpuQuota) || !Number.isSafeInteger(host.CpuPeriod) || host.CpuQuota <= 0 || host.CpuPeriod <= 0) throw new Error("Missing native CPU limits");
  const cpu = host.CpuQuota / host.CpuPeriod * 1_000_000_000;
  if (host.NanoCpus !== undefined && host.NanoCpus !== 0 && host.NanoCpus !== cpu) throw new Error("Conflicting native CPU limits");
  host.NanoCpus = cpu;
  if (host.CgroupMode !== "private" || (host.CgroupnsMode !== undefined && host.CgroupnsMode !== host.CgroupMode)
    || !["default", "enabled"].includes(String(host.Cgroups))) throw new Error("Missing private cgroup namespace");
  host.CgroupnsMode = host.CgroupMode;
  // Native Go nil slices serialize as explicit null. Missing fields still fail.
  for (const field of ["effectiveCaps", "boundingCaps"]) {
    if (!Object.hasOwn(config, field) || (config[field] !== null && (!Array.isArray(config[field]) || (config[field] as unknown[]).length !== 0))) throw new Error("Native capabilities are not empty");
  }
  const tmpfs = record(host.Tmpfs);
  if (Object.keys(tmpfs).length !== 1 || typeof tmpfs["/tmp"] !== "string") throw new Error("Missing native tmpfs policy");
  const tmpfsOptions = tmpfs["/tmp"].split(",");
  // Podman consumes notmpcopyup and omits tmpcopyup from native inspect.
  const expected = ["rw", "nosuid", "nodev", "noexec", "size=16m", "rprivate"];
  if (tmpfsOptions.length !== expected.length || !expected.every((flag) => tmpfsOptions.includes(flag))) throw new Error("Unsafe native tmpfs policy");
  host.Tmpfs = { "/tmp": "rw,nosuid,nodev,noexec,size=16m" };
  // Podman reports actual effective/bounding caps rather than Docker's ALL token.
  host.CapDrop = ["ALL"];
  if (!Array.isArray(host.Devices) || host.Devices.length !== 0) throw new Error("Native devices are not empty");
  // Podman native inspect has no Docker DeviceRequests field; Devices/Mounts
  // and the fixed create command establish the equivalent no-device policy.
  host.DeviceRequests = null;
  if (host.IpcMode === "") host.IpcMode = "private";
  const restart = record(host.RestartPolicy);
  if (restart.Name === "" && restart.MaximumRetryCount === 0) host.RestartPolicy = { ...restart, Name: "no" };
  if (host.PidMode === "private") host.PidMode = "";
  if (Array.isArray(host.CapDrop)) host.CapDrop = host.CapDrop.map((cap: unknown) => typeof cap === "string" ? cap.toUpperCase() : cap);
  return { ...config, host };
}

/** Project only policy evidence to keep native inspection below the output cap. */
export function configurationTemplate(options: ExecutionRuntimeOptions): string {
  const podman = options.backend === "podman";
  const common = template({ id: podman ? ".ID" : ".Id", owner: '(index .Config.Labels "ai-harness.owner")', user: ".Config.User", mounts: ".Mounts" });
  const fields = ["RestartPolicy", "Privileged", "ReadonlyRootfs", "NetworkMode", "Memory", "MemorySwap", "NanoCpus", "PidsLimit", "CapDrop", "CapAdd", "SecurityOpt", "PidMode", "IpcMode", "UsernsMode", "Binds", "Devices", "PublishAllPorts", "PortBindings", "Tmpfs",
    ...(podman ? ["CpuQuota", "CpuPeriod", "CgroupMode", "Cgroups"] : ["CgroupnsMode", "DeviceRequests"])];
  const host = template(Object.fromEntries(fields.map((field) => [field, `.HostConfig.${field}`])));
  return common.slice(0, -1) + ',"host":' + host + (podman ? ',"effectiveCaps":{{json .EffectiveCaps}},"boundingCaps":{{json .BoundingCaps}}' : '') + '}';
}
