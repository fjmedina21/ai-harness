import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import type { ToolHandler } from "@ai-harness/contracts";

import type { ToolDispatcher } from "./dispatcher.js";

const MAX_FILE_BYTES = 1024 * 1024;

const BLOCKED_DIRECTORIES = new Set([
  ".git",
  ".ai",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const SENSITIVE_FILENAME =
  /(^|[._-])(secret|secrets|credential|credentials|password|token|private)([._-]|$)|\.(pem|key|p12|pfx|kdbx)$/i;

/**
 * Validate a workspace-relative path.
 * Model-generated paths must never be trusted.
 */
function validateRelativePath(input: string): string[] {
  if (
    !input ||
    path.isAbsolute(input) ||
    path.win32.isAbsolute(input) ||
    input.includes("\\") ||
    input.includes("\0")
  ) {
    throw new Error("Invalid workspace path");
  }

  const segments = input.split("/");

  if (
    segments.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.startsWith(".") ||
        BLOCKED_DIRECTORIES.has(part),
    )
  ) {
    throw new Error("Restricted workspace path");
  }

  if (segments.some((part) => SENSITIVE_FILENAME.test(part))) {
    throw new Error("Sensitive file path");
  }

  return segments;
}

/**
 * Resolve a file only through existing, non-symlink
 * path components.
 *
 * This is a local filesystem guard, not a sandbox.
 */
async function resolveReadableFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  const segments = validateRelativePath(relativePath);
  const root = await realpath(projectRoot);

  let current = root;

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);

    const info = await lstat(current);

    if (info.isSymbolicLink()) {
      throw new Error("Symbolic links are not allowed");
    }

    const last = index === segments.length - 1;

    if (!last && !info.isDirectory()) {
      throw new Error("Invalid directory component");
    }

    if (last && !info.isFile()) {
      throw new Error("Target is not a regular file");
    }
  }

  const resolved = await realpath(current);
  const relative = path.relative(root, resolved);

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("File escapes workspace");
  }

  return resolved;
}

/**
 * Read a bounded UTF-8 file from the workspace.
 *
 * Never expose this handler directly to an agent.
 * Register it through ToolDispatcher instead.
 */
export const fileReadHandler: ToolHandler = async (args, context) => {
  const relativePath = args.path;

  if (typeof relativePath !== "string") {
    throw new Error("Invalid file path");
  }

  const filename = await resolveReadableFile(context.projectRoot, relativePath);

  // O_NOFOLLOW prevents following a symlink at the
  // final component if it changes before open().
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    const metadata = await handle.stat();

    if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) {
      throw new Error("Unsupported file or file too large");
    }

    const buffer = await handle.readFile();

    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error("File exceeds maximum size");
    }

    return {
      path: relativePath,
      content: new TextDecoder("utf-8", {
        fatal: true,
      }).decode(buffer),
      bytes: buffer.byteLength,
    };
  } finally {
    await handle.close();
  }
};

/**
 * Register only the read handler.
 *
 * file.write remains without a handler until the
 * approval workflow is implemented and tested.
 */
export function registerFileTools(dispatcher: ToolDispatcher): void {
  dispatcher.registerHandler("file.read", fileReadHandler);
}
