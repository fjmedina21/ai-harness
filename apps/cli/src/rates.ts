import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { CostRate } from "@ai-harness/contracts";
import { estimateCost } from "@ai-harness/observability";

/** Read a host-selected, private and size-bounded tariff table. */
export async function readPrivateCostRates(filename: string): Promise<readonly CostRate[]> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const uid = process.getuid?.();
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        (before.mode & 0o077) !== 0 || (uid !== undefined && before.uid !== uid) ||
        before.size < 1 || before.size > 65_536) throw new Error("Invalid cost rate file");
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const current = await handle.stat();
    if (!current.isFile() || current.ino !== before.ino || current.dev !== before.dev ||
        current.nlink !== 1 || (current.mode & 0o077) !== 0) throw new Error("Invalid cost rate file");
    const buffer = Buffer.alloc(65_537);
    let bytes = 0;
    while (bytes < buffer.length) {
      const result = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (result.bytesRead === 0) break;
      bytes += result.bytesRead;
    }
    if (bytes > 65_536) throw new Error("Cost rate file limit");
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes)));
    if (!Array.isArray(raw) || raw.length > 256) throw new Error("Invalid cost rate table");
    const rates = raw as CostRate[];
    estimateCost(undefined, undefined, undefined, rates);
    return rates;
  } catch {
    throw new Error("Cost rate file is unavailable or invalid");
  } finally {
    await handle?.close();
  }
}
