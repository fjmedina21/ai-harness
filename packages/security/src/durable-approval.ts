import { createHash } from "node:crypto";
import type { ApproverIdentityVerifier, DurableApproval, DurableOperationStore, HostIdentity } from "@ai-harness/contracts";

/** Canonical bounded JSON digest. Never persist the original value. */
export function digestDurableValue(value: unknown): string {
  let nodes = 0;
  let bytes = 0;
  function bounded(text: string): string {
    bytes += Buffer.byteLength(text);
    if (bytes > 16_384) throw new Error("Durable value limit exceeded");
    return text;
  }
  function canonical(v: unknown, depth: number): string {
    if (++nodes > 4096 || depth > 8) throw new Error("Durable value limit exceeded");
    if (v === null || typeof v === "boolean") return bounded(JSON.stringify(v));
    if (typeof v === "string") {
      if (Buffer.byteLength(v) > 16_384) throw new Error("Durable value limit exceeded");
      return bounded(JSON.stringify(v));
    }
    if (typeof v === "number" && Number.isFinite(v)) return bounded(JSON.stringify(v));
    if (Array.isArray(v)) {
      if (v.length > 4096) throw new Error("Durable value limit exceeded");
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(v, i)) throw new Error("Sparse durable arrays are unsupported");
      }
      bounded("[" + ",".repeat(Math.max(0, v.length - 1)) + "]");
      return "[" + v.map(item => canonical(item, depth + 1)).join(",") + "]";
    }
    if (v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      const data = v as Record<string, unknown>;
      const keys = Object.keys(data).sort();
      if (keys.length > 4096) throw new Error("Durable value limit exceeded");
      bounded("{" + ",".repeat(Math.max(0, keys.length - 1)) + "}");
      return "{" + keys.map(key => {
        if (["__proto__", "constructor", "prototype"].includes(key) || key.length > 128)
          throw new Error("Invalid durable JSON key");
        return bounded(JSON.stringify(key) + ":") + canonical(data[key], depth + 1);
      }).join(",") + "}";
    }
    throw new Error("Invalid durable JSON value");
  }
  const text = canonical(value, 0);
  if (Buffer.byteLength(text) > 16_384) throw new Error("Durable value limit exceeded");
  return createHash("sha256").update(text).digest("hex");
}

/** Trusted host API, never register this service as a model tool.
 * The injected verifier must perform real issuer/audience/signature/expiry checks.
 * The store's low-level decision methods are trusted-host ports, not authentication.
 */
export class DurableApprovalService {
  constructor(private readonly store: DurableOperationStore, private readonly verifier: ApproverIdentityVerifier) {}
  private async actor(credential: string): Promise<HostIdentity> {
    try {
      if (typeof credential !== "string" || !credential.trim() || credential.length > 8192) throw new Error();
      const verified = await this.verifier.verify(credential);
      if (!verified.roles.includes("harness:approver")) throw new Error();
      return { issuer: verified.issuer, subject: verified.subject };
    } catch { throw new Error("Durable approver authentication required"); }
  }
  async decide(id: string, credential: string, approved: boolean): Promise<DurableApproval> {
    const actor = await this.actor(credential);
    return this.store.decide(id, actor, approved);
  }
  async revoke(id: string, credential: string): Promise<DurableApproval> {
    const actor = await this.actor(credential);
    return this.store.revoke(id, actor);
  }
}
