import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";

import type { ToolHandler } from "@ai-harness/contracts";

const TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 4_096;

interface CommandSpec {
  executable: string;
  args: readonly string[];
}

/**
 * Trusted command allowlist.
 *
 * Do not construct executables or arguments
 * from model-generated input.
 */
const ALLOWED_COMMANDS: Readonly<Record<string, CommandSpec>> = {
  "node --version": {
    executable: process.execPath,
    args: ["--version"],
  },
};

export interface ShellCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute only a fixed command from the allowlist.
 *
 * This is a bounded subprocess executor,
 * NOT an OS-level sandbox.
 */
export const shellExecuteHandler: ToolHandler = async (
  args,
  context,
): Promise<ShellCommandResult> => {
  const command = args.command;

  if (typeof command !== "string") {
    throw new Error("Invalid command");
  }

  if (!Object.hasOwn(ALLOWED_COMMANDS, command)) {
    throw new Error("Command is not allowlisted");
  }

  const spec = ALLOWED_COMMANDS[command]!;

  const workspace = await realpath(context.projectRoot);

  const workspaceInfo = await stat(workspace);

  if (!workspaceInfo.isDirectory()) {
    throw new Error("Invalid workspace directory");
  }

  return new Promise<ShellCommandResult>((resolve, reject) => {
    execFile(
      spec.executable,
      [...spec.args],
      {
        cwd: workspace,
        shell: false,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: "utf8",
        windowsHide: true,
        env: {},
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error("Controlled command failed"));
          return;
        }

        resolve({
          command,
          exitCode: 0,
          stdout,
          stderr,
        });
      },
    );
  });
};
