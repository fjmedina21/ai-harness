import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";

export interface BoundedReader {
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
}
/** Reads at most limit+1 bytes; the final sentinel detects overflow without readFile(). */
export async function readBoundedFile(reader: BoundedReader, limit: number, signal?: AbortSignal): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1024 * 1024) throw new Error("Invalid file read budget");
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    signal?.throwIfAborted();
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, limit + 1 - total));
    const { bytesRead } = await reader.read(buffer, 0, buffer.length, total);
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) throw new Error("Invalid bounded reader result");
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    total += bytesRead;
    if (total > limit) throw new Error("File exceeds maximum size");
    chunks.push(buffer.subarray(0, bytesRead));
  }
}

/** Mitigates replacement races; does NOT make parent traversal atomically rooted. */
export async function readVerifiedFile(filename: string, expected: BigIntStats, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    signal?.throwIfAborted();
    const initial = await handle.stat({ bigint: true });
    if (!initial.isFile() || initial.nlink !== 1n || initial.size > 1048576n
      || initial.dev !== expected.dev || initial.ino !== expected.ino
      || initial.ctimeNs !== expected.ctimeNs || initial.mtimeNs !== expected.mtimeNs) throw new Error("File identity or type changed");
    const buffer = await readBoundedFile(handle, 1024 * 1024, signal);
    const final = await handle.stat({ bigint: true });
    signal?.throwIfAborted();
    if (final.nlink !== 1n || final.size !== initial.size || final.mtimeNs !== initial.mtimeNs || final.ctimeNs !== initial.ctimeNs
      || BigInt(buffer.length) !== final.size) throw new Error("File changed while reading");
    return buffer;
  } finally { await handle.close(); }
}
