import { validateRuntimeOptions, preflightRuntime, type ExecutionRuntimeOptions } from "./runtime-backend.js";
import type { ProcessRunner, CleanupStatus, RuntimeOperationState } from "@ai-harness/contracts";
import { NodeProcessRunner } from "./process-runner.js";
import { type ContainerPreflight } from "./container-profile.js";
import { executeFixedContainer, ContainerExecutionError } from "./container-runtime.js";
export { NodeProcessRunner } from "./process-runner.js";
export { ContainerExecutionError } from "./container-runtime.js";
export type { ProcessResult, ProcessRunner } from "@ai-harness/contracts";
export type { ContainerExecutionOptions, ContainerSecurityProfile, ContainerPreflight } from "./container-profile.js";
export type ContainerCommand = "node.version";
/** Legacy output fields retained; new executor always fills lifecycle metadata. */
export interface ContainerExecutionResult {
  command: ContainerCommand; exitCode: number; stdout: string; stderr: string;
  cleanup?: CleanupStatus; states?: readonly RuntimeOperationState[]; preflight?: ContainerPreflight;
}

export class ContainerExecutor {
  private readonly options: ExecutionRuntimeOptions;
  constructor(options: ExecutionRuntimeOptions, private readonly runner: ProcessRunner = new NodeProcessRunner()) {
    validateRuntimeOptions(options);
    this.options = structuredClone(options);
  }
  async preflight(signal?: AbortSignal) {
    try { return await preflightRuntime(this.options, this.runner, signal); }
    catch { throw new ContainerExecutionError(signal?.aborted ? "cancelled" : "preflight_failed", "not_needed", ["preflight", "failed"]); }
  }
  async execute(command: ContainerCommand, options: { signal?: AbortSignal } = {}): Promise<ContainerExecutionResult> {
    if (command !== "node.version") throw new Error("Unsupported container command");
    const result = await executeFixedContainer(this.options, this.runner, command, options.signal);
    return { command, ...result };
  }
}
