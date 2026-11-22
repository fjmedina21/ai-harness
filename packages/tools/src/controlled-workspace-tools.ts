import type { ToolDispatcher } from "./dispatcher.js";

import { fileWriteHandler } from "./file-write.js";
import { createGitStatusHandler, type GitStatusOptions } from "./git-tools.js";

/**
 * Trusted-host registration.
 *
 * Registration does not itself grant any permissions.
 */
export function registerControlledWorkspaceTools(
  dispatcher: ToolDispatcher,
  git: GitStatusOptions,
): void {
  dispatcher.registerHandler("file.write", fileWriteHandler);

  dispatcher.registerHandler("git.status", createGitStatusHandler(git));
}
