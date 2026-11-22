import { createHash } from "node:crypto";
import path from "node:path";
import type { ProcessRunner } from "@ai-harness/contracts";
import { query, record, template, type ContainerSecurityProfile, type ContainerPreflight } from "./container-profile.js";

export interface PodmanExecutionOptions {
  backend: "podman";
  podmanExecutable: string;
  /** A named, host-approved Podman Machine, never the default connection. */
  machineName: string;
  image: string;
  securityProfile?: ContainerSecurityProfile;
}
export function validatePodmanOptions(options: PodmanExecutionOptions): void {
  if (!path.isAbsolute(options.podmanExecutable)) throw new Error("Podman executable must be absolute");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,29}$/.test(options.machineName)) throw new Error("Invalid Podman machine name");
  if (!/^[a-z0-9][a-z0-9.:-]*\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(options.image)) throw new Error("Podman requires a qualified image pinned by digest");
}
/** Stable correlation of machine name and creation time; not remote attestation. */
export function computePodmanMachineFingerprint(name: string, created: string): string {
  return createHash("sha256").update(name).update("\0").update(created).digest("hex");
}
export async function preflightPodman(options: PodmanExecutionOptions, runner: ProcessRunner, signal?: AbortSignal): Promise<ContainerPreflight> {
  validatePodmanOptions(options);
  const p = options.securityProfile;
  if (!p || p.dedicated !== true || p.disposable !== true
    || !/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(p.endpoint) || p.endpoint.split("/").includes("..")
    || !/^[a-f0-9]{64}$/.test(p.daemonId) || !["linux/amd64", "linux/arm64"].includes(p.platform)) throw new Error("Dedicated Podman profile required");
  const clientVersion = await query(runner, options.podmanExecutable, ["--version"], signal);
  const client = /^podman version (\d+)\.(\d+)\.\d+(?:[-+][A-Za-z0-9._-]+)?$/.exec(clientVersion);
  if (!client) throw new Error("Invalid Podman client version");
  const machine = record(JSON.parse(await query(runner, options.podmanExecutable,
    ["machine", "inspect", options.machineName, "--format", template({ name: ".Name", created: ".Created", rootful: ".Rootful", state: ".State", socket: ".ConnectionInfo.PodmanSocket.Path" })], signal)));
  if (machine.name !== options.machineName || typeof machine.created !== "string" || !Number.isFinite(Date.parse(machine.created))
    || computePodmanMachineFingerprint(options.machineName, machine.created) !== p.daemonId || machine.rootful !== false || machine.state !== "running"
    || `unix://${machine.socket}` !== p.endpoint) throw new Error("Podman machine does not match profile");
  // Machine inspect has no Mounts field. Query the guest's actual mount table
  // with one fixed read-only command; never run caller/model-supplied shell text.
  const mounts = await runner.run(options.podmanExecutable, ["machine", "ssh", options.machineName, "--", "findmnt", "--json", "--types", "virtiofs,9p", "--output", "TARGET,FSTYPE"], 3000, { signal });
  signal?.throwIfAborted();
  if (![0, 1].includes(mounts.exitCode) || mounts.stderr.trim() || Buffer.byteLength(mounts.stdout) + Buffer.byteLength(mounts.stderr) > 4096) throw new Error("Cannot verify guest mounts");
  if (!(mounts.exitCode === 1 && !mounts.stdout.trim())) {
    const table = record(JSON.parse(mounts.stdout));
    if (!Array.isArray(table.filesystems) || table.filesystems.length !== 0) throw new Error("Guest exposes shared host filesystems");
  }
  const prefix = ["--remote", "--url", p.endpoint];
  const info = record(JSON.parse(await query(runner, options.podmanExecutable, [...prefix, "info", "--format", template({
    version: ".Version.Version", kernel: ".Host.Kernel", os: ".Host.OS", arch: ".Host.Arch", cgroup: ".Host.CgroupsVersion",
    manager: ".Host.CgroupManager", controllers: ".Host.CgroupControllers", rootless: ".Host.Security.Rootless", seccomp: ".Host.Security.SECCOMPEnabled",
  })], signal)));
  if (typeof info.version !== "string" || !info.version || info.version.length > 128 || typeof info.kernel !== "string" || !info.kernel || info.kernel.length > 256
    || info.version.split(".").slice(0, 2).join(".") !== `${client[1]}.${client[2]}`
    || info.os !== "linux" || `linux/${info.arch}` !== p.platform || info.cgroup !== "v2" || info.manager !== "systemd"
    || info.rootless !== true || info.seccomp !== true || !Array.isArray(info.controllers)
    || !["cpu", "memory", "pids"].every((c) => (info.controllers as unknown[]).includes(c))) throw new Error("Podman capabilities do not match profile");
  const image = record(JSON.parse(await query(runner, options.podmanExecutable, [...prefix, "image", "inspect", options.image, "--format", template({
    id: ".ID", os: ".Os", arch: ".Architecture", digests: ".RepoDigests", volumes: ".Config.Volumes",
  })], signal)));
  const imageId = typeof image.id === "string" ? image.id.replace(/^sha256:/, "") : "";
  if (!/^[a-f0-9]{64}$/.test(imageId) || image.os !== "linux" || `linux/${image.arch}` !== p.platform
    || !Array.isArray(image.digests) || !image.digests.includes(options.image)
    || (image.volumes !== null && Object.keys(record(image.volumes)).length !== 0)) throw new Error("Podman image does not match profile");
  return { backend: "podman", serverVersion: info.version, kernel: info.kernel, daemonId: p.daemonId, platform: p.platform, imageId, endpoint: p.endpoint };
}
