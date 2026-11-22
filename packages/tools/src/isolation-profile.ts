import { validateRuntimeOptions, type ExecutionRuntimeOptions } from "./runtime-backend.js";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { readBoundedFile } from "./bounded-file.js";
import { record, type ContainerSecurityProfile } from "./container-profile.js";

/** Explicit host-selected private file, never discovered from repository config. */
export async function loadIsolationProfile(filename: string | undefined): Promise<ExecutionRuntimeOptions> {
  if (!filename || !path.isAbsolute(filename)) throw new Error("Dedicated isolation profile unavailable");
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 8192 || info.nlink !== 1 || typeof process.getuid !== "function"
      || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error("Private host-owned profile required");
    const data = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedFile(handle, 8192))));
    const podman = data.backend === "podman";
    const keys = podman ? ["backend", "podmanExecutable", "machineName", "image", "securityProfile"] : ["backend", "dockerExecutable", "dockerContext", "image", "securityProfile"];
    if (Object.keys(data).some((key) => !keys.includes(key)) || typeof data.image !== "string"
      || (podman ? typeof data.podmanExecutable !== "string" || typeof data.machineName !== "string"
        : (data.backend !== undefined && data.backend !== "docker") || typeof data.dockerExecutable !== "string" || typeof data.dockerContext !== "string")) throw new Error("Invalid isolation profile");
    const p = record(data.securityProfile);
    if (Object.keys(p).some((key) => !["dedicated", "disposable", "endpoint", "daemonId", "platform"].includes(key))
      || p.dedicated !== true || p.disposable !== true || typeof p.endpoint !== "string" || typeof p.daemonId !== "string"
      || !["linux/amd64", "linux/arm64"].includes(String(p.platform))) throw new Error("Invalid dedicated profile attestation");
    const securityProfile: ContainerSecurityProfile = { dedicated: true, disposable: true, endpoint: p.endpoint, daemonId: p.daemonId, platform: p.platform as ContainerSecurityProfile["platform"] };
    const options: ExecutionRuntimeOptions = podman
      ? { backend: "podman", podmanExecutable: data.podmanExecutable as string, machineName: data.machineName as string, image: data.image, securityProfile }
      : { backend: "docker", dockerExecutable: data.dockerExecutable as string, dockerContext: data.dockerContext as string, image: data.image, securityProfile };
    validateRuntimeOptions(options);
    if (!podman && data.backend === undefined) delete options.backend;
    return options;
  } finally { await handle.close(); }
}
