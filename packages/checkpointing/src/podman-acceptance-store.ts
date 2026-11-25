import { constants } from "node:fs";
import { open, lstat, realpath } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { canonicalProposalJson } from "@ai-harness/contracts";

/** Trusted host policy publication, not an attestation authority or model tool.
 * Existing proposal host key is reused with a distinct HMAC domain; no credential is stored. */
export class FilePodmanAcceptanceStore {
  constructor(private readonly directory: string) {}
  private async root(): Promise<void> {
    const st = await lstat(this.directory);
    if (await realpath(this.directory) !== this.directory || !st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) throw new Error("Private acceptance root required");
  }
  private async read(name: string, max: number): Promise<Buffer> {
    const h = await open(path.join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const st = await h.stat({ bigint: true });
      if (!st.isFile() || st.nlink !== 1n || st.uid !== BigInt(process.getuid!()) || (st.mode & 0o777n) !== 0o600n || st.size > BigInt(max)) throw new Error("Unsafe acceptance input");
      const bytes = Buffer.alloc(max + 1), { bytesRead } = await h.read(bytes, 0, bytes.length, 0), after = await h.stat({ bigint: true });
      if (BigInt(bytesRead) !== st.size || after.size !== st.size || after.mtimeNs !== st.mtimeNs || after.ctimeNs !== st.ctimeNs || after.nlink !== 1n) throw new Error("Acceptance changed");
      return bytes.subarray(0, bytesRead);
    } finally { await h.close(); }
  }
  private async mac(payload: string): Promise<Buffer> {
    const key = await this.read("proposal-host.key", 32); if (key.length !== 32) throw new Error("Existing proposal host key required");
    return createHmac("sha256", key).update("podman-validation-acceptance-v1\0").update(payload).digest();
  }
  async get(): Promise<unknown | null> {
    await this.root(); let raw: Buffer;
    try { raw = await this.read("podman-validation-acceptance.json", 32768); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
    const envelope = JSON.parse(raw.toString("utf8"));
    if (!envelope || Object.keys(envelope).sort().join() !== "mac,payload" || typeof envelope.payload !== "string" || !/^[a-f0-9]{64}$/.test(envelope.mac) ||
      !timingSafeEqual(await this.mac(envelope.payload), Buffer.from(envelope.mac, "hex"))) throw new Error("Acceptance integrity failed");
    const value = JSON.parse(envelope.payload); if (canonicalProposalJson(value) !== envelope.payload) throw new Error("Noncanonical acceptance"); return value;
  }
  /** Create-only; caller must verify native durable grants, current real runtime evidence and exact scope first. */
  async publish(value: unknown): Promise<void> {
    await this.root(); const payload = canonicalProposalJson(value), mac = (await this.mac(payload)).toString("hex");
    const h = await open(path.join(this.directory, "podman-validation-acceptance.json"), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await h.writeFile(JSON.stringify({ payload, mac })); await h.sync(); } finally { await h.close(); }
    const root = await open(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await root.sync(); } finally { await root.close(); }
  }
}
