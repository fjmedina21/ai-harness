/** Neutral lifecycle metadata; never an execution grant. */
export type RuntimeOperationState =
  | "preflight"
  | "creating"
  | "running"
  | "cancelling"
  | "exited"
  | "failed"
  | "cleaning"
  | "cleaned"
  | "cleanup_uncertain";
export type ProcessFailureKind =
  | "cancelled"
  | "timeout"
  | "output_limit"
  | "start_failed"
  | "termination_unconfirmed";
export type CleanupStatus = "not_needed" | "confirmed" | "uncertain";
export interface ProcessRunOptions {
  signal?: AbortSignal;
  /** Bounded host-owned input, never source in argv or a model-selected shell. */
  stdinBytes?: Uint8Array;
}
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
export interface ProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    timeoutMs: number,
    options?: ProcessRunOptions,
  ): Promise<ProcessResult>;
}
