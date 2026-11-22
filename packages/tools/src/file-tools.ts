import type { BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import type { ToolHandler } from "@ai-harness/contracts";

import type { ToolDispatcher } from "./dispatcher.js";

import { readVerifiedFile } from "./bounded-file.js";

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
export async function resolveReadableFile(
  projectRoot: string,
  relativePath: string,
): Promise<{ filename: string; expected: BigIntStats }> {
  const segments = validateRelativePath(relativePath);
  const root = await realpath(projectRoot);

  let current = root;
  let expected: BigIntStats | undefined;

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);

    const info = await lstat(current, { bigint: true });
    expected = info;

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

  if (!expected) throw new Error("Missing file identity");
  return { filename: resolved, expected };
}

/**
 * Read a bounded UTF-8 file from the workspace.
 *
 * Never expose this handler directly to an agent.
 * Register it through ToolDispatcher instead.
 */
export const fileReadHandler: ToolHandler = async (args, context) => {
  context.signal?.throwIfAborted();
  if (context.requireAtomicFilesystem) throw new Error("Atomic rooted filesystem access is unavailable");
  const relativePath = args.path;

  if (typeof relativePath !== "string") {
    throw new Error("Invalid file path");
  }

  const { filename, expected } = await resolveReadableFile(context.projectRoot, relativePath);
  const buffer = await readVerifiedFile(filename, expected, context.signal);
  return {
    path: relativePath,
    content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    bytes: buffer.byteLength,
  };
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
