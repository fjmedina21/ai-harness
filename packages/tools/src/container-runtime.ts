import { randomUUID } from "node:crypto";
import type { CleanupStatus, ProcessRunner, RuntimeOperationState } from "@ai-harness/contracts";
import { ProcessExecutionError } from "./process-runner.js";
import {
  ID_PATTERN, OWNER_LABEL, preflightContainer, query, record, template,
  type ContainerExecutionOptions, type ContainerPreflight,
} from "./container-profile.js";
import { FIXED_CONTAINER_OPERATIONS, type FixedContainerOperation } from "./container-operations.js";

export class ContainerExecutionError extends Error {
  constructor(readonly kind: string, readonly cleanup: CleanupStatus, readonly states: readonly RuntimeOperationState[]) {
    super(`Container execution failed: ${kind}; cleanup: ${cleanup}`);
  }
}
export interface HardenedContainerResult {
  exitCode: number; stdout: string; stderr: string;
  cleanup: CleanupStatus; states: readonly RuntimeOperationState[]; preflight: ContainerPreflight;
}
const TMPFS = "/tmp:rw,nosuid,nodev,noexec,size=16m";
function listArgs(filter: string) { return ["container", "ls", "--all", "--no-trunc", "--filter", filter, "--format", "{{.ID}}"] }

/** Host-only fixed operations; the public executor permits node.version only. */
export async function executeFixedContainer(
  options: ContainerExecutionOptions, runner: ProcessRunner, operation: FixedContainerOperation, signal?: AbortSignal,
): Promise<HardenedContainerResult> {
  if (!Object.hasOwn(FIXED_CONTAINER_OPERATIONS, operation)) throw new ContainerExecutionError("unsupported_operation", "not_needed", []);
  const states: RuntimeOperationState[] = ["preflight"];
  const deadline = AbortSignal.timeout(10_000);
  const combined = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
  let attemptedCreation = false;
  let id: string | undefined;
  let failure: string | undefined;
  let output = { exitCode: 0, stdout: "", stderr: "" };
  let verified: ContainerPreflight | undefined;
  let cleanup: CleanupStatus = "not_needed";
  const name = `ai-harness-${randomUUID()}`;
  const owner = randomUUID();
  const check = () => { if (combined.aborted) throw new ProcessExecutionError(signal?.aborted ? "cancelled" : "timeout"); };
  try {
    check();
    verified = await preflightContainer(options, runner, combined);
    check();
    const docker = ["--host", verified.endpoint];
    states.push("creating");
    attemptedCreation = true;
    const creation = await runner.run(options.dockerExecutable, [...docker,
      "container", "create", "--pull", "never", "--platform", verified.platform,
      "--name", name, "--label", `${OWNER_LABEL}=${owner}`, "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "256m", "--memory-swap", "256m", "--cpus", "0.5",
      "--user", "65534:65534", "--tmpfs", TMPFS, "--ipc", "private", "--cgroupns", "private", "--no-healthcheck",
      "--entrypoint", "node", verified.imageId, ...FIXED_CONTAINER_OPERATIONS[operation],
    ], 10_000, { signal: combined });
    if (creation.exitCode !== 0 || !ID_PATTERN.test(creation.stdout.trim())) throw new Error("creation_failed");
    id = creation.stdout.trim();
    check();
    const config = record(JSON.parse(await query(runner, options.dockerExecutable, [...docker, "container", "inspect", id, "--format", template({
      id: ".Id", owner: `(index .Config.Labels "${OWNER_LABEL}")`, user: ".Config.User", host: ".HostConfig", mounts: ".Mounts",
    })], combined)));
    const host = record(config.host);
    if (config.id !== id || config.owner !== owner || config.user !== "65534:65534"
      || host.Privileged !== false || host.ReadonlyRootfs !== true || host.NetworkMode !== "none"
      || host.Memory !== 268435456 || host.MemorySwap !== 268435456 || host.NanoCpus !== 500000000 || host.PidsLimit !== 64
      || !Array.isArray(host.CapDrop) || !host.CapDrop.includes("ALL") || (host.CapAdd !== null && (!Array.isArray(host.CapAdd) || host.CapAdd.length > 0))
      || !Array.isArray(host.SecurityOpt) || !host.SecurityOpt.length || !host.SecurityOpt.every((s) => s === "no-new-privileges" || s === "no-new-privileges=true")
      || host.PidMode !== "" || host.IpcMode !== "private" || host.CgroupnsMode !== "private" || host.UsernsMode === "host"
      || (host.Binds !== null && (!Array.isArray(host.Binds) || host.Binds.length > 0))
      || (host.Devices !== null && (!Array.isArray(host.Devices) || host.Devices.length > 0))
      || (host.DeviceRequests !== null && (!Array.isArray(host.DeviceRequests) || host.DeviceRequests.length > 0))
      || host.PublishAllPorts !== false || (host.PortBindings !== null && Object.keys(record(host.PortBindings)).length > 0)
      || JSON.stringify(host.Tmpfs) !== JSON.stringify({ "/tmp": TMPFS.slice(5) })
      || !Array.isArray(config.mounts) || config.mounts.some((m) => record(m).Type !== "tmpfs" || record(m).Destination !== "/tmp")) {
      throw new Error("effective_configuration_mismatch");
    }
    check(); states.push("running");
    output = await runner.run(options.dockerExecutable, [...docker, "container", "start", "--attach", id], 10_000, { signal: combined });
    check();
    if (output.exitCode !== 0) throw new Error("nonzero_exit");
    if (Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr) > 4096) throw new Error("output_limit");
    states.push("exited");
  } catch (error) {
    failure = combined.aborted ? (signal?.aborted ? "cancelled" : "timeout")
      : error instanceof ProcessExecutionError ? error.kind
      : !attemptedCreation ? "preflight_failed"
      : error instanceof Error && ["creation_failed", "effective_configuration_mismatch", "nonzero_exit", "output_limit"].includes(error.message) ? error.message : "runtime_failed";
    states.push(combined.aborted ? "cancelling" : "failed");
  } finally {
    if (attemptedCreation && verified) {
      states.push("cleaning"); cleanup = "uncertain";
      const docker = ["--host", verified.endpoint];
      try {
        // Independent cleanup deadlines: never inherit cancellation. No retry/replay.
        const found = await query(runner, options.dockerExecutable, [...docker, ...listArgs(`name=^/${name}$`)]);
        if (!found) {
          // If create did not return an ID, daemon-side late creation remains uncertain.
          if (id && !(await query(runner, options.dockerExecutable, [...docker, ...listArgs(`id=${id}`)]))) cleanup = "confirmed";
        } else if (ID_PATTERN.test(found)) {
          const owned = record(JSON.parse(await query(runner, options.dockerExecutable, [...docker, "container", "inspect", found, "--format", template({
            id: ".Id", owner: `(index .Config.Labels "${OWNER_LABEL}")`,
          })])));
          if (owned.id === found && owned.owner === owner && (!id || id === found)) {
            await query(runner, options.dockerExecutable, [...docker, "container", "rm", "--force", found]);
            const byId = await query(runner, options.dockerExecutable, [...docker, ...listArgs(`id=${found}`)]);
            const byName = await query(runner, options.dockerExecutable, [...docker, ...listArgs(`name=^/${name}$`)]);
            if (!byId && !byName) cleanup = "confirmed";
          }
        }
      } catch { /* uncertain is preserved and exposed */ }
    }
  }
  if (failure || cleanup !== "confirmed" || !verified) throw new ContainerExecutionError(failure ?? "cleanup_uncertain", cleanup, [...states]);
  return { ...output, cleanup, states: [...states], preflight: verified };
}
