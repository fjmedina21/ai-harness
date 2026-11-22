import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import type { ToolHandler } from "@ai-harness/contracts";

const MAX_CONTENT_BYTES = 64 * 1024;

const BLOCKED = new Set([
  ".git",
  ".ai",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const SENSITIVE =
  /(^|[._-])(secret|secrets|credential|credentials|password|token|private)([._-]|$)|\.(pem|key|p12|pfx|kdbx)$/i;

function validatePath(input: string): string[] {
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
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        BLOCKED.has(segment) ||
        SENSITIVE.test(segment),
    )
  ) {
    throw new Error("Restricted workspace path");
  }

  return segments;
}

/**
 * Creates a new UTF-8 file only.
 *
 * Does not overwrite existing files.
 * Does not create parent directories.
 *
 * The dispatcher must authorize this handler before use.
 */
export const fileWriteHandler: ToolHandler = async (args, context) => {
  context.signal?.throwIfAborted();
  if (context.requireAtomicFilesystem) throw new Error("Atomic rooted filesystem access is unavailable");
  const relativePath = args.path;
  const content = args.content;

  if (typeof relativePath !== "string" || typeof content !== "string") {
    throw new Error("Invalid write arguments");
  }

  const segments = validatePath(relativePath);
  const bytes = Buffer.byteLength(content, "utf8");

  if (bytes > MAX_CONTENT_BYTES) {
    throw new Error("File content exceeds size limit");
  }

  const root = await realpath(context.projectRoot);
  const parentSegments = segments.slice(0, -1);

  let parent = root;

  for (const segment of parentSegments) {
    parent = path.join(parent, segment);

    const metadata = await lstat(parent);

    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Unsafe parent directory");
    }
  }

  const canonicalParent = await realpath(parent);
  const relativeParent = path.relative(root, canonicalParent);

  if (
    relativeParent === ".." ||
    relativeParent.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeParent)
  ) {
    throw new Error("Path escapes workspace");
  }

  const filename = path.join(canonicalParent, segments.at(-1)!);

  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    constants.O_NOFOLLOW;

  context.signal?.throwIfAborted();
  const handle = await open(filename, flags, 0o600);

  try {
    context.signal?.throwIfAborted();
    await handle.writeFile(content, "utf8");
    context.signal?.throwIfAborted();
    await handle.sync();

    return {
      path: relativePath,
      bytes,
      created: true,
    };
  } finally {
    await handle.close();
  }
};
