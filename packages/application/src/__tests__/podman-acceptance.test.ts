/** All native/GitHub/Podman metadata here is synthetic host fixture data, never real acceptance evidence. */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import path from "node:path";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { HumanApprovalAuthority } from "@ai-harness/security";
import { FilePodmanAcceptanceStore, FileValidationEvidenceStore } from "@ai-harness/checkpointing";
import { EngineeringWorkspace, ValidationCoordinator, SandboxValidationRegistry } from "@ai-harness/tools";
import type { ValidationActionProfile } from "@ai-harness/contracts";
import { ContinuationCoordinator } from "../engineering-resume.js";
import { podmanRuntimeCodeDigest, verifyLocalPodmanAcceptance, runAcceptedPodmanValidation, type LocalPodmanAcceptance, type AcceptedValidationOptions } from "../podman-validation.js";
import { directories, generate, openFixture, policy, verifier, credential } from "./resume-fixture.js";
const nativeFixture = new HumanApprovalAuthority({ method: "macos-local-auth-and-tty-v1", verify: async () => true });
async function fixture(t: TestContext) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), "harness-accepted-podman-"))); await chmod(base, 0o700); await directories(base); await mkdir(path.join(base, "evidence"), { mode: 0o700 });
  t.after(() => rm(base, { recursive: true, force: true })); await writeFile(path.join(base, "source", "value.ts"), "export const value = 1;\n", { mode: 0o600 });
  const opened = await openFixture(base); t.after(() => { try { opened.store.close(); } catch {} });
  const generated = await generate(base, opened.store, false, { projectAuthorizationDigest: "a".repeat(64) }); const id = generated.operationId!, ref = opened.store.proposal(id)!;
  const continuation = new ContinuationCoordinator({ ...opened, policy, verifier }); await continuation.decide(id, credential(ref, "approve"), true, nativeFixture); await continuation.continue(id, credential(ref, "continue"), 5000);
  const artifact = opened.artifacts.get(ref.artifactDigest), workspace = await EngineeringWorkspace.reopen(artifact.receipt, artifact.rootIdentity, opened.store);
  const image = "example.invalid/fixture@sha256:" + "1".repeat(64), actions: ValidationActionProfile[] = ["test", "output", "timeout", "cancel"].map(id => ({ id, image, runtimeProfile: "node-isolated-v1", executable: "node", args: ["--test", "value.ts"], workingDirectory: "", timeoutMs: 1000, maxOutputBytes: 1024, network: "none", resources: { cpu: 0.5, memoryBytes: 268435456, pids: 64 } }));
  const project = { id: "fixture", sourceRoot: path.join(base, "source"), workspaceDirectory: path.join(base, "workspaces"), policy, actions, authorizationDigest: artifact.projectAuthorizationDigest };
  const evidence = new FileValidationEvidenceStore(path.join(base, "evidence")), registry = new SandboxValidationRegistry(); actions.forEach(p => registry.register(p));
  const owner = artifact.requester, approvalVerifier = { verify: async () => ({ ...owner, roles: ["harness:approver"] }) };
  const validationIds = {} as LocalPodmanAcceptance["validationIds"];
  for (const action of actions) {
    const abort = new AbortController(); let saved: string | undefined;
    const c = new ValidationCoordinator({ project, ...opened, evidence: { claim: (...args) => evidence.claim(...args), release: (...args) => evidence.release(...args), get: (...args) => evidence.get(...args), save: async (e, output) => { saved = e.validationId; await evidence.save(e, output); } }, registry, authorize: async () => owner, approvalVerifier: () => approvalVerifier,
      runtime: { execute: async () => { if (action.id === "cancel") abort.abort(); return { classification: ({ test: "passed", output: "failed", timeout: "timeout", cancel: "cancelled" } as const)[action.id as "test"], exitCode: action.id === "test" ? 0 : null, timedOut: action.id === "timeout", cancelled: action.id === "cancel", cleanup: "confirmed", output: "fixture", diagnostics: [action.id === "output" ? "action.output_limit" : "action." + action.id] }; } } });
    const pending = await c.prepare(artifact, workspace, action.id); await c.approve(artifact, workspace, action.id, "fixture", nativeFixture);
    await c.execute(artifact, workspace, action.id, pending.approvalId!, abort.signal); assert.ok(saved); validationIds[action.id as keyof typeof validationIds] = saved;
  }
  const options: AcceptedValidationOptions = { ...opened, artifact, journalDirectory: path.join(base, "state"), project, authorize: async () => owner, approvalVerifier, credential: "fixture", confirmation: nativeFixture };
  const record: LocalPodmanAcceptance = { schemaVersion: 1, profile: "local-podman", ownerAccountId: owner.subject, projectAuthorizationDigest: artifact.projectAuthorizationDigest!, acceptedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), runtimeCodeDigest: await podmanRuntimeCodeDigest(), isolationEvidence: { status: "passed", image, timestamp: new Date(Date.now() - 1000).toISOString(), cleanup: "confirmed", cancellation: "confirmed", cancellationRunning: true, timeout: "confirmed", probes: { uid: 65534, capabilities: "none", seccomp: 2, noNewPrivileges: true, rootReadonly: true, tmpfsBytes: 16777216, network: "denied", memoryBytes: 268435456, swapBytes: 0, pids: 64, cpu: 0.5 } }, artifactDigest: artifact.artifactDigest, evidenceDirectory: path.join(base, "evidence"), validationIds,
    runtime: { backend: "podman", podmanExecutable: "/usr/bin/podman", machineName: "fixture", image, securityProfile: { dedicated: true, disposable: true, endpoint: "unix:///tmp/fixture.sock", daemonId: "2".repeat(64), platform: "linux/arm64" } } };
  return { ...opened, base, options, record };
}
test("profile acceptance checks native fixture grants and all durable outcomes, then only inspects completed evidence", async t => {
  const f = await fixture(t); assert.deepEqual(await verifyLocalPodmanAcceptance(f.record, f.options), f.record);
  await new FilePodmanAcceptanceStore(f.options.journalDirectory).publish(f.record);
  const result = await runAcceptedPodmanValidation(f.options, "test"); assert.equal(result.validation.classification, "passed"); assert.equal(result.operationState, "Completed");
  const cancellation = await runAcceptedPodmanValidation(f.options, "cancel"); assert.equal(cancellation.validation.classification, "cancelled"); assert.equal(cancellation.operationState, "Uncertain");
});
for (const change of ["owner", "project", "runtime-code", "expired", "profile", "missing-evidence", "directory", "isolation"] as const)
test("accepted profile rejects changed " + change + " before runtime execution", async t => {
  const f = await fixture(t), raw = structuredClone(f.record);
  if (change === "owner") raw.ownerAccountId = "202";
  if (change === "project") raw.projectAuthorizationDigest = "b".repeat(64);
  if (change === "runtime-code") raw.runtimeCodeDigest = "0".repeat(64);
  if (change === "expired") raw.expiresAt = new Date(Date.now() - 1).toISOString();
  if (change === "profile") raw.profile = "unsafe" as never;
  if (change === "missing-evidence") raw.validationIds.test = "0".repeat(64);
  if (change === "directory") raw.evidenceDirectory = "/";
  if (change === "isolation") raw.isolationEvidence = { ...raw.isolationEvidence, probes: { network: "allowed" } };
  await assert.rejects(verifyLocalPodmanAcceptance(raw, f.options));
});
