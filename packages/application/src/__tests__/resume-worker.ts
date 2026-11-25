/** Explicit process fixtures only; no production auth/worker entry point. */
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { confirmation, credential, generate, openFixture, policy, verifier } from "./resume-fixture.js";
import { ContinuationCoordinator } from "../engineering-resume.js";
import type { EngineeringResumeStore } from "@ai-harness/contracts";
const [base, mode, id] = process.argv.slice(2);
if (!base || !mode) throw new Error("Missing fixture parameters");
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error("Provider must never run on resume"); };
if (mode === "generate" || mode.startsWith("artifact_")) {
  let supplied: EngineeringResumeStore | undefined;
  if (mode.startsWith("artifact_")) {
    const { store } = await openFixture(base);
    supplied = new Proxy(store, { get(target, key) {
      if (key === "bindProposal") return (reference: Parameters<EngineeringResumeStore["bindProposal"]>[0]) => {
        if (mode === "artifact_transaction") {
          const db = new DatabaseSync(path.join(base, "state", "ops.sqlite"));
          db.exec("BEGIN IMMEDIATE");
          const data = JSON.stringify(reference), checksum = createHash("sha256").update(data).digest("hex");
          db.prepare("INSERT INTO engineering_proposals VALUES(?,?,?)").run(reference.operationId, data, checksum);
        }
        process.send?.({ paused: true, operationId: reference.operationId });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); throw new Error();
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  const generated = await generate(base, supplied); process.send?.({ ...generated, pid: process.pid }); process.disconnect?.();
} else {
  const { store, artifacts } = await openFixture(base);
  if (!id) throw new Error("Missing operation fixture");
  const ref = store.proposal(id)!;
  const proxy = new Proxy(store, { get(target, key) {
    const value = Reflect.get(target, key);
    if (key === "prepare" && ["prepared", "running", "after_effect"].includes(mode)) return (...args: Parameters<EngineeringResumeStore["prepare"]>) => {
      const op = target.prepare(...args);
      if (mode === "prepared") { process.send?.({ paused: true }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); }
      return op;
    };
    if (key === "start" && mode === "running") return (...args: Parameters<EngineeringResumeStore["start"]>) => {
      const op = target.start(...args); process.send?.({ paused: true }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); return op;
    };
    if (key === "finish" && mode === "after_effect") return () => { process.send?.({ paused: true }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); throw new Error(); };
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const coordinator = new ContinuationCoordinator({ store: proxy, artifacts, policy, verifier });
  process.send?.({ ready: true, pid: process.pid });
  process.once("message", async () => {
    try {
      if (mode === "approve" || mode === "reject") await coordinator.decide(id, credential(ref, mode), mode === "approve", confirmation);
      else if (mode === "lease") store.acquireLease(id, store.get(id)!.version, 60, { issuer: "github.com", subject: "101" });
      else if (mode === "old-worker") {
        const old = store.get(id)!;
        store.acquireLease(id, old.version, 60, { issuer: "github.com", subject: "101" });
        process.send?.({ leased: true });
        process.once("message", () => {
          try { store.prepare(id, old.version, old.scopeDigest, old.approvalId); process.send?.({ staleBlocked: false }); }
          catch { process.send?.({ staleBlocked: true }); }
          store.close(); process.disconnect?.();
        }); return;
      } else await coordinator.continue(id, credential(ref, "continue"), 5000);
      process.send?.({ ok: true, calls, pid: process.pid, state: store.get(id)?.state });
    } catch (e) { process.send?.({ ok: false, calls, error: (e as { code?: string }).code ?? "blocked", state: store.get(id)?.state }); }
    finally { if (mode !== "old-worker") { store.close(); process.disconnect?.(); } }
  });
}
