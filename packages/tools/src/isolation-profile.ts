import { validateRuntimeOptions, type ExecutionRuntimeOptions } from "./runtime-backend.js";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { readBoundedFile } from "./bounded-file.js";
import { record, type ContainerSecurityProfile } from "./container-profile.js";

/** Explicit host-selected private Podman profile. Never discover repository config. */
export async function loadIsolationProfile(filename: string | undefined): Promise<ExecutionRuntimeOptions> {
  if (!filename || !path.isAbsolute(filename)) throw new Error("Dedicated isolation profile unavailable");
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 8192 || info.nlink !== 1 || typeof process.getuid !== "function"
      || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error("Private host-owned profile required");
    const data = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedFile(handle, 8192))));
    if (data.backend !== "podman" || Object.keys(data).some(key => !["backend", "podmanExecutable", "machineName", "image", "securityProfile"].includes(key))
      || typeof data.podmanExecutable !== "string" || typeof data.machineName !== "string" || typeof data.image !== "string") throw new Error("Invalid Podman isolation profile");
    const p = record(data.securityProfile);
    if (Object.keys(p).some(key => !["dedicated", "disposable", "endpoint", "daemonId", "platform"].includes(key))
      || p.dedicated !== true || p.disposable !== true || typeof p.endpoint !== "string" || typeof p.daemonId !== "string"
      || !["linux/amd64", "linux/arm64"].includes(String(p.platform))) throw new Error("Invalid dedicated profile attestation");
    const securityProfile: ContainerSecurityProfile = { dedicated: true, disposable: true, endpoint: p.endpoint, daemonId: p.daemonId, platform: p.platform as ContainerSecurityProfile["platform"] };
    const options: ExecutionRuntimeOptions = { backend: "podman", podmanExecutable: data.podmanExecutable, machineName: data.machineName, image: data.image, securityProfile };
    validateRuntimeOptions(options);
    return options;
  } finally { await handle.close(); }
}
