import type { ProcessResult, ProcessRunOptions } from "@ai-harness/contracts";
import { ContainerFixture, OPTIONS } from "./container-fixture.js";
import { podmanMachineIdentity, type PodmanExecutionOptions } from "../podman-profile.js";
export const CREATED = "2026-11-21T20:00:00Z";
export const PODMAN_OPTIONS: PodmanExecutionOptions = {
  backend: "podman", podmanExecutable: "/usr/local/bin/podman", machineName: "harness-phase5",
  image: "docker.io/library/node@sha256:" + "a".repeat(64),
  securityProfile: { ...OPTIONS.securityProfile, daemonId: podmanMachineIdentity("harness-phase5", CREATED) },
};
export class PodmanFixture extends ContainerFixture {
  guestMounts: unknown[] = [];
  effectiveCaps: unknown[] = [];
  boundingCaps: unknown[] = [];
  guestExitCode = 0;
  clientVersion = "podman version 6.2.0";
  machine: Record<string, unknown> = { name: "harness-phase5", created: CREATED, rootful: false, state: "running", socket: OPTIONS.securityProfile.endpoint.slice(7) };
  podmanInfo: Record<string, unknown> = { version: "6.2.0", kernel: "fixture-kernel", os: "linux", arch: "arm64", cgroup: "v2", manager: "systemd", controllers: ["cpu", "memory", "pids"], rootless: true, seccomp: true };
  constructor() {
    super(); this.image.digests = [PODMAN_OPTIONS.image];
    this.host.Tmpfs = { "/tmp": "rw,nosuid,nodev,noexec,size=16m,rprivate" };
    delete this.host.CgroupnsMode; delete this.host.DeviceRequests;
    this.host.CgroupMode = "private"; this.host.Cgroups = "enabled";
    this.host.RestartPolicy = { Name: "", MaximumRetryCount: 0 };
    this.host.IpcMode = "";
    this.host.NanoCpus = 0; this.host.CpuQuota = 50000; this.host.CpuPeriod = 100000; this.host.PidMode = "private"; this.host.CapDrop = ["all"];
  }
  override async run(executable: string, raw: readonly string[], timeoutMs: number, options: ProcessRunOptions = {}): Promise<ProcessResult> {
    const args = [...raw];
    if (args[0] === "machine" && args[1] === "ssh") {
      this.calls.push({ executable, args, timeoutMs, signal: options.signal });
      return { exitCode: this.guestExitCode, stdout: JSON.stringify({ filesystems: this.guestMounts }), stderr: "" };
    }
    if (args.includes("inspect") && args.at(-1)?.includes('"host"')) {
      const result = await super.run(executable, args, timeoutMs, options);
      return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), effectiveCaps: this.effectiveCaps, boundingCaps: this.boundingCaps }) };
    }
    if (args[0] === "--version" || args[0] === "machine" || args.includes("info")) {
      this.calls.push({ executable, args, timeoutMs, signal: options.signal });
      return { exitCode: 0, stdout: args[0] === "--version" ? this.clientVersion : JSON.stringify(args[0] === "machine" ? this.machine : this.podmanInfo), stderr: "" };
    }
    return super.run(executable, args, timeoutMs, options);
  }
}
