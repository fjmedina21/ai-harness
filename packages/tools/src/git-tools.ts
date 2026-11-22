import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

import type { ToolHandler } from "@ai-harness/contracts";

const TIMEOUT_MS = 5_000;
const MAX_BUFFER = 64 * 1024;

export interface GitStatusOptions {
  /**
   * Absolute path chosen by the trusted host,
   * never by a model.
   */
  executable: string;
}

export function createGitStatusHandler(options: GitStatusOptions): ToolHandler {
  if (!path.isAbsolute(options.executable)) {
    throw new Error("Git executable must be absolute");
  }

  const executable = options.executable;

  return async (_args, context) => {
    context.signal?.throwIfAborted();
    if (context.requireAtomicFilesystem) throw new Error("Atomic rooted filesystem access is unavailable");
    const cwd = await realpath(context.projectRoot);

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        executable,
        [
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.untrackedCache=false",
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=no",
        ],
        {
          cwd,
          shell: false,
          signal: context.signal,
          killSignal: "SIGKILL",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          encoding: "utf8",
          windowsHide: true,
          env: {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            HOME: "/nonexistent",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
            GIT_NO_LAZY_FETCH: "1",
            GIT_EXTERNAL_DIFF: "0",
            GIT_CONFIG_COUNT: "0",
          },
        },
        (error, output) => {
          if (error) {
            reject(new Error("Git status failed"));
            return;
          }

          resolve(output);
        },
      );
    });

    return {
      format: "porcelain-v1-z",
      trackedChanges: stdout,
    };
  };
}
