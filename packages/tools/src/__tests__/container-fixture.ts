import type { ProcessResult, ProcessRunner, ProcessRunOptions } from "@ai-harness/contracts";
import { ProcessExecutionError } from "../process-runner.js";
export const IMAGE = "node@sha256:" + "a".repeat(64);
export const OPTIONS = {
  dockerExecutable: "/usr/local/bin/docker", dockerContext: "dedicated-test", image: IMAGE,
  securityProfile: { dedicated: true as const, disposable: true as const, endpoint: "unix:///run/user/1000/harness.sock", daemonId: "test-daemon", platform: "linux/arm64" as const },
};
export class ContainerFixture implements ProcessRunner {
  calls: Array<{ executable: string; args: string[]; timeoutMs: number; signal?: AbortSignal }> = [];
  owner = ""; removed = false; id = "b".repeat(64);
  info: Record<string, unknown> = { version: "29.8.2", kernel: "fixture-kernel", id: "test-daemon", os: "linux", arch: "aarch64", cgroup: "2", driver: "systemd",
    security: ["name=rootless", "name=seccomp,profile=builtin"], memory: true, swap: true, cpu: true, pids: true };
  image: Record<string, unknown> = { id: "sha256:" + "c".repeat(64), os: "linux", arch: "arm64", digests: [IMAGE], volumes: null };
  host: Record<string, unknown> = { RestartPolicy: { Name: "no", MaximumRetryCount: 0 }, Privileged: false, ReadonlyRootfs: true, NetworkMode: "none", Memory: 268435456,
    MemorySwap: 268435456, NanoCpus: 500000000, PidsLimit: 64, CapDrop: ["ALL"], CapAdd: null,
    SecurityOpt: ["no-new-privileges"], PidMode: "", IpcMode: "private", CgroupnsMode: "private", UsernsMode: "",
    Binds: null, Devices: [], DeviceRequests: null, PublishAllPorts: false, PortBindings: {}, Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=16m" } };
  endpoint = OPTIONS.securityProfile.endpoint;
  foreignOwner = false; failCleanup = false; createFailure = false; lateAbsent = false; remain = false;
  signalOnCreate?: AbortController;
  failStart = false;
  result: ProcessResult = { exitCode: 0, stdout: "v24.18.0\n", stderr: "" };
  async run(executable: string, raw: readonly string[], timeoutMs: number, options: ProcessRunOptions = {}): Promise<ProcessResult> {
    const args = [...raw]; this.calls.push({ executable, args, timeoutMs, signal: options.signal });
    const result = (value: unknown): ProcessResult => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: "" });
    if (args[0] === "context") return result(this.endpoint);
    if (args.includes("info")) return result(this.info);
    if (args.includes("image")) return result(this.image);
    if (args.includes("create")) {
      this.owner = args[args.indexOf("--label") + 1]!.split("=")[1]!;
      this.signalOnCreate?.abort();
      if (this.createFailure) throw new ProcessExecutionError("timeout");
      return { exitCode: 0, stdout: this.id, stderr: "" };
    }
    if (args.includes("inspect")) return result({ id: this.id, owner: this.foreignOwner ? "foreign" : this.owner,
      ...(args.at(-1)?.includes('"host"') ? { user: "65534:65534", host: this.host, mounts: [] } : {}) });
    if (args.includes("start")) {
      if (this.failStart) throw new Error("secret daemon diagnostic");
      return this.result;
    }
    if (args.includes("ls")) return { exitCode: 0, stdout: this.lateAbsent || (this.removed && !this.remain) ? "" : this.id, stderr: "" };
    if (args.includes("rm")) {
      if (this.failCleanup) throw new Error("secret cleanup failure");
      this.removed = true; return { exitCode: 0, stdout: this.id, stderr: "" };
    }
    throw new Error("Unexpected fixture command");
  }
}
