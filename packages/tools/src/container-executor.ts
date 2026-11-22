import type { ProcessRunner } from "@ai-harness/contracts";
import { NodeProcessRunner } from "./process-runner.js";
import { validateContainerOptions, preflightContainer, type ContainerExecutionOptions } from "./container-profile.js";
import { executeFixedContainer, type HardenedContainerResult } from "./container-runtime.js";
export { NodeProcessRunner } from "./process-runner.js";
export { ContainerExecutionError } from "./container-runtime.js";
export type { ProcessResult, ProcessRunner } from "@ai-harness/contracts";
export type { ContainerExecutionOptions, ContainerSecurityProfile, ContainerPreflight } from "./container-profile.js";
export type ContainerCommand = "node.version";
export interface ContainerExecutionResult extends HardenedContainerResult { command: ContainerCommand }

export class ContainerExecutor {
  private readonly options: ContainerExecutionOptions;
  constructor(options: ContainerExecutionOptions, private readonly runner: ProcessRunner = new NodeProcessRunner()) {
    validateContainerOptions(options);
    this.options = structuredClone(options);
  }
  preflight(signal?: AbortSignal) { return preflightContainer(this.options, this.runner, signal); }
  async execute(command: ContainerCommand, options: { signal?: AbortSignal } = {}): Promise<ContainerExecutionResult> {
    if (command !== "node.version") throw new Error("Unsupported container command");
    const result = await executeFixedContainer(this.options, this.runner, command, options.signal);
    return { command, ...result };
  }
}
