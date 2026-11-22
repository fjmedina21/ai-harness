import type { ProcessRunner } from "@ai-harness/contracts";
import { NodeProcessRunner } from "./process-runner.js";
import { randomUUID } from "node:crypto";
import path from "node:path";

const MAX_OUTPUT_BYTES = 4096;
const TIMEOUT_MS = 10_000;

const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;

export type ContainerCommand = "node.version";

export interface ContainerExecutionOptions {
  /**
   * Trusted absolute path to Docker CLI.
   */
  dockerExecutable: string;

  /**
   * Trusted Docker context.
   */
  dockerContext: string;

  /**
   * Pre-pulled image pinned to a SHA-256 digest.
   */
  image: string;
}

export { NodeProcessRunner } from "./process-runner.js";
export type { ProcessResult, ProcessRunner } from "@ai-harness/contracts";

export interface ContainerExecutionResult {
  command: ContainerCommand;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class ContainerExecutor {
  private readonly options: ContainerExecutionOptions;

  constructor(
    options: ContainerExecutionOptions,
    private readonly runner: ProcessRunner = new NodeProcessRunner(),
  ) {
    if (
      !path.isAbsolute(options.dockerExecutable) ||
      !options.dockerExecutable.trim()
    ) {
      throw new Error("Docker executable must be absolute");
    }

    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(options.dockerContext)) {
      throw new Error("Invalid Docker context");
    }

    if (!IMAGE_PATTERN.test(options.image)) {
      throw new Error("Container image must use SHA-256 digest");
    }

    this.options = { ...options };
  }

  async execute(command: ContainerCommand): Promise<ContainerExecutionResult> {
    if (command !== "node.version") {
      throw new Error("Unsupported container command");
    }

    const containerName = `ai-harness-${randomUUID()}`;
    const { dockerExecutable, dockerContext, image } = this.options;

    const docker = ["--context", dockerContext];

    const args = [
      ...docker,
      "run",
      "--rm",
      "--pull",
      "never",
      "--name",
      containerName,
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "64",
      "--memory",
      "256m",
      "--memory-swap",
      "256m",
      "--cpus",
      "0.5",
      "--user",
      "65534:65534",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,size=16m",
      "--entrypoint",
      "node",
      image,
      "--version",
    ];

    try {
      const result = await this.runner.run(dockerExecutable, args, TIMEOUT_MS);

      if (result.exitCode !== 0) {
        throw new Error("Container exited unsuccessfully");
      }

      if (
        Buffer.byteLength(result.stdout, "utf8") > MAX_OUTPUT_BYTES ||
        Buffer.byteLength(result.stderr, "utf8") > MAX_OUTPUT_BYTES
      ) {
        throw new Error("Container output limit exceeded");
      }

      return {
        command,
        ...result,
      };
    } finally {
      // Best-effort cleanup. If Docker CLI times out,
      // force-removing the named container helps prevent
      // orphaned container workloads.
      try {
        await this.runner.run(
          dockerExecutable,
          [...docker, "rm", "--force", containerName],
          3_000,
        );
      } catch {
        // Cleanup failure must be observable through
        // production monitoring in a later phase.
      }
    }
  }
}
